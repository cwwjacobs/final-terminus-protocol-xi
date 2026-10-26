import * as THREE from 'three';
import type { GameState } from '../../game/types.ts';
import { MAGIC } from '../../game/content.ts';
import { offensiveTarget } from '../../game/logos.ts';
import { presentationElement } from './presentation-cues.ts';
import type { CombatEvent } from './world-feedback.ts';

type HandAnchor = (slot: number, out: THREE.Vector3) => boolean;
type TargetAnchor = (event: CombatEvent, state: GameState, out: THREE.Vector3) => boolean;
/** One procedural quad per accent, replacing part of the old particle budget.
 * No screen-space bloom: a bright core, concentric runes and soft filaments. */
export function createCinematicCombat(scene: THREE.Scene, quality: 'low' | 'high', hand?: HandAnchor, targetAnchor?: TargetAnchor) {
  const root = new THREE.Group(); root.name = 'cinematic-combat'; scene.add(root);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const slots = Array.from({ length: quality === 'high' ? 10 : 6 }, (_, i) => {
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { uProgress: { value: 0 }, uColor: { value: new THREE.Color('#c4c0ff') }, uCast: { value: 0 }, uReduced: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 vUv; uniform float uProgress,uCast,uReduced;uniform vec3 uColor;
void main(){vec2 p=(vUv-.5)*2.;float r=length(p);if(r>1.)discard;
 float t=uReduced>.5?.35:uProgress,a=atan(p.y,p.x);
 float core=exp(-r*r*95.)*(1.-uCast*.6);
 float outer=exp(-abs(r-(.35+t*.48))*75.);
 float inner=exp(-abs(r-.49)*95.)*(.3+.7*pow(abs(cos(a*6.+t)),6.));
 float rune=pow(abs(cos(a*9.+r*5.-t*2.)),24.)*exp(-abs(r-.62)*18.);
 float rays=pow(abs(cos(a*4.+t*.4)),28.)*exp(-r*5.);
 float fade=(1.-uProgress)*(1.-smoothstep(.85,1.,r));
 float energy=core+outer*.34+inner*uCast*.5+rune*.16+rays*.7;
 gl_FragColor=vec4(mix(uColor,vec3(1.),clamp(core,0.,.8))*1.3,clamp(energy*fade,.0,.85));}`,
    });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `cinematic-accent:${i}`; mesh.frustumCulled = false; mesh.visible = false; root.add(mesh);
    return { mesh, age: 0, duration: 0, size: 1, actor: -1, cast: false };
  });
  const seenStarts = new Set<number>(), seenImpacts = new Set<number>();
  const at = new THREE.Vector3(); let disposed = false;
  function once(ids: Set<number>, id: number) {
    if (ids.has(id)) return false; ids.add(id); if (ids.size > 128) ids.delete(ids.values().next().value!); return true;
  }
  function spawn(point: THREE.Vector3, color: string, size: number, duration: number, cast = false, actor = -1) {
    const slot = slots.find(s => s.duration <= 0) ?? slots.reduce((a, b) => a.age / a.duration > b.age / b.duration ? a : b);
    slot.mesh.position.copy(point); slot.mesh.material.uniforms.uColor.value.set(color);
    slot.mesh.material.uniforms.uCast.value = cast ? 1 : 0;
    slot.mesh.material.uniforms.uProgress.value = 0;
    slot.age = 0; slot.duration = Math.max(.1, duration); slot.cast = cast; slot.actor = actor; slot.size = size; slot.mesh.visible = true;
  }
  function target(event: CombatEvent, state: GameState) {
    const actor = state.party[event.actor ?? -1];
    const enemy = event.enemyId ? state.enemies.find(e => e.id === event.enemyId) : undefined;
    const selected = enemy ?? (actor ? offensiveTarget(state, actor) : state.boss);
    at.set(selected.x, 1.7, selected.z); targetAnchor?.(event, state, at); return at;
  }
  function party(state: GameState, index: number) {
    const actor = state.party[index]; at.set(actor?.x ?? 0, 1.35, actor?.z ?? 0); return at;
  }
  return {
    start(event: CombatEvent, state: GameState, delay: number) {
      if (disposed || !(delay > 0) || !once(seenStarts, event.id) || !['magic', 'burst', 'heal'].includes(event.kind)) return;
      const index = event.actor ?? -1; if (!state.party[index] || state.party[index].hp <= 0) return;
      const element = presentationElement(event), color = element ? MAGIC[element].color : '#c4ffe8';
      party(state, index); hand?.(index, at); spawn(at, color, 1.6, delay, true, index);
    },
    impact(event: CombatEvent, state: GameState) {
      if (disposed || event.source === 'rainOfFireBurn' || !once(seenImpacts, event.id)) return;
      const element = presentationElement(event), color = element ? MAGIC[element].color : event.kind === 'heal' ? '#baffdf' : event.kind === 'hit' ? '#ffb08a' : '#e0c1ff';
      if (['weapon', 'magic', 'burst', 'chain'].includes(event.kind) && (event.value ?? 0) > 0) {
        spawn(target(event, state), color, event.kind === 'burst' || event.kind === 'chain' ? 4.4 : event.critical ? 3 : 2, .55);
      } else if (event.kind === 'hit' && (event.value ?? 0) > 0 && event.actor !== undefined) {
        spawn(party(state, event.actor), color, .9, .25);
      } else if (event.kind === 'heal' && !['mendingThread', 'shimmerWave'].includes(event.source ?? '') && (event.value ?? 0) > 0 && event.target !== undefined) {
        spawn(party(state, event.target), color, 2.5, .65);
      } else if (event.kind === 'ability' && event.target === undefined && ['fission', 'fearless', 'rejuvenator', 'thunderclap'].includes(event.source ?? '')) {
        const point = event.source === 'fission' ? target(event, state) : party(state, event.actor ?? 0);
        spawn(point, event.source === 'rejuvenator' ? '#baffdf' : '#e5cfff', 5, .85);
      }
    },
    update(dt: number, state: GameState, camera: THREE.Camera, reduced: boolean) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return;
      for (const slot of slots) {
        if (slot.duration <= 0) continue;
        slot.age += Math.min(dt, .1);
        if (slot.age >= slot.duration || slot.cast && state.party[slot.actor]?.hp <= 0) { slot.duration = 0; slot.mesh.visible = false; continue; }
        const p = slot.age / slot.duration;
        if (slot.cast) { slot.mesh.position.copy(party(state, slot.actor)); hand?.(slot.actor, slot.mesh.position); }
        slot.mesh.quaternion.copy(camera.quaternion);
        slot.mesh.scale.setScalar(slot.size * (reduced ? .8 : slot.cast ? .6 + p * .4 : .7 + p * .7));
        slot.mesh.material.uniforms.uProgress.value = p; slot.mesh.material.uniforms.uReduced.value = reduced ? 1 : 0;
      }
    },
    reset() { slots.forEach(s => { s.duration = 0; s.mesh.visible = false; }); seenStarts.clear(); seenImpacts.clear(); },
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); geometry.dispose(); slots.forEach(s => s.mesh.material.dispose()); },
    stats: () => ({ capacity: slots.length, active: slots.filter(s => s.duration > 0).length, disposed }),
  };
}
