import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createGame, setHuman, stepGame } from '../game/engine.ts';
import type { GameState } from '../game/types.ts';
import { restoreSave } from '../lib/local-save.ts';
import { createEncounterDisplay } from '../components/game/encounter-display.ts';

test('a player finishing Crown between ticks can descend, resume and vote ready', () => {
  const state = createGame('trial', 123);
  state.party.forEach((_, slot) => setHuman(state, slot, slot === 3));
  assert.ok(applyAction(state, 3, { type: 'start' }).ok);
  stepGame(state, .1);
  state.boss.hp = 1;
  Object.assign(state.party[3], { x: state.boss.x, z: state.boss.z + 3 });
  const displayed: GameState[] = [];
  const publish = createEncounterDisplay(current => displayed.push(structuredClone(current)));
  publish(state, true);

  assert.ok(applyAction(state, 3, { type: 'magic', element: 'fire' }).ok);
  assert.equal(state.status, 'victory');
  publish(state, false); // The simulation already stopped before the next timer callback.
  publish(state, false);
  assert.deepEqual(displayed.map(s => s.status), ['fighting', 'victory']);
  assert.equal(displayed[1].boss.hp, 0);

  const resumed = restoreSave(displayed[1]);
  assert.ok(resumed);
  publish(resumed, false); // A replacement snapshot can carry the same status and stage.
  assert.equal(displayed.length, 3);
  assert.ok(applyAction(resumed, 3, { type: 'faceLogos' }).ok);
  publish(resumed, false);
  assert.equal(displayed.at(-1)!.logos.stage, 'descent');
  assert.ok(applyAction(resumed, 3, { type: 'readyForLogos', ready: true }).ok);
  publish(resumed, false);
  assert.equal(displayed.at(-1)!.logos.stage, 'sentinels');
  assert.equal(displayed.at(-1)!.enemies.filter(e => e.hp > 0).length, 6);
});
