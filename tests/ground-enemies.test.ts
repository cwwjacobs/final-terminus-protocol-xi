import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createGame, setHuman, stepGame } from '../game/engine.ts';
import { GROUND_EMERGE_SECONDS, GROUND_GOD_WAVE_TIMES, GROUND_MAX_ALIVE, GROUND_WAVES, nextGroundWave } from '../game/ground-enemies.ts';
import type { GameState } from '../game/types.ts';

function quietCombat() {
  const state = createGame('trial', 81);
  state.party.forEach((actor, index) => { setHuman(state, index, true); actor.attackTimer = 10000; });
  applyAction(state, 0, { type: 'start' });
  state.boss.attackTimer = state.boss.specialTimer = 10000;
  state.storm.remaining = 10000;
  return state;
}

function advance(state: GameState, seconds: number) {
  while (seconds > 0) { const dt = Math.min(seconds, 30); stepGame(state, dt); seconds -= dt; }
}

test('ground charges emerge for three seconds before they can move or attack', () => {
  const state = quietCombat();
  stepGame(state, GROUND_WAVES[0].at - .05);
  assert.equal(state.enemies.length, 0);
  stepGame(state, .05);
  assert.equal(state.enemies.length, 2);
  assert.equal(state.events.filter(event => event.kind === 'ground_charge').length, 2);
  const enemy = state.enemies[0];
  assert.ok(Math.abs(enemy.emergeRemaining! - (GROUND_EMERGE_SECONDS - .05)) < 1e-8);
  const x = enemy.x, z = enemy.z, timer = enemy.attackTimer;
  state.party[1].ce = 5000;
  state.party[1].x = x; state.party[1].z = z;
  const hp = state.party[1].hp;
  stepGame(state, 2.95);
  assert.equal(enemy.emergeRemaining, 0);
  assert.equal(enemy.x, x); assert.equal(enemy.z, z);
  assert.equal(enemy.attackTimer, timer);
  assert.equal(state.party[1].hp, hp);
  assert.equal(state.events.filter(event => event.kind === 'ground_awaken').length, 2);
  stepGame(state, 1.85);
  assert.ok(state.party[1].hp < hp, 'the ground shard eventually attacks after emergence and its windup');
});

test('three finite waves retain their identities and never pile up or farm-respawn', () => {
  const state = quietCombat();
  advance(state, 90);
  assert.equal(state.enemies.length, 2, 'a surviving earlier group holds back later waves');
  for (let wave = 1; wave <= 3; wave++) {
    assert.ok(state.enemies.filter(enemy => enemy.hp > 0).length <= GROUND_MAX_ALIVE);
    state.enemies.forEach(enemy => { enemy.hp = 0; });
    stepGame(state, .05);
  }
  assert.equal(state.enemies.length, 8);
  assert.equal(new Set(state.enemies.map(enemy => enemy.id)).size, 8);
  assert.deepEqual(state.enemies.map(enemy => enemy.id), ['ground-1-0', 'ground-1-1', 'ground-2-0', 'ground-2-1', 'ground-2-2', 'ground-3-0', 'ground-3-1', 'ground-3-2']);
  advance(state, 100);
  assert.equal(state.enemies.length, 8);
  assert.ok(state.enemies.every(enemy => enemy.hp === 0));
});

test('ground waves use saved combat time deterministically and exclude the Logos sequence', () => {
  const one = quietCombat(), segmented = structuredClone(one);
  stepGame(one, 20);
  for (let i = 0; i < 400; i++) stepGame(segmented, .05);
  assert.deepEqual(segmented, one);
  const resumed = JSON.parse(JSON.stringify(one)) as GameState;
  stepGame(one, 1); stepGame(resumed, 1);
  assert.deepEqual(resumed, one);
  for (const stage of ['descent', 'sentinels', 'giant', 'collapse', 'escaped'] as const) {
    const logos = quietCombat(); logos.encounter = 'logos'; logos.logos.stage = stage; logos.combatTime = 100;
    assert.deepEqual(nextGroundWave(logos), []);
  }
});

