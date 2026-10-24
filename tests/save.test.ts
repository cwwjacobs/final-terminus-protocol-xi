import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, stepGame } from '../game/engine.ts';
import { ARENA_RADIUS, FIXED_STEP } from '../game/content.ts';
import { restoreSave, validSave } from '../lib/local-save.ts';
import type { GameState } from '../game/types.ts';

function asLegacy(original: GameState = createGame()): GameState {
  const state = structuredClone(original);
  Reflect.set(state, 'version', 1);
  for (const key of ['rng', 'sequenceSeq']) Reflect.deleteProperty(state, key);
  Reflect.deleteProperty(state.boss, 'cooldowns');
  for (const event of state.events) for (const key of ['sequenceId', 'hitIndex']) Reflect.deleteProperty(event, key);
  for (const actor of state.party) for (const key of [
    'shieldCharges', 'recovery', 'spellRecovery', 'selfChainUntil', 'rapidWeave', 'elementalCycle', 'sequence',
  ]) Reflect.deleteProperty(actor, key);
  return state;
}

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
  for (const value of [null, undefined, [], {}, { ...createGame(), version: 99 }, { ...createGame(), party: [] }]) {
    assert.equal(validSave(value), false);
  }
});

test('malformed event entries reject the save without throwing', () => {
  for (const event of [null, undefined, {}, { id: 1, time: Infinity, kind: 'weapon', text: 'bad timestamp' }]) {
    const saved = { ...createGame(), events: [event] };
    assert.equal(validSave(saved), false);
  }
});

