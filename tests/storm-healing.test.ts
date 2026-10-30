import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createGame, setHuman, stepGame } from '../game/engine.ts';
import { createStaticStorm, nextStaticInterval, staticArcTargets } from '../game/static-storm.ts';
import { restoreSave, validSave } from '../lib/local-save.ts';
import { combatSound } from '../components/game/combat-audio.ts';
import { quietMusicSettings } from '../components/game/music-settings.ts';
import type { GameState } from '../game/types.ts';

function combat() {
  const s = createGame();
  s.party.forEach((p, i) => { setHuman(s, i, true); p.x = i * .2; p.z = -1; p.attackTimer = 10000; });
  applyAction(s, 0, { type: 'start' }); s.boss.attackTimer = s.boss.specialTimer = 10000;
  return s;
}
function advance(s: GameState, seconds: number) { while (seconds > 1e-8) { const d = Math.min(seconds, 30); stepGame(s, d); seconds -= d; } }

test('Shimmer Wave heals only living nearby allies, caps overhealing and credits actual recovery', () => {
  const s = combat(); s.party[0].hp -= 500; s.party[1].hp -= 40;
  s.party[2].hp -= 500; s.party[2].x = -23; s.party[3].hp = 0;
  const hp = s.party.map(p => p.hp), mp = s.party[4].mp;
  assert.equal(applyAction(s, 4, { type: 'shimmerWave' }).ok, true);
  assert.deepEqual(s.party.map((p, i) => p.hp - hp[i]), [350, 40, 0, 0, 0]);
  assert.equal(s.runStats.party[4].healing, 390); assert.equal(s.party[4].mp, mp - 120);
  assert.equal(s.party[4].cooldowns.shimmerWave, 20);
  assert.equal(s.events.filter(e => e.kind === 'shimmer_wave').length, 1);
  const before = JSON.stringify(s); assert.equal(applyAction(s, 4, { type: 'shimmerWave' }).ok, false); assert.equal(JSON.stringify(s), before);
});

test('Mending Thread respects an explicit target, produces six ticks, and survives save/restore deterministically', () => {
  const s = combat(); s.party[0].hp -= 900; s.party[1].hp = 200;
  assert.equal(applyAction(s, 4, { type: 'mendingThread', target: 0 }).ok, true);
  const initial = s.party[0].hp; advance(s, 4);
  assert.equal(s.party[0].hp, initial + 200);
  const restored = restoreSave(s)!; assert.ok(restored); advance(s, 8); advance(restored, 8);
  assert.deepEqual(s, restored); assert.equal(s.party[0].hp, initial + 600);
  assert.equal(s.party[0].mendingThread, null); assert.equal(s.runStats.party[4].healing, 600);
  assert.equal(s.events.filter(e => e.source === 'mendingThread' && e.kind === 'heal').length, 6);
});

test('new heals reject wrong roles, dead/out-of-range/full targets and insufficient MP without mutation', () => {
  const s = combat(); s.party[0].hp -= 500;
  for (const [slot, action] of [[0, { type: 'shimmerWave' }], [0, { type: 'mendingThread' }], [4, { type: 'mendingThread', target: 2 }], [4, { type: 'mendingThread', target: 8 }]] as const) {
    const before = JSON.stringify(s); assert.equal(applyAction(s, slot, action).ok, false); assert.equal(JSON.stringify(s), before);
  }
  s.party[4].mp = 79;
  for (const type of ['shimmerWave', 'mendingThread'] as const) { const before = JSON.stringify(s); assert.equal(applyAction(s, 4, { type }).ok, false); assert.equal(JSON.stringify(s), before); }
});

test('storm intervals remain between 15 and 25 seconds and do not consume combat RNG', () => {
  const a = createStaticStorm(42), b = createStaticStorm(42);
  for (let i = 0; i < 100; i++) { const interval = nextStaticInterval(a); assert.equal(interval, nextStaticInterval(b)); assert.ok(interval >= 15 && interval < 25); }
  const s = combat(), rng = s.rng, first = s.storm.remaining;
  advance(s, first - .1); assert.equal(s.storm.charge, 0);
  advance(s, .15); assert.ok(s.storm.charge > 1.9); assert.equal(s.rng, rng);
  assert.equal(s.events.filter(e => e.kind === 'static_strike').length, 1);
});

