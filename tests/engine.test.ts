import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createGame, isInTelegraph, setHuman, stepGame } from '../game/engine.ts';
import { ARENA_RADIUS, CHAIN_MIN_DELAY, WEAPONS } from '../game/content.ts';
import type { Action, GameState, Mode } from '../game/types.ts';

/** Controlled fixtures disable autonomous allies without bypassing action validation. */
function combat() {
  const state = createGame();
  for (let i = 0; i < 5; i++) {
    setHuman(state, i, true);
    state.party[i].x = i * 0.2;
    state.party[i].z = -1;
    state.party[i].attackTimer = 100;
  }
  applyAction(state, 0, { type: 'start' });
  state.boss.attackTimer = 100;
  state.boss.specialTimer = 100;
  return state;
}

function arm(state: GameState, slot: number) {
  const actor = state.party[slot];
  actor.tp = 1000;
  actor.engaged = true;
  actor.cooldowns.weapon = 0;
}

test('ready party follows without pulling; engage starts auto attacks and TP; cap is 3000', () => {
  const state = createGame();
  stepGame(state, 20);
  assert.equal(state.status, 'ready');
  assert.equal(state.boss.hp, state.boss.maxHp);
  assert.ok(state.party.every(p => p.tp === 0 && !p.engaged));
  state.party[0].x = 0; state.party[0].z = -1;
  assert.equal(applyAction(state, 0, { type: 'engage' }).ok, true);
  stepGame(state, 0.05);
  assert.equal(state.status, 'fighting');
  assert.ok(state.party[0].tp > 0);
  assert.ok(state.boss.hp < state.boss.maxHp);
  state.party[0].tp = 2999; state.party[0].attackTimer = 0;
  stepGame(state, 0.05);
  assert.equal(state.party[0].tp, 3000);
});

test('movement normalizes diagonals, accepts independent facing, and clamps arena radius', () => {
  const state = createGame();
  const actor = state.party[0];
  const x = actor.x, z = actor.z;
  applyAction(state, 0, { type: 'move', x: 1, z: 1, facing: Math.PI });
  stepGame(state, 1);
  assert.ok(Math.abs(Math.hypot(actor.x - x, actor.z - z) - 6) < 1e-6);
  assert.ok(Math.abs(Math.abs(actor.facing) - Math.PI) < 1e-6);
  stepGame(state, 20);
  assert.ok(Math.hypot(actor.x, actor.z) <= ARENA_RADIUS + 1e-8);
  applyAction(state, 0, { type: 'move', x: 0, z: 0, facing: 1.2 });
  assert.ok(Math.abs(actor.facing - 1.2) < 1e-10);
});

test('malformed actions, slots, time deltas and inherited weapon keys cannot mutate state', () => {
  const state = combat();
  const bad: unknown[] = [null, [], {}, { type: 'dance' }, { type: 'move', x: NaN, z: 0 }, { type: 'move', x: Infinity, z: 0 }, { type: 'move', x: 0, z: 0, facing: NaN }, { type: 'move', x: 1e10, z: 0 }, { type: 'move', x: '1', z: 0 }, { type: 'weapon', id: '__proto__' }, { type: 'weapon', id: 'toString' }, { type: 'magic', element: 'constructor' }];
  for (const action of bad) {
    const before = JSON.stringify(state);
    assert.equal(applyAction(state, 0, action as Action).ok, false, JSON.stringify(action));
    assert.equal(JSON.stringify(state), before);
  }
  for (const slot of [-1, 5, 1.5, NaN, Infinity]) assert.equal(applyAction(state, slot, { type: 'guard' }).ok, false);
  const before = JSON.stringify(state);
  for (const dt of [-1, NaN, Infinity, 31]) stepGame(state, dt);
  assert.equal(JSON.stringify(state), before);
});

test('weaponskill checks TP, range, engagement and cooldown before spending all TP', () => {
  const state = combat();
  assert.equal(applyAction(state, 0, { type: 'weapon', id: 'cleave' }).ok, false);
  arm(state, 0);
  state.party[0].z = 20;
  assert.equal(applyAction(state, 0, { type: 'weapon', id: 'cleave' }).ok, false);
  assert.equal(state.party[0].tp, 1000);
  state.party[0].z = -1;
  state.party[0].engaged = false;
  assert.equal(applyAction(state, 0, { type: 'weapon', id: 'cleave' }).ok, false);
  state.party[0].engaged = true;
  state.party[0].tp = 2500;
  assert.equal(applyAction(state, 0, { type: 'weapon', id: 'cleave' }).ok, true);
  assert.equal(state.party[0].tp, 0);
  assert.equal(state.chain?.property, 'Liquefaction');
  state.party[0].tp = 1000;
  assert.equal(applyAction(state, 0, { type: 'weapon', id: 'pierce' }).ok, false);
  assert.equal(state.party[0].tp, 1000);
});