test('healing target metadata is optional for legacy saves and bounded to a party slot', () => {
  const event = { id: 1, time: 0, kind: 'heal', text: 'Mend', actor: 4, value: 690 };
  assert.equal(validSave({ ...createGame(), events: [event] }), true);
  for (const target of [0, 1, 4]) {
    assert.equal(validSave({ ...createGame(), events: [{ ...event, target }] }), true);
  }
  for (const target of [-1, 5, 0.5, NaN, Infinity, '1', null]) {
    assert.equal(validSave({ ...createGame(), events: [{ ...event, target }] }), false, String(target));
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
  const running = createGame('god');
  applyAction(running, 0, { type: 'start' });
  running.party[0].tp = 1500;
  stepGame(running, 0.1);
  const legacy = asLegacy(running);
  legacy.party[0].cooldowns.weapon = 2;
  for (const actor of legacy.party) Reflect.deleteProperty(actor, 'revelryStacks');
  const before = structuredClone(legacy);
  assert.equal(validSave(legacy), false, 'strict validation must not silently migrate');
  const restored = restoreSave(legacy);
  assert.ok(restored);
  assert.deepEqual(legacy, before, 'migration leaves the source snapshot untouched');
  assert.equal(restored.version, 2);
  assert.equal(restored.combatTime, before.combatTime);
  assert.equal(restored.party[0].tp, before.party[0].tp);
  assert.deepEqual(restored.party.map(actor => actor.revelryStacks), [0, 0, 0, 0, 0]);
  assert.deepEqual(restored.party.map(actor => actor.shieldCharges), [0, 0, 0, 0, 0]);
  for (const id of ['cleave', 'pierce', 'resonance']) assert.equal(restored.party[0].cooldowns[`weapon:${id}`], 2);
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
  const legacy = asLegacy(saved);
  Reflect.deleteProperty(legacy.party[2], 'revelryStacks');
  const restored = restoreSave(legacy);
  assert.ok(restored);
  assert.deepEqual(restored.party.map(actor => actor.revelryStacks), [0, 1, 0, 3, 4]);
  assert.equal(restored.party[0].cooldowns.revelry, 17);
  assert.equal(Object.hasOwn(legacy.party[2], 'revelryStacks'), false);
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
  for (const raw of [null, [], {}, { ...createGame(), version: 99 }, { ...createGame(), tick: undefined }, { ...createGame(), party: [null] }]) {
    assert.equal(restoreSave(raw), null);
  }
});

test('legacy shared recasts gate every corresponding ability without overwriting longer recasts', () => {
  const saved = asLegacy();
  saved.party[0].cooldowns = { magic: 7, weapon: 2, 'magic:fire': 9, 'weapon:pierce': 3, revelry: 30 };
  const before = structuredClone(saved);
  const restored = restoreSave(saved);
  assert.ok(restored);
  assert.deepEqual(restored.party[0].cooldowns, {
    'magic:fire': 9, 'magic:ice': 7, 'magic:lightning': 7,
    'weapon:cleave': 2, 'weapon:pierce': 3, 'weapon:resonance': 2, revelry: 30,
  });
  assert.deepEqual(saved, before);
  assert.deepEqual(restoreSave(saved), restored, 'legacy migration has a stable random seed');
  assert.equal(restored.sequenceSeq, 0);
  assert.deepEqual(restored.boss.cooldowns, {});
  for (const actor of restored.party) {
    assert.equal(actor.sequence, null);
    assert.equal(actor.rapidWeave, null);
    assert.deepEqual(actor.elementalCycle, { elements: [], remaining: 0 });
    assert.equal(actor.shieldCharges, 0);
    assert.equal(actor.selfChainUntil, 0);
  }
});

test('neither legacy nor current snapshots repair supplied malformed mechanics fields', () => {
  const invalid: [string, unknown][] = [
    ['shieldCharges', undefined], ['shieldCharges', -1], ['shieldCharges', 2], ['shieldCharges', 0.5],
    ['recovery', NaN], ['spellRecovery', -1], ['selfChainUntil', Infinity],
    ['sequence', {}], ['rapidWeave', undefined], ['elementalCycle', null],
  ];
  for (const legacy of [false, true]) for (const [field, value] of invalid) {
    const state = legacy ? asLegacy() : createGame();
    Reflect.set(state.party[0], field, value);
    assert.equal(restoreSave(state), null, `${legacy ? 'legacy' : 'current'}: ${field}=${String(value)}`);
  }
  for (const field of ['shieldCharges', 'recovery', 'spellRecovery', 'selfChainUntil', 'sequence', 'rapidWeave', 'elementalCycle', 'revelryStacks']) {
    const state = createGame();
    Reflect.deleteProperty(state.party[0], field);
    assert.equal(restoreSave(state), null, `current version is missing ${field}`);
  }
  for (const key of ['magic', 'weapon', 'magic:fire', 'weapon:cleave']) for (const value of [undefined, null, -1, NaN, Infinity, '2']) {
    const state = asLegacy();
    Reflect.set(state.party[0].cooldowns, key, value);
    assert.equal(restoreSave(state), null, `${key}=${String(value)}`);
  }
});

test('saved random state and active hit identities must be bounded integers', () => {
  for (const rng of [-1, 0.5, 0x100000000, undefined, NaN, '42']) {
    assert.equal(restoreSave({ ...createGame(), rng }), null);
  }
  for (const sequenceSeq of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, undefined]) {
    assert.equal(restoreSave({ ...createGame(), sequenceSeq }), null);
  }
  for (const rng of [0, 0xffffffff]) assert.ok(restoreSave({ ...createGame(), rng }));
  const valid = createGame();
  valid.sequenceSeq = 2;
  valid.party[0].sequence = { id: 1, kind: 'criticalDash', elapsed: 0.4, nextHit: 1, landedHits: 1, originX: 0, originZ: 0 };
  valid.party[2].sequence = { id: 2, kind: 'splitVolley', elapsed: 0.4, nextHit: 2, landedHits: 2, originX: 2, originZ: 0 };
  assert.ok(restoreSave(valid));
  for (const [field, value] of [
    ['id', 0], ['id', 3], ['id', 0.5], ['nextHit', -1], ['nextHit', 0], ['nextHit', 2], ['nextHit', 4], ['nextHit', 0.5],
    ['elapsed', -1], ['elapsed', Infinity], ['elapsed', 1.3], ['originX', 100], ['originZ', NaN], ['kind', 'forged'],
    ['landedHits', -1], ['landedHits', 0.5], ['landedHits', 2], ['landedHits', undefined],
  ] as [string, unknown][]) {
    const state = structuredClone(valid);
    Reflect.set(state.party[0].sequence!, field, value);
    assert.equal(restoreSave(state), null, `${field}=${String(value)}`);
  }
  const duplicate = structuredClone(valid);
  duplicate.party[2].sequence!.id = 1;
  assert.equal(restoreSave(duplicate), null, 'two actors cannot own the same hit sequence');
});

