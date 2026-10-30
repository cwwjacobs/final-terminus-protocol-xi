import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction } from '../game/engine.ts';
import { GROUND_WAVES, nextGroundWave } from '../game/ground-enemies.ts';
import { validSave } from '../lib/local-save.ts';
import {
  handleRoomRequest, parseRoomRequest, RoomError,
  type RoomCredentials, type RoomRepository, type RoomSnapshot, type StoredRoom,
} from '../lib/rooms.ts';

class MemoryRepository implements RoomRepository {
  rows = new Map<string, StoredRoom>();
  async get(code: string) { return structuredClone(this.rows.get(code) ?? null); }
  async insert(room: StoredRoom) {
    if (this.rows.has(room.code)) return false;
    this.rows.set(room.code, structuredClone(room));
    return true;
  }
  async compareAndSwap(room: StoredRoom, revision: number) {
    if (this.rows.get(room.code)?.revision !== revision) return false;
    this.rows.set(room.code, structuredClone(room));
    return true;
  }
  async purgeExpired(now: number) {
    for (const [code, room] of this.rows) if (room.expiresAt <= now) this.rows.delete(code);
  }
}

const NOW = 100_000;
const packet = (id: unknown) => ({
  op: 'sync', code: 'a'.repeat(32), token: 'b'.repeat(32), seq: 1,
  actions: [{ type: 'selectEnemy', id }],
});

async function groundRoom(emerging: boolean) {
  const repository = new MemoryRepository();
  const owner = await handleRoomRequest(repository, { op: 'create', slot: 3, loaded: true }, NOW) as RoomCredentials;
  const room = repository.rows.get(owner.code)!;
  applyAction(room.state, owner.slot, { type: 'start' });
  room.state.combatTime = GROUND_WAVES[0].at;
  room.state.enemies = nextGroundWave(room.state);
  const enemy = room.state.enemies[1];
  if (!emerging) enemy.emergeRemaining = 0;
  const actor = room.state.party[owner.slot];
  actor.x = enemy.x; actor.z = enemy.z; actor.engaged = true;
  // Freeze elapsed room time so this verifies the submitted packet, not trust AI.
  room.updatedAt = NOW + 100;
  assert.ok(validSave(room.state));
  return { repository, owner, room, enemy, actor };
}

test('room target parser accepts every engine-generated ground ID across the finite waves', async () => {
  const { room } = await groundRoom(false);
  const state = room.state;
  state.enemies = [];
  const ids: string[] = [];
  for (const wave of GROUND_WAVES) {
    state.combatTime = wave.at;
    const enemies = nextGroundWave(state);
    assert.equal(enemies.length, wave.kinds.length);
    for (const enemy of enemies) {
      const request = parseRoomRequest(packet(enemy.id));
      assert.equal(request.op, 'sync');
      if (request.op === 'sync') assert.deepEqual(request.actions, [{ type: 'selectEnemy', id: enemy.id }]);
      ids.push(enemy.id);
      enemy.hp = 0;
    }
    state.enemies.push(...enemies);
  }
  assert.equal(new Set(ids).size, 8);
  for (const id of ['boss', 'echo-0', 'echo-1', 'sentinel-0', 'sentinel-5', 'left-hand', 'right-hand']) {
    assert.doesNotThrow(() => parseRoomRequest(packet(id)));
  }
});

test('room target parser still rejects malformed IDs and enemies outside the authored waves', () => {
  for (const id of ['ground-0-0', 'ground-1-2', 'ground-2-3', 'ground-3-3', 'ground-4-0',
    'ground-01-0', 'ground-1--1', 'ground-1-0junk', 'sentinel-6', null, 1]) {
    assert.throws(() => parseRoomRequest(packet(id)), error => error instanceof RoomError && error.status === 400, String(id));
  }
});

test('online selection and attack damage the chosen ground enemy and persist the receipt', async () => {
  const { repository, owner, room, enemy, actor } = await groundRoom(false);
  const bossHp = room.state.boss.hp, enemyHp = enemy.hp, mp = actor.mp;
  const response = await handleRoomRequest(repository, {
    op: 'sync', code: owner.code, token: owner.token, seq: 1, loaded: true,
    actions: [{ type: 'selectEnemy', id: enemy.id }, { type: 'magic', element: 'fire' }],
  }, NOW + 100) as RoomSnapshot;
  assert.equal(response.state.party[owner.slot].enemyTarget, enemy.id);
  assert.ok(response.state.enemies[1].hp < enemyHp);
  assert.ok(response.state.party[owner.slot].mp < mp);
  assert.equal(response.state.boss.hp, bossHp);
  assert.deepEqual(response.actionResults, [{ index: 0, ok: true }, { index: 1, ok: true }]);
  assert.deepEqual(repository.rows.get(owner.code)!.state, response.state);
  const duplicate = await handleRoomRequest(repository, {
    op: 'sync', code: owner.code, token: owner.token, seq: 1, actions: [{ type: 'magic', element: 'fire' }],
  }, NOW + 200) as RoomSnapshot;
  assert.deepEqual(duplicate, response, 'retrying an accepted packet must not damage the shard twice');
});

test('online players can preselect charged ground while premature attacks preserve resources', async () => {
  const { repository, owner, room, enemy, actor } = await groundRoom(true);
  const hp = enemy.hp, mp = actor.mp, cooldowns = structuredClone(actor.cooldowns);
  const response = await handleRoomRequest(repository, {
    op: 'sync', code: owner.code, token: owner.token, seq: 1,
    actions: [{ type: 'selectEnemy', id: enemy.id }, { type: 'magic', element: 'fire' }],
  }, NOW + 100) as RoomSnapshot;
  assert.equal(response.state.party[owner.slot].enemyTarget, enemy.id);
  assert.equal(response.actionResults?.[0].ok, true);
  assert.equal(response.actionResults?.[1].ok, false);
  assert.equal(response.state.enemies[1].hp, hp);
  assert.equal(response.state.party[owner.slot].mp, mp);
  assert.deepEqual(response.state.party[owner.slot].cooldowns, cooldowns);
  assert.equal(response.state.boss.hp, room.state.boss.hp);
});
