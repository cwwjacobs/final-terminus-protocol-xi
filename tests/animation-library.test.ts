import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ActionLayer } from '../components/game/action-layer.ts';
import { actionKey, clipFor, referencedClips, ROLE_ACTIONS, UPPER_BODY_BONES } from '../components/game/role-animation.ts';
import { BACCHUS_POSE_BONES } from '../components/game/bacchus-combat.ts';
import { indexLibrary, type AnimationLibrary } from '../components/game/hero-assets.ts';
import { WEAPONS } from '../game/content.ts';

const LIBRARY = new URL('../public/assets/animations/hero-animations.glb', import.meta.url);
const RECEIPT = new URL('../public/assets/animations/hero-animations.json', import.meta.url);
const CANONICAL = ['hips', 'spine', 'chest', 'upper_chest', 'neck', 'head', 'clavicle_L', 'upper_arm_L', 'forearm_L', 'hand_L',
  'clavicle_R', 'upper_arm_R', 'forearm_R', 'hand_R', 'thigh_L', 'shin_L', 'foot_L', 'toe_L', 'thigh_R', 'shin_R', 'foot_R', 'toe_R'];

async function loadLibrary(): Promise<{ library: AnimationLibrary; bytes: Buffer }> {
  const bytes = readFileSync(LIBRARY);
  const gltf = await new Promise<{ animations: THREE.AnimationClip[]; scene: THREE.Group }>((resolve, reject) =>
    new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', resolve, reject));
  return { library: indexLibrary({ scene: gltf.scene, animations: gltf.animations }), bytes };
}

/** A 22-joint stand-in with the hero bone names; proportions do not matter for binding. */
function rig() {
  const bones = new Map<string, THREE.Bone>();
  const parents: Record<string, string | null> = { hips: null, spine: 'hips', chest: 'spine', upper_chest: 'chest', neck: 'upper_chest', head: 'neck',
    clavicle_L: 'upper_chest', upper_arm_L: 'clavicle_L', forearm_L: 'upper_arm_L', hand_L: 'forearm_L',
    clavicle_R: 'upper_chest', upper_arm_R: 'clavicle_R', forearm_R: 'upper_arm_R', hand_R: 'forearm_R',
    thigh_L: 'hips', shin_L: 'thigh_L', foot_L: 'shin_L', toe_L: 'foot_L', thigh_R: 'hips', shin_R: 'thigh_R', foot_R: 'shin_R', toe_R: 'foot_R' };
  for (const name of CANONICAL) { const bone = new THREE.Bone(); bone.name = name; bone.position.y = .2; bones.set(name, bone); }
  for (const [name, parent] of Object.entries(parents)) if (parent) bones.get(parent)!.add(bones.get(name)!);
  const root = new THREE.Group(); root.add(bones.get('hips')!);
  const flat = (bone: string, value: number) => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1].map((v, i) => i % 4 === 0 ? value : v));
  const idle = new THREE.AnimationClip('idle', 1, CANONICAL.map(bone => flat(bone, 0)));
  const walk = new THREE.AnimationClip('walk', 1, CANONICAL.map(bone => flat(bone, bone.startsWith('thigh') ? .3 : 0)));
  return { root, bones, hero: [idle, walk] };
}

