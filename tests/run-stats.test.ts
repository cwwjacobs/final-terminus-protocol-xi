import assert from 'node:assert/strict';
import test from 'node:test';
import { GOD_ENRAGE_TIME } from '../game/content.ts';
import { applyAction, createGame, setHuman, stepGame } from '../game/engine.ts';
import { getRunScoreboard } from '../game/run-stats.ts';
import type { GameState } from '../game/types.ts';
import { restoreSave, validSave } from '../lib/local-save.ts';

function combat() {
  const state = createGame();
  state.party.forEach((actor, slot) => {
    setHuman(state, slot, true);
    actor.x = slot * .2; actor.z = -1;
    actor.attackTimer = 10000; actor.engaged = true;
  });
  assert.equal(applyAction(state, 0, { type: 'start' }).ok, true);
  state.boss.attackTimer = state.boss.specialTimer = 10000;
  return state;
}

function pulse(state: GameState) {
  state.boss.cast = { name: 'Terminal Echo', abilityId: 'terminalEcho', kind: 'raid', remaining: .05, total: 4, pulses: 1, x: 0, z: -4, radius: 100, angle: 0 };
  stepGame(state, .05);
}

test('a full deterministic run retains effective totals after the combat log rolls over', () => {
  const state = createGame();
  for (let slot = 0; slot < state.party.length; slot++) setHuman(state, slot, false);
  applyAction(state, 0, { type: 'start' });
  for (let second = 0; second < 450 && state.status === 'fighting'; second++) stepGame(state, 1);
  assert.equal(state.status, 'victory');
  assert.equal(state.events.length, 60);
  assert.ok(state.eventSeq > 60);
  const board = getRunScoreboard(state);
  assert.equal(board.partial, false);
  assert.equal(board.seconds, state.combatTime);
  const encounterHealth = state.boss.maxHp + state.enemies.reduce((sum, enemy) => sum + enemy.maxHp, 0);
  assert.equal(state.enemies.length, 8, 'the full run includes every finite ground wave');
  assert.equal(board.totals.damage, encounterHealth);
  assert.equal(board.totals.dps, encounterHealth / state.combatTime);
  assert.ok(board.totals.healing > 0);
  assert.equal(board.totals.taken, state.party.reduce((sum, actor) => sum + actor.maxHp - actor.hp, 0) + board.totals.healing);
  assert.ok(board.rows.every((row, index, rows) => index === 0 || rows[index - 1].damage >= row.damage));
  const lastEventsDamage = state.events.filter(event => ['auto', 'weapon', 'chain', 'magic', 'burst'].includes(event.kind)).reduce((sum, event) => sum + (event.value ?? 0), 0);
  assert.ok(lastEventsDamage < board.totals.damage, 'the scoreboard cannot be a sum of the truncated combat log');
  const snapshot = structuredClone(state);
  stepGame(state, 10);
  assert.deepEqual(state, snapshot, 'finished runs freeze both totals and DPS denominator');
});

test('auto hits, weaponskills, chains, spells, bursts and multi-hit sequences credit the acting character', () => {
  const state = combat();
  state.party[0].attackTimer = 0;
  stepGame(state, .05);
  state.party[0].attackTimer = 10000;
  state.party[0].tp = 1000;
  assert.equal(applyAction(state, 0, { type: 'weapon', id: 'cleave' }).ok, true);
  stepGame(state, 1.5);
  state.party[2].tp = 1000;
  assert.equal(applyAction(state, 2, { type: 'weapon', id: 'pierce' }).ok, true);
  assert.equal(applyAction(state, 3, { type: 'magic', element: 'fire' }).ok, true);
  stepGame(state, 2);
  assert.equal(applyAction(state, 3, { type: 'magic', element: 'ice' }).ok, true);
  assert.equal(applyAction(state, 0, { type: 'criticalDash' }).ok, true);
  assert.equal(applyAction(state, 2, { type: 'splitVolley' }).ok, true);
  stepGame(state, 1.2);
  for (const kind of ['auto', 'weapon', 'chain', 'magic', 'burst']) assert.ok(state.events.some(event => event.kind === kind), kind);
  for (const source of ['criticalDash', 'splitVolley']) assert.ok(state.events.some(event => event.source === source), source);
  for (let slot = 0; slot < 5; slot++) {
    const expected = state.events.filter(event => event.actor === slot && ['auto', 'weapon', 'chain', 'magic', 'burst'].includes(event.kind)).reduce((sum, event) => sum + (event.value ?? 0), 0);
    assert.equal(state.runStats.party[slot].damage, expected, `slot ${slot}`);
  }
  assert.equal(getRunScoreboard(state).totals.damage, state.boss.maxHp - state.boss.hp);
});

test('overkill and overhealing never inflate recorded contributions', () => {
  const heal = combat();
  heal.party[0].hp -= 17;
  assert.equal(applyAction(heal, 4, { type: 'heal', target: 0 }).ok, true);
  assert.equal(heal.party[0].hp, heal.party[0].maxHp);
  assert.equal(heal.runStats.party[4].healing, 17);
  assert.equal(heal.runStats.party[0].healing, 0, 'healing belongs to the caster');
  heal.party[4].cooldowns.heal = 0;
  assert.equal(applyAction(heal, 4, { type: 'heal', target: 0 }).ok, false);
  assert.equal(heal.runStats.party[4].healing, 17);
  const hit = combat();
  hit.boss.hp = 13;
  applyAction(hit, 0, { type: 'criticalDash' });
  stepGame(hit, 1.2);
  assert.equal(hit.status, 'victory');
  assert.equal(hit.runStats.party[0].damage, 13);
});

