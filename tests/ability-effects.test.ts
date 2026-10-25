import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createGame } from '../game/engine.ts';
import { ARENA_RADIUS, CONE_HALF_ANGLE } from '../game/content.ts';
import { abilityEffectLimits, createAbilityEffects, handlesAbilityEffect } from '../components/game/ability-effects.ts';
import type { CombatEvent } from '../components/game/world-feedback.ts';

const cue = (id: number, overrides: Partial<CombatEvent>): CombatEvent => ({ id, time: 0, kind: 'weapon', text: '', actor: 0, ...overrides });
function setup(quality: 'low' | 'high' = 'low') {
  const state = createGame(); state.status = 'fighting';
  state.party.forEach((a, i) => { a.x = i * 3 - 6; a.z = i * 2 - 4; });
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, .1, 100);
  camera.position.set(0, 12, 20); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const fx = createAbilityEffects(scene, quality);
  return { state, scene, camera, fx, root: scene.getObjectByName('ability-effects')! };
}

test('ability VFX pools stay bounded across rapid, overlapping spells and reset without touching combat', () => {
  const { state, scene, camera, fx, root } = setup();
  const original = JSON.stringify(state), count = root.children.length;
  for (let id = 1; id <= 240; id++) {
    const element = (['fire', 'ice', 'lightning'] as const)[id % 3];
    const e = cue(id, { actor: 3, kind: id % 7 === 0 ? 'burst' : 'magic', abilityId: `magic:${element}`, element });
    fx.start(e, state, .3); assert.equal(fx.impact(e, state), true); fx.update(.05, state, camera, id > 150);
    assert.ok(fx.stats().active <= abilityEffectLimits('low').particles);
    assert.ok(fx.stats().activeBolts <= abilityEffectLimits('low').bolts);
    assert.equal(root.children.length, count);
    root.traverse(n => { assert.ok([...n.position, ...n.quaternion, ...n.scale].every(Number.isFinite)); });
  }
  assert.equal(JSON.stringify(state), original);
  fx.reset(); assert.equal(fx.stats().active, 0); assert.equal(fx.stats().activeBolts, 0);
  assert.ok(root.children.every(n => !n.visible)); fx.dispose(); assert.equal(scene.children.length, 0);
});

test('healing effects use the actual recipient and never fabricate a recipient for old events', () => {
  const { state, camera, fx, root } = setup();
  const legacy = cue(1, { kind: 'heal', actor: 4, value: 100 });
  assert.equal(fx.impact(legacy, state), true); assert.equal(fx.stats().active, 0);
  const heal = cue(2, { kind: 'heal', source: 'shimmerWave', actor: 4, target: 0, value: 350 });
  fx.impact(heal, state); fx.update(.05, state, camera, false);
  const particles = root.children.filter(n => n.name.startsWith('vfx-particle:') && n.visible);
  assert.equal(particles.length, 1); assert.equal(particles[0].position.x, state.party[0].x); assert.equal(particles[0].position.z, state.party[0].z);
  assert.notEqual(particles[0].position.x, state.party[4].x);
  fx.impact(heal, state); assert.equal(fx.stats().active, 1, 'duplicate receipt does not duplicate presentation');
  fx.dispose();
});

test('persistent protection, weave, chain and enemy charge match live state and stop on removal', () => {
  const { state, camera, fx, root } = setup();
  state.time = 10; state.party[1].guardUntil = 11; state.party[0].revelryStacks = 2; state.party[4].shieldCharges = 1;
  state.party[3].rapidWeave = { remaining: 5, charges: { fire: 1, ice: 0, lightning: 2 }, refresh: { fire: 0, ice: 0, lightning: 0 } };
  state.burst = { element: 'ice', remaining: 4 };
  state.boss.cast = { name: 'Null Impact', kind: 'circle', x: 0, z: 0, radius: 5, angle: 0, total: 3, remaining: 2 };
  fx.update(.05, state, camera, true);
  for (const name of ['vfx-guard:1', 'vfx-revelry:0', 'vfx-aegis:4', 'vfx-weave:3:0', 'vfx-weave:3:2', 'vfx-chain-seal', 'vfx-boss-charge']) assert.equal(root.getObjectByName(name)?.visible, true, name);
  assert.equal(root.getObjectByName('vfx-weave:3:1')?.visible, false);
  state.time = 12; state.party[0].revelryStacks = 0; state.party[4].shieldCharges = 0;
  state.party[3].hp = 0; state.burst = null; state.boss.cast = null;
  fx.update(.05, state, camera, true);
  for (const name of ['vfx-guard:1', 'vfx-revelry:0', 'vfx-aegis:4', 'vfx-weave:3:0', 'vfx-weave:3:2', 'vfx-chain-seal', 'vfx-boss-charge']) assert.equal(root.getObjectByName(name)?.visible, false, name);
  fx.dispose();
});

