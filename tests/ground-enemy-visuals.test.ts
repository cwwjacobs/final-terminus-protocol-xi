import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGroundEnemyVisuals } from '../components/game/ground-enemy-visuals.ts';
import { createGame } from '../game/engine.ts';

function fixture() {
  const scene = new THREE.Scene(), visual = createGroundEnemyVisuals(scene, 'low');
  const state = createGame(); state.status = 'fighting';
  state.enemies = [{ id: 'ground-0-0', name: 'Ground shard', kind: 'ground-shard', x: 3, z: 4, spawnX: 3, spawnZ: 4, hp: 1000, maxHp: 1000, target: 0, attackTimer: 3, stunRemaining: 0, burn: null, emergeRemaining: 3 }];
  return { scene, visual, state };
}

test('lightning warning precedes rising stone and uses the authoritative strike origin', () => {
  const { visual, state } = fixture(); const original = structuredClone(state);
  visual.update(.05, state);
  assert.deepEqual(state, original, 'visuals cannot mutate the shared simulation');
  const focus = visual.targets.get('ground-0-0')!;
  const anchor = focus.parent!.parent!;
  assert.equal(anchor.position.x, 3); assert.equal(anchor.position.z, 4);
  assert.equal(anchor.getObjectByName('ground-body')!.visible, false);
  const scar = visual.root.getObjectByName('ground-strike-origin')!;
  assert.equal(scar.getObjectByName('ground-lightning-warning')!.visible, true);
  assert.equal(scar.getObjectByName('ground-lightning-strike')!.visible, false);
  state.enemies[0].emergeRemaining = .6; visual.update(.05, state);
  assert.equal(scar.getObjectByName('ground-lightning-strike')!.visible, true);
  assert.equal(anchor.getObjectByName('ground-body')!.visible, true);
  assert.ok(anchor.getObjectByName('ground-body')!.position.y < 0);
  state.enemies[0].emergeRemaining = 0; state.enemies[0].x = 8;
  visual.update(.05, state);
  assert.equal(scar.getObjectByName('ground-lightning-warning')!.visible, false);
  assert.equal(scar.getObjectByName('ground-lightning-strike')!.visible, false);
  assert.equal(scar.position.x, 3, 'the crack stays where lightning struck');
  assert.ok(anchor.position.x > 3 && anchor.position.x < 8, 'the enemy interpolates toward the next simulation sample');
  assert.equal(anchor.getObjectByName('ground-body')!.position.y >= 0, true);
  const contact = focus.getWorldPosition(new THREE.Vector3());
  assert.equal(contact.x, anchor.position.x); assert.ok(contact.y >= 1.7 && contact.y < 1.8, 'impact focus follows the risen chest');
  visual.dispose();
});

test('ground and storm silhouettes have unique targets and reduced motion suppresses the strike', () => {
  const { visual, state } = fixture();
  state.enemies.push({ ...state.enemies[0], id: 'ground-0-1', kind: 'storm-shard', x: -5, emergeRemaining: .6 });
  visual.update(.05, state, true, 'ground-0-1');
  const meleeFocus = visual.targets.get('ground-0-0')!, stormFocus = visual.targets.get('ground-0-1')!;
  const melee = meleeFocus.parent!.parent!, storm = stormFocus.parent!.parent!;
  assert.notEqual(melee, storm);
  assert.equal(melee.getObjectByName('ground-shard-body')!.visible, true);
  assert.equal(storm.getObjectByName('ground-shard-body')!.visible, false);
  assert.equal(storm.getObjectByName('storm-shard-body')!.visible, true);
  assert.equal(storm.getObjectByName('ground-body')!.position.y, 0);
  assert.equal(stormFocus.getWorldPosition(new THREE.Vector3()).y, 2);
  const core = storm.getObjectByName('storm-shard-core')!;
  const coreScale = core.scale.clone();
  state.enemies[1].emergeRemaining = 0; state.enemies[1].attackTimer = .3; visual.update(.05, state, true);
  assert.deepEqual(core.scale, coreScale, 'reduced motion keeps the attack core stationary');
  storm.traverse(object => assert.equal(object.userData.enemyId, 'ground-0-1'));
  visual.root.traverse(object => { if (object.name === 'ground-lightning-strike') assert.equal(object.visible, false); });
  visual.dispose();
});

test('bounded rigs are reused for new waves and all stale target identities are removed', () => {
  const { visual, scene, state } = fixture();
  let count = 0; scene.traverse(() => count++);
  visual.update(.05, state); const first = visual.targets.get('ground-0-0');
  state.enemies[0].hp = 0; visual.update(.05, state); assert.equal(visual.targets.size, 0); assert.equal(first!.visible, false);
  for (let wave = 1; wave < 20; wave++) {
    state.enemies[0] = { ...state.enemies[0], id: `ground-${wave}-0`, hp: 1000 };
    visual.update(.05, state);
    assert.equal(visual.targets.size, 1); assert.equal(visual.targets.get(`ground-${wave}-0`), first);
  }
  let after = 0; scene.traverse(() => after++); assert.equal(after, count);
  state.encounter = 'logos'; visual.update(.05, state); assert.equal(visual.root.visible, false); assert.equal(visual.targets.size, 0);
  visual.dispose(); visual.dispose(); assert.equal(visual.root.parent, null);
  visual.update(.05, state); assert.equal(visual.targets.size, 0);
});

test('ground movement and walking continue between snapshots without changing simulation positions', () => {
  const { visual, state } = fixture(); state.enemies[0].emergeRemaining = 0;
  visual.update(1/60, state);
  const anchor = visual.targets.get('ground-0-0')!.parent!.parent!;
  const body = anchor.getObjectByName('ground-body')!;
  state.enemies[0].x += .4;
  const snapshot = structuredClone(state), positions: number[] = [], bobs: number[] = [];
  for (let frame=0;frame<6;frame++) { visual.update(1/60,state); positions.push(anchor.position.x); bobs.push(body.position.y); }
  assert.ok(positions.every((x,i)=>x>3 && x<3.4 && (!i || x>positions[i-1])));
  assert.ok(new Set(bobs).size > 3, 'the stride animates across the 100ms snapshot gap');
  const position = anchor.position.clone(); visual.update(0,state); assert.deepEqual(anchor.position,position);
  for(let frame=0;frame<60;frame++)visual.update(1/60,state);
  assert.ok(Math.abs(anchor.position.x-3.4)<.0001);
  assert.deepEqual(state,snapshot);
  visual.dispose();
});
