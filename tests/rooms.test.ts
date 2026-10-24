import test from "node:test";
import assert from "node:assert/strict";
import { REVELRY } from "../game/content.ts";
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

function makeLegacy(room: StoredRoom) {
  Reflect.set(room.state, "version", 1);
  for (const key of ["rng", "sequenceSeq"]) Reflect.deleteProperty(room.state, key);
  Reflect.deleteProperty(room.state.boss, "cooldowns");
  for (const actor of room.state.party) for (const key of [
    "shieldCharges", "recovery", "spellRecovery", "selfChainUntil", "rapidWeave", "elementalCycle", "sequence",
  ]) Reflect.deleteProperty(actor, key);
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

test("legacy rooms migrate before duplicate snapshots and persist defaults on the next accepted sync", async () => {
  const repo = new MemoryRepository();
  const owner = await create(repo);
  await sync(repo, owner, 0, NOW);
  const stored = repo.rows.get(owner.code)!;
  makeLegacy(stored);
  stored.state.party[0].tp = 1234;
  stored.state.party[0].revelryStacks = 3;
  for (const actor of stored.state.party.slice(1)) Reflect.deleteProperty(actor, "revelryStacks");
  const legacy = structuredClone(stored);
  const duplicate = await sync(repo, owner, 0, NOW + 250, [{ type: "revelry" }]);
  assert.deepEqual(duplicate.state.party.map(actor => actor.revelryStacks), [3, 0, 0, 0, 0]);
  assert.equal(duplicate.state.party[0].tp, 1234);
  assert.equal(duplicate.revision, legacy.revision);
  assert.deepEqual(repo.rows.get(owner.code), legacy, "duplicate does not write or replay its action");
  const next = await sync(repo, owner, 1, NOW + 250);
  assert.deepEqual(next.state.party.map(actor => actor.revelryStacks), [3, 0, 0, 0, 0]);
  assert.equal(next.state.party[0].tp, 1234);
  assert.equal(next.revision, legacy.revision + 1);
  assert.deepEqual(repo.rows.get(owner.code)!.state.party.map(actor => actor.revelryStacks), [3, 0, 0, 0, 0]);
  assert.equal(repo.rows.get(owner.code)!.occupants[0]!.tokenHash, legacy.occupants[0]!.tokenHash);
});

test("joining a legacy room restores absent recipient stacks before returning the snapshot", async () => {
  const repo = new MemoryRepository();
  const owner = await create(repo);
  const stored = repo.rows.get(owner.code)!;
  makeLegacy(stored);
  for (const actor of stored.state.party) Reflect.deleteProperty(actor, "revelryStacks");
  const joined = await handleRoomRequest(repo, { op: "join", code: owner.code }, NOW) as RoomCredentials;
  assert.deepEqual(joined.state.party.map(actor => actor.revelryStacks), [0, 0, 0, 0, 0]);
  assert.equal(joined.slot, 1);
  assert.equal(joined.state.party.filter(actor => actor.human).length, 2);
});

test("stored malformed Revelry counts fail without rewriting the room", async () => {
  for (const count of [undefined, null, "1", -1, 0.5, 6, NaN, Infinity]) {
    const repo = new MemoryRepository();
    const owner = await create(repo);
    (repo.rows.get(owner.code)!.state.party[0] as unknown as Record<string, unknown>).revelryStacks = count;
    const before = structuredClone(repo.rows);
    await assert.rejects(sync(repo, owner, 0, NOW + 250), status(500));
    assert.deepEqual(repo.rows, before);
  }
});

test("Revelry accepts an intent only and rejects client-supplied buff authority", () => {
  const base = { op: "sync", code: "a".repeat(32), token: "b".repeat(32), seq: 0 };
  const parsed = parseRoomRequest({ ...base, actions: [{ type: "revelry" }] });
  assert.equal(parsed.op, "sync");
  if (parsed.op === "sync") assert.deepEqual(parsed.actions, [{ type: "revelry" }]);
  for (const extra of [{ stacks: 5 }, { revelryStacks: 5 }, { targets: [0, 1] }, { damage: 9999 }, { multiplier: 2 }, { cooldown: 0 }]) {
    assert.throws(() => parseRoomRequest({ ...base, actions: [{ type: "revelry", ...extra }] }), status(400));
  }
});

test("server enforces Revelry role and cooldown, and duplicate packets cannot grant more stacks", async () => {
  const repo = new MemoryRepository();
  const owner = await create(repo);
  const guest = await handleRoomRequest(repo, { op: "join", code: owner.code }, NOW) as RoomCredentials;
  const cast = await sync(repo, owner, 0, NOW, [{ type: "start" }, { type: "revelry" }]);
  assert.deepEqual(cast.state.party.map(actor => actor.revelryStacks), [1, 1, 1, 1, 1]);
  assert.equal(cast.state.party[0].cooldowns.revelry, REVELRY.cooldown);
  const duplicate = await sync(repo, owner, 0, NOW + 250, [{ type: "revelry" }]);
  assert.deepEqual(duplicate, cast);
  const forbidden = await sync(repo, guest, 0, NOW + 250, [{ type: "revelry" }]);
  assert.equal(forbidden.actionErrors?.length, 1);
  assert.equal(forbidden.state.party[guest.slot].cooldowns.revelry, undefined);
  assert.deepEqual(forbidden.state.party.map(actor => actor.revelryStacks), [1, 1, 1, 1, 1]);
  const coolingDown = await sync(repo, owner, 1, NOW + 500, [{ type: "revelry" }]);
  assert.equal(coolingDown.actionErrors?.length, 1);
  assert.deepEqual(coolingDown.state.party.map(actor => actor.revelryStacks), [1, 1, 1, 1, 1]);
});

test("new combat requests accept intent and optional healing slot, never outcome authority", () => {
  const base = { op: "sync", code: "a".repeat(32), token: "b".repeat(32), seq: 0 };
  const actions = [
    { type: "criticalDash" }, { type: "splitVolley" }, { type: "rapidWeave" }, { type: "aegis" },
    { type: "heal" }, { type: "heal", target: 0 }, { type: "heal", target: 4 },
  ];
  const parsed = parseRoomRequest({ ...base, actions });
  assert.equal(parsed.op, "sync");
  if (parsed.op === "sync") assert.deepEqual(parsed.actions, actions);
  const forbidden = [
    { damage: 9999 }, { tp: 3000 }, { critical: true }, { shieldCharges: 1 }, { charges: { fire: 2 } },
    { cooldown: 0 }, { rng: 0 }, { sequence: { id: 1, nextHit: 0 } }, { elapsed: 0.5 },
    { originX: 10, originZ: 0 }, { role: "luminary" }, { targets: [0, 1, 2, 3, 4] },
  ];
  for (const action of actions) for (const extra of forbidden) {
    assert.throws(() => parseRoomRequest({ ...base, actions: [{ ...action, ...extra }] }), status(400));
  }
  for (const target of [-1, 5, 0.5, null, undefined, NaN, Infinity, "1"]) {
    assert.throws(() => parseRoomRequest({ ...base, actions: [{ type: "heal", target }] }), status(400));
  }
  for (const type of ["criticalDash", "splitVolley", "rapidWeave", "aegis"]) {
    assert.throws(() => parseRoomRequest({ ...base, actions: [{ type, target: 0 }] }), status(400));
  }
});

test("legacy room recasts migrate on duplicate reads and persist with the next accepted revision", async () => {
  const repo = new MemoryRepository();
  const owner = await create(repo);
  await sync(repo, owner, 0, NOW);
  const stored = repo.rows.get(owner.code)!;
  makeLegacy(stored);
  stored.state.party[0].cooldowns = { magic: 7, weapon: 2, revelry: 30 };
  const before = structuredClone(stored);
  const duplicate = await sync(repo, owner, 0, NOW + 100);
  assert.equal(duplicate.state.version, 2);
  assert.deepEqual(duplicate.state.party[0].cooldowns, {
    'magic:fire': 7, 'magic:ice': 7, 'magic:lightning': 7,
    'weapon:cleave': 2, 'weapon:pierce': 2, 'weapon:resonance': 2, revelry: 30,
  });
  assert.deepEqual(repo.rows.get(owner.code), before, 'duplicate remains read only');
  const accepted = await sync(repo, owner, 1, NOW + 100);
  assert.equal(accepted.state.version, 2);
  for (const key of ['magic:fire', 'magic:ice', 'magic:lightning']) {
    assert.ok(Math.abs(accepted.state.party[0].cooldowns[key] - 6.9) < 1e-9);
  }
  assert.equal(repo.rows.get(owner.code)!.occupants[0]!.tokenHash, before.occupants[0]!.tokenHash);
});

test("malformed stored mechanics reject duplicate and accepted requests without a room write", async () => {
  for (const corrupt of [
    (state: StoredRoom['state']) => { state.rng = -1; },
    (state: StoredRoom['state']) => { state.party[0].shieldCharges = 2; },
    (state: StoredRoom['state']) => { Reflect.set(state.party[0], 'sequence', { id: 1 }); },
    (state: StoredRoom['state']) => { Reflect.set(state.party[3], 'rapidWeave', { remaining: 12, charges: {} }); },
    (state: StoredRoom['state']) => { state.party[4].cooldowns.aegis = Infinity; },
  ]) {
    const repo = new MemoryRepository();
    const owner = await create(repo);
    await sync(repo, owner, 0, NOW);
    corrupt(repo.rows.get(owner.code)!.state);
    const before = structuredClone(repo.rows);
    await assert.rejects(sync(repo, owner, 0, NOW + 100), status(500));
    await assert.rejects(sync(repo, owner, 1, NOW + 100), status(500));
    assert.deepEqual(repo.rows, before);
  }
});

test("Critical Dash duplicate requests and reconnect snapshots retain the hit cursor without replay", async () => {
  const repo = new MemoryRepository();
  const owner = await create(repo);
  const stored = repo.rows.get(owner.code)!;
  stored.state.party[0].x = stored.state.boss.x;
  stored.state.party[0].z = stored.state.boss.z + 3;
  stored.state.party.slice(1).forEach(actor => { actor.hp = 0; });
  const activation = await sync(repo, owner, 0, NOW, [{ type: "start" }, { type: "criticalDash" }]);
  assert.equal(activation.actionErrors?.length ?? 0, 0);
  assert.equal(activation.state.party[0].sequence?.id, 1);
  const partial = await sync(repo, owner, 1, NOW + 400);
  assert.equal(partial.state.party[0].sequence?.nextHit, 1);
  assert.equal(partial.state.runStats.party[0].damage, 224);
  const before = structuredClone(repo.rows.get(owner.code));
  const duplicate = await sync(repo, owner, 1, NOW + 800, [{ type: "criticalDash" }]);
  assert.deepEqual(duplicate, partial);
  assert.deepEqual(repo.rows.get(owner.code), before);
  const completed = await sync(repo, owner, 2, NOW + 1400);
  assert.equal(completed.state.party[0].sequence, null);
  assert.equal(completed.state.sequenceSeq, 1);
  assert.equal(completed.state.runStats.party[0].damage, completed.state.boss.maxHp - completed.state.boss.hp,
    'the authoritative snapshot persists run totals across worker reads and duplicate packets');
  const again = await sync(repo, owner, 3, NOW + 1500, [{ type: "criticalDash" }]);
  assert.equal(again.actionErrors?.length, 1, 'reconnect does not refresh the ability cooldown');
  assert.equal(again.state.sequenceSeq, 1);
});

test("action receipts distinguish a prior successful Mend from a rejected newer packet and survive retries", async () => {
  const repo = new MemoryRepository();
  const owner = await create(repo);
  const sessions = [owner];
  for (let slot = 1; slot < 5; slot++) {
    sessions.push(await handleRoomRequest(repo, { op: "join", code: owner.code }, NOW) as RoomCredentials);
  }
  const healer = sessions[4];
  await sync(repo, owner, 0, NOW, [{ type: "start" }]);
  repo.rows.get(owner.code)!.state.party[0].hp = 500;
  const healed = await sync(repo, healer, 0, NOW, [{ type: "heal", target: 0 }, { type: "criticalDash" }]);
  assert.equal(healed.actionSeq, 0);
  assert.deepEqual(healed.actionResults?.map(({ index, ok }) => ({ index, ok })), [
    { index: 0, ok: true }, { index: 1, ok: false },
  ]);
  assert.equal(healed.actionErrors?.length, 1);
  assert.ok(healed.state.events.some(event => event.kind === "heal" && event.actor === 4 && event.target === 0));
  const rejected = await sync(repo, healer, 1, NOW + 100, [{ type: "heal", target: 0 }]);
  assert.equal(rejected.actionSeq, 1);
  assert.deepEqual(rejected.actionResults?.map(({ index, ok }) => ({ index, ok })), [{ index: 0, ok: false }]);
  assert.ok(rejected.actionResults?.[0].error);
  assert.ok(rejected.state.events.some(event => event.kind === "heal" && event.actor === 4 && event.target === 0),
    "an old matching visual event cannot stand in for the rejected packet's receipt");
  const before = structuredClone(repo.rows.get(owner.code));
  const duplicate = await sync(repo, healer, 1, NOW + 500, [{ type: "heal", target: 0 }]);
  assert.deepEqual(duplicate, rejected, "a lost response can be retried without losing its outcome");
  assert.deepEqual(repo.rows.get(owner.code), before);
  const older = await sync(repo, healer, 0, NOW + 500, [{ type: "heal", target: 0 }]);
  assert.equal(older.actionSeq, 1, "an older packet must never receive a newer receipt labeled with its old sequence");
  const observer = await sync(repo, owner, 1, NOW + 500);
  assert.equal(observer.actionSeq, 1);
  assert.deepEqual(observer.actionResults, [], "receipts are scoped to the authenticated actor");
});

test("clients cannot supply packet receipts or per-action acceptance", () => {
  const base = { op: "sync", code: "a".repeat(32), token: "b".repeat(32), seq: 0, actions: [] };
  for (const extra of [
    { actionSeq: 0 }, { actionResults: [{ index: 0, ok: true }] }, { lastResults: [{ index: 0, ok: true }] },
  ]) assert.throws(() => parseRoomRequest({ ...base, ...extra }), status(400));
  assert.throws(() => parseRoomRequest({ ...base, actions: [{ type: "heal", target: 0, ok: true }] }), status(400));
});

test("a trust heal during reconnect cannot acknowledge a rejected manual heal intent", async () => {
  const repo = new MemoryRepository();
  const owner = await create(repo);
  const sessions = [owner];
  for (let slot = 1; slot < 5; slot++) {
    sessions.push(await handleRoomRequest(repo, { op: "join", code: owner.code }, NOW) as RoomCredentials);
  }
  await sync(repo, owner, 0, NOW, [{ type: "start" }]);
  const stored = repo.rows.get(owner.code)!;
  stored.state.party[0].hp = 500;
  const response = await sync(repo, sessions[4], 0, NOW + TRUST_TIMEOUT_MS + 100, [{ type: "heal", target: 0 }]);
  assert.ok(response.state.events.some(event => event.kind === "heal" && event.actor === 4 && event.target === 0),
    "the reconnect catch-up lets Ariadne heal as a trust before this input is considered");
  assert.deepEqual(response.actionResults?.map(({ index, ok }) => ({ index, ok })), [{ index: 0, ok: false }]);
  assert.equal(response.actionSeq, 0);
  assert.ok(response.actionResults?.[0].error?.includes("cooldown"));
});