test('all current ability families have presentations while storm events keep their existing renderer', () => {
  const { state, camera, fx } = setup('high');
  const events: Partial<CombatEvent>[] = [
    ...(['cleave', 'pierce', 'resonance'] as const).map(weaponId => ({ kind: 'weapon', weaponId })),
    ...(['fire', 'ice', 'lightning'] as const).map(element => ({ kind: 'magic', element, actor: 3 })),
    ...['elementalShot', 'criticalDash', 'splitVolley'].map(source => ({ kind: 'weapon', source, hitIndex: 0, sequenceId: 1 })),
    ...['rapidWeave', 'aegis', 'mendingThread'].map(source => ({ kind: 'ability', source, target: 0 })),
    ...['auto', 'revelry', 'provoke', 'guard', 'dodge', 'hit', 'down', 'revelry_lost', 'cast', 'boss_impact'].map(kind => ({ kind })),
    { kind: 'shimmer_wave', source: 'shimmerWave', actor: 4 }, { kind: 'shield', source: 'aegis', target: 0 },
    { kind: 'heal', target: 1, value: 100 }, { kind: 'chain', element: 'fire' },
  ];
  events.forEach((e, i) => { const event = cue(i + 1, e); assert.equal(handlesAbilityEffect(event), true, JSON.stringify(e)); assert.equal(fx.impact(event, state), true); });
  fx.update(.1, state, camera, false);
  for (const kind of ['static_strike', 'static_discharge', 'static_arc', 'warning', 'victory']) assert.equal(fx.impact(cue(1000, { kind }), state), false);
  fx.dispose();
});

test('boss resolution preserves the captured cone direction and full arena pulse radius', () => {
  const { state, camera, fx, root } = setup();
  state.boss.cast = null;
  const area = { kind: 'cone' as const, x: 2, z: -3, radius: 9, angle: .8, total: 2 };
  fx.impact(cue(1, { kind: 'boss_impact', area }), state); fx.update(.05, state, camera, false);
  const sector = root.children.find(n => n instanceof THREE.Mesh && n.visible && n.position.y === .105) as THREE.Mesh;
  assert.ok(sector); assert.equal(sector.position.x, area.x); assert.equal(sector.position.z, area.z);
  assert.equal(sector.rotation.y, area.angle); assert.equal(sector.scale.x, area.radius);
  const vertices = sector.geometry.getAttribute('position');
  for (let n = 0; n < vertices.count; n++) {
    const x = vertices.getX(n), z = vertices.getZ(n);
    assert.ok(Math.hypot(x, z) <= 1.000001);
    assert.ok(Math.abs(Math.atan2(x, z)) <= CONE_HALF_ANGLE + 1e-6);
  }
  fx.reset();
  fx.impact(cue(2, { kind: 'boss_impact', area: { ...area, kind: 'raid', radius: 0 } }), state);
  fx.update(.2, state, camera, true);
  const pulse = root.children.find(n => n instanceof THREE.Mesh && n.visible && n.geometry.type === 'RingGeometry') as THREE.Mesh;
  assert.ok(pulse); assert.equal(pulse.position.x, 0); assert.equal(pulse.position.z, 0); assert.equal(pulse.scale.x, ARENA_RADIUS);
  fx.dispose();
});

test('VFX cleanup disposes each shared geometry, texture and material once, and ignores further calls', () => {
  const { state, camera, scene, fx, root } = setup();
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  root.traverse(n => {
    if (n instanceof THREE.Mesh || n instanceof THREE.Line) {
      resources.add(n.geometry); const materials = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of materials) { resources.add(m); if (m instanceof THREE.MeshBasicMaterial && m.map) resources.add(m.map); }
    }
  });
  const disposed = new Map<object, number>();
  for (const r of resources) r.addEventListener('dispose', () => disposed.set(r, (disposed.get(r) ?? 0) + 1));
  fx.dispose(); fx.dispose(); fx.start(cue(1, { weaponId: 'cleave' }), state, .43); fx.impact(cue(2, { weaponId: 'cleave' }), state); fx.update(.1, state, camera, false);
  assert.equal(scene.children.length, 0); assert.equal(fx.stats().active, 0); assert.equal(fx.stats().textures, 0);
  for (const resource of resources) assert.equal(disposed.get(resource), 1);
});
