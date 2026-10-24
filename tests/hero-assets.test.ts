import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HERO_ANIMATION_LIBRARY, HERO_ASSET_MANIFEST, HeroAssetCache, type HeroAssetSource, type HeroVisual } from '../components/game/hero-assets.ts';

const near = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function disposalCount(resource: THREE.BufferGeometry | THREE.Material | THREE.Texture) {
  let count = 0;
  resource.addEventListener('dispose', () => { count++; });
  return () => count;
}

function fixture() {
  const scene = new THREE.Group();
  scene.name = 'painted-hero';
  const pelvis = new THREE.Bone(); pelvis.name = 'pelvis';
  const spine = new THREE.Bone(); spine.name = 'spine_01'; spine.position.y = 1;
  pelvis.add(spine); scene.add(pelvis);
  const skeleton = new THREE.Skeleton([pelvis, spine]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.2, 0, 0, .2, 0, 0, 0, 1.8, 0,
    -.2, 0, .1, .2, 0, .1, 0, 1.8, .1,
  ], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([
    0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0,
  ], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
    1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0,
  ], 4));
  geometry.addGroup(0, 3, 0); geometry.addGroup(3, 3, 1);
  let bitmapCloses = 0;
  const bitmap = { width: 2, height: 2, [Symbol.toStringTag]: 'ImageBitmap', close() { bitmapCloses++; } };
  const texture = new THREE.Texture(bitmap as unknown as ImageBitmap);
  texture.colorSpace = THREE.SRGBColorSpace;
  const normal = new THREE.Texture(bitmap as unknown as ImageBitmap);
  const paint = new THREE.MeshStandardMaterial({ map: texture, normalMap: normal, roughness: .71, color: '#b9a37c' });
  const trim = new THREE.MeshStandardMaterial({ map: texture, metalness: .42, color: '#46597c' });
  const body = new THREE.SkinnedMesh(geometry, [paint, trim]); body.name = 'body';
  const detail = new THREE.SkinnedMesh(geometry, paint); detail.name = 'detail'; detail.position.z = .2;
  scene.add(body, detail); scene.updateMatrixWorld(true);
  body.bind(skeleton); detail.bind(skeleton);
  const animations = [
    new THREE.AnimationClip('idle', 2, [new THREE.NumberKeyframeTrack('spine_01.position[x]', [0, 2], [0, 0])]),
    new THREE.AnimationClip('walk', 1, [new THREE.NumberKeyframeTrack('spine_01.position[x]', [0, 1], [1, 1])]),
  ];
  const asset: HeroAssetSource = { scene, scenes: [scene], animations };
  return { asset, skeleton, geometry, texture, normal, paint, trim, spine, bitmapCloses: () => bitmapCloses };
}

const bodyOf = (visual: HeroVisual) => visual.object.getObjectByName('body') as THREE.SkinnedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial[]>;
const spineOf = (visual: HeroVisual) => visual.object.getObjectByName('spine_01') as THREE.Bone;
const motionOf = (visual: HeroVisual) => visual.object.children[0];

function animationFixture() {
  const source = fixture();
  const hand = new THREE.Bone(); hand.name = 'hand_R';
  source.spine.add(hand);
  const library: HeroAssetSource = {
    scene: new THREE.Group(),
    animations: [new THREE.AnimationClip('Melee_2H_Attack_Slice', 1, [
      new THREE.QuaternionKeyframeTrack('hand_R.quaternion', [0, 1], [
        0, 0, 0, 1, 0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8),
      ]),
    ])],
  };
  return { source, library };
}

test('the checked-in placeholder library and unfitted props stay disabled by default', async () => {
  const { source, library } = animationFixture();
  let requests = 0;
  const cache = new HeroAssetCache(async () => source.asset, {
    library: async () => { requests++; return library; },
  });
  try {
    const hero = await cache.load('heracles');
    assert.equal(requests, 0, 'the placeholder file is not requested');
    assert.equal((await cache.loadLibrary()).size, 0);
    assert.equal(hero.object.getObjectByName('prop:hand_R'), undefined);
    assert.equal(hero.playCombat({ kind: 'auto', text: 'Strike' }), 0);
    hero.update(.2, 3, true, 0);
    assert.ok(spineOf(hero).position.x > .8, 'existing walk animation remains active');
  } finally { cache.dispose(); }
});

