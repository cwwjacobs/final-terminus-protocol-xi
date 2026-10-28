import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDarkStatues } from '../components/game/dark-statues.ts';
import { createGame } from '../game/engine.ts';

function fixture() {
  const scene = new THREE.Scene(), visual = createDarkStatues(scene, 'low'), state = createGame();
  state.status = 'fighting'; state.time = 1; state.combatTime = 1;
  state.enemies = [{ id: 'ground-1-0', name: 'Ground shard', kind: 'ground-shard', x: 3, z: 4, spawnX: 3, spawnZ: 4, hp: 1000, maxHp: 1000, target: 0, attackTimer: 3, stunRemaining: 0, burn: null, emergeRemaining: 0 }];
  visual.update(.05, state);
  return { scene, visual, state };
}

test('distant statues stay in darkness and briefly become visible during lightning', () => {
  const { visual, state } = fixture();
  const figures = visual.root.children.filter(object => object.name.startsWith('distant-figure-')) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[];
  assert.equal(figures.length, 6);
  assert.ok(figures.every(figure => Math.hypot(figure.position.x, figure.position.z) >= 32 && figure.material.opacity < .01));
  const before = structuredClone(state);
  visual.update(.05, state, false, 1);
  assert.ok(figures.every(figure => figure.material.opacity > .6));
  for (let i = 0; i < 30; i++) visual.update(.05, state);
  assert.ok(figures.every(figure => figure.material.opacity < .01));
  state.enemies[0].emergeRemaining = .6;
  visual.update(.05, state);
  assert.ok(figures.every(figure => figure.material.opacity > .4));
  state.enemies[0].emergeRemaining = 0;
  assert.deepEqual(state, before, 'presentation never mutates simulation');
  visual.dispose();
});

test('a witnessed enemy defeat sends a bounded stream inward and briefly lights its destination', () => {
  const { visual, state } = fixture();
  state.time += .1; state.enemies[0].hp = 0;
  visual.update(.05, state);
  assert.equal(visual.stats().absorptions, 1); assert.equal(visual.stats().activeTrails, 1);
  const motes = visual.root.getObjectByName('inward-energy') as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4(), start = new THREE.Vector3(), end = new THREE.Vector3();
  motes.getMatrixAt(0, matrix); start.setFromMatrixPosition(matrix);
  for (let i = 0; i < 28; i++) visual.update(.05, state);
  motes.getMatrixAt(0, matrix); end.setFromMatrixPosition(matrix);
  assert.ok(Math.hypot(end.x, end.z) > Math.hypot(start.x, start.z) + 15, 'energy travels toward the peripheral statues');
  for (let i = 0; i < 9; i++) visual.update(.05, state);
  const embers = visual.root.children.filter(object => object.name.startsWith('distant-ember-')) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
  assert.equal(embers.filter(ember => ember.material.opacity > .2).length, 1, 'only the receiving statue pulses');
  for (let i = 0; i < 65; i++) visual.update(.05, state);
  assert.equal(visual.stats().activeTrails, 0); assert.equal(motes.visible, false);
  assert.equal(visual.stats().absorptions, 1, 'corpse snapshots do not replay an absorption');
  visual.dispose();
});

test('restores, presentation resets, entity removal and victory cleanup never masquerade as kills', () => {
  const { visual, state } = fixture();
  state.enemies[0].hp = 0; visual.reset(); visual.update(.05, state);
  assert.equal(visual.stats().absorptions, 0, 'loading a corpse starts a fresh presentation baseline');
  state.enemies[0].hp = 1000; visual.update(.05, state);
  state.status = 'victory'; state.enemies[0].hp = 0; visual.update(.05, state);
  assert.equal(visual.stats().absorptions, 0, 'boss victory removes adds without absorbing them');
  state.status = 'fighting'; state.enemies[0].hp = 1000; visual.update(.05, state);
  state.enemies = []; visual.update(.05, state);
  assert.equal(visual.stats().absorptions, 0, 'a missing enemy is not a death');
  state.encounter = 'logos'; state.logos.stage = 'giant'; visual.update(.05, state);
  assert.equal(visual.stats().activeTrails, 0);
  visual.dispose();
});

test('a fresh recorded shatter survives a victory snapshot but old event history cannot replay', () => {
  const { visual, state } = fixture();
  state.status = 'victory'; state.enemies[0].hp = 0; state.time += .1; state.eventSeq = 1;
  state.events.push({ id: 1, time: state.combatTime, kind: 'ground_shatter', text: '', enemyId: 'ground-1-0' });
  visual.update(.05, state); assert.equal(visual.stats().absorptions, 1);
  visual.update(.05, state); assert.equal(visual.stats().absorptions, 1);
  visual.reset(); visual.update(.05, state); assert.equal(visual.stats().absorptions, 0);
  visual.dispose();
});

