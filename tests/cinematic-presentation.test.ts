import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createGame } from '../game/engine.ts';
import { createCinematicEnvironment } from '../components/game/cinematic-environment.ts';
import { createCinematicCombat } from '../components/game/cinematic-combat.ts';
import { createStormEffects } from '../components/game/storm-effects.ts';
import { RenderBudget } from '../components/game/render-budget.ts';
import { combatReactionPlan, CombatAudioQueue } from '../components/game/combat-audio.ts';
import type { CombatEvent } from '../components/game/world-feedback.ts';

const cue = (id: number, extra: Partial<CombatEvent> = {}): CombatEvent => ({ id, kind: 'magic', time: 0, text: '', value: 300, actor: 3, element: 'lightning', ...extra });
function resources(root: THREE.Object3D) {
  const owned = new Set<THREE.Material | THREE.BufferGeometry>();
  root.traverse(node => { if (node instanceof THREE.Mesh || node instanceof THREE.Points || node instanceof THREE.Line) { owned.add(node.geometry); (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => owned.add(m)); } });
  let disposed = 0; owned.forEach(resource => resource.addEventListener('dispose', () => disposed++));
  return { count: owned.size, disposed: () => disposed };
}

test('environment stays at three texture-free passes, freezes reduced motion and follows the collapsing floor', () => {
  for (const quality of ['low', 'high'] as const) {
    const scene = new THREE.Scene(), floor = new THREE.Group(), state = createGame(); scene.add(floor);
    const fx = createCinematicEnvironment(scene, floor, quality), before = structuredClone(state);
    const all = resources(scene), sky = scene.getObjectByName('storm-vault-shader') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    fx.update(.05, state, false, .7); assert.ok(sky.material.uniforms.uTime.value > 0);
    const inlay = scene.getObjectByName('living-obsidian-shader')!;
    assert.equal(inlay.parent, floor);
    floor.position.y = -8; floor.scale.setScalar(.3); floor.updateMatrixWorld(true);
    assert.ok(inlay.getWorldPosition(new THREE.Vector3()).y < -7);
    fx.update(.05, state, true, 1, .3);
    assert.equal(sky.material.uniforms.uTime.value, 0); assert.equal(sky.material.uniforms.uFlash.value, 0);
    assert.equal(sky.material.uniforms.uOpacity.value, .3);
    assert.deepEqual(state, before); assert.equal(fx.stats().passes, 3); assert.equal(fx.stats().textures, 0); assert.equal(fx.stats().renderTargets, 0);
    fx.dispose(); fx.dispose(); assert.equal(all.disposed(), all.count); assert.equal(scene.getObjectByName('living-obsidian-shader'), undefined);
  }
});

test('combat accents use real hand/head anchors, stay bounded under event storms and do not mutate snapshots', () => {
  const scene = new THREE.Scene(), state = createGame(), camera = new THREE.PerspectiveCamera();
  const fx = createCinematicCombat(scene, 'low', (_, out) => { out.set(2,3,4); return true; }, (_, __, out) => { out.set(5,17,-12); return true; });
  const before = structuredClone(state), all = resources(scene);
  fx.start(cue(1), state, .3); fx.update(.05, state, camera, false);
  let active = scene.getObjectByName('cinematic-combat')!.children.filter(n => n.visible);
  assert.deepEqual(active[0].position.toArray(), [2,3,4]);
  fx.impact(cue(2), state); fx.update(.05, state, camera, false);
  active = scene.getObjectByName('cinematic-combat')!.children.filter(n => n.visible);
  assert.ok(active.some(n => n.position.y === 17));
  for (let i = 3; i < 1000; i++) { fx.impact(cue(i, { kind: i % 2 ? 'weapon' : 'burst' }), state); fx.update(.001, state, camera, i % 2 === 0); }
  assert.equal(fx.stats().capacity, 6); assert.ok(fx.stats().active <= 6); assert.deepEqual(state, before);
  fx.reset(); assert.equal(fx.stats().active, 0);
  fx.impact(cue(1001, { source: 'rainOfFireBurn' }), state); assert.equal(fx.stats().active, 0);
  fx.dispose(); fx.dispose(); assert.equal(all.disposed(), all.count);
});