test('each documented two-actor sequence creates its matching chain and burst element', () => {
  for (const [open, close, property, element] of [
    ['cleave', 'pierce', 'Fusion', 'fire'], ['pierce', 'resonance', 'Distortion', 'ice'], ['resonance', 'cleave', 'Fragmentation', 'lightning'],
  ] as const) {
    const state = combat(); arm(state, 0); arm(state, 2);
    applyAction(state, 0, { type: 'weapon', id: open });
    stepGame(state, CHAIN_MIN_DELAY);
    applyAction(state, 2, { type: 'weapon', id: close });
    assert.equal(state.chain?.property, property);
    assert.equal(state.burst?.element, element);
    assert.equal(state.events.filter(e => e.kind === 'chain').length, 1);
  }
});

test('same actor, too-early closer and expired window do not produce skillchains', () => {
  for (const scenario of ['same', 'early', 'late']) {
    const state = combat(); arm(state, 0); arm(state, 2);
    applyAction(state, 0, { type: 'weapon', id: 'cleave' });
    stepGame(state, scenario === 'early' ? 1 : scenario === 'late' ? 8 : 2);
    const slot = scenario === 'same' ? 0 : 2;
    arm(state, slot);
    applyAction(state, slot, { type: 'weapon', id: 'pierce' });
    assert.equal(state.events.filter(e => e.kind === 'chain').length, 0, scenario);
    assert.equal(state.burst, null, scenario);
  }
});

test('matching magic bursts, wrong element does ordinary damage, and burst expiration works', () => {
  const state = combat(); arm(state, 0); arm(state, 2);
  applyAction(state, 0, { type: 'weapon', id: 'cleave' });
  stepGame(state, 1.5);
  applyAction(state, 2, { type: 'weapon', id: 'pierce' });
  let before = state.boss.hp;
  applyAction(state, 3, { type: 'magic', element: 'ice' });
  assert.equal(before - state.boss.hp, 250);
  before = state.boss.hp;
  applyAction(state, 4, { type: 'magic', element: 'fire' });
  assert.equal(before - state.boss.hp, 1020);
  assert.equal(state.events.at(-1)?.kind, 'burst');
  stepGame(state, 8);
  assert.equal(state.burst, null);
  before = state.boss.hp;
  applyAction(state, 4, { type: 'magic', element: 'fire' });
  assert.equal(before - state.boss.hp, 250);
});

test('volatile enmity decays; Provoke changes target; damage taken erodes cumulative enmity', () => {
  const state = combat();
  state.party[0].ce = 600; state.party[0].ve = 200;
  state.party[1].engaged = true;
  applyAction(state, 1, { type: 'provoke' });
  stepGame(state, 0.05);
  assert.equal(state.boss.target, 1);
  const ce = state.party[1].ce, ve = state.party[1].ve;
  stepGame(state, 1);
  assert.equal(state.party[1].ce, ce);
  assert.ok(Math.abs(ve - state.party[1].ve - 120) < 1e-6);
  state.boss.attackTimer = 0;
  stepGame(state, 0.05);
  assert.ok(state.party[1].ce < ce);
  assert.ok(state.party[1].hp < state.party[1].maxHp);
});

test('healing prioritizes low health, generates hate, costs MP and cannot resurrect', () => {
  const state = combat();
  state.party[0].hp -= 800;
  state.party[1].hp = 200;
  state.party[2].hp = 0;
  const mp = state.party[4].mp;
  applyAction(state, 4, { type: 'heal' });
  assert.equal(state.party[1].hp, 890);
  assert.equal(state.party[2].hp, 0);
  assert.equal(state.party[4].mp, mp - 70);
  assert.ok(state.party[4].ce > 0 && state.party[4].ve > 0);
  assert.equal(applyAction(state, 4, { type: 'heal' }).ok, false);
});

test('telegraph geometry agrees with resolution; guard mitigates a raid; fallen actors cannot act', () => {
  const state = combat();
  const circle = { name: 'Test', kind: 'circle' as const, x: 0, z: 0, radius: 3, angle: 0, remaining: 0.05, total: 3 };
  assert.equal(isInTelegraph({ x: 3, z: 0 }, circle), true);
  assert.equal(isInTelegraph({ x: 3.01, z: 0 }, circle), false);
  const cone = { ...circle, kind: 'cone' as const, radius: 12 };
  assert.equal(isInTelegraph({ x: 0, z: 5 }, cone), true);
  assert.equal(isInTelegraph({ x: 0, z: -5 }, cone), false);
  state.boss.cast = { ...circle, kind: 'raid', radius: 100 };
  applyAction(state, 0, { type: 'guard' });
  state.party[2].hp = 100;
  stepGame(state, 0.05);
  assert.equal(state.party[0].maxHp - state.party[0].hp, 91);
  assert.equal(state.party[1].maxHp - state.party[1].hp, 260);
  assert.equal(state.party[2].hp, 0);
  assert.equal(applyAction(state, 2, { type: 'heal' }).ok, false);
});