test('reduced motion uses stationary glows, and repeated defeats reuse the fixed particle pool', () => {
  const { visual, scene, state } = fixture();
  let initial = 0; visual.root.traverse(() => initial++);
  const motes = visual.root.getObjectByName('inward-energy') as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3();
  state.enemies[0].hp = 0; visual.update(.05, state, true);
  motes.getMatrixAt(0, matrix); a.setFromMatrixPosition(matrix);
  visual.update(.05, state, true, 1); motes.getMatrixAt(0, matrix); b.setFromMatrixPosition(matrix);
  assert.deepEqual(a, b, 'reduced motion keeps the source glow fixed');
  for (let i = 0; i < 24; i++) {
    state.enemies[0] = { ...state.enemies[0], id: `test-${i}`, hp: 1000 }; state.time += .1; visual.update(.01, state);
    state.enemies[0].hp = 0; visual.update(.01, state);
  }
  let final = 0; visual.root.traverse(() => final++);
  assert.equal(final, initial); assert.equal(visual.stats().activeTrails, 8);
  let disposedGeometries = 0;
  (visual.root.getObjectByName('distant-figure-0') as THREE.Mesh).geometry.addEventListener('dispose', () => disposedGeometries++);
  visual.dispose(); visual.dispose();
  assert.equal(disposedGeometries, 1); assert.equal(scene.children.length, 0);
  visual.update(.05, state); assert.equal(visual.stats().activeTrails, 0);
});

test('a direct lightning strike transfers energy between persistent floating statues only once per flash', () => {
  const { visual, state } = fixture();
  const bodies = visual.root.children.filter(object => object.name.startsWith('distant-figure-')) as THREE.Mesh[];
  const positions = bodies.map(body => body.position.clone());
  assert.ok(bodies.every(body => new THREE.Box3().setFromObject(body).min.y > 4), 'seated forms remain suspended above the floor');
  visual.update(.05, state, false, 1);
  assert.equal(visual.stats().statueTransfers, 1);
  assert.equal(visual.stats().absorptions, 0, 'a statue transfer does not invent an enemy death');
  assert.equal(visual.root.getObjectByName('distant-lightning-contact')!.visible, true);
  for (let i = 0; i < 25; i++) { state.time += .05; visual.update(.05, state, false, 1); }
  assert.equal(visual.stats().statueTransfers, 1, 'a sustained flash is one strike');
  assert.equal(visual.root.getObjectByName('distant-lightning-contact')!.visible, false);
  for (let i = 0; i < 60; i++) { state.time += .05; visual.update(.05, state); }
  assert.equal(visual.stats().activeTrails, 0);
  assert.deepEqual(bodies.map(body => body.position), positions);
  assert.ok(bodies.every(body => body.visible && (body.material as THREE.MeshStandardMaterial).opacity < .01));
  assert.equal(visual.root.visible, true, 'darkness never despawns the statues');
  visual.reset(); visual.update(.05, state, false, 1);
  assert.equal(visual.stats().statueTransfers, 0, 'restoring a held flash does not strike again');
  visual.dispose();
});

test('large snapshot gaps discard stale kills and reduced motion returns completely to darkness', () => {
  const { visual, state } = fixture();
  state.enemies[0].hp = 0; state.eventSeq = 1; state.events.push({ id: 1, time: 1.1, kind: 'ground_shatter', text: '', enemyId: 'ground-1-0' }); state.time = 8;
  visual.update(.05, state, true, 1);
  assert.equal(visual.stats().absorptions, 0);
  assert.equal(visual.root.getObjectByName('distant-lightning-contact')!.visible, false);
  for (let i = 0; i < 30; i++) visual.update(.05, state, true);
  const body = visual.root.getObjectByName('distant-figure-0') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  assert.ok(body.material.opacity < .01);
  visual.dispose();
});

test('fresh death events use the combat clock even after a long wait before engagement', () => {
  const { visual, state } = fixture();
  state.time = 100; state.combatTime = 20; visual.reset(); visual.update(.05, state);
  state.time = 100.1; state.combatTime = 20.1; state.enemies[0].hp = 0; state.status = 'victory'; state.eventSeq = 1;
  state.events.push({ id: 1, time: 20.1, kind: 'ground_shatter', text: '', enemyId: 'ground-1-0' });
  visual.update(.05, state);
  assert.equal(visual.stats().absorptions, 1);
  visual.dispose();
});

test('shared figure adapters supply the real chest contacts without duplicating statues', () => {
  const scene = new THREE.Scene(), state = createGame(); state.status = 'fighting';
  let available = true, levels: readonly number[] = [];
  const contacts = Array.from({ length: 6 }, (_, index) => new THREE.Vector3(index * 4, 6, -34));
  const visual = createDarkStatues(scene, 'low', {
    getChest(index, out) { out.copy(contacts[index]); return available; },
    setLighting(next) { levels = [...next]; },
  });
  visual.update(.05, state);
  assert.equal(visual.root.children.filter(object => object.name.startsWith('distant-figure-')).length, 0);
  assert.deepEqual(visual.root.getObjectByName('distant-ember-3')!.position, contacts[3]);
  visual.update(.05, state, false, 1);
  assert.deepEqual(levels, [1, 1, 1, 1, 1, 1]);
  assert.equal(visual.stats().statueTransfers, 1);
  contacts[3].set(9, 8, -30); visual.update(.05, state);
  assert.deepEqual(visual.root.getObjectByName('distant-ember-3')!.position, contacts[3]);
  available = false; visual.update(.05, state);
  assert.ok(levels.every(value => value === 0));
  assert.equal(visual.stats().activeTrails, 0);
  assert.equal(visual.root.getObjectByName('distant-ember-3')!.visible, false);
  visual.dispose(); assert.ok(levels.every(value => value === 0));
});

