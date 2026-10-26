import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createHeroRegalia } from '../components/game/hero-regalia.ts';
import { HeroAssetCache, type HeroAssetSource } from '../components/game/hero-assets.ts';

const ids = ['heracles', 'bacchus', 'dolos', 'hecate', 'ariadne'];
/** Read actual shipped metre-scale bone transforms without decoding textures. */
function realRig(id: string): HeroAssetSource {
  const bytes = readFileSync(new URL(`../public/assets/models/${id}.glb`, import.meta.url));
  const doc = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  const joints = new Set<number>(doc.skins[0].joints);
  const nodes: THREE.Object3D[] = doc.nodes.map((node: { name: string; translation?: number[]; rotation?: number[]; scale?: number[] }, i: number) => {
    const object = joints.has(i) ? new THREE.Bone() : new THREE.Group(); object.name = node.name;
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    return object;
  });
  doc.nodes.forEach((node: { children?: number[] }, i: number) => node.children?.forEach(child => nodes[i].add(nodes[child])));
  const scene = new THREE.Group(); doc.scenes[doc.scene || 0].nodes.forEach((i: number) => scene.add(nodes[i]));
  scene.updateMatrixWorld(true); return { scene, animations: [] };
}
const attachments = (object: THREE.Object3D) => {
  const meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  object.traverse(node => { if (node instanceof THREE.Mesh && node.name.startsWith('regalia:')) meshes.push(node); }); return meshes;
};

test('all five real heroes keep armor and weapon attachments within a fixed 30-draw-call budget', async () => {
  let total = 0;
  for (const id of ids) {
    const original = realRig(id), cache = new HeroAssetCache(async () => original);
    const hero = await cache.load(id), meshes = attachments(hero.object);
    assert.equal(meshes.length, 6, `${id} armor plus weapon detail`); total += meshes.length;
    for (const mesh of meshes) {
      assert.ok(mesh.parent instanceof THREE.Bone || mesh.parent?.name.startsWith('prop:') || mesh.parent?.name === 'bacchus-thyrsus');
      assert.equal(mesh.material.transparent, false); assert.equal(mesh.material.map, null);
      assert.equal(mesh.material.vertexColors, true); assert.equal(mesh.castShadow, false);
      assert.ok(mesh.geometry.attributes.position.count < 5000, `${mesh.name} bounded vertices`);
      mesh.geometry.computeBoundingSphere(); assert.ok(mesh.geometry.boundingSphere!.radius < (mesh.name.endsWith('weapon-inlay') ? .8 : .6), mesh.name);
    }
    // Weapon release moves fitted hand props; armor stays bound to the same
    // shoulder/forearm and all attachments remain inside the hero action space.
    hero.playCombat(id === 'hecate' ? { kind: 'magic', element: 'lightning', text: '' } : { kind: 'weapon', weaponId: 'resonance', text: '' });
    for (let frame = 0; frame < 120; frame++) {
      hero.update(1 / 60, 0, true, .7); hero.object.updateMatrixWorld(true);
      for (const mesh of meshes) {
        const bounds = new THREE.Box3().setFromObject(mesh), center = bounds.getCenter(new THREE.Vector3());
        assert.ok(center.toArray().every(Number.isFinite)); assert.ok(center.length() < 3.6, `${mesh.name} is fitted to rig scale`);
      }
    }
    assert.equal(attachments(original.scene).length, 0, 'cached source model is never decorated');
    cache.dispose();
  }
  assert.equal(total, 30);
});

test('regalia follows bone motion, has isolated accents, and releases only its own buffers once', () => {
  const { scene } = realRig('hecate'), other = realRig('hecate').scene;
  const baseline = new Map<string, number[]>(); scene.traverse(node => { if (node instanceof THREE.Bone) baseline.set(node.name, [...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()]); });
  const layer = createHeroRegalia('hecate', scene)!, second = createHeroRegalia('hecate', other)!;
  assert.ok(layer); assert.equal(layer.meshCount, 5, 'a naked compatible rig has no fabricated weapon');
  const meshes = attachments(scene), secondPaint = attachments(other)[0].material;
  scene.traverse(node => { if (node instanceof THREE.Bone) assert.deepEqual([...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()], baseline.get(node.name)); });
  const shoulder = meshes.find(mesh => mesh.name.endsWith('shoulder-L'))!;
  scene.updateMatrixWorld(true); const before = new THREE.Box3().setFromObject(shoulder).getCenter(new THREE.Vector3());
  shoulder.parent!.rotation.z += .7; scene.updateMatrixWorld(true);
  const after = new THREE.Box3().setFromObject(shoulder).getCenter(new THREE.Vector3());
  assert.ok(before.distanceTo(after) > .01, 'attached metal follows the animated joint');
  const paint = meshes[0].material; layer.update(1, true); assert.ok(paint.emissiveIntensity > secondPaint.emissiveIntensity);
  layer.update(NaN, true); assert.equal(paint.emissiveIntensity, .015);
  layer.update(1, false); assert.equal(paint.emissiveIntensity, 0); layer.reset(); assert.equal(paint.emissiveIntensity, .015);
  layer.setWireframe(true); assert.equal(paint.wireframe, true); assert.equal(secondPaint.wireframe, false);
  const resources = new Set<THREE.BufferGeometry | THREE.Material>([paint, ...meshes.map(mesh => mesh.geometry)]), disposed = new Map<object, number>();
  resources.forEach(resource => resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1)));
  layer.dispose(); layer.dispose(); resources.forEach(resource => assert.equal(disposed.get(resource), 1));
  assert.equal(attachments(scene).length, 0); assert.equal(attachments(other).length, 5); second.dispose();
});

test('unknown and incompatible skeletons remain unchanged', () => {
  const { scene } = realRig('heracles');
  assert.equal(createHeroRegalia('logos', scene), null);
  const partial = new THREE.Group(), arm = new THREE.Bone(); arm.name = 'upper_arm_L'; partial.add(arm);
  assert.equal(createHeroRegalia('heracles', partial), null); assert.equal(arm.children.length, 0);
});
