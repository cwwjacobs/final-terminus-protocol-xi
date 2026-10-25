import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createGame, stepGame } from '../game/engine.ts';
import { presentationContact, presentationElement, presentationKey } from '../components/game/presentation-cues.ts';
import type { PresentationCue } from '../components/game/presentation-cues.ts';

function battle() {
  const state = createGame('trial', 1);
  state.party.forEach((a, i) => { a.human = true; a.engaged = true; a.x = i * .2; a.z = -1; a.attackTimer = 1000; });
  applyAction(state, 0, { type: 'start' });
  state.boss.attackTimer = state.boss.specialTimer = 1000;
  return state;
}

test('structured presentation identity overrides labels and retains signature precedence', () => {
  assert.equal(presentationKey({ kind: 'weapon', text: 'Arc Cleave', weaponId: 'pierce' }), 'pierce');
  assert.equal(presentationKey({ kind: 'weapon', text: 'Arc Cleave', abilityId: 'weapon:resonance' }), 'resonance');
  assert.equal(presentationKey({ kind: 'weapon', text: 'Arc Cleave', weaponId: 'cleave', source: 'criticalDash', sequenceId: 2, hitIndex: 1 }), 'criticalDash');
  assert.equal(presentationKey({ kind: 'burst', text: 'Solar Flare', source: 'elementalShot', element: 'ice' }), 'elementalShot');
  assert.equal(presentationElement({ kind: 'burst', text: 'Solar Flare', source: 'elementalShot', element: 'ice' }), 'ice');
  assert.equal(presentationElement({ kind: 'magic', text: 'Solar Flare', abilityId: 'magic:lightning' }), 'lightning');
  assert.equal(presentationKey({ kind: 'warning', text: 'Solar Flare', abilityId: 'magic:fire' }), null);
  assert.equal(presentationKey({ kind: 'ability', text: 'An unrelated passive', source: 'elementalCycle' }), null);
});

test('support ticks, protection break and boss resolution have distinct semantic keys', () => {
  const cases: [PresentationCue, string][] = [
    [{ kind: 'shield', text: '', source: 'aegis', abilityId: 'aegis' }, 'shieldBreak'],
    [{ kind: 'ability', text: '', source: 'aegis' }, 'aegis'],
    [{ kind: 'heal', text: '', source: 'mendingThread' }, 'mendingThread'],
    [{ kind: 'heal', text: '', source: 'shimmerWave' }, 'shimmerWave'],
    [{ kind: 'heal', text: '', abilityId: 'heal' }, 'heal'],
    [{ kind: 'chain', text: '', weaponId: 'pierce', element: 'fire' }, 'chain'],
    [{ kind: 'cast', text: '', source: 'nullBloom' }, 'bossCast'],
    [{ kind: 'boss_impact', text: '', source: 'nullBloom' }, 'bossImpact'],
    [{ kind: 'enrage', text: '', source: 'collapse' }, 'bossImpact'],
    [{ kind: 'static_strike', text: '' }, 'staticStrike'],
    [{ kind: 'static_arc', text: '' }, 'staticDischarge'],
  ];
  for (const [cue, key] of cases) assert.equal(presentationKey(cue), key);
});

test('legacy event labels remain usable without creating a default spell or weaponskill', () => {
  for (const [text, element] of [['Solar Flare', 'fire'], ['Stillwinter', 'ice'], ['Ion Judgment', 'lightning'], ['Fire Shot', 'fire'], ['Ice Shot', 'ice'], ['Lightning Shot', 'lightning']] as const) {
    assert.equal(presentationElement({ kind: 'magic', text }), element);
  }
  assert.equal(presentationKey({ kind: 'weapon', text: 'Bacchus: Arc Cleave · 660' }), 'cleave');
  assert.equal(presentationKey({ kind: 'weapon', text: 'Heracles: Vector Pierce · 700' }), 'pierce');
  assert.equal(presentationKey({ kind: 'weapon', text: 'Dolos: Q Resonance · 740' }), 'resonance');
  assert.equal(presentationElement({ kind: 'chain', text: 'Fusion skillchain' }), 'fire');
  assert.equal(presentationKey({ kind: 'magic', text: 'Unknown spell' }), null);
  assert.equal(presentationKey({ kind: 'weapon', text: 'Unknown attack' }), null);
});

test('the shared presentation schedule delays ordinary contacts only', () => {
  const contacts = { auto: [.27, .20], cleave: [.43, .36], pierce: [.30, .28], resonance: [.48, .44] } as const;
  for (const [key, [bacchus, other]] of Object.entries(contacts)) {
    const cue: PresentationCue = key === 'auto' ? { kind: 'auto', text: '' } : { kind: 'weapon', text: '', weaponId: key as 'cleave' | 'pierce' | 'resonance' };
    assert.equal(presentationContact(cue, 'bacchus'), bacchus);
    assert.equal(presentationContact(cue, 'heracles'), other);
  }
  assert.equal(presentationContact({ kind: 'magic', text: '', element: 'fire' }, 'hecate'), .30);
  assert.equal(presentationContact({ kind: 'magic', text: '', element: 'fire', source: 'elementalShot' }, 'dolos'), .20);
  for (const source of ['criticalDash', 'splitVolley', 'rapidWeave', 'aegis', 'shimmerWave', 'mendingThread']) {
    assert.equal(presentationContact({ kind: 'ability', text: '', source }), 0);
  }
  assert.equal(presentationContact({ kind: 'heal', text: '' }), 0);
  assert.equal(presentationContact({ kind: 'boss_impact', text: '' }), 0);
});

