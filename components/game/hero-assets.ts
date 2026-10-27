import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { bacchusLocomotionClip, BACCHUS_POSE_BONES, bacchusStrike, createBacchusCombat, type CombatCue } from './bacchus-combat.ts';
import { ActionLayer } from './action-layer.ts';
import { createHeroProps, type HeroProps } from './hero-props.ts';
import { createHeroRegalia, type HeroRegalia } from './hero-regalia.ts';
import { createHeroDivinity, type HeroDivinity } from './hero-divinity.ts';
import { createHeroMotion, heroLocomotionClip } from './hero-motion.ts';
import { PARTY } from '../../game/content.ts';
import type { Role } from '../../game/types.ts';
import animationReceipt from '../../public/assets/animations/hero-animations.json' with { type: 'json' };

export const HERO_ASSET_MANIFEST = Object.freeze({
  bacchus: '/assets/models/bacchus.glb',
  heracles: '/assets/models/heracles.glb',
  dolos: '/assets/models/dolos.glb',
  hecate: '/assets/models/hecate.glb',
  ariadne: '/assets/models/ariadne.glb',
});
/** One armature-only GLB of retargeted clips shared by every hero (all five
 * rigs are the same 22-joint skeleton). Built by scripts/animation/retarget.py.
 * Missing or failing to load leaves heroes on their own idle/walk. */
export const HERO_ANIMATION_LIBRARY = '/assets/animations/hero-animations.glb';
export type AnimationLibrary = ReadonlyMap<string, THREE.AnimationClip>;
const EMPTY_LIBRARY: AnimationLibrary = new Map();

export interface HeroVisual {
  /** Scene owns this wrapper's position and facing. Source scale/forward stay intact. */
  readonly object: THREE.Object3D;
  readonly labelHeight: number;
  update(dt: number, speed: number, alive: boolean, attack: number): void;
  /** Returns the presentation-only delay until a strike's visual impact. */
  playCombat(cue: CombatCue): number;
  /** Copy a real skeleton/weapon attachment position in world space. */
  getAnchor(kind: 'hand' | 'weapon', out: THREE.Vector3): boolean;
  resetCombat(): void;
  /** Son of Zeus keeps Heracles's controlled skeleton and fitted skinned anatomy. */
  setDivineForm?(active: boolean): void;
  setWireframe(value: boolean): void;
  dispose(): void;
}

/** The loader transfers ownership of the returned asset resources to this cache. */
export interface HeroAssetSource {
  scene: THREE.Group;
  scenes?: readonly THREE.Object3D[];
  animations: readonly THREE.AnimationClip[];
}
export type HeroAssetLoader = (url: string) => Promise<HeroAssetSource>;

type Renderable = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
};

const materialsOf = (object: Renderable) => object.material
  ? Array.isArray(object.material) ? object.material : [object.material] : [];

/** Resource identity matters: materials can share textures, and textures can share bitmaps. */
class AssetResources {
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();
  private skeletons = new Set<THREE.Skeleton>();
  private freed = new WeakSet<object>();
  private closedBitmaps = new WeakSet<object>();

