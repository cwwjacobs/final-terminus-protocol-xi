import * as THREE from 'three';
import type { CombatCue } from './bacchus-combat.ts';
import { presentationContact, presentationKey } from './presentation-cues.ts';

/** These are authored rig motions, separate from the deliberately disabled GLB
 * placeholders. Rotations alone own the upper body; movement/feet stay on the
 * character's original locomotion and the combat kernel owns world position. */
export const HERO_MOTION_BONES = ['spine', 'chest', 'upper_chest', 'neck', 'head',
  'clavicle_L', 'upper_arm_L', 'forearm_L', 'hand_L',
  'clavicle_R', 'upper_arm_R', 'forearm_R', 'hand_R'] as const;
type V3 = [number, number, number];
interface Pose { right: V3; left: V3; rightDir: V3; leftDir: V3; twist: number; lean: number }
interface Definition { duration: number; keys: [number, Pose][]; hold?: boolean }
const pose = (right: V3, left: V3, twist = 0, lean = 0, rightDir: V3 = [0, 1, 0], leftDir: V3 = [0, 1, 0]): Pose => ({ right, left, rightDir, leftDir, twist, lean });
const archer = pose([-.13, 1.29, .21], [.22, 1.33, .52], -.13);
const caster = pose([-.28, 1.12, .25], [.24, 1.04, .26]);
const defender = pose([-.32, 1.15, .3], [.24, 1.14, .36], -.07);

function definitions(id: string): Record<string, Definition> {
  const ready = id === 'dolos' ? archer : id === 'heracles' ? defender : caster;
  const move = (duration: number, contact: number, wind: Pose, hit: Pose, follow = ready): Definition => ({ duration, keys: [[0, ready], [Math.max(.04, contact * .58), wind], [contact, hit], [Math.min(duration - .1, contact + .14), follow], [duration, ready]] });
  const castGather = pose([-.18, 1.35, .25], [.14, 1.29, .42], -.13, -.03);
  const castRelease = pose([-.28, 1.38, .53], [.24, 1.31, .59], .12, .08, [0, .88, .3]);
  const sweep = pose([-.29, 1.58, .03], [.4, 1.3, .4], -.36, -.04, [-.55, .8, -.2]);
  const strike = pose([.12, 1.18, .65], [.29, 1.12, .42], .42, .12, [.78, .2, .55]);
  const draw = pose([-.19, 1.42, -.03], [.22, 1.4, .66], -.27, -.015);
  const release = pose([-.32, 1.4, -.08], [.2, 1.38, .66], -.12, .025);
  const raised = pose([-.27, 1.68, .19], [.31, 1.57, .36], -.08, -.06);
  const wide = pose([-.53, 1.34, .38], [.53, 1.34, .38], .02, .025, [-.4, .9, 0]);
  const defs: Record<string, Definition> = {
    ready: { duration: 1, keys: [[0, ready], [1, ready]] },
    auto: id === 'dolos' ? move(.55, .2, draw, release) : id === 'heracles' ? move(.65, .2, sweep, strike) : move(.55, .2, castGather, castRelease),
    cleave: id === 'dolos' ? move(.8, .36, draw, pose([-.42, 1.48, -.06], [.35, 1.35, .65], .15)) : move(.96, .36, sweep, strike, pose([.25, 1.1, .38], [.3, 1.14, .35], .55, .09, [.95, .15, -.1])),
    pierce: id === 'dolos' ? move(.72, .28, pose([-.22, 1.44, -.1], [.06, 1.42, .7], -.3), pose([-.42, 1.44, -.08], [.02, 1.42, .74], -.12, .04)) : move(.78, .28, pose([-.32, 1.16, -.04], [.25, 1.18, .32], -.28), pose([-.11, 1.16, .76], [.22, 1.16, .4], .15, .13, [0, .1, 1])),
    resonance: id === 'dolos' ? move(.95, .44, pose([-.2, 1.62, -.02], [.24, 1.62, .55], -.2), pose([-.4, 1.59, -.07], [.26, 1.56, .62], .12)) : move(1.06, .44, raised, pose([-.12, 1.02, .6], [.27, 1.15, .39], .2, .2, [0, -.75, .65])),
    fire: move(.68, .3, castGather, castRelease),
    ice: move(.72, .3, pose([-.15, 1.4, .38], [.15, 1.4, .38], 0, -.03), wide),
    lightning: move(.74, .3, raised, pose([-.24, 1.63, .5], [.35, 1.29, .51], .15, .07, [0, .7, .7])),
    elementalShot: move(.58, .2, draw, release),
    splitVolley: { duration: .22, keys: [[0, draw], [.055, release], [.22, archer]] },
    volleyReady: { duration: .28, keys: [[0, archer], [.1, draw], [.28, draw]] },
    rapidWeave: move(.8, .22, castGather, wide),
    heal: move(.74, .16, castGather, pose([-.32, 1.38, .42], [.4, 1.32, .55], .1, .035)),
    shimmerWave: move(.95, .18, pose([-.14, 1.14, .4], [.14, 1.14, .4]), wide),
    mendingThread: move(.8, .16, pose([-.12, 1.21, .34], [.11, 1.21, .35]), pose([-.36, 1.27, .3], [.37, 1.27, .55], .06)),
    aegis: move(1.02, .2, castGather, raised),
    provoke: move(.9, .18, pose([-.37, 1.35, .25], [.26, 1.3, .48], -.15, -.06), pose([-.48, 1.52, .33], [.3, 1.3, .56], .06, .1)),
    guard: move(.8, .12, defender, pose([-.25, 1.27, .35], [.16, 1.45, .56], -.18, .09)),
    dodge: move(.45, .09, ready, pose([-.28, 1.09, .23], [.28, 1.13, .26], -.38, -.14)),
    hit: { duration: .4, keys: [[0, ready], [.07, pose([-.3, 1.15, .15], [.3, 1.15, .17], .12, -.22)], [.4, ready]] },
    down: { duration: .6, keys: [[0, ready], [.6, pose([-.24, .85, .14], [.24, .85, .17], .17, .32)]], hold: true },
  };
  return defs;
}

