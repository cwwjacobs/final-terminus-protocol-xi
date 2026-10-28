import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createGame, stepGame } from '../game/engine.ts';
import type { Enemy, GameState } from '../game/types.ts';
import { restoreSave, validSave } from '../lib/local-save.ts';

function enemy(id: string): Enemy {
  return { id, name: `Logos · ${id}`, x: 4, z: 0, hp: 4500, maxHp: 4500, target: 1, attackTimer: 1000, stunRemaining: 0, burn: null };
}

/** A v30 giant snapshot omits the new cycle group entirely. */
function legacyGiant() {
  const state = createGame('trial', 71);
  state.status = 'fighting'; state.encounter = 'logos';
  state.logos = { stage: 'giant', elapsed: 12 };
  state.ultimatesUnlocked = true;
  state.enemies = [enemy('left-hand'), enemy('right-hand')];
  state.party.forEach(actor => { actor.human = true; actor.engaged = false; actor.attackTimer = 1000; });
  state.boss.attackTimer = state.boss.specialTimer = 1000;
  state.storm.remaining = 250;
  return state;
}

function killStatue(state: GameState, target: Enemy) {
  const caster = state.party[3];
  caster.engaged = true; caster.x = target.x; caster.z = target.z;
  caster.spellRecovery = 0; caster.cooldowns['magic:fire'] = 0;
  target.hp = 1;
  assert.equal(applyAction(state, 3, { type: 'selectEnemy', id: target.id }).ok, true);
  assert.equal(applyAction(state, 3, { type: 'magic', element: 'fire' }).ok, true);
  caster.engaged = false;
}

test('v30 giant saves preserve health and initialize one complete cycle group without replaying rewards', () => {
  const old = legacyGiant(), before = structuredClone(old);
  const restored = restoreSave(old);
  assert.ok(restored);
  assert.deepEqual(restored, before);
  assert.deepEqual(old, before, 'migration does not mutate the source snapshot');
  stepGame(restored, .05);
  assert.equal(restored.boss.hp, before.boss.hp);
  assert.equal(restored.logos.statueWave, 0);
  assert.ok(restored.logos.exposureRemaining! > 19);
  assert.equal(restored.logos.statueEntryRemaining, 0);
  assert.ok(validSave(restored));
});

test('mid-entry and mid-exposure saves replay exactly without duplicating waves or linked damage', () => {
  const state = legacyGiant();
  stepGame(state, 20.5);
  assert.equal(state.logos.statueWave, 1);
  assert.equal(state.enemies.filter(enemy => enemy.id.startsWith('sentinel-')).length, 3);
  assert.ok(state.logos.statueEntryRemaining! > 0);
  const saved = restoreSave(JSON.parse(JSON.stringify(state)));
  assert.ok(saved);
  stepGame(state, .6); stepGame(saved, .2); stepGame(saved, .4);
  assert.deepEqual(saved, state);
  stepGame(state, 2);
  for (const statue of state.enemies.filter(enemy => enemy.id.startsWith('sentinel-'))) killStatue(state, statue);
  stepGame(state, .05);
  assert.ok(state.logos.exposureRemaining! > 0);
  assert.ok(state.enemies.filter(enemy => enemy.id.startsWith('sentinel-')).every(enemy => enemy.linkedDamageCredited));
  const exposed = restoreSave(JSON.parse(JSON.stringify(state)));
  assert.ok(exposed);
  const health = state.boss.hp;
  const linkEvents = state.events.filter(event => event.abilityId === 'statueLink').length;
  stepGame(state, .5); stepGame(exposed, .25); stepGame(exposed, .25);
  assert.deepEqual(exposed, state);
  assert.equal(state.boss.hp, health, 'credited corpses cannot reduce health again after a restore');
  assert.equal(state.events.filter(event => event.abilityId === 'statueLink').length, linkEvents);
});

