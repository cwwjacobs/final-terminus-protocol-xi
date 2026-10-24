import assert from 'node:assert/strict';
import test from 'node:test';
import { actionUnavailable, getCooldown, GOD_ENRAGE_TIME, TRAITS } from '../game/content.ts';
import { applyAction, createGame, setHuman, stepGame } from '../game/engine.ts';
import type { Action, GameState } from '../game/types.ts';

function combat(seed?: number) {
  const state = createGame('trial', seed);
  state.party.forEach((actor, slot) => {
    setHuman(state, slot, true);
    actor.x = slot * .2; actor.z = -1; actor.attackTimer = 10000; actor.engaged = true;
  });
  applyAction(state, 0, { type: 'start' });
  state.boss.attackTimer = state.boss.specialTimer = 10000;
  return state;
}
function advance(state: GameState, seconds: number) {
  while (seconds > 1e-8) { const dt = Math.min(30, seconds); stepGame(state, dt); seconds -= dt; }
}
function pulse(state: GameState, amountOfPulses = 1) {
  state.boss.cast = { name: 'Terminal Echo', abilityId: 'terminalEcho', kind: 'raid', remaining: .05, total: 4, pulses: amountOfPulses, x: 0, z: -4, radius: 100, angle: 0 };
  stepGame(state, .05);
}

test('each spell and weaponskill retains an independent cooldown and shared recovery is not a defensive lock', () => {
  const s = combat();
  const mage = s.party[3];
  assert.equal(applyAction(s, 3, { type: 'magic', element: 'fire' }).ok, true);
  assert.equal(getCooldown(mage, { type: 'magic', element: 'fire' }), 6);
  assert.equal(getCooldown(mage, { type: 'magic', element: 'ice' }), 0);
  assert.equal(applyAction(s, 3, { type: 'magic', element: 'ice' }).ok, false);
  assert.equal(applyAction(s, 3, { type: 'guard' }).ok, true);
  stepGame(s, 2);
  assert.equal(applyAction(s, 3, { type: 'magic', element: 'ice' }).ok, true);
  s.party[0].tp = 1000;
  assert.equal(applyAction(s, 0, { type: 'weapon', id: 'cleave' }).ok, true);
  s.party[0].tp = 1000;
  stepGame(s, .5);
  assert.equal(applyAction(s, 0, { type: 'weapon', id: 'pierce' }).ok, true);
  assert.ok(getCooldown(s.party[0], { type: 'weapon', id: 'cleave' }) > 1);
});

test('ordinary criticals are 1.5× and an extra auto hit is half strength with half TP and cannot recurse', () => {
  const critical = combat(2000);
  critical.party[0].attackTimer = 0;
  stepGame(critical, .05);
  assert.equal(critical.events.find(e => e.kind === 'auto')?.value, 168);
  assert.equal(critical.events.find(e => e.kind === 'auto')?.critical, true);
  const extra = combat(8);
  extra.party[0].attackTimer = 0;
  stepGame(extra, .05);
  const hits = extra.events.filter(e => e.kind === 'auto');
  assert.equal(hits.length, 2);
  assert.equal(hits[0].value, 112);
  assert.equal(hits[1].value, hits[1].critical ? 84 : 56);
  assert.equal(extra.party[0].tp, 360);
  assert.equal(hits[1].source, 'extraHit');
  assert.equal(TRAITS.hunter.extraHitChance, 0);
});

test('Critical Dash lands exactly three guaranteed 2× hits, earns TP, pauses autos and returns to its captured origin', () => {
  const s = combat(); const a = s.party[0]; const origin = [a.x, a.z];
  a.attackTimer = .7;
  assert.equal(applyAction(s, 0, { type: 'criticalDash' }).ok, true);
  const rng = s.rng;
  applyAction(s, 0, { type: 'move', x: 1, z: 0 });
  stepGame(s, 1.2);
  const hits = s.events.filter(e => e.source === 'criticalDash' && e.kind === 'weapon');
  assert.equal(hits.length, 3);
  assert.deepEqual(hits.map(e => e.value), [224, 224, 224]);
  assert.deepEqual(hits.map(e => e.hitIndex), [0, 1, 2]);
  assert.ok(hits.every(e => e.sequenceId === 1));
  assert.ok(hits.every(e => e.critical));
  assert.deepEqual(hits.map(e => e.time), [.2, .6000000000000001, 1]);
  assert.deepEqual([a.x, a.z], origin);
  assert.equal(a.attackTimer, .7);
  assert.equal(a.tp, 720);
  assert.equal(a.sequence, null);
  assert.equal(s.rng, rng, 'guaranteed criticals do not consume RNG');
  assert.equal(s.chain, null);
});

