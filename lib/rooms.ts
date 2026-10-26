import { applyAction, createGame, setHuman, stepGame } from "../game/engine.ts";
import type { Action, GameState } from "../game/types.ts";
import { restoreSave } from "./local-save.ts";
import { normalizeInviteCode } from "./room-invite.ts";

export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
export const TRUST_TIMEOUT_MS = 8_000;
export const OWNERSHIP_TIMEOUT_MS = 45_000;
export const MOVE_TIMEOUT_MS = 600;
export const MAX_CATCHUP_MS = 1_000;
export const MAX_REQUEST_BYTES = 8_192;
export const MAX_ACTIONS = 12;
const MAX_CAS_ATTEMPTS = 8;
const MIN_SYNC_MS = 80;
const HEX_SECRET = /^[a-f0-9]{32}$/;

export class RoomError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RoomError";
    this.status = status;
  }
}

export type RoomRequest =
  | { op: "create"; mode: "trial" | "god"; slot?: number; loaded?: boolean }
  | { op: "join"; code: string; slot?: number; loaded?: boolean }
  | { op: "selectHero"; code: string; token: string; slot: number }
  | { op: "sync"; code: string; token: string; seq: number; actions: Action[]; loaded?: boolean }
  | { op: "reset"; code: string; token: string; mode?: "trial" | "god" }
  | { op: "leave"; code: string; token: string };

interface Occupant {
  tokenHash: string;
  lastSeen: number;
  lastSeq: number;
  /** Explicit readiness for current clients; absent on legacy clients/rooms. */
  loaded?: boolean;
  /** The latest accepted packet's receipt; older stored rooms may omit it. */
  lastResults?: ActionReceipt[];
}

export interface ActionReceipt {
  index: number;
  ok: boolean;
  error?: string;
}

/** Private persistence format. Never serialize this object to a client. */
export interface StoredRoom {
  code: string;
  revision: number;
  state: GameState;
  occupants: (Occupant | null)[];
  /** Absent on rooms created before lobby controls were introduced. */
  hostSlot?: number | null;
  updatedAt: number;
  expiresAt: number;
}

export interface RoomRepository {
  get(code: string): Promise<StoredRoom | null>;
  insert(room: StoredRoom): Promise<boolean>;
  compareAndSwap(room: StoredRoom, previousRevision: number): Promise<boolean>;
  purgeExpired(now: number): Promise<void>;
}

export interface RoomMember {
  slot: number;
  connected: boolean;
  /** A disconnected player's slot remains reserved for reconnection. */
  reserved: boolean;
  loaded?: boolean;
}

export interface RoomSnapshot {
  state: GameState;
  revision: number;
  slot: number;
  hostSlot: number | null;
  members: RoomMember[];
  /** Gameplay failures (cooldown, range, TP) are safe to display to the player. */
  actionErrors?: string[];
  /** Outcomes belong to exactly this packet and its zero-based action indexes. */
  actionSeq?: number;
  actionResults?: ActionReceipt[];
}

export interface RoomCredentials extends RoomSnapshot {
  code: string;
  token: string;
}

export type RoomResponse = RoomSnapshot | RoomCredentials | { ok: true };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RoomError(400, "Expected a JSON object.");
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new RoomError(400, "Unexpected request field.");
  }
}

function secret(value: unknown, label: string): string {
  if (typeof value !== "string" || !HEX_SECRET.test(value)) {
    throw new RoomError(400, `Invalid ${label}.`);
  }
  return value;
}

function heroSlot(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= 5) {
    throw new RoomError(400, "Hero must be a party slot from 0 to 4.");
  }
  return value;
}

function loadingField(input: Record<string, unknown>): { loaded?: boolean } {
  if (!Object.hasOwn(input, 'loaded')) return {};
  if (typeof input.loaded !== 'boolean') throw new RoomError(400, 'Loaded must be a boolean.');
  return { loaded: input.loaded };
}

