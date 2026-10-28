import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SENTINEL_ENTRY_SECONDS } from '../../game/logos.ts';

type Stage = 'none' | 'descent' | 'sentinels' | 'giant' | 'collapse' | 'escaped';
export interface LogosRigState {
  encounter: string;
  logos?: { stage: Stage; elapsed: number };
  boss: { x: number; z: number; hp: number; stunRemaining: number; cast?: unknown };
  enemies: readonly { id: string; x: number; z: number; hp: number; target: number; attackTimer: number; stunRemaining: number }[];
  party: readonly { x: number; z: number; hp: number }[];
}
export interface LogosRigOptions {
  /** One source is loaded, then shared by the giant and six independently posed skeletons. */
  sentinels?: boolean;
  /** The loader transfers its source geometry, material and skeleton ownership to the rig. */
  loader?: false | (() => Promise<THREE.Group>);
}
export interface LogosRigStats {
  assetStatus: 'loading' | 'ready' | 'fallback' | 'disposed';
  source: 'bacchus-skinned-glb' | 'procedural-skinned-fallback';
  drawCalls: number;
  triangles: number;
  geometryBytes: number;
  skinnedMeshes: number;
  bones: number;
  /** Arms lengthen along their bones when contacts exceed anatomical reach. */
  maxArmStretch: number;
}

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? THREE.MathUtils.clamp(value, -10000, 10000) : fallback;
const positive = (value: number) => Math.max(0, finite(value));
const clamp01 = (value: number) => THREE.MathUtils.clamp(finite(value), 0, 1);
const up = new THREE.Vector3(0, 1, 0);
const fingerForward = new THREE.Vector3(0, 1, 0);

/** Skip the hero's embedded colour images: the statue uses its actual mesh and
 * 22-joint skin, with a new PBR stone material. This also works without a DOM. */
export async function parseLogosRigSource(bytes: ArrayBuffer): Promise<THREE.Group> {
  const view = new DataView(bytes);
  if (view.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67) throw new Error('Invalid Logos anatomy GLB');
  const jsonLength = view.getUint32(12, true);
  const document = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)));
  delete document.images; delete document.textures; delete document.samplers;
  document.materials = [{ name: 'Logos-source-placeholder' }];
  for (const mesh of document.meshes ?? []) for (const primitive of mesh.primitives) primitive.material = 0;
  const json = new TextEncoder().encode(JSON.stringify(document));
  const paddedLength = (json.length + 3) & ~3;
  const tail = new Uint8Array(bytes, 20 + jsonLength);
  const packed = new ArrayBuffer(20 + paddedLength + tail.length);
  const packedView = new DataView(packed);
  new Uint8Array(packed, 0, 12).set(new Uint8Array(bytes, 0, 12));
  packedView.setUint32(8, packed.byteLength, true);
  packedView.setUint32(12, paddedLength, true); packedView.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(packed, 20, paddedLength).fill(32);
  new Uint8Array(packed, 20, json.length).set(json);
  new Uint8Array(packed, 20 + paddedLength).set(tail);
  const loaded = await new GLTFLoader().parseAsync(packed, '');
  loaded.scene.name = 'Logos-classical-anatomy-source';
  // Replace the unjointed source hands with full three-joint fingers. Crop only
  // triangles beyond each wrist, leaving a small overlapping cuff at the seam.
  loaded.scene.updateMatrixWorld(true);
  const wrist = loaded.scene.getObjectByName('hand_L');
  const wristX = wrist?.getWorldPosition(new THREE.Vector3()).x ?? 1.003;
  loaded.scene.traverse(object => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const geometry = object.geometry;
    const p = geometry.getAttribute('position');
    const index = geometry.index;
    if (!index) return;
    const kept: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
      const right = p.getX(a) > wristX - .012 && p.getX(b) > wristX - .012 && p.getX(c) > wristX - .012;
      const left = p.getX(a) < -wristX + .012 && p.getX(b) < -wristX + .012 && p.getX(c) < -wristX + .012;
      if (!left && !right) kept.push(a, b, c);
    }
    geometry.setIndex(kept); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  });
  return loaded.scene;
}

async function loadAnatomy() {
  const response = await fetch('/assets/models/bacchus.glb');
  if (!response.ok) throw new Error(`Logos anatomy ${response.status}`);
  return parseLogosRigSource(await response.arrayBuffer());
}

function createStoneMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: '#15191e', metalness: .3, roughness: .26, envMapIntensity: .8 });
  material.name = 'Logos-polished-black-stone-with-silver-veins';
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLogosStone;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLogosStone = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vLogosStone;
float logosVein(vec3 p) {
  float bend = sin(p.y * 13.0 + sin(p.z * 11.0)) * .48 + sin(p.x * 9.0 - p.z * 7.0) * .17;
  float fine = abs(sin(dot(p, vec3(18.0, 7.0, 12.0)) + bend));
  float secondary = abs(sin(dot(p, vec3(-11.0, 21.0, 8.0)) + bend * .7));
  return max(1.0 - smoothstep(.006, .019, fine), (1.0 - smoothstep(.003, .011, secondary)) * .33);
}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
float logosSilver = logosVein(vLogosStone);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.36, .38, .39), logosSilver * .48);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .20, logosSilver);');
  };
  material.customProgramCacheKey = () => 'logos-stone-veins-v1';
  return material;
}

type SkinPart = { geometry: THREE.BufferGeometry; joint: number };
function mergeSkinParts(parts: SkinPart[]) {
  for (const { geometry, joint } of parts) {
    const count = geometry.getAttribute('position').count;
    const indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { indices[i * 4] = joint; weights[i * 4] = 1; }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  }
  const merged = mergeGeometries(parts.map(part => part.geometry), false)!;
  parts.forEach(part => part.geometry.dispose());
  return merged;
}

/** Closed elliptical loft, including shaped shoulders/knuckles rather than
 * a set of disconnected spheres or open-ended connecting rods. */
