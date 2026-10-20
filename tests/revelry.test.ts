import assert from 'node:assert/strict';
import test from 'node:test';
import { ATTACK_BASELINE, canUseActionRole, getAttackStats, GOD_ENRAGE_TIME, REVELRY, ROLES } from '../game/content.ts';
import { applyAction, createGame, setHuman, stepGame } from '../game/engine.ts';
import type { GameState, Mode } from '../game/types.ts';

function combat(mode: Mode = 'trial') {
  const state = createGame(mode);
  for (let i = 0; i < state.party.length; i++) {
    setHuman(state, i, true);
    state.party[i].x = i * 0.2;
    state.party[i].z = -1;
    state.party[i].attackTimer = 10000;
  }
  applyAction(state, 0, { type: 'start' });
  state.boss.attackTimer = state.boss.specialTimer = 10000;
  return state;
}

function advance(state: GameState, seconds: number) {
  while (seconds > 0) {
    const dt = Math.min(seconds, 30);
    stepGame(state, dt);
    seconds -= dt;
  }
}

function hit(state: GameState, slot: number) {
  const actor = state.party[slot];
  state.boss.cast = { name: 'Revelry test hit', kind: 'circle', x: actor.x, z: actor.z, radius: 0.05, angle: 0, remaining: 0.05, total: 3 };
  stepGame(state, 0.05);
}

test('Revelry grants one independent stack to every living ally regardless of range', () => {
  const state = combat();
  assert.deepEqual(state.party.map(p => p.revelryStacks), [0, 0, 0, 0, 0]);
  state.party[1].revelryStacks = 3;
  state.party[2].hp = 0;
  state.party[4].x = 20;
  const mp = state.party[0].mp, tp = state.party[0].tp;
  assert.equal(applyAction(state, 0, { type: 'revelry' }).ok, true);
  assert.deepEqual(state.party.map(p => p.revelryStacks), [1, 4, 0, 1, 1]);
  assert.equal(state.party[0].cooldowns.revelry, REVELRY.cooldown);
  assert.equal(state.party[0].mp, mp);
  assert.equal(state.party[0].tp, tp);
  assert.equal(state.events.at(-1)?.kind, 'revelry');
});

test('Revelry rejects recasts before 45 seconds and caps each recipient at five', () => {
  const state = combat();
  applyAction(state, 0, { type: 'revelry' });
  advance(state, 44.95);
  const before = JSON.stringify(state);
  assert.equal(applyAction(state, 0, { type: 'revelry' }).ok, false);
  assert.equal(JSON.stringify(state), before);
  stepGame(state, 0.05);
  assert.equal(applyAction(state, 0, { type: 'revelry' }).ok, true);
  for (let cast = 0; cast < 5; cast++) {
    advance(state, REVELRY.cooldown);
    assert.equal(applyAction(state, 0, { type: 'revelry' }).ok, true);
  }
  assert.ok(state.party.every(p => p.revelryStacks === REVELRY.maxStacks));
  assert.equal(state.events.filter(e => e.kind === 'revelry').length, 7);
});

test('attacking and waiting never acquire Revelry stacks', () => {
  const state = combat();
  applyAction(state, 0, { type: 'revelry' });
  state.party[0].attackTimer = 0;
  advance(state, 12);
  assert.ok(state.events.some(e => e.kind === 'auto' && e.actor === 0));
  assert.ok(state.party.every(p => p.revelryStacks === 1));
  advance(state, 45);
  assert.ok(state.party.every(p => p.revelryStacks === 1));
});

test('only Bacchus can grant Revelry during a live encounter', () => {
  for (let slot = 0; slot < 5; slot++) {
    const state = combat();
    assert.equal(canUseActionRole(state.party[slot].role, 'revelry'), slot === 0);
    const before = JSON.stringify(state);
    assert.equal(applyAction(state, slot, { type: 'revelry' }).ok, slot === 0);
    if (slot !== 0) assert.equal(JSON.stringify(state), before);
  }
  for (const scenario of ['ready', 'dead', 'victory', 'defeat', 'other-vanguard']) {
    const state = scenario === 'ready' ? createGame() : combat();
    if (scenario === 'dead') state.party[0].hp = 0;
    if (scenario === 'victory' || scenario === 'defeat') state.status = scenario;
    if (scenario === 'other-vanguard') state.party[0].id = 'someone-else';
    const before = JSON.stringify(state);
    assert.equal(applyAction(state, 0, { type: 'revelry' }).ok, false, scenario);
    assert.equal(JSON.stringify(state), before, scenario);
  }
});