test('damage taken measures actual HP loss after guarding, physical reduction, shields and evasion', () => {
  const state = combat();
  state.party[0].shieldCharges = 1;
  state.party[2].dodgeUntil = 100;
  state.party[3].guardUntil = 100;
  state.party[4].hp = 1;
  const before = state.party.map(actor => actor.hp);
  pulse(state);
  assert.deepEqual(state.runStats.party.map(row => row.taken), state.party.map((actor, slot) => before[slot] - actor.hp));
  assert.equal(state.runStats.party[0].taken, 0);
  assert.equal(state.runStats.party[2].taken, 0);
  assert.equal(state.runStats.party[3].taken, 110);
  assert.equal(state.runStats.party[4].taken, 1);
  assert.equal(state.runStats.party[4].deaths, 1);
  pulse(state);
  assert.equal(state.runStats.party[4].deaths, 1, 'dead allies cannot die a second time');
  const physical = combat();
  applyAction(physical, 1, { type: 'provoke' });
  physical.boss.attackTimer = 0;
  stepGame(physical, .05);
  assert.equal(physical.runStats.party[1].taken, Math.round(155 * 1.05 * .9));
});

test('Coherence Collapse records remaining HP loss and one death per living character', () => {
  const state = combat();
  state.mode = 'god';
  state.combatTime = GOD_ENRAGE_TIME - .05;
  state.party[2].hp = 0;
  state.runStats.party[2].deaths = 1;
  const hp = state.party.map(actor => actor.hp);
  stepGame(state, .05);
  assert.equal(state.status, 'defeat');
  assert.deepEqual(state.runStats.party.map(row => row.taken), hp);
  assert.deepEqual(state.runStats.party.map(row => row.deaths), [1, 1, 1, 1, 1]);
});

test('new encounters reset totals, zero-time rates are finite and equal-damage ordering follows party slots', () => {
  const state = createGame();
  state.runStats.party[0].damage = 50;
  state.runStats.party[0].healing = 12;
  assert.equal(getRunScoreboard(state).totals.dps, 0);
  assert.equal(getRunScoreboard(state).totals.hps, 0);
  applyAction(state, 0, { type: 'start' });
  assert.deepEqual(state.runStats, createGame().runStats);
  assert.deepEqual(getRunScoreboard(state).rows.map(row => row.slot), [0, 1, 2, 3, 4]);
  state.combatTime = 10;
  state.runStats.party[1].damage = state.runStats.party[3].damage = 100;
  assert.deepEqual(getRunScoreboard(state).rows.map(row => row.slot), [1, 3, 0, 2, 4]);
  assert.equal(getRunScoreboard(state).totals.dps, 20);
});

test('statistics round-trip with local saves and continue identically after restore', () => {
  const original = combat();
  applyAction(original, 0, { type: 'criticalDash' });
  stepGame(original, .4);
  pulse(original);
  const restored = restoreSave(JSON.parse(JSON.stringify(original)));
  assert.ok(restored);
  assert.deepEqual(restored.runStats, original.runStats);
  stepGame(original, 1);
  stepGame(restored, 1);
  assert.deepEqual(restored, original);
});

test('pre-scoreboard saves record only the new portion and disclose unavailable history', () => {
  for (const version of [1, 2]) {
    const legacy = combat();
    stepGame(legacy, 20);
    Reflect.set(legacy, 'version', version);
    Reflect.deleteProperty(legacy, 'runStats');
    const before = structuredClone(legacy);
    assert.equal(validSave(legacy), false);
    const restored = restoreSave(legacy);
    assert.ok(restored);
    assert.equal(restored.runStats.startedAt, 20);
    assert.equal(restored.runStats.partial, true);
    assert.equal(getRunScoreboard(restored).seconds, 0);
    assert.equal(getRunScoreboard(restored).totals.damage, 0);
    applyAction(restored, 0, { type: 'criticalDash' });
    stepGame(restored, 1);
    const board = getRunScoreboard(restored);
    assert.equal(board.seconds, 1);
    assert.equal(board.totals.dps, board.totals.damage);
    assert.equal(board.partial, true);
    assert.deepEqual(legacy, before, 'migration does not mutate the supplied snapshot');
  }
  const oldResult = createGame();
  oldResult.combatTime = 120; oldResult.status = 'victory'; oldResult.boss.hp = 0;
  Reflect.deleteProperty(oldResult, 'runStats');
  const restored = restoreSave(oldResult);
  assert.ok(restored);
  assert.equal(getRunScoreboard(restored).partial, true);
  assert.equal(getRunScoreboard(restored).seconds, 0);
});

test('supplied malformed statistics are rejected instead of repaired during migration', () => {
  const corruptions: ((state: GameState) => void)[] = [
    state => { Reflect.set(state, 'runStats', undefined); },
    state => { Reflect.set(state, 'runStats', null); },
    state => { state.runStats.party.pop(); },
    state => { Reflect.set(state.runStats, 'partial', 'yes'); },
    state => { state.runStats.startedAt = 1; },
    state => { state.runStats.startedAt = -1; },
    state => { state.runStats.party[0].damage = NaN; },
    state => { state.runStats.party[0].healing = Infinity; },
    state => { state.runStats.party[0].taken = -1; },
    state => { state.runStats.party[0].deaths = .5; },
    state => { Reflect.deleteProperty(state.runStats.party[0], 'healing'); },
    state => { Reflect.set(state.runStats.party[0], 'unexpected', 1); },
  ];
  for (const version of [1, 2]) for (const corrupt of corruptions) {
    const state = createGame();
    Reflect.set(state, 'version', version);
    corrupt(state);
    assert.equal(validSave(state), false);
    assert.equal(restoreSave(state), null);
  }
});
