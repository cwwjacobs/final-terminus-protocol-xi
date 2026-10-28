import * as THREE from 'three';
import { ARENA_RADIUS, CONE_HALF_ANGLE, MAGIC, WAR_CRY } from '../../game/content.ts';
import type { Element, GameState } from '../../game/types.ts';
import type { CombatEvent } from './world-feedback.ts';
import { presentationElement, presentationKey } from './presentation-cues.ts';

type Anchor = (slot: number, kind: 'hand' | 'weapon', out: THREE.Vector3) => boolean;
type Shape = 'mask' | 'ring' | 'crystal' | 'cone';
type Motion = 'still' | 'rise' | 'projectile' | 'hand' | 'weapon';
type Mask = typeof ABILITY_EFFECT_MASKS[number];
export const ABILITY_EFFECT_MASKS = [
  'cleave_sweep', 'cleave_trail_strip', 'cleave_contact_star', 'cleave_sparks', 'cleave_contact_core',
  'fire_cast_outer', 'fire_cast_core', 'fire_ember', 'fire_release_flare', 'fire_eruption',
  'shimmer_wave_front', 'shimmer_ripple', 'shimmer_thread', 'shimmer_recipient_glint', 'shimmer_cast_sigil', 'shimmer_ribbon',
  'ice_crystal', 'ice_shatter', 'ice_frost_ring', 'ice_cast_sigil',
  'lightning_bolt', 'lightning_fork', 'lightning_charge_ring', 'lightning_spark',
  'resonance_seal', 'resonance_segments', 'resonance_pulse', 'resonance_star',
  'aegis_ward', 'aegis_fragments', 'aegis_dome', 'aegis_glint',
  'martial_arrow', 'martial_pierce', 'martial_shout', 'martial_dash',
  'enhancement_revelry', 'enhancement_weave', 'enhancement_guard', 'enhancement_thread',
] as const;
const gold = '#ffe0a1', light = '#baffed', enemy = '#ff967f';
const clamp = THREE.MathUtils.clamp;
const noise = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

/** Limits cover transient meshes and bolts; persistent state cues have five
 * fixed party slots and a fixed boss/chain group, independent of event volume. */
export function abilityEffectLimits(quality: 'low' | 'high') {
  return quality === 'high' ? { particles: 72, bolts: 8, shards: 7 } : { particles: 34, bolts: 4, shards: 4 };
}

/** Storm owns its lightning and large healing wave. This layer enriches the
 * same confirmed heal recipients and supplies the rest of the ability kit. */
export function handlesAbilityEffect(event: CombatEvent): boolean {
  const key = presentationKey(event);
  return key !== null && key !== 'staticStrike' && key !== 'staticDischarge';
}

interface Particle {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  age: number; duration: number; delay: number; startSize: number; endSize: number;
  shape: Shape; motion: Motion; actor: number; spin: number; angle: number;
  opacity: number; stretch: number; seed: number;
  ground: boolean;
  from: THREE.Vector3; to: THREE.Vector3; velocity: THREE.Vector3;
}
interface ParticleOptions {
  mask?: Mask; shape?: Shape; motion?: Motion; actor?: number; color?: string;
  size?: number; end?: number; duration?: number; delay?: number; opacity?: number;
  spin?: number; angle?: number; stretch?: number; seed?: number;
  ground?: boolean;
  to?: THREE.Vector3; velocity?: THREE.Vector3;
}

/** A presentation-only renderer: it never writes GameState, samples combat RNG,
 * grants local buffs, or turns an illustrative fire effect into a burn status. */
