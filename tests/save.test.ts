import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, stepGame } from '../game/engine.ts';
import { ARENA_RADIUS, FIXED_STEP } from '../game/content.ts';
import { restoreSave, validSave } from '../lib/local-save.ts';

test('local save roundtrip preserves a live god encounter', () => {
  const original = createGame('god');
  applyAction(original, 0, { type: 'start' });
  applyAction(original, 0, { type: 'move', x: 1, z: 0 });
  stepGame(original, 2);
  const restored: unknown = JSON.parse(JSON.stringify(original));
  assert.equal(validSave(restored), true);
  assert.deepEqual(restored, original);
  if (validSave(restored)) {
    stepGame(original, 0.05);
    stepGame(restored, 0.05);
    assert.deepEqual(restored, original);
  }
});

test('missing or nonfinite simulation clocks cannot be restored', () => {
  for (const field of ['tick', 'remainder', 'combatTime'] as const) {
    for (const value of [undefined, null, '1', NaN, Infinity, -Infinity]) {
      const saved: Record<string, unknown> = { ...createGame(), [field]: value };
      assert.equal(validSave(saved), false, `${field}: ${String(value)}`);
    }
  }
});

test('malformed cooldowns fail before the restored actor can enter combat', () => {
  for (const cooldowns of [null, undefined, 1, 'ready', { weapon: 'soon' }, { magic: NaN }, { heal: Infinity }]) {
    const saved = createGame();
    (saved.party[0] as unknown as Record<string, unknown>).cooldowns = cooldowns;
    assert.equal(validSave(saved), false, String(cooldowns));
  }
});

test('unsupported save versions and malformed party shape are rejected', () => {
  for (const value of [null, undefined, [], {}, { ...createGame(), version: 2 }, { ...createGame(), party: [] }]) {
    assert.equal(validSave(value), false);
  }
});

test('malformed event entries reject the save without throwing', () => {
  for (const event of [null, undefined, {}, { id: 1, time: Infinity, kind: 'weapon', text: 'bad timestamp' }]) {
    const saved = { ...createGame(), events: [event] };
    assert.equal(validSave(saved), false);
  }
});

test('finite but unsafe clocks and remainder cannot drive an unbounded restore loop', () => {
  for (const field of ['tick', 'eventSeq'] as const) {
    for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(validSave({ ...createGame(), [field]: value }), false, `${field}: ${value}`);
    }
  }
  for (const field of ['time', 'combatTime'] as const) {
    assert.equal(validSave({ ...createGame(), [field]: -1 }), false);
  }
  for (const remainder of [1e100, -0.01, FIXED_STEP + 0.001]) {
    assert.equal(validSave({ ...createGame(), remainder }), false);
  }
  for (const remainder of [-1e-12, FIXED_STEP - 1e-12, FIXED_STEP + 1e-12]) {
    assert.equal(validSave({ ...createGame(), remainder }), true, 'roundoff at a tick boundary is harmless');
  }
});

test('unknown roles, impossible capacities and unbounded actor vectors are rejected', () => {
  const invalidFields: [string, unknown][] = [
    ['role', 'unknown'], ['maxHp', 0], ['maxMp', -1], ['maxHp', 1e100], ['maxMp', 1e100],
    ['moveX', 2], ['moveZ', -2], ['moveX', Infinity], ['x', ARENA_RADIUS + 1],
    ['z', -ARENA_RADIUS - 1], ['cooldowns', []],
  ];
  for (const [field, value] of invalidFields) {
    const saved = createGame();
    (saved.party[0] as unknown as Record<string, unknown>)[field] = value;
    assert.equal(validSave(saved), false, `${field}: ${String(value)}`);
  }
  const outsideCircle = createGame();
  outsideCircle.party[0].x = ARENA_RADIUS;
  outsideCircle.party[0].z = ARENA_RADIUS;
  assert.equal(validSave(outsideCircle), false);
});

test('chain ownership must identify one of the five party slots', () => {
  for (const opener of [-1, 5, 0.5, NaN]) {
    const saved = createGame();
    saved.chain = { weapon: 'cleave', property: 'Liquefaction', remaining: 5, openedAt: 0, opener };
    assert.equal(validSave(saved), false);
  }
});

test('built-in moving states and arena-boundary states remain loadable', () => {
  for (const mode of ['trial', 'god'] as const) {
    const state = createGame(mode);
    applyAction(state, 0, { type: 'start' });
    applyAction(state, 0, { type: 'move', x: 1, z: 1 });
    for (let tick = 0; tick < 300; tick++) {
      stepGame(state, 0.05);
      assert.equal(validSave(JSON.parse(JSON.stringify(state))), true, `${mode}: tick ${tick}`);
    }
  }
  const boundary = createGame();
  boundary.party[0].x = ARENA_RADIUS;
  boundary.party[0].z = 0;
  assert.equal(validSave(boundary), true);
});

test('legacy saves receive zero Revelry stacks without losing encounter data or mutating the input', () => {
  const legacy = createGame('god');
  applyAction(legacy, 0, { type: 'start' });
  legacy.party[0].tp = 1500;
  legacy.party[0].cooldowns.weapon = 2;
  stepGame(legacy, 0.1);
  for (const actor of legacy.party) Reflect.deleteProperty(actor, 'revelryStacks');
  const before = structuredClone(legacy);
  assert.equal(validSave(legacy), false, 'strict validation must not silently migrate');
  const restored = restoreSave(legacy);
  assert.ok(restored);
  assert.deepEqual(legacy, before, 'migration leaves the source snapshot untouched');
  const expected = structuredClone(before);
  expected.party.forEach(actor => { actor.revelryStacks = 0; });
  assert.deepEqual(restored, expected);
  stepGame(restored, 0.05);
  assert.deepEqual(legacy, before, 'restored simulation must not share nested mutable state');
});

test('current and partially migrated saves preserve every existing recipient stack and cooldown', () => {
  const saved = createGame();
  saved.party.forEach((actor, slot) => { actor.revelryStacks = slot; });
  saved.party[0].cooldowns.revelry = 17;
  const current = restoreSave(saved);
  assert.deepEqual(current, saved);
  assert.notEqual(current, saved);
  Reflect.deleteProperty(saved.party[2], 'revelryStacks');
  const restored = restoreSave(saved);
  assert.ok(restored);
  assert.deepEqual(restored.party.map(actor => actor.revelryStacks), [0, 1, 0, 3, 4]);
  assert.equal(restored.party[0].cooldowns.revelry, 17);
  assert.equal(Object.hasOwn(saved.party[2], 'revelryStacks'), false);
});

test('supplied invalid Revelry counts are rejected rather than defaulted or clamped', () => {
  for (const count of [undefined, null, '1', -1, 1.5, 6, NaN, Infinity]) {
    const saved = createGame();
    (saved.party[0] as unknown as Record<string, unknown>).revelryStacks = count;
    assert.equal(validSave(saved), false, String(count));
    assert.equal(restoreSave(saved), null, String(count));
  }
  for (const count of [0, 5]) {
    const saved = createGame();
    saved.party[0].revelryStacks = count;
    assert.ok(restoreSave(saved));
  }
});

test('Revelry migration does not repair unrelated malformed saves or future versions', () => {
  for (const raw of [null, [], {}, { ...createGame(), version: 2 }, { ...createGame(), tick: undefined }, { ...createGame(), party: [null] }]) {
    assert.equal(restoreSave(raw), null);
  }
});