test('a damaging hit clears only its recipient, including Bacchus and guarded recipients', () => {
  for (const slot of [0, 1, 3]) {
    const state = combat();
    for (const actor of state.party) actor.revelryStacks = 3;
    if (slot === 1) applyAction(state, slot, { type: 'guard' });
    hit(state, slot);
    assert.ok(state.party[slot].hp < state.party[slot].maxHp);
    assert.deepEqual(state.party.map(p => p.revelryStacks), state.party.map((_, i) => i === slot ? 0 : 3));
    const lost = state.events.filter(e => e.kind === 'revelry_lost');
    assert.equal(lost.length, 1);
    assert.equal(lost[0].actor, slot);
    assert.equal(lost[0].value, 3);
  }
});

test('evades preserve Revelry; the next cast replenishes only one stack after a hit', () => {
  const state = combat();
  for (const actor of state.party) actor.revelryStacks = 4;
  applyAction(state, 2, { type: 'dodge' });
  hit(state, 2);
  assert.equal(state.party[2].hp, state.party[2].maxHp);
  assert.equal(state.party[2].revelryStacks, 4);
  assert.ok(state.events.some(e => e.kind === 'evade' && e.actor === 2));
  stepGame(state, 0.65);
  hit(state, 2);
  assert.equal(state.party[2].revelryStacks, 0);
  applyAction(state, 0, { type: 'revelry' });
  assert.deepEqual(state.party.map(p => p.revelryStacks), [5, 5, 1, 5, 5]);
});

test('ordinary death and Coherence Collapse clear affected Revelry stacks', () => {
  const state = combat();
  state.party[2].hp = 1;
  state.party[2].revelryStacks = 5;
  hit(state, 2);
  assert.equal(state.party[2].hp, 0);
  assert.equal(state.party[2].revelryStacks, 0);
  const god = combat('god');
  god.combatTime = GOD_ENRAGE_TIME - 0.05;
  for (const actor of god.party) { actor.revelryStacks = 5; actor.dodgeUntil = 1000; }
  stepGame(god, 0.05);
  assert.equal(god.status, 'defeat');
  assert.ok(god.party.every(p => p.hp === 0 && p.revelryStacks === 0));
});

test('a raid clears each damaged recipient independently while an evading ally retains stacks', () => {
  const state = combat();
  for (const actor of state.party) actor.revelryStacks = 3;
  applyAction(state, 0, { type: 'guard' });
  applyAction(state, 2, { type: 'dodge' });
  state.boss.cast = { name: 'Terminal Pulse', kind: 'raid', x: 0, z: -4, radius: 100, angle: 0, remaining: 0.05, total: 4 };
  stepGame(state, 0.05);
  assert.deepEqual(state.party.map(p => p.revelryStacks), [0, 0, 3, 0, 0]);
  assert.equal(state.party[0].maxHp - state.party[0].hp, 91);
  assert.equal(state.party[2].hp, state.party[2].maxHp);
});

test('Bacchus trust uses the same cooldown and replay stays deterministic', () => {
  const a = combat();
  a.party[1].engaged = true;
  setHuman(a, 0, false);
  const b = JSON.parse(JSON.stringify(a)) as GameState;
  for (let i = 0; i < 460; i++) {
    stepGame(a, 0.1);
    stepGame(b, 0.03);
    stepGame(b, 0.07);
  }
  assert.deepEqual(a, b);
  assert.equal(a.events.filter(e => e.kind === 'revelry').length, 2);
  assert.ok(a.party.every(p => p.revelryStacks === 2));
  assert.ok(a.party[0].cooldowns.revelry > 43 && a.party[0].cooldowns.revelry <= 45);
  const ready = createGame();
  setHuman(ready, 0, false);
  stepGame(ready, 10);
  assert.equal(ready.status, 'ready');
  assert.ok(ready.party.every(p => p.revelryStacks === 0));
});