export function createAbilityEffects(scene: THREE.Scene, quality: 'low' | 'high', anchor?: Anchor) {
  const limits = abilityEffectLimits(quality);
  const root = new THREE.Group(); root.name = 'ability-effects'; scene.add(root);
  const plane = new THREE.PlaneGeometry(1, 1);
  const ring = new THREE.RingGeometry(.88, 1, quality === 'high' ? 64 : 32);
  const crystal = new THREE.OctahedronGeometry(.5, 0);
  const conePoints: number[] = [];
  for (let i = 0; i < 24; i++) {
    const a = -CONE_HALF_ANGLE + i / 24 * CONE_HALF_ANGLE * 2, b = a + CONE_HALF_ANGLE * 2 / 24;
    conePoints.push(0, 0, 0, Math.sin(a), 0, Math.cos(a), Math.sin(b), 0, Math.cos(b));
  }
  const cone = new THREE.BufferGeometry(); cone.setAttribute('position', new THREE.Float32BufferAttribute(conePoints, 3));
  const ownedMaterials: THREE.Material[] = [];
  const textures = new Map<Mask, THREE.Texture>();
  const disposedTextures = new WeakSet<THREE.Texture>();
  let disposed = false, reduced = false, time = 0;
  const disposeTexture = (texture: THREE.Texture) => {
    if (disposedTextures.has(texture)) return;
    disposedTextures.add(texture); texture.dispose();
  };
  // A small soft mask keeps missing art graceful and permits non-DOM geometry
  // checks. No document/window is touched at module import or in Node tests.
  const pixels = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4, r = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5);
    pixels[i] = pixels[i + 1] = pixels[i + 2] = 255; pixels[i + 3] = Math.round(Math.max(0, 1 - r) ** 2 * 255);
  }
  const fallback = new THREE.DataTexture(pixels, 32, 32); fallback.needsUpdate = true;
  const loader = typeof document === 'undefined' ? null : new THREE.TextureLoader();
  function texture(mask: Mask): THREE.Texture {
    const cached = textures.get(mask); if (cached) return cached;
    if (!loader) { textures.set(mask, fallback); return fallback; }
    const requested = loader.load(`/assets/vfx/${mask}.png`, loaded => {
      if (disposed) disposeTexture(loaded);
    }, undefined, () => {
      if (disposed) return;
      textures.set(mask, fallback);
      // Existing meshes using the failed request are also switched. The
      // geometric fallback remains bounded and uses the same lifetime rules.
      for (const material of ownedMaterials) if (material instanceof THREE.MeshBasicMaterial && material.map === requested) {
        material.map = fallback; material.needsUpdate = true;
      }
      disposeTexture(requested);
    });
    requested.colorSpace = THREE.SRGBColorSpace;
    // Billboard masks do not need a complete mip pyramid. Cache on first use,
    // keeping the initial arena load and GPU budget modest on mobile.
    requested.generateMipmaps = false; requested.minFilter = THREE.LinearFilter;
    textures.set(mask, requested); return requested;
  }
  function material(color: string, opacity = 1) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide,
      depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false });
    ownedMaterials.push(m); return m;
  }
  function mesh(geometry: THREE.BufferGeometry, color = light) {
    const m = new THREE.Mesh(geometry, material(color)); m.visible = false; m.frustumCulled = false;
    root.add(m); return m;
  }
  const particles: Particle[] = Array.from({ length: limits.particles }, () => ({
    mesh: mesh(plane), age: 0, duration: 0, delay: 0, startSize: 1, endSize: 1,
    shape: 'mask', motion: 'still', actor: -1, spin: 0, angle: 0, opacity: 1, stretch: 1, seed: 0, ground: false,
    from: new THREE.Vector3(), to: new THREE.Vector3(), velocity: new THREE.Vector3(),
  }));
  particles.forEach((p, i) => { p.mesh.name = `vfx-particle:${i}`; });
  const bolts = Array.from({ length: limits.bolts }, () => {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(120), 3));
    const mat = new THREE.LineBasicMaterial({ color: '#cbb1ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    ownedMaterials.push(mat);
    const line = new THREE.LineSegments(geometry, mat); line.visible = false; line.frustumCulled = false; root.add(line);
    return { line, age: 0, duration: 0 };
  });
  const partyCues = Array.from({ length: 5 }, () => ({
    guard: mesh(plane, '#91caff'), warCry: mesh(ring, '#ffce82'), revelry: mesh(plane, gold), aegis: mesh(plane, light),
    weave: [mesh(crystal, MAGIC.fire.color), mesh(crystal, MAGIC.ice.color), mesh(crystal, MAGIC.lightning.color)],
  }));
  for (const [i, cue] of partyCues.entries()) {
    cue.warCry.name = `vfx-warCry:${i}`;
    cue.guard.name = `vfx-guard:${i}`; cue.revelry.name = `vfx-revelry:${i}`; cue.aegis.name = `vfx-aegis:${i}`;
    cue.weave.forEach((g, n) => { g.name = `vfx-weave:${i}:${n}`; });
    cue.guard.material.map = texture('enhancement_guard');
    cue.revelry.material.map = texture('enhancement_revelry');
    cue.aegis.material.map = texture('aegis_ward');
  }
  const chainSeal = mesh(plane), chainOrbit = mesh(ring), bossCharge = mesh(plane, enemy);
  chainSeal.name = 'vfx-chain-seal'; chainOrbit.name = 'vfx-chain-orbit'; bossCharge.name = 'vfx-boss-charge';
  chainSeal.material.map = texture('resonance_seal');
  bossCharge.material.map = texture('resonance_star');
  const threads = Array.from({ length: 5 }, () => {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48), 3));
    const mat = new THREE.LineBasicMaterial({ color: '#b0ffea', transparent: true, opacity: .35, depthWrite: false, blending: THREE.AdditiveBlending });
    ownedMaterials.push(mat); const line = new THREE.Line(geometry, mat); line.visible = false; line.frustumCulled = false; root.add(line); return line;
  });
  const scratch = new THREE.Vector3(), projectedA = new THREE.Vector3(), projectedB = new THREE.Vector3();
  const starts = new Set<number>(), impacts = new Set<number>();
  function once(set: Set<number>, id: number) {
    if (set.has(id)) return false;
    set.add(id); if (set.size > 128) set.delete(set.values().next().value!); return true;
  }
  const actorPoint = (state: GameState, actor: number, height = 1.35) => {
    const a = state.party[actor]; return new THREE.Vector3(a?.x ?? 0, height, a?.z ?? 0);
  };
  const bossPoint = (state: GameState, height = 1.5) => new THREE.Vector3(state.boss.x, height, state.boss.z);
  function handPoint(state: GameState, actor: number) {
    const p = actorPoint(state, actor); anchor?.(actor, 'hand', p); return p;
  }
  function spawn(at: THREE.Vector3, options: ParticleOptions = {}) {
    const p = particles.find(p => p.duration <= 0) ?? particles.reduce((a, b) => a.age / a.duration > b.age / b.duration ? a : b);
    p.shape = options.shape ?? 'mask'; p.motion = options.motion ?? 'still';
    p.mesh.geometry = p.shape === 'ring' ? ring : p.shape === 'crystal' ? crystal : p.shape === 'cone' ? cone : plane;
    const nextMap = p.shape === 'mask' ? texture(options.mask ?? 'cleave_contact_core') : null;
    // Map-to-map swaps reuse the same shader program. Only a feature change
    // needs recompilation; ordinary particle spawns change uniforms alone.
    const mapFeatureChanged = !!p.mesh.material.map !== !!nextMap;
    p.mesh.material.map = nextMap;
    p.mesh.material.color.set(options.color ?? gold);
    if (mapFeatureChanged) p.mesh.material.needsUpdate = true;
    p.age = 0; p.duration = Math.max(.05, options.duration ?? .5); p.delay = Math.max(0, options.delay ?? 0);
    p.startSize = options.size ?? 1; p.endSize = options.end ?? p.startSize * 1.4;
    p.opacity = options.opacity ?? .8; p.spin = options.spin ?? 0; p.angle = options.angle ?? 0;
    p.stretch = options.stretch ?? 1; p.actor = options.actor ?? -1; p.seed = options.seed ?? 0; p.ground = options.ground ?? false;
    p.from.copy(at); p.to.copy(options.to ?? at); p.velocity.copy(options.velocity ?? scratch.set(0, 0, 0));
    p.mesh.position.copy(at); p.mesh.scale.setScalar(0); p.mesh.visible = false;
    return p;
  }
  function ground(at: THREE.Vector3, color: string, radius: number, duration = .7, opacity = .65) {
    const pos = at.clone(); pos.y = .095;
    return spawn(pos, { shape: 'ring', color, size: radius * .2, end: radius, duration, opacity });
  }
  function burst(at: THREE.Vector3, color: string, id: number, count = limits.shards, icy = false) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count + noise(id + i) * .12) * Math.PI * 2;
      spawn(at, { shape: icy ? 'crystal' : 'mask', mask: icy ? undefined : 'cleave_contact_core', color,
        size: icy ? .32 : .22, end: icy ? .08 : .04, duration: .5 + noise(id + i * 7) * .4,
        motion: 'rise', stretch: icy ? 2.7 : 1, seed: id + i, spin: icy ? 2 : 0,
        velocity: new THREE.Vector3(Math.sin(angle) * 3.3, 1.2 + noise(id + i * 2) * 3, Math.cos(angle) * 3.3), opacity: .7 });
    }
  }
  function bolt(from: THREE.Vector3, to: THREE.Vector3, color: string, seed: number) {
    const b = bolts.find(b => b.duration <= 0) ?? bolts.reduce((a, b) => a.age > b.age ? a : b);
    const positions = b.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    let v = 0;
    for (let i = 0; i < 16; i++) {
      for (const j of [i, i + 1]) {
        const t = j / 16, jitter = Math.sin(t * Math.PI) * .6;
        scratch.copy(from).lerp(to, t); scratch.x += (noise(seed + j) - .5) * jitter; scratch.z += (noise(seed + j * 2) - .5) * jitter;
        positions.setXYZ(v++, scratch.x, scratch.y, scratch.z);
      }
    }
    for (let i = 0; i < 4; i++) {
      const t = .25 + i * .15; scratch.copy(from).lerp(to, t);
      positions.setXYZ(v++, scratch.x, scratch.y, scratch.z);
      positions.setXYZ(v++, scratch.x + (noise(seed + i * 5) - .5) * 2, scratch.y - .8, scratch.z + (noise(seed + i * 9) - .5) * 2);
    }
    positions.needsUpdate = true; b.line.material.color.set(color); b.age = 0; b.duration = reduced ? .4 : .28; b.line.visible = true;
  }
  function elementImpact(element: Element, state: GameState, event: CombatEvent, scale = 1) {
    const at = bossPoint(state), color = MAGIC[element].color;
    if (element === 'fire') {
      spawn(at, { mask: 'fire_eruption', color, size: 2.7 * scale, end: 3.9 * scale, duration: .75, opacity: .65 });
      ground(at, color, 2.8 * scale, .65, .4);
      for (let i = 0; i < limits.shards; i++) spawn(at, { mask: 'fire_ember', color, size: .33, end: .08,
        duration: .7 + noise(event.id + i) * .5, motion: 'rise', velocity: new THREE.Vector3((noise(event.id + i * 3) - .5) * 3, 2 + noise(event.id + i * 7) * 3, (noise(event.id + i * 5) - .5) * 3), opacity: .7 });
    } else if (element === 'ice') {
      for (let i = 0; i < limits.shards; i++) {
        const a = i / limits.shards * Math.PI * 2, pos = at.clone(); pos.y = .4; pos.x += Math.sin(a) * 1.2; pos.z += Math.cos(a) * 1.2;
        spawn(pos, { shape: 'crystal', color, size: .25 * scale, end: .85 * scale, stretch: 3.2, duration: .7, angle: a, spin: .3, opacity: .65 });
      }
      const floor = at.clone(); floor.y = .1;
      spawn(floor, { mask: 'ice_frost_ring', ground: true, color, size: .8, end: 5 * scale, duration: .9, opacity: .5 });
      spawn(at, { mask: 'ice_crystal', color, size: 1.7 * scale, end: 2.2 * scale, duration: .55, opacity: .5 });
      spawn(at, { mask: 'ice_shatter', color, size: 1, end: 3.5 * scale, duration: .6, opacity: .7 }); burst(at, color, event.id, limits.shards, true);
    } else {
      const from = at.clone(); from.y = 8;
      bolt(from, at, color, event.id);
      const strike = at.clone(); strike.y = 3.8;
      spawn(strike, { mask: 'lightning_bolt', color, size: 2.4 * scale, end: 2.7 * scale, stretch: 2.4, duration: .28, opacity: .5 });
      spawn(at, { mask: 'lightning_spark', color, size: 2.6 * scale, end: 3.3 * scale, duration: .35, opacity: .65 });
      spawn(at, { mask: 'lightning_fork', color, size: 2.5, end: 3.6, duration: .3, opacity: .5 });
      ground(at, color, 2.3 * scale, .45, .55);
    }
    if (event.kind === 'burst') {
      ground(at, color, 4.2, .9, .7); spawn(at, { mask: 'resonance_star', color, size: 4, end: 5, duration: .65, spin: -.6, opacity: .5 });
    }
  }
  function start(event: CombatEvent, state: GameState, delay: number) {
    if (disposed || !handlesAbilityEffect(event) || !once(starts, event.id)) return;
    const key = presentationKey(event), index = event.actor ?? -1, actor = state.party[index];
    if (!actor || actor.hp <= 0 || !Number.isFinite(delay) || delay <= 0) return;
    const element = presentationElement(event), color = element ? MAGIC[element].color : gold;
    const hand = handPoint(state, index), target = bossPoint(state);
    if (key === 'fire' || key === 'ice' || key === 'lightning') {
      spawn(hand, { mask: key === 'ice' ? 'ice_cast_sigil' : key === 'lightning' ? 'lightning_charge_ring' : 'fire_cast_outer', color, size: .5, end: 1.25, duration: delay, motion: 'hand', actor: index, spin: 2, opacity: .65 });
      spawn(hand, { mask: 'fire_cast_core', color, size: .18, end: .65, duration: delay, motion: 'hand', actor: index, spin: -3, opacity: .8 });
    } else if (actor.role === 'hunter' || key === 'elementalShot' || actor.role === 'arcanist' || actor.role === 'luminary') {
      spawn(hand, { mask: actor.role === 'hunter' ? 'martial_arrow' : actor.role === 'luminary' ? 'shimmer_ribbon' : 'fire_release_flare', color: actor.role === 'luminary' ? light : color,
        size: .7, end: .4, duration: delay, motion: 'projectile', to: target, opacity: .8 });
    } else if (key === 'cleave' || key === 'pierce' || key === 'resonance' || key === 'auto') {
      const weapon = hand.clone(); anchor?.(index, 'weapon', weapon);
      spawn(weapon, { mask: key === 'pierce' ? 'martial_pierce' : key === 'resonance' ? 'resonance_pulse' : 'cleave_sweep', color,
        size: key === 'auto' ? .7 : 1.5, end: key === 'auto' ? 1 : 2.4, delay: delay * .45, duration: delay * .55 + .12,
        motion: 'weapon', actor: index, opacity: key === 'auto' ? .35 : .62, spin: key === 'resonance' ? 1.5 : -.6 });
    }
  }
  function impact(event: CombatEvent, state: GameState): boolean {
    if (disposed || !handlesAbilityEffect(event)) return false;
    if (!once(impacts, event.id)) return true;
    const key = presentationKey(event), index = event.actor ?? -1, actor = state.party[index];
    const at = actorPoint(state, index), target = bossPoint(state), element = presentationElement(event);
    const color = element ? MAGIC[element].color : gold;
    switch (key) {
      case 'auto':
        spawn(target, { mask: 'cleave_contact_core', color: actor?.role === 'luminary' ? light : gold, size: .65, end: .95, duration: .22, opacity: .55 }); break;
      case 'cleave':
        spawn(target, { mask: 'cleave_sweep', color, size: 2.2, end: 3.1, duration: .42, spin: -1.1 });
        spawn(target, { mask: 'cleave_contact_star', color, size: 1.5, end: 2.1, duration: .24 });
        ground(target, color, 2.6, .5, .4); burst(target, color, event.id); break;
      case 'pierce':
        spawn(target, { mask: 'martial_pierce', color: '#bceaff', size: 3.2, end: 4, duration: .35, opacity: .75 });
        spawn(target, { mask: 'cleave_contact_core', color: '#eaffff', size: 1.3, end: 1.8, duration: .3 }); burst(target, '#bceaff', event.id, limits.shards); break;
      case 'resonance':
        ground(target, '#cbb1ff', 3.8, .85); spawn(target, { mask: 'resonance_pulse', color: '#cbb1ff', size: 2, end: 4, duration: .7, spin: -1.2 });
        spawn(target, { mask: 'cleave_contact_core', color: '#e4d8ff', size: 1.2, end: 2.3, duration: .4 }); break;
      case 'fire': case 'ice': case 'lightning': elementImpact(key, state, event); break;
      case 'elementalShot':
        elementImpact(element ?? actor?.shotElement ?? 'fire', state, event, .7); break;
      case 'criticalDash':
        if (event.kind === 'ability') { ground(at, gold, 1.6, .5, .4); break; }
        spawn(at, { mask: 'martial_dash', color: gold, size: 1.8, end: 2.5, duration: .25, spin: (event.hitIndex ?? 0) % 2 ? -.2 : .2 });
        spawn(target, { mask: 'cleave_contact_star', color: '#fff6a7', size: 1.6, end: 2.2, duration: .25 }); burst(target, gold, event.id, limits.shards); break;
      case 'splitVolley':
        if (event.kind === 'ability') { spawn(at, { mask: 'fire_cast_outer', color: '#8fffd4', size: 1, end: 1.5, duration: .4, opacity: .35 }); break; }
        if (actor) {
          const from = handPoint(state, index); bolt(from, target, '#a6ffe0', event.id);
          spawn(from, { mask: 'martial_arrow', color: '#a6ffe0', motion: 'projectile', to: target, duration: .12, size: .8, end: .5, opacity: .6 });
        }
        spawn(target, { mask: 'cleave_contact_core', color: '#a6ffe0', size: .8, end: 1.4, duration: .23 }); break;
      case 'heal': case 'shimmerWave': case 'mendingThread': {
        if (event.kind === 'shimmer_wave') { spawn(at, { mask: 'shimmer_cast_sigil', color: light, size: 1.7, end: 2.6, duration: .7, opacity: .65 }); break; }
        if (typeof event.target !== 'number' || !state.party[event.target]) break;
        const recipient = actorPoint(state, event.target);
        if (event.kind === 'ability' && key === 'mendingThread') {
          spawn(recipient, { mask: 'enhancement_thread', color: light, size: 1.5, end: 2.3, duration: .8, opacity: .7 });
        } else if (event.kind === 'heal' && (event.value ?? 0) > 0) {
          spawn(recipient, { mask: 'shimmer_recipient_glint', color: light, size: key === 'mendingThread' ? .9 : 1.5, end: 2, duration: .7, motion: 'rise', velocity: new THREE.Vector3(0, .5, 0), opacity: .65 });
          if (key === 'heal') ground(recipient, light, 1.25, .7, .35);
        }
        break;
      }
      case 'aegis': {
        const recipient = typeof event.target === 'number' ? event.target : index;
        if (!state.party[recipient]) break;
        spawn(actorPoint(state, recipient), { mask: 'aegis_dome', color: light, size: .5, end: 2.4, duration: .65 }); break;
      }
      case 'shieldBreak': {
        const recipient = typeof event.target === 'number' ? event.target : index;
        if (!state.party[recipient]) break;
        const pos = actorPoint(state, recipient); burst(pos, light, event.id, limits.shards, true);
        spawn(pos, { mask: 'aegis_glint', color: '#effff8', size: 1.3, end: 2.3, duration: .3 });
        spawn(pos, { mask: 'aegis_fragments', color: light, size: 1.5, end: 3.5, duration: .65, opacity: .6 }); break;
      }
      case 'rapidWeave':
        ground(at, '#d8abff', 2, .75); spawn(at, { mask: 'enhancement_weave', color: '#d8abff', size: 1.5, end: 2.8, duration: .7, spin: 1.5 }); break;
      case 'revelry':
        ground(at, gold, 4, .8, .45);
        state.party.forEach((p, i) => { if (p.hp > 0) spawn(actorPoint(state, i), { mask: 'cleave_contact_core', color: gold, size: .8, end: 1.5, duration: .7, motion: 'rise', velocity: new THREE.Vector3(0, 1, 0), opacity: .6 }); }); break;
      case 'warCry':
        if (event.kind !== 'ability') break;
        ground(at, '#ffce82', WAR_CRY.radius, .65, .48);
        ground(at, '#b8dcff', WAR_CRY.radius, .9, .28);
        spawn(at, { mask: 'martial_shout', color: '#ffe0a1', size: 2.5, end: 4.5, duration: .65, opacity: .7 }); break;
      case 'provoke':
        for (let i = 0; i < 3; i++) ground(at, '#9acbff', 2 + i * 1.1, .7 + i * .12, .5 - i * .08);
        spawn(at, { mask: 'martial_shout', color: '#b8dcff', size: 2, end: 4, duration: .65, opacity: .6 }); break;
      case 'guard': ground(at, '#91caff', 1.5, .5); break;
      case 'dodge': spawn(at, { mask: 'martial_dash', color: '#d8eaff', size: 1.7, end: 2.5, duration: .3, opacity: .35 }); break;
      case 'hit': spawn(at, { mask: 'cleave_contact_star', color: enemy, size: .8, end: 1.1, duration: .2, opacity: .5 }); break;
      case 'down': ground(at, '#aaa5bc', 1.4, .8, .35); break;
      case 'buffLost': burst(at, gold, event.id, 3); break;
      case 'chain':
        ground(target, color, 4, .8, .6); spawn(target, { mask: 'resonance_segments', color, size: 4.5, end: 2.8, duration: .75, spin: 1, opacity: .75 });
        spawn(target, { mask: 'cleave_contact_star', color, size: 1, end: 3.2, duration: .6, opacity: .55 }); break;
      case 'bossCast': break; // The live cast state, not a stale event, owns charge.
      case 'bossImpact': {
        const area = event.area;
        const center = area ? new THREE.Vector3(area.kind === 'raid' ? 0 : area.x, 1.2, area.kind === 'raid' ? 0 : area.z) : target;
        if (area?.target !== undefined && state.party[area.target]) center.copy(actorPoint(state, area.target));
        const radius = area?.kind === 'raid' ? ARENA_RADIUS : Math.max(1, area?.radius ?? 5);
        if (area?.kind === 'cone') {
          const floor = center.clone(); floor.y = .105;
          spawn(floor, { shape: 'cone', color: enemy, size: radius, end: radius, angle: area.angle, duration: .6, opacity: .16 });
        } else ground(center, enemy, radius, .8, .55);
        spawn(center, { mask: area?.kind === 'cone' ? 'cleave_sweep' : 'fire_cast_core', color: enemy, size: 2.5, end: 5, duration: .6, opacity: .5 });
        burst(center, enemy, event.id, limits.shards, true); break;
      }
    }
    return true;
  }
  function update(dt: number, state: GameState, camera: THREE.Camera, reducedMotion: boolean) {
    if (disposed || !Number.isFinite(dt) || dt <= 0) return;
    const delta = Math.min(dt, .25); time += delta; reduced = reducedMotion;
    for (const p of particles) {
      if (p.duration <= 0) continue;
      p.age += delta;
      const t = p.age - p.delay;
      if (t < 0) { p.mesh.visible = false; continue; }
      if (t >= p.duration) { p.duration = 0; p.mesh.visible = false; continue; }
      const progress = clamp(t / p.duration, 0, 1), eased = 1 - (1 - progress) ** 2;
      p.mesh.visible = true; p.mesh.position.copy(p.from);
      if ((p.motion === 'hand' || p.motion === 'weapon') && state.party[p.actor]?.hp > 0) {
        if (!anchor?.(p.actor, p.motion, p.mesh.position)) {
          const actor = state.party[p.actor]; p.mesh.position.set(actor.x, 1.35, actor.z);
        }
      } else if (p.motion === 'hand' || p.motion === 'weapon') { p.duration = 0; p.mesh.visible = false; continue; }
      if (p.motion === 'projectile') p.mesh.position.lerp(p.to, reduced ? 1 : eased);
      if (p.motion === 'rise' && !reduced) p.mesh.position.addScaledVector(p.velocity, t).setY(p.mesh.position.y - .7 * t * t);
      const size = reduced ? p.endSize : THREE.MathUtils.lerp(p.startSize, p.endSize, eased);
      p.mesh.scale.set(size, size * p.stretch, size);
      if (p.shape === 'cone') p.mesh.rotation.set(0, p.angle, 0);
      else if (p.shape === 'ring' || p.ground) p.mesh.rotation.set(-Math.PI / 2, 0, p.angle + (reduced ? 0 : p.spin * progress));
      else if (p.shape === 'crystal') p.mesh.rotation.set(.12, p.angle + (reduced ? 0 : time * p.spin), .15 * Math.sin(p.seed));
      else {
        p.mesh.quaternion.copy(camera.quaternion);
        let angle = p.angle;
        if (p.motion === 'projectile') {
          projectedA.copy(p.from).project(camera); projectedB.copy(p.to).project(camera);
          angle += Math.atan2(projectedB.y - projectedA.y, projectedB.x - projectedA.x);
        }
        p.mesh.rotateZ(angle + (reduced ? 0 : p.spin * progress));
      }
      const fade = (1 - progress) * Math.min(1, t * 25 + .25);
      p.mesh.material.opacity = p.opacity * fade * (reduced ? .65 : 1);
    }
    for (const b of bolts) {
      if (b.duration <= 0) continue;
      b.age += delta; b.line.visible = b.age < b.duration;
      b.line.material.opacity = Math.max(0, 1 - b.age / b.duration) * (reduced ? .35 : .8);
      if (!b.line.visible) b.duration = 0;
    }
    partyCues.forEach((cue, i) => {
      const actor = state.party[i], alive = !!actor && actor.hp > 0 && state.status === 'fighting';
      cue.warCry.visible = alive && actor.warCryRemaining > 0;
      cue.warCry.position.set(actor?.x ?? 0, .12, actor?.z ?? 0); cue.warCry.rotation.set(-Math.PI / 2, 0, 0);
      cue.warCry.scale.setScalar(reduced ? 1.55 : 1.55 + Math.sin(time * 4) * .08); cue.warCry.material.opacity = .4;
      cue.guard.visible = alive && actor.guardUntil > state.time;
      cue.guard.position.set(actor?.x ?? 0, 1.05, actor?.z ?? 0); cue.guard.quaternion.copy(camera.quaternion); cue.guard.scale.setScalar(1.05); cue.guard.material.opacity = .32;
      cue.revelry.visible = alive && actor.revelryStacks > 0;
      cue.revelry.position.set(actor?.x ?? 0, .10, actor?.z ?? 0); cue.revelry.rotation.set(-Math.PI / 2, 0, reduced ? 0 : time * .22);
      cue.revelry.scale.setScalar(1.3); cue.revelry.material.opacity = .12 + (actor?.revelryStacks ?? 0) * .025;
      cue.aegis.visible = alive && actor.shieldCharges > 0;
      cue.aegis.position.set(actor?.x ?? 0, 2.25, actor?.z ?? 0); cue.aegis.quaternion.copy(camera.quaternion);
      cue.aegis.scale.setScalar(.6); cue.aegis.material.opacity = .42;
      cue.weave.forEach((gem, n) => {
        const element = (['fire', 'ice', 'lightning'] as const)[n];
        gem.visible = alive && !!actor.rapidWeave && actor.rapidWeave.remaining > 0 && actor.rapidWeave.charges[element] > 0;
        const a = n / 3 * Math.PI * 2 + (reduced ? 0 : time * 1.5);
        gem.position.set((actor?.x ?? 0) + Math.cos(a) * .65, 1.7 + Math.sin(a) * .2, (actor?.z ?? 0) + Math.sin(a) * .65);
        gem.scale.setScalar(.2); gem.material.opacity = .7;
      });
      const thread = threads[i], source = actor?.mendingThread?.source, caster = source === undefined ? null : state.party[source];
      thread.visible = alive && !!actor.mendingThread && actor.mendingThread.remaining > 0 && !!caster && caster.hp > 0;
      if (thread.visible && caster) {
        const positions = thread.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let n = 0; n < 16; n++) {
          const t = n / 15, ripple = reduced ? 0 : Math.sin(t * Math.PI * 4 - time * 2) * .08;
          positions.setXYZ(n, caster.x + (actor.x - caster.x) * t, .8 + Math.sin(t * Math.PI) * .5 + ripple, caster.z + (actor.z - caster.z) * t);
        }
        positions.needsUpdate = true;
      }
    });
    const chain = state.chain, open = state.burst, chainActive = state.status === 'fighting' && state.boss.hp > 0 && (!!chain || !!open);
    chainSeal.visible = chainOrbit.visible = chainActive;
    const chainElement: Element = open?.element ?? (chain?.weapon === 'cleave' ? 'fire' : chain?.weapon === 'pierce' ? 'ice' : 'lightning');
    chainSeal.material.color.set(MAGIC[chainElement].color); chainOrbit.material.color.copy(chainSeal.material.color);
    chainSeal.position.set(state.boss.x, 2.7, state.boss.z); chainSeal.quaternion.copy(camera.quaternion); chainSeal.rotateZ(reduced ? 0 : time * (open ? -.5 : .3));
    chainSeal.scale.setScalar(open ? 2.8 : 1.65); chainSeal.material.opacity = open ? .5 : .28;
    chainOrbit.position.set(state.boss.x, .13, state.boss.z); chainOrbit.rotation.x = -Math.PI / 2; chainOrbit.scale.setScalar(open ? 3.1 : 2.7); chainOrbit.material.opacity = .2;
    bossCharge.visible = state.status === 'fighting' && state.boss.hp > 0 && !!state.boss.cast;
    if (state.boss.cast) {
      const progress = 1 - clamp(state.boss.cast.remaining / Math.max(.01, state.boss.cast.total), 0, 1);
      bossCharge.position.set(state.boss.x, 3.5, state.boss.z); bossCharge.quaternion.copy(camera.quaternion); bossCharge.rotateZ(reduced ? 0 : time * .7);
      bossCharge.scale.setScalar(1 + progress * 1.4); bossCharge.material.opacity = .2 + progress * .25;
    }
  }
  function reset() {
    particles.forEach(p => { p.duration = 0; p.mesh.visible = false; }); bolts.forEach(b => { b.duration = 0; b.line.visible = false; });
    partyCues.forEach(cue => { cue.guard.visible = cue.warCry.visible = cue.revelry.visible = cue.aegis.visible = false; cue.weave.forEach(g => { g.visible = false; }); });
    threads.forEach(t => { t.visible = false; }); chainSeal.visible = chainOrbit.visible = bossCharge.visible = false;
    starts.clear(); impacts.clear(); time = 0;
  }
  function dispose() {
    if (disposed) return; disposed = true; reset(); root.removeFromParent();
    plane.dispose(); ring.dispose(); crystal.dispose(); cone.dispose(); bolts.forEach(b => b.line.geometry.dispose()); threads.forEach(t => t.geometry.dispose());
    ownedMaterials.forEach(m => m.dispose()); textures.forEach(disposeTexture); disposeTexture(fallback); textures.clear();
  }
  return { start, impact, update, reset, dispose,
    stats: () => ({ capacity: particles.length, active: particles.filter(p => p.duration > 0).length,
      boltCapacity: bolts.length, activeBolts: bolts.filter(b => b.duration > 0).length, textures: textures.size, disposed }),
  };
}
