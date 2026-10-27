import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createLogosRig, parseLogosRigSource, type LogosRigState } from '../components/game/logos-rig.ts';

function state(): LogosRigState {
  return {
    encounter: 'logos', logos: { stage: 'giant', elapsed: 2 },
    boss: { x: 0, z: -12, hp: 10000, stunRemaining: 0 },
    enemies: [
      { id: 'left-hand', x: -7, z: -3, hp: 8000, target: 0, attackTimer: 4, stunRemaining: 0 },
      { id: 'right-hand', x: 7, z: -3, hp: 8000, target: 0, attackTimer: 4, stunRemaining: 0 },
    ],
    party: [{ x: 0, z: 3, hp: 1000 }],
  };
}
async function anatomy() {
  const bytes = readFileSync(new URL('../public/assets/models/bacchus.glb', import.meta.url));
  return parseLogosRigSource(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
function near(actual: number, expected: number, tolerance = .0001) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be near ${expected}`);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('real source anatomy supplies continuous skinned volume, exact palm contacts and a 20m statue', async () => {
  const source = await anatomy();
  const rig = createLogosRig('high', { sentinels: false, loader: async () => source });
  await rig.ready;
  assert.equal(rig.stats.assetStatus, 'ready'); assert.equal(rig.stats.source, 'bacchus-skinned-glb');
  const snapshot = freeze(state()); rig.update(.05, snapshot, true);
  const palm = new THREE.Vector3();
  for (const enemy of snapshot.enemies) {
    rig.targets.get(enemy.id)!.getWorldPosition(palm);
    near(palm.x, enemy.x); near(palm.y, 4); near(palm.z, enemy.z);
  }
  rig.head.getWorldPosition(palm); near(palm.y, 17.3);
  assert.equal(rig.targets.get('head'), rig.targets.get('boss'));
  assert.equal(rig.targets.get('echo-0'), rig.leftHand);
  assert.ok(rig.leftHand.parent!.parent!.parent instanceof THREE.SkinnedMesh, 'palm lives in an articulated hand skin');
  const bounds = new THREE.Box3().setFromObject(rig.root);
  assert.ok(bounds.max.y > 19.8 && bounds.max.y < 20.2, `real skin bounds ${bounds.max.y}`);
  assert.ok(bounds.min.y < -7, 'the enlarged body rises through the arena, with legs below its floor');
  assert.ok(rig.root.getObjectByName('Logos-giant')!.position.y < -7);
  assert.ok(bounds.max.z - bounds.min.z > 8, 'body, forearms and hands occupy true 3D depth');
  assert.ok(rig.root.getObjectByName('Logos-giant-sculpted-himation-sash') instanceof THREE.SkinnedMesh);
  assert.ok(rig.root.getObjectByName('Logos-giant-solid-laurel-crown') instanceof THREE.Mesh);
  const meshes: THREE.Mesh[] = []; rig.root.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  assert.ok(meshes.every(mesh => !(mesh.geometry instanceof THREE.PlaneGeometry)), 'no billboards');
  assert.ok(rig.stats.maxArmStretch >= 1 && rig.stats.maxArmStretch <= 1.4, 'enlarged anatomy reaches contacts without extreme arm extension');
  rig.dispose();
});

test('emerged giant keeps head and palms fixed when moved, with collapse added to its below-floor root', async () => {
  const rig = createLogosRig('low', { sentinels: false, loader: anatomy }); await rig.ready;
  const snapshot = state(), point = new THREE.Vector3(); rig.update(0, snapshot, true);
  const baseY = rig.root.getObjectByName('Logos-giant')!.position.y;
  snapshot.boss.x = 3; snapshot.boss.z = -14;
  snapshot.enemies[0].x = -4; snapshot.enemies[1].x = 10;
  snapshot.enemies.forEach(enemy => { enemy.z -= 2; });
  rig.update(0, freeze(structuredClone(snapshot)), true);
  near(rig.head.getWorldPosition(point).y, 17.3);
  for (const enemy of snapshot.enemies) {
    rig.targets.get(enemy.id)!.getWorldPosition(point); near(point.x, enemy.x); near(point.y, 4); near(point.z, enemy.z);
  }
  snapshot.logos = { stage: 'collapse', elapsed: 3 }; rig.update(0, snapshot, false);
  near(rig.root.getObjectByName('Logos-giant')!.position.y, baseY - 2.5);
  near(rig.leftHand.getWorldPosition(point).y, 1.5);
  rig.dispose();
});

test('six seated skeletons stand and move at authoritative enemy positions with bounded resources', async () => {
  const rig = createLogosRig('low', { loader: anatomy }); await rig.ready;
  const snapshot = state(); snapshot.logos = { stage: 'descent', elapsed: 35 }; snapshot.enemies = [];
  rig.update(.05, freeze(structuredClone(snapshot)), true);
  const giant = rig.root.getObjectByName('Logos-giant')!; assert.equal(giant.visible, false);
  const point = new THREE.Vector3();
  for (let i = 0; i < 6; i++) {
    const seated = rig.root.getObjectByName(`Logos-sentinel-${i}`)!;
    assert.equal(seated.visible, true); near(Math.hypot(seated.position.x, seated.position.z), 18);
    rig.targets.get(`sentinel-${i}`)!.getWorldPosition(point);
    assert.ok(point.y > 1.5 && point.y < 2, 'contact follows lowered seated torso');
  }
  snapshot.logos = { stage: 'sentinels', elapsed: 4 };
  snapshot.enemies = Array.from({ length: 6 }, (_, i) => ({ id: `sentinel-${i}`, x: i - 3, z: i * .7, hp: i === 5 ? 0 : 100, target: 0, attackTimer: .3, stunRemaining: 0 }));
  const before = structuredClone(snapshot), count = rig.stats.bones, draws = rig.stats.drawCalls;
  for (let frame = 0; frame < 40; frame++) rig.update(.05, snapshot, false);
  assert.deepEqual(snapshot, before);
  for (let i = 0; i < 6; i++) {
    const figure = rig.root.getObjectByName(`Logos-sentinel-${i}`)!;
    if (i !== 5) { near(figure.position.x, snapshot.enemies[i].x); near(figure.position.z, snapshot.enemies[i].z); }
    assert.equal(figure.visible, i !== 5);
  }
  assert.equal(rig.stats.bones, count); assert.equal(rig.stats.drawCalls, draws);
  assert.ok(rig.stats.drawCalls <= 50); assert.ok(rig.stats.triangles < 215000);
  assert.ok(rig.stats.geometryBytes < 1600000); assert.equal(rig.stats.bones, 378);
  rig.dispose();
});

test('hidden encounters and inactive or dead stage figures skip skeleton posing', () => {
  const rig = createLogosRig('low', { loader: false });
  const snapshot = state(); let giantUpdates = 0, sentinelUpdates = 0;
  const giantBone = rig.root.getObjectByName('Logos-giant')!.getObjectByName('upper_arm_R')!;
  const sentinelBone = rig.root.getObjectByName('Logos-sentinel-0')!.getObjectByName('upper_arm_R')!;
  const giantUpdate = giantBone.updateWorldMatrix.bind(giantBone), sentinelUpdate = sentinelBone.updateWorldMatrix.bind(sentinelBone);
  giantBone.updateWorldMatrix = (parents, children) => { giantUpdates++; giantUpdate(parents, children); };
  sentinelBone.updateWorldMatrix = (parents, children) => { sentinelUpdates++; sentinelUpdate(parents, children); };
  snapshot.encounter = 'crown'; rig.update(.05, snapshot); assert.equal(giantUpdates, 0); assert.equal(sentinelUpdates, 0);
  assert.equal(rig.head.visible, false); assert.equal(rig.targets.get('sentinel-0')!.visible, false);
  snapshot.encounter = 'logos'; snapshot.logos = { stage: 'descent', elapsed: 20 }; rig.update(.05, snapshot, true);
  assert.equal(giantUpdates, 0); assert.ok(sentinelUpdates > 0); sentinelUpdates = 0;
  snapshot.logos = { stage: 'sentinels', elapsed: 3 }; snapshot.enemies = [{ id: 'sentinel-0', x: 2, z: 3, hp: 0, target: 0, attackTimer: 1, stunRemaining: 0 }];
  rig.update(.05, snapshot); assert.equal(giantUpdates, 0); assert.equal(sentinelUpdates, 0);
  assert.equal(rig.targets.get('sentinel-0')!.visible, false);
  snapshot.logos.stage = 'escaped'; rig.update(.05, snapshot); assert.equal(giantUpdates, 0); assert.equal(sentinelUpdates, 0);
  rig.dispose();
});

test('hand attack, stun, reduced motion, stage changes and hostile numeric inputs keep finite transforms', () => {
  const rig = createLogosRig('low', { sentinels: false, loader: false });
  const snapshot = state(); snapshot.enemies[0].attackTimer = .325;
  rig.update(.05, snapshot, false);
  const point = rig.leftHand.getWorldPosition(new THREE.Vector3()); assert.ok(point.y > 4.8);
  snapshot.enemies[0].stunRemaining = 2; rig.update(.05, snapshot, false); near(rig.leftHand.getWorldPosition(point).y, 4);
  snapshot.enemies[0].stunRemaining = 0; rig.update(.05, snapshot, true); near(rig.leftHand.getWorldPosition(point).y, 4);
  snapshot.enemies[0].x = -18; snapshot.enemies[1].z = 12;
  rig.update(.05, snapshot, true); near(rig.leftHand.getWorldPosition(point).x, -18); near(rig.rightHand.getWorldPosition(point).z, 12);
  snapshot.boss.x = NaN; snapshot.boss.z = Infinity; snapshot.enemies[0].x = NaN; snapshot.enemies[1].z = -Infinity;
  snapshot.logos!.elapsed = Infinity; rig.update(NaN, snapshot, false);
  rig.root.traverse(object => assert.ok([...object.position, ...object.quaternion, ...object.scale, ...object.matrixWorld.elements].every(Number.isFinite), object.name));
  snapshot.logos = { stage: 'collapse', elapsed: 4 }; rig.update(.1, snapshot, false);
  assert.ok(rig.root.getObjectByName('Logos-giant')!.position.y < 0);
  snapshot.logos = { stage: 'escaped', elapsed: 0 }; rig.update(.05, snapshot, false); assert.equal(rig.root.visible, false);
  rig.reset(); assert.equal(rig.root.visible, false); assert.equal(rig.stats.maxArmStretch, 1);
  snapshot.encounter = 'crown'; snapshot.logos.stage = 'giant'; rig.update(.05, snapshot); assert.equal(rig.root.visible, false);
  rig.dispose();
});

test('shader adds restrained stone veins without textures and late loading/disposal is idempotent', async () => {
  let resolve!: (source: THREE.Group) => void;
  const rig = createLogosRig('low', { sentinels: false, loader: () => new Promise(ok => { resolve = ok; }) });
  await Promise.resolve();
  const meshes: THREE.Mesh[] = []; rig.root.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  const stone = meshes.find(mesh => (mesh.material as THREE.Material).name.includes('polished-black'))!.material as THREE.MeshStandardMaterial;
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  stone.onBeforeCompile(shader as Parameters<typeof stone.onBeforeCompile>[0], null as unknown as THREE.WebGLRenderer);
  assert.match(shader.vertexShader, /vLogosStone = position/); assert.match(shader.fragmentShader, /logosVein/);
  assert.equal(stone.map, null); assert.ok(stone.roughness < .35);
  let materialsFreed = 0; stone.addEventListener('dispose', () => { materialsFreed++; });
  const source = await anatomy(); let sourceFreed = 0;
  source.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.addEventListener('dispose', () => { sourceFreed++; }); });
  rig.dispose(); rig.dispose(); resolve(source); await rig.ready;
  assert.equal(materialsFreed, 1); assert.equal(sourceFreed, 1); assert.equal(rig.targets.size, 0);
  assert.equal(rig.stats.assetStatus, 'disposed'); assert.equal(rig.root.children.length, 0);
  rig.update(.1, state()); assert.equal(rig.root.visible, false);
});

test('failed or invalid anatomy keeps the volumetric fallback ready for the scene', async () => {
  for (const loader of [async () => { throw new Error('offline'); }, async () => new THREE.Group()]) {
    const rig = createLogosRig('low', { sentinels: false, loader }); await rig.ready;
    assert.equal(rig.stats.assetStatus, 'fallback'); rig.update(.05, freeze(state()), true);
    assert.equal(rig.root.visible, true); assert.equal(rig.stats.source, 'procedural-skinned-fallback');
    const point = rig.leftHand.getWorldPosition(new THREE.Vector3()); near(point.x, -7); near(point.y, 4); near(point.z, -3);
    rig.dispose();
  }
});
