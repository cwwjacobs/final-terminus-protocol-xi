import * as THREE from 'three';
import { ARENA_RADIUS } from '../../game/content.ts';
import { arenaRadius, LOGOS_MIN_RADIUS } from '../../game/logos-arena.ts';
import type { GameState } from '../../game/types.ts';

type ArenaState = Pick<GameState, 'encounter' | 'logos' | 'boss' | 'time'>;

/** Three bounded draws: a broken rim, short cracks and pooled stone fragments.
 * The floor, collision boundary and final fall remain owned by the encounter. */
export function createLogosArenaEffects(scene: THREE.Scene, quality: 'low' | 'high') {
  const root = new THREE.Group(); root.name = 'logos-retreating-arena'; root.visible = false; scene.add(root);
  const segments = quality === 'high' ? 96 : 64, capacity = quality === 'high' ? 16 : 8;
  const vertices: number[] = [], cracks: number[] = [];
  for (let i = 0; i < segments; i++) {
    if (i % 8 === 7) continue;
    const a = i / segments * Math.PI * 2, b = (i + 1) / segments * Math.PI * 2;
    const ax = Math.sin(a), az = Math.cos(a), bx = Math.sin(b), bz = Math.cos(b);
    vertices.push(ax, 0, az, bx, 0, bz, ax * .996, 0, az * .996);
    vertices.push(bx, 0, bz, bx * .996, 0, bz * .996, ax * .996, 0, az * .996);
    if (i % 8 === 0) {
      const bend = a + .007, end = a - .004;
      cracks.push(ax, 0, az, Math.sin(bend) * .982, 0, Math.cos(bend) * .982,
        Math.sin(bend) * .982, 0, Math.cos(bend) * .982, Math.sin(end) * .965, 0, Math.cos(end) * .965);
    }
  }
  const rimGeometry = new THREE.BufferGeometry(); rimGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  rimGeometry.computeBoundingSphere();
  const crackGeometry = new THREE.BufferGeometry(); crackGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cracks, 3));
  crackGeometry.computeBoundingSphere();
  const rimPaint = new THREE.MeshBasicMaterial({ color: '#d8bd85', transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  const crackPaint = new THREE.LineBasicMaterial({ color: '#e4caa0', transparent: true, opacity: .38, depthWrite: false, toneMapped: false });
  const rim = new THREE.Mesh(rimGeometry, rimPaint); rim.name = 'logos-fractured-rim'; rim.position.y = .042; root.add(rim);
  const fractures = new THREE.LineSegments(crackGeometry, crackPaint); fractures.name = 'logos-rim-fractures'; fractures.position.y = .044; root.add(fractures);
  const chunkGeometry = new THREE.BoxGeometry(1, 1, 1);
  const chunkPaint = new THREE.MeshStandardMaterial({ color: '#292735', roughness: .66, metalness: .25, emissive: '#796048', emissiveIntensity: .15 });
  const chunks = new THREE.InstancedMesh(chunkGeometry, chunkPaint, capacity); chunks.name = 'logos-falling-rim-stone'; chunks.visible = false;
  chunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); chunks.frustumCulled = false; root.add(chunks);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const rotation = new THREE.Euler(), quaternion = new THREE.Quaternion();
  let disposed = false, lastTime = -1, lastRadius = ARENA_RADIUS, crumbleUntil = 0, lastPressure = -1, lastChunkTime = -1, lastChunkRadius = -1;
  const hide = () => {
    if (root.visible) root.visible = false;
    if (chunks.visible) chunks.visible = false;
    lastTime = -1; lastRadius = ARENA_RADIUS; crumbleUntil = 0; lastPressure = -1; lastChunkTime = -1; lastChunkRadius = -1;
  };
  return {
    root,
    update(state: ArenaState, reducedMotion = false) {
      if (disposed) return;
      if (state.encounter !== 'logos' || state.logos.stage !== 'giant') { if (lastTime !== -1 || root.visible) hide(); return; }
      const radius = arenaRadius(state);
      const maxHp = Number.isFinite(state.boss.maxHp) && state.boss.maxHp > 0 ? state.boss.maxHp : 1;
      const hpFraction = Math.min(1, Math.max(0, Number.isFinite(state.boss.hp) ? state.boss.hp / maxHp : 1));
      const pressure = Math.min(1, Math.max(0, (ARENA_RADIUS - radius) / (ARENA_RADIUS - LOGOS_MIN_RADIUS)));
      if (radius >= ARENA_RADIUS - .01 && hpFraction > .35) { if (lastTime !== -1 || root.visible) hide(); return; }
      const time = Math.max(0, Number.isFinite(state.time) ? state.time : 0);
      const resumed = lastTime < 0 || time < lastTime || time - lastTime > 1;
      if (resumed) crumbleUntil = 0;
      else if (radius < lastRadius - .001) crumbleUntil = time + 1.6;
      if (!root.visible) root.visible = true;
      if (radius !== lastRadius || lastTime < 0) { rim.scale.set(radius, 1, radius); fractures.scale.set(radius, 1, radius); }
      if (pressure !== lastPressure) {
        rimPaint.opacity = .45 + pressure * .27; crackPaint.opacity = .25 + pressure * .3;
        lastPressure = pressure;
      }
      const movingChunks = !reducedMotion && (time < crumbleUntil || hpFraction <= .35);
      if (chunks.visible !== movingChunks) chunks.visible = movingChunks;
      if (movingChunks && (time !== lastChunkTime || radius !== lastChunkRadius || resumed)) {
        const count = Math.min(capacity, Math.max(3, Math.ceil(capacity * (.25 + pressure * .5))));
        chunks.count = count;
        for (let i = 0; i < count; i++) {
          const phase = (time * .55 + i * .61803398875) % 1;
          const angle = i / count * Math.PI * 2 + .17;
          const distance = radius + .12 + phase * .9;
          position.set(Math.sin(angle) * distance, -.14 - phase * phase * 4.2, Math.cos(angle) * distance);
          rotation.set(phase * 1.9 + i, i * .7, phase * 1.3); quaternion.setFromEuler(rotation);
          const fade = Math.min(1, (1 - phase) * 5), size = (.24 + (i % 3) * .09) * fade;
          scale.set(size * 1.7, size * .65, size); matrix.compose(position, quaternion, scale); chunks.setMatrixAt(i, matrix);
        }
        chunks.instanceMatrix.needsUpdate = true; lastChunkTime = time; lastChunkRadius = radius;
      }
      lastTime = time; lastRadius = radius;
    },
    dispose() {
      if (disposed) return;
      disposed = true; root.visible = false; root.removeFromParent(); chunks.dispose();
      rimGeometry.dispose(); crackGeometry.dispose(); chunkGeometry.dispose();
      rimPaint.dispose(); crackPaint.dispose(); chunkPaint.dispose();
    },
  };
}