test('explicit placeholder preview shares one library load but isolates actions and props', async () => {
  const { source, library } = animationFixture();
  const urls: string[] = [];
  const cache = new HeroAssetCache(async () => source.asset, {
    library: async url => { urls.push(url); return library; },
    allowPlaceholderLibrary: true,
  });
  try {
    const [a, b, c] = await Promise.all([cache.load('heracles'), cache.load('heracles'), cache.load('hecate')]);
    assert.deepEqual(urls, [HERO_ANIMATION_LIBRARY]);
    for (const hero of [a, b, c]) assert.ok(hero.object.getObjectByName('prop:hand_R'));
    assert.notEqual(a.object.getObjectByName('prop:hand_R'), b.object.getObjectByName('prop:hand_R'));
    assert.ok(a.playCombat({ kind: 'auto', text: 'Strike' }) > 0);
    a.update(.2, 0, true, 0);
    const handA = a.object.getObjectByName('hand_R')!, handB = b.object.getObjectByName('hand_R')!;
    assert.ok(handA.quaternion.angleTo(new THREE.Quaternion()) > .01);
    assert.ok(handB.quaternion.equals(new THREE.Quaternion()), 'one hero does not animate another');
    assert.ok(source.asset.scene.getObjectByName('hand_R')!.quaternion.equals(new THREE.Quaternion()));
  } finally { cache.dispose(); }
});

test('a disabled library overrides explicit placeholder preview', async () => {
  const { source } = animationFixture();
  const cache = new HeroAssetCache(async () => source.asset, { library: false, allowPlaceholderLibrary: true });
  try {
    assert.equal((await cache.loadLibrary()).size, 0);
    const hero = await cache.load('heracles');
    assert.equal(hero.object.getObjectByName('prop:hand_R'), undefined);
  } finally { cache.dispose(); }
});

test('synchronous and asynchronous animation library failures preserve the hero fallback', async t => {
  const warnings = t.mock.method(console, 'warn', () => {});
  for (const synchronous of [true, false]) {
    const { source } = animationFixture();
    let requests = 0;
    const cache = new HeroAssetCache(async () => source.asset, {
      library: () => {
        requests++;
        if (synchronous) throw new Error('loader failed before returning');
        return Promise.reject(new Error('library transfer failed'));
      },
      allowPlaceholderLibrary: true,
    });
    try {
      const hero = await cache.load('heracles');
      await cache.load('hecate');
      assert.equal(requests, 1, 'a failed shared request is not retried for every hero');
      assert.equal(hero.object.getObjectByName('prop:hand_R'), undefined);
      assert.equal(hero.playCombat({ kind: 'auto', text: 'Strike' }), 0);
      hero.update(.2, 3, true, 0);
      assert.ok(spineOf(hero).position.x > .8);
    } finally { cache.dispose(); }
  }
  assert.equal(warnings.mock.callCount(), 2);
});

test('an animation library arriving after teardown is disposed without reviving a hero', async () => {
  const { source } = animationFixture(), library = fixture(), pending = deferred<HeroAssetSource>();
  const geometry = disposalCount(library.geometry), material = disposalCount(library.paint);
  const cache = new HeroAssetCache(async () => source.asset, {
    library: () => pending.promise, allowPlaceholderLibrary: true,
  });
  const loading = cache.load('heracles');
  const rejected = assert.rejects(loading, /disposed/);
  await Promise.resolve();
  cache.dispose();
  pending.resolve(library.asset);
  await rejected;
  assert.deepEqual([geometry(), material(), library.bitmapCloses()], [1, 1, 1]);
  assert.equal((await cache.loadLibrary()).size, 0);
});

test('five hero identifiers map only to their stable local GLB URLs', () => {
  assert.deepEqual(Object.keys(HERO_ASSET_MANIFEST).sort(), ['ariadne', 'bacchus', 'dolos', 'hecate', 'heracles']);
  for (const [id, url] of Object.entries(HERO_ASSET_MANIFEST)) assert.equal(url, `/assets/models/${id}.glb`);
  assert.ok(Object.isFrozen(HERO_ASSET_MANIFEST));
});

