import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GameState } from '../../game/types.ts';

type StatueState = Pick<GameState, 'time' | 'combatTime' | 'eventSeq' | 'encounter' | 'status' | 'logos' | 'enemies' | 'events'>;
export interface DistantStatueAdapter {
  getChest: (index: number, out: THREE.Vector3) => boolean;
  setLighting: (levels: readonly number[]) => void;
  setDistortion?: (levels: readonly number[]) => void;
}
const TRAILS = 8;
const FLIGHT_SECONDS = 1.85;
const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const generation = (state: StatueState) => `${state.encounter}:${state.logos.stage}:${state.logos.statueWave ?? 0}`;

export function createDarkStatues(scene: THREE.Scene, quality: 'low' | 'high', adapter?: DistantStatueAdapter) {
  const root = new THREE.Group(); root.name = 'distant-statuary'; scene.add(root);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const segments = quality === 'high' ? 14 : 9;
  const sphere = new THREE.SphereGeometry(1, segments, 8);
  const block = new THREE.BoxGeometry(1, 1, 1);
  const column = new THREE.CylinderGeometry(1, 1, 1, segments);
  geometries.add(sphere); geometries.add(block); geometries.add(column);
  const figures = Array.from({ length: 6 }, (_, index) => {
    const parts: THREE.BufferGeometry[] = [];
    const add = (source: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0, rx = 0) => {
      if (adapter) return;
      const geometry = source.clone().scale(sx, sy, sz).rotateX(rx).rotateZ(rz).translate(x, y, z);
      parts.push(geometry);
    };
    // Folded legs and heavy hands hold an unnaturally still seated posture.
    add(sphere, 0, 2.02, .05, .75, .48, .5);
    add(sphere, -.64, 1.65, .5, .68, .34, .49, -.16);
    add(sphere, .64, 1.65, .5, .68, .34, .49, .16);
    add(sphere, .08, 1.43, .94, .94, .23, .26, .1);
    add(sphere, -.08, 1.65, 1.03, .94, .23, .26, -.12);
    add(sphere, -.66, 1.41, 1.13, .35, .19, .26);
    add(sphere, .66, 1.66, 1.17, .35, .19, .26);
    add(sphere, 0, 2.85, -.02, .82, 1.05, .44);
    add(sphere, -.39, 3.21, .19, .45, .4, .32);
    add(sphere, .39, 3.21, .19, .45, .4, .32);
    add(sphere, 0, 3.72, .02, .25, .4, .25);
    const tilt = index % 2 ? -.12 : .12;
    add(sphere, 0, 4.18, .1, .4, .58, .36, tilt, .12);
    add(sphere, 0, 3.95, .28, .32, .26, .26, tilt);
    add(block, -.21, 4.29, .36, .28, .1, .14, -.12);
    add(block, .21, 4.29, .36, .28, .1, .14, .12);
    add(sphere, 0, 4.12, .43, .095, .2, .13);
    add(block, 0, 3.98, .45, .2, .055, .05);
    // Irregular crown fragments stay readable in silhouette at long distance.
    for (let tooth = -2; tooth <= 2; tooth++) add(block, tooth * .16, 4.67 + (tooth % 2 ? .04 : .1), .04, .11, .27, .24, tooth * -.12);
    for (const sign of [-1, 1]) {
      const reaching = (index + (sign > 0 ? 1 : 0)) % 3 === 0;
      add(sphere, sign * .92, 3.22, -.03, .34, .38, .35);
      add(sphere, sign * 1.08, 2.68, reaching ? .21 : 0, .26, .6, .27, sign * .17, reaching ? -.45 : 0);
      add(sphere, sign * 1.12, 2.11, reaching ? .64 : .1, .21, .56, .23, sign * -.12, reaching ? -.7 : 0);
      add(sphere, sign * 1.08, 1.65, reaching ? 1.02 : .15, .24, .29, .12, sign * .08, reaching ? -.7 : 0);
      for (let finger = 0; finger < 4; finger++) add(sphere, sign * 1.08 + (finger - 1.5) * .087, 1.35, reaching ? 1.1 : .19, .04, .21 + (finger === 1 ? .03 : 0), .055, sign * -.03);
    }
    const geometry = parts.length ? mergeGeometries(parts, false)! : new THREE.BufferGeometry(); parts.forEach(part => part.dispose()); geometries.add(geometry);
    const material = new THREE.MeshStandardMaterial({ color: '#37404c', roughness: .73, metalness: .18, transparent: true, opacity: .008, emissive: '#60768f', emissiveIntensity: 0, depthWrite: false });
    materials.add(material);
    const body = new THREE.Mesh(geometry, material); body.name = `distant-figure-${index}`;
    const angle = index / 6 * Math.PI * 2 + .37, radius = 32 + index % 3 * 1.6;
    body.position.set(Math.sin(angle) * radius, 2.4 + index % 2 * .7, Math.cos(angle) * radius);
    const size = 2.2 + index % 3 * .16; body.scale.setScalar(size); body.rotation.y = angle + Math.PI;
    if (!adapter) root.add(body);
    const chest = new THREE.Vector3(0, 3.05, .45).multiplyScalar(size).applyAxisAngle(new THREE.Vector3(0, 1, 0), body.rotation.y).add(body.position);
    const glowPaint = new THREE.MeshBasicMaterial({ color: '#c4e4ee', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    materials.add(glowPaint);
    const heart = new THREE.Mesh(sphere, glowPaint); heart.name = `distant-ember-${index}`; heart.position.copy(chest); heart.scale.set(.12, .2, .12); root.add(heart);
    return { body, material, chest, heart, glowPaint, pulse: 0, distortion: 0, available: true };
  });
  const perTrail = quality === 'high' ? 24 : 14;
  const moteGeometry = new THREE.IcosahedronGeometry(1, 0); geometries.add(moteGeometry);
  const motePaint = new THREE.MeshBasicMaterial({ color: '#b9e7f0', transparent: true, opacity: .85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }); materials.add(motePaint);
  const motes = new THREE.InstancedMesh(moteGeometry, motePaint, TRAILS * perTrail);
  motes.name = 'inward-energy'; motes.frustumCulled = false; motes.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(motes);
  const trails = Array.from({ length: TRAILS }, () => ({ active: false, age: 0, statue: 0, from: new THREE.Vector3(), bend: new THREE.Vector3(), to: new THREE.Vector3(), arrived: false }));
  const strikeGeometry = new THREE.BufferGeometry();
  strikeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(8 * 6), 3)); geometries.add(strikeGeometry);
  const strikeMaterial = new THREE.LineBasicMaterial({ color: '#daefff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }); materials.add(strikeMaterial);
  const directStrike = new THREE.LineSegments(strikeGeometry, strikeMaterial); directStrike.name = 'distant-lightning-contact'; directStrike.visible = false; directStrike.frustumCulled = false; root.add(directStrike);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), size = new THREE.Vector3(), quaternion = new THREE.Quaternion();
  const color = new THREE.Color();
  let disposed = false, initialized = false, lastTime = 0, lastEvent = 0, stage = '', ambientReveal = 0, absorbed = 0;
  let previousFlash = 0, strikeEdges = 0, transfers = 0, strikeLife = 0, strikeCooldown = 0;
  const previous = new Map<string, number>(), consumed = new Set<string>();
  const clearTrails = () => { trails.forEach(trail => { trail.active = false; }); figures.forEach(figure => { figure.pulse = figure.distortion = 0; }); motes.visible = false; strikeLife = 0; directStrike.visible = false; };
  const baseline = (state: StatueState) => {
    previous.clear(); consumed.clear();
    state.enemies.forEach(enemy => { previous.set(enemy.id, enemy.hp); if (enemy.hp <= 0) consumed.add(enemy.id); });
    lastTime = state.time; lastEvent = state.eventSeq; stage = generation(state); initialized = true;
  };
  const launchTrail = (from: THREE.Vector3, destination: number) => {
    const trail = trails.find(item => !item.active) ?? trails.reduce((a, b) => a.age > b.age ? a : b);
    trail.active = true; trail.age = 0; trail.statue = destination; trail.arrived = false;
    trail.from.copy(from); trail.to.copy(figures[destination].chest);
    trail.bend.copy(trail.from).lerp(trail.to, .45); trail.bend.y += 4;
    const dx = trail.to.x - trail.from.x, dz = trail.to.z - trail.from.z, distance = Math.max(1, Math.hypot(dx, dz));
    trail.bend.x += -dz / distance * 3; trail.bend.z += dx / distance * 3;
  };
  const absorb = (enemy: StatueState['enemies'][number]) => {
    if (consumed.has(enemy.id)) return;
    consumed.add(enemy.id);
    const available = figures.flatMap((figure, index) => figure.available ? [index] : []);
    if (!available.length) return;
    absorbed++;
    const nearest = available.reduce((best, i) => Math.hypot(figures[i].chest.x - enemy.x, figures[i].chest.z - enemy.z) < Math.hypot(figures[best].chest.x - enemy.x, figures[best].chest.z - enemy.z) ? i : best, available[0]);
    launchTrail(new THREE.Vector3(enemy.x, 1.4, enemy.z), nearest);
  };
  const strikeStatue = () => {
    const available = figures.flatMap((figure, index) => figure.available ? [index] : []);
    if (available.length < 2) return;
    const sourceIndex = transfers % available.length;
    const source = available[sourceIndex], destination = available[(sourceIndex + 1 + transfers % (available.length - 1)) % available.length];
    const target = figures[source].chest, points = strikeGeometry.getAttribute('position');
    for (let segment = 0; segment < 8; segment++) for (let end = 0; end < 2; end++) {
      const t = (segment + end) / 8, jitter = Math.sin(t * Math.PI) * .65;
      points.setXYZ(segment * 2 + end, target.x + Math.sin((segment + end) * 3.1 + source) * jitter, target.y + (1 - t) * 21, target.z + Math.cos((segment + end) * 2.2 + source) * jitter);
    }
    points.needsUpdate = true; strikeLife = .26; figures[source].pulse = .7; figures[source].distortion = 1;
    launchTrail(target, destination); transfers++;
  };
  const reset = () => {
    initialized = false; previous.clear(); consumed.clear(); ambientReveal = absorbed = 0; previousFlash = strikeEdges = transfers = strikeCooldown = 0; clearTrails();
    adapter?.setLighting([0, 0, 0, 0, 0, 0]);
    adapter?.setDistortion?.([0, 0, 0, 0, 0, 0]);
    figures.forEach(figure => { figure.material.opacity = .008; figure.material.emissiveIntensity = 0; figure.glowPaint.opacity = 0; });
  };
  return {
    root,
    update(dt: number, state: StatueState, reducedMotion = false, lightningFlash = 0) {
      if (disposed) return;
      const elapsed = Number.isFinite(dt) && dt > 0 ? Math.min(dt, .1) : 0;
      figures.forEach((figure, index) => {
        figure.available = adapter ? adapter.getChest(index, figure.chest) : true;
        figure.heart.visible = figure.available; figure.heart.position.copy(figure.chest);
      });
      const currentStage = generation(state);
      const flash = clamp(lightningFlash);
      const changed = !initialized || state.time < lastTime || state.time - lastTime > 1 || state.eventSeq < lastEvent || currentStage !== stage;
      if (changed) { clearTrails(); baseline(state); previousFlash = flash; }
      else {
        // A witnessed hit-to-zero can create a trail; missing entities and encounter
        // cleanup cannot. A recorded shatter also covers deaths between snapshots.
        if (state.status === 'fighting') for (const enemy of state.enemies) if (enemy.hp <= 0 && (previous.get(enemy.id) ?? 0) > 0) absorb(enemy);
        for (const event of state.events) if (event.id > lastEvent && state.combatTime - event.time >= -1e-8 && state.combatTime - event.time <= .6 && event.kind === 'ground_shatter' && event.enemyId) {
          const enemy = state.enemies.find(enemy => enemy.id === event.enemyId);
          if (enemy?.hp === 0) absorb(enemy);
        }
        for (const enemy of state.enemies) { previous.set(enemy.id, enemy.hp); if (enemy.hp > 0) consumed.delete(enemy.id); }
        lastEvent = state.eventSeq; lastTime = state.time;
      }
      // Figures remain physically present; only illumination changes.
      root.visible = true;
      strikeCooldown = Math.max(0, strikeCooldown - elapsed);
      if (!changed && flash > .2 && previousFlash <= .2 && strikeCooldown <= 0) {
        strikeEdges++; strikeCooldown = .9;
        if (strikeEdges % 3 === 1) strikeStatue();
      }
      previousFlash = flash;
      const groundStrike = state.enemies.some(enemy => enemy.hp > 0 && (enemy.emergeRemaining ?? 0) > .46 && (enemy.emergeRemaining ?? 0) <= .7);
      ambientReveal = Math.max(ambientReveal - elapsed * 1.5, flash, groundStrike ? .8 : 0);
      // Reduced motion caps the reveal and removes the moving overhead bolt.
      const ambient = reducedMotion ? Math.min(.085, ambientReveal) : ambientReveal;
      strikeLife = Math.max(0, strikeLife - elapsed);
      directStrike.visible = strikeLife > 0 && !reducedMotion; strikeMaterial.opacity = clamp(strikeLife / .26);
      figures.forEach(figure => { figure.pulse = Math.max(0, figure.pulse - elapsed * .8); figure.distortion = Math.max(0, figure.distortion - elapsed * 2); });
      let visibleMotes = false;
      for (let i = 0; i < trails.length; i++) {
        const trail = trails[i];
        if (trail.active) {
          if (!figures[trail.statue].available) trail.active = false;
          trail.to.copy(figures[trail.statue].chest);
          trail.age += elapsed;
          if (!trail.arrived && trail.age >= FLIGHT_SECONDS) { figures[trail.statue].pulse = reducedMotion ? .25 : .85; trail.arrived = true; }
          if (trail.age > FLIGHT_SECONDS + .6) trail.active = false;
        }
        for (let j = 0; j < perTrail; j++) {
          const index = i * perTrail + j;
          let radius = 0;
          if (trail.active) {
            if (reducedMotion) {
              if (j < 2) { position.copy(j === 0 ? trail.from : trail.to); radius = .16 * Math.max(0, 1 - trail.age / (FLIGHT_SECONDS + .6)); }
            } else {
              const t = (trail.age - j * .023) / FLIGHT_SECONDS;
              if (t >= 0 && t <= 1) {
                const travel = t * t * (3 - 2 * t), inverse = 1 - travel;
                position.copy(trail.from).multiplyScalar(inverse * inverse).addScaledVector(trail.bend, 2 * inverse * travel).addScaledVector(trail.to, travel * travel);
                const spiral = Math.sin(Math.PI * t) * .24;
                position.x += Math.cos(t * 20 + j) * spiral; position.y += Math.sin(t * 20 + j) * spiral;
                radius = (.11 - j / perTrail * .075) * Math.min(1, (1 - t) * 9);
              }
            }
          }
          visibleMotes ||= radius > 0; size.setScalar(radius); matrix.compose(position, quaternion, size); motes.setMatrixAt(index, matrix);
          color.set(j % 4 === 0 ? '#ebc58d' : '#aee9ef'); motes.setColorAt(index, color);
        }
      }
      figures.forEach(figure => {
        const reveal = ambient;
        figure.material.opacity = .008 + reveal * .62;
        figure.material.emissiveIntensity = reveal * .65;
        figure.glowPaint.opacity = figure.pulse * .8; figure.heart.scale.setScalar(.12 + figure.pulse * .2);
      });
      adapter?.setLighting(figures.map(figure => figure.available ? ambient : 0));
      adapter?.setDistortion?.(figures.map(figure => figure.available ? figure.distortion : 0));
      motes.visible = visibleMotes; motes.instanceMatrix.needsUpdate = true; if (motes.instanceColor) motes.instanceColor.needsUpdate = true;
    },
    reset,
    stats: () => ({ statues: figures.length, capacity: TRAILS, activeTrails: trails.filter(trail => trail.active).length, absorptions: absorbed, statueTransfers: transfers, disposed }),
    dispose() {
      if (disposed) return; disposed = true; reset(); root.removeFromParent(); motes.dispose();
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
      geometries.clear(); materials.clear();
    },
  };
}
