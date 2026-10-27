import { createStaticStorm } from '../game/static-storm.ts';
import { REVELRY } from '../game/content.ts';
import { createRunStats } from '../game/run-stats.ts';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const timer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const LEGACY_SEED = 0x51f15e;

/** Normalize historical persisted data on a detached copy. Mechanics defaults
 * belong to version 1; absent run statistics may also predate this additive
 * version-2 feature. Malformed supplied values are never repaired. */
export function migrateGameState(raw: unknown): Record<string, unknown> | null {
  if (!record(raw) || ![1, 2].includes(raw.version as number) || !Array.isArray(raw.party) || raw.party.length !== 5) return null;
  let state: Record<string, unknown>;
  try { state = structuredClone(raw); } catch { return null; }
  if (!Object.hasOwn(state, 'runStats')) {
    if (!timer(state.combatTime)) return null;
    const partial = state.status !== 'ready' && state.combatTime > 0;
    state.runStats = createRunStats((state.party as unknown[]).length, partial ? state.combatTime : 0, partial);
  }
  if (!Object.hasOwn(state, 'storm')) state.storm = createStaticStorm(Number.isInteger(state.rng) ? state.rng as number : LEGACY_SEED);
  if (record(state.storm) && !Object.hasOwn(state.storm, 'target')) {
    for (const [key, value] of Object.entries({ target: 'boss', x: record(state.boss) ? state.boss.x : 0, z: record(state.boss) ? state.boss.z : -4, enemyId: 'boss' })) {
      if (!Object.hasOwn(state.storm, key)) state.storm[key] = value;
    }
    if (timer(state.storm.remaining) && state.storm.remaining <= 300) state.storm.remaining = Math.min(25, state.storm.remaining);
  }
  if (!Object.hasOwn(state, 'encounter')) state.encounter = 'crown';
  if (!Object.hasOwn(state, 'logos')) state.logos = { stage: state.encounter === 'logos' ? 'giant' : 'none', elapsed: 0 };
  if (!Object.hasOwn(state, 'ultimatesUnlocked')) state.ultimatesUnlocked = false;
  if (!Object.hasOwn(state, 'duskRemaining')) state.duskRemaining = 0;
  if (!Object.hasOwn(state, 'enemies')) state.enemies = [];
  if (record(state.boss)) {
    if (!Object.hasOwn(state.boss, 'stunRemaining')) state.boss.stunRemaining = 0;
    if (!Object.hasOwn(state.boss, 'burn')) state.boss.burn = null;
  }
  for (const actor of state.party as unknown[]) {
    if (!record(actor)) return null;
    if (!Object.hasOwn(actor, 'mendingThread')) actor.mendingThread = null;
    if (!Object.hasOwn(actor, 'enemyTarget')) actor.enemyTarget = 'boss';
    if (!Object.hasOwn(actor, 'shotElement')) actor.shotElement = 'fire';
    if (!Object.hasOwn(actor, 'hpShield')) actor.hpShield = 0;
    if (!Object.hasOwn(actor, 'criticalCharges')) actor.criticalCharges = 0;
    if (!Object.hasOwn(actor, 'sonOfZeus')) actor.sonOfZeus = false;
    if (!Object.hasOwn(actor, 'staticShock')) actor.staticShock = 0;
    if (actor.role === 'arcanist') for (const key of ['ce', 've']) {
      if (timer(actor[key]) && actor[key] <= 10000) actor[key] = Math.min(5000, actor[key]);
    }
  }
  if (state.version === 2) return state;
  if (!record(state.boss)) return null;
  const absent = (object: Record<string, unknown>, key: string, value: unknown) => {
    if (!Object.hasOwn(object, key)) object[key] = value;
  };
  absent(state, 'rng', LEGACY_SEED);
  absent(state, 'sequenceSeq', 0);
  absent(state.boss, 'cooldowns', {});
  for (const actor of state.party as unknown[]) {
    if (!record(actor) || !record(actor.cooldowns)) return null;
    absent(actor, 'revelryStacks', 0);
    if (!Number.isInteger(actor.revelryStacks) || (actor.revelryStacks as number) < 0 ||
      (actor.revelryStacks as number) > REVELRY.maxStacks) return null;
    absent(actor, 'shieldCharges', 0);
    absent(actor, 'recovery', 0);
    absent(actor, 'spellRecovery', 0);
    absent(actor, 'selfChainUntil', 0);
    absent(actor, 'rapidWeave', null);
    absent(actor, 'elementalCycle', { elements: [], remaining: 0 });
    absent(actor, 'sequence', null);
    for (const [legacyKey, ids] of [
      ['magic', ['fire', 'ice', 'lightning']],
      ['weapon', ['cleave', 'pierce', 'resonance']],
    ] as const) {
      if (!Object.hasOwn(actor.cooldowns, legacyKey)) continue;
      const remaining = actor.cooldowns[legacyKey];
      if (!timer(remaining)) return null;
      for (const id of ids) {
        const key = `${legacyKey}:${id}`;
        const existing = actor.cooldowns[key];
        if (Object.hasOwn(actor.cooldowns, key) && !timer(existing)) return null;
        actor.cooldowns[key] = Math.max(remaining, existing as number | undefined ?? 0);
      }
      delete actor.cooldowns[legacyKey];
    }
  }
  state.version = 2;
  return state;
}

/** Kept for callers of the earlier additive Revelry migration. */
export const migrateRevelryState = migrateGameState;