test('Dash remains vulnerable, dodge cancels future hits and actor death cancels without teleporting', () => {
  const s = combat(); const a = s.party[0];
  applyAction(s, 0, { type: 'criticalDash' }); stepGame(s, .2);
  const hp = a.hp; pulse(s); assert.ok(a.hp < hp);
  assert.equal(applyAction(s, 0, { type: 'dodge' }).ok, true);
  assert.equal(a.sequence, null);
  stepGame(s, 1);
  assert.equal(s.events.filter(e => e.source === 'criticalDash' && e.kind === 'weapon').length, 1);
  const death = combat(); applyAction(death, 0, { type: 'criticalDash' }); stepGame(death, .2);
  death.party[0].hp = 1; pulse(death);
  assert.equal(death.party[0].hp, 0); assert.equal(death.party[0].sequence, null);
  assert.notEqual(death.party[0].z, -1);
});

test('Pierce → Split Volley from zero TP → Resonance performs one permitted self Distortion chain', () => {
  const s = combat(); const a = s.party[2]; a.tp = 1000;
  assert.equal(applyAction(s, 2, { type: 'weapon', id: 'pierce' }).ok, true);
  assert.equal(a.tp, 0);
  stepGame(s, .5);
  assert.equal(applyAction(s, 2, { type: 'splitVolley' }).ok, true);
  stepGame(s, 1.05);
  assert.equal(s.events.filter(e => e.source === 'splitVolley' && e.kind === 'weapon').length, 5);
  assert.equal(a.tp, 1250);
  assert.equal(s.chain?.weapon, 'pierce', 'arrows cannot replace the opener');
  assert.equal(applyAction(s, 2, { type: 'weapon', id: 'resonance' }).ok, true);
  assert.equal(s.chain?.property, 'Distortion'); assert.equal(s.burst?.element, 'ice');
  assert.equal(a.selfChainUntil, 0);
  a.tp = 1000; stepGame(s, 1.5);
  applyAction(s, 2, { type: 'weapon', id: 'cleave' });
  assert.equal(s.events.filter(e => e.kind === 'chain').length, 1, 'permission is consumed once');
});

test('Volley and Dash cap TP; dead or finished encounters cannot replay scheduled hits', () => {
  for (const slot of [0, 2]) {
    const s = combat(); s.party[slot].tp = 2999;
    applyAction(s, slot, { type: slot === 0 ? 'criticalDash' : 'splitVolley' });
    stepGame(s, 1.2); assert.equal(s.party[slot].tp, 3000);
    const done = combat(); done.boss.hp = 1;
    applyAction(done, slot, { type: slot === 0 ? 'criticalDash' : 'splitVolley' });
    stepGame(done, 1.2); assert.equal(done.status, 'victory'); assert.equal(done.party[slot].sequence, null);
    assert.equal(done.party[slot].selfChainUntil, 0);
    const snapshot = JSON.stringify(done); stepGame(done, 10); assert.equal(JSON.stringify(done), snapshot);
  }
});

test('Volley grants self-chain on its first landed arrow even when the first scheduled arrow misses', () => {
  const s = combat(); const a = s.party[2];
  applyAction(s, 2, { type: 'splitVolley' });
  s.boss.x = 20; s.boss.z = 0;
  stepGame(s, .1);
  assert.equal(a.selfChainUntil, 0); assert.equal(a.sequence?.nextHit, 1); assert.equal(a.sequence?.landedHits, 0);
  s.boss.x = 0; s.boss.z = -4;
  stepGame(s, .15);
  assert.equal(a.selfChainUntil, 8.25); assert.equal(a.sequence?.landedHits, 1);
  const first = s.events.find(e => e.source === 'splitVolley' && e.kind === 'weapon');
  assert.equal(first?.hitIndex, 1); assert.equal(first?.sequenceId, 1);
  stepGame(s, .5);
  assert.equal(a.selfChainUntil, 8.25, 'later arrows cannot extend the original permission');
});

