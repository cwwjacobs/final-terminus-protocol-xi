import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Role } from '@/game/types';

/** Art boundary: a future cached GLB factory can return this rig interface.
 * Keep transforms, selection marker and animation handles independent of rules.
 * Geometry below is intentionally procedural, shared, and replaceable. */
export interface ActorRig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  ornament: THREE.Group;
  marker: THREE.Mesh;
  accent: THREE.MeshStandardMaterial;
  attack: number;
  step: number;
  boss: boolean;
  role: Role | null;
}

export class ActorAssets {
  geometries = new Set<THREE.BufferGeometry>();
  materials = new Set<THREE.Material>();
  private shapes = new Map<string, THREE.BufferGeometry>();
  private paints = new Map<string, THREE.MeshStandardMaterial>();

  shape(name: 'box' | 'sphere' | 'crystal' | 'cylinder' | 'cone' | 'ring' | 'halo' | 'bow') {
    const existing = this.shapes.get(name);
    if (existing) return existing;
    const geometry = name === 'box' ? new THREE.BoxGeometry(1, 1, 1)
      : name === 'sphere' ? new THREE.IcosahedronGeometry(.5, 1)
      : name === 'crystal' ? new THREE.OctahedronGeometry(.5, 0)
      : name === 'cylinder' ? new THREE.CylinderGeometry(.5, .5, 1, 8)
      : name === 'cone' ? new THREE.ConeGeometry(.5, 1, 6)
      : name === 'halo' ? new THREE.TorusGeometry(.5, .018, 4, 48)
      : name === 'bow' ? new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -.74, 0), new THREE.Vector3(.2, -.51, 0),
        new THREE.Vector3(.32, -.18, 0), new THREE.Vector3(.27, 0, 0),
        new THREE.Vector3(.32, .18, 0), new THREE.Vector3(.2, .51, 0), new THREE.Vector3(0, .74, 0),
      ]), 20, .026, 5, false)
      : new THREE.RingGeometry(.42, .5, 32);
    this.shapes.set(name, geometry);
    this.geometries.add(geometry);
    return geometry;
  }

  paint(color: string, glow = false, cloth = false) {
    const key = `${color}-${glow}-${cloth}`;
    const existing = this.paints.get(key);
    if (existing) return existing;
    const material = new THREE.MeshStandardMaterial({
      color, roughness: cloth ? .96 : .48, metalness: cloth ? .05 : .7,
      emissive: glow ? color : '#000000', emissiveIntensity: glow ? 1.4 : 0,
      flatShading: true,
    });
    this.paints.set(key, material);
    this.materials.add(material);
    return material;
  }
}

function part(assets: ActorAssets, parent: THREE.Object3D, shape: Parameters<ActorAssets['shape']>[0],
  material: THREE.Material, position: [number, number, number], scale: [number, number, number],
  rotation?: [number, number, number]) {
  const mesh = new THREE.Mesh(assets.shape(shape), material);
  mesh.position.set(...position); mesh.scale.set(...scale);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Batch only rigid children of each joint; articulated animation stays intact. */
function batchStaticParts(assets: ActorAssets, root: THREE.Group) {
  const joints: THREE.Group[] = [];
  root.traverse(object => { if (object instanceof THREE.Group) joints.push(object); });
  for (const joint of joints) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of joint.children) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) continue;
      const batch = batches.get(child.material) ?? [];
      batch.push(child); batches.set(child.material, batch);
    }
    for (const [material, originals] of batches) {
      if (originals.length < 2) continue;
      const parts = originals.map(original => {
        original.updateMatrix();
        const geometry = original.geometry.index ? original.geometry.toNonIndexed() : original.geometry.clone();
        geometry.deleteAttribute('uv'); geometry.applyMatrix4(original.matrix);
        return geometry;
      });
      const combined = mergeGeometries(parts, false); parts.forEach(geometry => geometry.dispose());
      if (!combined) continue;
      assets.geometries.add(combined);
      const mesh = new THREE.Mesh(combined, material); mesh.castShadow = true; mesh.receiveShadow = true;
      originals.forEach(original => joint.remove(original)); joint.add(mesh);
    }
  }
}

