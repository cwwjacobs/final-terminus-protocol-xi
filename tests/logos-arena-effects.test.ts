import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createGame } from '../game/engine.ts';
import { arenaRadius } from '../game/logos-arena.ts';
import { createLogosArenaEffects } from '../components/game/logos-arena-effects.ts';

function fixture(quality: 'low' | 'high' = 'low') {
  const scene = new THREE.Scene(), state = createGame(), effects = createLogosArenaEffects(scene, quality);
  const rim = effects.root.getObjectByName('logos-fractured-rim') as THREE.Mesh;
  const cracks = effects.root.getObjectByName('logos-rim-fractures') as THREE.LineSegments;
  const chunks = effects.root.getObjectByName('logos-falling-rim-stone') as THREE.InstancedMesh;
  state.encounter = 'logos'; state.logos.stage = 'giant'; state.logos.arenaRadius = 20; state.time = 1;
  return { scene, state, effects, rim, cracks, chunks };
}

test('arena accent uses three bounded draws, no textures, and no per-update geometry', () => {
  for (const quality of ['low', 'high'] as const) {
    const f = fixture(quality), capacity = quality === 'high' ? 16 : 8;
    const geometry = f.effects.root.children.map(child => (child as THREE.Mesh).geometry);
    const materials = f.effects.root.children.map(child => (child as THREE.Mesh).material as THREE.Material);
    assert.equal(f.effects.root.children.length, 3);
    assert.equal(f.chunks.instanceMatrix.count, capacity);
    const triangles = f.rim.geometry.getAttribute('position').count / 3 + f.chunks.geometry.index!.count / 3 * capacity;
    assert.equal(triangles, quality === 'high' ? 360 : 208);
    for (const material of materials) assert.equal('map' in material ? material.map : null, null);
    f.state.boss.hp = f.state.boss.maxHp * .2;
    for (let i = 0; i < 300; i++) { f.state.time += 1 / 60; f.effects.update(f.state, false); }
    assert.deepEqual(f.effects.root.children.map(child => (child as THREE.Mesh).geometry), geometry);
    assert.ok(f.chunks.count <= capacity);
    assert.equal(f.chunks.castShadow, false);
    f.effects.dispose();
  }
});

test('rim follows the authoritative radius without mutating simulation or replacing the platform', () => {
  const f = fixture();
  const platform = new THREE.Group(); platform.name = 'original-floor'; f.scene.add(platform);
  const before = structuredClone(f.state); f.effects.update(f.state, false);
  assert.deepEqual(f.state, before);
  assert.equal(f.rim.scale.x, arenaRadius(f.state)); assert.equal(f.rim.scale.z, arenaRadius(f.state));
  assert.equal(f.cracks.scale.x, arenaRadius(f.state)); assert.equal(platform.parent, f.scene); assert.equal(platform.visible, true);
  assert.equal(f.chunks.visible, false, 'a restored partial arena alone does not replay a retreat');
  f.state.logos.arenaRadius = 16; f.state.time += .1; f.effects.update(f.state, false);
  assert.equal(f.rim.scale.x, arenaRadius(f.state)); assert.equal(f.chunks.visible, true);
  const first = new THREE.Matrix4(), later = new THREE.Matrix4();
  f.chunks.getMatrixAt(0, first); f.state.time += .2; f.effects.update(f.state, false); f.chunks.getMatrixAt(0, later);
  assert.ok(later.elements[13] < first.elements[13], 'fragments fall below the playable surface');
  assert.ok(Math.hypot(later.elements[12], later.elements[14]) > arenaRadius(f.state), 'fragments stay outside the playable edge');
  f.state.time += 2; f.effects.update(f.state, false); assert.equal(f.chunks.visible, false);
  f.effects.dispose();
});

