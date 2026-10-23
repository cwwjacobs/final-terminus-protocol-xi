import { CHAIN_MIN_DELAY, SKILLCHAINS } from '../../game/content.ts';
import type { Action, GameState } from '../../game/types.ts';

/** Read the authoritative window; a weaponskill opener alone is never a burst. */
export function activeBurst(state: GameState) {
  return state.status === 'fighting' && state.burst && state.burst.remaining > 0 ? state.burst : null;
}

export function abilityCue(state: GameState, slot: number, action: Action, disabled: boolean) {
  if (disabled || state.status !== 'fighting') return null;
  if (action.type === 'magic' && activeBurst(state)?.element === action.element)
    return { kind: 'burst-ready', label: 'MAGIC BURST' };
  const chain = state.chain;
  if (action.type === 'weapon' && chain && chain.remaining > 0 && chain.opener !== slot &&
      state.time - chain.openedAt + 1e-8 >= CHAIN_MIN_DELAY) {
    const combination = SKILLCHAINS[`${chain.weapon}:${action.id}`];
    if (combination) return { kind: 'chain-ready', label: `Close ${combination.property}` };
  }
  return null;
}

/** The two preceding weaponskill events identify the actual opener and closer,
 * including trust actions, rather than suggesting that one skill made a burst. */
export function completedChainActors(state: GameState): string {
  const completion = state.events.filter(event => event.kind === 'chain').at(-1);
  if (!completion) return '';
  const pair = state.events.filter(event => event.kind === 'weapon' && event.id < completion.id).slice(-2);
  return pair.map(event => state.party[event.actor ?? -1]?.name).filter(Boolean).join(' → ');
}
