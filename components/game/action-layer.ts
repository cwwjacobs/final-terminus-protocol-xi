import * as THREE from 'three';
import type { Role } from '../../game/types.ts';
import { actionKey, clipFor, LOCOMOTION, RUN_SPEED, UPPER_BODY_BONES, type ActionClip, type ActionKey } from './role-animation.ts';

/** Shared library clips plus the hero's own idle/walk, blended on one mixer.
 *
 * Locomotion is split into lower-body and upper-body halves so a one-shot
 * action can take the upper body (attacks, casts) or the whole body (hit,
 * dodge, death) with exact crossfades: on every bone the active weights sum
 * to one, so the mixer's normalized blend never halves a swing against idle.
 * Nothing here writes world position or facing; the kernel owns those. */

export interface ActionLayerOptions {
  /** Bones this layer must never write (another layer owns them, e.g. the Bacchus polearm pose). */
  reserved?: readonly string[];
}

const boneOf = (track: THREE.KeyframeTrack) => track.name.split('.')[0];
const UPPER = new Set<string>(UPPER_BODY_BONES);

function filterClip(clip: THREE.AnimationClip, keep: (bone: string) => boolean, suffix: string) {
  const tracks = clip.tracks.filter(track => keep(boneOf(track)));
  return tracks.length ? new THREE.AnimationClip(`${clip.name}${suffix}`, clip.duration, tracks) : null;
}

interface Loco { lower?: THREE.AnimationAction; upper?: THREE.AnimationAction }

export class ActionLayer {
  private readonly mixer: THREE.AnimationMixer;
  private readonly role: Role;
  private readonly library: ReadonlyMap<string, THREE.AnimationClip>;
  private readonly reserved: Set<string>;
  private readonly idle: Loco; private readonly walk: Loco; private readonly run: Loco;
  private readonly prepared = new Map<string, { action: THREE.AnimationAction; spec: ActionClip } | null>();
  private current: { key: ActionKey; action: THREE.AnimationAction; spec: ActionClip; elapsed: number; duration: number } | null = null;
  private actionWeight = 0;
  private moveWeight = 0;
  private runWeight = 0;
  private disposed = false;

  constructor(mixer: THREE.AnimationMixer, role: Role, hero: readonly THREE.AnimationClip[],
    library: ReadonlyMap<string, THREE.AnimationClip>, options: ActionLayerOptions = {}) {
    this.mixer = mixer; this.role = role; this.library = library; this.reserved = new Set(options.reserved ?? []);
    const allowed = (bone: string) => !this.reserved.has(bone);
    const split = (clip: THREE.AnimationClip | undefined): Loco => {
      if (!clip) return {};
      const lower = filterClip(clip, bone => allowed(bone) && !UPPER.has(bone), ':lower');
      const upper = filterClip(clip, bone => allowed(bone) && UPPER.has(bone), ':upper');
      return { lower: lower ? mixer.clipAction(lower) : undefined, upper: upper ? mixer.clipAction(upper) : undefined };
    };
    const find = (name: string) => hero.find(clip => clip.name.toLowerCase() === name) ?? library.get(name);
    this.idle = split(find('idle')); this.walk = split(find('walk')); this.run = split(library.get(LOCOMOTION.run));
    for (const loco of [this.idle, this.walk, this.run]) for (const action of [loco.lower, loco.upper]) action?.setEffectiveWeight(0).play();
    this.applyWeights();
  }

  /** True when the library supplied at least one clip this role uses. */
  get hasLibrary(): boolean {
    return this.library.size > 0;
  }

  private prepare(key: ActionKey) {
    const cached = this.prepared.get(key);
    if (cached !== undefined) return cached;
    const spec = clipFor(this.role, key);
    const source = spec ? this.library.get(spec.clip) : undefined;
    let entry: { action: THREE.AnimationAction; spec: ActionClip } | null = null;
    // An upper-body action without its arms (another layer owns them) is not worth playing.
    const armless = spec?.body === 'upper' && (this.reserved.has('upper_arm_R') || this.reserved.has('upper_arm_L'));
    if (spec && source && !armless) {
      const keep = spec.body === 'upper'
        ? (bone: string) => UPPER.has(bone) && !this.reserved.has(bone)
        : (bone: string) => !this.reserved.has(bone);
      const clip = filterClip(source, keep, spec.body === 'upper' ? ':upper' : '');
      if (clip) {
        const action = this.mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true;
        entry = { action, spec };
      }
    }
    this.prepared.set(key, entry);
    return entry;
  }

