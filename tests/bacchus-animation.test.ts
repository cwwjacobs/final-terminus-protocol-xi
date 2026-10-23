import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { bacchusStrike } from '../components/game/bacchus-combat.ts';
import { HeroAssetCache, type HeroAssetSource } from '../components/game/hero-assets.ts';

// Exercise the actual shipped rig/locomotion data without decoding its textures.
function realRig(): HeroAssetSource {
  const bytes = readFileSync(new URL('../public/assets/models/bacchus.glb', import.meta.url));
  const jsonLength = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const binary = bytes.subarray(28 + jsonLength);
  const joints = new Set<number>(doc.skins[0].joints);
  const nodes: THREE.Object3D[] = doc.nodes.map((node: { name: string; translation?: number[]; rotation?: number[]; scale?: number[] }, i: number) => {
    const object = joints.has(i) ? new THREE.Bone() : new THREE.Group();
    object.name = node.name;
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    return object;
  });
  doc.nodes.forEach((node: { children?: number[] }, i: number) => node.children?.forEach(child => nodes[i].add(nodes[child])));
  const scene = new THREE.Group(); doc.scenes[doc.scene || 0].nodes.forEach((i: number) => scene.add(nodes[i]));
  const values = (index: number) => {
    const accessor = doc.accessors[index], view = doc.bufferViews[accessor.bufferView];
    assert.equal(accessor.componentType, 5126);
    const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type as 'SCALAR' | 'VEC3' | 'VEC4'];
    return Array.from({ length: accessor.count * size }, (_, i) => binary.readFloatLE((view.byteOffset || 0) + (accessor.byteOffset || 0) + Math.floor(i / size) * (view.byteStride || size * 4) + (i % size) * 4));
  };
  const animations = doc.animations.map((animation: { name: string; samplers: { input: number; output: number }[]; channels: { sampler: number; target: { node: number; path: string } }[] }) => {
    const tracks = animation.channels.map(channel => {
      const sampler = animation.samplers[channel.sampler], path = channel.target.path;
      const name = `${nodes[channel.target.node].name}.${path === 'translation' ? 'position' : path === 'rotation' ? 'quaternion' : 'scale'}`;
      return path === 'rotation' ? new THREE.QuaternionKeyframeTrack(name, values(sampler.input), values(sampler.output)) : new THREE.VectorKeyframeTrack(name, values(sampler.input), values(sampler.output));
    });
    return new THREE.AnimationClip(animation.name, -1, tracks);
  });
  scene.updateMatrixWorld(true);
  return { scene, animations };
}

const point = (root: THREE.Object3D, name: string) => root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());

test('Bacchus strikes only for attack events, with a separate Arc Cleave', () => {
  assert.equal(bacchusStrike({ kind: 'auto', text: 'auto attack' }), 'attack');
  assert.equal(bacchusStrike({ kind: 'weapon', text: 'Bacchus: Arc Cleave · 660' }), 'cleave');
  for (const kind of ['chain', 'burst', 'hit', 'guard', 'revelry', 'revelry_lost', 'heal', 'down']) assert.equal(bacchusStrike({ kind, text: 'Arc Cleave' }), null);
});

