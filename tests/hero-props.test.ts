import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHeroProps } from '../components/game/hero-props.ts';

function rig() {
  const root = new THREE.Group();
  const bones: Record<string, THREE.Bone> = {};
  for (const name of ['hips', 'upper_arm_L', 'forearm_L', 'hand_L', 'upper_arm_R', 'forearm_R', 'hand_R']) {
    const bone = new THREE.Bone(); bone.name = name; bones[name] = bone;
  }
  bones.hips.add(bones.upper_arm_L, bones.upper_arm_R); bones.upper_arm_L.add(bones.forearm_L); bones.forearm_L.add(bones.hand_L);
  bones.upper_arm_R.add(bones.forearm_R); bones.forearm_R.add(bones.hand_R); root.add(bones.hips);
  return { root, bones };
}

test('props attach to the intended hands and dispose exactly their own resources', () => {
  const expected: Record<string, string[]> = { heracles: ['hand_R', 'forearm_L'], dolos: ['hand_L'], hecate: ['hand_R'], ariadne: ['hand_R'] };
  for (const [id, bones] of Object.entries(expected)) {
    const { root, bones: rigBones } = rig();
    const props = createHeroProps(id, root);
    assert.ok(props, id);
    for (const bone of bones) assert.ok(rigBones[bone].children.some(child => child.name === `prop:${bone}`), `${id} prop on ${bone}`);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    root.traverse(node => { const mesh = node as THREE.Mesh; if (mesh.isMesh) { geometries.add(mesh.geometry); (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => materials.add(m)); } });
    assert.ok(geometries.size > 0);
    let disposed = 0;
    geometries.forEach(g => g.addEventListener('dispose', () => { disposed++; }));
    materials.forEach(m => m.addEventListener('dispose', () => { disposed++; }));
    props.setWireframe(true);
    materials.forEach(m => assert.equal((m as THREE.MeshStandardMaterial).wireframe, true));
    props.dispose();
    assert.equal(disposed, geometries.size + materials.size, `${id} disposes every geometry and material once`);
    for (const bone of bones) assert.ok(!rigBones[bone].children.some(child => child.name.startsWith('prop:')), `${id} prop removed`);
    props.dispose();
  }
});

test('bacchus and unknown ids get no procedural prop (the thyrsus has its own layer)', () => {
  assert.equal(createHeroProps('bacchus', rig().root), null);
  assert.equal(createHeroProps('logos', rig().root), null);
  // A rig without the hand bone attaches nothing rather than throwing.
  assert.equal(createHeroProps('hecate', new THREE.Group()), null);
});