test('all non-giant stages and the intact healthy arena stay hidden with zero buffer writes', () => {
  const f = fixture();
  const initial = f.chunks.instanceMatrix.version;
  for (const stage of ['none', 'descent', 'sentinels', 'collapse', 'escaped'] as const) {
    f.state.logos.stage = stage;
    for (let frame = 0; frame < 60; frame++) { f.state.time += .016; f.effects.update(f.state, false); }
    assert.equal(f.effects.root.visible, false); assert.equal(f.chunks.instanceMatrix.version, initial);
  }
  f.state.logos.stage = 'giant'; f.state.encounter = 'crown'; f.effects.update(f.state, false);
  assert.equal(f.effects.root.visible, false);
  f.state.encounter = 'logos'; f.state.logos.arenaRadius = 24; f.effects.update(f.state, false);
  assert.equal(f.effects.root.visible, false); assert.equal(f.chunks.instanceMatrix.version, initial);
  f.effects.dispose();
});

test('reduced motion is a static edge; repeated snapshots and clock rewinds do not animate stale work', () => {
  const f = fixture(); f.state.boss.hp = f.state.boss.maxHp * .2;
  f.effects.update(f.state, false); assert.equal(f.chunks.visible, true);
  const version = f.chunks.instanceMatrix.version;
  f.effects.update(f.state, false); assert.equal(f.chunks.instanceMatrix.version, version, 'same authoritative snapshot does not rewrite particles');
  f.effects.update(f.state, true); assert.equal(f.chunks.visible, false);
  const opacity = (f.rim.material as THREE.MeshBasicMaterial).opacity;
  for (let i = 0; i < 60; i++) { f.state.time += .016; f.effects.update(f.state, true); }
  assert.equal(f.chunks.instanceMatrix.version, version); assert.equal((f.rim.material as THREE.MeshBasicMaterial).opacity, opacity);
  f.state.logos.arenaRadius = 15; f.effects.update(f.state, true);
  assert.equal(f.rim.scale.x, arenaRadius(f.state));
  f.effects.update(f.state, false);
  assert.equal(f.chunks.visible, true); assert.ok(f.chunks.instanceMatrix.version > version);
  const matrix = new THREE.Matrix4(); f.chunks.getMatrixAt(0, matrix);
  assert.ok(Math.hypot(matrix.elements[12], matrix.elements[14]) < 16.1, 'resuming motion uses the current edge');
  f.state.boss.hp = f.state.boss.maxHp; f.state.time = .1; f.effects.update(f.state, false);
  assert.equal(f.chunks.visible, false, 'a clock rewind clears the old retreat window');
  f.effects.dispose();
});

test('collapse removes presentation immediately and all owned resources dispose once', () => {
  const f = fixture('high'); f.state.boss.hp = f.state.boss.maxHp * .1; f.effects.update(f.state, false);
  f.state.logos.stage = 'collapse'; f.effects.update(f.state, false);
  assert.equal(f.effects.root.visible, false); assert.equal(f.chunks.visible, false);
  const resources = f.effects.root.children.flatMap(child => [(child as THREE.Mesh).geometry, (child as THREE.Mesh).material as THREE.Material]);
  const counts = resources.map(() => 0); resources.forEach((resource, index) => resource.addEventListener('dispose', () => counts[index]++));
  let instanceDisposals = 0; f.chunks.addEventListener('dispose', () => instanceDisposals++);
  f.effects.dispose(); f.effects.dispose();
  assert.deepEqual(counts, [1, 1, 1, 1, 1, 1]); assert.equal(instanceDisposals, 1);
  assert.equal(f.effects.root.parent, null); assert.equal(f.scene.children.length, 0);
  f.state.logos.stage = 'giant'; f.effects.update(f.state, false); assert.equal(f.effects.root.visible, false);
});

test('motion can resume at the same clock after the boundary changes while reduced motion is enabled', () => {
  const f = fixture(); f.state.boss.hp = f.state.boss.maxHp * .1;
  f.effects.update(f.state, false); const version = f.chunks.instanceMatrix.version;
  f.state.logos.arenaRadius = 12; f.effects.update(f.state, true);
  assert.equal(f.chunks.instanceMatrix.version, version);
  f.effects.update(f.state, false);
  assert.equal(f.chunks.instanceMatrix.version, version + 1, 'particle cache includes the radius it actually drew');
  const matrix = new THREE.Matrix4(); f.chunks.getMatrixAt(0, matrix);
  assert.ok(Math.hypot(matrix.elements[12], matrix.elements[14]) < 13.1);
  f.effects.dispose();
});
