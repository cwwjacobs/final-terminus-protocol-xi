import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceRoom, handleRoomRequest, parseRoomRequest, readRoomRequest, RoomError,
  MOVE_TIMEOUT_MS, OWNERSHIP_TIMEOUT_MS, ROOM_TTL_MS, TRUST_TIMEOUT_MS,
  type RoomCredentials, type RoomRepository, type RoomSnapshot, type StoredRoom,
} from "../lib/rooms.ts";

// A cloning repository reproduces separate worker reads and atomic revision guards.
class MemoryRepository implements RoomRepository {
  rows = new Map<string, StoredRoom>();
  conflicts = 0;
  failWrites = false;
  async get(code: string) { return structuredClone(this.rows.get(code) ?? null); }
  async insert(room: StoredRoom) {
    if (this.rows.has(room.code)) return false;
    this.rows.set(room.code, structuredClone(room));
    return true;
  }
  async compareAndSwap(room: StoredRoom, previousRevision: number) {
    if (this.failWrites || this.rows.get(room.code)?.revision !== previousRevision) {
      this.conflicts++;
      return false;
    }
    this.rows.set(room.code, structuredClone(room));
    return true;
  }
  async purgeExpired(now: number) {
    for (const [code, room] of this.rows) if (room.expiresAt <= now) this.rows.delete(code);
  }
}

const NOW = 100_000;
const status = (expected: number) => (error: unknown) => error instanceof RoomError && error.status === expected;
const create = async (repo: MemoryRepository, at = NOW) =>
  await handleRoomRequest(repo, { op: "create", mode: "trial" }, at) as RoomCredentials;
const sync = async (repo: MemoryRepository, session: RoomCredentials, seq: number, at: number, actions: unknown[] = []) =>
  await handleRoomRequest(repo, { op: "sync", code: session.code, token: session.token, seq, actions }, at) as RoomSnapshot;

test("create returns one human and four trusts without private persistence fields", async () => {
  const repo = new MemoryRepository();
  const session = await create(repo);
  assert.match(session.code, /^[a-f0-9]{32}$/);
  assert.match(session.token, /^[a-f0-9]{32}$/);
  assert.notEqual(session.code, session.token);
  assert.equal(session.slot, 0);
  assert.equal(session.state.party.filter((member) => member.human).length, 1);
  assert.equal(session.state.party.length, 5);
  const stored = repo.rows.get(session.code)!;
  assert.equal(stored.expiresAt, NOW + ROOM_TTL_MS);
  assert.ok(!JSON.stringify(stored).includes(session.token), "token is hashed at rest");
  assert.ok(!JSON.stringify(session).includes("tokenHash"));
  assert.ok(!JSON.stringify(session).includes("occupants"));
});

test("five-slot cap is preserved under concurrent joins with CAS retries", async () => {
  const repo = new MemoryRepository();
  const owner = await create(repo);
  const originalGet = repo.get.bind(repo);
  let arrivalsAtRead = 0;
  let releaseReads!: () => void;
  const barrier = new Promise<void>((resolve) => { releaseReads = resolve; });
  repo.get = async (code: string) => {
    const row = await originalGet(code);
    if (arrivalsAtRead < 7) {
      arrivalsAtRead++;
      if (arrivalsAtRead === 7) releaseReads();
      await barrier;
    }
    return row;
  };
  const arrivals = await Promise.allSettled(Array.from({ length: 7 }, () =>
    handleRoomRequest(repo, { op: "join", code: owner.code }, NOW + 100)));
  const joined = arrivals.filter((entry) => entry.status === "fulfilled")
    .map((entry) => (entry as PromiseFulfilledResult<RoomCredentials>).value);
  assert.equal(joined.length, 4);
  assert.equal(new Set([owner.slot, ...joined.map((entry) => entry.slot)]).size, 5);
  assert.equal(repo.rows.get(owner.code)!.state.party.filter((member) => member.human).length, 5);
  assert.equal(arrivals.filter((entry) => entry.status === "rejected" && status(409)(entry.reason)).length, 3);
  assert.ok(repo.conflicts > 0, "parallel worker snapshots actually contested the same revision");
});

