import type { Action, GameState } from '../../game/types.ts';

/** Lobby/results polls are keepalives, not movement or stale combat commands. */
export function roomSyncActions(status: GameState['status'], pending: Action[], movement: Action): Action[] {
  if (status === 'fighting') return [...pending, movement];
  if (status === 'ready') return pending.filter(action => action.type === 'start');
  return [];
}
