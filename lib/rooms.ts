import { applyAction, createGame, setHuman, stepGame } from "../game/engine.ts";
import type { Action, GameState } from "../game/types.ts";

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
  | { op: "create"; mode: "trial" | "god" }
  | { op: "join"; code: string }
  | { op: "sync"; code: string; token: string; seq: number; actions: Action[] }
  | { op: "leave"; code: string; token: string };

interface Occupant {
  tokenHash: string;
  lastSeen: number;
  lastSeq: number;
}

/** Private persistence format. Never serialize this object to a client. */
export interface StoredRoom {
  code: string;
  revision: number;
  state: GameState;
  occupants: (Occupant | null)[];
  updatedAt: number;
  expiresAt: number;
}

export interface RoomRepository {
  get(code: string): Promise<StoredRoom | null>;
  insert(room: StoredRoom): Promise<boolean>;
  compareAndSwap(room: StoredRoom, previousRevision: number): Promise<boolean>;
  purgeExpired(now: number): Promise<void>;
}

export interface RoomSnapshot {
  state: GameState;
  revision: number;
  slot: number;
  /** Gameplay failures (cooldown, range, TP) are safe to display to the player. */
  actionErrors?: string[];
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
  if (action.type === "magic") {
    exactKeys(action, ["type", "element"]);
    if (!["fire", "ice", "lightning"].includes(action.element as string)) {
      throw new RoomError(400, "Unknown magic element.");
    }
    return { type: "magic", element: action.element } as Action;
  }
  if (["engage", "provoke", "heal", "guard", "dodge", "start"].includes(action.type as string)) {
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
      exactKeys(input, ["op", "mode"]);
      if (input.mode !== undefined && input.mode !== "trial" && input.mode !== "god") {
        throw new RoomError(400, "Unknown encounter mode.");
      }
      return { op: "create", mode: input.mode === "god" ? "god" : "trial" };
    }
    case "join":
      exactKeys(input, ["op", "code"]);
      return { op: "join", code: secret(input.code, "room code") };
    case "sync": {
      exactKeys(input, ["op", "code", "token", "seq", "actions"]);
      if (typeof input.seq !== "number" || !Number.isSafeInteger(input.seq) || input.seq < 0) {
        throw new RoomError(400, "Sequence must be a nonnegative safe integer.");
      }
      if (!Array.isArray(input.actions) || input.actions.length > MAX_ACTIONS) {
        throw new RoomError(400, `Send at most ${MAX_ACTIONS} actions per sync.`);
      }
      return {
        op: "sync", code: secret(input.code, "room code"), token: secret(input.token, "session token"),
        seq: input.seq, actions: input.actions.map(parseAction),
      };
    }
    case "leave":
      exactKeys(input, ["op", "code", "token"]);
      return { op: "leave", code: secret(input.code, "room code"), token: secret(input.token, "session token") };
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

function snapshot(room: StoredRoom, slot: number, actionErrors?: string[]): RoomSnapshot {
  return {
    state: structuredClone(room.state), revision: room.revision, slot,
    ...(actionErrors?.length ? { actionErrors } : {}),
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
      for (let slot = 0; slot < 5; slot++) setHuman(state, slot, slot === 0);
      const room: StoredRoom = {
        code, revision: 0, state, updatedAt: now, expiresAt: now + ROOM_TTL_MS,
        occupants: [{ tokenHash: await hashToken(code, token), lastSeen: now, lastSeq: -1 }, null, null, null, null],
      };
      if (await repository.insert(room)) return { ...snapshot(room, 0), code, token };
    }
    throw new RoomError(503, "Unable to allocate a room. Try again.");
  }

  const token = request.op === "join" ? randomSecret() : request.token;
  const tokenHash = await hashToken(request.code, token);
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const room = await repository.get(request.code);
    if (!room) throw new RoomError(404, "Room was not found.");
    if (room.expiresAt <= now) throw new RoomError(410, "Room expired. Create a new encounter.");
    const previousRevision = room.revision;
    let slot: number;
    let actionErrors: string[] | undefined;
    if (request.op === "join") {
      advanceRoom(room, now);
      slot = room.occupants.findIndex((occupant) => occupant === null);
      if (slot === -1) throw new RoomError(409, "Party is full. Disconnected slots remain reserved for 45 seconds.");
      room.occupants[slot] = { tokenHash, lastSeen: now, lastSeq: -1 };
      setHuman(room.state, slot, true);
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
      advanceRoom(room, now);
      if (request.op === "leave") {
        room.occupants[slot] = null;
        setHuman(room.state, slot, false);
      } else {
        occupant.lastSeen = now;
        occupant.lastSeq = request.seq;
        if (!room.state.party[slot].human) setHuman(room.state, slot, true);
        actionErrors = [];
        for (const action of request.actions) {
          const result = applyAction(room.state, slot, action);
          if (!result.ok) actionErrors.push(result.error ?? "Action unavailable.");
        }
      }
    }
    room.revision = previousRevision + 1;
    if (!await repository.compareAndSwap(room, previousRevision)) continue;
    if (request.op === "leave") return { ok: true };
    if (request.op === "join") return { ...snapshot(room, slot), code: room.code, token };
    return snapshot(room, slot, actionErrors);
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
  return JSON.stringify({ state: room.state, occupants: room.occupants });
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
    const document = JSON.parse(row.payload) as Pick<StoredRoom, "state" | "occupants">;
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
