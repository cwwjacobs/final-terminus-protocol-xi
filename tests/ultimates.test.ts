import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createGame, setHuman, stepGame } from '../game/engine.ts';
import { actionUnavailable, matchesBurst, TP_MAX, ULTIMATES } from '../game/content.ts';
import { restoreSave, validSave } from '../lib/local-save.ts';
import { roleActionSlots } from '../components/game/kit-ui.ts';
import { defaults, effectiveBindingCommand, roleCommand } from '../components/game/control-settings.ts';
import { enemyMark } from '../components/game/enemy-mark.ts';
import { parseRoomRequest } from '../lib/rooms.ts';
import { roomSyncActions } from '../components/game/room-sync.ts';
import type { Action, GameState } from '../game/types.ts';

function advance(state: GameState, seconds: number) {
  while (seconds > 1e-8) { const dt = Math.min(30, seconds); stepGame(state, dt); seconds -= dt; }
}
function logos() {
  const state = createGame();
  state.party.forEach((a, i) => { setHuman(state, i, true); a.x = i * .2; a.z = -1; a.engaged = true; a.attackTimer = 100000; });
  applyAction(state, 0, { type: 'start' });
  state.boss.hp = 1; state.party[0].tp = 1000;
  assert.equal(applyAction(state, 0, { type: 'weapon', id: 'cleave' }).ok, true);
  assert.equal(state.status, 'victory');
  assert.equal(applyAction(state, 0, { type: 'faceLogos' }).ok, true);
  advance(state, 60); state.enemies.forEach(e => { e.hp = 0; }); stepGame(state, .05);
  state.boss.z = -4;
  state.enemies = [-1,1].map((sign,i)=>({id:`echo-${i}`,name:'Logos Echo',x:sign*5,z:-3,hp:9000,maxHp:9000,target:0,attackTimer:100000,stunRemaining:0,burn:null}));
  state.party.forEach((a, i) => { a.x = i * .2; a.z = -1; a.attackTimer = 100000; });
  state.boss.attackTimer = state.boss.specialTimer = 100000;
  state.enemies.forEach(enemy => { enemy.attackTimer = 100000; });
  return state;
}

test('ultimates are role-locked, awaken ready only after Crown victory, and reject commands without mutations', () => {
  const state = createGame(); applyAction(state, 0, { type: 'start' });
  for (const [i, actor] of state.party.entries()) {
    const action = { type: ULTIMATES[actor.role] } as Action, before = structuredClone(state);
    assert.match(actionUnavailable(state, i, action)!, /Logos/);
    assert.equal(applyAction(state, i, action).ok, false); assert.deepEqual(state, before);
  }
  assert.equal(applyAction(state, 0, { type: 'faceLogos' }).ok, false);
  const awakened = logos(); assert.equal(awakened.ultimatesUnlocked, true); assert.equal(awakened.encounter, 'logos');
  assert.equal(awakened.boss.name, 'Logos');
  assert.ok(awakened.party.every(actor => actor.hp === actor.maxHp && !actor.cooldowns[ULTIMATES[actor.role]]));
  assert.equal(applyAction(awakened, 0, { type: 'fission' }).ok, false);
  assert.equal(applyAction(awakened, 1, { type: 'bolt' }).ok, false);
  assert.equal(applyAction(awakened, 0, { type: 'faceLogos' }).ok, false);
  assert.ok(validSave(awakened));
});

test('Fission hits every enemy in its 12m area, leaves distant enemies unharmed and starts a 600 second recast', () => {
  const state = logos(); state.enemies[1].x = 20;
  const hp = state.boss.hp;
  assert.equal(applyAction(state, 3, { type: 'fission' }).ok, true);
  assert.equal(state.boss.hp, hp - 9000); assert.equal(state.enemies[0].hp, 0); assert.equal(state.enemies[1].hp, 9000);
  assert.equal(state.party[3].cooldowns.fission, 600);
  const before = structuredClone(state); assert.equal(applyAction(state, 3, { type: 'fission' }).ok, false); assert.deepEqual(state, before);
  advance(state, 599.95); assert.equal(applyAction(state, 3, { type: 'fission' }).ok, false);
  advance(state, .05); assert.equal(applyAction(state, 3, { type: 'fission' }).ok, true);
});

