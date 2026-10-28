import * as THREE from 'three';
import type { GameState } from '../../game/types.ts';
import { GROUND_EMERGE_SECONDS, GROUND_MAX_ALIVE } from '../../game/ground-enemies.ts';

/** Read-only presentation of lightning-struck stone enemies. */
export type GroundVisualState = Pick<GameState, 'encounter' | 'status' | 'enemies' | 'party'>;
const POOL_SIZE = GROUND_MAX_ALIVE;
const EMERGE_SECONDS = GROUND_EMERGE_SECONDS;
const RISE_SECONDS = .7;
const clamp = (n: number, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const smooth = (n: number) => n * n * (3 - 2 * n);

export function createGroundEnemyVisuals(scene: THREE.Scene, quality: 'low' | 'high') {
  const root = new THREE.Group(); root.name = 'ground-stone-enemies'; root.visible = false; scene.add(root);
  const targets = new Map<string, THREE.Object3D>();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const keepGeometry = <T extends THREE.BufferGeometry>(geometry: T): T => { geometries.add(geometry); return geometry; };
  const keepMaterial = <T extends THREE.Material>(material: T): T => { materials.add(material); return material; };
  const slabGeometry = keepGeometry(new THREE.BoxGeometry(1, 1, 1));
  const shardGeometry = keepGeometry(new THREE.OctahedronGeometry(1, 0));
  const ringGeometry = keepGeometry(new THREE.RingGeometry(.95, 1, quality === 'high' ? 40 : 24));
  const circleGeometry = keepGeometry(new THREE.CircleGeometry(1, quality === 'high' ? 24 : 16));
  const boltGeometry = keepGeometry(new THREE.CylinderGeometry(1, 1, 1, 4));
  // The same charcoal stone and muted bronze inlay as the arena, broken open
  // with cold lightning along the fractures. No external textures to load.
  const stone = keepMaterial(new THREE.MeshStandardMaterial({ color: '#282832', roughness: .8, metalness: .23 }));
  const cutStone = keepMaterial(new THREE.MeshStandardMaterial({ color: '#454551', roughness: .65, metalness: .25 }));
  const bronze = keepMaterial(new THREE.MeshStandardMaterial({ color: '#a18d66', roughness: .56, metalness: .65 }));
  const glow = (color: string, opacity = 1) => keepMaterial(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const result = new THREE.Mesh(geometry, material); result.position.set(x, y, z); result.scale.set(sx, sy, sz); parent.add(result); return result;
  };
  const slab = (parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, tilt = 0) => {
    const result = mesh(parent, slabGeometry, material, x, y, z, sx, sy, sz); result.rotation.z = tilt; result.castShadow = quality === 'high'; result.receiveShadow = true; return result;
  };
  const faceUp = <T extends THREE.Object3D>(object: T) => { object.rotation.x = -Math.PI / 2; return object; };
  const up = new THREE.Vector3(0, 1, 0);
  const build = (index: number) => {
    const anchor = new THREE.Group(); anchor.name = `ground-pool-${index}`; anchor.visible = false; root.add(anchor);
    const body = new THREE.Group(); body.name = 'ground-body'; anchor.add(body);
    const focus = new THREE.Group(); focus.name = 'ground-impact-focus'; focus.position.y = 1.7; body.add(focus);
    const seams = glow('#9de7ff', .9), corePaint = glow('#e1f8ff', .9), ringPaint = glow('#a8dfff', .4);
    const melee = new THREE.Group(); melee.name = 'ground-shard-body'; body.add(melee);
    slab(melee, stone, 0, 1.28, 0, 1.18, 1.05, .65, -.1);
    slab(melee, cutStone, -.28, 1.45, .38, .58, .77, .18, .15);
    slab(melee, stone, .36, 1.36, .4, .45, .81, .2, -.13);
    slab(melee, bronze, -.13, 1.35, .51, .045, .7, .03, .13);
    slab(melee, seams, .055, 1.46, .47, .055, .85, .045, -.07);
    const head = slab(melee, cutStone, .05, 2.05, .13, .61, .52, .59, .1); head.name = 'ground-stone-mask';
    slab(melee, stone, .05, 2.2, .16, .72, .13, .65, .1);
    slab(melee, corePaint, .06, 2.07, .435, .4, .055, .035, .1);
    const arms: THREE.Group[] = [], legs: THREE.Group[] = [];
    for (const sign of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(sign * .72, 1.65, 0); melee.add(arm); arms.push(arm);
      slab(arm, cutStone, sign * .05, .04, -.03, .59, .55, .72, sign * .2);
      slab(arm, stone, sign * .15, -.59, .09, .49, .76, .56, sign * -.08);
      slab(arm, seams, sign * .13, -.27, .12, .4, .055, .48, sign * .12);
      slab(arm, stone, sign * .13, -1.02, .22, .64, .45, .69, sign * .1);
      const leg = new THREE.Group(); leg.position.set(sign * .33, .7, 0); melee.add(leg); legs.push(leg);
      slab(leg, cutStone, 0, -.21, .03, .4, .51, .4, sign * -.12);
      slab(leg, stone, sign * .07, -.55, .18, .53, .25, .68, sign * .05);
    }
    const ranged = new THREE.Group(); ranged.name = 'storm-shard-body'; body.add(ranged);
    // A broken standing stele: visibly taller and narrower than the brawler.
    slab(ranged, stone, -.2, 1.55, 0, .48, 1.65, .56, -.15);
    slab(ranged, cutStone, .29, 1.83, -.02, .42, 1.78, .52, .13);
    slab(ranged, bronze, .27, 1.9, .28, .04, 1.2, .025, .13);
    const core = mesh(ranged, shardGeometry, corePaint, 0, 1.63, .29, .22, .53, .22); core.name = 'storm-shard-core';
    const crown = mesh(ranged, shardGeometry, cutStone, 0, 2.92, 0, .32, .64, .34); crown.rotation.z = -.13;
    slab(ranged, corePaint, 0, 2.81, .27, .28, .055, .06);
    const orbit = new THREE.Group(); orbit.position.y = 1.35; ranged.add(orbit);
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3;
      const part = slab(orbit, stone, Math.sin(angle) * .66, (i - 1) * .12, Math.cos(angle) * .66, .29, .69, .29, .25); part.rotation.y = angle;
      const seam = slab(orbit, seams, Math.sin(angle) * .67, (i - 1) * .12, Math.cos(angle) * .67, .3, .035, .3); seam.rotation.y = angle;
    }
    mesh(ranged, shardGeometry, cutStone, -.15, .52, -.04, .45, .5, .36);
    mesh(ranged, shardGeometry, stone, .22, .25, .12, .29, .31, .28);
    const marker = faceUp(mesh(anchor, ringGeometry, ringPaint, 0, .055, 0, 1.25, 1.25, 1)); marker.name = 'ground-target-ring';
    const scar = new THREE.Group(); scar.name = 'ground-strike-origin'; root.add(scar); scar.visible = false;
    const warningPaint = glow('#99d9ff', .5), strikePaint = glow('#effcff', 1);
    const dark = keepMaterial(new THREE.MeshBasicMaterial({ color: '#090b12', transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false }));
    const crater = faceUp(mesh(scar, circleGeometry, dark, 0, .035, 0, 1.15, 1.15, 1)); crater.name = 'ground-fracture';
    const warning = faceUp(mesh(scar, ringGeometry, warningPaint, 0, .065, 0, 2.2, 2.2, 1)); warning.name = 'ground-lightning-warning';
    const cracks: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + index * .25, b = a + .18, c = a - .09;
      cracks.push(0, .07, 0, Math.sin(a) * .65, .07, Math.cos(a) * .65,
        Math.sin(a) * .65, .07, Math.cos(a) * .65, Math.sin(b) * 1.15, .07, Math.cos(b) * 1.15,
        Math.sin(b) * 1.15, .07, Math.cos(b) * 1.15, Math.sin(c) * 1.9, .07, Math.cos(c) * 1.9);
    }
    const crackGeometry = keepGeometry(new THREE.BufferGeometry()); crackGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cracks, 3));
    const crackPaint = keepMaterial(new THREE.LineBasicMaterial({ color: '#b3e8ff', transparent: true, opacity: .7, depthWrite: false, toneMapped: false }));
    const crackLines = new THREE.LineSegments(crackGeometry, crackPaint); crackLines.name = 'ground-lit-cracks'; scar.add(crackLines);
    const bolt = new THREE.Group(); bolt.name = 'ground-lightning-strike'; bolt.visible = false; scar.add(bolt);
    const points = [new THREE.Vector3(0, .12, 0)];
    for (let i = 1; i <= 7; i++) points.push(new THREE.Vector3(Math.sin(i * 2.7 + index) * .46, i * 1.7, Math.cos(i * 1.9 + index) * .26));
    for (let i = 0; i < points.length - 1; i++) {
      const delta = points[i + 1].clone().sub(points[i]);
      const segment = mesh(bolt, boltGeometry, strikePaint, 0, 0, 0, .045, delta.length(), .045);
      segment.position.copy(points[i]).add(points[i + 1]).multiplyScalar(.5); segment.quaternion.setFromUnitVectors(up, delta.normalize());
    }
    const shock = faceUp(mesh(scar, ringGeometry, strikePaint, 0, .09, 0, 1, 1, 1)); shock.name = 'ground-strike-shock'; shock.visible = false;
    return { id: '', anchor, body, focus, melee, ranged, orbit, core, arms, legs, marker, scar, warning, crater, bolt, shock, seams, corePaint, ringPaint, warningPaint, crackPaint, strikePaint, previousX: 0, previousZ: 0, stride: 0 };
  };
  const pool = Array.from({ length: POOL_SIZE }, (_, index) => build(index));
  let disposed = false, clock = 0;
  const reset = () => {
    targets.clear(); root.visible = false; clock = 0;
    for (const rig of pool) { rig.id = ''; rig.anchor.visible = false; rig.focus.visible = false; rig.scar.visible = false; rig.stride = 0; }
  };
  return {
    root, targets, reset,
    update(dt: number, state: GroundVisualState, reducedMotion = false, selectedTarget: string | null = null) {
      if (disposed) return;
      clock += Number.isFinite(dt) && dt > 0 ? Math.min(dt, .1) : 0;
      root.visible = state.encounter === 'crown' && (state.status === 'fighting' || state.status === 'defeat');
      const visible = root.visible ? state.enemies.filter(enemy => enemy.id.startsWith('ground-') && enemy.hp > 0).slice(0, POOL_SIZE) : [];
      const present = new Set(visible.map(enemy => enemy.id));
      for (const rig of pool) if (rig.id && !present.has(rig.id)) { targets.delete(rig.id); rig.id = ''; rig.anchor.visible = false; rig.focus.visible = false; rig.scar.visible = false; }
      for (const enemy of visible) {
        let rig = pool.find(item => item.id === enemy.id);
        if (!rig) {
          rig = pool.find(item => !item.id)!; rig.id = enemy.id; rig.previousX = enemy.x; rig.previousZ = enemy.z; rig.stride = 0;
          rig.anchor.traverse(object => { object.userData.enemyId = enemy.id; });
          targets.set(enemy.id, rig.focus);
        }
        const remaining = Math.max(0, enemy.emergeRemaining ?? 0), emerging = remaining > 0;
        const progress = clamp(1 - remaining / EMERGE_SECONDS), rise = smooth(clamp(1 - remaining / RISE_SECONDS));
        const ranged = enemy.kind === 'storm-shard';
        const asleep = enemy.stunRemaining > 0;
        rig.anchor.visible = true; rig.focus.visible = true; rig.focus.position.y = ranged ? 2 : 1.7; rig.anchor.position.set(enemy.x, 0, enemy.z);
        const target = state.party[enemy.target];
        if (target) rig.anchor.rotation.y = Math.atan2(target.x - enemy.x, target.z - enemy.z);
        rig.melee.visible = !ranged; rig.ranged.visible = ranged; rig.body.visible = !emerging || remaining < RISE_SECONDS;
        const travelled = Math.hypot(enemy.x - rig.previousX, enemy.z - rig.previousZ);
        rig.stride += travelled * 4; rig.previousX = enemy.x; rig.previousZ = enemy.z;
        const walking = !reducedMotion && !emerging && !asleep && travelled > .002;
        const attack = !emerging && !asleep && enemy.attackTimer >= 0 && enemy.attackTimer < .65 ? Math.sin((.65 - enemy.attackTimer) / .65 * Math.PI) : 0;
        rig.body.position.y = reducedMotion ? 0 : -2.9 * (1 - rise) + (ranged && !emerging && !asleep ? Math.sin(clock * 1.8) * .08 : walking ? Math.abs(Math.sin(rig.stride)) * .045 : 0);
        rig.body.rotation.x = reducedMotion ? 0 : asleep ? .15 : ranged ? 0 : attack * -.15;
        rig.arms.forEach((arm, i) => { arm.rotation.x = reducedMotion ? 0 : attack * -1.05 + (walking ? Math.sin(rig.stride + i * Math.PI) * .25 : 0); });
        rig.legs.forEach((leg, i) => { leg.rotation.x = walking ? Math.sin(rig.stride + i * Math.PI) * .25 : 0; });
        rig.orbit.rotation.y = reducedMotion || asleep ? 0 : clock * .3;
        const corePulse = reducedMotion ? 0 : attack;
        rig.core.scale.set(.22 + corePulse * .07, .53 + corePulse * .1, .22 + corePulse * .07);
        rig.seams.opacity = asleep ? .3 : .75 + attack * .25; rig.corePaint.opacity = asleep ? .4 : .9;
        rig.ringPaint.color.set(attack > .1 ? '#ffd4a6' : '#a8dfff');
        rig.ringPaint.opacity = selectedTarget === enemy.id ? .95 : emerging ? .15 : .35;
        rig.marker.visible = !emerging;
        // The footprint stays where the strike occurred even after the newly
        // awakened stone has moved toward a party member.
        rig.scar.position.set(enemy.spawnX ?? enemy.x, 0, enemy.spawnZ ?? enemy.z);
        rig.scar.visible = true;
        rig.warning.visible = emerging; rig.warningPaint.opacity = .25 + progress * .65;
        rig.warning.scale.setScalar(2.2); rig.warning.scale.z = 1;
        rig.crackPaint.opacity = emerging ? .25 + progress * .75 : .18;
        rig.crater.scale.set(1.1 + rise * .3, 1.1 + rise * .3, 1);
        const striking = remaining <= RISE_SECONDS && remaining > RISE_SECONDS - .24;
        // A single short strike, without repeated flashing; reduced motion
        // retains the stable ground warning and omits the overhead bolt.
        rig.bolt.visible = striking && !reducedMotion;
        rig.shock.visible = striking && !reducedMotion;
        rig.strikePaint.opacity = clamp((remaining - (RISE_SECONDS - .24)) / .24);
        const shockScale = 1 + clamp((RISE_SECONDS - remaining) / .24) * 1.2;
        rig.shock.scale.set(shockScale, shockScale, 1);
      }
    },
    dispose() {
      if (disposed) return; disposed = true; reset(); root.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      geometries.clear(); materials.clear();
    },
  };
}
