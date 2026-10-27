import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createGame, setHuman, stepGame } from '../game/engine.ts';
import { createStaticStorm, nextStaticInterval, selectStaticStrike } from '../game/static-storm.ts';
import { restoreSave, validSave } from '../lib/local-save.ts';
import type { GameState } from '../game/types.ts';

function combat() {
  const state = createGame('trial', 42);
  state.party.forEach((actor, slot) => {
    setHuman(state, slot, true);
    actor.x = slot * .2;
    actor.z = -1;
    actor.engaged = true;
    actor.attackTimer = 10000;
  });
  applyAction(state, 0, { type: 'start' });
  state.party.forEach(actor => { actor.ce = actor.ve = 0; });
  state.boss.attackTimer = state.boss.specialTimer = 10000;
  state.storm.remaining = 25;
  return state;
}

function attackHeracles(state: GameState) {
  const actor = state.party[1];
  state.boss.cast = { name: 'Static Shock test hit', kind: 'circle', x: actor.x, z: actor.z, radius: .01, angle: 0, total: 1, remaining: .05 };
  stepGame(state, .05);
}

function echoes(state: GameState, sentinels = false) {
  state.encounter = 'logos';
  state.logos.stage = sentinels ? 'sentinels' : 'giant';
  state.ultimatesUnlocked = !sentinels;
  state.enemies = [0, 1].map(index => ({ id: `${sentinels ? 'sentinel' : 'echo'}-${index}`, name: 'Test enemy', x: state.party[1].x, z: state.party[1].z + index + 1, hp: 9000, maxHp: 9000, target: 1, attackTimer: 10000, stunRemaining: 0, burn: null }));
}

const closeTo = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('lightning intervals are 15–25 seconds and all three targets use a separate saved random stream', () => {
  const a = createStaticStorm(42), b = createStaticStorm(42);
  for (let i = 0; i < 200; i++) {
    const interval = nextStaticInterval(a);
    assert.equal(interval, nextStaticInterval(b));
    assert.ok(interval >= 15 && interval < 25);
  }
  const state = combat(), rng = state.rng, counts = { boss: 0, heracles: 0, arena: 0 };
  for (let i = 0; i < 1200; i++) {
    selectStaticStrike(state);
    counts[state.storm.target]++;
    if (state.storm.target === 'arena') assert.ok(Math.hypot(state.storm.x, state.storm.z) >= 5 && Math.hypot(state.storm.x, state.storm.z) < 20);
  }
  assert.ok(Object.values(counts).every(count => count > 200 && count < 600), JSON.stringify(counts));
  assert.equal(state.rng, rng);
  state.storm.remaining = .05;
  stepGame(state, .05);
  assert.equal(state.storm.charge, 2);
  assert.ok(state.storm.remaining >= 15 && state.storm.remaining < 25);
  assert.equal(state.rng, rng, 'an actual strike also leaves critical-hit RNG unchanged');
});

test('selection excludes fallen Heracles and enemy strikes select a live sentinel during Logos immunity', () => {
  const state = combat();
  state.party[1].hp = 0;
  for (let i = 0; i < 100; i++) {
    selectStaticStrike(state);
    assert.notEqual(state.storm.target, 'heracles');
  }
  state.party[1].hp = state.party[1].maxHp;
  echoes(state, true);
  state.enemies[0].hp = 0;
  let enemySelections = 0;
  for (let i = 0; i < 100; i++) {
    selectStaticStrike(state);
    if (state.storm.target !== 'boss') continue;
    enemySelections++;
    assert.equal(state.storm.enemyId, 'sentinel-1');
    assert.deepEqual([state.storm.x, state.storm.z], [state.enemies[1].x, state.enemies[1].z]);
  }
  assert.ok(enemySelections > 0);
});

test('Heracles strike charges for two seconds, grants twenty seconds, refreshes without stacking, and clears on death', () => {
  const state = combat(), actor = state.party[1], hp = actor.hp;
  state.storm.target = 'heracles';
  state.storm.charge = 2;
  stepGame(state, 1.95);
  assert.equal(actor.staticShock, 0);
  stepGame(state, .05);
  assert.equal(actor.staticShock, 20);
  assert.equal(actor.hp, hp);
  assert.equal(state.events.filter(event => event.kind === 'static_charge').length, 1);
  stepGame(state, .25);
  closeTo(actor.staticShock, 19.75);
  state.storm.charge = .05;
  stepGame(state, .05);
  assert.equal(actor.staticShock, 20);
  actor.hp = 1;
  attackHeracles(state);
  assert.equal(actor.hp, 0);
  assert.equal(actor.staticShock, 0);
  assert.equal(state.events.filter(event => event.source === 'static_retaliation').length, 0, 'a lethal hit cannot be answered after death');
});