  /** Start the clip for an authoritative event. Returns the contact delay in
   * seconds (0 when nothing plays), which the scene uses to time the impact. */
  play(event: { kind: string; text: string; source?: string }): number {
    if (this.disposed) return 0;
    const key = actionKey(event);
    if (!key) return 0;
    const entry = this.prepare(key);
    if (!entry) return 0;
    // A death clip is never interrupted by a trailing hit number.
    if (this.current?.spec.hold && this.current.key === 'down' && key !== 'down') return 0;
    if (this.current && this.current.action !== entry.action) this.current.action.stop();
    const rate = entry.spec.rate ?? 1;
    entry.action.stop().reset().setEffectiveTimeScale(rate).setEffectiveWeight(this.actionWeight).play();
    this.current = { key, action: entry.action, spec: entry.spec, elapsed: 0, duration: entry.action.getClip().duration / rate };
    return entry.spec.contact / rate;
  }

  /** Whether a held (death) clip is active, so the owner skips its fallback pose. */
  get holding(): boolean {
    return !!this.current?.spec.hold;
  }

  /** Advance blending. `speed` is the actor's horizontal speed in m/s. */
  update(dt: number, speed: number, moving: boolean): void {
    if (this.disposed) return;
    if (this.current) {
      this.current.elapsed += dt;
      const tail = this.current.spec.hold ? Infinity : this.current.duration - .14;
      if (!this.current.spec.hold && this.current.elapsed >= this.current.duration) { this.current.action.stop(); this.current = null; }
      else if (this.current.elapsed >= tail) this.actionWeight = THREE.MathUtils.damp(this.actionWeight, 0, 22, dt);
      else this.actionWeight = THREE.MathUtils.damp(this.actionWeight, 1, 34, dt);
    } else this.actionWeight = THREE.MathUtils.damp(this.actionWeight, 0, 22, dt);
    const targetMove = moving && (this.walk.lower || this.walk.upper || this.run.lower) ? 1 : 0;
    this.moveWeight = THREE.MathUtils.damp(this.moveWeight, targetMove, 12, dt);
    const targetRun = this.run.lower || this.run.upper ? THREE.MathUtils.clamp((speed - RUN_SPEED) / 1.2, 0, 1) : 0;
    this.runWeight = THREE.MathUtils.damp(this.runWeight, targetRun, 10, dt);
    const stride = THREE.MathUtils.clamp(speed / 3, .65, 1.65);
    for (const action of [this.walk.lower, this.walk.upper]) action?.setEffectiveTimeScale(stride);
    for (const action of [this.run.lower, this.run.upper]) action?.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 5, .8, 1.4));
    this.applyWeights();
  }

  private applyWeights(): void {
    const act = this.current ? this.actionWeight : 0;
    const upperFree = 1 - act;
    const lowerFree = this.current?.spec.body === 'full' ? 1 - act : 1;
    const idle = 1 - this.moveWeight, walk = this.moveWeight * (1 - this.runWeight), run = this.moveWeight * this.runWeight;
    const set = (loco: Loco, share: number) => {
      loco.lower?.setEffectiveWeight(share * lowerFree);
      loco.upper?.setEffectiveWeight(share * upperFree);
    };
    set(this.idle, idle); set(this.walk, walk); set(this.run, run);
    this.current?.action.setEffectiveWeight(act);
  }

  /** Encounter reset or revival: drop any one-shot and return to locomotion. */
  reset(): void {
    if (this.disposed) return;
    this.current?.action.stop(); this.current = null; this.actionWeight = 0;
    for (const loco of [this.idle, this.walk, this.run]) for (const action of [loco.lower, loco.upper]) action?.reset().play();
    this.applyWeights();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.current?.action.stop(); this.current = null;
    for (const loco of [this.idle, this.walk, this.run]) for (const action of [loco.lower, loco.upper]) {
      if (action) { action.stop(); this.mixer.uncacheClip(action.getClip()); }
    }
    for (const entry of this.prepared.values()) if (entry) { entry.action.stop(); this.mixer.uncacheClip(entry.action.getClip()); }
    this.prepared.clear();
  }
}
