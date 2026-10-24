import { REVELRY } from '../game/content.ts';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const timer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const LEGACY_SEED = 0x51f15e;

/** Normalize historical persisted data on a detached copy. Only version 1 may
 * receive missing defaults; malformed supplied values are never repaired. */
export function migrateGameState(raw: unknown): Record<string, unknown> | null {
  if (!record(raw) || ![1, 2].includes(raw.version as number) || !Array.isArray(raw.party)) return null;
  let state: Record<string, unknown>;
  try { state = structuredClone(raw); } catch { return null; }
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
