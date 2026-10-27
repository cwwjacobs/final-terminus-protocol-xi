import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createHeroDivinity } from '../components/game/hero-divinity.ts';
import { HeroAssetCache, type HeroAssetSource } from '../components/game/hero-assets.ts';

function realRig(id: string): HeroAssetSource {
  const bytes = readFileSync(new URL(`../public/assets/models/${id}.glb`, import.meta.url));
  const doc = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12))), joints = new Set<number>(doc.skins[0].joints);
  const nodes: THREE.Object3D[] = doc.nodes.map((node: { name: string; translation?: number[]; rotation?: number[]; scale?: number[] }, i: number) => {
    const object = joints.has(i) ? new THREE.Bone() : new THREE.Group(); object.name = node.name;
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale); return object;
  });
  doc.nodes.forEach((node: { children?: number[] }, i: number) => node.children?.forEach(child => nodes[i].add(nodes[child])));
  const scene = new THREE.Group(); doc.scenes[doc.scene || 0].nodes.forEach((i: number) => scene.add(nodes[i])); scene.updateMatrixWorld(true);
  return { scene, animations: [] };
}
const meshes = (object: THREE.Object3D, prefix: string) => {
  const out: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  object.traverse(node => { if (node instanceof THREE.Mesh && node.name.startsWith(prefix)) out.push(node); }); return out;
};

test('Son of Zeus changes the wardrobe on the real Heracles rig with seven preallocated opaque meshes', async () => {
  const source = realRig('heracles'), cache = new HeroAssetCache(async () => source), hero = await cache.load('heracles');
  const originalBody = hero.object.getObjectByName('Heracles_body')!, divine = meshes(hero.object, 'divinity:'), normal = meshes(hero.object, 'regalia:');
  assert.ok(originalBody); assert.equal(divine.length, 7); assert.equal(normal.length, 6);
  assert.ok(divine.every(mesh => !mesh.visible)); assert.ok(normal.every(mesh => mesh.visible));
  const bones: number[][] = []; hero.object.traverse(node => { if (node instanceof THREE.Bone) bones.push([...node.position.toArray(), ...node.quaternion.toArray()]); });
  const geometry = divine.map(mesh => mesh.geometry), materials = divine.map(mesh => mesh.material);
  hero.setDivineForm!(true); hero.setDivineForm!(true);
  assert.equal(originalBody.visible, true, 'painted body and real face remain visible');
  assert.ok(divine.every(mesh => mesh.visible)); assert.ok(normal.every(mesh => !mesh.visible));
  assert.equal(hero.object.getObjectByName('prop:hand_R')!.visible, false); assert.equal(hero.object.getObjectByName('prop:forearm_L')!.visible, false);
  let index = 0; hero.object.traverse(node => { if (node instanceof THREE.Bone) assert.deepEqual([...node.position.toArray(), ...node.quaternion.toArray()], bones[index++]); });
  for (let i = 0; i < 50; i++) { hero.setDivineForm!(false); hero.setDivineForm!(true); }
  assert.deepEqual(divine.map(mesh => mesh.geometry), geometry); assert.deepEqual(divine.map(mesh => mesh.material), materials);
  for (const mesh of divine) {
    assert.equal(mesh.material.transparent, false); assert.equal(mesh.material.map, null); assert.equal(mesh.castShadow, false);
    assert.ok(!['SphereGeometry', 'ConeGeometry'].includes(mesh.geometry.type), 'no substitute spherical head or cone outfit');
    assert.ok(mesh.geometry.attributes.position.count < 10000);
  }
  hero.resetCombat(); assert.ok(divine.every(mesh => mesh.visible), 'presentation reset preserves the selected form');
  hero.setDivineForm!(false); assert.ok(divine.every(mesh => !mesh.visible)); assert.ok(normal.every(mesh => mesh.visible));
  assert.equal(hero.object.getObjectByName('prop:hand_R')!.visible, true); assert.equal(meshes(source.scene, 'divinity:').length, 0);
  cache.dispose();
});