test('Revelry adds flat attack stats rather than a stored percentage or flat final damage', () => {
  const actor = createGame().party[0];
  assert.equal(ATTACK_BASELINE, 100);
  assert.deepEqual(getAttackStats(actor), { patk: 100, matk: 100 });
  actor.revelryStacks = 1;
  assert.deepEqual(getAttackStats(actor), { patk: 105, matk: 105 });
  actor.revelryStacks = 5;
  assert.deepEqual(getAttackStats(actor), { patk: 125, matk: 125 });
  const original = { ...ROLES.vanguard };
  try {
    ROLES.vanguard.patk = 200;
    ROLES.vanguard.matk = 150;
    assert.deepEqual(getAttackStats(actor), { patk: 225, matk: 175 });
  } finally {
    Object.assign(ROLES.vanguard, original);
  }
});

test('autos and weaponskills scale with Physical attack and generate hate from actual damage', () => {
  const state = combat();
  applyAction(state, 0, { type: 'revelry' });
  state.party[0].attackTimer = 0;
  const before = state.boss.hp;
  stepGame(state, 0.05);
  assert.equal(before - state.boss.hp, 118, '112 base damage at 105 Physical attack rounds to118, not117');
  assert.equal(state.party[0].ce, 1 + 118 * 0.65);
  state.party[0].tp = 1000;
  assert.equal(applyAction(state, 0, { type: 'weapon', id: 'cleave' }).ok, true);
  assert.equal(state.events.at(-1)?.value, 693, '660 base damage at105 Physical attack');
  assert.equal(state.party[0].revelryStacks, 1);
});

test('closer and mage use their own stacks once for skillchains and Magic Bursts', () => {
  const state = combat();
  state.party[2].revelryStacks = 2;
  state.party[3].revelryStacks = 5;
  for (const slot of [0, 2]) { state.party[slot].tp = 1000; state.party[slot].engaged = true; }
  applyAction(state, 0, { type: 'weapon', id: 'cleave' });
  stepGame(state, 1.5);
  applyAction(state, 2, { type: 'weapon', id: 'pierce' });
  assert.equal(state.events.find(e => e.kind === 'weapon' && e.actor === 2)?.value, 770);
  assert.equal(state.events.find(e => e.kind === 'chain')?.value, 693, '630 chain base scales once, not from already boosted770 weaponskill');
  applyAction(state, 3, { type: 'magic', element: 'fire' });
  assert.equal(state.events.at(-1)?.value, 1275);
  assert.equal(state.events.at(-1)?.kind, 'burst');
  state.party[3].cooldowns.magic = 0;
  applyAction(state, 3, { type: 'magic', element: 'ice' });
  assert.equal(state.events.at(-1)?.value, 313);
  assert.equal(state.events.at(-1)?.kind, 'magic');
});

test('physical and magical damage channels stay distinct when role attack bases differ', () => {
  const hunter = { ...ROLES.hunter }, arcanist = { ...ROLES.arcanist };
  try {
    ROLES.hunter.patk = ROLES.arcanist.patk = 200;
    ROLES.hunter.matk = ROLES.arcanist.matk = 150;
    const state = combat();
    state.party[2].revelryStacks = state.party[3].revelryStacks = 1;
    for (const slot of [0, 2]) { state.party[slot].tp = 1000; state.party[slot].engaged = true; }
    applyAction(state, 0, { type: 'weapon', id: 'cleave' });
    stepGame(state, 1.5);
    applyAction(state, 2, { type: 'weapon', id: 'pierce' });
    assert.equal(state.events.find(e => e.kind === 'weapon' && e.actor === 2)?.value, 1435, '700 ×205 Physical attack /100');
    assert.equal(state.events.find(e => e.kind === 'chain')?.value, 977, '630 ×155 Magic attack /100');
    applyAction(state, 3, { type: 'magic', element: 'fire' });
    assert.equal(state.events.at(-1)?.value, 1581, '1020 ×155 Magic attack /100');
  } finally {
    Object.assign(ROLES.hunter, hunter);
    Object.assign(ROLES.arcanist, arcanist);
  }
});

test('Revelry does not increase healing or mitigation', () => {
  const state = combat();
  state.party[4].revelryStacks = 5;
  state.party[0].hp -= 1000;
  applyAction(state, 4, { type: 'heal' });
  assert.equal(state.events.at(-1)?.value, 690);
  assert.equal(state.party[4].revelryStacks, 5);
  hit(state, 4);
  assert.equal(state.party[4].maxHp - state.party[4].hp, 740);
});
