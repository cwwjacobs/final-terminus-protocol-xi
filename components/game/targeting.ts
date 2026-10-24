/** Selection is client presentation state; only combat intents cross the room boundary. */
export function cycleTarget(current: string | null, candidates: readonly string[], direction = 1): string | null {
  const targets = [...new Set(candidates)];
  if (!targets.length) return null;
  const index = current === null ? -1 : targets.indexOf(current);
  if (index === -1) return direction < 0 ? targets[targets.length - 1] : targets[0];
  return targets[(index + (direction < 0 ? -1 : 1) + targets.length) % targets.length];
}

/** Friendly selection uses party slots, skips fallen allies and never touches hostile selection. */
export function cycleLivingAlly(current: number | null, party: readonly { hp: number }[], direction = 1): number | null {
  const alive = party.flatMap((actor, slot) => actor.hp > 0 ? [String(slot)] : []);
  const target = cycleTarget(current === null ? null : String(current), alive, direction);
  return target === null ? null : Number(target);
}