test('Rain of Fire guarantees 3× area criticals, then exactly 25% of actual impact over three ticks without re-scaling', () => {
  const state = logos(), hp = state.boss.hp;
  assert.equal(applyAction(state, 2, { type: 'rainOfFire' }).ok, true);
  const impacts = state.events.filter(e => e.source === 'rainOfFire' && e.kind === 'weapon');
  assert.equal(impacts.length, 3); assert.ok(impacts.every(e => e.critical && e.value === 6000));
  assert.equal(state.boss.burn?.total, 1500); assert.equal(state.boss.hp, hp - 6000);
  state.party[2].revelryStacks = 5;
  advance(state, .95); assert.equal(state.boss.hp, hp - 6000);
  advance(state, .05); assert.equal(state.boss.hp, hp - 6500);
  advance(state, 2); assert.equal(state.boss.hp, hp - 7500); assert.equal(state.boss.burn, null);
  assert.equal(state.enemies[0].hp, 1500); assert.equal(state.enemies[1].hp, 1500);
  const dots = state.events.filter(e => e.source === 'rainOfFireBurn' && !e.enemyId);
  assert.deepEqual(dots.map(e => e.value), [500, 500, 500]); assert.ok(dots.every(e => e.critical === false));
  assert.equal(state.runStats.party[2].damage, 22500);
  assert.ok(validSave(state));
});

test('Rejuvenator restores living allies globally, shields actual healing at 25%, and leaves fallen allies fallen', () => {
  const state = logos(); state.enemies = [];
  state.party.forEach((actor, i) => { actor.hp -= (i + 1) * 100; actor.tp = 1; actor.x = i === 0 ? -20 : i; actor.z = 0; });
  state.party[2].hp = 0;
  assert.equal(applyAction(state, 4, { type: 'rejuvenator' }).ok, true);
  assert.equal(state.party[0].hpShield, 25); assert.equal(state.party[1].hpShield, 50); assert.equal(state.party[4].hpShield, 125);
  for (const actor of state.party.filter(a => a.hp > 0)) { assert.equal(actor.hp, actor.maxHp); assert.equal(actor.tp, TP_MAX); }
  assert.equal(state.party[2].hp, 0); assert.equal(state.party[2].hpShield, 0);
  assert.equal(state.runStats.party[4].healing, 1200);
  const recipient = state.party[0]; recipient.revelryStacks = 3;
  state.boss.cast = { name: 'Test pulse', kind: 'raid', total: 1, remaining: .05, x: 0, z: 0, radius: 100, angle: 0 };
  stepGame(state, .05);
  assert.equal(recipient.hpShield, 0); assert.equal(recipient.maxHp - recipient.hp, 248, '273 incoming minus 25 shield');
  assert.equal(recipient.revelryStacks, 0);
  assert.ok(validSave(state));
});

test('Fearless grants exactly 5/10 crit charges, refills Bacchus TP per hit and allows repeated critical self-chains into Dusk', () => {
  const state = logos(); state.enemies = [];
  applyAction(state, 0, { type: 'fearless' });
  assert.deepEqual(state.party.map(a => a.criticalCharges), [10, 5, 5, 5, 5]);
  state.party[0].tp = TP_MAX;
  const rng = state.rng;
  applyAction(state, 0, { type: 'weapon', id: 'cleave' });
  assert.equal(state.party[0].tp, TP_MAX); assert.equal(state.party[0].criticalCharges, 9); assert.equal(state.rng, rng);
  advance(state, 1.5); assert.equal(applyAction(state, 0, { type: 'weapon', id: 'pierce' }).ok, true);
  assert.equal(state.party[0].tp, TP_MAX); assert.equal(state.party[0].criticalCharges, 8);
  assert.equal(state.duskRemaining, 10); assert.equal(enemyMark(state)?.symbol, 'dusk');
  assert.ok(['fire', 'ice', 'lightning'].every(e => matchesBurst(state, e as 'fire')));
  applyAction(state, 3, { type: 'magic', element: 'ice' });
  assert.equal(state.events.at(-1)?.kind, 'burst'); assert.equal(state.party[3].criticalCharges, 4);
  advance(state, 1.5); applyAction(state, 0, { type: 'weapon', id: 'resonance' });
  assert.equal(state.party[0].tp, TP_MAX); assert.equal(state.party[0].criticalCharges, 7); assert.equal(state.duskRemaining, 10);
  assert.ok(state.events.filter(e => e.kind === 'weapon').slice(-3).every(e => e.critical));
  advance(state, 10.05); assert.equal(state.duskRemaining, 0);
  assert.ok(validSave(state));
});

