import type { Action, Actor, Role } from '../../game/types.ts';
import { ABILITY_DEFINITIONS, canUseActionRole, getCooldown } from '../../game/content.ts';
import { abilities, type AbilityPresentation } from './catalog.ts';

/** Labels shared by touch, quick actions and Commands. Rules stay in game/content. */
export const utilityAbilities: AbilityPresentation[] = [
  { key: 'revelry', pad: '', name: 'Revelry', icon: 'revelry', color: 'gold', action: { type: 'revelry' }, hint: ABILITY_DEFINITIONS.revelry.description },
  { key: 'criticalDash', pad: '', name: 'Critical Dash', icon: 'criticalDash', color: 'gold', action: { type: 'criticalDash' }, hint: ABILITY_DEFINITIONS.criticalDash.description },
  { key: 'provoke', pad: '', name: 'Provoke', icon: 'provoke', color: 'gold', action: { type: 'provoke' }, hint: ABILITY_DEFINITIONS.provoke.description },
  { key: 'splitVolley', pad: '', name: 'Split Volley', icon: 'splitVolley', color: 'mint', action: { type: 'splitVolley' }, hint: ABILITY_DEFINITIONS.splitVolley.description },
  { key: 'rapidWeave', pad: '', name: 'Rapid Weave', icon: 'rapidWeave', color: 'violet', action: { type: 'rapidWeave' }, hint: ABILITY_DEFINITIONS.rapidWeave.description },
  { key: 'heal', pad: '', name: 'Mend', icon: 'mend', color: 'mint', action: { type: 'heal' }, hint: ABILITY_DEFINITIONS.heal.description },
  { key: 'aegis', pad: '', name: 'Luminous Aegis', icon: 'aegis', color: 'ice', action: { type: 'aegis' }, hint: ABILITY_DEFINITIONS.aegis.description },
  { key: 'guard', pad: '', name: 'Guard', icon: 'guard', color: 'ice', action: { type: 'guard' }, hint: ABILITY_DEFINITIONS.guard.description },
  { key: 'dodge', pad: '', name: 'Evade', icon: 'evade', color: 'mint', action: { type: 'dodge' }, hint: ABILITY_DEFINITIONS.dodge.description },
];

export function withHealingTarget(action: Action, target: number | null): Action {
  return action.type === 'heal' && action.target === undefined && target !== null ? { ...action, target } : action;
}

export function roleAbilities(role: Role, target: number | null = null): AbilityPresentation[] {
  return [...abilities, ...utilityAbilities].filter(item => canUseActionRole(role, item.action.type)).map(item => ({
    ...item, name: item.action.type === 'magic' && item.action.element === 'lightning' ? 'Thunder' : item.name,
    action: withHealingTarget(item.action, target),
  }));
}

export function abilityDetail(actor: Actor, action: Action): string {
  const cooldown = getCooldown(actor, action);
  if (action.type === 'magic' && actor.rapidWeave && actor.rapidWeave.charges[action.element] > 0)
    return `${actor.rapidWeave.charges[action.element]} rapid · ${cooldown > 0 ? `${cooldown.toFixed(1)}s` : '70 MP'}`;
  if (cooldown > 0) return `${cooldown < 10 ? cooldown.toFixed(1) : Math.ceil(cooldown)}s recast`;
  if (action.type === 'weapon') return '1,000+ TP';
  if (action.type === 'magic' || action.type === 'heal') return '70 MP';
  if (action.type === 'aegis') return '120 MP · one hit';
  return 'Ready';
}

export interface PendingManualHeal { action: Action; selectionRevision: number }
export interface ActionReceipt { actionSeq?: number; actionResults?: { index: number; ok: boolean; error?: string }[] }

/** Only the exact accepted intent consumes a soft target. A prior packet or trust
 * heal event can never acknowledge a later rejected player command. */
export function manualHealConfirmed(
  packet: { seq: number; actions: Action[] }, receipt: ActionReceipt,
  intent: PendingManualHeal, currentSelectionRevision: number,
): boolean {
  const index = packet.actions.indexOf(intent.action);
  return intent.action.type === 'heal' && intent.action.target !== undefined &&
    intent.selectionRevision === currentSelectionRevision && index >= 0 &&
    receipt.actionSeq === packet.seq && receipt.actionResults?.some(result => result.index === index && result.ok) === true;
}
