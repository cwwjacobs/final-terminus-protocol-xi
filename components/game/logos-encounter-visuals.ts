import * as THREE from 'three';

export type LogosVisualStage = 'none' | 'descent' | 'sentinels' | 'giant' | 'collapse' | 'escaped';
/** Structural boundary keeps presentation independent of the combat kernel. */
export interface LogosVisualState {
  encounter: string;
  logos?: { stage: LogosVisualStage; elapsed: number };
  boss: { x: number; z: number; hp: number; stunRemaining: number; cast?: unknown };
  enemies: readonly { id: string; x: number; z: number; hp: number; target: number; attackTimer: number; stunRemaining: number }[];
  party: readonly { x: number; z: number; hp: number }[];
}
export interface LogosTextureLoader {
  load(url: string, loaded: (texture: THREE.Texture) => void, failed: () => void): void;
}
const sentinelNames = ['observation', 'judgment', 'memory', 'reason', 'order', 'knowledge'] as const;
const rushNames = ['rush-melee-charge', 'rush-leap-attack', 'rush-ranged-throw'] as const;
const giantParts = [
  { name: 'body', x: 0, y: 0, layer: 0 },
  { name: 'neck', x: -.2, y: 14, layer: .02 },
  { name: 'arm-screen-left', x: -3.6, y: 13, layer: .03 },
  { name: 'arm-screen-right', x: 3.6, y: 12, layer: .04 },
  { name: 'head', x: -.2, y: 17.3, layer: .05 },
  { name: 'crown', x: -.2, y: 18, layer: .06 },
] as const;

/** Absolute stage clocks let paused, restored and online views agree without
 * granting presentation ownership of encounter timing or actor positions. */
export function logosSequencePresentation(state: Pick<LogosVisualState, 'encounter' | 'logos'>, reducedMotion = false) {
  const stage = state.encounter === 'logos' ? state.logos?.stage ?? 'giant' : 'none';
  const elapsed = Math.max(0, Number.isFinite(state.logos?.elapsed) ? state.logos!.elapsed : 0);
  const lowerBlend = stage === 'descent' ? Math.min(1, elapsed / 60) : stage === 'none' ? 0 : 1;
  const collapse = stage === 'collapse' ? Math.min(6, elapsed) : 0;
  const escape = stage === 'escaped' ? 1 : Math.max(0, Math.min(1, (collapse - 2) / 4));
  const smoothEscape = escape * escape * (3 - 2 * escape);
  return {
    lowerBlend,
    descentHeight: reducedMotion ? (lowerBlend >= 1 ? 60 : 0) : lowerBlend * 60,
    floorVisible: stage !== 'escaped' && !(stage === 'collapse' && collapse >= 2.4),
    floorOpacity: stage === 'escaped' ? 0 : stage === 'collapse' ? Math.max(0, 1 - collapse / 2.4) : 1,
    floorScale: reducedMotion || stage !== 'collapse' ? 1 : Math.max(.15, 1 - collapse * .15),
    floorY: reducedMotion || stage !== 'collapse' ? 0 : -3.5 * collapse * collapse,
    actorY: stage === 'escaped' ? 12 : stage === 'collapse' && !reducedMotion ? -Math.min(2.8, collapse * collapse * 1.2) + smoothEscape * 14.8 : 0,
    escapeOpacity: stage === 'escaped' ? .45 : smoothEscape,
  };
}

/** The source kit is 2D vector artwork, displayed as articulated cutouts in
 * the existing 3D arena. Every part shares a 605×840 transparent canvas. */