test('successful boss hits retaliate once as lightning magic with triple damage enmity before Iron Resolve', () => {
  for (const divine of [false, true]) {
    const state = combat(), actor = state.party[1], hp = state.boss.hp;
    actor.staticShock = 20;
    actor.sonOfZeus = divine;
    actor.criticalCharges = 5;
    const rng = state.rng;
    attackHeracles(state);
    const hit = state.events.find(event => event.source === 'static_retaliation')!;
    assert.equal(hit.kind, 'magic');
    assert.equal(hit.actor, 1);
    assert.equal(hit.enemyId, 'boss');
    assert.equal(hit.element, 'lightning');
    assert.equal(hit.value, 180);
    assert.equal(state.boss.hp, hp - 180);
    assert.equal(state.runStats.party[1].damage, 180);
    closeTo(actor.ce, 180 * .65 * 3 * (divine ? 1.3 : 2.5));
    closeTo(actor.ve, 180 * .8 * 3 * (divine ? 1.3 : 2.5));
    assert.equal(actor.criticalCharges, 5, 'Static Shock does not consume Fearless charges');
    assert.equal(state.rng, rng);
    assert.equal(state.events.filter(event => event.source === 'static_retaliation').length, 1);
  }
});

test('add attacks retaliate against their exact attacker even when Heracles selects the boss', () => {
  const state = combat();
  echoes(state);
  state.party[1].staticShock = 20;
  state.party[1].enemyTarget = 'boss';
  state.enemies[0].attackTimer = 0;
  const bossHp = state.boss.hp;
  stepGame(state, .05);
  assert.equal(state.party[1].hp, state.party[1].maxHp - 77);
  assert.equal(state.enemies[0].hp, 8820);
  assert.equal(state.enemies[1].hp, 9000);
  assert.equal(state.boss.hp, bossHp);
  assert.equal(state.events.find(event => event.source === 'static_retaliation')?.enemyId, 'echo-0');
  assert.equal(state.runStats.party[1].damage, 180);
});

test('lethal raid retaliation stops later raid victims in Crown victory and Logos collapse', () => {
  for (const logos of [false, true]) {
    const state = combat();
    if (logos) echoes(state);
    state.party[1].staticShock = 20;
    state.boss.hp = 150;
    state.boss.cast = { name: 'Lethal counter test raid', kind: 'raid', x: 0, z: -4, radius: 100, angle: 0, total: 1, remaining: .05 };
    const laterHp = state.party.slice(2).map(actor => actor.hp);
    stepGame(state, .05);
    assert.equal(state.boss.hp, 0);
    assert.equal(state.status, logos ? 'fighting' : 'victory');
    if (logos) assert.equal(state.logos.stage, 'collapse');
    assert.deepEqual(state.party.slice(2).map(actor => actor.hp), laterHp, 'raid must stop when its attacker dies or transitions');
    assert.deepEqual(state.events.filter(event => event.kind === 'hit').map(event => event.actor), [0, 1]);
    assert.equal(state.events.find(event => event.source === 'static_retaliation')?.value, 150, 'credit actual damage rather than nominal overkill');
    assert.equal(state.runStats.party[1].damage, 150);
  }
});

