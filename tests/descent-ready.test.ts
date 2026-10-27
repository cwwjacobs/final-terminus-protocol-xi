import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createGame, setHuman, stepGame } from '../game/engine.ts';
import { descentReadiness } from '../game/logos.ts';
import { restoreSave, validSave } from '../lib/local-save.ts';
import { parseRoomRequest } from '../lib/rooms.ts';
import type { Action } from '../game/types.ts';

function descend(humans = [0]) {
  const state = createGame();
  state.party.forEach((_, slot) => setHuman(state, slot, humans.includes(slot)));
  state.status = 'victory'; state.boss.hp = 0; state.runStats.party[0].damage = 1234;
  assert.ok(applyAction(state, humans[0] ?? 0, { type: 'faceLogos' }).ok);
  return state;
}

test('one player can skip immediately while four trusts require no votes', () => {
  const state = descend([3]), rng = state.rng;
  assert.deepEqual(descentReadiness(state).players.map(p => p.slot), [3]);
  assert.ok(applyAction(state, 3, { type: 'readyForLogos', ready: true }).ok);
  assert.equal(state.logos.stage, 'sentinels'); assert.equal(state.combatTime, 0);
  assert.equal(state.runStats.party[0].damage, 0); assert.equal(state.rng, rng);
  assert.equal(state.events.filter(e => e.kind === 'sentinels_awaken').length, 1);
  assert.ok(validSave(state));
});

test('all connected humans must vote; duplicate votes and undo preserve the battle record', () => {
  const state = descend([0, 2, 4]), stats = structuredClone(state.runStats);
  for (const slot of [0, 0, 2]) assert.ok(applyAction(state, slot, { type: 'readyForLogos', ready: true }).ok);
  assert.equal(descentReadiness(state).count, 2); assert.equal(state.logos.stage, 'descent');
  assert.ok(applyAction(state, 2, { type: 'readyForLogos', ready: false }).ok);
  stepGame(state, 2);
  assert.equal(descentReadiness(state).count, 1); assert.deepEqual(state.runStats, stats);
  assert.ok(applyAction(state, 4, { type: 'readyForLogos', ready: true }).ok);
  assert.equal(state.logos.stage, 'descent');
  assert.ok(applyAction(state, 2, { type: 'readyForLogos', ready: true }).ok);
  assert.equal(state.logos.stage, 'sentinels');
});

test('presence changes clear stale votes and an absent unready player no longer blocks the party', () => {
  const state = descend([0, 1, 2]);
  applyAction(state, 0, { type: 'readyForLogos', ready: true });
  applyAction(state, 1, { type: 'readyForLogos', ready: true });
  setHuman(state, 1, false); setHuman(state, 1, true);
  assert.deepEqual(state.logos.readySlots, [0], 'a reconnect cannot inherit an earlier ready vote');
  setHuman(state, 1, false); setHuman(state, 2, false); stepGame(state, .05);
  assert.equal(state.logos.stage, 'sentinels');
  const empty = descend([]); stepGame(empty, 1);
  assert.equal(empty.logos.stage, 'descent'); assert.equal(descentReadiness(empty).allReady, false);
});

test('ready votes survive a saved descent and old snapshots default to no votes', () => {
  const state = descend([0, 4]); applyAction(state, 0, { type: 'readyForLogos', ready: true });
  stepGame(state, 3);
  const restored = restoreSave(JSON.parse(JSON.stringify(state))); assert.ok(restored);
  assert.deepEqual(descentReadiness(restored), descentReadiness(state));
  for (const game of [state, restored]) applyAction(game, 4, { type: 'readyForLogos', ready: true });
  assert.deepEqual(restored, state);
  const legacy = descend([0, 4]); delete legacy.logos.readySlots;
  assert.ok(restoreSave(legacy)); assert.equal(descentReadiness(legacy).count, 0);
  for (const readySlots of [[0, 0], [-1], [5], [1.5], ['0'], 'all']) {
    const invalid = descend(); Reflect.set(invalid.logos, 'readySlots', readySlots);
    assert.equal(restoreSave(invalid), null);
  }
});

test('readiness is descent-only, human-only and cannot carry client authority', () => {
  const state = descend([0, 1]), before = structuredClone(state);
  assert.equal(applyAction(state, 2, { type: 'readyForLogos', ready: true }).ok, false);
  assert.equal(applyAction(state, 0, { type: 'readyForLogos', ready: 'yes' } as unknown as Action).ok, false);
  assert.deepEqual(state, before);
  const request = (action: unknown) => ({ op: 'sync', code: 'a'.repeat(32), token: 'b'.repeat(32), seq: 0, actions: [action] });
  assert.doesNotThrow(() => parseRoomRequest(request({ type: 'readyForLogos', ready: false })));
  for (const action of [{ type: 'readyForLogos' }, { type: 'readyForLogos', ready: 1 }, { type: 'readyForLogos', ready: true, slot: 1 }, { type: 'readyForLogos', ready: true, readySlots: [0, 1] }]) {
    assert.throws(() => parseRoomRequest(request(action)));
  }
  const crown = createGame(), untouched = structuredClone(crown);
  assert.equal(applyAction(crown, 0, { type: 'readyForLogos', ready: true }).ok, false); assert.deepEqual(crown, untouched);
});