  capture(asset: HeroAssetSource) {
    for (const root of new Set([asset.scene, ...(asset.scenes ?? [])])) {
      root.traverse(object => {
        const node = object as Renderable;
        if (node.geometry) this.geometries.add(node.geometry);
        for (const material of materialsOf(node)) {
          this.materials.add(material);
          // GLTFLoader's PBR materials expose all their texture slots directly.
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) this.textures.add(value);
          }
        }
        if ((object as THREE.SkinnedMesh).isSkinnedMesh) {
          this.skeletons.add((object as THREE.SkinnedMesh).skeleton);
        }
      });
    }
  }

  disposeResource(resource: { dispose(): void }) {
    if (this.freed.has(resource)) return;
    this.freed.add(resource);
    resource.dispose();
  }

  disposeSkeleton(skeleton: THREE.Skeleton) {
    if (this.freed.has(skeleton)) return;
    this.freed.add(skeleton);
    // Skeleton.dispose also disposes its bone texture. Route that texture through
    // the shared identity guard, including a source that was previously rendered.
    if (skeleton.boneTexture) this.disposeResource(skeleton.boneTexture);
    skeleton.boneTexture = null;
    skeleton.dispose();
  }

  private closeBitmap(value: unknown) {
    if (Array.isArray(value)) { value.forEach(image => this.closeBitmap(image)); return; }
    if (!value || typeof value !== 'object' || this.closedBitmaps.has(value)) return;
    // A cross-realm ImageBitmap may fail instanceof; HTML images/canvases and
    // borrowed DOM resources must not be closed as though they were bitmaps.
    if (Object.prototype.toString.call(value) !== '[object ImageBitmap]') return;
    const bitmap = value as ImageBitmap;
    if (typeof bitmap.close !== 'function') return;
    this.closedBitmaps.add(value);
    bitmap.close();
  }

  dispose() {
    this.skeletons.forEach(skeleton => this.disposeSkeleton(skeleton));
    this.geometries.forEach(geometry => this.disposeResource(geometry));
    this.materials.forEach(material => this.disposeResource(material));
    this.textures.forEach(texture => {
      this.disposeResource(texture);
      this.closeBitmap(texture.source.data);
    });
    this.skeletons.clear(); this.geometries.clear(); this.materials.clear(); this.textures.clear();
  }
}

