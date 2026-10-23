import * as THREE from 'three';

export type CombatCue = { kind: string; text: string };
type Strike = 'attack' | 'cleave';
type Pose = { hand: number[]; direction: number[]; twist: number; lean: number };
const ready: Pose = { hand: [-.24, 1.16, .18], direction: [.68, .47, .56], twist: -.08, lean: .015 };
const choreography = {
  attack: {
    duration: .82, impact: .27,
    keys: [
      [0, ready],
      [.18, { hand: [-.1, 1.29, .02], direction: [-.7, .62, .35], twist: -.38, lean: -.035 }],
      [.27, { hand: [-.18, 1.24, .27], direction: [.32, .2, .93], twist: .3, lean: .09 }],
      [.4, { hand: [-.17, 1.18, .31], direction: [.86, .15, .48], twist: .43, lean: .06 }],
      [.82, ready],
    ],
  },
  cleave: {
    duration: 1.18, impact: .43,
    keys: [
      [0, ready],
      [.26, { hand: [.02, 1.38, .06], direction: [-.94, .32, -.12], twist: -.65, lean: -.04 }],
      [.35, { hand: [-.15, 1.37, .3], direction: [-.65, .3, .7], twist: -.35, lean: .04 }],
      [.43, { hand: [-.18, 1.25, .32], direction: [.62, .12, .78], twist: .38, lean: .12 }],
      [.57, { hand: [-.22, 1.18, .17], direction: [.98, .15, -.12], twist: .72, lean: .08 }],
      [.74, { hand: [-.24, 1.15, .16], direction: [.85, .35, .4], twist: .3, lean: .04 }],
      [1.18, ready],
    ],
  },
} satisfies Record<Strike, { duration: number; impact: number; keys: [number, Pose][] }>;

/** Only authoritative action events start a strike; chain/hit/buff feedback cannot. */
export function bacchusStrike(cue: CombatCue): Strike | null {
  if (cue.kind === 'auto') return 'attack';
  if (cue.kind === 'weapon') return cue.text.includes('Arc Cleave') ? 'cleave' : 'attack';
  return null;
}

export const BACCHUS_POSE_BONES = ['spine', 'chest', 'upper_chest', 'neck', 'upper_arm_R', 'forearm_R', 'hand_R', 'upper_arm_L', 'forearm_L', 'hand_L', 'clavicle_R', 'clavicle_L'] as const;

/** Upper-body poses own these rotations; locomotion continues to animate the legs. */
export function bacchusLocomotionClip(clip: THREE.AnimationClip) {
  return new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.filter(track =>
    !BACCHUS_POSE_BONES.some(name => track.name === `${name}.quaternion`)));
}

/** Fit the two hands to a common polearm grip when authoring the key poses.
 * Upper-body clips leave the GLB's idle/walk in control of the legs and root. */