test('concurrent loads parse once but return independent bones, mixers, and material instances', async () => {
  const source = fixture(), pending = deferred<HeroAssetSource>();
  const urls: string[] = [];
  const cache = new HeroAssetCache(url => { urls.push(url); return pending.promise; });
  const first = cache.load('heracles'), second = cache.load('heracles');
  await Promise.resolve();
  assert.deepEqual(urls, ['/assets/models/heracles.glb']);
  pending.resolve(source.asset);
  const [a, b] = await Promise.all([first, second]);
  assert.notEqual(a.object, b.object);
  assert.notEqual(spineOf(a), spineOf(b));
  assert.notEqual(spineOf(a), source.spine);
  assert.notEqual(bodyOf(a).skeleton, bodyOf(b).skeleton);
  assert.equal(bodyOf(a).geometry, source.geometry);
  assert.equal(bodyOf(b).geometry, source.geometry);
  assert.notEqual(bodyOf(a).material[0], bodyOf(b).material[0]);
  assert.notEqual(bodyOf(a).material[0], source.paint);
  a.update(.2, 3, true, 0);
  assert.ok(spineOf(a).position.x > .8);
  assert.equal(spineOf(b).position.x, 0);
  assert.equal(source.spine.position.x, 0);
  const c = await cache.load('heracles');
  assert.equal(urls.length, 1, 'resolved source stays cached');
  assert.notEqual(c.object, a.object);
  cache.dispose();
});

test('failed loads leave caller fallback intact and are retried; unknown IDs never load', async () => {
  const source = fixture(); let attempts = 0;
  const fallback = new THREE.Group(), scene = new THREE.Group(); scene.add(fallback);
  const cache = new HeroAssetCache(async () => {
    if (++attempts === 1) throw new Error('network unavailable');
    return source.asset;
  });
  await assert.rejects(cache.load('dolos'), /network unavailable/);
  assert.equal(fallback.parent, scene);
  const visual = await cache.load('dolos');
  assert.equal(attempts, 2);
  assert.equal(visual.object.parent, null, 'adapter never attaches or removes caller fallback');
  await assert.rejects(cache.load('__proto__'), /Unknown hero/);
  await assert.rejects(cache.load('missing'), /Unknown hero/);
  assert.equal(attempts, 2);
  cache.dispose();
  await assert.rejects(cache.load('dolos'), /disposed/);
  assert.equal(attempts, 2);
});

test('late load after teardown rejects every waiter and releases all delivered resources once', async () => {
  const source = fixture(), pending = deferred<HeroAssetSource>();
  source.skeleton.computeBoneTexture();
  const geometry = disposalCount(source.geometry), texture = disposalCount(source.texture);
  const normal = disposalCount(source.normal), paint = disposalCount(source.paint), trim = disposalCount(source.trim);
  const boneTexture = disposalCount(source.skeleton.boneTexture!);
  const cache = new HeroAssetCache(() => pending.promise);
  const a = cache.load('bacchus'), b = cache.load('bacchus');
  const rejects = [assert.rejects(a, /disposed/), assert.rejects(b, /disposed/)];
  await Promise.resolve();
  cache.dispose(); cache.dispose();
  pending.resolve(source.asset);
  await Promise.all(rejects);
  assert.deepEqual([geometry(), texture(), normal(), paint(), trim(), boneTexture(), source.bitmapCloses()], [1, 1, 1, 1, 1, 1, 1]);
});

test('failed in-flight request after teardown is still a handled rejection', async () => {
  const pending = deferred<HeroAssetSource>();
  const cache = new HeroAssetCache(() => pending.promise);
  const rejected = assert.rejects(cache.load('hecate'), /aborted transfer/);
  await Promise.resolve(); cache.dispose();
  pending.reject(new Error('aborted transfer'));
  await rejected;
});

test('immediate teardown cancels a loader that has not started yet', async () => {
  let requests = 0;
  const cache = new HeroAssetCache(async () => { requests++; return fixture().asset; });
  const loading = cache.load('hecate');
  cache.dispose();
  await assert.rejects(loading, /disposed/);
  assert.equal(requests, 0);
});