function loft(profile: readonly [number, number, number][], radial: number) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let y = 0; y < profile.length; y++) {
    const [height, rx, rz] = profile[y];
    for (let x = 0; x < radial; x++) {
      const a = x / radial * Math.PI * 2;
      positions.push(Math.cos(a) * rx, height, Math.sin(a) * rz);
      uvs.push(x / radial, y / Math.max(1, profile.length - 1));
      if (y && x < radial) {
        const a0 = (y - 1) * radial + x, a1 = (y - 1) * radial + (x + 1) % radial;
        const b0 = y * radial + x, b1 = y * radial + (x + 1) % radial;
        indices.push(a0, b0, a1, a1, b0, b1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function solidEllipsoid(sx: number, sy: number, sz: number, x: number, y: number, z: number, segments = 12) {
  return new THREE.SphereGeometry(1, segments, 8).scale(sx, sy, sz).translate(x, y, z);
}

/** A real skinned loading/failure model. It is deliberately lower detail than
 * the shipped anatomical GLB, but still has volume from every direction. */
function fallbackAnatomy(): THREE.Group {
  const root = new THREE.Group(); root.name = 'Logos-procedural-anatomy-fallback';
  const bones: THREE.Bone[] = [];
  const add = (name: string, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const bone = new THREE.Bone(); bone.name = name; bone.position.set(x, y, z); parent.add(bone); bones.push(bone); return bone;
  };
  const hips = add('hips', root, 0, .98, 0);
  const spine = add('spine', hips, 0, .14, 0), chest = add('chest', spine, 0, .13, 0);
  const upper = add('upper_chest', chest, 0, .12, 0), neck = add('neck', upper, 0, .13, 0);
  const head = add('head', neck, 0, .1, 0);
  const parts: SkinPart[] = [];
  const part = (geometry: THREE.BufferGeometry, bone: THREE.Bone) => parts.push({ geometry, joint: bones.indexOf(bone) });
  part(loft([[.78, .02, .02], [.88, .17, .13], [1.02, .19, .14], [1.14, .16, .11], [1.34, .24, .15], [1.43, .23, .14], [1.49, .07, .07]], 18), hips);
  part(solidEllipsoid(.105, .14, .11, 0, 1.72, .025, 16), head);
  part(solidEllipsoid(.08, .06, .1, 0, 1.635, .04), head);
  part(new THREE.ConeGeometry(.035, .09, 4).rotateX(Math.PI / 2).scale(.65, 1, .8).translate(0, 1.72, .15), head);
  for (const sign of [-1, 1]) {
    const side = sign > 0 ? 'L' : 'R';
    const clavicle = add(`clavicle_${side}`, upper, sign * .045, .085, .02);
    const arm = add(`upper_arm_${side}`, clavicle, sign * .155, 0, 0);
    const forearm = add(`forearm_${side}`, arm, sign * .427, 0, 0);
    add(`hand_${side}`, forearm, sign * .379, 0, 0);
    part(loft([[0, .065, .07], [.05, .1, .09], [.18, .09, .075], [.36, .055, .055], [.44, .045, .045]], 12).rotateZ(-sign * Math.PI / 2).translate(sign * .18, 1.455, .02), arm);
    part(loft([[0, .06, .055], [.08, .07, .06], [.25, .045, .04], [.39, .035, .035]], 12).rotateZ(-sign * Math.PI / 2).translate(sign * .627, 1.455, .02), forearm);
    const thigh = add(`thigh_${side}`, hips, sign * .095, -.04, 0);
    const shin = add(`shin_${side}`, thigh, sign * .055, -.435, 0);
    const foot = add(`foot_${side}`, shin, sign * .045, -.425, -.02);
    add(`toe_${side}`, foot, 0, -.05, .16);
    part(loft([[.48, .07, .08], [.55, .08, .085], [.78, .11, .12], [.95, .1, .1]], 12).translate(sign * .13, 0, 0), thigh);
    part(loft([[.07, .04, .045], [.19, .065, .07], [.35, .08, .08], [.51, .065, .065]], 12).translate(sign * .18, 0, 0), shin);
    part(solidEllipsoid(.06, .045, .14, sign * .2, .055, .065), foot);
  }
  root.updateMatrixWorld(true);
  const geometry = mergeSkinParts(parts);
  const skin = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  skin.name = 'Logos-fallback-sculpture'; root.add(skin);
  skin.bind(new THREE.Skeleton(bones)); return root;
}

function crownGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const ring = new THREE.TorusGeometry(.144, .008, 5, 36).rotateX(Math.PI / 2).translate(0, .239, -.015);
  parts.push(ring);
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2, height = .057 + (i % 2) * .025;
    const leaf = new THREE.ConeGeometry(.017, height, 5).scale(1, 1, .55);
    leaf.rotateZ(-Math.sin(a) * .4).rotateX(Math.cos(a) * .4);
    leaf.translate(Math.sin(a) * .141, .245 + height / 2, -.015 + Math.cos(a) * .141); parts.push(leaf);
  }
  const geometry = mergeGeometries(parts, false)!; parts.forEach(part => part.dispose()); return geometry;
}

function carvedHeadGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  // Strong temple planes, swept hair and an overlapping carved beard. The
  // source head supplies the nose, cheeks, lips, eye sockets and full rear skull.
  for (const sign of [-1, 1]) {
    parts.push(new THREE.BoxGeometry(.074, .013, .026).rotateZ(sign * -.1).translate(sign * .045, .142, .108));
    for (let i = 0; i < 4; i++) parts.push(solidEllipsoid(.026, .071, .03, sign * (.11 + i * .004), .16 - i * .025, -.015 - i * .02, 8));
  }
  // A single tapered carved beard overlaps the chin. A row of separate long
  // curls read as cylinders in profile, so the silhouette is continuous here.
  const beard = loft([[-.07, .004, .005], [-.052, .036, .023], [-.015, .065, .034], [.026, .075, .029], [.06, .057, .018]], 20);
  const p = beard.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const angle = Math.atan2(p.getZ(i), p.getX(i));
    p.setZ(i, p.getZ(i) + .104 + Math.max(0, Math.sin(angle)) * Math.cos(angle * 9) * .003);
  }
  beard.computeVertexNormals(); parts.push(beard);
  const geometry = mergeGeometries(parts, false)!; parts.forEach(part => part.dispose()); return geometry;
}

