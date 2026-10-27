import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGame } from '../game/engine.ts';
import { ActorAssets, createActor } from '../components/game/actors.ts';
import { createDivinePresentation } from '../components/game/divine-visuals.ts';
import { combatSound } from '../components/game/combat-audio.ts';

function fixture() {
  const state = createGame(); const scene = new THREE.Scene(); const assets = new ActorAssets();
  const rigs = state.party.map(a => { const rig = createActor(assets, a.role, a.color); scene.add(rig.root); return rig; });
  return { state, scene, rigs, effects: createDivinePresentation(scene, rigs, 'low') };
}

test('Fission displays a joined atom then two separating nuclei; renderer reads state without changing it', () => {
  const { state, scene, effects } = fixture(), before = structuredClone(state);
  effects.event({ id: 1, time: 0, kind: 'ability', text: '', source: 'fission', actor: 3 }, state);
  const atom = scene.getObjectByName('Fission-splitting-atom')!;
  effects.update(.1, state, 0, false); assert.ok(atom.visible);
  const nuclei = atom.children.filter(child => child instanceof THREE.Group);
  assert.equal(nuclei.length, 2);
  const initialSeparation = nuclei[0].position.distanceTo(nuclei[1].position);
  for (let i = 0; i < 20; i++) effects.update(.1, state, i * .1, false);
  assert.ok(nuclei[0].position.distanceTo(nuclei[1].position) > initialSeparation + 5);
  assert.deepEqual(state, before);
  effects.reset(); assert.equal(atom.visible, false);
});

test('Zeus adds an aura to the animated hero; repeated effects keep a fixed scene size', () => {
  const { state, scene, effects } = fixture();
  state.encounter = 'logos'; state.ultimatesUnlocked = true; state.party[1].sonOfZeus = true;
  effects.update(.05, state, 1, false);
  assert.equal(scene.getObjectByName('Logos-black-marble'), undefined, 'no duplicate primitive Logos is retained'); assert.ok(effects.zeus.visible);
  assert.equal(effects.zeus.children.filter(child => child instanceof THREE.Mesh).length, 1, 'the aura has no replacement sphere head or cone outfit');
  let originalCount = 0; scene.traverse(() => { originalCount++; });
  for (let i = 0; i < 100; i++) {
    effects.event({ id: i, time: 0, kind: 'ability', text: '', source: i % 2 ? 'rainOfFire' : 'thunderclap', actor: 1 }, state);
    effects.update(.05, state, i * .05, true);
  }
  let finalCount = 0; scene.traverse(() => { finalCount++; }); assert.equal(finalCount, originalCount);
  state.party[1].sonOfZeus = false; effects.update(.05, state, 6, false); assert.equal(effects.zeus.visible, false);
});

test('each ultimate has one group cast sound; recipient fan-out and burn ticks stay quiet', () => {
  for (const source of ['fission', 'rainOfFire', 'fearless', 'rejuvenator', 'thunderclap']) {
    const event = { id: 1, time: 0, kind: 'ability', text: '', source, actor: 0 };
    assert.ok(combatSound(event)); assert.equal(combatSound({ ...event, target: 2 }), null);
  }
  assert.equal(combatSound({ id: 1, time: 0, kind: 'magic', text: '', source: 'rainOfFireBurn' }), null);
});

test('six-enemy Shock and burn effects stay bounded across the sentinel-to-hands transition', () => {
  const { state, scene, effects } = fixture();
  state.encounter = 'logos'; state.logos = { stage: 'sentinels', elapsed: 2 };
  state.enemies = Array.from({ length: 6 }, (_, i) => ({ id: `sentinel-${i}`, name: `Sentinel ${i}`, x: i * 2, z: 0, hp: 1000, maxHp: 1000, target: 1, attackTimer: 2, stunRemaining: 0, burn: { source: 2, total: 300, dealt: 0, ticks: 0, tickIn: 1 } }));
  state.party[1].enemyTarget = 'sentinel-0';
  let before = 0; scene.traverse(() => { before++; });
  effects.event({ id: 1, time: 0, kind: 'ability', text: '', source: 'lightningShock', actor: 1 }, state);
  for (let i = 0; i < 10; i++) effects.update(.05, state, i * .05, false);
  state.logos = { stage: 'giant', elapsed: 0 }; state.enemies = state.enemies.slice(0, 2).map((enemy, i) => ({ ...enemy, id: i ? 'right-hand' : 'left-hand' }));
  effects.update(.05, state, 1, false);
  let after = 0; scene.traverse(() => { after++; }); assert.equal(after, before);
});
