import { REVELRY } from '../game/content.ts';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Additive version-1 migration. Only an absent field means a legacy zero stack;
 * a supplied invalid count must never be repaired into a valid save or room.
 * Return a detached copy so migration and subsequent simulation cannot alter
 * the caller's persisted snapshot. Other state validation belongs to its loader. */
export function migrateRevelryState(raw: unknown): Record<string, unknown> | null {
  if (!record(raw) || raw.version !== 1 || !Array.isArray(raw.party)) return null;
  let state: Record<string, unknown>;
  try { state = structuredClone(raw); } catch { return null; }
  for (const actor of state.party as unknown[]) {
    if (!record(actor)) return null;
    if (!Object.hasOwn(actor, 'revelryStacks')) actor.revelryStacks = 0;
    const stacks = actor.revelryStacks;
    if (typeof stacks !== 'number' || !Number.isInteger(stacks) || stacks < 0 || stacks > REVELRY.maxStacks) return null;
  }
  return state;
}