test('Rapid Weave permits Fire Ice Thunder twice at half-second cadence without resetting normal recasts', () => {
  const s = combat(); const a = s.party[3]; a.mp = 500;
  applyAction(s, 3, { type: 'magic', element: 'fire' });
  assert.equal(applyAction(s, 3, { type: 'rapidWeave' }).ok, true);
  const elements = ['fire', 'ice', 'lightning', 'fire', 'ice', 'lightning'] as const;
  for (let i = 0; i < elements.length; i++) {
    const action: Action = { type: 'magic', element: elements[i] };
    assert.equal(actionUnavailable(s, 3, action), null, `${i} ${elements[i]}`);
    assert.equal(applyAction(s, 3, action).ok, true);
    if (i < elements.length - 1) stepGame(s, .5);
  }
  assert.deepEqual(a.rapidWeave?.charges, { fire: 0, ice: 0, lightning: 0 });
  assert.equal(a.cooldowns['magic:lightning'], 6);
  assert.equal(a.spellRecovery, .5);
  assert.ok(a.cooldowns.rapidWeave > 177);
  const before = JSON.stringify(s); assert.equal(applyAction(s, 3, { type: 'magic', element: 'fire' }).ok, false); assert.equal(JSON.stringify(s), before);
  stepGame(s, 9.5); assert.equal(a.rapidWeave, null);
  assert.ok(a.cooldowns.rapidWeave > 160);
});

test('normal Elemental Cycle has a fixed 12-second window, repeated elements reset it, failed spells do nothing', () => {
  const s = combat(); const a = s.party[3]; a.mp = 500;
  applyAction(s, 3, { type: 'magic', element: 'fire' }); stepGame(s, 2);
  applyAction(s, 3, { type: 'magic', element: 'ice' }); stepGame(s, 2);
  const before = a.mp; applyAction(s, 3, { type: 'magic', element: 'lightning' });
  assert.ok(Math.abs(a.mp - (before + 70)) < 1e-8); assert.deepEqual(a.elementalCycle.elements, []);
  stepGame(s, 2); applyAction(s, 3, { type: 'magic', element: 'fire' }); stepGame(s, 11);
  applyAction(s, 3, { type: 'magic', element: 'ice' }); stepGame(s, 2);
  applyAction(s, 3, { type: 'magic', element: 'lightning' });
  assert.deepEqual(a.elementalCycle.elements, ['lightning']);
  stepGame(s, 6); applyAction(s, 3, { type: 'magic', element: 'lightning' });
  assert.deepEqual(a.elementalCycle.elements, ['lightning']); assert.equal(a.elementalCycle.remaining, 12);
});

test('Aegis covers living allies in range, blocks exactly one hit and preserves TP, enmity and Revelry', () => {
  const s = combat(); const caster = s.party[4]; const a = s.party[0];
  s.party[2].x = -22; s.party[2].z = 0;
  s.party[3].hp = 0; a.ce = 400; a.revelryStacks = 3;
  assert.equal(applyAction(s, 4, { type: 'aegis' }).ok, true);
  assert.deepEqual(s.party.map(p => p.shieldCharges), [1, 1, 0, 0, 1]);
  assert.equal(caster.mp, caster.maxMp - 120); assert.equal(caster.cooldowns.aegis, 90);
  const hp = a.hp, tp = a.tp, ce = a.ce;
  pulse(s, 2);
  assert.equal(a.hp, hp); assert.equal(a.tp, tp); assert.equal(a.ce, ce); assert.equal(a.revelryStacks, 3); assert.equal(a.shieldCharges, 0);
  stepGame(s, 1);
  assert.equal(a.hp, hp - 300); assert.equal(a.tp, tp + 45); assert.equal(a.revelryStacks, 0);
});

test('evasion precedes Aegis and Coherence Collapse bypasses both and clears windows', () => {
  const s = combat(); applyAction(s, 4, { type: 'aegis' }); applyAction(s, 0, { type: 'dodge' }); pulse(s);
  assert.equal(s.party[0].shieldCharges, 1);
  s.mode = 'god'; s.combatTime = GOD_ENRAGE_TIME - .05;
  applyAction(s, 3, { type: 'rapidWeave' });
  for (const a of s.party) a.dodgeUntil = 1000;
  stepGame(s, .05);
  assert.equal(s.status, 'defeat'); assert.ok(s.party.every(a => a.hp === 0 && a.shieldCharges === 0 && a.rapidWeave === null));
});

test('Restore explicit target overrides automatic triage and invalid selections spend nothing', () => {
  const s = combat(); s.party[0].hp = 700; s.party[1].hp = 200;
  assert.equal(applyAction(s, 4, { type: 'heal', target: 0 }).ok, true);
  assert.equal(s.party[0].hp, 1528); assert.equal(s.party[1].hp, 200);
  assert.equal(s.events.at(-1)?.target, 0);
  assert.equal(s.party[4].ce, 828 * .16 * .75);
  stepGame(s, 5);
  for (const target of [-1, 9, 2, .5, NaN]) {
    const before = JSON.stringify(s);
    assert.equal(applyAction(s, 4, { type: 'heal', target }).ok, false);
    assert.equal(JSON.stringify(s), before);
  }
  applyAction(s, 4, { type: 'heal' }); assert.equal(s.events.at(-1)?.target, 1);
});