test('evasion, Aegis, full absorption, expired charge and lethal damage suppress retaliation', () => {
  for (const scenario of ['evade', 'aegis', 'absorbed', 'expired', 'lethal'] as const) {
    const state = combat(), actor = state.party[1], hp = state.boss.hp;
    actor.staticShock = scenario === 'expired' ? .05 : 20;
    if (scenario === 'evade') actor.dodgeUntil = 10;
    if (scenario === 'aegis') actor.shieldCharges = 1;
    if (scenario === 'absorbed') actor.hpShield = 1000;
    if (scenario === 'lethal') actor.hp = 1;
    attackHeracles(state);
    assert.equal(state.events.filter(event => event.source === 'static_retaliation').length, 0, scenario);
    assert.equal(state.boss.hp, hp, scenario);
    assert.equal(state.runStats.party[1].damage, 0, scenario);
  }
  const partial = combat();
  partial.party[1].staticShock = 20;
  partial.party[1].hpShield = 100;
  partial.party[1].guardUntil = 10;
  attackHeracles(partial);
  assert.ok(partial.party[1].hp < partial.party[1].maxHp);
  assert.equal(partial.events.find(event => event.source === 'static_retaliation')?.value, 180, 'partial mitigation still leaves a damaging hit');
});

test('an enemy strike reflects six hundred after two seconds without requiring a charge and still arcs to the party', () => {
  const state = combat(), actor = state.party[1], hp = state.boss.hp;
  actor.x = 20;
  actor.criticalCharges = 5;
  state.storm.target = 'boss';
  state.storm.enemyId = 'boss';
  state.storm.charge = 2;
  stepGame(state, 1.95);
  assert.equal(state.boss.hp, hp);
  stepGame(state, .05);
  const reflect = state.events.find(event => event.source === 'static_reflect')!;
  assert.equal(reflect.value, 600);
  assert.equal(reflect.actor, 1);
  assert.equal(reflect.enemyId, 'boss');
  assert.equal(reflect.kind, 'magic');
  assert.equal(state.boss.hp, hp - 600);
  assert.equal(state.runStats.party[1].damage, 600);
  assert.equal(actor.ce, 2925);
  assert.equal(actor.ve, 3600);
  assert.equal(actor.staticShock, 0);
  assert.equal(actor.criticalCharges, 5);
  assert.equal(state.events.filter(event => event.kind === 'static_arc').length, 3);
  assert.equal(state.runStats.party.reduce((sum, stats) => sum + stats.taken, 0), 971);
});

test('environmental arcs never recurse into retaliation, arena lightning is harmless, and dead Heracles cannot reflect', () => {
  const arcs = combat();
  arcs.party[1].staticShock = 20;
  arcs.storm.target = 'boss';
  arcs.storm.charge = .05;
  stepGame(arcs, .05);
  assert.ok(arcs.party[1].hp < arcs.party[1].maxHp);
  assert.equal(arcs.events.filter(event => event.source === 'static_reflect').length, 1);
  assert.equal(arcs.events.filter(event => event.source === 'static_retaliation').length, 0);

  const arena = combat(), partyHp = arena.party.map(actor => actor.hp), bossHp = arena.boss.hp;
  arena.storm.target = 'arena';
  arena.storm.charge = .05;
  stepGame(arena, .05);
  assert.deepEqual(arena.party.map(actor => actor.hp), partyHp);
  assert.equal(arena.boss.hp, bossHp);
  assert.ok(arena.party.every(actor => actor.staticShock === 0));

  const dead = combat();
  dead.party[1].hp = 0;
  dead.storm.target = 'boss';
  dead.storm.charge = .05;
  const hp = dead.boss.hp;
  stepGame(dead, .05);
  assert.equal(dead.boss.hp, hp);
  assert.equal(dead.events.filter(event => event.source === 'static_reflect').length, 0);
});

test('enemy reflection targets an add and cannot damage immune Logos during the sentinel phase', () => {
  const state = combat();
  echoes(state, true);
  state.storm.target = 'boss';
  state.storm.enemyId = 'sentinel-0';
  state.storm.charge = .05;
  const hp = state.boss.hp;
  stepGame(state, .05);
  assert.equal(state.enemies[0].hp, 8400);
  assert.equal(state.enemies[1].hp, 9000);
  assert.equal(state.boss.hp, hp);
  assert.equal(state.events.find(event => event.source === 'static_reflect')?.enemyId, 'sentinel-0');

  const immune = combat();
  echoes(immune, true);
  immune.party[1].staticShock = 20;
  immune.storm.target = 'boss';
  immune.storm.enemyId = 'boss';
  immune.storm.charge = .05;
  const immuneHp = immune.boss.hp;
  stepGame(immune, .05);
  assert.equal(immune.boss.hp, immuneHp);
  assert.equal(immune.runStats.party[1].damage, 0);
  assert.equal(immune.events.filter(event => event.source === 'static_reflect' || event.source === 'static_retaliation').length, 0);
});

