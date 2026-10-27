import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createGame, setHuman, stepGame } from '../game/engine.ts';
import type { Action, Mode } from '../game/types.ts';

function combat(mode: Mode = 'trial') {
  const state = createGame(mode, 8);
  state.party.forEach((actor, slot) => {
    setHuman(state, slot, true);
    actor.x = slot * .2;
    actor.z = -1;
    actor.engaged = true;
    actor.attackTimer = 10000;
  });
  assert.equal(applyAction(state, 0, { type: 'start' }).ok, true);
  state.boss.attackTimer = state.boss.specialTimer = 10000;
  state.storm.remaining = 10000;
  return state;
}

test('DPS weaponskills spend the pre-hit TP, then refund their passive TP without becoming Magic Bursts', () => {
  for (const slot of [0, 2]) {
    const state = combat(), actor = state.party[slot];
    actor.tp = 2500;
    state.burst = { element: 'fire', remaining: 8 };
    assert.equal(applyAction(state, slot, { type: 'weapon', id: 'cleave' }).ok, true);
    const hit = state.events.at(-1)!;
    assert.equal(actor.tp, 200, 'Dolos Store TP applies to his 160 TP passive');
    assert.equal(hit.kind, 'weapon');
    assert.equal(hit.element, 'fire');
    assert.equal(hit.value, Math.round(660 * 1.375 * (slot === 0 ? 1.35 : 1.2) * (hit.critical ? 1.5 : 1)));
    assert.equal(state.burst.element, 'fire');
  }

  const tank = combat();
  tank.party[1].tp = 1000;
  assert.equal(applyAction(tank, 1, { type: 'weapon', id: 'cleave' }).ok, true);
  assert.equal(tank.party[1].tp, 0, 'the DPS refund does not apply to Heracles');
  const hit = tank.events.at(-1)!;
  assert.equal(hit.value, 660 * (hit.critical ? 1.5 : 1));
});

test('a chain closer refunds only the weaponskill hit and leaves skillchain damage unmodified', () => {
  const state = combat();
  state.party[0].tp = state.party[2].tp = 1000;
  applyAction(state, 0, { type: 'weapon', id: 'cleave' });
  stepGame(state, 1.5);
  assert.equal(applyAction(state, 2, { type: 'weapon', id: 'pierce' }).ok, true);
  assert.equal(state.party[2].tp, 200, 'the chain is not a second ability hit');
  const weapon = state.events.findLast(event => event.kind === 'weapon')!;
  assert.equal(weapon.element, 'ice');
  assert.equal(weapon.value, Math.round(700 * 1.2 * (weapon.critical ? 1.5 : 1)));
  assert.equal(state.events.findLast(event => event.kind === 'chain')?.value, 630);
  assert.equal(state.burst?.element, 'fire');
});

test('Dash adds passive TP, Volley retains its existing per-hit TP, and both cap at 3000', () => {
  const dash = combat(), bacchus = dash.party[0];
  assert.equal(applyAction(dash, 0, { type: 'criticalDash' }).ok, true);
  stepGame(dash, .2);
  assert.equal(bacchus.tp, 440);
  stepGame(dash, 1);
  const dashHits = dash.events.filter(event => event.source === 'criticalDash' && event.kind === 'weapon');
  assert.equal(dashHits.length, 3);
  assert.ok(dashHits.every(event => event.value === 302 && event.element === 'fire' && event.critical));
  assert.equal(bacchus.tp, 1320);

  const volley = combat(), dolos = volley.party[2];
  dolos.shotElement = 'lightning';
  assert.equal(applyAction(volley, 2, { type: 'splitVolley' }).ok, true);
  stepGame(volley, .05);
  assert.equal(dolos.tp, 250, 'Volley retains its existing Store TP award without a second passive refund');
  stepGame(volley, 1);
  const arrows = volley.events.filter(event => event.source === 'splitVolley' && event.kind === 'weapon');
  assert.equal(arrows.length, 5);
  assert.ok(arrows.every(event => event.element === 'lightning' && event.value === (event.critical ? 86 : 58)));
  assert.equal(dolos.tp, 1250);

  for (const [slot, type] of [[0, 'criticalDash'], [2, 'splitVolley']] as const) {
    const capped = combat();
    capped.party[slot].tp = 2999;
    applyAction(capped, slot, { type });
    stepGame(capped, 1.2);
    assert.equal(capped.party[slot].tp, 3000);
  }
});

