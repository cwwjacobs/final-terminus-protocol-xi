import type { GameState } from '../../game/types.ts';
import { actionUnavailable, TP_COST } from '../../game/content.ts';
import { sequenceLocked } from '../../game/logos.ts';
import type { ControlSettings } from './control-settings.ts';
import { guideBinding } from './guide-controls.ts';
import { roleActionSlots } from './kit-ui.ts';
import { abilityCue } from './combat-feedback.ts';

export const FIRST_RUN_CUES = ['engage', 'tactical-points', 'chain-burst'] as const;
export type FirstRunCueId = typeof FIRST_RUN_CUES[number];
export interface FirstRunCue { id: FirstRunCueId; title: string; text: string }

export function restoredCueProgress(value: unknown): FirstRunCueId[] {
  return Array.isArray(value) ? FIRST_RUN_CUES.filter(id => value.includes(id)) : [];
}

/** Reads the existing UI snapshot; never advances combat or creates its own loop. */
export function firstRunCue(state: GameState, slot: number, controls: ControlSettings, layout: 'desktop' | 'controller' | 'touch', completed: readonly FirstRunCueId[]): FirstRunCue | null {
  if (FIRST_RUN_CUES.every(id => completed.includes(id))) return null;
  const actor = state.party[slot];
  if (state.status !== 'fighting' || sequenceLocked(state) || !actor || actor.hp <= 0) return null;
  const prompt = (command: Parameters<typeof guideBinding>[1], name: string) => {
    const binding = guideBinding(actor, command, controls, layout === 'controller' ? 'controller' : 'keyboard');
    return layout === 'touch' || binding === 'Unbound' ? `Use ${name} on the ability bar` : `Use ${binding} · ${name}`;
  };
  if (!actor.engaged && !completed.includes('engage')) return {
    id: 'engage', title: 'Start with Engage',
    text: `${prompt('engage', 'Auto attack')}. Move into range to attack automatically; disengage to look around freely.`,
  };
  const slots = roleActionSlots(actor.role, null, actor);
  if (!completed.includes('chain-burst')) for (const entry of slots) {
    const action = entry.presentation.action;
    const cue = abilityCue(state, slot, action, !!actionUnavailable(state, slot, action));
    if (cue) return {
      id: 'chain-burst', title: cue.kind === 'burst-ready' ? 'Match the burst' : 'Close the chain',
      text: `${prompt(entry.command, entry.presentation.name)} ${cue.kind === 'burst-ready' ? 'while the matching seal is active for a Magic Burst.' : 'while its gold highlight is active. A compatible closer opens a Magic Burst for the party.'}`,
    };
  }
  if (!completed.includes('tactical-points') && actor.tp >= TP_COST && !state.chain && !state.burst && state.duskRemaining <= 0) {
    const entry = slots.find(entry => (entry.presentation.action.type === 'weapon' || entry.command === 'clap') && !actionUnavailable(state, slot, entry.presentation.action));
    if (entry) return {
      id: 'tactical-points', title: 'Tactical Points ready',
      text: `${prompt(entry.command, entry.presentation.name)} to spend your TP.${entry.command === 'clap' ? ' Clap strikes and stuns nearby enemies.' : ' Weaponskills need at least 1,000 TP; a teammate can follow with a compatible closer.'}`,
    };
  }
  return null;
}
