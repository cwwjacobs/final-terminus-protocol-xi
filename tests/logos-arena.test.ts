import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createGame, isInTelegraph, stepGame } from '../game/engine.ts';
import { arenaRadius, LOGOS_MIN_RADIUS, LOGOS_RETREAT_SPEED, stepLogosArena } from '../game/logos-arena.ts';
import { selectStaticStrike } from '../game/static-storm.ts';
import { restoreSave, validSave } from '../lib/local-save.ts';

function giant() {
  const s = createGame('trial', 123);
  s.status = 'fighting'; s.encounter = 'logos'; s.ultimatesUnlocked = true;
  s.logos = { stage: 'giant', elapsed: 1, arenaRadius: 24, statueWave: 3, exposureRemaining: 20, statueEntryRemaining: 0 };
  s.boss.hp = s.boss.maxHp * .88; s.boss.z = -20; s.boss.specialTimer = 1000;
  s.party.forEach(a => { a.human = true; a.engaged = false; a.attackTimer = 1000; });
  s.enemies = ['left-hand', 'right-hand'].map((id, i) => ({ id, name: id, x: i ? 19 : -19, z: -4, hp: 8000, maxHp: 8000, target: i, attackTimer: 1000, stunRemaining: 0, burn: null }));
  s.storm.remaining = 250;
  return s;
}

test('health loss retreats gradually and monotonically; waiting or healing cannot enlarge ground', () => {
  const s = giant(); stepGame(s, 1); assert.equal(arenaRadius(s), 24);
  s.boss.hp = s.boss.maxHp * .44;
  stepGame(s, .05); assert.ok(Math.abs(arenaRadius(s) - (24 - LOGOS_RETREAT_SPEED * .05)) < 1e-8);
  stepGame(s, 20); assert.equal(arenaRadius(s), 17.5); assert.ok(validSave(s), 'retreat warning can be saved');
  s.boss.hp = s.boss.maxHp * .8; stepGame(s, 2); assert.equal(arenaRadius(s), 17.5);
  s.boss.hp = 1; stepGame(s, 20); assert.ok(arenaRadius(s) >= LOGOS_MIN_RADIUS && arenaRadius(s) < 11.01);
  const crown = createGame(); crown.boss.hp = 1; stepGame(crown, 20); assert.equal(arenaRadius(crown), 24);
});

test('retreat keeps actors, corpses, hands and fresh statues reachable; evade obeys the boundary', () => {
  const s = giant(); s.boss.hp = s.boss.maxHp * .02;
  s.party.forEach((a, i) => { a.x = i % 2 ? 24 : -24; a.z = 0; }); s.party[4].hp = 0;
  stepGame(s, 25);
  const radius = arenaRadius(s);
  assert.ok(s.party.every(a => Math.hypot(a.x, a.z) <= radius + 1e-8));
  assert.ok(s.enemies.every(e => Math.hypot(e.x, e.z) < radius));
  assert.ok(Math.hypot(s.boss.x, s.boss.z) < radius);
  s.logos.statueWave = 2; s.logos.exposureRemaining = .05; stepGame(s, .05);
  assert.equal(s.enemies.filter(e => e.id.startsWith('sentinel-')).length, 3);
  assert.ok(s.enemies.every(e => Math.hypot(e.x, e.z) <= arenaRadius(s) - 1 + 1e-8));
  s.party[0].moveX = -1;
  assert.ok(applyAction(s, 0, { type: 'dodge' }).ok);
  assert.ok(Math.hypot(s.party[0].x, s.party[0].z) <= arenaRadius(s) + 1e-8);
});

test('dash origins stay grounded across cancellation, completion and the winning hit', () => {
  for (const finish of ['cancel', 'complete', 'victory'] as const) {
    const s = giant(), a = s.party[0]; stepLogosArena(s, 0); a.engaged = true; a.attackTimer = 1000; a.x = 0; a.z = -24;
    assert.ok(applyAction(s, 0, { type: 'criticalDash' }).ok);
    s.boss.hp = s.boss.maxHp * .02; stepLogosArena(s, 25);
    assert.ok(Math.hypot(a.sequence!.originX, a.sequence!.originZ) <= arenaRadius(s) + 1e-8);
    if (finish === 'cancel') assert.ok(applyAction(s, 0, { type: 'dodge' }).ok);
    else { if (finish === 'victory') s.boss.hp = 1; stepGame(s, 1.3); }
    assert.ok(Math.hypot(a.x, a.z) <= arenaRadius(s) + 1e-8, finish);
    if (finish === 'victory') assert.equal(s.logos.stage, 'collapse');
  }
});