export function createBacchusClips(model: THREE.Object3D): Record<'ready' | Strike, THREE.AnimationClip> | null {
  const bones = BACCHUS_POSE_BONES.map(name => model.getObjectByName(name));
  if (bones.some(bone => !(bone instanceof THREE.Bone))) return null;
  const joints = bones as THREE.Bone[];
  const rest = joints.map(bone => bone.quaternion.clone());
  const restore = () => { joints.forEach((bone, i) => bone.quaternion.copy(rest[i])); model.updateMatrixWorld(true); };
  const align = (bone: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3) => {
    const start = bone.getWorldPosition(new THREE.Vector3());
    const from = child.getWorldPosition(new THREE.Vector3()).sub(start).normalize();
    const to = target.clone().sub(start).normalize();
    const world = bone.getWorldQuaternion(new THREE.Quaternion());
    world.premultiply(new THREE.Quaternion().setFromUnitVectors(from, to));
    bone.quaternion.copy(bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
    model.updateMatrixWorld(true);
  };
  const arm = (side: 'R' | 'L', target: THREE.Vector3, shaft: THREE.Vector3, palm: THREE.Vector3) => {
    const upper = model.getObjectByName(`upper_arm_${side}`)!;
    const forearm = model.getObjectByName(`forearm_${side}`)!;
    const hand = model.getObjectByName(`hand_${side}`)!;
    const shoulder = upper.getWorldPosition(new THREE.Vector3());
    const elbow = forearm.getWorldPosition(new THREE.Vector3());
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(wrist);
    const direction = target.clone().sub(shoulder);
    const distance = THREE.MathUtils.clamp(direction.length(), Math.abs(a - b) + .001, a + b - .008);
    direction.normalize(); target = shoulder.clone().addScaledVector(direction, distance);
    const pole = new THREE.Vector3(side === 'R' ? -1 : 1, -.65, -.15);
    pole.addScaledVector(direction, -pole.dot(direction)).normalize();
    const cosine = THREE.MathUtils.clamp((a * a + distance * distance - b * b) / (2 * a * distance), -1, 1);
    elbow.copy(shoulder).addScaledVector(direction, a * cosine).addScaledVector(pole, a * Math.sqrt(1 - cosine * cosine));
    align(upper, forearm, elbow); align(forearm, hand, target);
    const x = shaft.clone().multiplyScalar(side === 'R' ? 1 : -1);
    const z = new THREE.Vector3().crossVectors(x, palm).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    const world = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    hand.quaternion.copy(hand.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
    model.updateMatrixWorld(true);
  };
  const pose = (p: Pose) => {
    restore();
    for (let i = 0; i < 3; i++) joints[i].quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(p.lean / 3, p.twist / 3, 0)));
    joints[3].quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-p.lean * .3, -p.twist * .45, 0)));
    model.updateMatrixWorld(true);
    const shaft = new THREE.Vector3().fromArray(p.direction).normalize();
    const palm = new THREE.Vector3(0, -1, .2);
    palm.addScaledVector(shaft, -palm.dot(shaft)).normalize();
    const primary = new THREE.Vector3().fromArray(p.hand);
    arm('R', primary, shaft, palm);
    arm('L', primary.clone().addScaledVector(shaft, .3), shaft, palm);
    return joints.map(bone => bone.quaternion.clone().normalize());
  };
  const clip = (name: string, keys: [number, Pose][], duration: number) => {
    // Bake the two-hand constraint between authored poses as well as at the keys.
    // Sparse shoulder quaternion interpolation otherwise lets the off hand slip.
    const steps = Math.ceil(duration * 30);
    const times = [...new Set([...keys.map(([time]) => time), ...Array.from({ length: steps + 1 }, (_, i) => i * duration / steps)])].sort((a, b) => a - b);
    const poses = times.map(time => {
      const end = Math.max(1, keys.findIndex(([at]) => at >= time));
      const [startTime, a] = keys[end - 1], [endTime, b] = keys[end];
      const u = THREE.MathUtils.smoothstep(time, startTime, endTime);
      return pose({
        hand: a.hand.map((value, i) => THREE.MathUtils.lerp(value, b.hand[i], u)),
        direction: a.direction.map((value, i) => THREE.MathUtils.lerp(value, b.direction[i], u)),
        twist: THREE.MathUtils.lerp(a.twist, b.twist, u), lean: THREE.MathUtils.lerp(a.lean, b.lean, u),
      });
    });
    const tracks = joints.map((bone, i) => new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, poses.flatMap(p => p[i].toArray())));
    return new THREE.AnimationClip(`bacchus:${name}`, duration, tracks);
  };
  try {
    return {
      ready: clip('ready', [[0, ready], [1, ready]], 1),
      attack: clip('attack', choreography.attack.keys, choreography.attack.duration),
      cleave: clip('cleave', choreography.cleave.keys, choreography.cleave.duration),
    };
  } finally { restore(); }
}