test('cache cleanup never calls close on ordinary image-like objects', async () => {
  const source = fixture();
  let closed = 0;
  source.texture.source.data = { width: 2, height: 2, close() { closed++; } };
  source.normal.source.data = source.texture.source.data;
  const cache = new HeroAssetCache(async () => source.asset);
  await cache.load('hecate');
  cache.dispose();
  assert.equal(closed, 0);
});

test('painted textures, material arrays, source dimensions and forward survive cloning and wireframe', async () => {
  const source = fixture(), cache = new HeroAssetCache(async () => source.asset);
  const a = await cache.load('ariadne'), b = await cache.load('ariadne');
  const materials = bodyOf(a).material;
  assert.equal(materials.length, 2);
  assert.equal(materials[0].map, source.texture);
  assert.equal(materials[0].normalMap, source.normal);
  assert.equal(materials[1].map, source.texture);
  assert.equal(materials[0].map?.colorSpace, THREE.SRGBColorSpace);
  assert.equal(materials[0].roughness, .71);
  assert.equal(materials[1].metalness, .42);
  assert.ok(materials[0].color.equals(source.paint.color));
  assert.equal((a.object.getObjectByName('detail') as THREE.Mesh).material, materials[0], 'one clone per source material within an instance');
  a.setWireframe(true);
  assert.ok(materials.every(material => material.wireframe));
  assert.ok(bodyOf(b).material.every(material => !material.wireframe));
  assert.equal(source.paint.wireframe, false);
  assert.equal(source.texture.version, 0, 'wireframe never rewrites painted textures');
  a.setWireframe(false);
  assert.ok(materials.every(material => !material.wireframe));
  assert.deepEqual(a.object.scale.toArray(), [1, 1, 1]);
  assert.equal(a.object.rotation.y, 0);
  near(a.labelHeight, 2.05);
  a.object.traverse(object => { if ((object as THREE.SkinnedMesh).isSkinnedMesh) assert.equal(object.frustumCulled, false); });
  cache.dispose();
});

test('idle/walk uses speed hysteresis and delta-based blending rather than threshold flicker', async () => {
  const source = fixture(), cache = new HeroAssetCache(async () => source.asset);
  const hero = await cache.load('heracles');
  hero.update(.1, .15, true, 0); near(spineOf(hero).position.x, 0);
  hero.update(.1, .21, true, 0);
  const blendStart = spineOf(hero).position.x;
  assert.ok(blendStart > .5 && blendStart < .9, 'transition is blended, not snapped');
  hero.update(.1, .12, true, 0);
  const held = spineOf(hero).position.x;
  assert.ok(held > blendStart, 'speed inside hysteresis band keeps walking');
  hero.update(.1, .07, true, 0);
  assert.ok(spineOf(hero).position.x < held, 'below stop threshold blends toward idle');
  for (let i = 0; i < 5; i++) hero.update(.25, 0, true, 0);
  near(spineOf(hero).position.x, 0);
  cache.dispose();
});

test('blend depends on elapsed time and rejects nonfinite or negative deltas', async () => {
  const source = fixture(), cache = new HeroAssetCache(async () => source.asset);
  const a = await cache.load('heracles'), b = await cache.load('heracles');
  a.update(.1, 3, true, 0); a.update(.1, 3, true, 0);
  b.update(.2, 3, true, 0);
  near(spineOf(a).position.x, spineOf(b).position.x);
  const x = spineOf(a).position.x;
  for (const invalid of [NaN, Infinity, -1, 0]) a.update(invalid, 0, true, .5);
  near(spineOf(a).position.x, x);
  near(motionOf(a).rotation.x, 0);
  a.update(.1, NaN, true, Infinity);
  assert.ok(Number.isFinite(spineOf(a).position.x));
  assert.ok(spineOf(a).position.x < x);
  cache.dispose();
});