test('Thunderclap interrupts and stuns bosses and echoes for five seconds, forces targeting and unlocks the Zeus kit', () => {
  const state = logos();
  state.enemies[0].x = -3; state.enemies[1].x = 3;
  state.party[0].ce = state.party[0].ve = 10000;
  state.boss.cast = { name: 'Interrupt me', kind: 'raid', total: 1, remaining: .05, x: 0, z: 0, radius: 100, angle: 0 };
  assert.equal(applyAction(state, 1, { type: 'thunderclap' }).ok, true);
  assert.equal(state.party[1].sonOfZeus, true); assert.equal(state.boss.cast, null); assert.equal(state.boss.target, 1);
  assert.ok(state.enemies.every(e => e.target === 1 && e.stunRemaining === 5));
  const timer = state.boss.attackTimer; advance(state, 4.95); assert.equal(state.boss.attackTimer, timer); assert.equal(state.boss.target, 1);
  advance(state, .05); assert.equal(state.boss.attackTimer, timer); advance(state, .05); assert.ok(state.boss.attackTimer < timer);
  assert.equal(roleCommand('warden', 'primary1', true), 'lightningShock');
  assert.equal(roleCommand('warden', 'primary2', true), 'bolt'); assert.equal(roleCommand('warden', 'primary3', true), 'clap');
  const kit = roleActionSlots('warden', null, state.party[1]); assert.deepEqual(kit.slice(0, 3).map(s => s.command), ['lightningShock', 'bolt', 'clap']);
  assert.equal(effectiveBindingCommand('warden', 'bolt', defaults(), 'keyboard', true), 'primary2');
  applyAction(state, 1, { type: 'lightningShock' });
  assert.ok(state.enemies.every(e => e.stunRemaining === 2)); assert.equal(state.boss.stunRemaining, 2);
  advance(state, 1); state.duskRemaining = 10;
  assert.equal(applyAction(state, 1, { type: 'bolt' }).ok, true); assert.equal(state.events.at(-1)?.kind, 'burst');
  state.party[1].tp = 1000; assert.equal(applyAction(state, 1, { type: 'clap' }).ok, true); assert.equal(state.party[1].tp, 0);
  advance(state, 30); assert.equal(state.party[1].sonOfZeus, true); assert.equal(state.boss.target, 1);
  assert.ok(validSave(state));
  state.party[1].hp = 1; state.boss.stunRemaining = 0;
  state.boss.cast = { name: 'Lethal decree', abilityId: 'regentsDecree', kind: 'circle', total: 1, remaining: .05, radius: 0, target: 1, x: 0, z: 0, angle: 0 };
  stepGame(state, .05); assert.equal(state.party[1].hp, 0); assert.equal(state.party[1].sonOfZeus, false);
  stepGame(state, .05); assert.notEqual(state.boss.target, 1);
  assert.equal(roleActionSlots('warden', null, state.party[1])[0].command, 'cleave');
});

test('mid-burn, Dusk, shields, Fearless and Zeus survive a round trip and replay deterministically', () => {
  const state = logos(); applyAction(state, 2, { type: 'rainOfFire' });
  applyAction(state, 0, { type: 'fearless' }); applyAction(state, 1, { type: 'thunderclap' });
  state.party[4].hp -= 600; applyAction(state, 4, { type: 'rejuvenator' }); state.duskRemaining = 7;
  advance(state, 1.25); const restored = restoreSave(JSON.parse(JSON.stringify(state)));
  assert.ok(restored); advance(state, 2); advance(restored, 1); advance(restored, 1); assert.deepEqual(restored, state);
  for (const alter of [(s: GameState) => { s.party[1].criticalCharges = 99; }, (s: GameState) => { s.party[0].sonOfZeus = true; }, (s: GameState) => { s.boss.stunRemaining = 100; }, (s: GameState) => { s.enemies[0].hp = NaN; }]) {
    const malformed = structuredClone(state); alter(malformed); assert.equal(restoreSave(malformed), null);
  }
});

test('old saves receive locked neutral defaults; network accepts bounded ultimate intents and only queues descent after victory', () => {
  const old = createGame() as unknown as Record<string, unknown>;
  for (const key of ['encounter', 'ultimatesUnlocked', 'duskRemaining', 'enemies']) delete old[key];
  for (const actor of old.party as Record<string, unknown>[]) for (const key of ['hpShield', 'criticalCharges', 'sonOfZeus']) delete actor[key];
  for (const key of ['stunRemaining', 'burn']) delete (old.boss as Record<string, unknown>)[key];
  const migrated = restoreSave(old); assert.ok(migrated); assert.equal(migrated.ultimatesUnlocked, false); assert.equal(migrated.encounter, 'crown');
  for (const type of ['fission', 'rainOfFire', 'rejuvenator', 'fearless', 'thunderclap', 'lightningShock', 'bolt', 'clap', 'faceLogos']) {
    assert.equal(parseRoomRequest({ op: 'sync', code: 'a'.repeat(32), token: 'b'.repeat(32), seq: 1, actions: [{ type }] }).op, 'sync');
  }
  assert.deepEqual(roomSyncActions('victory', [{ type: 'faceLogos' }, { type: 'fission' }], { type: 'move', x: 0, z: 0 }), [{ type: 'faceLogos' }]);
  assert.deepEqual(roomSyncActions('defeat', [{ type: 'faceLogos' }], { type: 'move', x: 0, z: 0 }), []);
});