test('forked storm ribbons hit players and selected enemies, have finite geometry and reset without stale flashes', () => {
  const scene = new THREE.Scene(), state = createGame(), fx = createStormEffects(scene, 'low');
  state.encounter = 'logos'; state.logos.stage = 'giant'; state.party[3].enemyTarget = 'boss';
  const before = structuredClone(state), all = resources(scene);
  fx.event(cue(1), state); fx.event(cue(2, { kind: 'static_arc', actor: 0, element: undefined, value: undefined }), state);
  fx.update(.01, state, false);
  assert.equal(fx.stats().active, 2); assert.ok(fx.flash > 0);
  const bolts = scene.getObjectByName('storm-effects')!.children.filter(n => n.name === 'forked-lightning' && n.visible) as THREE.Mesh[];
  const ys = Array.from(bolts[0].geometry.getAttribute('position').array).filter((_, i) => i % 3 === 1);
  assert.ok(Math.min(...ys) > 15, 'giant lightning lands at the head instead of the floor');
  for (let i = 0; i < 500; i++) { fx.event(cue(i + 3), state); fx.update(.001, state, false); }
  assert.ok(fx.stats().active <= fx.stats().capacity);
  for (const bolt of bolts) assert.ok(Array.from(bolt.geometry.getAttribute('position').array).every(Number.isFinite));
  fx.update(.01, state, true); assert.equal(fx.flash, 0);
  assert.deepEqual(state, before); fx.reset(); assert.equal(fx.stats().active, 0); assert.equal(fx.flash, 0);
  fx.dispose(); fx.dispose(); assert.equal(all.disposed(), all.count);
});

test('resolution adapts only after sustained combat load, with slow recovery and strict quality/device ceilings', () => {
  const budget = new RenderBudget('high', 3); assert.equal(budget.pixelRatio, 1.5);
  assert.equal(budget.sample(30), null); assert.equal(budget.sample(60), null); assert.equal(budget.sample(30), null);
  assert.equal(budget.sample(30), null); assert.equal(budget.sample(30), 1.35);
  for (let i = 0; i < 60; i++) budget.sample(20);
  assert.equal(budget.pixelRatio, .85);
  for (let i = 0; i < 11; i++) assert.equal(budget.sample(60), null);
  assert.equal(budget.sample(60), .95);
  const before = budget.pixelRatio;
  for (let i = 0; i < 60; i++) budget.sample(5, false);
  assert.equal(budget.pixelRatio, before);
  const low = new RenderBudget('low', 2); for (let i = 0; i < 300; i++) low.sample(60);
  assert.equal(low.pixelRatio, 1); assert.equal(new RenderBudget('high', .7).pixelRatio, .7);
});

test('only damage produces pain reactions; lightning contacts share timing and rapid hits do not multiply cries', () => {
  for (const [id, name] of ['bacchus','heracles','dolos','hecate','ariadne'].entries()) {
    const plan = combatReactionPlan(cue(1, { kind: 'hit', actor: id }), name);
    assert.equal(plan.length, 1); assert.ok(plan[0].sound.startsWith('cry'));
  }
  for (const event of [cue(1, { kind: 'hit', value: 0 }), cue(2, { kind: 'static_strike', value: undefined }), cue(3, { source: 'rainOfFireBurn' }), cue(4, { kind: 'heal' })]) assert.deepEqual(combatReactionPlan(event, 'ariadne'), []);
  assert.equal(combatReactionPlan(cue(5), 'hecate')[0].delay, .3);
  const q = new CombatAudioQueue();
  for (let i = 0; i < 40; i++) q.enqueue(cue(i, { kind: 'hit', actor: 1 }), 1, 'heracles');
  assert.equal(q.drain(1, [true,true]).filter(c => c.sound === 'cryHeracles').length, 1);
  q.enqueue(cue(50, { kind: 'hit', actor: 1 }), 1.5, 'heracles'); assert.ok(!q.drain(1.5, [true,true]).some(c => c.sound === 'cryHeracles'));
  q.enqueue(cue(51, { kind: 'hit', actor: 1 }), 2.5, 'heracles'); assert.ok(q.drain(2.5, [true,true]).some(c => c.sound === 'cryHeracles'));
  q.reset(); assert.equal(q.size, 0);
});