function createVisual(id: string, asset: HeroAssetSource, resources: AssetResources,
  onDispose: (visual: HeroVisual) => void, library: AnimationLibrary = EMPTY_LIBRARY, divineAnatomy?: THREE.Object3D): HeroVisual {
  const role: Role = PARTY.find(member => member.id === id)?.role ?? 'vanguard';
  const object = new THREE.Group();
  object.name = `hero:${id}`;
  const motion = new THREE.Group();
  motion.name = `hero-motion:${id}`;
  object.add(motion);
  const model = cloneSkeleton(asset.scene);
  motion.add(model);
  const materials = new Map<THREE.Material, THREE.Material>();
  const skeletons = new Set<THREE.Skeleton>();
  let mixer: THREE.AnimationMixer | undefined;
  let combat: ReturnType<typeof createBacchusCombat> = null;
  let bodyMotion: ReturnType<typeof createHeroMotion> = null;
  let layer: ActionLayer | undefined;
  let props: HeroProps | null = null;
  let regalia: HeroRegalia | null = null;
  let divinity: HeroDivinity | null = null;
  let divineForm = false;
  let formProps: THREE.Object3D[] = [];
  let disposed = false;
  let aliveBefore = true;
  let moving = false;
  let walkWeight = 0;
  let idle: THREE.AnimationAction | undefined;
  let walk: THREE.AnimationAction | undefined;
  const resetActions = () => {
    walkWeight = moving && walk ? 1 : 0;
    idle?.reset().setEffectiveWeight(walkWeight === 1 ? 0 : 1).play();
    walk?.reset().setEffectiveWeight(walkWeight).play();
  };
  const visual: HeroVisual = {
    object,
    labelHeight: 2.05,
    update(dt, speed, alive, attack) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return;
      const delta = Math.min(dt, .25);
      regalia?.update(attack, alive);
      divinity?.update(attack, alive);
      if (!alive) {
        if (aliveBefore) {
          combat?.stop();
          // The upper-body fall can keep advancing without walking in place
          // underneath it. resetActions() resumes both loops on revival.
          if (idle) idle.paused = true;
          if (walk) walk.paused = true;
        }
        aliveBefore = false;
        motion.rotation.x = 0;
        if (layer?.holding) {
          // An authored death clip plays out and holds its last frame.
          layer.update(delta, 0, false); mixer?.update(delta);
          motion.rotation.z = THREE.MathUtils.damp(motion.rotation.z, 0, 8, delta);
          return;
        }
        if (bodyMotion) {
          if (!bodyMotion.holding) bodyMotion.play({ kind: 'down', text: '' });
          bodyMotion.beforeUpdate(delta);mixer?.update(delta);
        }
        // Freeze the imported pose; do not write over authored bone channels.
        motion.rotation.z = THREE.MathUtils.damp(motion.rotation.z, Math.PI * .46, 8, delta);
        return;
      }
      motion.rotation.z = THREE.MathUtils.damp(motion.rotation.z, 0, 8, delta);
      const velocity = Number.isFinite(speed) ? Math.max(0, speed) : 0;
      moving = moving ? velocity > .08 : velocity > .2;
      if (!aliveBefore) { resetActions(); combat?.reset(); bodyMotion?.reset(); layer?.reset(); aliveBefore = true; }
      if (layer) layer.update(delta, velocity, moving);
      else {
        const targetWeight = moving && walk ? 1 : 0;
        walkWeight = THREE.MathUtils.damp(walkWeight, targetWeight, 12, delta);
        idle?.setEffectiveWeight(walk ? 1 - walkWeight : 1);
        walk?.setEffectiveWeight(idle ? walkWeight : 1);
        walk?.setEffectiveTimeScale(THREE.MathUtils.clamp(velocity / 3, .65, 1.65));
      }
      combat?.beforeUpdate(delta);
      bodyMotion?.beforeUpdate(delta);
      mixer?.update(delta);
      combat?.afterUpdate(delta);
      // A small group-level accent, not an authored strike or weapon animation.
      const pulse = Number.isFinite(attack) ? THREE.MathUtils.clamp(attack, 0, 1) : 0;
      motion.rotation.x = combat || bodyMotion ? 0 : -.045 * Math.sin(pulse * Math.PI);
    },
    playCombat(cue) {
      if (disposed) return 0;
      // The death clip is the one action a fallen actor still plays.
      if (!aliveBefore && cue.kind !== 'down') return 0;
      if (combat && (bacchusStrike(cue) || !layer)) return combat.play(cue);
      if (bodyMotion) return bodyMotion.play(cue);
      return layer?.play(cue) ?? 0;
    },
    getAnchor(kind, out) {
      if (disposed) return false;
      const node = kind === 'weapon' ? model.getObjectByName(id === 'bacchus' ? 'bacchus-thyrsus' : 'hero-weapon-tip')
        : model.getObjectByName(id === 'dolos' ? 'hand_L' : 'hand_R');
      if (!node) return false;
      // Refresh only this attachment's ancestor chain. Updating every hero
      // mesh for each hand/trail sample repeats the whole skeleton traversal.
      node.updateWorldMatrix(true, false);
      if (kind === 'weapon' && id === 'bacchus') out.set(0, 1.72, 0).applyMatrix4(node.matrixWorld);
      else node.getWorldPosition(out);
      return out.toArray().every(Number.isFinite);
    },
    resetCombat() { if (!disposed) { combat?.reset(); bodyMotion?.reset(); layer?.reset(); regalia?.reset(); divinity?.reset(); } },
    setDivineForm(active) {
      if (disposed || !divinity || divineForm === active) return;
      divineForm = active; divinity.setActive(active); regalia?.setVisible(!active);
      // Keep the real body, head and skeleton. Only the normal club and shield
      // attachments give way to the lightning form's unarmed casting gestures.
      formProps.forEach(prop => { prop.visible = !active; });
    },
    setWireframe(value) {
      if (disposed) return;
      materials.forEach(material => {
        if ('wireframe' in material) (material as THREE.MeshStandardMaterial).wireframe = value;
      });
      combat?.setWireframe(value); props?.setWireframe(value); regalia?.setWireframe(value); divinity?.setWireframe(value);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      divinity?.dispose(); regalia?.dispose(); combat?.dispose(); bodyMotion?.dispose(); layer?.dispose(); props?.dispose();
      mixer?.stopAllAction();
      mixer?.uncacheRoot(model);
      object.removeFromParent();
      skeletons.forEach(skeleton => resources.disposeSkeleton(skeleton));
      materials.forEach(material => resources.disposeResource(material));
      onDispose(visual);
    },
  };
  try {
    model.traverse(node => {
      const renderable = node as Renderable;
      if (renderable.material) {
        const cloneMaterial = (material: THREE.Material) => {
          let copy = materials.get(material);
          if (!copy) { copy = material.clone(); materials.set(material, copy); }
          return copy;
        };
        renderable.material = Array.isArray(renderable.material)
          ? renderable.material.map(cloneMaterial) : cloneMaterial(renderable.material);
      }
      if ((node as THREE.Mesh).isMesh) { node.castShadow = true; node.receiveShadow = true; }
      if ((node as THREE.SkinnedMesh).isSkinnedMesh) {
        node.frustumCulled = false;
        skeletons.add((node as THREE.SkinnedMesh).skeleton);
      }
    });
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const labelHeight = Number.isFinite(bounds.max.y) ? Math.max(.25, bounds.max.y + .25) : 2.05;
    Object.defineProperty(visual, 'labelHeight', { value: labelHeight, enumerable: true });
    mixer = new THREE.AnimationMixer(model);
    if (id === 'bacchus') combat = createBacchusCombat(model, object, mixer, asset.animations.find(clip => clip.name.toLowerCase() === 'idle'));
    else {
      if (library.size === 0) bodyMotion = createHeroMotion(id, model, mixer, asset.animations.find(clip => clip.name.toLowerCase() === 'idle'));
      if (bodyMotion || library.size > 0) props = createHeroProps(id, model);
    }
    regalia = createHeroRegalia(id, model);
    divinity = createHeroDivinity(id, model, divineAnatomy);
    formProps = divinity ? ['prop:hand_R', 'prop:forearm_L'].map(name => model.getObjectByName(name)).filter((node): node is THREE.Object3D => !!node) : [];
    if (library.size > 0) {
      // The shared library owns locomotion blending and one-shot actions. Bacchus's
      // polearm layer keeps its bones; the library may only move the rest of him.
      layer = new ActionLayer(mixer, role, asset.animations, library, { reserved: combat ? BACCHUS_POSE_BONES : [] });
    } else {
      const locomotion = combat ? asset.animations.map(bacchusLocomotionClip) : bodyMotion ? asset.animations.map(heroLocomotionClip) : asset.animations;
      const idleClip = locomotion.find(clip => clip.name.toLowerCase() === 'idle');
      const walkClip = locomotion.find(clip => clip.name.toLowerCase() === 'walk');
      idle = idleClip ? mixer.clipAction(idleClip) : undefined;
      walk = walkClip ? mixer.clipAction(walkClip) : undefined;
      resetActions();
    }
    return visual;
  } catch (error) {
    visual.dispose();
    throw error;
  }
}