test("forged tokens and tokens copied across rooms cannot read or mutate state", async () => {
  const repo = new MemoryRepository();
  const first = await create(repo);
  const second = await create(repo);
  const before = structuredClone(repo.rows);
  await assert.rejects(sync(repo, { ...first, token: "0".repeat(32) }, 0, NOW + 250), status(403));
  await assert.rejects(sync(repo, { ...first, code: second.code }, 0, NOW + 250), status(403));
  assert.deepEqual(repo.rows, before);
  await sync(repo, first, 0, NOW + 250, [{ type: "start" }]);
  assert.equal(repo.rows.get(first.code)!.state.status, "fighting");
  assert.equal(repo.rows.get(second.code)!.state.status, "ready");
});

test("a repeated sequence never replays actions or renews the ownership lease", async () => {
  const repo = new MemoryRepository();
  const owner = await create(repo);
  const accepted = await sync(repo, owner, 0, NOW + 250, [{ type: "start" }]);
  const stored = structuredClone(repo.rows.get(owner.code));
  const duplicate = await sync(repo, owner, 0, NOW + 500, [{ type: "engage" }]);
  assert.equal(duplicate.revision, accepted.revision);
  assert.deepEqual(repo.rows.get(owner.code), stored);
  await assert.rejects(sync(repo, owner, 1, NOW + 251), status(429));
  const newer = await sync(repo, owner, 1, NOW + 500);
  assert.equal(newer.revision, accepted.revision + 1);
});

test("trust takeover retains the session for reconnect and does not steal active slots", async () => {
  const repo = new MemoryRepository();
  const owner = await create(repo);
  const guest = await handleRoomRequest(repo, { op: "join", code: owner.code }, NOW) as RoomCredentials;
  const snapshot = await sync(repo, guest, 0, NOW + TRUST_TIMEOUT_MS + 1);
  assert.equal(snapshot.state.party[owner.slot].human, false);
  assert.equal(snapshot.state.party[guest.slot].human, true);
  const newcomer = await handleRoomRequest(repo, { op: "join", code: owner.code }, NOW + TRUST_TIMEOUT_MS + 100) as RoomCredentials;
  assert.equal(newcomer.slot, 2, "reserved disconnected slot cannot be stolen");
  const reclaimed = await sync(repo, owner, 0, NOW + TRUST_TIMEOUT_MS + 250);
  assert.equal(reclaimed.slot, 0);
  assert.equal(reclaimed.state.party[0].human, true);
});

test("old ownership expires and released tokens can never control a replacement", async () => {
  const repo = new MemoryRepository();
  const owner = await create(repo);
  await assert.rejects(sync(repo, owner, 0, NOW + OWNERSHIP_TIMEOUT_MS), status(403));
  const replacement = await handleRoomRequest(repo, { op: "join", code: owner.code }, NOW + OWNERSHIP_TIMEOUT_MS) as RoomCredentials;
  assert.equal(replacement.slot, 0);
  assert.notEqual(replacement.token, owner.token);
  await assert.rejects(sync(repo, owner, 1, NOW + OWNERSHIP_TIMEOUT_MS + 250), status(403));
  assert.equal((await sync(repo, replacement, 0, NOW + OWNERSHIP_TIMEOUT_MS + 250)).slot, 0);
});

test("leave immediately returns the actor to trust control and revokes the token", async () => {
  const repo = new MemoryRepository();
  const owner = await create(repo);
  await handleRoomRequest(repo, { op: "leave", code: owner.code, token: owner.token }, NOW + 250);
  assert.equal(repo.rows.get(owner.code)!.state.party[0].human, false);
  await assert.rejects(sync(repo, owner, 0, NOW + 500), status(403));
  const next = await handleRoomRequest(repo, { op: "join", code: owner.code }, NOW + 500) as RoomCredentials;
  assert.equal(next.slot, 0);
});

