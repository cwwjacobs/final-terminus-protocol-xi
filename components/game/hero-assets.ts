import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { bacchusLocomotionClip, createBacchusCombat, type CombatCue } from './bacchus-combat.ts';

export const HERO_ASSET_MANIFEST = Object.freeze({
  bacchus: '/assets/models/bacchus.glb',
  heracles: '/assets/models/heracles.glb',
  dolos: '/assets/models/dolos.glb',
  hecate: '/assets/models/hecate.glb',
  ariadne: '/assets/models/ariadne.glb',
});

export interface HeroVisual {
  /** Scene owns this wrapper's position and facing. Source scale/forward stay intact. */
  readonly object: THREE.Object3D;
  readonly labelHeight: number;
  update(dt: number, speed: number, alive: boolean, attack: number): void;
  /** Returns the presentation-only delay until a strike's visual impact. */
  playCombat(cue: CombatCue): number;
  resetCombat(): void;
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
  onDispose: (visual: HeroVisual) => void): HeroVisual {
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
      if (!alive) {
        if (aliveBefore) combat?.stop();
        // Freeze the imported pose; do not write over authored bone channels.
        aliveBefore = false;
        motion.rotation.x = 0;
        motion.rotation.z = THREE.MathUtils.damp(motion.rotation.z, Math.PI * .46, 8, delta);
        return;
      }
      motion.rotation.z = THREE.MathUtils.damp(motion.rotation.z, 0, 8, delta);
      const velocity = Number.isFinite(speed) ? Math.max(0, speed) : 0;
      moving = moving ? velocity > .08 : velocity > .2;
      if (!aliveBefore) { resetActions(); combat?.reset(); aliveBefore = true; }
      const targetWeight = moving && walk ? 1 : 0;
      walkWeight = THREE.MathUtils.damp(walkWeight, targetWeight, 12, delta);
      idle?.setEffectiveWeight(walk ? 1 - walkWeight : 1);
      walk?.setEffectiveWeight(idle ? walkWeight : 1);
      walk?.setEffectiveTimeScale(THREE.MathUtils.clamp(velocity / 3, .65, 1.65));
      combat?.beforeUpdate(delta);
      mixer?.update(delta);
      combat?.afterUpdate(delta);
      // A small group-level accent, not an authored strike or weapon animation.
      const pulse = Number.isFinite(attack) ? THREE.MathUtils.clamp(attack, 0, 1) : 0;
      motion.rotation.x = combat ? 0 : -.045 * Math.sin(pulse * Math.PI);
    },
    playCombat(cue) {
      return !disposed && aliveBefore ? combat?.play(cue) ?? 0 : 0;
    },
    resetCombat() { if (!disposed) combat?.reset(); },
    setWireframe(value) {
      if (disposed) return;
      materials.forEach(material => {
        if ('wireframe' in material) (material as THREE.MeshStandardMaterial).wireframe = value;
      });
      combat?.setWireframe(value);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      combat?.dispose();
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
    const locomotion = combat ? asset.animations.map(bacchusLocomotionClip) : asset.animations;
    const idleClip = locomotion.find(clip => clip.name.toLowerCase() === 'idle');
    const walkClip = locomotion.find(clip => clip.name.toLowerCase() === 'walk');
    idle = idleClip ? mixer.clipAction(idleClip) : undefined;
    walk = walkClip ? mixer.clipAction(walkClip) : undefined;
    resetActions();
    return visual;
  } catch (error) {
    visual.dispose();
    throw error;
  }
}

/** One cache per mounted scene. Rejected loads leave the caller's fallback intact. */
export class HeroAssetCache {
  private readonly loader: HeroAssetLoader;
  private readonly requests = new Map<string, Promise<HeroAssetSource>>();
  private readonly visuals = new Set<HeroVisual>();
  private readonly resources = new AssetResources();
  private disposed = false;

  constructor(loader?: HeroAssetLoader) {
    const gltfLoader = loader ? undefined : new GLTFLoader();
    this.loader = loader ?? (url => gltfLoader!.loadAsync(url));
  }

  async load(id: string): Promise<HeroVisual> {
    if (this.disposed) throw new Error('Hero asset cache is disposed');
    if (!Object.hasOwn(HERO_ASSET_MANIFEST, id)) throw new Error(`Unknown hero asset: ${id}`);
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
    const asset = await pending;
    if (this.disposed) throw new Error('Hero asset cache is disposed');
    try {
      const visual = createVisual(id, asset, this.resources, instance => this.visuals.delete(instance));
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
    this.visuals.clear(); this.requests.clear();
    this.resources.dispose();
  }
}
