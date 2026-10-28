import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { applyAction, createGame, stepGame } from '../game/engine.ts';
import { ABILITY_DEFINITIONS, actionUnavailable, WAR_CRY } from '../game/content.ts';
import { restoreSave, validSave } from '../lib/local-save.ts';
import { parseRoomRequest } from '../lib/rooms.ts';
import { roleActionSlots, abilityDetail } from '../components/game/kit-ui.ts';
import { defaults, effectiveBindingCommand, normalizeControls, roleCommand } from '../components/game/control-settings.ts';
import { combatSound } from '../components/game/combat-audio.ts';
import { createAbilityEffects } from '../components/game/ability-effects.ts';
import { presentationKey } from '../components/game/presentation-cues.ts';
import type { GameState } from '../game/types.ts';

function battle() {
  const state = createGame('trial', 1);
  state.party.forEach(actor => { actor.human = true; actor.engaged = false; actor.x = 0; actor.z = 0; });
  assert.equal(applyAction(state, 1, { type: 'start' }).ok, true);
  state.party.forEach(actor => { actor.engaged = false; actor.attackTimer = 1000; });
  state.boss.attackTimer = state.boss.specialTimer = 1000;
  return state;
}
function echo(id: string, x: number, z = 0) {
  return { id, name: 'Echo', x, z, hp: 9000, maxHp: 9000, target: 0, attackTimer: 1000, stunRemaining: 0, burn: null };
}
const advance = (state: GameState, seconds: number) => {
  while (seconds > 1e-8) { const dt = Math.min(30, seconds); stepGame(state, dt); seconds -= dt; }
};

test('War Cry hits each legal enemy in its own 8m radius once, builds hate and does not spend TP', () => {
  const s = battle(), hero = s.party[1];
  s.enemies = [echo('echo-0', 8), echo('echo-1', 8.01)];
  hero.enemyTarget = 'echo-1'; // The selected enemy is outside the shout; nearby enemies still get hit.
  hero.tp = 600;
  const before = s.boss.hp;
  assert.deepEqual(applyAction(s, 1, { type: 'warCry' }), { ok: true });
  assert.ok(s.boss.hp < before); assert.ok(s.enemies[0].hp < 9000); assert.equal(s.enemies[1].hp, 9000);
  assert.equal(hero.mp, hero.maxMp - 40); assert.equal(hero.tp, 600);
  assert.equal(hero.cooldowns.warCry, 30); assert.equal(hero.cooldowns.provoke, undefined);
  assert.equal(hero.warCryRemaining, 12);
  assert.ok(hero.ce >= WAR_CRY.cumulative * 2.5); assert.ok(hero.ve >= WAR_CRY.volatile * 2.5);
  assert.deepEqual(s.events.filter(e => e.source === 'warCry' && e.kind === 'weapon').map(e => e.enemyId), ['boss', 'echo-0']);
  stepGame(s, .05); assert.equal(s.boss.target, 1); assert.equal(s.enemies[0].target, 1);
});

test('War Cry remains a usable self-buff outside enemy range without inventing hits or hate', () => {
  const s = battle(), hero = s.party[1]; hero.z = 20;
  const hate = [hero.ce, hero.ve], hp = s.boss.hp;
  assert.equal(applyAction(s, 1, { type: 'warCry' }).ok, true);
  assert.equal(hero.warCryRemaining, 12); assert.equal(s.boss.hp, hp);
  assert.deepEqual([hero.ce, hero.ve], hate);
  assert.equal(s.events.filter(e => e.source === 'warCry' && e.kind === 'weapon').length, 0);
});

test('the buff advances only auto-attack timing by 30%, expires, and never accelerates cooldowns', () => {
  const fast = battle(), normal = structuredClone(fast);
  assert.equal(applyAction(fast, 1, { type: 'warCry' }).ok, true);
  fast.party[1].attackTimer = normal.party[1].attackTimer = 10;
  fast.party[1].cooldowns.provoke = normal.party[1].cooldowns.provoke = 18;
  advance(fast, 1); advance(normal, 1);
  assert.ok(Math.abs(fast.party[1].attackTimer - 8.7) < 1e-9);
  assert.ok(Math.abs(normal.party[1].attackTimer - 9) < 1e-9);
  assert.equal(fast.party[1].cooldowns.provoke, normal.party[1].cooldowns.provoke);
  assert.ok(Math.abs(fast.party[1].warCryRemaining - 11) < 1e-9);
  fast.party[1].attackTimer = 100;
  advance(fast, 11); assert.ok(fast.party[1].warCryRemaining < 1e-8);
  const timer = fast.party[1].attackTimer;
  advance(fast, 1); assert.ok(Math.abs(fast.party[1].attackTimer - (timer - 1)) < 1e-9);
});

test('faster real auto-attacks land sooner and generate TP while ordinary attacks still wait', () => {
  const fast = battle(), normal = structuredClone(fast);
  applyAction(fast, 1, { type: 'warCry' });
  for (const s of [fast, normal]) { s.party[1].engaged = true; s.party[1].attackTimer = 2.8; }
  advance(fast, 2.2); advance(normal, 2.2);
  assert.ok(fast.events.some(e => e.actor === 1 && e.kind === 'auto'));
  assert.ok(!normal.events.some(e => e.actor === 1 && e.kind === 'auto'));
  assert.ok(fast.party[1].tp > normal.party[1].tp);
});

