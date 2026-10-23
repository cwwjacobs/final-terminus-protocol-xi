import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createGame, stepGame } from '../game/engine.ts';
import { enemyMark } from '../components/game/enemy-mark.ts';

test('enemy marks show the compatible next action, then only the resulting burst element', () => {
  for (const [opener, closer, element] of [['cleave','pierce','fire'],['pierce','resonance','ice'],['resonance','cleave','lightning']] as const) {
    const state = createGame('trial');
    assert.equal(enemyMark(state), null);
    applyAction(state, 0, { type: 'start' });
    state.party.forEach(actor => { actor.human = true; actor.engaged = true; actor.x = 0; actor.z = -2; actor.tp = 2000; });
    assert.equal(applyAction(state, 0, { type:'weapon', id:opener }).ok, true);
    const opening = enemyMark(state)!;
    assert.equal(opening.kind, 'chain'); assert.equal(opening.symbol, closer); assert.equal(opening.ready, false);
    stepGame(state, 1.5);
    assert.equal(enemyMark(state)?.ready, true);
    assert.ok(enemyMark(state)!.fraction < opening.fraction);
    assert.equal(applyAction(state, 2, { type:'weapon', id:closer }).ok, true);
    assert.equal(enemyMark(state)?.kind, 'burst'); assert.equal(enemyMark(state)?.symbol, element);
    stepGame(state, 8.1);
    assert.equal(enemyMark(state), null, 'expired marks clear');
    state.burst = { element, remaining: 4 }; state.status = 'defeat';
    assert.equal(enemyMark(state), null, 'finished encounters clear');
    state.status = 'fighting'; state.boss.hp = 0;
    assert.equal(enemyMark(state), null, 'dead enemies have no marks');
  }
});
