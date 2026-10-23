import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGame } from '../game/engine.ts';
import { combatNumber, CombatNumberPool, partyFeedback, PresentationEvents, type CombatEvent, type CombatNumber } from '../components/game/world-feedback.ts';
import { FloatingFeedback } from '../components/game/floating-feedback.ts';

function damage(id: number, time = 0): CombatEvent {
  return { id, time, kind: 'auto', text: 'A log is not a targeting API', actor: 0, value: 120 };
}

test('presentation starts at the current log and consumes live events exactly once', () => {
  const state = createGame('trial');
  state.events = [damage(1)]; state.eventSeq = 1;
  const cursor = new PresentationEvents(state);
  assert.deepEqual(cursor.read(state), { reset: false, events: [] });
  state.events.push(damage(2)); state.eventSeq = 2;
  const before = JSON.stringify(state);
  assert.deepEqual(cursor.read(state).events.map(event => event.id), [2]);
  assert.deepEqual(cursor.read(state).events, []);
  assert.equal(JSON.stringify(state), before, 'presentation does not author state');
});

test('epoch switches, clock rewinds and sequence resets baseline without replay', () => {
  const state = createGame('trial'); state.time = state.combatTime = 10;
  state.events = [damage(8, 10), damage(9, 10)]; state.eventSeq = 9;
  const cursor = new PresentationEvents(state, 3);
  assert.deepEqual(cursor.read(state, 4), { reset: true, events: [] }, 'equal-clock room switch');
  state.time = state.combatTime = 2; state.events = [damage(2, 2)]; state.eventSeq = 2;
  assert.deepEqual(cursor.read(state, 4), { reset: true, events: [] });
  state.events.push(damage(3, 2)); state.eventSeq = 3;
  assert.equal(cursor.read(state, 4).events[0]?.id, 3);
  state.eventSeq = 1; state.events = [damage(1, 2)];
  assert.deepEqual(cursor.read(state, 4), { reset: true, events: [] });
});

test('missed log gaps and old snapshot events do not produce a catch-up flash', () => {
  const state = createGame('trial'); const cursor = new PresentationEvents(state);
  state.events = [damage(state.eventSeq + 4)]; state.eventSeq += 4;
  assert.deepEqual(cursor.read(state), { reset: true, events: [] });
  state.combatTime = state.time = 10;
  state.events.push(damage(++state.eventSeq, 7), damage(++state.eventSeq, 10));
  assert.deepEqual(cursor.read(state).events.map(event => event.time), [10]);
  assert.deepEqual(cursor.read(state).events, []);
});

test('damage targets boss, incoming damage targets hit actor, heal targets recipient', () => {
  const state = createGame('trial');
  for (const kind of ['auto', 'weapon', 'magic', 'chain', 'burst']) {
    const result = combatNumber({ ...damage(1), kind }, state);
    assert.equal(result?.target, 'boss');
  }
  assert.deepEqual(combatNumber({ ...damage(2), kind: 'hit', actor: 1, value: 63 }, state),
    { id: 2, target: 1, text: '−63', tone: 'hurt' });
  assert.deepEqual(combatNumber({ ...damage(3), kind: 'heal', actor: 4, target: 1, value: 640 }, state),
    { id: 3, target: 1, text: '+640', tone: 'heal' });
  assert.equal(combatNumber({ ...damage(4), kind: 'heal', actor: 4, text: 'Ariadne restores Heracles · +640' }, state), null);
});

test('malformed/non-damage events cannot create false numbers or arbitrary targets', () => {
  const state = createGame('trial');
  for (const kind of ['revelry', 'revelry_lost', 'provoke', 'guard', 'dodge', 'cast'])
    assert.equal(combatNumber({ ...damage(1), kind }, state), null);
  for (const value of [0, -3, NaN, Infinity]) assert.equal(combatNumber({ ...damage(1), value }, state), null);
  for (const target of [-1, 5, .5, NaN])
    assert.equal(combatNumber({ ...damage(1), kind: 'heal', target }, state), null);
});

