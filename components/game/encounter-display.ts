import type { GameState } from '../../game/types.ts';

/** Observe the last published values separately: a local action can end a fight
 * in place between ticks, while a room packet replaces the entire snapshot. */
export function createEncounterDisplay(publish: (state: GameState) => void) {
  let source: GameState | null = null;
  let status: GameState['status'] | undefined;
  let stage: GameState['logos']['stage'] | undefined;

  return (current: GameState, advanced: boolean) => {
    if (!advanced && source === current && status === current.status && stage === current.logos.stage) return;
    source = current;
    status = current.status;
    stage = current.logos.stage;
    publish(current);
  };
}