export function createActor(assets: ActorAssets, role: Role, color: string): ActorRig {
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
  const leftArm = new THREE.Group(), rightArm = new THREE.Group();
  const leftLeg = new THREE.Group(), rightLeg = new THREE.Group(), ornament = new THREE.Group();
  root.add(body, ornament); body.add(head, leftArm, rightArm, leftLeg, rightLeg);
  const metal = assets.paint('#baae8d');
  const ivory = assets.paint('#eee5c6');
  const dark = assets.paint('#202b40');
  const cloth = assets.paint(role === 'hunter' ? '#283947' : '#30334a', false, true);
  const accent = assets.paint(color, true);
  const marker = part(assets, root, 'ring', accent, [0, .035, 0], [1.2, 1.2, 1.2], [-Math.PI / 2, 0, 0]);
  marker.castShadow = false; marker.receiveShadow = false;

  // All actors face local +z. Their head/limb joints remain stable for GLB replacement.
  body.position.y = .02;
  const wide = role === 'warden' ? 1.22 : role === 'hunter' ? .86 : 1;
  part(assets, body, 'box', dark, [0, .86, 0], [.42 * wide, .25, .26]);
  part(assets, body, 'cylinder', metal, [0, 1.19, 0], [.61 * wide, .52, .37]);
  part(assets, body, 'crystal', ivory, [0, 1.25, .21], [.38, .42, .12]);
  part(assets, body, 'crystal', accent, [0, 1.25, .28], [.13, .2, .08]);
  head.position.set(0, 1.61, 0);
  part(assets, head, 'sphere', ivory, [0, .03, 0], [.35, .43, .34]);
  part(assets, head, 'box', dark, [0, .07, .16], [.29, .065, .07]);
  part(assets, head, 'box', accent, [0, .07, .201], [.22, .018, .025]);
  for (const [arm, sign] of [[leftArm, -1], [rightArm, 1]] as const) {
    arm.position.set(sign * .36 * wide, 1.4, 0);
    part(assets, arm, 'sphere', metal, [0, -.05, 0], [.29, .25, .34]);
    part(assets, arm, 'cylinder', dark, [0, -.27, 0], [.14, .4, .14]);
    part(assets, arm, 'box', ivory, [0, -.42, .015], [.19, .21, .22]);
    part(assets, arm, 'sphere', dark, [0, -.59, .025], [.17, .16, .17]);
  }
  for (const [leg, sign] of [[leftLeg, -1], [rightLeg, 1]] as const) {
    leg.position.set(sign * .15, .86, 0);
    part(assets, leg, 'cylinder', dark, [0, -.2, 0], [.19, .4, .19]);
    part(assets, leg, 'box', metal, [0, -.52, .015], [.23, .3, .25]);
    part(assets, leg, 'box', dark, [0, -.72, .08], [.25, .13, .38]);
  }

  if (role === 'vanguard') {
    // Bacchus's Thyrsus / polearm direction, rather than the older sword placeholder.
    part(assets, rightArm, 'cylinder', metal, [.08, -.18, .13], [.055, 2.5, .055]);
    part(assets, rightArm, 'crystal', ivory, [.08, 1.2, .13], [.23, .56, .16]);
    part(assets, rightArm, 'crystal', accent, [.08, 1.16, .13], [.12, .32, .2]);
    part(assets, head, 'halo', metal, [0, .12, 0], [.8, .8, .8], [Math.PI / 2, 0, 0]);
    part(assets, body, 'cone', cloth, [0, .74, -.13], [.65, .5, .45], [0, 0, Math.PI]);
  } else if (role === 'warden') {
    part(assets, leftArm, 'box', metal, [-.08, -.43, .25], [.55, .8, .16]);
    part(assets, leftArm, 'crystal', ivory, [-.08, -.43, .36], [.48, .72, .1]);
    part(assets, leftArm, 'box', accent, [-.08, -.43, .43], [.045, .59, .03]);
    part(assets, rightArm, 'cylinder', dark, [0, -.58, .11], [.06, .35, .06]);
    part(assets, rightArm, 'box', ivory, [0, -.87, .11], [.2, .65, .07]);
    part(assets, body, 'cone', ivory, [0, 1.48, -.23], [.46, .5, .16]);
    part(assets, body, 'box', cloth, [0, .9, -.24], [.56, .98, .06]);
  } else if (role === 'hunter') {
    part(assets, head, 'sphere', cloth, [0, .08, -.045], [.45, .53, .37]);
    // Open recurved limbs and a visible string make the ranged role legible.
    part(assets, leftArm, 'bow', ivory, [-.11, -.47, .16], [1, 1, 1], [0, Math.PI / 3, 0]);
    part(assets, leftArm, 'box', accent, [-.11, -.47, .16], [.012, 1.48, .012]);
    part(assets, body, 'cone', cloth, [0, .87, -.16], [.67, .95, .27], [0, 0, Math.PI]);
    part(assets, body, 'cylinder', metal, [.2, 1.12, -.27], [.16, .7, .16], [0, 0, -.3]);
  } else {
    part(assets, body, 'cone', cloth, [0, .63, 0], [.8, 1.2, .58], [0, 0, Math.PI]);
    part(assets, body, 'box', ivory, [0, .76, .3], [.1, .85, .035]);
    part(assets, rightArm, 'cylinder', metal, [.04, -.2, .12], [.05, 2.08, .05]);
    part(assets, rightArm, 'halo', accent, [.04, .88, .12], [.53, .53, .53]);
    part(assets, rightArm, 'crystal', ivory, [.04, .88, .12], [.17, .28, .17]);
    part(assets, ornament, 'halo', accent, [0, 2.03, -.06], [role === 'luminary' ? 1.16 : .8, .8, .8], [Math.PI / 2, 0, 0]);
    if (role === 'arcanist') {
      part(assets, head, 'cone', metal, [0, .3, -.025], [.36, .48, .34]);
      for (const sign of [-1, 1]) part(assets, ornament, 'crystal', accent, [sign * .53, 1.88, -.1], [.11, .26, .11]);
    }
  }
  batchStaticParts(assets, root);
  return { root, body, head, leftArm, rightArm, leftLeg, rightLeg, ornament, marker, accent, attack: 0, step: 0, boss: false, role };
}