test('a struck figure briefly distorts while its energy follows a living moving receiver', () => {
  const scene = new THREE.Scene(), state = createGame(); state.status = 'fighting';
  const contacts = Array.from({ length: 6 }, (_, index) => new THREE.Vector3(index * 4, 6, -34));
  const living = [true, true, true, true, true, true];
  let distortions: readonly number[] = [];
  const visual = createDarkStatues(scene, 'low', {
    getChest(index, out) { out.copy(contacts[index]); return living[index]; },
    setLighting() {},
    setDistortion(next) { distortions = [...next]; },
  });
  visual.update(.05, state); visual.update(.05, state, false, 1);
  assert.equal(distortions.filter(value => value > 0).length, 1);
  assert.equal(distortions[0], .9);
  contacts[1].set(30, 8, -30);
  for (let i = 0; i < 30; i++) visual.update(.05, state);
  assert.deepEqual(distortions, [0, 0, 0, 0, 0, 0]);
  const motes = visual.root.getObjectByName('inward-energy') as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4(), endpoint = new THREE.Vector3();
  motes.getMatrixAt(0, matrix); endpoint.setFromMatrixPosition(matrix);
  assert.ok(endpoint.x > 20, 'the moving recipient remains the destination');
  living[1] = false; visual.update(.05, state);
  assert.equal(visual.stats().activeTrails, 0, 'a fallen recipient cancels its in-flight stream');
  visual.reset(); assert.deepEqual(distortions, [0, 0, 0, 0, 0, 0]);
  visual.dispose();
});

test('giant statue cycles reuse identities without replaying deaths or retaining prior-cycle streams', () => {
  const scene = new THREE.Scene(), state = createGame();
  state.status = 'fighting'; state.encounter = 'logos'; state.logos = { stage: 'giant', elapsed: 30, statueWave: 1 };
  const wave = () => Array.from({ length: 3 }, (_, index) => ({ id: `sentinel-${index}`, name: `Statue ${index}`, x: index * 5, z: -10, hp: 1000, maxHp: 1000, target: 0, attackTimer: 3, stunRemaining: 0, burn: null }));
  state.enemies = wave();
  const visual = createDarkStatues(scene, 'low', {
    getChest(index, out) {
      const enemy = state.enemies.find(enemy => enemy.id === `sentinel-${index}` && enemy.hp > 0);
      if (!enemy) return false;
      out.set(enemy.x, 2, enemy.z); return true;
    },
    setLighting() {},
  });
  visual.update(.05, state);
  state.enemies[0].hp = 0; state.time += .05; visual.update(.05, state);
  assert.equal(visual.stats().absorptions, 1); assert.equal(visual.stats().activeTrails, 1);
  visual.update(.05, state); assert.equal(visual.stats().absorptions, 1);
  state.logos.statueWave = 2; state.enemies = wave(); state.time += .05; visual.update(.05, state);
  assert.equal(visual.stats().activeTrails, 0, 'a new incarnation cannot inherit an old stream');
  assert.equal(visual.stats().absorptions, 1, 'summoning is not a defeat');
  state.enemies[0].hp = 0; state.time += .05; visual.update(.05, state);
  assert.equal(visual.stats().absorptions, 2, 'the same ID can be defeated once in its new wave');
  visual.update(.05, state); assert.equal(visual.stats().absorptions, 2);
  visual.reset(); visual.update(.05, state);
  assert.equal(visual.stats().absorptions, 0, 'restoring a corpse in a later cycle does not replay it');
  visual.dispose();
});

test('the last fallen statue has no invisible receiver for energy or subsequent lightning', () => {
  const scene = new THREE.Scene(), state = createGame();
  state.status = 'fighting'; state.encounter = 'logos'; state.logos = { stage: 'giant', elapsed: 30, statueWave: 1 };
  state.enemies = [{ id: 'sentinel-0', name: 'Statue', x: 0, z: -10, hp: 1000, maxHp: 1000, target: 0, attackTimer: 3, stunRemaining: 0, burn: null }];
  const visual = createDarkStatues(scene, 'low', {
    getChest(index, out) { out.set(0, 2, -10); return index === 0 && state.enemies[0].hp > 0; },
    setLighting() {},
  });
  visual.update(.05, state);
  state.enemies[0].hp = 0; state.time += .05; visual.update(.05, state, false, 1);
  assert.equal(visual.stats().absorptions, 0);
  assert.equal(visual.stats().activeTrails, 0);
  assert.equal(visual.stats().statueTransfers, 0);
  assert.equal(visual.root.getObjectByName('distant-lightning-contact')!.visible, false);
  visual.dispose();
});