export interface HeroAssetCacheOptions {
  /** Loader for the shared animation library; `false` disables it. A custom hero
   * loader without this option loads no library, so tests stay deterministic. */
  library?: HeroAssetLoader | false;
  /** Explicit test/preview opt-in. Unfinished clips and their props stay off in the game. */
  allowPlaceholderLibrary?: boolean;
  /** Runtime reuses the cached Bacchus anatomy on Heracles's own skeleton for
   * Zeus. Custom loaders opt in explicitly when supplying real indexed skins. */
  divineAnatomy?: boolean;
}

/** Index a loaded library by clip name. Names are unique per file by construction.
 * Exporters sample every channel; only rotations and the hips' vertical travel
 * carry meaning here, so scale tracks and other translations are dropped. */
export function indexLibrary(asset: HeroAssetSource): AnimationLibrary {
  return new Map(asset.animations.map(clip => {
    const tracks = clip.tracks.filter(track => track.name.endsWith('.quaternion') || track.name === 'hips.position');
    return [clip.name, new THREE.AnimationClip(clip.name, clip.duration, tracks)];
  }));
}

/** One cache per mounted scene. Rejected loads leave the caller's fallback intact. */
export class HeroAssetCache {
  private readonly loader: HeroAssetLoader;
  private readonly libraryLoader: HeroAssetLoader | null;
  private readonly requests = new Map<string, Promise<HeroAssetSource>>();
  private library: Promise<AnimationLibrary> | null = null;
  private readonly visuals = new Set<HeroVisual>();
  private readonly resources = new AssetResources();
  private disposed = false;
  private readonly divineAnatomy: boolean;