test('Heracles receives 10% physical mitigation and generates 30% extra enmity', () => {
  const s = combat(); applyAction(s, 1, { type: 'provoke' });
  assert.equal(s.party[1].ce, 390); assert.equal(s.party[1].ve, 3640);
  s.boss.attackTimer = 0; stepGame(s, .05);
  assert.equal(s.party[1].maxHp - s.party[1].hp, 162);
});

test('Decree locks one ally, respects physical mitigation and fizzles when that ally has died', () => {
  for (const dead of [false, true]) {
    const s = combat(); const before = s.party.map(a => a.hp);
    s.boss.cast = { name: "Regent's Decree", abilityId: 'regentsDecree', kind: 'circle', target: 1, remaining: .05, total: 3, x: 0, z: -1, radius: 0, angle: 0 };
    if (dead) s.party[1].hp = 0;
    stepGame(s, .05);
    assert.equal(s.party[1].hp, dead ? 0 : before[1] - 900);
    assert.equal(s.party[0].hp, before[0]); assert.equal(s.boss.cast, null);
  }
});

test('committed Echo pulses and dead-target Decree finish even after every threat target is gone', () => {
  const echo = combat();
  for (let i = 1; i < echo.party.length; i++) echo.party[i].engaged = false;
  echo.party[0].hp = 100;
  pulse(echo, 2);
  assert.equal(echo.party[0].hp, 0);
  const afterFirst = echo.party[1].hp;
  assert.equal(echo.boss.cast?.pulses, 1);
  stepGame(echo, 1);
  assert.equal(echo.boss.target, -1);
  assert.equal(echo.party[1].hp, afterFirst - 300);
  assert.equal(echo.boss.cast, null);

  const decree = combat();
  decree.party.forEach(actor => { actor.engaged = false; actor.ce = actor.ve = 0; });
  decree.party[0].hp = 0;
  decree.boss.cast = { name: "Regent's Decree", abilityId: 'regentsDecree', kind: 'circle', target: 0, remaining: .1, total: 3, x: 0, z: -1, radius: 0, angle: 0 };
  const healthy = decree.party.slice(1).map(actor => actor.hp);
  stepGame(decree, .1);
  assert.equal(decree.boss.target, -1);
  assert.equal(decree.boss.cast, null);
  assert.deepEqual(decree.party.slice(1).map(actor => actor.hp), healthy);
});

test('phase-gated boss rotation retains independent cast cooldowns and Echo has two distinct pulses', () => {
  const s = combat(); s.boss.hp = s.boss.maxHp * .3; s.boss.specialTimer = 0;
  const casts = new Set<string>(); let seen = 0;
  for (let i = 0; i < 2400; i++) {
    for (const actor of s.party) { actor.hp = actor.maxHp; actor.dodgeUntil = s.time + 1; }
    stepGame(s, .05);
    for (const e of s.events.filter(e => e.id > seen)) { if (e.kind === 'cast' && e.source) casts.add(e.source); seen = e.id; }
  }
  assert.ok(casts.has('regentsDecree')); assert.ok(casts.has('terminalEcho')); assert.ok(casts.has('nullBloom')); assert.ok(casts.has('severingArc')); assert.ok(casts.has('resonantPulse'));
  assert.ok(Object.keys(s.boss.cooldowns).length === 5);
});

test('saved RNG and mid-sequence clocks replay identically through partitioned ticks; cooldowns continue while dead', () => {
  const a = combat(8); applyAction(a, 0, { type: 'criticalDash' }); applyAction(a, 2, { type: 'splitVolley' }); stepGame(a, .35);
  const b = JSON.parse(JSON.stringify(a)) as GameState;
  for (let i = 0; i < 30; i++) { stepGame(a, .05); stepGame(b, .02); stepGame(b, .03); }
  assert.deepEqual(a, b);
  a.party[0].hp = 0; const cooldown = a.party[0].cooldowns.criticalDash; stepGame(a, 1);
  assert.ok(Math.abs(a.party[0].cooldowns.criticalDash - (cooldown - 1)) < 1e-8);
  assert.equal(a.party[0].sequence, null);
});