test('divine cloth and head details follow real action poses without replacing root, feet or skeleton', async () => {
  const cache = new HeroAssetCache(async () => realRig('heracles')), hero = await cache.load('heracles');
  hero.setDivineForm!(true); const divine = meshes(hero.object, 'divinity:');
  const hair = divine.find(mesh => mesh.name.endsWith('silver-hair-beard-laurel'))!, head = hero.object.getObjectByName('head')!;
  assert.equal(hair.parent, head); hair.geometry.computeBoundingBox();
  const size = hair.geometry.boundingBox!.getSize(new THREE.Vector3()); assert.ok(size.x < .4 && size.y < .5 && size.z < .45, 'hair and upper-chest beard fit the shipped head scale');
  const garment = divine.find(mesh => mesh.name.endsWith('folded-toga'))!;
  const lower = divine.find(mesh => mesh.name.endsWith('pleated-chiton'))!;
  assert.ok(garment instanceof THREE.SkinnedMesh && lower instanceof THREE.SkinnedMesh);
  assert.ok(garment.skeleton.bones.every(bone => hero.object.getObjectByName(bone.name) === bone));
  hero.playCombat({ kind: 'weapon', weaponId: 'resonance', text: '' }); let moved = 0;
  hero.object.updateMatrixWorld(true); garment.skeleton.update();
  let upperVertex = 0; const positions = garment.geometry.attributes.position;
  for (let i = 1; i < positions.count; i++) if (positions.getY(i) > positions.getY(upperVertex)) upperVertex = i;
  const before = garment.getVertexPosition(upperVertex, new THREE.Vector3());
  for (let frame = 0; frame < 100; frame++) {
    hero.update(1 / 60, 0, true, .4); hero.object.updateMatrixWorld(true); garment.skeleton.update();
    moved = Math.max(moved, before.distanceTo(garment.getVertexPosition(upperVertex, new THREE.Vector3())));
    for (const mesh of [garment, lower]) {
      for (let i = 0; i < mesh.geometry.attributes.position.count; i += 17) {
        const point = mesh.getVertexPosition(i, new THREE.Vector3()); assert.ok(point.toArray().every(Number.isFinite));
        assert.ok(point.length() < 2.2 && point.y > -.025, 'cloth stays in the real hero action envelope and clears the ground');
      }
    }
    assert.equal(hair.parent, head); assert.deepEqual(hero.object.position.toArray(), [0, 0, 0]);
  }
  assert.ok(moved > .01, 'cloth uses animated torso skinning');
  hero.update(.05, 0, false, 0); assert.ok(divine.every(mesh => !mesh.visible), 'death silences and hides the transformation');
  hero.setDivineForm!(false); cache.dispose();
});

test('form materials and skeleton buffers are isolated, wireframe-aware, and disposed exactly once', async () => {
  const cache = new HeroAssetCache(async () => realRig('heracles')), a = await cache.load('heracles'), b = await cache.load('heracles');
  const am = meshes(a.object, 'divinity:'), bm = meshes(b.object, 'divinity:'); a.setDivineForm!(true); a.setWireframe(true);
  assert.ok(am.every(mesh => mesh.material.wireframe)); assert.ok(bm.every(mesh => !mesh.visible && !mesh.material.wireframe));
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  for (const mesh of am) { resources.add(mesh.geometry); resources.add(mesh.material); if (mesh instanceof THREE.SkinnedMesh) skeletons.add(mesh.skeleton); }
  skeletons.forEach(skeleton => { skeleton.computeBoneTexture(); resources.add(skeleton.boneTexture!); });
  const counts = new Map<object, number>(); resources.forEach(resource => resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) ?? 0) + 1)));
  a.dispose(); a.dispose(); resources.forEach(resource => assert.equal(counts.get(resource), 1));
  assert.ok(bm.every(mesh => mesh.parent)); cache.dispose();
});

test('other heroes and incomplete rigs never receive a surrogate Zeus body', async () => {
  for (const id of ['bacchus', 'dolos', 'hecate', 'ariadne']) {
    const cache = new HeroAssetCache(async () => realRig(id)), hero = await cache.load(id);
    hero.setDivineForm!(true); assert.equal(meshes(hero.object, 'divinity:').length, 0); assert.ok(meshes(hero.object, 'regalia:').every(mesh => mesh.visible)); cache.dispose();
  }
  assert.equal(createHeroDivinity('heracles', new THREE.Group()), null);
});

test('garments borrow a real mesh skeleton without allocating or disposing another bone texture', () => {
  const { scene } = realRig('heracles'), bones: THREE.Bone[] = [];
  scene.traverse(node => { if (node instanceof THREE.Bone) bones.push(node); });
  const body = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
  scene.add(body); body.bind(new THREE.Skeleton(bones)); body.skeleton.computeBoneTexture();
  let disposed = 0; body.skeleton.boneTexture!.addEventListener('dispose', () => { disposed++; });
  const form = createHeroDivinity('heracles', scene)!;
  const toga = meshes(scene, 'divinity:').find(mesh => mesh.name.endsWith('folded-toga'))!;
  assert.ok(toga instanceof THREE.SkinnedMesh); assert.equal(toga.skeleton, body.skeleton);
  form.dispose(); assert.equal(disposed, 0, 'the original body retains ownership of its shared skeleton');
  body.skeleton.dispose(); assert.equal(disposed, 1); body.geometry.dispose(); (body.material as THREE.Material).dispose();
});