test('charged enemy waits two seconds, then arcs to at most three distinct nearby players; spreading breaks the chain', () => {
  const s = combat(); s.storm.charge = 2; s.storm.remaining = 100;
  s.party.forEach((p, i) => { p.x = i * 3; p.z = -1; });
  assert.deepEqual(staticArcTargets(s), [0, 1, 2]);
  const hp = s.party.map(p => p.hp); stepGame(s, 1.95);
  assert.deepEqual(s.party.map(p => p.hp), hp);
  const restored = restoreSave(s)!; assert.ok(restored); stepGame(s, .05); stepGame(restored, .05); assert.deepEqual(s, restored);
  assert.deepEqual(s.party.map((p, i) => hp[i] - p.hp), [420, 315, 236, 0, 0]);
  s.party[1].x = 8; s.party[2].x = 15; s.party[3].x = 21; s.party[4].x = -20;
  assert.deepEqual(staticArcTargets(s), [0]);
});

test('static respects evasion, one-hit shields and Guard, and ends on defeat', () => {
  const s = combat(); s.storm.charge = .05; s.party[0].dodgeUntil = 10; s.party[1].shieldCharges = 1; s.party[2].guardUntil = 10;
  const hp = s.party.map(p => p.hp); stepGame(s, .05);
  assert.equal(s.party[0].hp, hp[0]); assert.equal(s.party[1].hp, hp[1]); assert.equal(s.party[1].shieldCharges, 0);
  assert.equal(hp[2] - s.party[2].hp, 83);
  s.status = 'defeat'; const before = JSON.stringify(s); stepGame(s, 30); assert.equal(JSON.stringify(s), before);
});

test('a lethal static chain ends combat immediately and clears active healing', () => {
  const s = combat(); s.storm.charge = .05;
  s.party.forEach((p, i) => { p.hp = i < 3 ? 1 : 0; });
  s.party[0].mendingThread = { remaining: 12, tickIn: 2, source: 4 };
  stepGame(s, .05);
  assert.equal(s.status, 'defeat');
  assert.ok(s.party.every(p => p.hp === 0 && p.mendingThread === null));
  const before = JSON.stringify(s); stepGame(s, 30); assert.equal(JSON.stringify(s), before);
});

test('old snapshots gain additive defaults but malformed storm/thread state is rejected', () => {
  const legacy = structuredClone(combat()); Reflect.deleteProperty(legacy, 'storm'); legacy.party.forEach(p => Reflect.deleteProperty(p, 'mendingThread'));
  const restored = restoreSave(legacy)!; assert.ok(restored); assert.ok(restored.storm.remaining >= 15 && restored.storm.remaining <= 25); assert.equal(restored.party[0].mendingThread, null);
  for (const value of [NaN, -1, 301]) { const s = combat(); s.storm.remaining = value; assert.equal(validSave(s), false); }
  const s = combat(); s.party[0].mendingThread = { remaining: 12, tickIn: 2, source: 0 }; assert.equal(validSave(s), false);
});

test('trust Ariadne uses the additional heals for shared damage and sustained wounds', () => {
  const s = combat(); s.party[0].engaged = true; s.party[0].hp -= 1100; s.party[1].hp -= 500; s.party[4].cooldowns.heal = 5;
  setHuman(s, 4, false); stepGame(s, .05);
  assert.ok(s.events.some(e => e.kind === 'shimmer_wave')); assert.ok(s.party[0].mendingThread);
});

test('each new cue has one sound event; recurring heal ticks are silent; quieting preserves explicit silence', () => {
  const s = combat(); s.party[0].hp -= 800; applyAction(s, 4, { type: 'mendingThread' }); advance(s, 12);
  assert.deepEqual(s.events.map(combatSound).filter(Boolean), ['thread']);
  assert.deepEqual(quietMusicSettings({ enabled: false, muted: true, volume: .9 }), { enabled: false, muted: true, volume: .1 });
  assert.equal(quietMusicSettings({ volume: .03 }).volume, .03); assert.equal(quietMusicSettings({ volume: 0 }).volume, 0);
});