function parseAction(value: unknown): Action {
  const action = record(value);
  if (action.type === "move") {
    exactKeys(action, ["type", "x", "z", "facing"]);
    if (typeof action.x !== "number" || !Number.isFinite(action.x) ||
        typeof action.z !== "number" || !Number.isFinite(action.z) ||
        Math.abs(action.x) > 1 || Math.abs(action.z) > 1 ||
        (action.facing !== undefined && (typeof action.facing !== "number" || !Number.isFinite(action.facing)))) {
      throw new RoomError(400, "Movement and facing must be finite; movement must be between -1 and 1.");
    }
    const length = Math.max(1, Math.hypot(action.x, action.z));
    return { type: "move", x: action.x / length, z: action.z / length,
      ...(action.facing !== undefined ? { facing: action.facing as number } : {}),
    };
  }
  if (action.type === "weapon") {
    exactKeys(action, ["type", "id"]);
    if (!["cleave", "pierce", "resonance"].includes(action.id as string)) {
      throw new RoomError(400, "Unknown weapon skill.");
    }
    return { type: "weapon", id: action.id } as Action;
  }
  if (action.type === 'selectEnemy') {
    exactKeys(action, ['type', 'id']);
    if (typeof action.id !== 'string' || !/^(boss|echo-[01]|sentinel-[0-5]|left-hand|right-hand)$/.test(action.id)) throw new RoomError(400, 'Unknown enemy target.');
    return { type: 'selectEnemy', id: action.id };
  }
  if (action.type === "selectShot") {
    exactKeys(action, ["type", "element"]);
    if (action.element !== undefined && !["fire", "ice", "lightning"].includes(action.element as string)) throw new RoomError(400, "Unknown shot element.");
    return { type: "selectShot", ...(action.element === undefined ? {} : { element: action.element }) } as Action;
  }
  if (action.type === "magic") {
    exactKeys(action, ["type", "element"]);
    if (!["fire", "ice", "lightning"].includes(action.element as string)) {
      throw new RoomError(400, "Unknown magic element.");
    }
    return { type: "magic", element: action.element } as Action;
  }
  if (action.type === "heal" || action.type === "mendingThread") {
    exactKeys(action, ["type", "target"]);
    if (Object.hasOwn(action, "target") && (!Number.isInteger(action.target) ||
      (action.target as number) < 0 || (action.target as number) >= 5)) {
      throw new RoomError(400, "Healing target must be a party slot.");
    }
    return { type: action.type, ...(Object.hasOwn(action, "target") ? { target: action.target as number } : {}) };
  }
  if (["engage", "provoke", "guard", "dodge", "start", "revelry", "criticalDash", "splitVolley", "rapidWeave", "aegis", "elementalShot", "shimmerWave", "faceLogos", "fission", "rainOfFire", "rejuvenator", "fearless", "thunderclap", "lightningShock", "bolt", "clap"].includes(action.type as string)) {
    exactKeys(action, ["type"]);
    return { type: action.type } as Action;
  }
  throw new RoomError(400, "Unknown action.");
}

/** Rejects authority-bearing extras such as damage, elapsed time or client state. */
export function parseRoomRequest(value: unknown): RoomRequest {
  const input = record(value);
  switch (input.op) {
    case "create": {
      exactKeys(input, ["op", "mode", "slot", "loaded"]);
      if (input.mode !== undefined && input.mode !== "trial" && input.mode !== "god") {
        throw new RoomError(400, "Unknown encounter mode.");
      }
      return { op: "create", mode: input.mode === "god" ? "god" : "trial", ...loadingField(input),
        ...(Object.hasOwn(input, "slot") ? { slot: heroSlot(input.slot) } : {}) };
    }
    case "join": {
      exactKeys(input, ["op", "code", "slot", "loaded"]);
      const code = normalizeInviteCode(input.code);
      if (!code) throw new RoomError(400, "Invalid invite code. Paste the full code or invite link.");
      return { op: "join", code, ...loadingField(input), ...(Object.hasOwn(input, "slot") ? { slot: heroSlot(input.slot) } : {}) };
    }
    case "selectHero":
      exactKeys(input, ["op", "code", "token", "slot"]);
      return { op: "selectHero", code: secret(input.code, "room code"), token: secret(input.token, "session token"), slot: heroSlot(input.slot) };
    case "sync": {
      exactKeys(input, ["op", "code", "token", "seq", "actions", "loaded"]);
      if (typeof input.seq !== "number" || !Number.isSafeInteger(input.seq) || input.seq < 0) {
        throw new RoomError(400, "Sequence must be a nonnegative safe integer.");
      }
      if (!Array.isArray(input.actions) || input.actions.length > MAX_ACTIONS) {
        throw new RoomError(400, `Send at most ${MAX_ACTIONS} actions per sync.`);
      }
      return {
        op: "sync", code: secret(input.code, "room code"), token: secret(input.token, "session token"),
        seq: input.seq, actions: input.actions.map(parseAction), ...loadingField(input),
      };
    }
    case "leave":
      exactKeys(input, ["op", "code", "token"]);
      return { op: "leave", code: secret(input.code, "room code"), token: secret(input.token, "session token") };
    case "reset":
      exactKeys(input, ["op", "code", "token", "mode"]);
      if (input.mode !== undefined && input.mode !== "trial" && input.mode !== "god") {
        throw new RoomError(400, "Unknown encounter mode.");
      }
      return { op: "reset", code: secret(input.code, "room code"), token: secret(input.token, "session token"),
        ...(input.mode === undefined ? {} : { mode: input.mode as "trial" | "god" }) };
    default:
      throw new RoomError(400, "Unknown room operation.");
  }
}