test('a missed Volley arrow earns no TP while a landed arrow receives the original Store TP award', () => {
  const state = combat(), actor = state.party[2];
  assert.equal(applyAction(state, 2, { type: 'splitVolley' }).ok, true);
  state.boss.x = 20;
  stepGame(state, .1);
  assert.equal(actor.tp, 0);
  assert.equal(actor.sequence?.landedHits, 0);
  state.boss.x = 0;
  stepGame(state, .15);
  assert.equal(actor.tp, 250);
  assert.equal(actor.sequence?.landedHits, 1);
});

test('Elemental Shot gains passive TP and elemental damage on both ordinary and matching burst hits', () => {
  for (const matching of [false, true]) {
    const state = combat(), actor = state.party[2];
    actor.shotElement = 'ice';
    state.burst = { element: matching ? 'ice' : 'fire', remaining: 8 };
    assert.equal(applyAction(state, 2, { type: 'elementalShot' }).ok, true);
    const hit = state.events.at(-1)!;
    assert.equal(hit.kind, matching ? 'burst' : 'magic');
    assert.equal(hit.element, 'ice');
    assert.equal(hit.value, matching ? 936 : 276);
    assert.equal(actor.tp, 200);
    assert.equal(actor.mp, actor.maxMp - 35);
    const before = structuredClone(state);
    assert.equal(applyAction(state, 2, { type: 'elementalShot' }).ok, false);
    assert.deepEqual(state, before, 'rejected shots cannot grant TP or spend resources');
  }
});

test('autos, defensive commands, Rain of Fire and its burn do not acquire DPS ability passives', () => {
  const autos = combat();
  autos.party[0].attackTimer = autos.party[2].attackTimer = 0;
  stepGame(autos, .05);
  assert.equal(autos.party[0].tp, 360, 'seed 8 produces one base hit and one half-TP extra hit');
  assert.equal(autos.party[2].tp, 300);
  const arrow = autos.events.find(event => event.kind === 'auto' && event.actor === 2)!;
  assert.equal(arrow.value, arrow.critical ? 180 : 120);

  const state = combat(), actor = state.party[2];
  actor.tp = 123;
  assert.equal(applyAction(state, 2, { type: 'guard' }).ok, true);
  assert.equal(actor.tp, 123);
  state.ultimatesUnlocked = true;
  assert.equal(applyAction(state, 2, { type: 'rainOfFire' }).ok, true);
  assert.equal(state.events.find(event => event.source === 'rainOfFire' && event.kind === 'weapon')?.value, 6000);
  assert.equal(actor.tp, 123);
  stepGame(state, 3);
  assert.equal(state.events.filter(event => event.source === 'rainOfFireBurn').reduce((sum, event) => sum + (event.value ?? 0), 0), 1500);
  assert.equal(actor.tp, 123);
});

test('rejected damaging actions cannot claim passive TP', () => {
  for (const [slot, action] of [[0, { type: 'weapon', id: 'cleave' }], [0, { type: 'criticalDash' }], [2, { type: 'splitVolley' }], [2, { type: 'elementalShot' }]] as const) {
    const state = combat();
    state.party[slot].engaged = false;
    state.party[slot].tp = 1000;
    const before = structuredClone(state);
    assert.equal(applyAction(state, slot, action as Action).ok, false);
    assert.deepEqual(state, before);
  }
});

