import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createGame, stepGame } from '../game/engine.ts';
import { GROUND_GOD_WAVE_TIMES, GROUND_WAVES } from '../game/ground-enemies.ts';
import type { Enemy } from '../game/types.ts';
import { restoreSave, validSave } from '../lib/local-save.ts';

function fragment(id = 'ground-1-0', hp = 900, emergeRemaining = 1.5) {
  return {
    id, name: 'Ground shard', kind: 'ground-shard', x: 4, z: 2,
    hp, maxHp: 900, target: 1, attackTimer: 3, stunRemaining: 0, burn: null,
    emergeRemaining, spawnX: 4, spawnZ: 2,
  } as Enemy & { kind: string; emergeRemaining: number; spawnX: number; spawnZ: number };
}

function encounter() {
  const state = createGame('trial', 17);
  state.party.forEach(actor => { actor.human = true; actor.engaged = false; });
  applyAction(state, 0, { type: 'start' });
  state.enemies = [fragment(), fragment('ground-1-1')];
  state.party[0].enemyTarget = 'ground-1-1';
  state.storm.enemyId = 'ground-1-0';
  state.events.push({
    id: ++state.eventSeq, time: state.time, kind: 'ground_charge', text: 'The ground awakens.',
    enemyId: 'ground-1-0', abilityId: 'groundAwakening', element: 'lightning',
    area: { kind: 'circle', x: 4, z: 2, radius: 2.2, total: 3, angle: 0 },
  });
  return state;
}

test('live engine waves remain loadable through warning, awakening and all three waves', () => {
  for (const mode of ['trial', 'god'] as const) {
    const state = createGame(mode, 77);
    state.party.forEach(actor => { actor.human = true; actor.engaged = false; });
    applyAction(state, 0, { type: 'start' });
    state.party.forEach(actor => { actor.engaged = false; });
    state.boss.attackTimer = state.boss.specialTimer = 1000;
    state.storm.remaining = 250;
    const times = mode === 'god' ? GROUND_GOD_WAVE_TIMES : GROUND_WAVES.map(wave => wave.at);
    for (let tick = 0; tick < (times[2] + 5) * 20; tick++) {
      stepGame(state, .05);
      assert.equal(validSave(state), true, `${mode} ${state.combatTime}`);
      if (tick === (times[0] + .5) * 20) {
        assert.equal(state.enemies.length, 2);
        assert.ok(state.enemies[0].emergeRemaining! > 0);
        const restored = restoreSave(JSON.parse(JSON.stringify(state)));
        assert.ok(restored);
        stepGame(state, .05); stepGame(restored, .05);
        assert.deepEqual(restored, state, 'the authoritative countdown continues exactly after reload');
      }
      if (tick === (times[0] + 15) * 20 || tick === (times[1] + 15) * 20) state.enemies.forEach(enemy => { enemy.hp = 0; enemy.burn = null; });
    }
    assert.equal(state.enemies.length, 8);
    assert.ok(restoreSave(state));
  }
});

test('ground fracture and splinter bolt impacts preserve their attacker identity after restore', () => {
  const state = encounter();
  state.party.forEach(actor => { actor.engaged = false; });
  state.boss.attackTimer = state.boss.specialTimer = 1000;
  state.storm.remaining = 250;
  state.enemies.forEach(enemy => { enemy.emergeRemaining = 0; enemy.attackTimer = 0; enemy.x = state.party[1].x; enemy.z = state.party[1].z; });
  state.enemies[1].kind = 'storm-shard';
  stepGame(state, .05);
  for (const [index, abilityId] of ['groundFracture', 'splinterBolt'].entries()) {
    const impact = state.events.find(event => event.abilityId === abilityId);
    assert.ok(impact, abilityId);
    assert.equal(impact.enemyId, `ground-1-${index}`);
    assert.equal(impact.element, index === 1 ? 'lightning' : undefined);
  }
  const restored = restoreSave(JSON.parse(JSON.stringify(state)));
  assert.ok(restored);
  assert.deepEqual(restored.events, state.events);
});