export function createLogosEncounterVisuals(scene: THREE.Scene, quality: 'low' | 'high', textureSource?: LogosTextureLoader) {
  const root = new THREE.Group(); root.name = 'Logos-vector-encounter'; root.visible = false; scene.add(root);
  const targets = new Map<string, THREE.Object3D>();
  const plane = new THREE.PlaneGeometry(1, 1);
  const sphere = new THREE.SphereGeometry(1, quality === 'high' ? 16 : 10, 8);
  const column = new THREE.CylinderGeometry(1, 1, 1, 8);
  const ring = new THREE.RingGeometry(.92, 1, quality === 'high' ? 48 : 24);
  const shardGeometry = new THREE.OctahedronGeometry(.25, 0);
  const geometries = new Set<THREE.BufferGeometry>([plane, sphere, column, ring, shardGeometry]);
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const freedTextures = new Set<THREE.Texture>();
  const cache = new Map<string, { texture?: THREE.Texture; failed: boolean; listeners: ((texture: THREE.Texture | null) => void)[] }>();
  let disposed = false, visualTime = 0;
  const native = !textureSource && typeof document !== 'undefined' ? new THREE.TextureLoader() : null;
  const loader = textureSource ?? (native ? { load: (url: string, loaded: (texture: THREE.Texture) => void, failed: () => void) => { native.load(url, loaded, undefined, failed); } } : null);
  const paint = (color: string, opacity = 1) => {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    materials.add(material); return material;
  };
  const stone = paint('#1c2029'), silver = paint('#aebbd2', .6), bronze = paint('#d6a35b');
  const mesh = <M extends THREE.Material>(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: M, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); object.scale.set(sx, sy, sz); parent.add(object); return object;
  };
  const freeTexture = (texture: THREE.Texture) => { if (!freedTextures.has(texture)) { freedTextures.add(texture); texture.dispose(); } };
  const requestTexture = (url: string, callback: (texture: THREE.Texture | null) => void) => {
    const existing = cache.get(url);
    if (existing) { if (existing.texture || existing.failed) callback(existing.texture ?? null); else existing.listeners.push(callback); return; }
    const entry: { texture?: THREE.Texture; failed: boolean; listeners: ((texture: THREE.Texture | null) => void)[] } = { failed: false, listeners: [callback] };
    cache.set(url, entry);
    if (!loader) { entry.failed = true; entry.listeners.splice(0).forEach(fn => fn(null)); return; }
    loader.load(url, texture => {
      if (disposed) { freeTexture(texture); return; }
      texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = quality === 'high' ? 4 : 1;
      textures.add(texture); entry.texture = texture; entry.listeners.splice(0).forEach(fn => fn(texture));
    }, () => { if (!disposed) { entry.failed = true; entry.listeners.splice(0).forEach(fn => fn(null)); } });
  };
  const artwork = (parent: THREE.Object3D, name: string, width: number, height: number, x: number, y: number, z: number) => {
    const material = paint('#ffffff'); material.alphaTest = .025;
    const object = mesh(parent, plane, material, x, y, z, width, height, 1); object.visible = false;
    object.name = name; const status = { ready: false, failed: false };
    requestTexture(`/assets/logos/${name}.svg`, texture => { if (disposed) return; status.ready = !!texture; status.failed = !texture; if (texture) { material.map = texture; material.needsUpdate = true; } });
    return { object, material, status };
  };
  const fallbackFigure = (parent: THREE.Object3D, height: number, seated = false) => {
    const fallback = new THREE.Group(); parent.add(fallback);
    mesh(fallback, sphere, stone, 0, height * .87, -.04, height * .09, height * .12, height * .07);
    mesh(fallback, column, stone, 0, height * .5, -.04, height * .17, height * .55, height * .1);
    for (const sign of [-1, 1]) {
      mesh(fallback, sphere, stone, sign * height * .17, height * .49, -.03, height * .06, height * .27, height * .07);
      if (seated) mesh(fallback, sphere, stone, sign * height * .1, height * .23, height * .05, height * .09, height * .18, height * .1);
    }
    const crown = mesh(fallback, ring, bronze, 0, height * .93, -.02, height * .14, height * .14, 1);
    crown.rotation.x = .2; return fallback;
  };
  const giant = new THREE.Group(); giant.name = 'Logos-giant-vector-parts'; root.add(giant);
  const fallback = fallbackFigure(giant, 20);
  const parts = giantParts.map(def => {
    const pivot = new THREE.Group(); pivot.name = `Logos-pivot-${def.name}`; giant.add(pivot);
    pivot.position.set(def.x, def.y, 0);
    const art = artwork(pivot, `giant-${def.name}`, 605 / 840 * 20, 20, -def.x, 10 - def.y, def.layer);
    return { ...def, pivot, art };
  });
  const headTarget = new THREE.Group(); headTarget.name = 'Logos-head-target'; headTarget.userData.enemyId = 'boss'; giant.add(headTarget);
  headTarget.position.set(-.2, 17.3, .2); targets.set('boss', headTarget); targets.set('head', headTarget);
  const headRing = mesh(headTarget, ring, paint('#a8ddff', .65), 0, 0, .06, 1.15, 1.15, 1);
  const hands = [-1, 1].map((sign, index) => {
    const id = index === 0 ? 'left-hand' : 'right-hand';
    const anchor = new THREE.Group(); anchor.name = `Logos-${id}-target`; anchor.userData.enemyId = id; root.add(anchor); targets.set(id, anchor);
    targets.set(`echo-${index}`, anchor); // Older Logos saves used these IDs.
    const palm = new THREE.Group(); palm.name = `Logos-${id}-art`; anchor.add(palm); palm.position.y = 3.6;
    const artX = index === 0 ? -5.1 : 3.3, artY = index === 0 ? 8.6 : 3.6;
    const art = artwork(palm, `giant-hand-screen-${index === 0 ? 'left' : 'right'}`, 605 / 840 * 20, 20, -artX, 10 - artY, .08);
    const silhouette = mesh(palm, sphere, stone, 0, 0, -.05, 1.2, 1.6, .3);
    const marker = mesh(anchor, ring, paint('#d9b879', .7), 0, .08, 0, 2.1, 2.1, 1); marker.rotation.x = -Math.PI / 2;
    const shoulder = mesh(root, column, silver, 0, 0, 0, .22, 1, .22);
    return { id, sign, index, anchor, palm, art, silhouette, marker, shoulder };
  });
  const sentinels = sentinelNames.map((name, i) => {
    const anchor = new THREE.Group(); anchor.name = `Logos-sentinel-${i}`; anchor.userData.enemyId = `sentinel-${i}`; root.add(anchor); targets.set(`sentinel-${i}`, anchor);
    const dormant = artwork(anchor, `sentinel-${name}`, 2.25, 3.4, 0, 1.7, 0);
    const rush = artwork(anchor, rushNames[i % 3], 4, 3.3, 0, 1.65, .03);
    const silhouette = fallbackFigure(anchor, 3.4, true);
    const marker = mesh(anchor, ring, paint('#c99d65', .5), 0, .06, 0, 1.2, 1.2, 1); marker.rotation.x = -Math.PI / 2;
    return { anchor, dormant, rush, silhouette, marker, angle: i / 6 * Math.PI * 2 };
  });
  const shardPaint = paint('#ddc18f', .8);
  const shards = new THREE.InstancedMesh(shardGeometry, shardPaint, quality === 'high' ? 36 : 20); shards.name = 'Logos-coherence-fragments'; root.add(shards);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler();
  const start = new THREE.Vector3(), end = new THREE.Vector3(), direction = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const reset = () => { visualTime = 0; root.visible = false; shards.visible = false; };
  return {
    root,
    targets,
    reset,
    update(dt: number, state: LogosVisualState, reducedMotion = false, selectedTarget: string | null = null) {
      if (disposed) return;
      visualTime += Number.isFinite(dt) && dt > 0 ? Math.min(dt, .1) : 0;
      const stage = state.logos?.stage ?? (state.encounter === 'logos' ? 'giant' : 'none');
      const elapsed = Math.max(0, state.logos?.elapsed ?? visualTime);
      root.visible = state.encounter === 'logos' && stage !== 'none' && stage !== 'escaped';
      const collapse = stage === 'collapse' ? Math.min(1, elapsed / 6) : 0;
      stone.opacity = 1 - collapse; bronze.opacity = 1 - collapse; silver.opacity = .6 * (1 - collapse);
      giant.visible = stage === 'giant' || stage === 'collapse'; giant.position.set(state.boss.x, -collapse * 5, state.boss.z);
      fallback.visible = !parts.every(part => part.art.status.ready);
      parts.forEach((part, index) => {
        part.art.object.visible = part.art.status.ready;
        part.art.material.opacity = 1 - collapse;
        part.pivot.position.set(part.x + (reducedMotion ? 0 : (index % 2 ? -1 : 1) * collapse * 1.5), part.y - (reducedMotion ? 0 : collapse * index * .2), 0);
        part.pivot.rotation.z = reducedMotion ? 0 : part.name === 'head' ? (state.boss.stunRemaining > 0 ? -.05 : Math.sin(visualTime * .5) * .015) - collapse * .25 : 0;
      });
      headRing.visible = stage === 'giant'; headRing.material.opacity = selectedTarget === 'boss' || selectedTarget === 'head' ? 1 : .35;
      hands.forEach(hand => {
        const enemy = state.enemies.find(enemy => enemy.id === hand.id || enemy.id === `echo-${hand.index}`);
        hand.anchor.visible = giant.visible && (!!enemy || stage === 'collapse');
        hand.anchor.position.set(enemy?.x ?? state.boss.x + hand.sign * 7, -collapse * 3, enemy?.z ?? state.boss.z + 5);
        hand.art.object.visible = hand.art.status.ready; hand.silhouette.visible = !hand.art.status.ready;
        hand.art.material.opacity = (enemy && enemy.hp <= 0 ? .22 : 1) * (1 - collapse);
        const attack = enemy && enemy.hp > 0 && enemy.stunRemaining <= 0 && enemy.attackTimer < 1.1;
        hand.palm.position.y = 3.6 + (reducedMotion ? 0 : attack ? Math.sin((1.1 - Math.max(0, enemy!.attackTimer)) / 1.1 * Math.PI) * 2 : Math.sin(visualTime + hand.index) * .12);
        hand.palm.rotation.z = reducedMotion ? 0 : attack ? hand.sign * .15 : 0;
        hand.marker.visible = stage === 'giant' && !!enemy && enemy.hp > 0;
        hand.marker.material.opacity = selectedTarget === hand.id || selectedTarget === `echo-${hand.index}` ? 1 : attack ? .9 : .42;
        hand.marker.material.color.set(attack ? '#ffab82' : '#d9b879');
        hand.shoulder.visible = giant.visible && collapse < 1;
        start.set(state.boss.x + hand.sign * 3.6, 13 - collapse * 5, state.boss.z);
        end.set(hand.anchor.position.x, hand.anchor.position.y + hand.palm.position.y, hand.anchor.position.z);
        direction.copy(end).sub(start); hand.shoulder.position.copy(start).add(end).multiplyScalar(.5);
        hand.shoulder.scale.y = direction.length(); hand.shoulder.quaternion.setFromUnitVectors(up, direction.normalize());
      });
      sentinels.forEach((sentinel, i) => {
        const enemy = state.enemies.find(enemy => enemy.id === `sentinel-${i}`);
        const waiting = stage === 'descent';
        sentinel.anchor.visible = waiting || stage === 'sentinels' && !!enemy && enemy.hp > 0;
        const x = waiting ? Math.sin(sentinel.angle) * 18 : enemy?.x ?? 0, z = waiting ? Math.cos(sentinel.angle) * 18 : enemy?.z ?? 0;
        sentinel.anchor.position.set(x, 0, z);
        const target = enemy && state.party[enemy.target];
        sentinel.anchor.rotation.y = Math.atan2((target?.x ?? 0) - x, (target?.z ?? 0) - z);
        const awake = stage === 'sentinels' && elapsed > .35 + i * .16;
        sentinel.dormant.object.visible = !awake && sentinel.dormant.status.ready;
        sentinel.rush.object.visible = awake && sentinel.rush.status.ready;
        sentinel.silhouette.visible = awake ? !sentinel.rush.status.ready : !sentinel.dormant.status.ready;
        sentinel.marker.visible = awake;
        sentinel.marker.material.opacity = selectedTarget === `sentinel-${i}` ? 1 : .4;
        sentinel.rush.object.position.y = 1.65 + (reducedMotion ? 0 : i % 3 === 1 && enemy && enemy.attackTimer < .8 ? Math.sin(visualTime * 8) ** 2 * .6 : 0);
      });
      shards.visible = stage === 'collapse'; shardPaint.opacity = .8 * (1 - collapse);
      if (shards.visible) {
        for (let i = 0; i < shards.count; i++) {
          const a = i * 2.399963;
          position.set(state.boss.x + Math.sin(a) * (2 + collapse * 7), 1 + i % 12 - collapse * (3 + i % 6), state.boss.z + Math.cos(a) * (1 + collapse * 4));
          scale.setScalar(.4 + i % 4 * .25); quaternion.setFromEuler(euler.set(reducedMotion ? 0 : elapsed * .3 + i, i, i * .7));
          matrix.compose(position, quaternion, scale); shards.setMatrixAt(i, matrix);
        }
        shards.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent();
      cache.forEach(entry => { entry.listeners.length = 0; });
      textures.forEach(freeTexture); materials.forEach(material => material.dispose()); geometries.forEach(geometry => geometry.dispose()); shards.dispose(); targets.clear();
    },
  };
}
