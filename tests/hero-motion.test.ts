import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { HeroAssetCache, type HeroAssetSource, type HeroVisual } from '../components/game/hero-assets.ts';
import { createHeroMotionClips } from '../components/game/hero-motion.ts';
import { presentationContact } from '../components/game/presentation-cues.ts';
import type { CombatCue } from '../components/game/bacchus-combat.ts';

// Exercise the actual shipped rig/locomotion data without decoding its textures.
function realRig(id: string): HeroAssetSource {
  const bytes = readFileSync(new URL(`../public/assets/models/${id}.glb`, import.meta.url));
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


const ids = ['heracles', 'dolos', 'hecate', 'ariadne'];
const point = (root: THREE.Object3D, name: string) => root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
function advance(visual: HeroVisual, seconds: number, alive = true) {
  for (let i = 0; i < Math.round(seconds * 120); i++) visual.update(1 / 120, 0, alive, 0);
  visual.object.updateMatrixWorld(true);
}
function finite(root: THREE.Object3D) {
  root.traverse(node => {
    assert.ok(node.position.toArray().every(Number.isFinite), node.name);
    assert.ok(node.quaternion.toArray().every(Number.isFinite), node.name);
    assert.ok(Math.abs(node.quaternion.length() - 1) < 1e-5, node.name);
  });
}

for (const id of ids) test(`${id}: actual painted rig has active actions and attachments, preserving locomotion`, async () => {
  const cache = new HeroAssetCache(async () => realRig(id));
  const actor = await cache.load(id), other = await cache.load(id);
  const reference = realRig(id), baseline = new THREE.AnimationMixer(reference.scene);
  baseline.clipAction(reference.animations.find(clip => clip.name.toLowerCase() === 'idle')!).play();
  const hand = new THREE.Vector3(), weapon = new THREE.Vector3();
  advance(actor, .1);advance(other, .1);baseline.update(.1);
  assert.equal(actor.getAnchor('hand', hand), true);assert.equal(actor.getAnchor('weapon', weapon), true);
  assert.ok(hand.distanceTo(weapon) > (id === 'dolos' ? .02 : .5), 'weapon anchor is attached to prop');
  const cue: CombatCue = id === 'hecate' ? { kind: 'magic', element: 'lightning', text: '' } : id === 'ariadne' ? { kind: 'heal', text: '' } : { kind: 'weapon', weaponId: 'resonance', text: '' };
  assert.equal(actor.playCombat(cue), presentationContact(cue, id));
  let armMotion = 0;
  for (let i = 0; i < 180; i++) {
    actor.update(1 / 120, 0, true, 0);other.update(1 / 120, 0, true, 0);baseline.update(1 / 120);
    actor.object.updateMatrixWorld(true);other.object.updateMatrixWorld(true);reference.scene.updateMatrixWorld(true);
    for (const name of ['hips', 'foot_R', 'toe_R', 'foot_L', 'toe_L']) assert.ok(point(actor.object, name).distanceTo(point(reference.scene, name)) < 1e-5, name);
    armMotion = Math.max(armMotion, point(actor.object, 'hand_R').distanceTo(point(other.object, 'hand_R')));
    assert.deepEqual(actor.object.position.toArray(), [0, 0, 0]);finite(actor.object);
  }
  assert.ok(armMotion > .15, 'action moves real shoulder/elbow/hand chain');
  assert.ok(point(actor.object, 'hand_R').distanceTo(point(other.object, 'hand_R')) < .001, 'returns to ready without accumulation');
  actor.object.position.set(2, 0, -4);actor.object.rotation.y = .9;
  assert.equal(actor.getAnchor('weapon', weapon), true);assert.ok(weapon.distanceTo(new THREE.Vector3(2, 0, -4)) < 4);
  cache.dispose();assert.equal(actor.getAnchor('hand', hand), false);
});

test('actual rigs distinguish heavy sweep, straight pierce, downward resonance, and elemental casts', async () => {
  for (const id of ['bacchus', 'heracles', 'dolos', 'hecate']) {
    const cache = new HeroAssetCache(async () => realRig(id));
    const actor = await cache.load(id);
    const cues: CombatCue[] = id === 'hecate' ? ['fire', 'ice', 'lightning'].map(element => ({ kind: 'magic', text: '', element } as CombatCue)) : ['cleave', 'pierce', 'resonance'].map(weaponId => ({ kind: 'weapon', text: '', weaponId } as CombatCue));
    const contacts: THREE.Vector3[] = [];
    for (const cue of cues) {
      actor.resetCombat();advance(actor, .1);
      const delay = actor.playCombat(cue);assert.equal(delay, presentationContact(cue, id));advance(actor, delay);
      const anchor = new THREE.Vector3();assert.equal(actor.getAnchor('weapon', anchor), true);contacts.push(anchor);finite(actor.object);
    }
    for (let i = 0; i < contacts.length; i++) for (let j = i + 1; j < contacts.length; j++) assert.ok(contacts[i].distanceTo(contacts[j]) > .12, `${id}: contact silhouettes ${i}/${j}`);
    cache.dispose();
  }
});

test('Bacchus new weaponskills retain both hands on the polearm and support actions do not slash', async () => {
  const cache = new HeroAssetCache(async () => realRig('bacchus')), actor = await cache.load('bacchus');
  const weapon = actor.object.getObjectByName('bacchus-thyrsus')!;
  for (const cue of [{ kind: 'weapon', weaponId: 'pierce', text: '' }, { kind: 'weapon', weaponId: 'resonance', text: '' }, { kind: 'ability', source: 'criticalDash', text: '', sequenceId: 1, hitIndex: 1 }] as CombatCue[]) {
    actor.resetCombat();actor.playCombat(cue);let gap = 0, at = 0;
    for (let i = 0; i < 150; i++) {
      advance(actor, 1 / 120);
      const support = new THREE.Vector3(0, .3, 0).applyMatrix4(weapon.matrixWorld), palm = new THREE.Vector3(0, .065, 0).applyMatrix4(actor.object.getObjectByName('hand_L')!.matrixWorld);
      if (support.distanceTo(palm) > gap) { gap = support.distanceTo(palm);at = i / 120; } finite(actor.object);
    }
    assert.ok(gap < .085, `${cue.weaponId ?? cue.source} grip gap ${gap} at ${at}`);
  }
  for (const kind of ['revelry', 'guard', 'dodge', 'hit']) {
    actor.resetCombat();actor.playCombat({ kind, text: '' });
    for (let i = 0; i < 100; i++) { advance(actor, 1 / 120);assert.equal(actor.object.getObjectByName('bacchus-polearm-trail')!.visible, false); }
  }
  cache.dispose();
});

test('signature contact events are immediate and duplicate hit IDs do not restart their short motion', async () => {
  for (const [id, source] of [['bacchus', 'criticalDash'], ['dolos', 'splitVolley']]) {
    const cache = new HeroAssetCache(async () => realRig(id)), a = await cache.load(id), b = await cache.load(id);
    const cue = { kind: 'auto', text: '', source, sequenceId: 42, hitIndex: 1 };
    assert.equal(a.playCombat(cue), 0);assert.equal(b.playCombat(cue), 0);advance(a, .1);advance(b, .1);
    a.playCombat(cue);advance(a, .1);advance(b, .1);
    assert.ok(point(a.object, 'hand_R').distanceTo(point(b.object, 'hand_R')) < 1e-5, 'same contact cannot restart');
    a.playCombat({ ...cue, hitIndex: 2 });advance(a, .06);advance(b, .06);
    assert.ok(point(a.object, 'hand_R').distanceTo(point(b.object, 'hand_R')) > .01, 'next contact starts a short accent');
    cache.dispose();
  }
});

test('support recipient events do not replay casts; all actual rigs reset, die, revive and dispose independently', async () => {
  for (const id of ids) {
    const cache = new HeroAssetCache(async () => realRig(id)), a = await cache.load(id), b = await cache.load(id);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();a.object.traverse(node => { if (node instanceof THREE.Mesh) { resources.add(node.geometry);for (const material of Array.isArray(node.material) ? node.material : [node.material]) resources.add(material); } });
    const disposals = new Map<object, number>();resources.forEach(resource => resource.addEventListener('dispose', () => disposals.set(resource, (disposals.get(resource) ?? 0) + 1)));
    if (id === 'ariadne') {
      a.playCombat({ kind: 'ability', source: 'mendingThread', text: '' });b.playCombat({ kind: 'ability', source: 'mendingThread', text: '' });advance(a, .2);advance(b, .2);
      a.playCombat({ kind: 'heal', source: 'mendingThread', text: '' });advance(a, .2);advance(b, .2);
      assert.ok(point(a.object, 'hand_R').distanceTo(point(b.object, 'hand_R')) < 1e-5);
    }
    a.playCombat({ kind: 'down', text: '' });advance(a, .8, false);assert.equal(a.playCombat({ kind: 'auto', text: '' }), 0);finite(a.object);
    advance(a, 1.8, true);b.resetCombat();advance(b, 1.8);
    assert.ok(a.object.getObjectByName('hand_R')!.quaternion.angleTo(b.object.getObjectByName('hand_R')!.quaternion) < .002, `${id}: revival recovers upper-body ready pose`);
    for (let i = 0; i < 5; i++) { a.playCombat({ kind: 'auto', text: '' });advance(a, .8); }
    a.resetCombat();advance(a, .2);finite(a.object);a.dispose();a.dispose();cache.dispose();
    resources.forEach(resource => assert.equal(disposals.get(resource), 1));
  }
});

test('baking real-rig motion restores every source bone and declines incomplete skeletons', () => {
  for (const id of ids) {
    const source = realRig(id), before = new Map<THREE.Object3D, number[]>();
    source.scene.traverse(node => before.set(node, [...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()]));
    assert.ok(createHeroMotionClips(id, source.scene, source.animations[0]));
    before.forEach((values, node) => assert.deepEqual([...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()], values));
  }
  assert.equal(createHeroMotionClips('heracles', new THREE.Group()), null);
});

test('dying from a moving pose freezes the real legs while the upper-body fall completes', async () => {
  for (const id of ['bacchus', ...ids]) {
    const cache = new HeroAssetCache(async () => realRig(id)), actor = await cache.load(id);
    for (let i = 0; i < 40; i++) actor.update(1 / 60, 3, true, 0);
    advance(actor, .8, false);
    const names = ['hips', 'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R'];
    const snapshot = names.map(name => {
      const bone = actor.object.getObjectByName(name)!;
      return [...bone.position.toArray(), ...bone.quaternion.toArray()];
    });
    advance(actor, .8, false);
    names.forEach((name, i) => {
      const bone = actor.object.getObjectByName(name)!;
      assert.deepEqual([...bone.position.toArray(), ...bone.quaternion.toArray()], snapshot[i], `${id}: ${name} freezes`);
    });
    for (let i = 0; i < 10; i++) actor.update(1 / 60, 3, true, 0);
    const foot = actor.object.getObjectByName('foot_L')!;
    const before = foot.quaternion.clone();
    for (let i = 0; i < 10; i++) actor.update(1 / 60, 3, true, 0);
    assert.ok(foot.quaternion.angleTo(before) > .001, `${id}: walk resumes after revival`);
    cache.dispose();
  }
});
