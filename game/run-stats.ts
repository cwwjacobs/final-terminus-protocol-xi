import type { ActorRunStats, GameState, RunStats } from './types.ts';

export function createRunStats(slots = 5, startedAt = 0, partial = false): RunStats {
  return {
    startedAt, partial,
    party: Array.from({ length: slots }, (): ActorRunStats => ({ damage: 0, healing: 0, taken: 0, deaths: 0 })),
  };
}

/** Rates use the recorded portion of the encounter, including time spent dead.
 * Totals live in the authoritative state rather than the bounded combat log. */
export function getRunScoreboard(state: GameState) {
  const seconds = Math.max(0, state.combatTime - state.runStats.startedAt);
  const rate = (amount: number) => seconds > 0 ? amount / seconds : 0;
  const rows = state.party.map((actor, slot) => {
    const stats = state.runStats.party[slot];
    return {
      slot, id: actor.id, name: actor.name, color: actor.color, role: actor.role, human: actor.human,
      ...stats, dps: rate(stats.damage), hps: rate(stats.healing),
    };
  }).sort((a, b) => b.damage - a.damage || a.slot - b.slot);
  const sums = rows.reduce((total, row) => ({
    damage: total.damage + row.damage, healing: total.healing + row.healing,
    taken: total.taken + row.taken, deaths: total.deaths + row.deaths,
  }), { damage: 0, healing: 0, taken: 0, deaths: 0 });
  return { seconds, partial: state.runStats.partial, rows, totals: { ...sums, dps: rate(sums.damage), hps: rate(sums.healing) } };
}
