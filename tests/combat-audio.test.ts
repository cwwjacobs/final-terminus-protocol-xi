import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatAudioQueue, COMBAT_AUDIO_LIMITS, combatSound, combatSoundPlan, createCombatAudio } from '../components/game/combat-audio.ts';
import type { CombatEvent } from '../components/game/world-feedback.ts';

const event = (kind: string, extra: Partial<CombatEvent> = {}): CombatEvent => ({ id: 1, time: 0, kind, text: '', ...extra });

test('elemental spells have distinct preparation and contact cues, with an additional matching burst accent', () => {
  for (const element of ['fire', 'ice', 'lightning'] as const) {
    const plan = combatSoundPlan(event('magic', { element, actor: 3 }), 'hecate');
    assert.deepEqual(plan.map(c => [c.sound, c.delay]), [[`${element}Charge`, 0], [element, .3]]);
    const burst = combatSoundPlan(event('burst', { element, actor: 3 }), 'hecate');
    assert.deepEqual(burst.map(c => c.sound), [`${element}Charge`, element, 'burst']);
    assert.ok(burst[2].delay > burst[1].delay);
  }
});

test('weaponskill contact audio shares the active motion timing and ranger release identity', () => {
  const contact = { cleave: .43, pierce: .3, resonance: .48 };
  for (const weaponId of ['cleave', 'pierce', 'resonance'] as const) {
    const plan = combatSoundPlan(event('weapon', { weaponId, actor: 0 }), 'bacchus');
    assert.equal(plan[0].sound, 'swipe'); assert.equal(plan[1].delay, contact[weaponId]);
  }
  assert.equal(combatSoundPlan(event('weapon', { weaponId: 'pierce', actor: 2 }), 'dolos')[0].sound, 'bowDraw');
  const shot = combatSoundPlan(event('magic', { source: 'elementalShot', element: 'ice', actor: 2 }), 'dolos');
  assert.deepEqual(shot.map(c => [c.sound, c.delay]), [['bow', 0], ['ice', .2]]);
});

test('scheduled multi-hit skills preserve individual contacts without replaying the full ability', () => {
  const dashStart = event('ability', { source: 'criticalDash', actor: 0 });
  assert.deepEqual(combatSoundPlan(dashStart).map(c => c.sound), ['dodge']);
  for (let hitIndex = 0; hitIndex < 3; hitIndex++) {
    const hit = event('weapon', { id: hitIndex + 2, source: 'criticalDash', actor: 0, sequenceId: 1, hitIndex });
    assert.deepEqual(combatSoundPlan(hit).map(c => [c.sound, c.delay]), [['impact', 0]]);
  }
  assert.equal(combatSound(event('ability', { source: 'splitVolley' })), 'bowDraw');
  assert.equal(combatSound(event('weapon', { source: 'splitVolley', hitIndex: 1 })), 'bow');
});

test('group healing and thread ticks do not multiply their activation sounds', () => {
  assert.equal(combatSound(event('shimmer_wave', { source: 'shimmerWave' })), 'wave');
  assert.equal(combatSound(event('ability', { source: 'mendingThread' })), 'thread');
  for (const source of ['shimmerWave', 'mendingThread']) {
    for (let target = 0; target < 5; target++) assert.deepEqual(combatSoundPlan(event('heal', { source, target, value: 100 })), []);
  }
  assert.equal(combatSound(event('heal', { target: 0, value: 100 })), 'heal');
  const queue = new CombatAudioQueue();
  for (let i = 0; i < 5; i++) queue.enqueue(event('ability', { id: i, source: 'aegis', actor: 4, target: i }), 1, 'ariadne');
  assert.equal(queue.drain(1, [true, true, true, true, true]).filter(c => c.sound === 'shield').length, 1);
  assert.equal(combatSound(event('shield', { source: 'aegis' })), 'shieldBreak');
});

test('queue deduplicates events and delivers contacts only when their presentation time arrives', () => {
  const queue = new CombatAudioQueue(), hit = event('weapon', { weaponId: 'cleave', actor: 0 });
  queue.enqueue(hit, 2, 'bacchus'); queue.enqueue(hit, 2, 'bacchus');
  assert.equal(queue.size, 2);
  assert.deepEqual(queue.drain(2, [true]).map(c => c.sound), ['swipe']);
  assert.deepEqual(queue.drain(2.42, [true]), []);
  assert.deepEqual(queue.drain(2.43, [true]).map(c => c.sound), ['impact']);
  assert.equal(queue.size, 0);
});

test('pause/reset clears pending sound, dead actors lose delayed contacts, and stale cues never burst on resume', () => {
  const queue = new CombatAudioQueue();
  queue.enqueue(event('magic', { element: 'fire', actor: 0 }), 0, 'hecate'); queue.drain(0, [true]);
  assert.deepEqual(queue.drain(.3, [false]), []);
  queue.enqueue(event('magic', { id: 2, element: 'ice', actor: 0 }), 1, 'hecate');
  assert.deepEqual(queue.drain(2, [true]), []);
  queue.enqueue(event('magic', { id: 3, element: 'lightning', actor: 0 }), 3, 'hecate');
  queue.reset(); assert.equal(queue.size, 0); assert.deepEqual(queue.drain(4, [true]), []);
  queue.enqueue(event('heal', { id: 4, actor: 0, target: 1, value: 100 }), 5);
  assert.deepEqual(queue.drain(5, [false, true]).map(c => c.sound), ['heal'], 'already resolved healing retains its immediate cue');
});

test('high-volume event feeds stay bounded and preserve important warnings over auto attacks', () => {
  const queue = new CombatAudioQueue();
  for (let i = 0; i < 150; i++) queue.enqueue(event('auto', { id: i, actor: 0 }), 1, 'bacchus');
  assert.ok(queue.size <= COMBAT_AUDIO_LIMITS.pending);
  queue.enqueue(event('cast', { id: 151, source: 'nullBloom' }), 1);
  queue.enqueue(event('static_strike', { id: 152 }), 1);
  const ready = queue.drain(1, [true]);
  assert.ok(ready.length <= COMBAT_AUDIO_LIMITS.perTick);
  assert.ok(ready.some(c => c.sound === 'bossCharge')); assert.ok(ready.some(c => c.sound === 'thunder'));
  assert.equal(ready.filter(c => c.sound === 'swipe').length, 1);
  assert.ok(COMBAT_AUDIO_LIMITS.voices <= 24);
});

test('boss resolution, support abilities and defensive cues are explicit; unrelated log messages stay silent', () => {
  for (const [e, sound] of [
    [event('boss_impact', { source: 'nullBloom' }), 'bossImpact'], [event('revelry'), 'revelry'],
    [event('provoke'), 'provoke'], [event('ability', { source: 'rapidWeave' }), 'weave'],
    [event('guard'), 'guard'], [event('dodge'), 'dodge'], [event('hit'), 'hit'], [event('down'), 'down'],
  ] as const) assert.equal(combatSound(e), sound);
  for (const kind of ['start', 'engage', 'warning', 'victory', 'defeat', 'phase']) assert.deepEqual(combatSoundPlan(event(kind)), []);
});

test('audio can be constructed, kept silent and disposed without browser globals or an unlocked context', () => {
  const audio = createCombatAudio();
  assert.doesNotThrow(() => { audio.play('fire'); audio.beginBossCharge(null); audio.syncBossCharge(null); audio.setVolume(NaN); audio.silence(); audio.dispose(); audio.dispose(); });
});