test('active weave charges, elemental progress and boss pulse state roundtrip strictly', () => {
  const saved = createGame();
  saved.party[3].rapidWeave = {
    remaining: 8, charges: { fire: 1, ice: 0, lightning: 2 }, refresh: { fire: 0.3, ice: 0, lightning: 0 },
  };
  saved.party[3].elementalCycle = { elements: ['fire', 'ice'], remaining: 10 };
  saved.party[4].shieldCharges = 1;
  saved.party[4].cooldowns.aegis = 89;
  saved.boss.cast = {
    name: 'Terminal Echo', kind: 'raid', abilityId: 'terminalEcho', pulses: 1,
    total: 1, remaining: 0.5, x: 0, z: 0, radius: 100, angle: 0,
  };
  assert.deepEqual(restoreSave(saved), saved);
  for (const invalid of [
    { remaining: 13 }, { remaining: NaN }, { charges: { fire: 3, ice: 1, lightning: 1 } },
    { charges: { fire: 1.5, ice: 1, lightning: 1 } }, { charges: { fire: 1, ice: 1 } },
    { refresh: { fire: -1, ice: 0, lightning: 0 } }, { refresh: { fire: 0.6, ice: 0, lightning: 0 } },
  ]) {
    const state = structuredClone(saved);
    Object.assign(state.party[3].rapidWeave!, invalid);
    assert.equal(restoreSave(state), null);
  }
  for (const elements of [['fire', 'fire'], ['fire', 'ice', 'lightning'], ['void'], [null]]) {
    const state = structuredClone(saved);
    Reflect.set(state.party[3].elementalCycle, 'elements', elements);
    assert.equal(restoreSave(state), null);
  }
  for (const [field, value] of [['pulses', 3], ['pulses', 0.5], ['target', 5], ['target', null], ['abilityId', 'forged']] as [string, unknown][]) {
    const state = structuredClone(saved);
    Reflect.set(state.boss.cast!, field, value);
    assert.equal(restoreSave(state), null);
  }
});

test('save during Critical Dash continues the same hits and random stream once', () => {
  const original = createGame();
  original.party.forEach(actor => { actor.human = true; });
  original.party[0].x = original.boss.x;
  original.party[0].z = original.boss.z + 3;
  assert.equal(applyAction(original, 0, { type: 'start' }).ok, true);
  assert.equal(applyAction(original, 0, { type: 'criticalDash' }).ok, true);
  stepGame(original, 0.4);
  assert.equal(original.party[0].sequence?.nextHit, 1);
  const restored = restoreSave(JSON.parse(JSON.stringify(original)));
  assert.ok(restored);
  stepGame(original, 1);
  for (let i = 0; i < 20; i++) stepGame(restored, 0.05);
  assert.deepEqual(restored, original);
  assert.equal(restored.party[0].sequence, null);
});

test('scheduled hit event identities are paired, bounded and unique in retained events', () => {
  const state = createGame();
  state.sequenceSeq = 1;
  const hit = {
    id: 1, time: 0.2, kind: 'weapon', text: 'Critical Dash', actor: 0, value: 200,
    source: 'criticalDash', critical: true, sequenceId: 1, hitIndex: 0,
  };
  state.events = [hit];
  assert.ok(restoreSave(state));
  for (const [field, value] of [
    ['sequenceId', undefined], ['sequenceId', 0], ['sequenceId', 2], ['sequenceId', 0.5],
    ['hitIndex', undefined], ['hitIndex', -1], ['hitIndex', 0.5], ['hitIndex', 3],
    ['source', 'forged'], ['kind', 'heal'], ['actor', undefined],
  ] as [string, unknown][]) {
    const saved = structuredClone(state);
    Reflect.set(saved.events[0], field, value);
    assert.equal(restoreSave(saved), null, `${field}=${String(value)}`);
  }
  state.events.push({ ...hit, id: 2 });
  assert.equal(restoreSave(state), null, 'one scheduled hit cannot have two retained outcomes');
});