test('fixed number pool copies coordinates, spaces concurrent targets and evicts oldest', () => {
  const pool = new CombatNumberPool(2);
  const feedback: CombatNumber = { id: 1, target: 'boss', text: '120', tone: 'damage' };
  const position = { x: 2, y: 3, z: 4 };
  pool.spawn(feedback, position); position.x = 99;
  assert.equal(pool.slots[0].x, 2);
  pool.update(.4); pool.spawn({ ...feedback, id: 2 }, position);
  assert.notEqual(pool.slots[0].lane, pool.slots[1].lane);
  pool.spawn({ ...feedback, id: 3 }, position);
  assert.deepEqual(pool.slots.map(slot => slot.feedback?.id), [3, 2]);
  assert.equal(pool.slots.length, 2);
  pool.update(1.3); assert.ok(pool.slots.every(slot => slot.feedback === null));
  pool.spawn(feedback, position); pool.reset();
  assert.ok(pool.slots.every(slot => slot.feedback === null));
  pool.spawn(feedback, { ...position, x: NaN });
  assert.ok(pool.slots.every(slot => slot.feedback === null));
  assert.equal(new CombatNumberPool(Infinity).slots.length, 1);
  assert.equal(new CombatNumberPool(1000).slots.length, 32);
});

test('ground TP readiness belongs to living weapon roles; low HP is a separate cue', () => {
  const state = createGame('trial');
  for (const actor of state.party) {
    actor.tp = 1000; actor.hp = actor.maxHp / 4;
    const cue = partyFeedback(actor);
    assert.equal(cue.tpReady, ['vanguard', 'warden', 'hunter'].includes(actor.role));
    assert.equal(cue.lowHp, true);
    actor.tp = 999;
    assert.equal(partyFeedback(actor).tpReady, false);
    actor.hp = 0;
    assert.deepEqual(partyFeedback(actor), { alive: false, lowHp: false, tpReady: false, tpFraction: 0 });
  }
});

test('number overlay stays still with reduced motion, clips behind camera and removes its fixed nodes', () => {
  class Element {
    children: Element[] = [];
    style: Record<string, string> = {};
    dataset: Record<string, string> = {};
    textContent = '';
    removed = false;
    setAttribute() {}
    appendChild(child: Element) { this.children.push(child); }
    remove() { this.removed = true; }
  }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new Element() } });
  try {
    const host = new Element();
    const overlay = new FloatingFeedback(host as unknown as HTMLElement, 2);
    const camera = new THREE.PerspectiveCamera(58, 1, .1, 100);
    camera.position.set(0, 2, 10); camera.lookAt(0, 2, 0); camera.updateMatrixWorld();
    const feedback: CombatNumber = { id: 1, target: 0, tone: 'heal', text: '+640' };
    overlay.spawn(feedback, { x: 0, y: 2, z: 0 });
    overlay.update(.1, camera, 800, 800, true);
    const layer = host.children[0], label = layer.children[0];
    const still = label.style.transform;
    assert.equal(label.textContent, '+640'); assert.equal(label.style.opacity, '1');
    overlay.update(.2, camera, 800, 800, true);
    assert.equal(label.style.transform, still, 'reduced motion fades in place without lift');
    overlay.update(.1, camera, 800, 800, false);
    assert.notEqual(label.style.transform, still, 'normal presentation lifts');
    overlay.reset(); assert.equal(label.style.opacity, '0');
    overlay.spawn({ ...feedback, id: 2 }, { x: 0, y: 2, z: 20 });
    overlay.update(.1, camera, 800, 800, false);
    assert.equal(label.style.opacity, '0', 'off-screen target is not pinned to an unrelated screen location');
    assert.equal(layer.children.length, 2, 'spawn/reset do not add DOM nodes');
    overlay.dispose(); assert.equal(layer.removed, true);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