function draperyGeometry(bones: readonly THREE.Bone[], quality: 'low' | 'high') {
  const positions: number[] = [], indices: number[] = [], joints: number[] = [], weights: number[] = [];
  const joint = (name: string) => Math.max(0, bones.findIndex(bone => bone.name === name));
  const hips = joint('hips'), chest = joint('upper_chest'), left = joint('thigh_L'), right = joint('thigh_R');
  const vertex = (x: number, y: number, z: number, a: number, b: number, blend: number) => {
    const index = positions.length / 3; positions.push(x, y, z); joints.push(a, b, 0, 0); weights.push(1 - blend, blend, 0, 0); return index;
  };
  const around = quality === 'high' ? 48 : 30, rows = 8;
  // A complete folded wrap has depth on the rear and sides. The bottom follows
  // the thighs through the seated pose, instead of intersecting a rigid skirt.
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    for (let column = 0; column <= around; column++) {
      const a = column / around * Math.PI * 2, folds = Math.cos(a * 12 + t * .4) * (.004 + .012 * t);
      const x = Math.sin(a) * (.204 + .055 * t + folds);
      const z = Math.cos(a) * (.153 + .052 * t + folds);
      const bottom = .54 - .09 * Math.sin(a);
      const y = 1.015 + (bottom - 1.015) * t;
      vertex(x, y, z, hips, x > 0 ? left : right, t * .9);
      if (row && column) {
        const i = row * (around + 1) + column;
        indices.push(i - around - 2, i - 1, i - around - 1, i - 1, i, i - around - 1);
      }
    }
  }
  // A closed sash runs across both chest and back, with a folded oval section.
  // Its skin weights bridge torso joints, so it bends with the actual anatomy.
  for (const back of [false, true]) {
    const start = positions.length / 3, sections = 14, sectionPoints = quality === 'high' ? 24 : 20;
    for (let row = 0; row <= sections; row++) {
      const t = row / sections, cy = 1.44 - t * .43, cx = .17 - t * .33;
      const cz = back ? -.151 - Math.sin(t * Math.PI) * .012 : .145 + Math.sin(t * Math.PI) * .043;
      for (let side = 0; side < sectionPoints; side++) {
        const a = side / sectionPoints * Math.PI * 2;
        const across = Math.cos(a) * (.058 + Math.sin(t * Math.PI) * .014);
        const depth = Math.sin(a) * (.025 + Math.cos(Math.cos(a) * Math.PI * 3 + t * .8) * .014);
        vertex(cx + across * .79, cy - across * .61, cz + depth, hips, chest, 1 - t);
        if (row) {
          const prev = start + (row - 1) * sectionPoints + side;
          const next = start + (row - 1) * sectionPoints + (side + 1) % sectionPoints;
          const here = start + row * sectionPoints + side, there = start + row * sectionPoints + (side + 1) % sectionPoints;
          indices.push(prev, here, next, next, here, there);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(joints, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

interface HandShape { geometry: THREE.BufferGeometry; joints: { parent: number; x: number; y: number; z: number; spread: number; name: string }[] }
function handShape(mirror: number, quality: 'low' | 'high'): HandShape {
  const radial = quality === 'high' ? 10 : 6;
  const palm = solidEllipsoid(.073, .091, .038, 0, .07, 0, quality === 'high' ? 16 : 10);
  const parts: SkinPart[] = [{ geometry: palm, joint: 0 }];
  const joints = [{ parent: -1, x: 0, y: 0, z: 0, spread: 0, name: 'palm' }];
  for (let f = 0; f < 5; f++) {
    const thumb = f === 4, length = thumb ? .13 : [.157, .181, .169, .137][f];
    const x = thumb ? mirror * -.065 : (f - 1.5) * .037;
    const y = thumb ? .039 : .13 - Math.abs(f - 1.5) * .01;
    const spread = thumb ? mirror * .82 : (1.5 - f) * .07;
    const base = joints.length;
    joints.push({ parent: 0, x, y, z: -.003, spread, name: thumb ? 'thumb-base' : `finger-${f}-base` });
    joints.push({ parent: base, x: 0, y: length * .39, z: 0, spread: 0, name: thumb ? 'thumb-middle' : `finger-${f}-middle` });
    joints.push({ parent: base + 1, x: 0, y: length * .32, z: 0, spread: 0, name: thumb ? 'thumb-tip' : `finger-${f}-tip` });
    const radius = thumb ? .023 : .018 - Math.abs(f - 1.5) * .0015;
    const profile: [number, number, number][] = [[0, radius, radius * .9], [length * .12, radius, radius * .92], [length * .36, radius * .9, radius * .8], [length * .43, radius * .93, radius * .85], [length * .67, radius * .74, radius * .65], [length * .75, radius * .76, radius * .66], [length * .93, radius * .59, radius * .55], [length, .001, .001]];
    const geometry = loft(profile, radial);
    const p = geometry.getAttribute('position'), skinIndex = new Uint16Array(p.count * 4), skinWeight = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / length;
      const segment = t < .39 ? 0 : t < .71 ? 1 : 2;
      const blend = segment === 0 ? clamp01((t - .30) / .09) : segment === 1 ? clamp01((t - .62) / .09) : 0;
      skinIndex[i * 4] = base + segment; skinIndex[i * 4 + 1] = Math.min(base + 2, base + segment + 1);
      skinWeight[i * 4] = 1 - blend; skinWeight[i * 4 + 1] = blend;
    }
    geometry.rotateZ(spread).translate(x, y, -.003);
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    parts.push({ geometry, joint: base });
  }
  const count = palm.getAttribute('position').count;
  palm.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4); for (let i = 0; i < count; i++) weights[i * 4] = 1;
  palm.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const geometry = mergeGeometries(parts.map(part => part.geometry), false)!;
  parts.forEach(part => part.geometry.dispose()); return { geometry, joints };
}

interface ArticulatedHand {
  mesh: THREE.SkinnedMesh;
  bones: THREE.Bone[];
  anchor: THREE.Object3D;
  shape: HandShape;
}
function makeHand(parent: THREE.Bone, shape: HandShape, material: THREE.Material, name: string): ArticulatedHand {
  const mesh = new THREE.SkinnedMesh(shape.geometry, material); mesh.name = `${name}-full-3d-fingers`; parent.add(mesh);
  const bones = shape.joints.map((joint, index) => {
    const bone = new THREE.Bone(); bone.name = `${name}-${joint.name}`;
    bone.position.set(joint.x, joint.y, joint.z); bone.rotation.z = joint.spread;
    if (index === 0) mesh.add(bone); return bone;
  });
  shape.joints.forEach((joint, index) => { if (joint.parent >= 0) bones[joint.parent].add(bones[index]); });
  mesh.updateWorldMatrix(true, true); mesh.bind(new THREE.Skeleton(bones));
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
  const anchor = new THREE.Object3D(); anchor.name = `${name}-palm-contact`; anchor.position.set(0, .075, 0); bones[0].add(anchor);
  return { mesh, bones, anchor, shape };
}

type Rest = { bone: THREE.Bone; quaternion: THREE.Quaternion; position: THREE.Vector3; scale: THREE.Vector3 };
interface Limb { upper: THREE.Bone; lower: THREE.Bone; end: THREE.Bone; hand?: ArticulatedHand }
interface Figure {
  root: THREE.Group; model: THREE.Object3D; bones: Map<string, THREE.Bone>; rest: Rest[];
  head: THREE.Object3D; chest: THREE.Object3D; arms: Limb[]; legs: Limb[];
  scale: number; headRestHeight: number; previousX: number; previousZ: number; motionInitialized: boolean;
}

/** Fully volumetric, with one shared 25k-triangle anatomical GLB, independently
 * posed skeletons and skinned hands. Source images are never used as geometry. */
export function createLogosRig(quality: 'low' | 'high', options: LogosRigOptions = {}) {
  const root = new THREE.Group(); root.name = 'Logos-articulated-stone-encounter'; root.visible = false;
  const targets = new Map<string, THREE.Object3D>();
  const head = new THREE.Object3D(); head.name = 'Logos-skull-contact';
  const leftHand = new THREE.Object3D(); leftHand.name = 'Logos-left-palm-contact';
  const rightHand = new THREE.Object3D(); rightHand.name = 'Logos-right-palm-contact';
  targets.set('boss', head); targets.set('head', head); targets.set('left-hand', leftHand); targets.set('right-hand', rightHand);
  targets.set('echo-0', leftHand); targets.set('echo-1', rightHand);
  const sentinelContacts = Array.from({ length: options.sentinels === false ? 0 : 6 }, (_, i) => {
    const contact = new THREE.Object3D(); contact.name = `Logos-sentinel-${i}-chest-contact`; targets.set(`sentinel-${i}`, contact); return contact;
  });
  const stone = createStoneMaterial();
  const silver = new THREE.MeshStandardMaterial({ color: '#8e969d', metalness: .72, roughness: .3, envMapIntensity: .7 });
  silver.name = 'Logos-restrained-warm-silver-crown';
  const sentinelPaints = sentinelContacts.map(() => {
    const body = createStoneMaterial(), trim = silver.clone();
    body.name = 'sentinel-polished-stone'; trim.name = 'sentinel-silver-trim';
    return { body, trim };
  });
  const distantStatueAnchors = new Map(sentinelContacts.map((contact, i) => [`sentinel-${i}`, contact]));
  const distantLighting = sentinelContacts.map(() => 0);
  const distantDistortion = sentinelContacts.map(() => 0);
  const ownGeometries = new Set<THREE.BufferGeometry>();
  const ownSkeletons = new Set<THREE.Skeleton>();
  const sources = new Set<THREE.Group>();
  const released = new WeakSet<object>();
  const stats: LogosRigStats = { assetStatus: 'loading', source: 'procedural-skinned-fallback', drawCalls: 0, triangles: 0, geometryBytes: 0, skinnedMeshes: 0, bones: 0, maxArmStretch: 1 };
  const crown = crownGeometry(), hair = carvedHeadGeometry(); ownGeometries.add(crown); ownGeometries.add(hair);
  const shapes = [-1, 1].map(sign => handShape(sign, quality)); shapes.forEach(shape => ownGeometries.add(shape.geometry));
  let disposed = false, time = 0, currentState: LogosRigState | null = null, currentReduced = false;
  let giant: Figure | null = null, sentinels: Figure[] = [];
  const thrones: THREE.Mesh[] = [];
  const throneParts = [new THREE.BoxGeometry(.74, .16, .62).translate(0, .48, -.02), new THREE.BoxGeometry(.74, .91, .14).translate(0, .95, -.37), new THREE.BoxGeometry(.12, .58, .65).translate(-.34, .29, -.03), new THREE.BoxGeometry(.12, .58, .65).translate(.34, .29, -.03)];
  const throneGeometry = mergeGeometries(throneParts, false)!; throneParts.forEach(part => part.dispose()); ownGeometries.add(throneGeometry);

  const free = (value: { dispose(): void }) => { if (!released.has(value)) { released.add(value); value.dispose(); } };
  const freeSkeleton = (skeleton: THREE.Skeleton) => {
    if (skeleton.boneTexture) { free(skeleton.boneTexture); skeleton.boneTexture = null; }
    free(skeleton);
  };
  const releaseSource = (source: THREE.Group) => {
    source.traverse(object => {
      if (object instanceof THREE.Mesh) {
        free(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) free(value);
          free(material);
        }
      }
      if (object instanceof THREE.SkinnedMesh) freeSkeleton(object.skeleton);
    });
  };
  const clearFigures = () => {
    for (const figure of [giant, ...sentinels]) figure?.root.removeFromParent();
    for (const skeleton of ownSkeletons) freeSkeleton(skeleton);
    ownSkeletons.clear(); giant = null; sentinels = [];
    thrones.splice(0).forEach(throne => throne.removeFromParent());
    root.clear();
  };
  const makeFigure = (source: THREE.Group, scale: number, name: string, drapery: THREE.BufferGeometry, bodyPaint = stone, trimPaint = silver): Figure => {
    const frame = new THREE.Group(); frame.name = name; root.add(frame);
    const model = cloneSkeleton(source); model.name = `${name}-continuous-anatomy`; model.scale.setScalar(scale); frame.add(model);
    const bones = new Map<string, THREE.Bone>();
    model.traverse(object => {
      if (object instanceof THREE.Bone) bones.set(object.name, object);
      if (object instanceof THREE.Mesh) { object.material = bodyPaint; object.castShadow = true; object.receiveShadow = true; }
      if (object instanceof THREE.SkinnedMesh) { ownSkeletons.add(object.skeleton); object.frustumCulled = false; }
    });
    let anatomy: THREE.SkinnedMesh | undefined;
    model.traverse(object => { if (!anatomy && object instanceof THREE.SkinnedMesh) anatomy = object; });
    const cloth = new THREE.SkinnedMesh(drapery, bodyPaint); cloth.name = `${name}-sculpted-himation-sash`;
    cloth.castShadow = true; cloth.receiveShadow = true; cloth.frustumCulled = false; model.add(cloth);
    cloth.bind(anatomy!.skeleton, anatomy!.bindMatrix);
    const rest: Rest[] = [...bones.values()].map(bone => ({ bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone() }));
    for (const name of ['head', 'upper_chest', 'upper_arm_R', 'forearm_R', 'hand_R', 'upper_arm_L', 'forearm_L', 'hand_L', 'thigh_R', 'shin_R', 'foot_R', 'thigh_L', 'shin_L', 'foot_L']) if (!bones.has(name)) throw new Error(`Logos anatomy missing ${name}`);
    model.updateWorldMatrix(true, true);
    const headBone = bones.get('head')!;
    const adornment = new THREE.Group(); adornment.name = `${name}-carved-head-and-crown`;
    const headWorld = headBone.getWorldQuaternion(new THREE.Quaternion());
    const frameWorld = frame.getWorldQuaternion(new THREE.Quaternion());
    adornment.quaternion.copy(headWorld.invert().multiply(frameWorld)); headBone.add(adornment);
    const crownMesh = new THREE.Mesh(crown, trimPaint); crownMesh.castShadow = true; crownMesh.name = `${name}-solid-laurel-crown`; adornment.add(crownMesh);
    const hairMesh = new THREE.Mesh(hair, bodyPaint); hairMesh.castShadow = true; hairMesh.name = `${name}-carved-brow-hair-beard`; adornment.add(hairMesh);
    const headContact = new THREE.Object3D(); headContact.position.set(0, .143, .13); adornment.add(headContact);
    const chestContact = new THREE.Object3D(); chestContact.position.set(0, 0, .14); bones.get('upper_chest')!.add(chestContact);
    const arms = ['R', 'L'].map((side, i) => {
      const end = bones.get(`hand_${side}`)!;
      // The custom palm's axes follow the source wrist; its finger joints are
      // independent of the 22-joint source, adding 16 real bones to each hand.
      const hand = makeHand(end, shapes[i], bodyPaint, `${name}-${i === 0 ? 'left' : 'right'}-hand`);
      ownSkeletons.add(hand.mesh.skeleton);
      return { upper: bones.get(`upper_arm_${side}`)!, lower: bones.get(`forearm_${side}`)!, end, hand };
    });
    const legs = ['R', 'L'].map(side => ({ upper: bones.get(`thigh_${side}`)!, lower: bones.get(`shin_${side}`)!, end: bones.get(`foot_${side}`)! }));
    headContact.updateWorldMatrix(true, false);
    const headRestHeight = frame.worldToLocal(headContact.getWorldPosition(new THREE.Vector3())).y;
    return { root: frame, model, bones, rest, head: headContact, chest: chestContact, arms, legs, scale, headRestHeight, previousX: 0, previousZ: 0, motionInitialized: false };
  };

  const recount = () => {
    const geometrySet = new Set<THREE.BufferGeometry>(), boneSet = new Set<THREE.Bone>();
    stats.drawCalls = 0; stats.triangles = 0; stats.skinnedMeshes = 0; stats.geometryBytes = 0;
    root.traverse(object => {
      if (object instanceof THREE.Bone) boneSet.add(object);
      if (object instanceof THREE.Mesh) {
        stats.drawCalls++; stats.triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
        geometrySet.add(object.geometry);
      }
      if (object instanceof THREE.SkinnedMesh) stats.skinnedMeshes++;
    });
    for (const geometry of geometrySet) {
      for (const attribute of Object.values(geometry.attributes)) stats.geometryBytes += attribute.array.byteLength;
      stats.geometryBytes += geometry.index?.array.byteLength ?? 0;
    }
    stats.bones = boneSet.size;
  };
  const install = (source: THREE.Group) => {
    clearFigures(); sources.add(source);
    let anatomy: THREE.SkinnedMesh | undefined;
    source.traverse(object => { if (!anatomy && object instanceof THREE.SkinnedMesh) anatomy = object; });
    if (!anatomy) throw new Error('Logos anatomy has no skinned mesh');
    const drapery = draperyGeometry(anatomy.skeleton.bones, quality); ownGeometries.add(drapery);
    // The colossus rises through the arena rather than standing on its floor.
    // A larger anatomical body reaches the gameplay palms with natural arms;
    // head height is pinned from the actual rest contact, not a guessed offset.
    giant = makeFigure(source, 14.7, 'Logos-giant', drapery);
    giant.head.add(head); giant.arms[0].hand!.anchor.add(leftHand); giant.arms[1].hand!.anchor.add(rightHand);
    head.position.set(0, 0, 0); leftHand.position.set(0, 0, 0); rightHand.position.set(0, 0, 0);
    sentinels = sentinelContacts.map((contact, i) => {
      const figure = makeFigure(source, 1.75, `Logos-sentinel-${i}`, drapery, sentinelPaints[i].body, sentinelPaints[i].trim); figure.chest.add(contact); contact.position.set(0, 0, 0);
      const throne = new THREE.Mesh(throneGeometry, sentinelPaints[i].body); throne.name = `Logos-sentinel-${i}-solid-throne`; throne.scale.setScalar(1.75); throne.receiveShadow = true; throne.castShadow = true; root.add(throne); thrones.push(throne); return figure;
    });
    recount();
  };

  // Scratch storage is allocated once. Neither state nor scene topology changes
  // inside update, including the six-sentinel to two-hand transition.
  const v = Array.from({ length: 14 }, () => new THREE.Vector3());
  const q = Array.from({ length: 7 }, () => new THREE.Quaternion());
  const matrices = [new THREE.Matrix4(), new THREE.Matrix4()];
  const palmDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const resetPose = (figure: Figure) => {
    for (const rest of figure.rest) { rest.bone.matrixAutoUpdate = true; rest.bone.position.copy(rest.position); rest.bone.quaternion.copy(rest.quaternion); rest.bone.scale.copy(rest.scale); }
    figure.model.updateWorldMatrix(true, true);
  };
  const setBoneWorld = (bone: THREE.Bone, position: THREE.Vector3, quaternion: THREE.Quaternion, scale: THREE.Vector3) => {
    matrices[0].compose(position, quaternion, scale);
    if (bone.parent) matrices[0].premultiply(matrices[1].copy(bone.parent.matrixWorld).invert());
    // Local affine matrices compensate for the parent's axial length change.
    // This keeps each child free of inherited shear or radial inflation while
    // retaining a genuine shoulder > elbow > wrist bone hierarchy.
    bone.matrixAutoUpdate = false; bone.matrix.copy(matrices[0]); bone.updateWorldMatrix(false, false);
  };
  const stretchAxis = (scale: THREE.Vector3, child: THREE.Bone, amount: number) => {
    const p = child.position;
    if (Math.abs(p.x) > Math.abs(p.y) && Math.abs(p.x) > Math.abs(p.z)) scale.x *= amount;
    else if (Math.abs(p.z) > Math.abs(p.y)) scale.z *= amount;
    else scale.y *= amount;
  };
  const solveLimb = (limb: Limb, target: THREE.Vector3, pole: THREE.Vector3, allowStretch: boolean, desiredEnd?: THREE.Quaternion) => {
    limb.upper.getWorldPosition(v[0]); limb.lower.getWorldPosition(v[1]); limb.end.getWorldPosition(v[2]);
    const l1 = v[0].distanceTo(v[1]), l2 = v[1].distanceTo(v[2]);
    limb.upper.getWorldQuaternion(q[0]); limb.lower.getWorldQuaternion(q[1]); limb.end.getWorldQuaternion(q[2]);
    v[3].copy(target).sub(v[0]); const rawDistance = v[3].length();
    if (l1 < 1e-5 || l2 < 1e-5 || !Number.isFinite(rawDistance)) return;
    const stretch = allowStretch ? Math.max(1, rawDistance / (l1 + l2) * 1.015) : 1;
    if (allowStretch) stats.maxArmStretch = Math.max(stats.maxArmStretch, stretch);
    const a = l1 * stretch, b = l2 * stretch, distance = Math.max(.0001, Math.min(rawDistance, a + b - .00001));
    v[3].normalize(); if (rawDistance < .0001) v[3].set(0, -1, 0);
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    const height = Math.sqrt(Math.max(0, a * a - along * along));
    v[4].copy(pole).sub(v[0]); v[4].addScaledVector(v[3], -v[4].dot(v[3]));
    if (v[4].lengthSq() < 1e-8) { v[4].crossVectors(v[3], up); if (v[4].lengthSq() < 1e-8) v[4].set(1, 0, 0); }
    v[4].normalize(); v[5].copy(v[0]).addScaledVector(v[3], along).addScaledVector(v[4], height);
    v[6].copy(v[1]).sub(v[0]).normalize(); v[7].copy(v[5]).sub(v[0]).normalize();
    q[5].setFromUnitVectors(v[6], v[7]); q[0].premultiply(q[5]);
    v[6].copy(v[2]).sub(v[1]).normalize(); v[7].copy(target).sub(v[5]).normalize();
    q[5].setFromUnitVectors(v[6], v[7]); q[1].premultiply(q[5]);
    limb.upper.getWorldScale(v[7]); limb.lower.getWorldScale(v[8]); limb.end.getWorldScale(v[9]);
    stretchAxis(v[7], limb.lower, stretch); stretchAxis(v[8], limb.end, stretch);
    setBoneWorld(limb.upper, v[0], q[0], v[7]);
    setBoneWorld(limb.lower, v[5], q[1], v[8]);
    setBoneWorld(limb.end, target, desiredEnd ?? q[2], v[9]);
  };
  const point = (figure: Figure, x: number, y: number, z: number, out: THREE.Vector3) => {
    out.set(x, y, z); figure.model.localToWorld(out); return out;
  };
  const fingers = (hand: ArticulatedHand, curl: number, stunned: boolean) => {
    for (let i = 1; i < hand.bones.length; i++) {
      const bone = hand.bones[i], joint = hand.shape.joints[i];
      bone.rotation.set((stunned ? .24 : curl) * (joint.name.includes('base') ? .65 : .95), 0, joint.spread);
    }
  };
  const poseArm = (figure: Figure, index: number, palm: THREE.Vector3, pole: THREE.Vector3, facing: number, curl: number, stunned: boolean) => {
    const arm = figure.arms[index];
    figure.root.getWorldQuaternion(q[3]);
    q[4].setFromAxisAngle(up, facing).multiply(palmDown).premultiply(q[3]);
    v[10].copy(fingerForward).applyQuaternion(q[4]).multiplyScalar(.075 * figure.scale);
    v[11].copy(palm).sub(v[10]);
    solveLimb(arm, v[11], pole, true, q[4]); fingers(arm.hand!, curl, stunned);
  };
  const setContactsVisible = (value: boolean) => {
    head.visible = value; leftHand.visible = value; rightHand.visible = value;
  };

  const lightSentinel = (index: number, distant: boolean) => {
    const level = distantLighting[index] ?? 0;
    for (const material of [sentinelPaints[index].body, sentinelPaints[index].trim]) {
      if (material.transparent !== distant) { material.transparent = distant; material.needsUpdate = true; }
      material.depthWrite = !distant;
      material.opacity = distant ? .008 + level * .62 : 1;
      material.emissive.set('#60768f'); material.emissiveIntensity = distant ? level * .65 : 0;
    }
  };
  const setDistantStatueLighting = (levels: readonly number[]) => {
    if (disposed) return;
    const distant = currentState?.encounter === 'crown' || currentState?.logos?.stage === 'descent';
    for (let i = 0; i < sentinelPaints.length; i++) { distantLighting[i] = clamp01(levels[i] ?? 0); lightSentinel(i, distant); }
  };

  const setDistantStatueDistortion = (levels: readonly number[]) => {
    if (disposed) return;
    for (let i = 0; i < distantDistortion.length; i++) distantDistortion[i] = clamp01(levels[i] ?? 0);
  };

  const update = (dt: number, state: LogosRigState, reducedMotion = false) => {
    if (disposed) return;
    currentState = state; currentReduced = reducedMotion;
    const delta = Math.max(0, Math.min(.1, finite(dt))); time += delta;
    const stage = state.logos?.stage ?? (state.encounter === 'logos' ? 'giant' : 'none');
    const elapsed = positive(state.logos?.elapsed ?? time), collapse = stage === 'collapse' ? clamp01(elapsed / 6) : 0;
    const crownScene = state.encounter === 'crown';
    root.visible = crownScene ? sentinels.length > 0 : state.encounter === 'logos' && stage !== 'none' && stage !== 'escaped';
    stone.transparent = collapse > 0; stone.opacity = 1 - collapse; silver.transparent = collapse > 0; silver.opacity = 1 - collapse;
    stats.maxArmStretch = 1;
    if (!giant) return;
    if (!root.visible) {
      giant.root.visible = false; setContactsVisible(false);
      for (let i = 0; i < sentinels.length; i++) {
        sentinels[i].root.visible = false; sentinels[i].motionInitialized = false;
        sentinelContacts[i].visible = false; thrones[i].visible = false;
      }
      return;
    }
    const backdrop = !crownScene && (stage === 'descent' || stage === 'sentinels');
    const giantActive = !crownScene && (stage === 'giant' || stage === 'collapse');
    giant.root.visible = backdrop || giantActive; setContactsVisible(giantActive && stage === 'giant');
    if (giant.root.visible) {
    giant.root.position.set(backdrop ? 0 : finite(state.boss.x), 17.3 - giant.headRestHeight - (reducedMotion ? 0 : collapse * 5), backdrop ? -16 : finite(state.boss.z, -12));
    giant.root.rotation.set(0, 0, reducedMotion ? 0 : collapse * -.07);
    resetPose(giant);
    const headBone = giant.bones.get('head')!;
    if (!reducedMotion) headBone.rotateY(state.boss.stunRemaining > 0 ? -.025 : Math.sin(time * .3) * .018);
    giant.model.updateWorldMatrix(true, true);
    for (let index = 0; index < 2; index++) {
      const id = index === 0 ? 'left-hand' : 'right-hand', sign = index === 0 ? -1 : 1;
      const enemy = state.enemies.find(enemy => enemy.id === id) ?? state.enemies.find(enemy => enemy.id === `echo-${index}`);
      const x = backdrop ? sign * 7 : finite(enemy?.x ?? finite(state.boss.x) + sign * 7), z = backdrop ? -7 : finite(enemy?.z ?? finite(state.boss.z, -12) + 9);
      const attack = !reducedMotion && enemy && enemy.hp > 0 && enemy.stunRemaining <= 0 ? clamp01((.65 - positive(enemy.attackTimer)) / .65) : 0;
      const attackLift = Math.sin(attack * Math.PI) * 1.1;
      v[12].set(x, 4 + attackLift - (reducedMotion ? 0 : collapse * 5), z); root.localToWorld(v[12]);
      point(giant, sign * .8, 1.05, .28, v[13]);
      const target = enemy ? state.party[enemy.target] : undefined;
      const facing = target && target.hp > 0 ? Math.atan2(finite(target.x) - x, finite(target.z) - z) : 0;
      poseArm(giant, index, v[12], v[13], facing, .14 + attack * .75, !!enemy && enemy.stunRemaining > 0);
      (index === 0 ? leftHand : rightHand).visible = giantActive && stage === 'giant' && (!enemy || enemy.hp > 0);
    }
    }
    for (let i = 0; i < sentinels.length; i++) {
      const figure = sentinels[i], angle = i / 6 * Math.PI * 2;
      const enemy = state.enemies.find(enemy => enemy.id === `sentinel-${i}`);
      const dormant = crownScene || stage === 'descent';
      const distortion = dormant ? distantDistortion[i] : 0;
      const entering = !dormant && stage === 'sentinels' && elapsed < SENTINEL_ENTRY_SECONDS;
      const jump = entering ? clamp01((elapsed - i * .18) / Math.max(.1, SENTINEL_ENTRY_SECONDS - .9)) : 1;
      const travel = jump * jump * (3 - 2 * jump);
      const floatedY = 2.4 + i % 2 * .5 + (reducedMotion ? 0 : Math.sin(time * .5 + i) * .12);
      lightSentinel(i, dormant);
      figure.root.visible = dormant || stage === 'sentinels' && !!enemy && enemy.hp > 0;
      sentinelContacts[i].visible = figure.root.visible && !dormant;
      const throne = thrones[i]; throne.visible = false;
      if (throne.visible) {
        throne.position.set(Math.sin(angle) * 18, 0, Math.cos(angle) * 18); throne.rotation.y = Math.atan2(-throne.position.x, -throne.position.z);
      }
      if (!figure.root.visible) { figure.motionInitialized = false; continue; }
      const originX = Math.sin(angle) * 34, originZ = Math.cos(angle) * 34;
      const destinationX = finite(enemy?.x ?? Math.sin(angle) * 18), destinationZ = finite(enemy?.z ?? Math.cos(angle) * 18);
      const positionBlend = reducedMotion && entering ? (jump >= 1 ? 1 : 0) : travel;
      const x = dormant ? originX : entering ? THREE.MathUtils.lerp(originX, destinationX, positionBlend) : destinationX;
      const z = dormant ? originZ : entering ? THREE.MathUtils.lerp(originZ, destinationZ, positionBlend) : destinationZ;
      const target = enemy ? state.party[enemy.target] : undefined;
      const facing = dormant ? Math.atan2(-x, -z) : target && target.hp > 0 ? Math.atan2(finite(target.x) - x, finite(target.z) - z) : Math.atan2(-x, -z);
      const speed = !figure.motionInitialized || !delta ? 0 : Math.min(6, Math.hypot(x - figure.previousX, z - figure.previousZ) / delta);
      figure.previousX = x; figure.previousZ = z; figure.motionInitialized = true;
      const moving = !reducedMotion && !dormant && !entering && speed > .05 && !(enemy && enemy.stunRemaining > 0);
      const phase = time * 8 + i * 1.7, run = moving ? Math.min(1, speed / 2) : 0;
      const jumpY = reducedMotion ? (jump >= 1 ? 0 : floatedY) : floatedY * (1 - travel) + Math.sin(jump * Math.PI) * 5;
      figure.root.position.set(x, dormant ? floatedY : entering ? jumpY : moving && i % 3 === 1 ? Math.max(0, Math.sin(phase)) * .15 : 0, z);
      if (!reducedMotion && distortion > 0) {
        figure.root.position.x += Math.sin(time * 35 + i * 2.1) * .06 * distortion;
        figure.root.position.z += Math.cos(time * 29 + i * 1.3) * .04 * distortion;
      }
      figure.root.rotation.set(0, facing, 0); resetPose(figure);
      const hips = figure.bones.get('hips')!;
      if (dormant) hips.position.y -= .41;
      else if (entering) hips.position.y -= (1 - travel) * .41;
      else if (moving) hips.position.y += Math.sin(phase * 2) * .018;
      const chest = figure.bones.get('spine'); if (chest && !dormant) chest.rotateX(run * .13 + (entering && !reducedMotion ? Math.sin(jump * Math.PI) * .22 : 0));
      const neck = figure.bones.get('head')!; if (enemy && enemy.stunRemaining > 0) neck.rotateX(.15);
      if (distortion > 0) {
        const sign = i % 2 ? -1 : 1;
        neck.rotateX(.08 * distortion); neck.rotateZ(sign * .13 * distortion);
        if (chest) chest.rotateZ(-sign * .065 * distortion);
        figure.bones.get('upper_chest')!.rotateY(sign * .05 * distortion);
      }
      figure.model.updateWorldMatrix(true, true);
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1, stride = Math.sin(phase + side * Math.PI) * run;
        const folded = dormant || entering && jump < .25;
        point(figure, sign * .17, folded ? .06 : .08 + Math.max(0, -stride) * .1 + (entering ? Math.sin(jump * Math.PI) * .18 : 0), folded ? .43 : stride * .25, v[12]);
        point(figure, sign * .19, .5, .65, v[13]); solveLimb(figure.legs[side], v[12], v[13], false);
        const attack = !reducedMotion && !dormant && !entering && enemy && enemy.stunRemaining <= 0 ? clamp01((.6 - positive(enemy.attackTimer)) / .6) : 0;
        point(figure, sign * (folded ? .24 : .29 + (i % 3 === 2 ? .12 : 0)), folded ? .68 : .93 + stride * .15 + attack * .25 + (entering ? .2 : 0), folded ? .37 : .12 - stride * .18 + attack * .34, v[12]);
        point(figure, sign * .62, .85, -.15, v[13]);
        poseArm(figure, side, v[12], v[13], 0, dormant ? .08 : .25 + attack * .6, !!enemy && enemy.stunRemaining > 0);
      }
    }
    // SkinnedMesh.updateMatrixWorld refreshes bindMatrixInverse. Calling only
    // Object3D.updateWorldMatrix would leave stale bounds after source scaling.
    root.updateMatrixWorld(true);
  };

  install(fallbackAnatomy());
  const loader = options.loader === false || !options.loader && typeof document === 'undefined' ? null : options.loader ?? loadAnatomy;
  if (!loader) stats.assetStatus = 'fallback';
  const ready: Promise<void> = loader ? Promise.resolve().then(loader).then(source => {
    if (disposed) { releaseSource(source); return; }
    const oldSources = [...sources];
    try {
      install(source); stats.assetStatus = 'ready'; stats.source = 'bacchus-skinned-glb';
      oldSources.forEach(old => { sources.delete(old); releaseSource(old); });
    } catch {
      clearFigures(); sources.delete(source); releaseSource(source); install(fallbackAnatomy()); stats.assetStatus = 'fallback';
      oldSources.forEach(old => { sources.delete(old); releaseSource(old); });
    }
    if (currentState) update(0, currentState, currentReduced);
  }).catch(() => { if (!disposed) stats.assetStatus = 'fallback'; }) : Promise.resolve();
  const reset = () => {
    if (disposed) return;
    time = 0; currentState = null; root.visible = false; stone.opacity = silver.opacity = 1;
    stone.transparent = silver.transparent = false; stats.maxArmStretch = 1;
    distantLighting.fill(0); distantDistortion.fill(0); sentinelPaints.forEach((_, i) => lightSentinel(i, false));
    for (const figure of [giant, ...sentinels]) if (figure) { figure.motionInitialized = false; figure.root.position.set(0, 0, 0); figure.root.rotation.set(0, 0, 0); resetPose(figure); }
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true; root.visible = false; root.removeFromParent(); clearFigures();
    ownGeometries.forEach(free); ownGeometries.clear(); sources.forEach(releaseSource); sources.clear();
    free(stone); free(silver); sentinelPaints.forEach(paints => { free(paints.body); free(paints.trim); }); distantStatueAnchors.clear(); targets.clear(); root.clear(); currentState = null; stats.assetStatus = 'disposed';
  };
  return { root, head, leftHand, rightHand, targets, distantStatueAnchors, setDistantStatueLighting, setDistantStatueDistortion, ready, stats, update, reset, dispose };
}
