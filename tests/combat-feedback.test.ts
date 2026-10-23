import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createGame, stepGame } from '../game/engine.ts';
import { activeBurst, abilityCue, completedChainActors } from '../components/game/combat-feedback.ts';
import type { GameState, WeaponId } from '../game/types.ts';

function encounter() {
  const state = createGame('trial');
  applyAction(state, 0, { type: 'start' });
  state.party.forEach(actor => { actor.human = true; actor.engaged = true; actor.x = 0; actor.z = -2; actor.tp = 2000; });
  return state;
}
function weapon(state: GameState, slot: number, id: WeaponId) {
  state.party[slot].tp = 1000; state.party[slot].cooldowns.weapon = 0;
  assert.equal(applyAction(state, slot, { type: 'weapon', id }).ok, true);
}

test('a lone weaponskill never advertises any magic burst; only a timed compatible closer lights up', () => {
  const state = encounter(); weapon(state, 0, 'cleave');
  assert.equal(activeBurst(state), null);
  for (const element of ['fire', 'ice', 'lightning'] as const)
    assert.equal(abilityCue(state, 3, { type: 'magic', element }, false), null);
  assert.equal(abilityCue(state, 2, { type: 'weapon', id: 'pierce' }, false), null, 'too early');
  stepGame(state, 1.5);
  assert.deepEqual(abilityCue(state, 2, { type: 'weapon', id: 'pierce' }, false), { kind: 'chain-ready', label: 'Close Fusion' });
  assert.equal(abilityCue(state, 0, { type: 'weapon', id: 'pierce' }, false), null, 'same actor');
  assert.equal(abilityCue(state, 2, { type: 'weapon', id: 'cleave' }, false), null, 'incompatible closer');
  assert.equal(abilityCue(state, 2, { type: 'weapon', id: 'pierce' }, true), null, 'unavailable action');
});

test('each completed chain highlights only its matching available spell and records both actors', () => {
  for (const [open, close, element] of [['cleave','pierce','fire'],['pierce','resonance','ice'],['resonance','cleave','lightning']] as const) {
    const state = encounter(); weapon(state, 0, open); stepGame(state, 1.5); weapon(state, 2, close);
    assert.equal(activeBurst(state)?.element, element);
    assert.equal(completedChainActors(state), 'Bacchus → Dolos');
    for (const spell of ['fire','ice','lightning'] as const)
      assert.equal(abilityCue(state, 3, { type: 'magic', element: spell }, false)?.kind ?? null, spell === element ? 'burst-ready' : null);
    assert.equal(abilityCue(state, 0, { type: 'magic', element }, true), null, 'disabled spell on a martial role cannot glow');
    for (const id of ['cleave','pierce','resonance'] as const)
      assert.notEqual(abilityCue(state, 0, { type: 'weapon', id }, false)?.kind, 'burst-ready');
    applyAction(state, 3, { type: 'magic', element });
    assert.equal(state.events.at(-1)?.kind, 'burst');
    stepGame(state, 8.1);
    assert.equal(activeBurst(state), null);
    assert.equal(abilityCue(state, 3, { type: 'magic', element }, false), null);
  }
});

test('wrong weaponskills and encounter end cannot create or retain a burst cue', () => {
  const state = encounter(); weapon(state, 0, 'cleave'); stepGame(state, 1.5); weapon(state, 2, 'resonance');
  assert.equal(state.burst, null);
  assert.equal(activeBurst(state), null);
  state.burst = { element: 'fire', remaining: 5 };
  state.status = 'defeat';
  assert.equal(activeBurst(state), null);
  assert.equal(abilityCue(state, 3, { type: 'magic', element: 'fire' }, false), null);
});
