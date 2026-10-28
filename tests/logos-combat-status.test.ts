import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame } from '../game/engine.ts';
import { logosCombatStatus } from '../components/game/logos-combat-status.ts';

test('statue-linked HP feedback follows the combat clock after a long descent', () => {
  const state = createGame('trial');
  state.encounter = 'logos'; state.status = 'fighting';
  state.logos = { stage: 'giant', elapsed: 20, statueWave: 1, exposureRemaining: 12 };
  state.time = 185; state.combatTime = 25;
  state.events.push({ id: 1, time: 24, kind: 'magic', text: 'Statue shattered', source: 'statueLink', abilityId: 'statueLink', enemyId: 'boss', value: 2400 });
  assert.equal(logosCombatStatus(state)?.linkedDamage, 2400);
  state.combatTime = 27;
  assert.equal(logosCombatStatus(state)?.linkedDamage, 0);
  state.combatTime = 23;
  assert.equal(logosCombatStatus(state)?.linkedDamage, 0, 'future events do not appear early');
});

test('the last cleared statue wave has a final opening instead of a frozen countdown', () => {
  const state = createGame('trial');
  state.encounter = 'logos'; state.status = 'fighting';
  state.logos = { stage: 'giant', elapsed: 100, statueWave: 3, exposureRemaining: 20 };
  assert.equal(logosCombatStatus(state)?.finalExposure, true);
  state.enemies.push({ id: 'sentinel-0', name: 'Observation', x: 0, z: 0, hp: 10, maxHp: 100, target: 1, attackTimer: 2, stunRemaining: 0, burn: null });
  assert.equal(logosCombatStatus(state)?.finalExposure, false);
  assert.equal(logosCombatStatus(state)?.protectedByStatues, true);
  state.encounter = 'crown'; state.logos.stage = 'none';
  assert.equal(logosCombatStatus(state), null);
});
