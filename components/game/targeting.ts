/** Selection is client presentation state; only combat intents cross the room boundary. */
export function cycleTarget(current: string | null, candidates: readonly string[], direction = 1): string | null {
  const targets = [...new Set(candidates)];
  if (!targets.length) return null;
  const index = current === null ? -1 : targets.indexOf(current);
  if (index === -1) return direction < 0 ? targets[targets.length - 1] : targets[0];
  return targets[(index + (direction < 0 ? -1 : 1) + targets.length) % targets.length];
}