test('library receipt matches the file and covers every clip the role map references', async () => {
  const { library, bytes } = await loadLibrary();
  const receipt = JSON.parse(readFileSync(RECEIPT, 'utf8'));
  assert.equal(receipt.bytes, bytes.byteLength);
  assert.equal(receipt.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(receipt.clips.map((c: { name: string }) => c.name).sort(), [...library.keys()].sort(), 'receipt lists exactly the clips in the file');
  const missing = referencedClips().filter(name => !library.has(name));
  assert.deepEqual(missing, [], 'every referenced clip exists');
  for (const clip of library.values()) {
    assert.ok(clip.duration > 0, clip.name);
    const bones = new Set(clip.tracks.map(track => track.name.split('.')[0]));
    for (const bone of CANONICAL) assert.ok(bones.has(bone), `${clip.name} drives ${bone}`);
    assert.ok(!clip.tracks.some(track => track.name.endsWith('.position') && !track.name.startsWith('hips')), `${clip.name}: only hips may translate`);
  }
  // The receipt says plainly when clips are placeholders rather than kit retargets.
  assert.equal(typeof receipt.placeholder, 'boolean');
});

test('events map to role clips; log lines and boss casts do not', () => {
  assert.equal(actionKey({ kind: 'weapon', text: `Bacchus: ${WEAPONS.cleave.name} · 660` }), 'weapon:cleave');
  assert.equal(actionKey({ kind: 'weapon', text: 'Bacchus: Unknown Skill · 1' }), null);
  assert.equal(actionKey({ kind: 'cast', text: 'Coherence Collapse' }), null);
  assert.equal(actionKey({ kind: 'phase', text: 'Crown Resonance phase 2' }), null);
  for (const source of ['criticalDash', 'splitVolley', 'rapidWeave', 'aegis']) {
    assert.equal(actionKey({ kind: 'weapon', text: WEAPONS.cleave.name, source }), null, `${source} must not reuse a weapon clip based on display text`);
  }
  for (const role of Object.keys(ROLE_ACTIONS) as (keyof typeof ROLE_ACTIONS)[]) {
    assert.ok(clipFor(role, 'hit') && clipFor(role, 'down'), `${role} reacts and dies`);
    for (const entry of Object.values(ROLE_ACTIONS[role])) if (entry) {
      assert.ok(entry.contact >= 0 && (entry.rate ?? 1) > 0);
    }
  }
  assert.equal(clipFor('hunter', 'weapon:pierce')?.clip, 'Ranged_Bow_Draw');
  assert.equal(clipFor('arcanist', 'magic')?.clip, 'Spell_Simple_Shoot');
});

test('upper-body actions take the arms, leave the legs on locomotion, and hand back cleanly', async () => {
  const { library } = await loadLibrary();
  const { root, bones, hero } = rig();
  const mixer = new THREE.AnimationMixer(root);
  const layer = new ActionLayer(mixer, 'warden', hero, library);
  const step = (dt: number, speed = 0, moving = false) => { layer.update(dt, speed, moving); mixer.update(dt); };
  step(.1);
  const armRest = bones.get('upper_arm_R')!.quaternion.clone(), thighRest = bones.get('thigh_L')!.quaternion.clone();
  const spec = clipFor('warden', 'weapon:cleave')!;
  const delay = layer.play({ kind: 'weapon', text: `Heracles: ${WEAPONS.cleave.name} · 660` });
  assert.equal(delay, spec.contact / (spec.rate ?? 1), 'returns the clip contact time');
  for (let i = 0; i < 12; i++) step(1 / 30);
  assert.ok(bones.get('upper_arm_R')!.quaternion.angleTo(armRest) > .05, 'the arm moved');
  assert.ok(bones.get('thigh_L')!.quaternion.angleTo(thighRest) < 1e-6, 'legs untouched by an upper-body clip');
  assert.equal(layer.holding, false);
  for (let i = 0; i < 60; i++) step(1 / 30);
  assert.ok(bones.get('upper_arm_R')!.quaternion.angleTo(armRest) < .02, 'back on locomotion after the clip');
  // Death holds its last frame and is not interrupted by a late hit.
  assert.ok(layer.play({ kind: 'down', text: 'Heracles falls.' }) === 0);
  for (let i = 0; i < 60; i++) step(1 / 30);
  assert.equal(layer.holding, true);
  const held = bones.get('spine')!.quaternion.clone();
  layer.play({ kind: 'hit', text: 'Heracles: Crown strike · −1' });
  for (let i = 0; i < 10; i++) step(1 / 30);
  assert.ok(bones.get('spine')!.quaternion.angleTo(held) < 1e-6, 'hit does not break the death pose');
  layer.reset(); step(.5);
  assert.equal(layer.holding, false);
  layer.dispose();
  assert.equal(layer.play({ kind: 'hit', text: 'x' }), 0, 'disposed layer is inert');
});

test('running takes over from walking by speed, with weights that always sum to one per bone', async () => {
  const { library } = await loadLibrary();
  const { root, hero } = rig();
  const mixer = new THREE.AnimationMixer(root);
  const layer = new ActionLayer(mixer, 'hunter', hero, library);
  const weights = () => {
    const total: Record<string, number> = { lower: 0, upper: 0 };
    for (const action of (mixer as unknown as { _actions: THREE.AnimationAction[] })._actions) {
      const name = action.getClip().name, w = action.getEffectiveWeight();
      if (name.endsWith(':lower')) total.lower += w; else if (name.endsWith(':upper')) total.upper += w;
    }
    return total;
  };
  for (let i = 0; i < 60; i++) { layer.update(1 / 30, 1, true); mixer.update(1 / 30); }
  let w = weights(); assert.ok(Math.abs(w.lower - 1) < 1e-3 && Math.abs(w.upper - 1) < 1e-3, `walking sums to one: ${JSON.stringify(w)}`);
  const walkWeight = (mixer as unknown as { _actions: THREE.AnimationAction[] })._actions.find(a => a.getClip().name === 'walk:lower')!.getEffectiveWeight();
  assert.ok(walkWeight > .95, 'walk dominates at 1 m/s');
  for (let i = 0; i < 90; i++) { layer.update(1 / 30, 4.5, true); mixer.update(1 / 30); }
  w = weights(); assert.ok(Math.abs(w.lower - 1) < 1e-3, `running sums to one: ${JSON.stringify(w)}`);
  const runWeight = (mixer as unknown as { _actions: THREE.AnimationAction[] })._actions.find(a => a.getClip().name === 'Running_A:lower')!.getEffectiveWeight();
  assert.ok(runWeight > .95, `run dominates at 4.5 m/s (${runWeight})`);
  layer.dispose();
});

test('reserved bones (Bacchus polearm pose) are never written by the library', async () => {
  const { library } = await loadLibrary();
  const { root, bones, hero } = rig();
  const mixer = new THREE.AnimationMixer(root);
  const layer = new ActionLayer(mixer, 'vanguard', hero, library, { reserved: BACCHUS_POSE_BONES });
  assert.equal(layer.play({ kind: 'weapon', text: `Bacchus: ${WEAPONS.cleave.name} · 660` }), 0, 'an all-reserved upper clip is skipped');
  const headRest = bones.get('head')!.quaternion.clone(), armRest = bones.get('upper_arm_R')!.quaternion.clone();
  layer.play({ kind: 'hit', text: 'Bacchus: Crown strike · −10' });
  for (let i = 0; i < 8; i++) { layer.update(1 / 30, 0, false); mixer.update(1 / 30); }
  assert.ok(bones.get('upper_arm_R')!.quaternion.angleTo(armRest) < 1e-6, 'reserved arm untouched');
  assert.ok(bones.get('head')!.quaternion.angleTo(headRest) > 1e-3, 'the unreserved head actually moves');
  assert.ok(UPPER_BODY_BONES.includes('head'));
  layer.dispose();
});
