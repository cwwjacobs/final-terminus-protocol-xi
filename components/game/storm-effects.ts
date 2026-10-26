import * as THREE from 'three';
import type { GameState } from '../../game/types';
import { STATIC_REACH } from '../../game/static-storm.ts';
import type { CombatEvent } from './world-feedback';
import { offensiveTarget } from '../../game/logos.ts';

/** Bounded visual-only pool. Combat timing and recipients come from the kernel. */
export function createStormEffects(scene: THREE.Scene, quality: 'low' | 'high') {
  const group = new THREE.Group(); group.name = 'storm-effects'; scene.add(group);
  const bolts = Array.from({ length: quality === 'high' ? 10 : 6 }, () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 12 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(24 * 12 * 2);
    for (let i = 0; i < 48; i++) uv.set([0,0, 1,0, 0,1, 1,0, 1,1, 0,1], i * 12);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const material = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 vUv;uniform float uOpacity;void main(){float d=abs(vUv.x-.5)*2.;float core=exp(-d*d*32.);float glow=pow(1.-d,2.)*.3;gl_FragColor=vec4(mix(vec3(.35,.67,1.),vec3(.9,.98,1.),core),(core+glow)*uOpacity);}`,
    });
    const line = new THREE.Mesh(geometry, material); line.name = 'forked-lightning'; line.frustumCulled = false; line.visible = false; group.add(line);
    return { line, life: 0, duration: .6, strength: 1 };
  });
  const points = Array.from({ length: 17 }, () => new THREE.Vector3());
  const branchEnd = new THREE.Vector3(), along = new THREE.Vector3(), side = new THREE.Vector3(), alternate = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let strikeSequence = 0, flash = 0, disposed = false;
  const visualNoise = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
  function bolt(from: THREE.Vector3, to: THREE.Vector3, strength = 1, calm = false) {
    const slot = bolts.find(b => b.life <= 0) ?? bolts[0];
    const a = slot.line.geometry.attributes.position as THREE.BufferAttribute;
    const seed = ++strikeSequence * 31;
    points[0].copy(from); points[16].copy(to);
    for (let i = 1; i < 16; i++) {
      const t = i / 16, p = points[i].copy(from).lerp(to, t), jitter = Math.sin(t * Math.PI) * (strength < .5 ? 2 : .7);
      p.x += (visualNoise(seed + i) - .5) * jitter; p.z += (visualNoise(seed + i * 2) - .5) * jitter;
    }
    let vertex = 0;
    function segment(p: THREE.Vector3, q: THREE.Vector3, width: number) {
      along.copy(q).sub(p).normalize(); side.crossVectors(along, up);
      if (side.lengthSq() < .01) side.set(1, 0, 0); else side.normalize();
      alternate.crossVectors(along, side).normalize();
      for (const normal of [side, alternate]) {
        const x=normal.x*width,y=normal.y*width,z=normal.z*width;
        a.setXYZ(vertex++,p.x-x,p.y-y,p.z-z);a.setXYZ(vertex++,p.x+x,p.y+y,p.z+z);a.setXYZ(vertex++,q.x-x,q.y-y,q.z-z);
        a.setXYZ(vertex++,p.x+x,p.y+y,p.z+z);a.setXYZ(vertex++,q.x+x,q.y+y,q.z+z);a.setXYZ(vertex++,q.x-x,q.y-y,q.z-z);
      }
    }
    const width = strength < .5 ? .11 : .095;
    for (let i = 0; i < 16; i++) segment(points[i], points[i+1], width);
    for (let i = 0; i < 8; i++) {
      const p = points[2+i]; branchEnd.set(p.x+(visualNoise(seed+i*5)-.5)*3,p.y-.7,p.z+(visualNoise(seed+i*7)-.5)*3);
      segment(p,branchEnd,width*.55);
    }
    a.needsUpdate = true; slot.life = slot.duration = calm ? .45 : .42; slot.strength = strength; slot.line.visible = true;
    flash = Math.max(flash, calm ? 0 : strength < .5 ? .4 : .75);
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
      if (disposed) return;
      const bossHeight = state.encounter === 'logos' && state.logos.stage === 'giant' ? 16.8 : 2.8;
      if (event.kind === 'static_strike') bolt(point({ x: state.boss.x - 4, z: state.boss.z - 2 }, 34), point(state.boss, bossHeight), reduced ? .3 : 1, reduced);
      if (event.kind === 'static_arc' && event.actor !== undefined) {
        const from = event.target === undefined ? state.boss : state.party[event.target];
        if (from && state.party[event.actor]) bolt(point(from, event.target === undefined ? bossHeight : 1.6), point(state.party[event.actor]), reduced ? .3 : .9, reduced);
      }
      if (['magic', 'burst', 'weapon'].includes(event.kind) && (event.value ?? 0) > 0 && (event.element === 'lightning' || event.source === 'bolt' || event.source === 'lightningShock')) {
        const actor = state.party[event.actor ?? -1];
        const enemy = event.enemyId ? state.enemies.find(e => e.id === event.enemyId) : undefined;
        const target = enemy ?? (event.enemyId === 'boss' ? state.boss : actor ? offensiveTarget(state, actor) : state.boss);
        const height = target === state.boss ? bossHeight : 'id' in target && target.id.includes('hand') ? 4.2 : 1.8;
        bolt(point({ x: target.x + 1, z: target.z - 1 }, height + 14), point(target, height), reduced ? .3 : .9, reduced);
      }
      if (event.kind === 'shimmer_wave' && event.actor !== undefined) {
        const wave = waves.find(w => w.life <= 0) ?? waves[0], actor = state.party[event.actor];
        wave.mesh.position.set(actor.x, .08, actor.z); wave.life = 1.2; wave.mesh.visible = true;
      }
    },
    update(dt: number, state: GameState, reducedMotion: boolean) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return;
      reduced = reducedMotion; visualTime += dt; distantIn -= dt; flash = Math.max(0, flash - dt * 3);
      if (distantIn <= 0) {
        const angle = visualNoise(strikeSequence + 7) * Math.PI * 2, x = Math.sin(angle) * 65, z = Math.cos(angle) * 65;
        bolt(new THREE.Vector3(x + 8, 30, z), new THREE.Vector3(x, 7, z), reduced ? .12 : .32, reduced);
        distantIn = 9 + visualNoise(strikeSequence + 13) * 12;
      }
      bolts.forEach(b => {
        b.life = Math.max(0, b.life - dt); b.line.visible = b.life > 0;
        b.line.material.uniforms.uOpacity.value = Math.min(b.strength, reduced ? .22 : 1) * b.life / b.duration;
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
    reset() { flash = 0; distantIn = 3; visualTime = 0; bolts.forEach(b => { b.life = 0; b.line.visible = false; }); waves.forEach(w => { w.life = 0; w.mesh.visible = false; }); reach.visible = charge.visible = filaments.visible = false; threads.forEach(t => { t.visible = false; }); },
    get flash() { return reduced ? 0 : flash; },
    stats: () => ({ capacity: bolts.length, active: bolts.filter(b => b.life > 0).length, disposed }),
    dispose() {
      if (disposed) return; disposed = true;
      group.removeFromParent();
      group.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) { object.geometry.dispose(); object.material.dispose(); } });
    },
  };
}