/** Crown Resonance is an abstract manifestation, not armored robotic anatomy.
 * The common rig handles below are animation anchors for floating satellite cores. */
export function createCrownResonance(assets: ActorAssets): ActorRig {
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
  const leftArm = new THREE.Group(), rightArm = new THREE.Group();
  const leftLeg = new THREE.Group(), rightLeg = new THREE.Group(), ornament = new THREE.Group();
  root.add(body, ornament); body.add(head, leftArm, rightArm, leftLeg, rightLeg);
  const black = assets.paint('#25203f');
  const metal = assets.paint('#807799');
  const ivory = assets.paint('#ded8c2');
  const accent = assets.paint('#a89aef', true);
  const gold = assets.paint('#dbb66d', true);
  const marker = part(assets, root, 'ring', accent, [0, .035, 0], [5.6, 5.6, 5.6], [-Math.PI / 2, 0, 0]);
  marker.castShadow = false;
  // An open core suspended between unequally sized shards, with no face or limbs.
  part(assets, body, 'crystal', accent, [0, 3.8, 0], [1.15, 2.2, 1.15], [.15, 0, .25]);
  part(assets, body, 'halo', gold, [0, 3.8, 0], [2.5, 2.5, 2.5], [Math.PI / 2.4, .3, .2]);
  part(assets, body, 'crystal', ivory, [-.86, 4.3, .15], [.52, 2.8, .7], [.1, .4, -.37]);
  part(assets, body, 'crystal', ivory, [.75, 3.6, -.18], [.8, 2, .65], [-.2, .3, -.24]);
  part(assets, body, 'crystal', black, [-.36, 2.1, .06], [.65, 1.7, .8], [0, .2, -.18]);
  part(assets, body, 'crystal', metal, [.57, 1.65, -.25], [.35, 1.4, .4], [.2, 0, .3]);
  part(assets, body, 'crystal', gold, [-.12, .9, .04], [.15, .6, .15], [0, 0, -.15]);
  head.position.set(-.28, 5.7, -.1);
  part(assets, head, 'crystal', ivory, [0, 0, 0], [.7, 1, .65], [.1, .5, .5]);
  part(assets, head, 'halo', gold, [0, .05, 0], [1.4, 1.4, 1.4], [.3, .6, 0]);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    part(assets, head, 'crystal', gold, [Math.sin(a) * .6, .4 + Math.cos(a) * .52, -.06], [.15, .7, .15], [0, 0, -a]);
  }
  leftArm.position.set(-2.25, 4.25, .15);
  rightArm.position.set(1.95, 3.65, -.3);
  for (const [satellite, sign] of [[leftArm, -1], [rightArm, 1]] as const) {
    part(assets, satellite, 'crystal', accent, [0, 0, 0], [.52, .9, .55], [.3, 0, sign * .4]);
    part(assets, satellite, 'halo', ivory, [0, 0, 0], [1.5, 1.5, 1.5], [.4, sign * .55, .2]);
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3 + sign * .3;
      part(assets, satellite, 'crystal', i === 0 ? gold : ivory, [Math.sin(a) * .78, Math.cos(a) * .78, .12], [.17, .62, .22], [0, .3, -a]);
    }
  }
  // The broad crown and satellite offsets retain boss-scale readability.
  part(assets, ornament, 'halo', gold, [0, 5.25, -.65], [5.6, 5.6, 5.6]);
  part(assets, ornament, 'halo', metal, [0, 5.25, -.67], [6.0, 6.0, 6.0]);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    part(assets, ornament, 'crystal', i % 3 ? ivory : gold, [Math.sin(a) * 3.08, 5.25 + Math.cos(a) * 3.08, -.65], [.15, .5, .15], [0, 0, -a]);
  }
  batchStaticParts(assets, root);
  return { root, body, head, leftArm, rightArm, leftLeg, rightLeg, ornament, marker, accent, attack: 0, step: 0, boss: true, role: null };
}