  constructor(loader?: HeroAssetLoader, options: HeroAssetCacheOptions = {}) {
    const gltfLoader = loader && options.library ? undefined : new GLTFLoader();
    this.loader = loader ?? (url => gltfLoader!.loadAsync(url));
    this.divineAnatomy = options.divineAnatomy ?? !loader;
    const enabled = animationReceipt.placeholder === false || options.allowPlaceholderLibrary === true;
    this.libraryLoader = !enabled || options.library === false ? null
      : options.library ?? (loader ? null : url => gltfLoader!.loadAsync(url));
  }

  /** Shared clips, loaded once. A missing or broken file is an empty library, not a failed hero. */
  loadLibrary(): Promise<AnimationLibrary> {
    if (!this.libraryLoader) return Promise.resolve(EMPTY_LIBRARY);
    if (!this.library) {
      this.library = Promise.resolve().then(() => {
        if (this.disposed) return null;
        return this.libraryLoader!(HERO_ANIMATION_LIBRARY);
      }).then(asset => {
        if (!asset) return EMPTY_LIBRARY;
        this.resources.capture(asset);
        if (this.disposed) { this.resources.dispose(); return EMPTY_LIBRARY; }
        return indexLibrary(asset);
      }).catch(error => {
        console.warn('Hero animation library unavailable; heroes keep their own idle/walk.', error);
        return EMPTY_LIBRARY;
      });
    }
    return this.library;
  }

  private requestAsset(id: string) {
    let pending = this.requests.get(id);
    if (!pending) {
      pending = Promise.resolve().then(() => {
        if (this.disposed) throw new Error('Hero asset cache is disposed');
        return this.loader(HERO_ASSET_MANIFEST[id as keyof typeof HERO_ASSET_MANIFEST]);
      })
        .then(asset => {
          this.resources.capture(asset);
          if (this.disposed) { this.resources.dispose(); throw new Error('Hero asset cache is disposed'); }
          return asset;
        }).catch(error => {
          if (this.requests.get(id) === pending) this.requests.delete(id);
          throw error;
        });
      this.requests.set(id, pending);
    }
    return pending;
  }

  async load(id: string): Promise<HeroVisual> {
    if (this.disposed) throw new Error('Hero asset cache is disposed');
    if (!Object.hasOwn(HERO_ASSET_MANIFEST, id)) throw new Error(`Unknown hero asset: ${id}`);
    const pending = this.requestAsset(id);
    const [asset, library, anatomy] = await Promise.all([pending, this.loadLibrary(), id === 'heracles' && this.divineAnatomy ? this.requestAsset('bacchus').catch(() => undefined) : undefined]);
    if (this.disposed) throw new Error('Hero asset cache is disposed');
    try {
      const visual = createVisual(id, asset, this.resources, instance => this.visuals.delete(instance), library, anatomy?.scene);
      this.visuals.add(visual);
      return visual;
    } catch (error) {
      if (this.requests.get(id) === pending) this.requests.delete(id);
      throw error;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.visuals.forEach(visual => visual.dispose());
    this.visuals.clear(); this.requests.clear(); this.library = null;
    this.resources.dispose();
  }
}