/** Reads a bounded body even when Content-Length is absent or untrustworthy. */
export async function readRoomRequest(request: Request): Promise<RoomRequest> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new RoomError(415, "Send application/json.");
  }
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > MAX_REQUEST_BYTES) {
    throw new RoomError(413, "Request is too large.");
  }
  if (!request.body) throw new RoomError(400, "A JSON body is required.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new RoomError(413, "Request is too large.");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return parseRoomRequest(JSON.parse(text));
  } catch (error) {
    if (error instanceof RoomError) throw error;
    throw new RoomError(400, "Malformed JSON body.");
  } finally {
    reader.releaseLock();
  }
}

function randomSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashToken(code: string, token: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${code}:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function equalHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function ensureHost(room: StoredRoom) {
  if (!Number.isInteger(room.hostSlot) || !room.occupants[room.hostSlot as number]) {
    const connected = room.occupants.findIndex((occupant, slot) => occupant !== null && room.state.party[slot].human);
    const first = connected === -1 ? room.occupants.findIndex(occupant => occupant !== null) : connected;
    room.hostSlot = first === -1 ? null : first;
  }
}

function applyPresence(room: StoredRoom, at: number) {
  room.occupants.forEach((occupant, slot) => {
    const absent = !occupant || at - occupant.lastSeen >= TRUST_TIMEOUT_MS;
    if (room.state.party[slot].human === absent) setHuman(room.state, slot, !absent);
    if (occupant && at - occupant.lastSeen > MOVE_TIMEOUT_MS) {
      room.state.party[slot].moveX = 0;
      room.state.party[slot].moveZ = 0;
    }
    if (occupant && at - occupant.lastSeen >= OWNERSHIP_TIMEOUT_MS) room.occupants[slot] = null;
  });
  ensureHost(room);
}

/** Wall-clock authority, fixed 50ms ticks, bounded CPU after an idle room. */
export function advanceRoom(room: StoredRoom, now: number): void {
  const end = Math.max(now, room.updatedAt);
  let tick = Math.max(room.updatedAt, end - MAX_CATCHUP_MS);
  while (tick < end) {
    const milliseconds = Math.min(50, end - tick);
    applyPresence(room, tick);
    stepGame(room.state, milliseconds / 1000);
    tick += milliseconds;
  }
  applyPresence(room, end);
  room.updatedAt = end;
}

function snapshot(room: StoredRoom, slot: number): RoomSnapshot {
  ensureHost(room);
  const occupant = room.occupants[slot];
  const results = occupant?.lastResults;
  const actionErrors = results?.filter(result => !result.ok).map(result => result.error ?? "Action unavailable.");
  return {
    state: structuredClone(room.state), revision: room.revision, slot, hostSlot: room.hostSlot ?? null,
    members: room.occupants.map((occupant, memberSlot) => ({
      slot: memberSlot, connected: !!occupant && room.state.party[memberSlot].human,
      reserved: !!occupant && !room.state.party[memberSlot].human,
      ...(occupant?.loaded === undefined ? {} : { loaded: occupant.loaded }),
    })),
    ...(actionErrors?.length ? { actionErrors } : {}),
    ...(occupant && results ? { actionSeq: occupant.lastSeq, actionResults: structuredClone(results) } : {}),
  };
}

/** All mutations use CAS: another request can never overwrite a newer simulation. */
export async function handleRoomRequest(
  repository: RoomRepository,
  rawRequest: unknown,
  now = Date.now(),
): Promise<RoomResponse> {
  const request = parseRoomRequest(rawRequest);
  if (request.op === "create") {
    await repository.purgeExpired(now);
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = randomSecret();
      const token = randomSecret();
      const state = createGame(request.mode);
      const hostSlot = request.slot ?? 0;
      for (let slot = 0; slot < 5; slot++) setHuman(state, slot, slot === hostSlot);
      const occupants: StoredRoom["occupants"] = Array.from({ length: 5 }, () => null);
      occupants[hostSlot] = { tokenHash: await hashToken(code, token), lastSeen: now, lastSeq: -1, ...(request.loaded === undefined ? {} : { loaded: request.loaded }) };
      const room: StoredRoom = {
        code, revision: 0, state, hostSlot, updatedAt: now, expiresAt: now + ROOM_TTL_MS, occupants,
      };
      if (await repository.insert(room)) return { ...snapshot(room, hostSlot), code, token };
    }
    throw new RoomError(503, "Unable to allocate a room. Try again.");
  }

  const token = request.op === "join" ? randomSecret() : request.token;
  const tokenHash = await hashToken(request.code, token);
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const room = await repository.get(request.code);
    if (!room) throw new RoomError(404, "Room was not found.");
    if (room.expiresAt <= now) throw new RoomError(410, "Room expired. Create a new encounter.");
    // Normalize trusted persisted JSON before either simulation or a duplicate
    // packet snapshot. A successful CAS below also persists the additive fields.
    const migrated = restoreSave(room.state);
    if (!migrated) throw new RoomError(500, "Room data is incompatible. Create a new encounter.");
    room.state = migrated;
    ensureHost(room);
    const previousRevision = room.revision;
    let slot: number;
    if (request.op === "join") {
      advanceRoom(room, now);
      slot = request.slot !== undefined && room.occupants[request.slot] === null
        ? request.slot : room.occupants.findIndex((occupant) => occupant === null);
      if (slot === -1) throw new RoomError(409, "Party is full. Disconnected slots remain reserved for 45 seconds.");
      room.occupants[slot] = { tokenHash, lastSeen: now, lastSeq: -1, ...(request.loaded === undefined ? {} : { loaded: request.loaded }) };
      setHuman(room.state, slot, true);
      ensureHost(room);
    } else {
      slot = room.occupants.findIndex((occupant) => occupant && equalHash(occupant.tokenHash, tokenHash));
      if (slot === -1) throw new RoomError(403, "Invalid or released session. Join the room again.");
      const occupant = room.occupants[slot]!;
      if (now - occupant.lastSeen >= OWNERSHIP_TIMEOUT_MS) {
        throw new RoomError(403, "Session expired. Join the room again.");
      }
      if (request.op === "sync" && request.seq <= occupant.lastSeq) {
        // A retried network packet neither replays actions nor extends ownership.
        return snapshot(room, slot);
      }
      if (request.op === "sync" && occupant.lastSeq >= 0 && now - occupant.lastSeen < MIN_SYNC_MS) {
        throw new RoomError(429, "Sync requests are too frequent. Retry shortly.");
      }
      if (request.op === "reset") {
        if (room.hostSlot !== slot) throw new RoomError(403, "Only the host can prepare the next encounter.");
        if (room.state.status === "fighting") throw new RoomError(409, "Finish the current encounter before returning the room to the lobby.");
        // A lost reset response may be retried after the lobby has resumed
        // polling. Return the stored snapshot; do not expose speculative ticks.
        if (room.state.status === "ready" && room.state.mode === (request.mode ?? room.state.mode)) return snapshot(room, slot);
      }
      if (request.op === "selectHero") {
        if (room.state.status !== "ready") throw new RoomError(409, "Return to the lobby before choosing a hero.");
        // Retrying an already accepted choice does not mutate the lobby or lease.
        if (request.slot === slot) return snapshot(room, slot);
      }
      advanceRoom(room, now);
      if (request.op === "leave") {
        room.occupants[slot] = null;
        setHuman(room.state, slot, false);
        ensureHost(room);
      } else if (request.op === "reset") {
        const mode = request.mode ?? room.state.mode;
        room.state = createGame(mode);
        room.occupants.forEach((member, memberSlot) => {
          setHuman(room.state, memberSlot, !!member && now - member.lastSeen < TRUST_TIMEOUT_MS);
          if (member) delete member.lastResults;
        });
        occupant.lastSeen = now;
      } else if (request.op === "selectHero") {
        if (room.occupants[request.slot] !== null) {
          throw new RoomError(409, "That hero is occupied or reserved for a reconnecting player.");
        }
        const oldSlot = slot;
        room.occupants[oldSlot] = null;
        room.occupants[request.slot] = occupant;
        setHuman(room.state, oldSlot, false);
        setHuman(room.state, request.slot, true);
        for (const actorSlot of [oldSlot, request.slot]) {
          room.state.party[actorSlot].moveX = 0;
          room.state.party[actorSlot].moveZ = 0;
        }
        if (room.hostSlot === oldSlot) room.hostSlot = request.slot;
        occupant.lastSeen = now;
        slot = request.slot;
      } else {
        occupant.lastSeen = now;
        occupant.lastSeq = request.seq;
        if (request.loaded !== undefined) occupant.loaded = request.loaded;
        if (!room.state.party[slot].human) setHuman(room.state, slot, true);
        occupant.lastResults = request.actions.map((action, index) => {
          if (action.type === 'faceLogos' && room.hostSlot !== slot) return { index, ok: false, error: 'Only the host can lead the party to Logos.' };
          if (room.state.status === 'ready' && action.type === 'start' && room.hostSlot === slot && room.occupants.some((member, i) => member?.loaded === false && room.state.party[i].human)) return { index, ok: false, error: 'Waiting for connected players to finish loading.' };
          if (occupant.loaded === false && action.type !== 'move') return { index, ok: false, error: 'Finish loading the battlefield before using combat actions.' };
          const result = room.state.status === "ready" && action.type !== "move" &&
            (action.type !== "start" || room.hostSlot !== slot)
            ? { ok: false, error: room.hostSlot === slot ? "Use Start encounter to begin the room's run." : "Waiting for the host to start the encounter." }
            : applyAction(room.state, slot, action);
          return { index, ok: result.ok, ...(!result.ok ? { error: result.error ?? "Action unavailable." } : {}) };
        });
      }
    }
    room.revision = previousRevision + 1;
    if (!await repository.compareAndSwap(room, previousRevision)) continue;
    if (request.op === "leave") return { ok: true };
    if (request.op === "join") return { ...snapshot(room, slot), code: room.code, token };
    return snapshot(room, slot);
  }
  throw new RoomError(409, "Room is busy. Retry this request.");
}

