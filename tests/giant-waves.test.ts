import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createGame, stepGame } from '../game/engine.ts';
import { enemyTargets, giantStatuesActive, offensiveTarget, SENTINEL_ENTRY_SECONDS, GIANT_STATUE_WAVES, statuesEntering } from '../game/logos.ts';
import { GOD_ENRAGE_TIME } from '../game/content.ts';
import { selectStaticStrike } from '../game/static-storm.ts';
import type { Enemy, GameState } from '../game/types.ts';

function advance(state: GameState, seconds: number) { while (seconds > 1e-8) { const dt = Math.min(seconds, 30); stepGame(state, dt); seconds -= dt; } }
function kill(state: GameState, enemy: Enemy) {
  const actor = state.party[3]; actor.x = enemy.x; actor.z = enemy.z; actor.enemyTarget = enemy.id; actor.engaged = true;
  actor.mp = actor.maxMp; actor.spellRecovery = 0; actor.recovery = 0; actor.cooldowns['magic:fire'] = 0;
  enemy.hp = 1;
  assert.ok(applyAction(state, 3, { type: 'magic', element: 'fire' }).ok);
}
function giant() {
  const state = createGame(); state.status = 'victory'; state.boss.hp = 0;
  state.party.forEach(actor => { actor.human = true; });
  assert.ok(applyAction(state, 0, { type: 'faceLogos' }).ok);
  advance(state, 60 + SENTINEL_ENTRY_SECONDS);
  state.party.forEach(actor => { actor.attackTimer = 10000; });
  for (const enemy of [...state.enemies]) kill(state, enemy);
  state.party.forEach(actor => { actor.attackTimer = 10000; actor.x = 0; actor.z = -6; });
  state.boss.attackTimer = state.boss.specialTimer = 10000; state.storm.remaining = 10000;
  return state;
}
function summon(state: GameState) {
  state.logos.exposureRemaining = .05; stepGame(state, .05);
  assert.equal(giantStatuesActive(state), true);
  return state.enemies.filter(enemy => enemy.id.startsWith('sentinel-'));
}

test('all six initial statue kills reduce shared Logos health once and the giant inherits that damage', () => {
  const state = giant();
  assert.equal(state.logos.stage, 'giant');
  assert.equal(state.boss.hp, state.boss.maxHp * .88);
  assert.equal(state.events.filter(event => event.source === 'statueLink').length, 6);
  assert.equal(state.events.filter(event => event.source === 'statueLink').reduce((sum, event) => sum + event.value!, 0), state.boss.maxHp * .12);
  assert.equal(state.boss.z, -20);
  assert.deepEqual(state.enemies.map(enemy => [enemy.x, enemy.z]), [[-19, -4], [19, -4]]);
});

test('giant statue waves protect head and hands, preserve the hands, and redirect stale human targets', () => {
  const state = giant(); const hands = [...state.enemies]; hands[0].hp -= 1000;
  const hp = state.boss.hp, handHp = hands.map(enemy => enemy.hp), timers = hands.map(enemy => enemy.attackTimer);
  const statues = summon(state);
  assert.equal(statues.length, 3); assert.equal(state.enemies.length, 5);
  assert.deepEqual(enemyTargets(state).map(enemy => enemy.id), statues.map(enemy => enemy.id));
  for (const id of ['boss', 'left-hand', 'right-hand']) {
    state.party[0].enemyTarget = id;
    const target = offensiveTarget(state, state.party[0]);
    assert.ok('id' in target); assert.equal(target.id, statues[0].id);
    assert.equal(applyAction(state, 0, { type: 'selectEnemy', id }).ok, false);
  }
  assert.equal(statuesEntering(state), true);
  const positions = statues.map(enemy => [enemy.x, enemy.z]);
  advance(state, 1);
  assert.deepEqual(statues.map(enemy => [enemy.x, enemy.z]), positions);
  advance(state, SENTINEL_ENTRY_SECONDS - 1);
  assert.equal(statuesEntering(state), false);
  assert.equal(state.boss.hp, hp); assert.deepEqual(hands.map(enemy => enemy.hp), handHp);
  assert.deepEqual(hands.map(enemy => enemy.attackTimer), timers);
  assert.deepEqual(hands.map(enemy => [enemy.x, enemy.z]), [[-19, -4], [19, -4]]);
});

test('shielded head and hand burns pause, while killing a statue by burn credits one shared-health break', () => {
  const state = giant(), statues = summon(state);
  const hands = state.enemies.filter(enemy => enemy.id.endsWith('-hand'));
  const burn = () => ({ source: 2, total: 300, dealt: 0, ticks: 0, tickIn: .05 });
  state.boss.burn = burn(); hands.forEach(enemy => { enemy.burn = burn(); });
  const bossHp = state.boss.hp, handHp = hands.map(enemy => enemy.hp);
  advance(state, SENTINEL_ENTRY_SECONDS);
  const victim = statues[0]; victim.hp = 1; victim.burn = burn();
  stepGame(state, .05);
  assert.equal(state.boss.hp, bossHp - Math.round(state.boss.maxHp * .035));
  assert.deepEqual(hands.map(enemy => enemy.hp), handHp);
  assert.equal(state.boss.burn?.ticks, 0); assert.ok(hands.every(enemy => enemy.burn?.ticks === 0));
  assert.equal(victim.linkedDamageCredited, true);
  const after = state.boss.hp; advance(state, 2);
  assert.equal(state.boss.hp, after, 'a dead statue cannot repeatedly drain Logos');
});