test('trust replacement changes only chosen slot and zeroes stale movement', () => {
  const state = createGame();
  const other = JSON.stringify(state.party[2]);
  state.party[1].moveX = 1;
  setHuman(state, 1, true);
  assert.equal(state.party[1].human, true);
  assert.equal(state.party[1].moveX, 0);
  assert.equal(JSON.stringify(state.party[2]), other);
  applyAction(state, 1, { type: 'move', x: 1, z: 0 });
  setHuman(state, 1, true);
  assert.equal(state.party[1].moveX, 1, 'idempotent human synchronization preserves current input');
  setHuman(state, 1, false);
  assert.equal(state.party[1].moveX, 0);
  assert.equal(state.party[1].human, false);
});

test('fixed-step replay is deterministic across elapsed-time partitions and JSON save roundtrip', () => {
  const a = combat(), b = JSON.parse(JSON.stringify(a)) as GameState;
  applyAction(a, 0, { type: 'move', x: 1, z: 0 });
  applyAction(b, 0, { type: 'move', x: 1, z: 0 });
  for (let i = 0; i < 200; i++) stepGame(a, 0.05);
  for (let i = 0; i < 100; i++) { stepGame(b, 0.03); stepGame(b, 0.07); }
  assert.deepEqual(a, b);
});

function simulate(mode: Mode) {
  const state = createGame(mode);
  applyAction(state, 0, { type: 'start' });
  let chains = 0, bursts = 0, seen = 0, phases = 0;
  for (let i = 0; i < 18000 && state.status === 'fighting'; i++) {
    const actor = state.party[0], boss = state.boss;
    let dx = boss.x - actor.x, dz = boss.z - actor.z;
    if (Math.hypot(dx, dz) < 3.5) dx = dz = 0;
    if (boss.cast && isInTelegraph(actor, boss.cast)) {
      if (boss.cast.kind === 'raid') applyAction(state, 0, { type: 'guard' });
      else if (boss.cast.kind === 'cone') { dx = Math.cos(boss.cast.angle) * 8; dz = -Math.sin(boss.cast.angle) * 8; }
      else { dx = actor.x - boss.cast.x; dz = actor.z - boss.cast.z; if (Math.hypot(dx, dz) < 0.1) dx = 1; }
    }
    const length = Math.max(1, Math.hypot(dx, dz));
    applyAction(state, 0, { type: 'move', x: dx / length, z: dz / length });
    if (actor.tp >= 1000 && (!state.chain || (state.chain.opener !== 0 && state.time - state.chain.openedAt >= 1.8))) {
      applyAction(state, 0, { type: 'weapon', id: state.chain ? WEAPONS[state.chain.weapon].next : 'cleave' });
    }
    if (actor.hp < actor.maxHp * 0.45) applyAction(state, 0, { type: 'heal' });
    stepGame(state, 0.05);
    for (const e of state.events.filter(e => e.id > seen)) {
      if (e.kind === 'chain') chains++;
      if (e.kind === 'burst') bursts++;
      if (e.kind === 'phase') phases++;
      seen = e.id;
    }
    for (const p of state.party) {
      assert.ok(Number.isFinite(p.hp + p.mp + p.tp + p.x + p.z + p.ce + p.ve));
      assert.ok(p.hp >= 0 && p.hp <= p.maxHp && p.tp >= 0 && p.tp <= 3000);
      assert.ok(Math.hypot(p.x, p.z) <= ARENA_RADIUS + 1e-8);
    }
  }
  return { state, chains, bursts, phases };
}

test('one player plus four trusts sustain the complete trial and god encounter loops', (t) => {
  for (const mode of ['trial', 'god'] as const) {
    const { state, chains, bursts, phases } = simulate(mode);
    assert.equal(state.status, 'victory', `${mode} failed at ${state.time}s`);
    t.diagnostic(`${mode}: victory in ${state.time.toFixed(2)}s, ${chains} skillchains, ${bursts} magic bursts, ${phases + 1} phases`);
    assert.ok(state.time >= (mode === 'trial' ? 100 : 300) && state.time < (mode === 'trial' ? 180 : 500), `${mode}: ${state.time}s`);
    assert.ok(chains > 10 && bursts > 8);
    assert.equal(phases, 2);
    assert.equal(state.boss.hp, 0);
    assert.equal(state.boss.cast, null);
    const before = JSON.stringify(state);
    assert.equal(applyAction(state, 0, { type: 'weapon', id: 'cleave' }).ok, false);
    stepGame(state, 1);
    assert.equal(JSON.stringify(state), before);
  }
});

test('party wipe closes the encounter and events remain bounded', () => {
  const state = combat();
  for (const actor of state.party) actor.hp = 1;
  state.boss.cast = { name: 'Wipe', kind: 'raid', x: 0, z: 0, radius: 100, angle: 0, total: 1, remaining: 0.05 };
  stepGame(state, 0.05);
  assert.equal(state.status, 'defeat');
  assert.ok(state.party.every(p => p.hp === 0 && !p.engaged));
  assert.equal(state.events.at(-1)?.kind, 'defeat');
  const trial = simulate('trial').state;
  assert.ok(trial.events.length <= 60);
  assert.ok(trial.eventSeq > 60);
});
