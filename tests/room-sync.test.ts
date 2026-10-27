import assert from 'node:assert/strict';
import test from 'node:test';
import { roomSyncActions } from '../components/game/room-sync.ts';
import type { Action } from '../game/types.ts';

const movement: Action = { type: 'move', x: 0, z: 0 };

test('results polls discard movement and queued combat commands instead of repeating encounter-over errors', () => {
  const pending: Action[] = [{ type: 'heal' }, { type: 'weapon', id: 'cleave' }];
  for (const status of ['victory', 'defeat'] as const) assert.deepEqual(roomSyncActions(status, pending, movement), []);
  assert.equal(pending.length, 2, 'selection does not mutate the caller queue');
});

test('lobby polls preserve explicit start but never send premature combat', () => {
  assert.deepEqual(roomSyncActions('ready', [{ type: 'engage' }, { type: 'start' }, { type: 'revelry' }], movement), [{ type: 'start' }]);
  assert.deepEqual(roomSyncActions('ready', [], movement), []);
});

test('combat polls retain ordered actions and current movement', () => {
  const pending: Action[] = [{ type: 'revelry' }, { type: 'guard' }];
  assert.deepEqual(roomSyncActions('fighting', pending, movement), [...pending, movement]);
});

test('descent polls send only readiness and escape polls send no combat or movement', () => {
  const pending: Action[] = [{ type: 'guard' }, { type: 'readyForLogos', ready: true }];
  assert.deepEqual(roomSyncActions('fighting', pending, movement, 'descent'), [pending[1]]);
  for (const stage of ['collapse', 'escaped'] as const) assert.deepEqual(roomSyncActions('fighting', pending, movement, stage), []);
});