test('an initial sentinel death saves its health transfer exactly once', () => {
  const state = legacyGiant();
  state.logos = { stage: 'sentinels', elapsed: 3 };
  state.ultimatesUnlocked = false;
  state.enemies = Array.from({ length: 6 }, (_, index) => enemy(`sentinel-${index}`));
  const before = state.boss.hp;
  killStatue(state, state.enemies[0]);
  assert.ok(state.boss.hp < before);
  assert.equal(state.enemies[0].linkedDamageCredited, true);
  assert.ok(state.events.some(event => event.abilityId === 'statueLink' && event.enemyId === 'boss'));
  const restored = restoreSave(JSON.parse(JSON.stringify(state)));
  assert.ok(restored);
  const after = restored.boss.hp;
  stepGame(restored, .5);
  assert.equal(restored.boss.hp, after);
  assert.ok(validSave(restored));
});

test('reused statue IDs receive fresh receipts per wave and remain exhausted after restoring the third wave', () => {
  let state = legacyGiant();
  for (let wave = 1; wave <= 3; wave++) {
    stepGame(state, 23);
    assert.equal(state.logos.statueWave, wave);
    const statues = state.enemies.filter(enemy => enemy.id.startsWith('sentinel-'));
    assert.equal(statues.length, 3);
    assert.ok(statues.every(enemy => enemy.linkedDamageCredited === false));
    for (const statue of statues) killStatue(state, statue);
    stepGame(state, .05);
    const restored = restoreSave(JSON.parse(JSON.stringify(state)));
    assert.ok(restored);
    assert.deepEqual(restored, state);
    state = restored;
  }
  const health = state.boss.hp;
  stepGame(state, 25);
  assert.equal(state.logos.statueWave, 3);
  assert.equal(state.boss.hp, health);
  assert.ok(state.enemies.filter(enemy => enemy.id.startsWith('sentinel-')).every(enemy => enemy.hp === 0));
  assert.ok(validSave(state));
});

test('malformed or partially stripped cycle groups reject instead of restarting clocks', () => {
  const current = legacyGiant();
  Object.assign(current.logos, { statueWave: 1, exposureRemaining: 8, statueEntryRemaining: 0 });
  assert.ok(restoreSave(current));
  for (const [key, values] of [
    ['statueWave', [-1, .5, 4, Infinity, NaN, undefined, '1']],
    ['exposureRemaining', [-1, 20.01, Infinity, NaN, undefined, '1']],
    ['statueEntryRemaining', [-1, 2.21, Infinity, NaN, undefined, '1']],
  ] as const) {
    for (const value of values) {
      const malformed = structuredClone(current); Reflect.set(malformed.logos, key, value);
      assert.equal(restoreSave(malformed), null, `${key}: ${String(value)}`);
    }
    const missing = structuredClone(current); Reflect.deleteProperty(missing.logos, key);
    assert.equal(restoreSave(missing), null, `${key} must not disappear from a current cycle group`);
  }
  const stale = structuredClone(current); stale.logos.stage = 'collapse';
  assert.equal(restoreSave(stale), null, 'finished stages discard the giant cycle group');
  const extra = structuredClone(current); extra.enemies.push(enemy('sentinel-3'));
  assert.equal(restoreSave(extra), null, 'modern giant waves only reuse three statue IDs');
});

test('linked damage receipt flags are booleans restricted to sentinels', () => {
  const state = legacyGiant();
  state.enemies.push(enemy('sentinel-0'));
  for (const flag of [true, false]) {
    state.enemies[2].linkedDamageCredited = flag;
    assert.ok(restoreSave(state));
  }
  for (const flag of [undefined, null, 1, 'true', {}]) {
    const invalid = structuredClone(state); Reflect.set(invalid.enemies[2], 'linkedDamageCredited', flag);
    assert.equal(restoreSave(invalid), null);
  }
  const wrong = structuredClone(state); wrong.enemies[0].linkedDamageCredited = true;
  assert.equal(restoreSave(wrong), null, 'hands cannot claim sentinel health credit');
});