test("held movement stops after 600ms and a sleeping room has bounded simulation catchup", async () => {
  const repo = new MemoryRepository();
  const owner = await create(repo);
  await sync(repo, owner, 0, NOW, [{ type: "start" }, { type: "move", x: 1, z: 0 }]);
  const stored = repo.rows.get(owner.code)!;
  assert.equal(stored.state.party[0].moveX, 1);
  advanceRoom(stored, NOW + MOVE_TIMEOUT_MS + 100);
  assert.equal(stored.state.party[0].moveX, 0);
  assert.equal(stored.state.party[0].moveZ, 0);
  const afterTimeout = stored.state.party[0].x;
  advanceRoom(stored, NOW + MOVE_TIMEOUT_MS + 500);
  assert.equal(stored.state.party[0].x, afterTimeout);
  const longSleep = structuredClone(stored);
  const shortSleep = structuredClone(stored);
  // Presence is the same in both comparisons; only server elapsed time differs.
  longSleep.occupants = longSleep.occupants.map(() => null);
  shortSleep.occupants = shortSleep.occupants.map(() => null);
  advanceRoom(longSleep, NOW + 60_000);
  advanceRoom(shortSleep, shortSleep.updatedAt + 1_000);
  assert.deepEqual(longSleep.state, shortSleep.state);
});

test("expired and missing rooms report explicit statuses", async () => {
  const repo = new MemoryRepository();
  const owner = await create(repo);
  await assert.rejects(handleRoomRequest(repo, { op: "join", code: owner.code }, NOW + ROOM_TTL_MS), status(410));
  await assert.rejects(handleRoomRequest(repo, { op: "join", code: "0".repeat(32) }, NOW), status(404));
  await create(repo, NOW + ROOM_TTL_MS);
  assert.ok(!repo.rows.has(owner.code), "expired rows are pruned on new room creation");
});

test("bounded CAS retries expose a retryable conflict without publishing a speculative state", async () => {
  const repo = new MemoryRepository();
  const owner = await create(repo);
  repo.failWrites = true;
  await assert.rejects(sync(repo, owner, 0, NOW + 250, [{ type: "start" }]), status(409));
  assert.equal(repo.conflicts, 8);
  assert.equal(repo.rows.get(owner.code)!.revision, 0);
  assert.equal(repo.rows.get(owner.code)!.state.status, "ready");
});

test("request validation accepts only bounded intents and normalizes diagonals", () => {
  const base = { op: "sync", code: "a".repeat(32), token: "b".repeat(32), seq: 0, actions: [] };
  for (const invalid of [
    null, [], { op: "create", mode: "cheat" }, { ...base, state: {} }, { ...base, elapsed: 5 },
    { ...base, seq: -1 }, { ...base, seq: 0.1 }, { ...base, seq: Infinity },
    { ...base, actions: Array.from({ length: 13 }, () => ({ type: "guard" })) },
    { ...base, actions: [{ type: "move", x: Infinity, z: 0 }] },
    { ...base, actions: [{ type: "move", x: 0, z: 0, facing: NaN }] },
    { ...base, actions: [{ type: "move", x: 50, z: 0 }] },
    { ...base, actions: [{ type: "weapon", id: "cleave", damage: 9999 }] },
    { ...base, actions: [{ type: "magic", element: "void" }] },
    { ...base, actions: [{ type: "teleport" }] },
  ]) assert.throws(() => parseRoomRequest(invalid), status(400));
  const parsed = parseRoomRequest({ ...base, actions: [{ type: "move", x: 1, z: 1, facing: 2 }] });
  assert.equal(parsed.op, "sync");
  if (parsed.op === "sync" && parsed.actions[0].type === "move") {
    assert.ok(Math.abs(Math.hypot(parsed.actions[0].x, parsed.actions[0].z) - 1) < 1e-12);
    assert.equal(parsed.actions[0].facing, 2);
  }
});

test("HTTP body parsing rejects malformed, oversized and non-JSON payloads", async () => {
  const request = (body: string, contentType = "application/json") => new Request("https://example.com/api/rooms", {
    method: "POST", headers: { "Content-Type": contentType }, body,
  });
  await assert.rejects(readRoomRequest(request("{")), status(400));
  await assert.rejects(readRoomRequest(request(" ".repeat(8193))), status(413));
  await assert.rejects(readRoomRequest(request("{}", "text/plain")), status(415));
  await assert.rejects(readRoomRequest(request("{}", "application/json-untrusted")), status(415));
  assert.deepEqual(await readRoomRequest(request('{"op":"create"}')), { op: "create", mode: "trial" });
});