test('real Bacchus rig keeps both grips together through wind-up, impact and recovery', async () => {
  const cache = new HeroAssetCache(async () => realRig());
  const visual = await cache.load('bacchus');
  visual.update(1 / 60, 0, true, 0);
  const weapon = visual.object.getObjectByName('bacchus-thyrsus')!;
  assert.ok(weapon, 'polearm is attached to the painted rig');
  assert.equal(weapon.parent?.name, 'hand_R');
  for (const kind of ['auto', 'weapon']) {
    visual.resetCombat();
    assert.ok(visual.playCombat({ kind, text: 'Bacchus: Arc Cleave' }) > 0);
    let maxGripGap = 0;
    for (let i = 0; i < 95; i++) {
      visual.update(1 / 60, 0, true, 0); visual.object.updateMatrixWorld(true);
      const support = new THREE.Vector3(0, .3, 0).applyMatrix4(weapon.matrixWorld);
      const palm = new THREE.Vector3(0, .065, 0).applyMatrix4(visual.object.getObjectByName('hand_L')!.matrixWorld);
      maxGripGap = Math.max(maxGripGap, support.distanceTo(palm));
      visual.object.traverse(object => {
        assert.ok(object.position.toArray().every(Number.isFinite));
        assert.ok(object.quaternion.toArray().every(Number.isFinite));
      });
    }
    assert.ok(maxGripGap < .085, `${kind} off-hand gap ${maxGripGap.toFixed(3)}m`);
    assert.equal(visual.object.getObjectByName('bacchus-polearm-trail')!.visible, false, 'trail expires after recovery');
  }
  cache.dispose();
});

test('strikes leave root and feet on the existing locomotion, and never move another instance', async () => {
  const cache = new HeroAssetCache(async () => realRig());
  const a = await cache.load('bacchus'), b = await cache.load('bacchus');
  const original = realRig(), baseline = new THREE.AnimationMixer(original.scene);
  baseline.clipAction(original.animations[0]).play();
  a.playCombat({ kind: 'weapon', text: 'Bacchus: Arc Cleave' });
  let armMotion = 0;
  for (let i = 0; i < 120; i++) {
    a.update(1 / 60, 0, true, 0); b.update(1 / 60, 0, true, 0); baseline.update(1 / 60);
    a.object.updateMatrixWorld(true); b.object.updateMatrixWorld(true); original.scene.updateMatrixWorld(true);
    for (const name of ['hips', 'foot_R', 'toe_R', 'foot_L', 'toe_L']) assert.ok(point(a.object, name).distanceTo(point(original.scene, name)) < 1e-5, name);
    armMotion = Math.max(armMotion, point(a.object, 'hand_R').distanceTo(point(b.object, 'hand_R')));
    assert.deepEqual(a.object.position.toArray(), [0, 0, 0]);
  }
  assert.ok(armMotion > .15, 'attack animates the skeleton');
  assert.ok(point(a.object, 'hand_R').distanceTo(point(b.object, 'hand_R')) < 1e-5, 'recovery returns to ready');
  cache.dispose();
});

test('death cancels strikes; revival and repeated attacks recover, with owned props freed once', async () => {
  const cache = new HeroAssetCache(async () => realRig());
  const visual = await cache.load('bacchus');
  const weapon = visual.object.getObjectByName('bacchus-thyrsus')!;
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  visual.object.traverse(object => { if (object instanceof THREE.Mesh) { resources.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => resources.add(material)); } });
  const disposals = new Map<object, number>(); resources.forEach(resource => resource.addEventListener('dispose', () => disposals.set(resource, (disposals.get(resource) || 0) + 1)));
  visual.playCombat({ kind: 'weapon', text: 'Arc Cleave' }); visual.update(.2, 0, true, 0);
  visual.update(.05, 0, false, 0);
  assert.equal(visual.playCombat({ kind: 'auto', text: '' }), 0);
  assert.equal(visual.object.getObjectByName('bacchus-polearm-trail')!.visible, false);
  for (let i = 0; i < 70; i++) visual.update(1 / 60, 3, true, 0);
  for (let j = 0; j < 8; j++) {
    visual.playCombat({ kind: 'auto', text: '' });
    for (let i = 0; i < 60; i++) visual.update(1 / 60, j % 2 ? 3 : 0, true, 0);
  }
  visual.setWireframe(true);
  weapon.traverse(object => { if (object instanceof THREE.Mesh) assert.equal(object.material.wireframe, true); });
  visual.dispose(); visual.dispose(); cache.dispose();
  resources.forEach(resource => assert.equal(disposals.get(resource), 1));
});