/** Update transforms only: no per-frame geometry, material, or vector allocation. */
export function animateActor(rig: ActorRig, dt: number, time: number, speed: number, alive: boolean, casting = false) {
  rig.attack = Math.max(0, rig.attack - dt * 2.5);
  rig.step += speed * dt * 2.8;
  if (!alive) {
    rig.body.rotation.z = THREE.MathUtils.damp(rig.body.rotation.z, Math.PI * .46, 8, dt);
    rig.body.position.y = THREE.MathUtils.damp(rig.body.position.y, rig.boss ? .6 : .1, 8, dt);
    rig.marker.visible = false;
    return;
  }
  rig.body.rotation.z = THREE.MathUtils.damp(rig.body.rotation.z, 0, 8, dt);
  rig.marker.visible = true;
  if (rig.boss) {
    rig.body.position.y = .12 + Math.sin(time * 1.25) * .12;
    rig.head.rotation.y = Math.sin(time * .45) * .12;
    rig.leftArm.position.y = 4.25 + Math.sin(time * .83) * .22;
    rig.rightArm.position.y = 3.65 + Math.cos(time * .71) * .3;
    rig.leftArm.rotation.z = time * .22 + (casting ? -.35 : 0);
    rig.rightArm.rotation.z = -time * .17 + (casting ? .35 : 0);
    rig.rightArm.rotation.x = -Math.sin(rig.attack * Math.PI) * 1.1;
    rig.ornament.rotation.z = Math.sin(time * .12) * .04;
  } else {
    const stride = Math.min(1, speed / 4), swing = Math.sin(rig.step) * stride;
    rig.body.position.y = .02 + Math.abs(Math.cos(rig.step)) * stride * .06;
    rig.leftLeg.rotation.x = swing * .6;
    rig.rightLeg.rotation.x = -swing * .6;
    rig.leftArm.rotation.x = -swing * .35;
    rig.rightArm.rotation.x = swing * .35 - Math.sin(rig.attack * Math.PI) * 1.35;
    if (rig.role === 'hunter' && rig.attack > 0) {
      const draw = Math.sin(rig.attack * Math.PI);
      rig.leftArm.rotation.x -= draw * 1.2;
      rig.rightArm.rotation.x = -draw * 1.15;
    }
    rig.body.rotation.y = Math.sin(rig.attack * Math.PI) * -.32;
    rig.ornament.rotation.y = time * .28;
  }
}