interface RoomRow {
  code: string;
  revision: number;
  payload: string;
  updated_at: number;
  expires_at: number;
}

function payload(room: StoredRoom): string {
  return JSON.stringify({ state: room.state, occupants: room.occupants, hostSlot: room.hostSlot });
}

/** D1 is the shared authority across workers and devices, never process memory. */
export class D1RoomRepository implements RoomRepository {
  database: D1Database;
  constructor(database: D1Database) { this.database = database; }

  async get(code: string): Promise<StoredRoom | null> {
    const row = await this.database.prepare(
      "SELECT code, revision, payload, updated_at, expires_at FROM rooms WHERE code = ?",
    ).bind(code).first<RoomRow>();
    if (!row) return null;
    const document = JSON.parse(row.payload) as Pick<StoredRoom, "state" | "occupants" | "hostSlot">;
    return { ...document, code: row.code, revision: row.revision, updatedAt: row.updated_at, expiresAt: row.expires_at };
  }

  async insert(room: StoredRoom): Promise<boolean> {
    const result = await this.database.prepare(
      "INSERT OR IGNORE INTO rooms (code, revision, payload, updated_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(room.code, room.revision, payload(room), room.updatedAt, room.expiresAt).run();
    return result.meta.changes === 1;
  }

  async compareAndSwap(room: StoredRoom, previousRevision: number): Promise<boolean> {
    const result = await this.database.prepare(
      "UPDATE rooms SET revision = ?, payload = ?, updated_at = ? WHERE code = ? AND revision = ? AND expires_at > ?",
    ).bind(room.revision, payload(room), room.updatedAt, room.code, previousRevision, room.updatedAt).run();
    return result.meta.changes === 1;
  }

  async purgeExpired(now: number): Promise<void> {
    await this.database.prepare("DELETE FROM rooms WHERE expires_at <= ?").bind(now).run();
  }
}