test('an area hit cannot spill into shielded parts after it kills the last statue in that same cast', () => {
  const state = giant(), statues = summon(state); advance(state, SENTINEL_ENTRY_SECONDS);
  statues.forEach(enemy => { enemy.hp = 1; enemy.x = 0; enemy.z = -18; });
  const hands = state.enemies.filter(enemy => enemy.id.endsWith('-hand'));
  hands.forEach((enemy, index) => { enemy.x = index ? 3 : -3; enemy.z = -18; });
  const hp = state.boss.hp, handHp = hands.map(enemy => enemy.hp);
  const actor = state.party[3]; actor.x = 0; actor.z = -16; actor.enemyTarget = statues[0].id; actor.spellRecovery = 0;
  assert.ok(applyAction(state, 3, { type: 'fission' }).ok);
  assert.equal(state.boss.hp, hp - Math.round(state.boss.maxHp * .035) * 3);
  assert.deepEqual(hands.map(enemy => enemy.hp), handHp);
  assert.deepEqual(state.events.filter(event => event.source === 'fission' && event.kind === 'magic').map(event => event.enemyId), statues.map(enemy => enemy.id));
  stepGame(state, .05);
  assert.equal(state.logos.exposureRemaining, 20);
  assert.ok(enemyTargets(state).some(enemy => enemy.id === 'boss'));
});

test('only three additional waves can drain Logos, then the final exposure remains open', () => {
  const state = giant();
  for (let wave = 1; wave <= GIANT_STATUE_WAVES; wave++) {
    const statues = summon(state); assert.equal(state.logos.statueWave, wave);
    advance(state, SENTINEL_ENTRY_SECONDS);
    for (const enemy of statues) kill(state, enemy);
    stepGame(state, .05);
    assert.equal(giantStatuesActive(state), false);
  }
  assert.equal(state.boss.hp, state.boss.maxHp - Math.round(state.boss.maxHp * .02) * 6 - Math.round(state.boss.maxHp * .035) * 9);
  advance(state, 45);
  assert.equal(state.logos.statueWave, GIANT_STATUE_WAVES);
  assert.equal(giantStatuesActive(state), false);
});

test('a live statue wave cannot suspend the God encounter deadline', () => {
  const state = giant(); state.mode = 'god'; summon(state);
  state.logos.elapsed = GOD_ENRAGE_TIME - .05;
  stepGame(state, .05);
  assert.equal(state.status, 'defeat');
  assert.ok(state.party.every(actor => actor.hp === 0));
});

test('storm choices respect the statue shield and a pending protected-part strike cannot arc', () => {
  const state = giant(); summon(state); advance(state, SENTINEL_ENTRY_SECONDS);
  let enemyStrikes = 0;
  for (let index = 0; index < 100; index++) {
    selectStaticStrike(state);
    if (state.storm.target === 'boss') {
      enemyStrikes++; assert.match(state.storm.enemyId, /^sentinel-[0-2]$/);
    }
  }
  assert.ok(enemyStrikes > 0);
  for (const id of ['boss', 'left-hand', 'right-hand']) {
    state.storm.target = 'boss'; state.storm.enemyId = id; state.storm.charge = .05; state.storm.remaining = 10000;
    const origin = id === 'boss' ? state.boss : state.enemies.find(enemy => enemy.id === id)!;
    state.party.forEach(actor => { actor.x = origin.x; actor.z = origin.z; actor.attackTimer = 10000; });
    state.enemies.forEach(enemy => { enemy.attackTimer = 10000; });
    const hp = state.party.map(actor => actor.hp), bossHp = state.boss.hp, seq = state.eventSeq;
    stepGame(state, .05);
    assert.deepEqual(state.party.map(actor => actor.hp), hp);
    assert.equal(state.boss.hp, bossHp);
    assert.equal(state.events.filter(event => event.id > seq && event.kind === 'static_arc').length, 0);
  }
});

test('legacy giant snapshots move to edge anchors without replacing hand health or stagger clocks', () => {
  const state = giant();
  delete state.logos.statueWave; delete state.logos.exposureRemaining; delete state.logos.statueEntryRemaining;
  state.boss.x = 1; state.boss.z = -12;
  state.enemies.forEach((enemy, index) => { enemy.x = index ? 7 : -7; enemy.z = -3; enemy.hp = 0; enemy.attackTimer = 12; });
  stepGame(state, .05);
  assert.equal(state.boss.x, 0); assert.equal(state.boss.z, -20);
  assert.deepEqual(state.enemies.map(enemy => [enemy.x, enemy.z, enemy.hp]), [[-19, -4, 0], [19, -4, 0]]);
  assert.ok(state.enemies.every(enemy => Math.abs(enemy.attackTimer - 11.95) < 1e-8));
  assert.equal(state.logos.statueWave, 0);
});