test('damage trusts focus ranged manifestations while the warden anchors the boss and human choice persists', () => {
  const state = quietCombat();
  stepGame(state, 16);
  const storm = state.enemies.find(enemy => enemy.kind === 'storm-shard')!;
  const ground = state.enemies.find(enemy => enemy.kind === 'ground-shard')!;
  state.party[0].enemyTarget = ground.id;
  state.party[2].cooldowns.splitVolley = 100;
  for (const slot of [1, 2, 3, 4]) setHuman(state, slot, false);
  stepGame(state, .05);
  assert.equal(state.party[2].enemyTarget, 'boss', 'trusts wait until the ground awakens');
  state.enemies.forEach(enemy => { enemy.emergeRemaining = 0; });
  stepGame(state, .25);
  assert.equal(state.party[0].enemyTarget, ground.id);
  assert.equal(state.party[1].enemyTarget, 'boss');
  assert.equal(state.party[4].enemyTarget, 'boss');
  assert.equal(state.party[2].enemyTarget, storm.id);
  assert.equal(state.party[3].enemyTarget, storm.id);
  state.enemies.forEach(enemy => { enemy.hp = 0; });
  stepGame(state, .25);
  assert.equal(state.party[2].enemyTarget, 'boss');
  assert.equal(state.party[3].enemyTarget, 'boss');
});

test('charging ground protects resources until lightning awakens it, and victory clears manifestations', () => {
  const state = quietCombat();
  stepGame(state, 16);
  const enemy = state.enemies[0], actor = state.party[3];
  actor.x = enemy.x; actor.z = enemy.z; actor.engaged = true;
  assert.equal(applyAction(state, 3, { type: 'selectEnemy', id: enemy.id }).ok, true);
  const before = structuredClone(state);
  assert.equal(applyAction(state, 3, { type: 'magic', element: 'lightning' }).ok, false);
  assert.deepEqual(state, before, 'rejected attacks never spend MP or consume cooldowns');
  enemy.emergeRemaining = 0;
  assert.equal(applyAction(state, 3, { type: 'magic', element: 'lightning' }).ok, true);
  assert.ok(enemy.hp < enemy.maxHp);
  state.boss.hp = 1;
  actor.x = state.boss.x; actor.z = state.boss.z;
  actor.enemyTarget = 'boss'; actor.spellRecovery = 0;
  applyAction(state, 3, { type: 'magic', element: 'ice' });
  assert.equal(state.status, 'victory');
  assert.ok(state.enemies.every(enemy => enemy.hp === 0 && enemy.burn === null));
  assert.deepEqual(nextGroundWave(state), []);
});

test('God waves are spread across the longer encounter rather than exhausted at the start', () => {
  const state = quietCombat(); state.mode = 'god';
  for (let index = 0; index < 3; index++) {
    state.combatTime = GROUND_GOD_WAVE_TIMES[index] - .05;
    assert.deepEqual(nextGroundWave(state), []);
    state.combatTime = GROUND_GOD_WAVE_TIMES[index];
    const wave = nextGroundWave(state);
    assert.equal(wave.length, index === 0 ? 2 : 3);
    assert.ok(wave.every(enemy => enemy.maxHp >= 1400));
    wave.forEach(enemy => { enemy.hp = 0; }); state.enemies.push(...wave);
  }
  state.combatTime = 1000;
  assert.deepEqual(nextGroundWave(state), []);
});

test('ground attacks retaliate against their actual attacker through Static Shock', () => {
  const state = quietCombat();
  stepGame(state, 16);
  const enemy = state.enemies[0], heracles = state.party[1];
  state.enemies[1].hp = 0;
  enemy.emergeRemaining = 0; enemy.attackTimer = 0;
  enemy.x = heracles.x; enemy.z = heracles.z;
  heracles.ce = 10000; heracles.staticShock = 20;
  const bossHp = state.boss.hp, hp = enemy.hp;
  stepGame(state, .05);
  assert.equal(state.boss.hp, bossHp);
  assert.equal(enemy.hp, hp - 180);
  assert.equal(state.events.findLast(event => event.source === 'static_retaliation')?.enemyId, enemy.id);
  const hit = state.events.findLast(event => event.kind === 'hit');
  assert.equal(hit?.enemyId, enemy.id);
  assert.equal(hit?.abilityId, 'groundFracture');
});
