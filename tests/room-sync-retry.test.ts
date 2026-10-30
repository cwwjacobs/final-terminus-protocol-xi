import test from 'node:test';
import assert from 'node:assert/strict';
import type { Action } from '../game/types.ts';
import { rejectedRoomPacket, type RoomSyncPacket } from '../components/game/room-sync-retry.ts';

test('permanent request rejection releases the bad packet and only its heal confirmations', () => {
  const heal: Action = { type: 'heal', target: 0 }, later: Action = { type: 'heal', target: 0 };
  const packet: RoomSyncPacket = { seq: 12, loaded: true, actions: [{ type: 'selectEnemy', id: 'ground-1-0' }, heal] };
  const pending = [{ action: heal, selectionRevision: 1 }, { action: later, selectionRevision: 2 }];
  for (const status of [400, 413, 422]) {
    const result = rejectedRoomPacket(status, packet, pending);
    assert.equal(result.packet, null, 'the next poll can form a fresh packet');
    assert.deepEqual(result.pendingHeals, [pending[1]], 'newer healing target intent survives');
    assert.equal(packet.seq, 12, 'never rewinds or mutates the rejected sequence');
    assert.equal(pending.length, 2);
  }
});

test('uncertain transient failures preserve exact packet identity, sequence and confirmations for deduplicated retry', () => {
  const action: Action = { type: 'mendingThread', target: 2 };
  const packet: RoomSyncPacket = { seq: 24, loaded: true, actions: [action] };
  const pending = [{ action, selectionRevision: 4 }];
  for (const status of [0, 408, 409, 425, 429, 500, 502, 503, 504]) {
    const result = rejectedRoomPacket(status, packet, pending);
    assert.equal(result.packet, packet);
    assert.equal(result.pendingHeals, pending);
  }
});