test('the engine emits weaponskill, chain, magic and shot identity with unchanged costs and damage', () => {
  const s = battle(); s.party[0].tp = 1000;
  assert.equal(applyAction(s, 0, { type: 'weapon', id: 'cleave' }).ok, true);
  const cleave = s.events.at(-1)!;
  assert.equal(cleave.abilityId, 'weapon:cleave'); assert.equal(cleave.weaponId, 'cleave'); assert.equal(cleave.value, 660);
  assert.equal(s.rng, 1015568748); assert.equal(s.party[0].tp, 0); assert.equal(s.party[0].cooldowns['weapon:cleave'], 2);
  stepGame(s, 1.6); s.party[1].tp = 1000;
  assert.equal(applyAction(s, 1, { type: 'weapon', id: 'pierce' }).ok, true);
  const chain = s.events.at(-1)!;
  assert.equal(chain.kind, 'chain'); assert.equal(chain.abilityId, 'chain'); assert.equal(chain.element, 'fire'); assert.equal(chain.value, 630);
  const rng = s.rng;
  assert.equal(applyAction(s, 3, { type: 'magic', element: 'fire' }).ok, true);
  const fire = s.events.at(-1)!;
  assert.equal(fire.kind, 'burst'); assert.equal(fire.abilityId, 'magic:fire'); assert.equal(fire.element, 'fire'); assert.equal(fire.value, 1122);
  assert.equal(s.party[3].mp, 1430); assert.equal(s.party[3].spellRecovery, 2); assert.equal(s.boss.hp, 101888);
  s.party[2].shotElement = 'ice';
  assert.equal(applyAction(s, 2, { type: 'elementalShot' }).ok, true);
  const shot = s.events.at(-1)!;
  assert.equal(shot.abilityId, 'elementalShot'); assert.equal(shot.element, 'ice'); assert.equal(shot.value, 230);
  assert.equal(s.party[2].mp, 285); assert.equal(s.rng, rng, 'presentation identity never draws randomness');
});

test('support events retain actual recipients and source identity', () => {
  const s = battle(); s.party[0].hp -= 1000; s.party[1].hp -= 1000;
  assert.equal(applyAction(s, 4, { type: 'aegis' }).ok, true);
  assert.deepEqual(s.events.filter(e => e.abilityId === 'aegis').map(e => e.target), [0, 1, 2, 3, 4]);
  assert.equal(applyAction(s, 4, { type: 'heal', target: 0 }).ok, true);
  assert.equal(s.events.at(-1)?.target, 0); assert.equal(s.events.at(-1)?.abilityId, 'heal');
  assert.equal(applyAction(s, 4, { type: 'mendingThread', target: 1 }).ok, true);
  assert.equal(s.events.at(-1)?.target, 1); assert.equal(s.events.at(-1)?.abilityId, 'mendingThread');
  stepGame(s, 2);
  const tick = s.events.findLast(e => e.kind === 'heal' && e.source === 'mendingThread')!;
  assert.equal(tick.target, 1); assert.equal(tick.abilityId, 'mendingThread'); assert.equal(tick.value, 100);
});

test('boss resolution records a copied committed area once per pulse, even when nobody is hit', () => {
  const s = battle(); const rng = s.rng, hp = s.party.map(a => a.hp);
  const cast = { name: 'Null Impact', abilityId: 'nullBloom', kind: 'circle' as const, x: 16, z: 16, radius: 5, angle: 0, total: 3, remaining: .05 };
  s.boss.cast = cast; stepGame(s, .05);
  const impact = s.events.find(e => e.kind === 'boss_impact')!;
  assert.equal(impact.abilityId, 'nullBloom'); assert.deepEqual(impact.area, { kind: 'circle', x: 16, z: 16, radius: 5, angle: 0, total: 3, abilityId: 'nullBloom' });
  assert.equal(s.boss.cast, null); cast.x = 99; assert.equal(impact.area?.x, 16);
  assert.equal(s.rng, rng); assert.deepEqual(s.party.map(a => a.hp), hp);
  stepGame(s, .1); assert.equal(s.events.filter(e => e.kind === 'boss_impact').length, 1);
  s.boss.cast = { name: 'Terminal Echo', abilityId: 'terminalEcho', kind: 'raid', x: 0, z: -4, radius: 100, angle: 0, total: 4, remaining: .05, pulses: 2 };
  stepGame(s, 1.05);
  const echoes = s.events.filter(e => e.kind === 'boss_impact' && e.source === 'terminalEcho');
  assert.deepEqual(echoes.map(e => e.area?.pulses), [2, 1]);
  assert.equal(s.boss.cast, null);
});
