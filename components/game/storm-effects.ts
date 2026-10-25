import * as THREE from 'three';
import type { GameState } from '../../game/types';
import { STATIC_REACH } from '../../game/static-storm';
import type { CombatEvent } from './world-feedback';

/** Bounded visual-only pool. Combat timing and recipients come from the kernel. */
export function createStormEffects(scene: THREE.Scene, quality: 'low' | 'high') {
  const group = new THREE.Group(); scene.add(group);
  const bolts = Array.from({ length: quality === 'high' ? 10 : 6 }, () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(144), 3));
    const material = new THREE.LineBasicMaterial({ color: '#a8e6ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const line = new THREE.LineSegments(geometry, material); line.frustumCulled = false; line.visible = false; group.add(line);
    return { line, life: 0, duration: .6, strength: 1 };
  });
  function bolt(from: THREE.Vector3, to: THREE.Vector3, strength = 1, calm = false) {
    const slot = bolts.find(b => b.life <= 0) ?? bolts[0];
    const a = slot.line.geometry.attributes.position as THREE.BufferAttribute;
    const points: THREE.Vector3[] = [from];
    for (let i = 1; i < 16; i++) {
      const t = i / 16, p = from.clone().lerp(to, t), jitter = Math.sin(t * Math.PI) * (strength < .5 ? 2 : .7);
      p.x += (Math.random() - .5) * jitter; p.z += (Math.random() - .5) * jitter; points.push(p);
    }
    points.push(to);
    let vertex = 0;
    for (let i = 0; i < 16; i++) for (const p of [points[i], points[i + 1]]) a.setXYZ(vertex++, p.x, p.y, p.z);
    for (let i = 0; i < 8; i++) {
      const p = points[2 + i]; a.setXYZ(vertex++, p.x, p.y, p.z);
      a.setXYZ(vertex++, p.x + (Math.random() - .5) * 3, p.y - .7, p.z + (Math.random() - .5) * 3);
    }
    a.needsUpdate = true; slot.life = slot.duration = calm ? .9 : .6; slot.strength = strength; slot.line.visible = true;
  }
  function halo(color: string, radius: number) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .32, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(radius - .06, radius, 64), material);
    mesh.rotation.x = -Math.PI / 2; mesh.visible = false; group.add(mesh); return mesh;
  }
  const reach = halo('#83ceff', STATIC_REACH);
  const charge = halo('#a8e6ff', 2.5);
  const chargeVertices: number[] = [];
  for (let strand = 0; strand < 6; strand++) {
    for (let segment = 0; segment < 8; segment++) {
      for (const step of [segment, segment + 1]) {
        const angle = strand / 6 * Math.PI * 2 + step * .18 + (step % 2 ? .16 : -.16);
        chargeVertices.push(Math.sin(angle) * 1.7, .4 + step * .4, Math.cos(angle) * 1.7);
      }
    }
  }
  const chargeGeometry = new THREE.BufferGeometry();
  chargeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(chargeVertices, 3));
  const filaments = new THREE.LineSegments(chargeGeometry, new THREE.LineBasicMaterial({ color: '#b8efff', transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending }));
  filaments.visible = false; group.add(filaments);
  const threads = Array.from({ length: 5 }, () => halo('#b0ffea', 1));
  const waves = Array.from({ length: 3 }, () => ({ mesh: halo('#baffed', 1), life: 0 }));
  let distantIn = 3, visualTime = 0, reduced = false;
  const point = (p: { x: number; z: number }, y = 1.6) => new THREE.Vector3(p.x, y, p.z);
  return {
    event(event: CombatEvent, state: GameState) {
      if (event.kind === 'static_strike') bolt(point({ x: state.boss.x - 4, z: state.boss.z - 2 }, 34), point(state.boss, 2.8), reduced ? .45 : 1, reduced);
      if (event.kind === 'static_arc' && event.actor !== undefined) {
        const from = event.target === undefined ? state.boss : state.party[event.target];
        bolt(point(from, 2), point(state.party[event.actor]), reduced ? .4 : .9, reduced);
      }
      if (event.kind === 'shimmer_wave' && event.actor !== undefined) {
        const wave = waves.find(w => w.life <= 0) ?? waves[0], actor = state.party[event.actor];
        wave.mesh.position.set(actor.x, .08, actor.z); wave.life = 1.2; wave.mesh.visible = true;
      }
    },
    update(dt: number, state: GameState, reducedMotion: boolean) {
      reduced = reducedMotion; visualTime += dt; distantIn -= dt;
      if (distantIn <= 0) {
        const angle = Math.random() * Math.PI * 2, x = Math.sin(angle) * 65, z = Math.cos(angle) * 65;
        bolt(new THREE.Vector3(x + 8, 30, z), new THREE.Vector3(x, 7, z), reduced ? .12 : .32, reduced);
        distantIn = 9 + Math.random() * 12;
      }
      bolts.forEach(b => {
        b.life = Math.max(0, b.life - dt); b.line.visible = b.life > 0;
        b.line.material.opacity = b.strength * b.life / b.duration;
      });
      const charging = state.status === 'fighting' && state.storm.charge > 0;
      reach.visible = charge.visible = filaments.visible = charging;
      filaments.position.set(state.boss.x, 0, state.boss.z);
      filaments.rotation.y = reduced ? 0 : visualTime * .7;
      reach.position.set(state.boss.x, .07, state.boss.z);
      charge.position.set(state.boss.x, 1.9, state.boss.z); charge.rotation.x = Math.PI / 2.8;
      charge.rotation.y = reduced ? 0 : visualTime * 2;
      charge.material.opacity = reduced ? .35 : .4 + Math.sin(visualTime * 5) * .1;
      threads.forEach((mesh, index) => {
        const actor = state.party[index]; mesh.visible = actor.hp > 0 && !!actor.mendingThread;
        mesh.position.set(actor.x, .12, actor.z);
        mesh.material.opacity = reduced ? .35 : .3 + Math.sin(visualTime * 2) * .08;
      });
      waves.forEach(w => {
        w.life = Math.max(0, w.life - dt); w.mesh.visible = w.life > 0;
        const size = reduced ? 18 : 1 + (1 - w.life / 1.2) * 17;
        w.mesh.scale.setScalar(size); w.mesh.material.opacity = w.life / 1.2 * .4;
      });
    },
    reset() { bolts.forEach(b => { b.life = 0; b.line.visible = false; }); waves.forEach(w => { w.life = 0; w.mesh.visible = false; }); },
    dispose() {
      group.removeFromParent();
      group.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) { object.geometry.dispose(); object.material.dispose(); } });
    },
  };
}