export function createBacchusCombat(model: THREE.Object3D, root: THREE.Object3D, mixer: THREE.AnimationMixer, reference?: THREE.AnimationClip) {
  if (BACCHUS_POSE_BONES.some(name => !(model.getObjectByName(name) instanceof THREE.Bone))) return null;
  // Use the artist's neutral idle pose rather than assuming the skin bind pose is
  // its ready stance. Rest-pose offsets compounded with idle can twist the arms.
  if (reference) {
    const sampler = new THREE.AnimationMixer(model);
    sampler.clipAction(reference).play(); sampler.update(0);
    const transforms: { node: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }[] = [];
    model.traverse(node => { if (node instanceof THREE.Bone) transforms.push({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() }); });
    sampler.stopAllAction(); sampler.uncacheRoot(model);
    transforms.forEach(({ node, position, quaternion, scale }) => { node.position.copy(position); node.quaternion.copy(quaternion); node.scale.copy(scale); });
  }
  const clips = createBacchusClips(model);
  if (!clips) return null;
  const readyAction = mixer.clipAction(clips.ready).play();
  const actions = { attack: mixer.clipAction(clips.attack), cleave: mixer.clipAction(clips.cleave) };
  for (const action of Object.values(actions)) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
  const weights = { ready: 1, attack: 0, cleave: 0 };
  let current: { kind: Strike; elapsed: number; returning: boolean } | null = null;
  let disposed = false;
  const ownedGeometries = new Set<THREE.BufferGeometry>();
  const ownedMaterials = new Set<THREE.Material>();
  const weapon = new THREE.Group(); weapon.name = 'bacchus-thyrsus';
  // Shaft passes across the palm; the rig's hand local Y runs toward the fingers.
  weapon.rotation.z = -Math.PI / 2; weapon.position.y = .065;
  model.getObjectByName('hand_R')!.add(weapon);
  const wood = new THREE.MeshStandardMaterial({ color: '#48333a', roughness: .65, metalness: .22 });
  const bronze = new THREE.MeshStandardMaterial({ color: '#d0aa62', roughness: .32, metalness: .78 });
  const ivory = new THREE.MeshStandardMaterial({ color: '#f7e3a3', emissive: '#a87b2f', emissiveIntensity: .3, roughness: .32, metalness: .5 });
  ownedMaterials.add(wood); ownedMaterials.add(bronze); ownedMaterials.add(ivory);
  const part = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number) => {
    ownedGeometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.y = y;
    mesh.castShadow = true; mesh.receiveShadow = true; weapon.add(mesh); return mesh;
  };
  part(new THREE.CylinderGeometry(.025, .032, 2.1, 8), wood, .38);
  for (const y of [-.61, -.16, .16, 1.28, 1.42]) part(new THREE.CylinderGeometry(.039, .039, .065, 8), bronze, y);
  const crown = part(new THREE.IcosahedronGeometry(.14, 0), bronze, 1.49); crown.scale.y = 1.6;
  const tip = part(new THREE.OctahedronGeometry(.13, 0), ivory, 1.72); tip.scale.set(.65, 2, .45);
  for (const sign of [-1, 1]) {
    const leaf = part(new THREE.OctahedronGeometry(.13, 0), bronze, 1.47);
    leaf.position.x = sign * .105; leaf.scale.set(.45, 1.5, .3); leaf.rotation.z = sign * -.65;
  }

  const count = 12, lifetime = .14;
  const samples = Array.from({ length: count }, () => ({ inner: new THREE.Vector3(), outer: new THREE.Vector3(), age: lifetime }));
  const positions = new Float32Array(count * 6), colors = new Float32Array(count * 6);
  const geometry = new THREE.BufferGeometry(); ownedGeometries.add(geometry);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(Array.from({ length: count - 1 }, (_, i) => [i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2]).flat());
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .62, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  ownedMaterials.add(material);
  const trail = new THREE.Mesh(geometry, material); trail.name = 'bacchus-polearm-trail'; trail.frustumCulled = false; trail.visible = false; root.add(trail);
  const inverse = new THREE.Matrix4();
  const clearTrail = () => { samples.forEach(sample => { sample.age = lifetime; }); trail.visible = false; };
  const reset = () => {
    current = null;
    weights.ready = 1; weights.attack = weights.cleave = 0;
    Object.values(actions).forEach(action => action.stop());
    readyAction.stop().reset().setEffectiveWeight(1).play(); clearTrail();
  };
  return {
    play(cue: CombatCue) {
      if (disposed) return 0;
      const kind = bacchusStrike(cue);
      if (!kind || (kind === 'attack' && current?.kind === 'cleave' && !current.returning)) return 0;
      const next = actions[kind];
      next.stop().reset().setEffectiveWeight(weights[kind]).play();
      current = { kind, elapsed: 0, returning: false }; clearTrail();
      return choreography[kind].impact;
    },
    beforeUpdate(dt: number) {
      if (disposed) return;
      if (current) {
        current.elapsed += dt;
        const duration = choreography[current.kind].duration;
        current.returning = current.elapsed >= duration - .2;
        if (current.elapsed >= duration) current = null;
      }
      const target = current && !current.returning ? current.kind : 'ready';
      for (const name of ['ready', 'attack', 'cleave'] as const) {
        weights[name] = THREE.MathUtils.damp(weights[name], name === target ? 1 : 0, 30, dt);
        const action = name === 'ready' ? readyAction : actions[name];
        if (name === target && !action.isRunning()) action.play();
        action.setEffectiveWeight(weights[name]);
        if (name !== target && weights[name] < .00001) action.stop();
      }
    },
    afterUpdate(dt: number) {
      if (disposed) return;
      samples.forEach(sample => { sample.age += dt; });
      const strike = current && current.elapsed >= choreography[current.kind].impact - .1 && current.elapsed <= choreography[current.kind].impact + .14;
      if (strike) {
        for (let i = count - 1; i > 0; i--) {
          samples[i].inner.copy(samples[i - 1].inner); samples[i].outer.copy(samples[i - 1].outer); samples[i].age = samples[i - 1].age;
        }
        root.updateMatrixWorld(true); inverse.copy(root.matrixWorld).invert();
        samples[0].inner.set(0, .83, 0).applyMatrix4(weapon.matrixWorld).applyMatrix4(inverse);
        samples[0].outer.set(0, 1.94, 0).applyMatrix4(weapon.matrixWorld).applyMatrix4(inverse);
        samples[0].age = 0;
      }
      let visible = 0;
      samples.forEach((sample, i) => {
        sample.inner.toArray(positions, i * 6); sample.outer.toArray(positions, i * 6 + 3);
        const fade = Math.max(0, 1 - sample.age / lifetime);
        colors.set([fade, fade * .58, fade * .16, fade, fade * .87, fade * .46], i * 6);
        if (sample.age < lifetime) visible++;
      });
      trail.visible = visible > 1;
      geometry.setDrawRange(0, Math.max(0, visible - 1) * 6);
      geometry.attributes.position.needsUpdate = geometry.attributes.color.needsUpdate = true;
    },
    reset,
    stop() { reset(); readyAction.stop(); },
    setWireframe(value: boolean) {
      for (const mat of [wood, bronze, ivory]) mat.wireframe = value;
    },
    dispose() {
      if (disposed) return; disposed = true;
      readyAction.stop(); Object.values(actions).forEach(action => action.stop());
      Object.values(clips).forEach(clip => mixer.uncacheClip(clip));
      weapon.removeFromParent(); trail.removeFromParent();
      ownedGeometries.forEach(item => item.dispose()); ownedMaterials.forEach(item => item.dispose());
    },
  };
}
