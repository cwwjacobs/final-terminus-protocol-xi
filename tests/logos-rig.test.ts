import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createLogosRig, parseLogosRigSource, type LogosRigState } from '../components/game/logos-rig.ts';

function state(): LogosRigState {
  return {
    encounter: 'logos', logos: { stage: 'giant', elapsed: 2 },
    boss: { x: 0, z: -20, hp: 10000, stunRemaining: 0 },
    enemies: [
      { id: 'left-hand', x: -19, z: -4, hp: 8000, target: 0, attackTimer: 4, stunRemaining: 0 },
      { id: 'right-hand', x: 19, z: -4, hp: 8000, target: 0, attackTimer: 4, stunRemaining: 0 },
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

test('source anatomy becomes a huge readable face and independent broad hands outside the play space', async () => {
  const source = await anatomy();
  const rig = createLogosRig('high', { sentinels: false, loader: async () => source });
  await rig.ready;
  assert.equal(rig.stats.assetStatus, 'ready'); assert.equal(rig.stats.source, 'bacchus-skinned-glb');
  const snapshot = freeze(state()); rig.update(.05, snapshot, true);
  const palm = new THREE.Vector3();
  for (const enemy of snapshot.enemies) {
    rig.targets.get(enemy.id)!.getWorldPosition(palm);
    near(palm.x, enemy.x); near(palm.y, 3.8); near(palm.z, enemy.z);
  }
  rig.head.getWorldPosition(palm); near(palm.y, 10);
  assert.equal(rig.targets.get('head'), rig.targets.get('boss'));
  assert.equal(rig.targets.get('echo-0'), rig.leftHand);
  assert.ok(rig.leftHand.parent!.parent!.parent instanceof THREE.SkinnedMesh, 'palm lives in an articulated hand skin');
  const giant = rig.root.getObjectByName('Logos-giant')!;
  const bounds = new THREE.Box3().setFromObject(giant), size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.x > 9 && size.x < 11 && size.y > 10 && size.y < 13, 'the face itself is monumental');
  assert.ok(bounds.min.y > 3 && bounds.max.z < -19, 'visible geometry stays at the far edge without a torso over the arena');
  assert.equal(rig.root.getObjectByName('Logos-giant-sculpted-himation-sash'), undefined);
  assert.ok(rig.root.getObjectByName('Logos-giant-solid-laurel-crown') instanceof THREE.Mesh);
  for (const side of ['left', 'right']) {
    const hand = rig.root.getObjectByName(`Logos-edge-${side}-hand`)!;
    const handBounds = new THREE.Box3().setFromObject(hand), handSize = handBounds.getSize(new THREE.Vector3());
    assert.ok(handSize.x > 3 && handSize.y > 6 && handSize.y < 9, 'broad palms and separated fingers have substantial volume');
    assert.ok(side === 'left' ? handBounds.max.x < -16 : handBounds.min.x > 16, 'hands stay at the lateral edges');
  }
  const meshes: THREE.Mesh[] = []; rig.root.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  assert.ok(meshes.every(mesh => !(mesh.geometry instanceof THREE.PlaneGeometry)), 'no billboards');
  giant.traverse(object => { if (object instanceof THREE.Mesh) assert.equal(object.layers.mask, 3, 'giant receives its dedicated light layer'); });
  const stone = meshes.find(mesh => (mesh.material as THREE.Material).name === 'Logos-luminous-silver-stone')!.material as THREE.MeshStandardMaterial;
  assert.ok(stone.color.r > .2 && stone.emissiveIntensity >= .2, 'giant stone stays readable without a lightning flash');
  assert.equal(rig.stats.maxArmStretch, 1, 'edge hands need no stretching arm solve');
  rig.dispose();
});

test('head and palm contacts match authoritative coordinates and descend during collapse', async () => {
  const rig = createLogosRig('low', { sentinels: false, loader: anatomy }); await rig.ready;
  const snapshot = state(), point = new THREE.Vector3(); rig.update(0, snapshot, true);
  snapshot.boss.x = 3; snapshot.boss.z = -14;
  snapshot.enemies[0].x = -4; snapshot.enemies[1].x = 10;
  snapshot.enemies.forEach(enemy => { enemy.z -= 2; });
  rig.update(0, freeze(structuredClone(snapshot)), true);
  near(rig.head.getWorldPosition(point).y, 10);
  for (const enemy of snapshot.enemies) {
    rig.targets.get(enemy.id)!.getWorldPosition(point); near(point.x, enemy.x); near(point.y, 3.8); near(point.z, enemy.z);
  }
  snapshot.logos = { stage: 'collapse', elapsed: 3 }; rig.update(0, snapshot, false);
  near(rig.head.getWorldPosition(point).y, 6);
  near(rig.leftHand.getWorldPosition(point).y, .3);
  rig.dispose();
});

test('six seated skeletons stand and move at authoritative enemy positions with bounded resources', async () => {
  const rig = createLogosRig('low', { loader: anatomy }); await rig.ready;
  const snapshot = state(); snapshot.logos = { stage: 'descent', elapsed: 35 }; snapshot.enemies = [];
  rig.update(.05, freeze(structuredClone(snapshot)), true);
  const giant = rig.root.getObjectByName('Logos-giant')!; assert.equal(giant.visible, true);
  assert.equal(rig.head.visible, false); assert.equal(rig.leftHand.visible, false);
  const point = new THREE.Vector3();
  for (let i = 0; i < 6; i++) {
    const seated = rig.root.getObjectByName(`Logos-sentinel-${i}`)!;
    assert.equal(seated.visible, true); near(Math.hypot(seated.position.x, seated.position.z), 34);
    rig.targets.get(`sentinel-${i}`)!.getWorldPosition(point);
    assert.ok(point.y > 3.8 && point.y < 5, 'contact follows the floating seated torso');
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
  assert.ok(rig.stats.geometryBytes < 2000000); assert.equal(rig.stats.bones, 378);
  rig.dispose();
});

test('distant skeletons remain posed while inactive targets and escaped figures stay hidden', () => {
  const rig = createLogosRig('low', { loader: false });
  const snapshot = state(); let giantUpdates = 0, sentinelUpdates = 0;
  const giantBone = rig.root.getObjectByName('Logos-giant')!.getObjectByName('upper_arm_R')!;
  const sentinelBone = rig.root.getObjectByName('Logos-sentinel-0')!.getObjectByName('upper_arm_R')!;
  const giantUpdate = giantBone.updateWorldMatrix.bind(giantBone), sentinelUpdate = sentinelBone.updateWorldMatrix.bind(sentinelBone);
  giantBone.updateWorldMatrix = (parents, children) => { giantUpdates++; giantUpdate(parents, children); };
  sentinelBone.updateWorldMatrix = (parents, children) => { sentinelUpdates++; sentinelUpdate(parents, children); };
  snapshot.encounter = 'crown'; rig.update(.05, snapshot); assert.equal(giantUpdates, 0); assert.ok(sentinelUpdates > 0); sentinelUpdates = 0;
  assert.equal(rig.head.visible, false); assert.equal(rig.targets.get('sentinel-0')!.visible, false);
  snapshot.encounter = 'logos'; snapshot.logos = { stage: 'descent', elapsed: 20 }; rig.update(.05, snapshot, true);
  assert.ok(giantUpdates > 0); assert.ok(sentinelUpdates > 0); giantUpdates = sentinelUpdates = 0;
  snapshot.logos = { stage: 'sentinels', elapsed: 3 }; snapshot.enemies = [{ id: 'sentinel-0', x: 2, z: 3, hp: 0, target: 0, attackTimer: 1, stunRemaining: 0 }];
  rig.update(.05, snapshot); assert.ok(giantUpdates > 0); assert.equal(sentinelUpdates, 0); giantUpdates = 0;
  assert.equal(rig.targets.get('sentinel-0')!.visible, false);
  snapshot.logos.stage = 'escaped'; rig.update(.05, snapshot); assert.equal(giantUpdates, 0); assert.equal(sentinelUpdates, 0);
  rig.dispose();
});


test('the same six figures persist from dark outskirts through staggered leaps into the lair', () => {
  const rig = createLogosRig('low', { loader: false });
  const snapshot = state(); snapshot.encounter = 'crown'; snapshot.logos = { stage: 'none', elapsed: 0 }; snapshot.enemies = [];
  rig.setDistantStatueLighting([1, .5, 0, 0, 0, 0]); rig.update(.05, freeze(structuredClone(snapshot)), true);
  const figures = Array.from({ length: 6 }, (_, i) => rig.root.getObjectByName(`Logos-sentinel-${i}`)!);
  const contacts = [...rig.distantStatueAnchors.values()];
  const material = (figure: THREE.Object3D) => {
    let found: THREE.MeshStandardMaterial | null = null;
    figure.traverse(object => { if (object instanceof THREE.Mesh && (object.material as THREE.Material).name === 'sentinel-polished-stone') found = object.material as THREE.MeshStandardMaterial; });
    return found!;
  };
  assert.equal(figures.length, 6); assert.equal(contacts.length, 6);
  for (const figure of figures) { assert.equal(figure.visible, true); near(Math.hypot(figure.position.x, figure.position.z), 34); }
  near(material(figures[0]).opacity, .628); near(material(figures[1]).opacity, .318); near(material(figures[2]).opacity, .008);
  assert.notEqual(material(figures[0]), material(figures[1]), 'lighting is independently controlled');
  rig.setDistantStatueLighting([0, 0, 0, 0, 0, 0]); near(material(figures[0]).opacity, .008);
  snapshot.encounter = 'logos'; snapshot.logos = { stage: 'descent', elapsed: 40 }; rig.update(.05, snapshot, true);
  assert.equal(rig.root.getObjectByName('Logos-giant')!.visible, true);
  assert.equal(rig.head.visible, false); assert.equal(rig.leftHand.visible, false); assert.equal(rig.rightHand.visible, false);
  snapshot.logos = { stage: 'sentinels', elapsed: .65 };
  snapshot.enemies = figures.map((_, i) => ({ id: `sentinel-${i}`, x: Math.sin(i * Math.PI / 3) * 18, z: Math.cos(i * Math.PI / 3) * 18, hp: 100, target: 0, attackTimer: 4, stunRemaining: 0 }));
  const original = structuredClone(snapshot); rig.update(.05, snapshot);
  assert.deepEqual(snapshot, original);
  for (let i = 0; i < 6; i++) {
    assert.equal(rig.root.getObjectByName(`Logos-sentinel-${i}`), figures[i]);
    assert.equal(rig.distantStatueAnchors.get(`sentinel-${i}`), contacts[i]);
    assert.equal(rig.targets.get(`sentinel-${i}`), contacts[i]);
    assert.equal(material(figures[i]).opacity, 1); assert.equal(material(figures[i]).transparent, false);
    figures[i].traverse(object => { if (object instanceof THREE.Mesh) assert.equal(object.layers.mask, 1, 'distant statues never receive giant fill lights'); });
  }
  assert.ok(figures[0].position.y > 5, 'first entrant follows a high leap arc');
  near(Math.hypot(figures[5].position.x, figures[5].position.z), 34, .001);
  assert.ok(Math.hypot(figures[0].position.x, figures[0].position.z) < 34, 'leaps are staggered');
  snapshot.logos.elapsed = 2.2; rig.update(.05, snapshot, true);
  figures.forEach((figure, i) => { near(figure.position.x, snapshot.enemies[i].x); near(figure.position.z, snapshot.enemies[i].z); near(figure.position.y, 0); });
  assert.equal(rig.root.getObjectByName('Logos-giant')!.visible, true);
  assert.equal(rig.head.visible, false); rig.dispose(); assert.equal(rig.distantStatueAnchors.size, 0);
});

test('hand attack, stun, reduced motion, stage changes and hostile numeric inputs keep finite transforms', () => {
  const rig = createLogosRig('low', { sentinels: false, loader: false });
  const snapshot = state(); snapshot.enemies[0].attackTimer = .325;
  rig.update(.05, snapshot, false);
  const point = rig.leftHand.getWorldPosition(new THREE.Vector3()); assert.ok(point.y > 4.8);
  snapshot.enemies[0].stunRemaining = 2; rig.update(.05, snapshot, false); near(rig.leftHand.getWorldPosition(point).y, 3.8);
  snapshot.enemies[0].stunRemaining = 0; rig.update(.05, snapshot, true); near(rig.leftHand.getWorldPosition(point).y, 3.8);
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
  const stone = meshes.find(mesh => (mesh.material as THREE.Material).name === 'Logos-luminous-silver-stone')!.material as THREE.MeshStandardMaterial;
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  stone.onBeforeCompile(shader as Parameters<typeof stone.onBeforeCompile>[0], null as unknown as THREE.WebGLRenderer);
  assert.match(shader.vertexShader, /vLogosStone = position/); assert.match(shader.fragmentShader, /logosVein/);
  assert.equal(stone.map, null); assert.ok(stone.roughness < .55);
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
    const point = rig.leftHand.getWorldPosition(new THREE.Vector3()); near(point.x, -19); near(point.y, 3.8); near(point.z, -4);
    rig.dispose();
  }
});


test('distant strike distortion is bounded, restores its pose and stays still in reduced motion', () => {
  const rig = createLogosRig('low', { loader: false });
  const snapshot = state(); snapshot.encounter = 'crown'; snapshot.logos = { stage: 'none', elapsed: 0 }; snapshot.enemies = [];
  rig.update(0, snapshot, true);
  const figure = rig.root.getObjectByName('Logos-sentinel-0')!, neck = figure.getObjectByName('head')!;
  const rest = neck.quaternion.clone(), position = figure.position.clone();
  rig.setDistantStatueDistortion([2, NaN, Infinity, -1]); rig.update(.05, snapshot, true);
  assert.ok(rest.angleTo(neck.quaternion) > .1 && rest.angleTo(neck.quaternion) < .25);
  const tilted = neck.quaternion.clone();
  rig.update(.1, snapshot, true); near(tilted.angleTo(neck.quaternion), 0); assert.deepEqual(figure.position, position);
  for (let i = 0; i < 20; i++) {
    rig.update(.05, snapshot, false);
    assert.ok(Math.hypot(figure.position.x - position.x, figure.position.z - position.z) <= .08);
    rig.root.traverse(object => assert.ok([...object.position, ...object.quaternion, ...object.scale].every(Number.isFinite)));
  }
  rig.setDistantStatueDistortion([]); rig.update(0, snapshot, true);
  near(rest.angleTo(neck.quaternion), 0); assert.deepEqual(figure.position, position);
  rig.setDistantStatueDistortion([1]);
  snapshot.encounter = 'logos'; snapshot.logos = { stage: 'sentinels', elapsed: 3 };
  snapshot.enemies = [{ id: 'sentinel-0', x: 2, z: 3, hp: 100, target: 0, attackTimer: 4, stunRemaining: 0 }];
  rig.update(0, snapshot, true); near(rest.angleTo(neck.quaternion), 0);
  rig.reset(); rig.dispose();
});


test('recurring giant statue waves reuse figures, lock the face and retire the hands until cleared', () => {
  const rig = createLogosRig('low', { loader: false }); const snapshot = state();
  rig.update(0, snapshot, true); const giant = rig.root.getObjectByName('Logos-giant')!;
  const sentinel = rig.root.getObjectByName('Logos-sentinel-0')!, contact = rig.targets.get('sentinel-0');
  const shield = rig.root.getObjectByName('Logos-closed-head-shield')!;
  assert.equal(rig.head.visible, true); assert.equal(rig.leftHand.visible, true); assert.equal(shield.visible, false);
  snapshot.logos = { stage: 'giant', elapsed: 30, statueWave: 1, statueEntryRemaining: 1.55, exposureRemaining: 0 };
  snapshot.enemies = [...snapshot.enemies, { id: 'sentinel-0', x: 0, z: 18, hp: 100, target: 0, attackTimer: 4, stunRemaining: 0 }];
  const original = structuredClone(snapshot); rig.update(.05, snapshot); assert.deepEqual(snapshot, original);
  assert.equal(giant.visible, true); assert.equal(sentinel.visible, true); assert.ok(sentinel.position.y > 5);
  assert.equal(rig.targets.get('sentinel-0'), contact);
  assert.equal(rig.head.visible, false); assert.equal(rig.leftHand.visible, false); assert.equal(rig.rightHand.visible, false); assert.equal(shield.visible, true);
  const palm = rig.leftHand.getWorldPosition(new THREE.Vector3()); assert.ok(palm.x < -19 && palm.z < -4);
  snapshot.logos.statueEntryRemaining = 0; rig.update(.05, snapshot, true);
  near(sentinel.position.z, 18); near(sentinel.position.y, 0);
  snapshot.enemies[2].hp = 0; rig.update(.05, snapshot, true);
  assert.equal(sentinel.visible, false); assert.equal(rig.head.visible, true); assert.equal(rig.leftHand.visible, true); assert.equal(shield.visible, false);
  rig.leftHand.getWorldPosition(palm); near(palm.x, -19); near(palm.y, 3.8); near(palm.z, -4);
  rig.dispose();
});

test('dormant limb poses are reused while floating roots, lighting and distortion remain live', () => {
  const rig = createLogosRig('low', { loader: false });
  const snapshot = state(); snapshot.encounter='crown'; snapshot.logos={stage:'none',elapsed:0}; snapshot.enemies=[];
  rig.update(1/60,snapshot);
  const figure=rig.root.getObjectByName('Logos-sentinel-0')!;
  const arm=figure.getObjectByName('upper_arm_R')!, original=arm.updateWorldMatrix.bind(arm);
  let solves=0;arm.updateWorldMatrix=(parents,children)=>{solves++;original(parents,children);};
  const rotation=arm.quaternion.clone(), startY=figure.position.y;
  for(let frame=0;frame<60;frame++)rig.update(1/60,snapshot);
  assert.equal(solves,0,'unchanged seated limbs do not repeat inverse-kinematics solves');
  assert.deepEqual(arm.quaternion.toArray(),rotation.toArray());assert.notEqual(figure.position.y,startY);
  rig.setDistantStatueDistortion([.7,0,0,0,0,0]); rig.update(1/60,snapshot);assert.ok(solves>0);
  solves=0;rig.update(1/60,snapshot);assert.equal(solves,0);
  rig.reset();rig.update(1/60,snapshot);assert.ok(solves>0,'reset invalidates the pose cache');
  snapshot.encounter='logos';snapshot.logos={stage:'sentinels',elapsed:4};
  snapshot.enemies=[{id:'sentinel-0',x:2,z:3,hp:100,target:0,attackTimer:.3,stunRemaining:0}];
  solves=0;rig.update(1/60,snapshot);assert.ok(solves>0,'active combat always gets fresh articulated poses');
  rig.dispose();
});