test('Revelry awards Bacchus 500 TP once per successful cast and respects the cap', () => {
  const state = combat(), actor = state.party[0];
  assert.equal(applyAction(state, 0, { type: 'revelry' }).ok, true);
  assert.equal(actor.tp, 500, 'the party-wide buff does not award TP per recipient');
  assert.deepEqual(state.party.slice(1).map(ally => ally.tp), [0, 0, 0, 0]);
  const before = structuredClone(state);
  assert.equal(applyAction(state, 0, { type: 'revelry' }).ok, false);
  assert.deepEqual(state, before);
  actor.cooldowns.revelry = 0;
  actor.tp = 2900;
  assert.equal(applyAction(state, 0, { type: 'revelry' }).ok, true);
  assert.equal(actor.tp, 3000);
});

test('Hecate earns half threat from actual damage and each threat gauge caps at 5000', () => {
  const state = combat(), hecate = state.party[3];
  assert.equal(applyAction(state, 3, { type: 'magic', element: 'fire' }).ok, true);
  assert.equal(state.events.at(-1)?.value, 250);
  assert.equal(hecate.ce, 81.25);
  assert.equal(hecate.ve, 100);

  const auto = combat(), mage = auto.party[3];
  mage.attackTimer = 0;
  stepGame(auto, .05);
  assert.equal(mage.ce, 46 * .65 * .5, 'the reduced threat also covers non-spell damage');
  assert.equal(mage.ve, 46 * .8 * .5);

  const capped = combat(), caster = capped.party[3];
  caster.ce = caster.ve = 4999;
  capped.ultimatesUnlocked = true;
  assert.equal(applyAction(capped, 3, { type: 'fission' }).ok, true);
  assert.equal(caster.ce, 5000);
  assert.equal(caster.ve, 5000);
});

test('Heracles gains normal-form threat in both difficulties while Son of Zeus keeps its own multiplier', () => {
  for (const mode of ['trial', 'god'] as const) {
    const normal = combat(mode);
    assert.equal(applyAction(normal, 1, { type: 'provoke' }).ok, true);
    assert.equal(normal.party[1].ce, 750);
    assert.equal(normal.party[1].ve, 7000);
    const divine = combat(mode);
    divine.party[1].sonOfZeus = true;
    assert.equal(applyAction(divine, 1, { type: 'provoke' }).ok, true);
    assert.equal(divine.party[1].ce, 390);
    assert.equal(divine.party[1].ve, 3640);
  }
});

test('boss and adds prefer Heracles on tied threat but higher threat still wins', () => {
  const state = combat();
  state.enemies = [{ id: 'echo', name: 'Echo', x: 5, z: -4, hp: 9000, maxHp: 9000, target: 0, attackTimer: 10000, stunRemaining: 0, burn: null }];
  state.party.forEach(actor => { actor.ce = actor.ve = 0; });
  state.party[0].ce = state.party[1].ce = 1000;
  stepGame(state, .05);
  assert.equal(state.boss.target, 1);
  assert.equal(state.enemies[0].target, 1);
  state.party[0].ce++;
  stepGame(state, .05);
  assert.equal(state.boss.target, 0);
  assert.equal(state.enemies[0].target, 0);
});

test('Dolos trust preserves MP for manual shots and still closes an available skillchain', () => {
  const state = combat();
  state.party[2].cooldowns.splitVolley = 45;
  state.burst = { element: 'ice', remaining: 8 };
  setHuman(state, 2, false);
  stepGame(state, .05);
  assert.equal(state.events.filter(event => event.source === 'elementalShot').length, 0);
  assert.equal(state.party[2].mp, state.party[2].maxMp);
  assert.equal(state.party[2].tp, 0);

  const close = combat();
  close.party[0].tp = close.party[2].tp = 1000;
  applyAction(close, 0, { type: 'weapon', id: 'cleave' });
  stepGame(close, 1.8);
  close.burst = { element: 'ice', remaining: 8 };
  setHuman(close, 2, false);
  stepGame(close, .05);
  assert.equal(close.chain?.property, 'Fusion');
  assert.equal(close.events.filter(event => event.source === 'elementalShot').length, 0);
  assert.equal(close.party[2].tp, 200);
});