test('ground warnings, attacks and dead fragments roundtrip without changing continuation', () => {
  for (const stage of ['warning', 'active', 'dead'] as const) {
    const state = encounter();
    state.enemies.forEach(enemy => {
      Object.assign(enemy, { emergeRemaining: stage === 'warning' ? 1.5 : 0 });
      if (stage === 'dead') enemy.hp = 0;
    });
    const restored = restoreSave(JSON.parse(JSON.stringify(state)));
    assert.ok(restored, stage);
    assert.deepEqual(restored, state);
    stepGame(state, .1); stepGame(restored, .1);
    assert.deepEqual(restored, state, `${stage} restoration must not restart the warning or duplicate a wave`);
    assert.equal(validSave(restored), true);
  }
});

test('all eight retained fragments and references to earlier waves remain valid', () => {
  const state = encounter();
  state.enemies = ['ground-1-0', 'ground-1-1', 'ground-2-0', 'ground-2-1', 'ground-2-2', 'ground-3-0', 'ground-3-1', 'ground-3-2']
    .map((id, index) => fragment(id, index < 5 ? 0 : 900, 0));
  state.enemies[6].kind = 'storm-shard';
  assert.ok(restoreSave(state));
  state.enemies[4].hp = 100;
  assert.equal(restoreSave(state), null, 'more than three living fragments are invalid');
});

test('ground identities and emergence metadata are bounded and malformed values are never migrated', () => {
  const cases: [string, unknown][] = [
    ['id', 'ground-1-2'], ['id', 'ground-4-0'], ['id', 'ground-1--1'], ['id', 'ground-1-0junk'],
    ['kind', 'boss'], ['kind', undefined], ['kind', null],
    ['emergeRemaining', -1], ['emergeRemaining', 3.01], ['emergeRemaining', Infinity], ['emergeRemaining', NaN], ['emergeRemaining', undefined],
    ['spawnX', Infinity], ['spawnX', 24], ['spawnX', undefined], ['spawnZ', NaN], ['spawnZ', 99],
  ];
  for (const [key, value] of cases) {
    const state = encounter();
    Reflect.set(state.enemies[0], key, value);
    assert.equal(validSave(state), false, `${key} ${String(value)}`);
    assert.equal(restoreSave(state), null, `migration cannot repair ${key} ${String(value)}`);
  }
});

test('ground IDs are bounded on actor targets, lightning targets and event metadata', () => {
  for (const id of ['ground-0-0', 'ground-1-2', 'ground-4-1', 'unknown']) {
    const actor = encounter(); actor.party[0].enemyTarget = id;
    assert.equal(restoreSave(actor), null, `actor ${id}`);
    const storm = encounter(); storm.storm.enemyId = id;
    assert.equal(restoreSave(storm), null, `storm ${id}`);
    const event = encounter(); event.events.at(-1)!.enemyId = id;
    assert.equal(restoreSave(event), null, `event ${id}`);
  }
});

test('crown accepts only ground fragments and later Logos encounters retain their existing enemies', () => {
  const state = encounter();
  state.enemies[0].id = 'sentinel-0';
  assert.equal(restoreSave(state), null);
  const logos = encounter(); logos.encounter = 'logos'; logos.logos.stage = 'sentinels';
  assert.equal(restoreSave(logos), null, 'ground fragment waves belong to the crown encounter');
});

test('historical saves need no ground fields and loading keeps the input detached', () => {
  const old = createGame();
  const before = structuredClone(old);
  const restored = restoreSave(old);
  assert.ok(restored);
  assert.deepEqual(restored, before);
  restored.boss.hp--;
  assert.deepEqual(old, before);
  const legacy = structuredClone(old);
  Reflect.set(legacy, 'version', 1);
  Reflect.deleteProperty(legacy, 'enemies');
  Reflect.deleteProperty(legacy, 'encounter');
  Reflect.deleteProperty(legacy, 'logos');
  assert.ok(restoreSave(legacy));
});
