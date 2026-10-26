import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLogosEncounterVisuals, logosSequencePresentation, type LogosTextureLoader, type LogosVisualState } from '../components/game/logos-encounter-visuals.ts';

function fixture() {
  const scene = new THREE.Scene();
  const loaded = new Map<string, (texture: THREE.Texture) => void>();
  const failed = new Map<string, () => void>();
  const loader: LogosTextureLoader = { load(url, ok, no) { loaded.set(url, ok); failed.set(url, no); } };
  const visual = createLogosEncounterVisuals(scene, 'low', loader);
  const state: LogosVisualState = {
    encounter: 'logos', logos: { stage: 'descent', elapsed: 10 },
    boss: { x: 0, z: -12, hp: 10000, stunRemaining: 0 },
    party: [{ x: 0, z: 2, hp: 1000 }], enemies: [],
  };
  return { scene, visual, state, loaded, failed };
}

test('six dormant statues awaken into their real positions without mutating the snapshot', () => {
  const { visual, state, loaded } = fixture();
  assert.equal(loaded.size, 17, 'eight giant parts, six dormant statues and three shared rush poses');
  const original = structuredClone(state);
  visual.update(.05, state, false);
  for (let i = 0; i < 6; i++) {
    const statue = visual.targets.get(`sentinel-${i}`)!;
    assert.ok(statue.visible); assert.ok(Math.abs(Math.hypot(statue.position.x, statue.position.z) - 18) < 1e-8);
  }
  assert.deepEqual(state, original);
  state.logos = { stage: 'sentinels', elapsed: 3 };
  state.enemies = Array.from({ length: 6 }, (_, i) => ({ id: `sentinel-${i}`, x: i - 3, z: i, hp: i === 5 ? 0 : 100, target: 0, attackTimer: 2, stunRemaining: 0 }));
  visual.update(.05, state, false, 'sentinel-2');
  assert.equal(visual.targets.get('sentinel-2')!.position.x, -1);
  assert.equal(visual.targets.get('sentinel-5')!.visible, false);
  assert.equal(visual.root.getObjectByName('Logos-giant-vector-parts')!.visible, false);
  visual.dispose();
});

test('head and each hand are separate target anchors and full-canvas maps remain articulated', () => {
  const { visual, state, loaded } = fixture();
  for (const callback of loaded.values()) callback(new THREE.Texture());
  state.logos = { stage: 'giant', elapsed: 2 };
  state.enemies = [{ id: 'left-hand', x: -5, z: -2, hp: 100, target: 0, attackTimer: .6, stunRemaining: 0 }, { id: 'right-hand', x: 8, z: -4, hp: 100, target: 0, attackTimer: 3, stunRemaining: 0 }];
  visual.update(.05, state, false, 'left-hand');
  assert.notEqual(visual.targets.get('left-hand'), visual.targets.get('right-hand'));
  assert.notEqual(visual.targets.get('head'), visual.targets.get('left-hand'));
  assert.equal(visual.targets.get('head'), visual.targets.get('boss'));
  assert.equal(visual.targets.get('left-hand')!.position.x, -5);
  assert.equal(visual.targets.get('right-hand')!.position.x, 8);
  assert.ok(visual.root.getObjectByName('giant-head')!.visible);
  assert.ok(visual.root.getObjectByName('giant-hand-screen-left')!.visible);
  assert.ok(visual.root.getObjectByName('Logos-left-hand-art')!.position.y > 3.6);
  state.enemies[0].x = -2; visual.update(.05, state, true);
  assert.equal(visual.targets.get('left-hand')!.position.x, -2);
  assert.equal(visual.root.getObjectByName('Logos-left-hand-art')!.position.y, 3.6);
  visual.dispose();
});

test('collapse has bounded reusable fragments, then escaped stage hides Logos', () => {
  const { visual, scene, state } = fixture(); let before = 0; scene.traverse(() => { before++; });
  state.logos = { stage: 'collapse', elapsed: 3 };
  for (let i = 0; i < 100; i++) visual.update(.05, state, false);
  assert.ok(visual.root.getObjectByName('Logos-coherence-fragments')!.visible);
  assert.equal(visual.root.getObjectByName('Logos-giant-vector-parts')!.position.y, -2.5);
  let after = 0; scene.traverse(() => { after++; }); assert.equal(after, before);
  state.logos = { stage: 'escaped', elapsed: 0 }; visual.update(.05, state, false); assert.equal(visual.root.visible, false);
  visual.reset(); assert.equal(visual.root.visible, false); visual.dispose();
});

test('asset failures retain silhouettes and late loads after disposal release their textures', () => {
  const { visual, state, loaded, failed } = fixture();
  failed.get('/assets/logos/giant-head.svg')!();
  state.logos = { stage: 'giant', elapsed: 0 }; visual.update(.05, state, false);
  assert.equal(visual.root.getObjectByName('giant-head')!.visible, false);
  const giant = visual.root.getObjectByName('Logos-giant-vector-parts')!;
  assert.ok(giant.children[0].visible, 'procedural silhouette survives a missing map');
  visual.dispose(); visual.dispose();
  const texture = new THREE.Texture(); let releases = 0; texture.addEventListener('dispose', () => { releases++; });
  loaded.get('/assets/logos/giant-body.svg')!(texture); loaded.get('/assets/logos/giant-body.svg')!(texture);
  assert.equal(releases, 1); assert.equal(visual.targets.size, 0);
  visual.update(.05, state, false); assert.equal(visual.root.parent, null);
});


test('sequence presentation moves architecture through a minute, collapses the floor and recalls heroes without changing state', () => {
  const { state, visual } = fixture();
  const before = structuredClone(state); const middle = logosSequencePresentation(state);
  assert.equal(middle.descentHeight, 10); assert.equal(middle.actorY, 0); assert.equal(middle.floorY, 0);
  assert.deepEqual(state, before);
  state.logos = { stage: 'sentinels', elapsed: 0 }; assert.equal(logosSequencePresentation(state).descentHeight, 60);
  state.logos = { stage: 'collapse', elapsed: 1 }; const falling = logosSequencePresentation(state);
  assert.ok(falling.floorY < falling.actorY && falling.actorY < 0); assert.ok(falling.floorScale < 1); assert.ok(falling.floorOpacity < 1);
  state.logos.elapsed = 5; const recall = logosSequencePresentation(state); assert.ok(recall.actorY > 0); assert.ok(recall.escapeOpacity > .5); assert.equal(recall.floorVisible, false);
  state.logos = { stage: 'escaped', elapsed: 0 }; const escaped = logosSequencePresentation(state); assert.equal(escaped.floorVisible, false); assert.equal(escaped.actorY, 12);
  state.encounter = 'crown'; const reset = logosSequencePresentation(state); assert.equal(reset.descentHeight, 0); assert.equal(reset.floorY, 0); assert.equal(reset.actorY, 0); assert.equal(reset.floorVisible, true); assert.equal(reset.floorOpacity, 1);
  visual.dispose();
});