test('committed telegraphs remain fixed as Logos recedes; edge trusts escape sideways', () => {
  const s = giant(); s.logos.arenaRadius = 11.2; s.boss.hp = 1;
  const actor = s.party[2]; actor.human = false; actor.engaged = true; actor.x = 11; actor.z = 0;
  const cast = { abilityId: 'logosFracture', name: 'Coherence Fracture', kind: 'circle' as const, x: 10, z: 0, radius: 6, angle: 0, remaining: 3, total: 3 };
  s.boss.cast = cast;
  stepGame(s, 2);
  assert.deepEqual([cast.x, cast.z, cast.radius, cast.angle], [10, 0, 6, 0]);
  assert.equal(isInTelegraph(actor, cast), false);
  assert.ok(Math.hypot(actor.x, actor.z) <= arenaRadius(s) + 1e-8);
});

test('retreat saves replay exactly, old saves ease inward, malformed radii reject', () => {
  const s = giant(); s.boss.hp *= .4; stepGame(s, 2.5);
  assert.ok(validSave(s)); const resumed = restoreSave(JSON.parse(JSON.stringify(s))); assert.ok(resumed);
  stepGame(s, 3); stepGame(resumed, 1.15); stepGame(resumed, 1.85); assert.deepEqual(resumed, s);
  const legacy = giant(); delete legacy.logos.arenaRadius; legacy.boss.hp = 100;
  const old = restoreSave(legacy); assert.ok(old); assert.equal(arenaRadius(old), 24);
  stepGame(old, .05); assert.ok(arenaRadius(old) > 23.9);
  for (const radius of [NaN, Infinity, 0, 10.9, 24.01, '12', undefined]) {
    const bad = structuredClone(s); Reflect.set(bad.logos, 'arenaRadius', radius); assert.equal(restoreSave(bad), null);
  }
  const badStage = createGame(); badStage.logos.arenaRadius = 12; assert.equal(restoreSave(badStage), null);
});

test('defeating Logos preserves the shrunken floor through the original fall and escape', () => {
  const s = giant(); s.logos.arenaRadius = 12; s.boss.hp = 0;
  stepGame(s, .05); const radius = arenaRadius(s);
  assert.equal(s.logos.stage, 'collapse'); assert.equal(s.status, 'fighting'); assert.ok(validSave(s));
  const resumed = restoreSave(s); assert.ok(resumed);
  stepGame(resumed, 5.95); assert.equal(resumed.logos.stage, 'collapse');
  stepGame(resumed, .05); assert.equal(resumed.logos.stage, 'escaped');
  assert.equal(resumed.status, 'victory'); assert.equal(arenaRadius(resumed), radius); assert.ok(validSave(resumed));
});

test('ambient arena strikes land on remaining ground with deterministic storm RNG', () => {
  const s = giant(); s.logos.arenaRadius = 11;
  let arenaStrikes = 0;
  for (let i = 0; i < 100; i++) { selectStaticStrike(s); if (s.storm.target === 'arena') { arenaStrikes++; assert.ok(Math.hypot(s.storm.x, s.storm.z) <= 10 + 1e-8); } }
  assert.ok(arenaStrikes > 20);
});

test('Logos deadline warning uses the giant clock and ignores time spent on sentinels', () => {
  const s = giant(); s.mode = 'god'; s.combatTime = 419.95; s.logos.elapsed = 380;
  stepGame(s, .05);
  assert.equal(s.events.some(e => e.kind === 'warning' && e.text.includes('30 seconds')), false);
  s.combatTime = 459.9; s.logos.elapsed = 419.95; stepGame(s, .05);
  assert.equal(s.events.filter(e => e.kind === 'warning' && e.text.includes('30 seconds')).length, 1);
  stepGame(s, 1);
  assert.equal(s.events.filter(e => e.kind === 'warning' && e.text.includes('30 seconds')).length, 1);
});