export function heroLocomotionClip(clip: THREE.AnimationClip) {
  return new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.filter(track =>
    !HERO_MOTION_BONES.some(name => track.name === `${name}.quaternion`)));
}

/** Sample a real idle before fitting, so imported bind-pose rotations are never
 * mistaken for an action-ready pose. The caller's skeleton is restored. */
export function createHeroMotionClips(id: string, model: THREE.Object3D, reference?: THREE.AnimationClip): Record<string, THREE.AnimationClip> | null {
  if (!['heracles', 'dolos', 'hecate', 'ariadne'].includes(id) || HERO_MOTION_BONES.some(name => !(model.getObjectByName(name) instanceof THREE.Bone))) return null;
  const all: { node: THREE.Object3D; p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }[] = [];
  model.traverse(node => { if (node instanceof THREE.Bone) all.push({ node, p: node.position.clone(), q: node.quaternion.clone(), s: node.scale.clone() }); });
  const restoreOriginal = () => { all.forEach(({ node, p, q, s }) => { node.position.copy(p); node.quaternion.copy(q); node.scale.copy(s); }); model.updateMatrixWorld(true); };
  try {
    if (reference) {
      const sampler = new THREE.AnimationMixer(model);sampler.clipAction(reference).play();sampler.update(0);
      const sampled = all.map(({ node }) => ({ p: node.position.clone(), q: node.quaternion.clone(), s: node.scale.clone() }));
      sampler.stopAllAction();sampler.uncacheRoot(model);
      all.forEach(({ node }, i) => { node.position.copy(sampled[i].p);node.quaternion.copy(sampled[i].q);node.scale.copy(sampled[i].s); });
    }
    const joints = HERO_MOTION_BONES.map(name => model.getObjectByName(name) as THREE.Bone);
    const rest = joints.map(bone => bone.quaternion.clone());model.updateMatrixWorld(true);
    const scale = model.worldToLocal(model.getObjectByName('head')!.getWorldPosition(new THREE.Vector3())).y / 1.584;
    const restore = () => { joints.forEach((bone, i) => bone.quaternion.copy(rest[i]));model.updateMatrixWorld(true); };
    const align = (bone: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3) => {
      const start = bone.getWorldPosition(new THREE.Vector3()), from = child.getWorldPosition(new THREE.Vector3()).sub(start).normalize(), to = target.clone().sub(start).normalize();
      const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromUnitVectors(from, to));
      bone.quaternion.copy(bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));model.updateMatrixWorld(true);
    };
    const arm = (side: 'L' | 'R', desired: V3, dir: V3) => {
      const upper = model.getObjectByName(`upper_arm_${side}`)!, fore = model.getObjectByName(`forearm_${side}`)!, hand = model.getObjectByName(`hand_${side}`)!;
      const shoulder = upper.getWorldPosition(new THREE.Vector3()), elbow = fore.getWorldPosition(new THREE.Vector3()), wrist = hand.getWorldPosition(new THREE.Vector3());
      const target = model.localToWorld(new THREE.Vector3(...desired).multiplyScalar(scale));
      const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(wrist), direction = target.clone().sub(shoulder);
      const distance = THREE.MathUtils.clamp(direction.length(), Math.abs(a - b) + .002, a + b - .008);direction.normalize();target.copy(shoulder).addScaledVector(direction, distance);
      const pole = new THREE.Vector3(side === 'R' ? -1 : 1, -.5, -.25).transformDirection(model.matrixWorld);pole.addScaledVector(direction, -pole.dot(direction)).normalize();
      const cos = THREE.MathUtils.clamp((a * a + distance * distance - b * b) / (2 * a * distance), -1, 1);
      elbow.copy(shoulder).addScaledVector(direction, a * cos).addScaledVector(pole, a * Math.sqrt(1 - cos * cos));
      align(upper, fore, elbow);align(fore, hand, target);
      // The prop's local +Y maps to the hand's -X. Keep the staff/club/bow
      // upright while its elbow and shoulder move, including at release.
      const x = new THREE.Vector3(...dir).normalize().negate().transformDirection(model.matrixWorld);
      const forward = new THREE.Vector3(0, 0, 1).transformDirection(model.matrixWorld);
      if (Math.abs(x.dot(forward)) > .96) forward.set(0, 1, 0).transformDirection(model.matrixWorld);
      const y = forward.addScaledVector(x, -forward.dot(x)).normalize(), z = new THREE.Vector3().crossVectors(x, y).normalize();
      const world = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      hand.quaternion.copy(hand.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));model.updateMatrixWorld(true);
    };
    const apply = (p: Pose) => {
      restore();
      for (let i = 0; i < 3; i++) joints[i].quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(p.lean / 3, p.twist / 3, 0)));
      joints[3].quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-p.lean * .25, -p.twist * .3, 0)));
      model.updateMatrixWorld(true);arm('R', p.right, p.rightDir);arm('L', p.left, p.leftDir);
      return joints.map(bone => bone.quaternion.clone().normalize());
    };
    return Object.fromEntries(Object.entries(definitions(id)).map(([key, d]) => {
      const count = Math.ceil(d.duration * 30), times = [...new Set([...d.keys.map(([time]) => time), ...Array.from({ length: count + 1 }, (_, i) => i * d.duration / count)])].sort((a, b) => a - b);
      const frames = times.map(time => {
        const end = Math.max(1, d.keys.findIndex(([at]) => at >= time)), [ta, a] = d.keys[end - 1], [tb, b] = d.keys[end];
        const t = THREE.MathUtils.smoothstep(time, ta, tb), lerp = (a: V3, b: V3) => a.map((v, i) => THREE.MathUtils.lerp(v, b[i], t)) as V3;
        return apply({ right: lerp(a.right, b.right), left: lerp(a.left, b.left), rightDir: lerp(a.rightDir, b.rightDir), leftDir: lerp(a.leftDir, b.leftDir), twist: THREE.MathUtils.lerp(a.twist, b.twist, t), lean: THREE.MathUtils.lerp(a.lean, b.lean, t) });
      });
      const tracks = joints.map((bone, i) => new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, frames.flatMap(frame => frame[i].toArray())));
      return [key, new THREE.AnimationClip(`${id}:${key}`, d.duration, tracks)];
    }));
  } finally { restoreOriginal(); }
}