test('death freezes authored pose, tips the group, and revival recovers with clean animation', async () => {
  const source = fixture(), cache = new HeroAssetCache(async () => source.asset);
  const hero = await cache.load('heracles');
  hero.update(.2, 3, true, .5);
  const pose = spineOf(hero).position.clone(), height = hero.labelHeight;
  hero.update(.2, 0, false, .5); hero.update(.2, 3, false, .5);
  assert.ok(spineOf(hero).position.equals(pose));
  near(motionOf(hero).rotation.x, 0);
  const fallen = motionOf(hero).rotation.z;
  assert.ok(fallen > 1.3 && fallen < Math.PI * .46, 'dead silhouette falls via the group, not bones');
  assert.equal(hero.object.rotation.z, 0, 'scene-owned actor wrapper stays upright');
  assert.equal(hero.labelHeight, height, 'labels use stable load-time bounds');
  hero.update(.05, 0, true, 0);
  near(spineOf(hero).position.x, 0);
  assert.ok(motionOf(hero).rotation.z > 0 && motionOf(hero).rotation.z < fallen, 'revival eases upright');
  for (let i = 0; i < 8; i++) hero.update(.25, 0, true, 0);
  near(motionOf(hero).rotation.z, 0);
  hero.update(.05, 3, false, 0);
  hero.update(.05, 3, true, 0);
  near(spineOf(hero).position.x, 1);
  cache.dispose();
});

test('attack accent is confined to an inner group and never overwrites imported bone channels', async () => {
  const source = fixture(), cache = new HeroAssetCache(async () => source.asset);
  const a = await cache.load('bacchus'), b = await cache.load('bacchus');
  a.object.position.set(2, 0, 5); a.object.rotation.y = .8;
  a.update(.1, 3, true, .5); b.update(.1, 3, true, 0);
  assert.ok(spineOf(a).position.equals(spineOf(b).position));
  assert.ok(spineOf(a).quaternion.equals(spineOf(b).quaternion));
  near(motionOf(a).rotation.x, -.045); near(motionOf(b).rotation.x, 0);
  assert.deepEqual(a.object.position.toArray(), [2, 0, 5]);
  near(a.object.rotation.y, .8);
  assert.deepEqual(a.object.scale.toArray(), [1, 1, 1]);
  cache.dispose();
});

test('instance disposal frees only owned materials/skeleton textures; cache teardown frees shared resources exactly once', async () => {
  const source = fixture(); source.skeleton.computeBoneTexture();
  const sourceBoneTexture = disposalCount(source.skeleton.boneTexture!);
  const geometry = disposalCount(source.geometry), texture = disposalCount(source.texture);
  const normal = disposalCount(source.normal), paint = disposalCount(source.paint), trim = disposalCount(source.trim);
  const cache = new HeroAssetCache(async () => source.asset);
  // Two different cache entries intentionally share a fixture's resources.
  const a = await cache.load('heracles'), b = await cache.load('bacchus');
  const aMaterial = disposalCount(bodyOf(a).material[0]), bMaterial = disposalCount(bodyOf(b).material[0]);
  bodyOf(a).skeleton.computeBoneTexture(); bodyOf(b).skeleton.computeBoneTexture();
  const aBoneTexture = disposalCount(bodyOf(a).skeleton.boneTexture!), bBoneTexture = disposalCount(bodyOf(b).skeleton.boneTexture!);
  const scene = new THREE.Group(); scene.add(a.object, b.object);
  a.dispose(); a.dispose();
  assert.equal(a.object.parent, null);
  assert.equal(b.object.parent, scene);
  assert.deepEqual([aMaterial(), aBoneTexture(), bMaterial(), bBoneTexture()], [1, 1, 0, 0]);
  assert.deepEqual([geometry(), texture(), normal(), paint(), trim(), sourceBoneTexture(), source.bitmapCloses()], [0, 0, 0, 0, 0, 0, 0]);
  b.update(.1, 3, true, 0);
  assert.ok(spineOf(b).position.x > 0, 'remaining instance still animates');
  cache.dispose(); cache.dispose(); b.dispose(); a.dispose();
  assert.equal(b.object.parent, null);
  assert.deepEqual([aMaterial(), aBoneTexture(), bMaterial(), bBoneTexture()], [1, 1, 1, 1]);
  assert.deepEqual([geometry(), texture(), normal(), paint(), trim(), sourceBoneTexture(), source.bitmapCloses()], [1, 1, 1, 1, 1, 1, 1]);
  const after = spineOf(b).position.clone(); b.update(.1, 0, true, 0);
  assert.ok(spineOf(b).position.equals(after), 'disposed visual update is inert');
});