test('role, resource, cooldown, recovery and landing rejections leave state untouched', () => {
  for (const scenario of ['role', 'mp', 'cooldown', 'recovery', 'landing', 'dead'] as const) {
    const s = battle(); let slot = 1;
    if (scenario === 'role') slot = 0;
    if (scenario === 'mp') s.party[1].mp = 39;
    if (scenario === 'cooldown') s.party[1].cooldowns.warCry = 1;
    if (scenario === 'recovery') s.party[1].recovery = .1;
    if (scenario === 'dead') s.party[1].hp = 0;
    if (scenario === 'landing') { s.encounter = 'logos'; s.logos = { stage: 'sentinels', elapsed: 0 }; }
    const before = structuredClone(s);
    assert.ok(actionUnavailable(s, slot, { type: 'warCry' }), scenario);
    assert.equal(applyAction(s, slot, { type: 'warCry' }).ok, false, scenario);
    assert.deepEqual(s, before, scenario);
  }
});

test('the shout respects hidden hands, shielded Logos, emerging ground and dead targets', () => {
  const s = battle(); s.encounter = 'logos'; s.logos = { stage: 'giant', elapsed: 0, statueWave: 1, exposureRemaining: 0, statueEntryRemaining: 0 };
  s.enemies = [echo('left-hand', 2), echo('sentinel-0', 3), { ...echo('sentinel-1', 4), hp: 0 }];
  const bossHp = s.boss.hp;
  applyAction(s, 1, { type: 'warCry' });
  assert.equal(s.boss.hp, bossHp); assert.equal(s.enemies[0].hp, 9000); assert.ok(s.enemies[1].hp < 9000);
  const crown = battle(); crown.enemies = [{ ...echo('echo-0', 1), emergeRemaining: 2 }];
  crown.party[1].enemyTarget = 'echo-0';
  assert.equal(applyAction(crown, 1, { type: 'warCry' }).ok, true);
  assert.equal(crown.enemies[0].hp, 9000); assert.ok(crown.boss.hp < crown.boss.maxHp);
});

test('War Cry survives saves, defaults absent historical fields, rejects forged buffs and clears on death', () => {
  const s = battle(); applyAction(s, 1, { type: 'warCry' }); stepGame(s, .05);
  assert.ok(validSave(s)); const restored = restoreSave(JSON.parse(JSON.stringify(s)))!;
  assert.ok(restored); assert.equal(restored.party[1].warCryRemaining, s.party[1].warCryRemaining);
  const old = createGame(); old.party.forEach(actor => Reflect.deleteProperty(actor, 'warCryRemaining'));
  const migrated = restoreSave(old)!; assert.ok(migrated); assert.equal(migrated.party[1].warCryRemaining, 0);
  for (const value of [-1, NaN, Infinity, 12.01]) {
    const bad = structuredClone(s); bad.party[1].warCryRemaining = value; assert.equal(restoreSave(bad), null);
  }
  const bad = structuredClone(s); bad.party[0].warCryRemaining = 1; assert.equal(restoreSave(bad), null);
  s.party[1].hp = 0; stepGame(s, .05); assert.equal(s.party[1].warCryRemaining, 0);
});

test('keyboard, controller, touch/command registries and strict multiplayer intents expose the same action', () => {
  const settings = defaults(), kit = roleActionSlots('warden');
  assert.equal(kit.find(s => s.id === 'utility2')?.presentation.action.type, 'warCry');
  assert.equal(roleCommand('warden', 'utility2', true), 'warCry');
  assert.equal(effectiveBindingCommand('warden', 'warCry', settings, 'keyboard'), 'utility2');
  assert.equal(settings.keys.utility2, 'KeyE'); assert.equal(settings.buttons.utility2, 6);
  const custom = structuredClone(settings); custom.keys.utility2 = 'KeyH';
  assert.equal(normalizeControls(custom).keys.utility2, 'KeyH');
  assert.match(abilityDetail(createGame().party[1], { type: 'warCry' }), /30% attack speed/);
  const input = { op: 'sync', code: 'a'.repeat(32), token: 'b'.repeat(32), seq: 1, actions: [{ type: 'warCry' }] };
  assert.deepEqual(parseRoomRequest(input), input);
  assert.throws(() => parseRoomRequest({ ...input, actions: [{ type: 'warCry', damage: 99999 }] }));
  assert.equal(ABILITY_DEFINITIONS.warCry.cooldown, 30);
});

test('the shout has one sound and bounded VFX, with a live aura that follows the buff and resets', () => {
  const s = battle(); applyAction(s, 1, { type: 'warCry' });
  const events = s.events.filter(e => e.source === 'warCry');
  assert.equal(events.filter(e => combatSound(e) !== null).length, 1);
  assert.ok(events.every(e => presentationKey(e) === 'warCry'));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), fx = createAbilityEffects(scene, 'low');
  const before = structuredClone(s);
  events.forEach(e => fx.impact(e, s)); fx.update(.05, s, camera, true);
  const root = scene.getObjectByName('ability-effects')!, aura = root.getObjectByName('vfx-warCry:1')!;
  assert.ok(aura.visible); assert.deepEqual(s, before);
  s.party[1].warCryRemaining = 0; fx.update(.05, s, camera, true); assert.equal(aura.visible, false);
  fx.reset(); assert.ok(root.children.every(child => !child.visible)); fx.dispose();
});
