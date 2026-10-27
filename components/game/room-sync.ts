import type { Action, GameState } from '../../game/types.ts';

/** Lobby/results polls are keepalives, not movement or stale combat commands. */
export function roomSyncActions(status: GameState['status'], pending: Action[], movement: Action, stage?: GameState['logos']['stage']): Action[] {
  if (status === 'fighting' && stage === 'descent') return pending.filter(action => action.type === 'readyForLogos');
  if (status === 'fighting' && (stage === 'collapse' || stage === 'escaped')) return [];
  if (status === 'fighting') return [...pending, movement];
  if (status === 'ready') return pending.filter(action => action.type === 'start');
  if (status === 'victory') return pending.filter(action => action.type === 'faceLogos');
  return [];
}