test('a charged enemy that dies before discharge or to reflection cannot arc from its corpse', () => {
  for (const hp of [0, 500]) {
    const state = combat();
    echoes(state);
    state.enemies[0].hp = hp;
    state.storm.target = 'boss';
    state.storm.enemyId = 'echo-0';
    state.storm.charge = .05;
    const partyHp = state.party.map(actor => actor.hp);
    stepGame(state, .05);
    assert.deepEqual(state.party.map(actor => actor.hp), partyHp);
    assert.equal(state.events.filter(event => event.kind === 'static_arc').length, 0);
    assert.equal(state.runStats.party[1].damage, hp);
  }
});

test('Static Shock timers and pending strike saves replay identically across time partitions', () => {
  const state = combat();
  state.party[1].staticShock = 20;
  state.storm.target = 'heracles';
  state.storm.charge = 1.5;
  state.storm.remaining = 18;
  const restored = restoreSave(state);
  assert.ok(restored, 'new fields and pending charge form a valid save');
  for (let i = 0; i < 100; i++) {
    stepGame(state, .1);
    stepGame(restored, .03);
    stepGame(restored, .07);
  }
  assert.deepEqual(state, restored);
  closeTo(state.party[1].staticShock, 11.5);
  state.storm.remaining = restored.storm.remaining = 25;
  stepGame(state, 11.5);
  stepGame(restored, 11.5);
  assert.deepEqual(state, restored);
  closeTo(state.party[1].staticShock, 0);
  state.storm.remaining = restored.storm.remaining = .05;
  for (let i = 0; i < 300; i++) {
    stepGame(state, .1);
    stepGame(restored, .03);
    stepGame(restored, .07);
  }
  assert.deepEqual(state, restored, 'saved storm RNG reproduces later random targets and intervals too');
  assert.ok(state.events.some(event => event.kind === 'static_strike'));
});

test('legacy saves receive additive storm and charge defaults without rewriting malformed supplied values', () => {
  const old = structuredClone(combat());
  old.party.forEach(actor => Reflect.deleteProperty(actor, 'staticShock'));
  for (const key of ['target', 'x', 'z', 'enemyId']) Reflect.deleteProperty(old.storm, key);
  old.storm.remaining = 240;
  old.storm.charge = 1;
  const before = structuredClone(old), restored = restoreSave(old);
  assert.ok(restored);
  assert.ok(restored.party.every(actor => actor.staticShock === 0));
  assert.equal(restored.storm.target, 'boss');
  assert.equal(restored.storm.enemyId, 'boss');
  assert.equal(restored.storm.remaining, 25);
  assert.equal(restored.storm.charge, 1);
  assert.deepEqual(old, before, 'migration acts on a detached copy');

  for (const value of [-1, NaN, Infinity, 20.1, '20']) {
    const bad = combat();
    Reflect.set(bad.party[1], 'staticShock', value);
    assert.equal(restoreSave(bad), null, String(value));
  }
  const wrongActor = combat();
  wrongActor.party[0].staticShock = 1;
  assert.equal(validSave(wrongActor), false);
  const partialLegacy = combat();
  Reflect.deleteProperty(partialLegacy.storm, 'target');
  partialLegacy.storm.x = NaN;
  assert.equal(restoreSave(partialLegacy), null, 'missing target cannot authorize replacing an explicitly malformed coordinate');
  const oldThreat = combat();
  oldThreat.party[3].ce = oldThreat.party[3].ve = 10000;
  const migratedThreat = restoreSave(oldThreat);
  assert.ok(migratedThreat);
  assert.equal(migratedThreat.party[3].ce, 5000);
  assert.equal(migratedThreat.party[3].ve, 5000);
  for (const key of ['ce', 've'] as const) for (const value of [-1, 10001]) {
    const bad = combat();
    bad.party[3][key] = value;
    assert.equal(restoreSave(bad), null, `malformed legacy ${key}=${value}`);
  }
  for (const [key, value] of [['target', 'party'], ['x', NaN], ['enemyId', 'missing'], ['charge', 3], ['remaining', 301], ['rng', -1]] as const) {
    const bad = combat();
    Reflect.set(bad.storm, key, value);
    assert.equal(restoreSave(bad), null, key);
  }
});
