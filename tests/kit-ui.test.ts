import test from 'node:test';
import assert from 'node:assert/strict';
import type { Action } from '../game/types.ts';
import { applyAction, createGame } from '../game/engine.ts';
import { abilityDetail, actionCommand, manualHealConfirmed, roleAbilities, roleActionSlots, withHealingTarget } from '../components/game/kit-ui.ts';
import { defaults, effectiveBindingCommand } from '../components/game/control-settings.ts';
import { commandEntries } from '../components/game/command-menu.ts';

test('every role exposes its new technique alongside only permitted actions', () => {
  const state = createGame();
  for (const [slot, signature] of [[0,'criticalDash'],[1,'provoke'],[2,'splitVolley'],[3,'rapidWeave'],[4,'aegis']] as const) {
    const kit = roleAbilities(state.party[slot].role);
    assert.ok(kit.some(item => item.action.type === signature));
    assert.equal(kit.filter(item => item.action.type === 'magic').length, slot === 3 ? 3 : 0);
    assert.equal(kit.filter(item => item.action.type === 'weapon').length, slot < 3 ? 3 : 0);
    assert.ok(kit.some(item => item.action.type === 'dodge'));
    assert.ok(commandEntries(state, slot, 'abilities').some(item => item.action?.type === signature));
  }
});

test('each role has one visible slot per action and every default keyboard/controller action is mapped', () => {
  const settings = defaults();
  const counts = [8, 7, 8, 7, 5];
  for (const [index, actor] of createGame().party.entries()) {
    const slots = roleActionSlots(actor.role);
    assert.equal(slots.length, counts[index], actor.name);
    assert.equal(new Set(slots.map(slot => actionCommand(slot.presentation.action))).size, slots.length, 'no duplicated Guard or utility activation');
    assert.equal(new Set(slots.map(slot => slot.id)).size, slots.length);
    for (const slot of slots) for (const mode of ['keyboard', 'controller'] as const) {
      const binding = effectiveBindingCommand(actor.role, slot.command, settings, mode);
      assert.ok(binding, `${actor.name} ${slot.command} ${mode}`);
      assert.ok(mode === 'keyboard' ? settings.keys[binding] : settings.buttons[binding] !== undefined);
    }
  }
  const healer = roleActionSlots('luminary', 2);
  assert.equal(healer.some(slot => slot.id === 'primary3'), false);
  assert.equal(healer.filter(slot => slot.command === 'guard').length, 1);
  assert.deepEqual(healer.find(slot => slot.command === 'heal')?.presentation.action, { type: 'heal', target: 2 });
});

test('per-spell display follows rapid charges, then reveals the remaining ordinary recast', () => {
  const actor = createGame().party[3];
  actor.cooldowns['magic:fire'] = 5.5;
  assert.equal(abilityDetail(actor, { type: 'magic', element: 'fire' }), '5.5s recast');
  assert.equal(abilityDetail(actor, { type: 'magic', element: 'ice' }), '70 MP');
  actor.rapidWeave = { remaining: 12, charges: { fire: 2, ice: 2, lightning: 2 }, refresh: { fire: .5, ice: 0, lightning: 0 } };
  assert.equal(abilityDetail(actor, { type: 'magic', element: 'fire' }), '2 rapid · 0.5s');
  actor.rapidWeave.charges.fire = 0;
  assert.equal(abilityDetail(actor, { type: 'magic', element: 'fire' }), '5.5s recast');
});

test('Mend target survives menu/quick-action mapping; invalid explicit targets never fall back to Auto', () => {
  const state = createGame(); applyAction(state, 4, { type: 'start' });
  state.party[0].hp -= 100; state.party[0].x = state.party[4].x; state.party[0].z = state.party[4].z;
  assert.deepEqual(withHealingTarget({ type: 'heal' }, 0), { type: 'heal', target: 0 });
  assert.deepEqual(withHealingTarget({ type: 'heal', target: 1 }, 0), { type: 'heal', target: 1 });
  assert.deepEqual(withHealingTarget({ type: 'aegis' }, 0), { type: 'aegis' });
  assert.deepEqual(commandEntries(state, 4, 'allies', 0)[0].action, { type: 'heal', target: 0 });
  const invalid = commandEntries(state, 4, 'allies', 1)[0];
  assert.equal(invalid.disabled, true);
  assert.deepEqual(invalid.action, { type: 'heal', target: 1 });
  assert.deepEqual(roleAbilities('luminary', 1).find(item => item.action.type === 'heal')?.action, invalid.action);
  assert.equal(commandEntries(state, 4, 'allies')[0].disabled, false, 'Auto can still heal the wounded ally');
});

test('only the exact accepted manual Mend consumes its still-current soft selection', () => {
  const heal: Action = { type: 'heal', target: 0 }, other: Action = { type: 'guard' };
  const packet = { seq: 10, actions: [other, heal] }, intent = { action: heal, selectionRevision: 2 };
  assert.equal(manualHealConfirmed(packet, { actionSeq: 10, actionResults: [{ index: 1, ok: true }] }, intent, 2), true);
  assert.equal(manualHealConfirmed(packet, { actionSeq: 10, actionResults: [{ index: 1, ok: true }] }, intent, 3), false, 'new selection survives an older heal');
  assert.equal(manualHealConfirmed(packet, { actionSeq: 9, actionResults: [{ index: 1, ok: true }] }, intent, 2), false, 'wrong packet');
  assert.equal(manualHealConfirmed(packet, { actionSeq: 10, actionResults: [{ index: 0, ok: true }, { index: 1, ok: false }] }, intent, 2), false, 'another accepted action does not acknowledge Mend');
  assert.equal(manualHealConfirmed(packet, {}, intent, 2), false, 'snapshots and heal events alone are not proof of this intent');
  assert.equal(manualHealConfirmed(packet, { actionSeq: 10, actionResults: [{ index: 1, ok: true }] }, { ...intent, action: { type: 'heal', target: 0 } }, 2), false, 'intent must belong to this packet');
});

test('an in-flight successful Mend cannot consume a newer selection whose next Mend is rejected', () => {
  const first: Action = { type: 'heal', target: 0 }, second: Action = { type: 'heal', target: 0 };
  const packet1 = { seq: 1, actions: [first] }, packet2 = { seq: 2, actions: [second] };
  const firstIntent = { action: first, selectionRevision: 1 }, secondIntent = { action: second, selectionRevision: 2 };
  const firstReply = { actionSeq: 1, actionResults: [{ index: 0, ok: true }] };
  assert.equal(manualHealConfirmed(packet1, firstReply, firstIntent, 2), false);
  assert.equal(manualHealConfirmed(packet2, firstReply, secondIntent, 2), false);
  assert.equal(manualHealConfirmed(packet2, { actionSeq: 2, actionResults: [{ index: 0, ok: false, error: 'Cooldown' }] }, secondIntent, 2), false);
});