function indexedRig(id: string) {
  const source = realRig(id), bytes = readFileSync(new URL(`../public/assets/models/${id}.glb`, import.meta.url));
  const length = bytes.readUInt32LE(12), doc = JSON.parse(bytes.toString('utf8', 20, 20 + length)), binary = bytes.subarray(28 + length), primitive = doc.meshes[0].primitives[0];
  const values = (index: number) => {
    const a = doc.accessors[index], v = doc.bufferViews[a.bufferView], width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type as 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4'];
    const size = a.componentType === 5126 ? 4 : a.componentType === 5121 ? 1 : 2;
    return Array.from({ length: a.count * width }, (_, i) => {
      const offset = (v.byteOffset || 0) + (a.byteOffset || 0) + Math.floor(i / width) * (v.byteStride || width * size) + (i % width) * size;
      return a.componentType === 5126 ? binary.readFloatLE(offset) : a.componentType === 5121 ? binary.readUInt8(offset) : binary.readUInt16LE(offset);
    });
  };
  const geometry = new THREE.BufferGeometry();
  for (const [key, name, width] of [['POSITION', 'position', 3], ['JOINTS_0', 'skinIndex', 4], ['WEIGHTS_0', 'skinWeight', 4], ['TEXCOORD_0', 'uv', 2]] as const) {
    geometry.setAttribute(name, name === 'skinIndex' ? new THREE.Uint16BufferAttribute(values(primitive.attributes[key]), width) : new THREE.Float32BufferAttribute(values(primitive.attributes[key]), width));
  }
  geometry.setIndex(values(primitive.indices));
  const body = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial()), placeholder = source.scene.getObjectByName(`${id[0].toUpperCase()}${id.slice(1)}_body`)!;
  body.name = placeholder.name; placeholder.parent!.add(body); placeholder.removeFromParent();
  const skeleton = new THREE.Skeleton(doc.skins[0].joints.map((i: number) => source.scene.getObjectByName(doc.nodes[i].name) as THREE.Bone)); body.bind(skeleton);
  return { source, geometry };
}

test('the actual indexed Heracles body sheds its hood and covered armor without changing source geometry', async () => {
  const { source, geometry } = indexedRig('heracles'), indicesBefore = Array.from(geometry.index!.array);
  const cache = new HeroAssetCache(async () => source), hero = await cache.load('heracles');
  const original = hero.object.getObjectByName('Heracles_body') as THREE.SkinnedMesh, anatomy = hero.object.getObjectByName('divinity:heracles:imported-anatomy') as THREE.SkinnedMesh;
  assert.ok(anatomy); assert.equal(meshes(hero.object, 'divinity:').length, 8);
  assert.equal(anatomy.skeleton, original.skeleton); assert.equal(anatomy.material, original.material);
  assert.ok(anatomy.geometry.index!.count > 3000 && anatomy.geometry.index!.count < original.geometry.index!.count);
  hero.setDivineForm!(true); assert.equal(original.visible, false); assert.equal(anatomy.visible, true);
  assert.deepEqual(Array.from(geometry.index!.array), indicesBefore); assert.notEqual(anatomy.geometry, original.geometry);
  let freed = 0; anatomy.geometry.addEventListener('dispose', () => { freed++; });
  hero.setDivineForm!(false); assert.equal(original.visible, true); assert.equal(anatomy.visible, false);
  hero.dispose(); hero.dispose(); assert.equal(freed, 1); cache.dispose();
});

test('runtime Zeus reuses one cached clean anatomy source, retargeted onto Heracles controlled bones', async () => {
  const heracles = indexedRig('heracles'), bacchus = indexedRig('bacchus'), requests: string[] = [];
  const cache = new HeroAssetCache(async url => { requests.push(url); return url.includes('bacchus') ? bacchus.source : heracles.source; }, { divineAnatomy: true });
  const before = Array.from(bacchus.geometry.attributes.position.array);
  const [hero, companion] = await Promise.all([cache.load('heracles'), cache.load('bacchus')]);
  assert.equal(requests.filter(url => url.includes('bacchus')).length, 1, 'existing party asset is reused');
  const original = hero.object.getObjectByName('Heracles_body') as THREE.SkinnedMesh, anatomy = hero.object.getObjectByName('divinity:heracles:imported-anatomy') as THREE.SkinnedMesh;
  assert.equal(anatomy.skeleton, original.skeleton); assert.notEqual(anatomy.material, (bacchus.source.scene.getObjectByName('Bacchus_body') as THREE.SkinnedMesh).material);
  hero.setDivineForm!(true); hero.playCombat({ kind: 'weapon', weaponId: 'resonance', text: '' });
  for (let frame = 0; frame < 90; frame++) {
    hero.update(1 / 60, 0, true, 0); hero.object.updateMatrixWorld(true); anatomy.skeleton.update();
    for (let i = 0; i < anatomy.geometry.attributes.position.count; i += 41) {
      const p = anatomy.getVertexPosition(i, new THREE.Vector3()); assert.ok(p.toArray().every(Number.isFinite)); assert.ok(p.length() < 3, 'clean anatomy stays on controlled rig');
    }
  }
  assert.deepEqual(Array.from(bacchus.geometry.attributes.position.array), before); assert.equal(companion.object.getObjectByName('Bacchus_body')!.visible, true);
  hero.setWireframe(true); assert.equal((anatomy.material as THREE.MeshStandardMaterial).wireframe, true);
  cache.dispose();
});
