import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createDarkStatues } from '../components/game/dark-statues.ts';
import { createGame } from '../game/engine.ts';

function fixture(quality: 'low' | 'high') {
  const scene = new THREE.Scene(), state = createGame();
  const visual = createDarkStatues(scene, quality);
  const motes = visual.root.getObjectByName('inward-energy') as THREE.InstancedMesh;
  state.status = 'fighting'; state.time = 1; state.combatTime = 1;
  state.enemies = [{ id: 'ground-1-0', name: 'Ground shard', kind: 'ground-shard', x: 3, z: 4, spawnX: 3, spawnZ: 4, hp: 1000, maxHp: 1000, target: 0, attackTimer: 3, stunRemaining: 0, burn: null, emergeRemaining: 0 }];
  let matrixWrites = 0, colorWrites = 0;
  const setMatrix = motes.setMatrixAt.bind(motes), setColor = motes.setColorAt.bind(motes);
  motes.setMatrixAt = (index, matrix) => { matrixWrites++; setMatrix(index, matrix); };
  motes.setColorAt = (index, color) => { colorWrites++; setColor(index, color); };
  const tick = (reducedMotion = false) => {
    state.time += 1 / 60; state.combatTime += 1 / 60;
    visual.update(1 / 60, state, reducedMotion);
  };
  return { visual, state, motes, tick, counts: () => ({ matrixWrites, colorWrites }) };
}

test('idle statue particles do not rewrite matrices or dirty either GPU buffer', () => {
  for (const quality of ['low', 'high'] as const) {
    const f = fixture(quality), matrixVersion = f.motes.instanceMatrix.version, colorVersion = f.motes.instanceColor!.version;
    for (let i = 0; i < 600; i++) f.tick();
    assert.deepEqual(f.counts(), { matrixWrites: 0, colorWrites: 0 });
    assert.equal(f.motes.instanceMatrix.version, matrixVersion);
    assert.equal(f.motes.instanceColor!.version, colorVersion);
    assert.equal(f.motes.visible, false);
    f.visual.dispose();
  }
});

test('one active trail updates only its slots, keeps its palette, and clears once on expiry', () => {
  for (const quality of ['low', 'high'] as const) {
    const f = fixture(quality), perTrail = quality === 'high' ? 24 : 14;
    const palette = Array.from(f.motes.instanceColor!.array), colorVersion = f.motes.instanceColor!.version;
    f.tick(); f.state.enemies[0].hp = 0; f.tick();
    assert.equal(f.visual.stats().activeTrails, 1);
    assert.deepEqual(f.counts(), { matrixWrites: perTrail, colorWrites: 0 });
    assert.equal(f.motes.visible, true);
    // Switching reduced motion while a trail is live must hide its extra motes.
    f.tick(true);
    const matrix = new THREE.Matrix4(), scale = new THREE.Vector3();
    for (let i = 2; i < f.motes.count; i++) {
      f.motes.getMatrixAt(i, matrix); scale.setFromMatrixScale(matrix);
      assert.deepEqual(scale.toArray(), [0, 0, 0]);
    }
    for (let i = 0; i < 180; i++) f.tick();
    assert.equal(f.visual.stats().activeTrails, 0);
    assert.equal(f.motes.visible, false);
    for (let i = 0; i < f.motes.count; i++) {
      f.motes.getMatrixAt(i, matrix); scale.setFromMatrixScale(matrix);
      assert.deepEqual(scale.toArray(), [0, 0, 0]);
    }
    const counts = f.counts(), matrixVersion = f.motes.instanceMatrix.version;
    for (let i = 0; i < 120; i++) f.tick();
    assert.deepEqual(f.counts(), counts);
    assert.equal(f.motes.instanceMatrix.version, matrixVersion);
    assert.equal(f.motes.instanceColor!.version, colorVersion);
    assert.deepEqual(Array.from(f.motes.instanceColor!.array), palette);
    f.visual.dispose();
  }
});

test('reset clears every previously occupied slot before another trail can show', () => {
  const f = fixture('high'); f.tick();
  // Fill several slots so reusing one after reset cannot hide a stale sibling.
  for (let i = 0; i < 5; i++) {
    f.state.enemies[0] = { ...f.state.enemies[0], id: `ground-${i}`, hp: 1000 }; f.tick();
    f.state.enemies[0].hp = 0; f.tick();
  }
  assert.equal(f.visual.stats().activeTrails, 5);
  f.visual.reset(); f.tick();
  const counts = f.counts(); f.tick(); assert.deepEqual(f.counts(), counts);
  f.state.enemies[0] = { ...f.state.enemies[0], id: 'after-reset', hp: 1000 }; f.tick();
  f.state.enemies[0].hp = 0; f.tick();
  assert.equal(f.visual.stats().activeTrails, 1);
  const matrix = new THREE.Matrix4(), scale = new THREE.Vector3();
  for (let i = 24; i < f.motes.count; i++) {
    f.motes.getMatrixAt(i, matrix); scale.setFromMatrixScale(matrix);
    assert.deepEqual(scale.toArray(), [0, 0, 0]);
  }
  f.visual.dispose();
});