export function createHeroMotion(id: string, model: THREE.Object3D, mixer: THREE.AnimationMixer, reference?: THREE.AnimationClip) {
  const clips = createHeroMotionClips(id, model, reference);if (!clips) return null;
  const actions = Object.fromEntries(Object.entries(clips).map(([key, clip]) => [key, mixer.clipAction(clip)]));
  const weights = Object.fromEntries(Object.keys(actions).map(key => [key, key === 'ready' ? 1 : 0]));
  for (const [key, action] of Object.entries(actions)) { if (key !== 'ready') { action.setLoop(THREE.LoopOnce, 1);action.clampWhenFinished = true; } }
  actions.ready.play();let current: { key: string; elapsed: number } | null = null, disposed = false;
  const contacts = new Set<string>();
  const reset = () => { current = null;contacts.clear();Object.values(actions).forEach(a => a.stop());for (const key of Object.keys(weights)) weights[key] = key === 'ready' ? 1 : 0;actions.ready.reset().setEffectiveWeight(1).play(); };
  return {
    get holding() { return current?.key === 'down'; },
    play(cue: CombatCue) {
      if (disposed || current?.key === 'down') return 0;
      let key: string | null = presentationKey(cue);
      if (key === 'mendingThread' && cue.kind !== 'ability' || key === 'shimmerWave' && cue.kind !== 'shimmer_wave') return 0;
      if (key === 'splitVolley') {
        if (cue.kind === 'ability') key = 'volleyReady';
        else if (cue.sequenceId !== undefined && cue.hitIndex !== undefined) {
          const token = `${cue.sequenceId}:${cue.hitIndex}`;if (contacts.has(token)) return 0;contacts.add(token);if (contacts.size > 32) contacts.delete(contacts.values().next().value!);
        }
      }
      if (!key || !actions[key]) return 0;
      if (key === 'auto' && current && !['auto', 'hit'].includes(current.key) && current.elapsed < clips[current.key].duration - .16) return 0;
      // Aegis emits one event per recipient, but the caster gestures once.
      if (key === 'aegis' && current?.key === key && current.elapsed < .1) return 0;
      actions[key].stop().reset().setEffectiveWeight(weights[key]).play();current = { key, elapsed: 0 };
      return presentationContact(cue, id);
    },
    beforeUpdate(dt: number) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return;
      if (current) { current.elapsed += dt;if (current.key !== 'down' && current.elapsed >= clips[current.key].duration) current = null; }
      const target = current && (current.key === 'down' || current.elapsed < clips[current.key].duration - .14) ? current.key : 'ready';
      for (const [key, action] of Object.entries(actions)) { weights[key] = THREE.MathUtils.damp(weights[key], key === target ? 1 : 0, 32, dt);if (key === target && !action.isRunning()) action.play();action.setEffectiveWeight(weights[key]);if (key !== target && weights[key] < .00001) action.stop(); }
    },
    reset,
    stop() { reset();actions.ready.stop(); },
    dispose() { if (disposed) return;disposed = true;Object.values(actions).forEach(a => a.stop());Object.values(clips).forEach(c => mixer.uncacheClip(c));contacts.clear(); },
  };
}
