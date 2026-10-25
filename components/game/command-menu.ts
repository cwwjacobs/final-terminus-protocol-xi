import type { Action, GameState } from '../../game/types.ts';
import { utilityAbilities, withHealingTarget } from './kit-ui.ts';
import { actionUnavailable, canUseActionRole, getCooldown, MAGIC, WEAPONS } from '../../game/content.ts';

export type CommandPage = 'root' | 'spells' | 'allies' | 'adversaries' | 'abilities' | 'weapons';
export type MenuIntent = 'open' | 'close' | 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';
export interface CommandMenuState { open: boolean; page: CommandPage; index: number }
export interface CommandEntry {
  id: string;
  label: string;
  detail: string;
  disabled?: boolean;
  action?: Action;
  page?: CommandPage;
}
export const closedCommandMenu = (): CommandMenuState => ({ open: false, page: 'root', index: 0 });
export const commandPageTitle: Record<CommandPage, string> = {
  root: 'Commands', spells: 'Spells', allies: 'Spells · Allies', adversaries: 'Spells · Adversaries', abilities: 'Abilities', weapons: 'Weapon Abilities',
};
const parentPage: Record<CommandPage, CommandPage> = {
  root: 'root', spells: 'root', allies: 'spells', adversaries: 'spells', abilities: 'root', weapons: 'root',
};

/** Use the same availability rules as accepted combat intents. */
export const commandUnavailable = actionUnavailable;

export function commandEntries(state: GameState, slot: number, page: CommandPage, allyTarget: number | null = null): CommandEntry[] {
  const actor = state.party[slot];
  if (!actor) return [];
  const row = (id: string, label: string, detail: string, action: Action): CommandEntry => {
    action = withHealingTarget(action, allyTarget);
    const reason = commandUnavailable(state, slot, action);
    const cooldown = getCooldown(actor, action);
    return { id, label, detail: cooldown > 0 ? `${cooldown < 10 ? cooldown.toFixed(1) : Math.ceil(cooldown)}s recast` : reason ?? detail, action, disabled: !!reason };
  };
  if (page === 'root') return [
    actor.engaged
      ? { id: 'attack', label: 'Attack', detail: 'Auto attacks are engaged', disabled: true }
      : row('attack', 'Attack', 'Begin auto attacks when in range', { type: state.status === 'ready' ? 'start' : 'engage' }),
    { id: 'spells', label: 'Spells', detail: 'Choose ally or adversary magic', page: 'spells' },
    { id: 'abilities', label: 'Abilities', detail: `${actor.name}’s available techniques`, page: 'abilities' },
    { id: 'weapons', label: 'Weapon Abilities', detail: 'Spend TP to open or close a chain', page: 'weapons' },
    { id: 'items', label: 'Items', detail: 'Unavailable · inventory is not implemented', disabled: true },
    actor.engaged
      ? row('disengage', 'Disengage', 'Stop your auto attacks; combat continues', { type: 'engage' })
      : { id: 'disengage', label: 'Disengage', detail: 'Auto attacks are already disengaged', disabled: true },
  ];
  if (page === 'spells') return [
    { id: 'allies', label: 'Allies', detail: 'Restore a wounded party member', page: 'allies' },
    { id: 'adversaries', label: 'Adversaries', detail: 'Elemental magic and Magic Bursts', page: 'adversaries' },
  ];
  if (page === 'allies') return canUseActionRole(actor.role, 'heal')
    ? [row('heal', 'Mend', `70 MP · ${allyTarget === null ? 'lowest-health living ally in range' : state.party[allyTarget]?.name ?? 'selected ally'}`, { type: 'heal' })] : [];
  if (page === 'adversaries' && actor.role === 'hunter') return (['fire', 'ice', 'lightning'] as const).map(element => row(element, `Select ${element} shot`, 'Choose element; use Elemental Shot to fire', { type: 'selectShot', element }));
  if (page === 'adversaries') return canUseActionRole(actor.role, 'magic')
    ? (['fire', 'ice', 'lightning'] as const).map(element => row(element, `${element === 'lightning' ? 'Thunder' : element === 'fire' ? 'Fire' : 'Ice'} · ${MAGIC[element].name}`, `${element} · 70 MP · selected enemy`, { type: 'magic', element })) : [];
  if (page === 'weapons') return canUseActionRole(actor.role, 'weapon')
    ? (['cleave', 'pierce', 'resonance'] as const).map(id => row(id, WEAPONS[id].name, '1,000+ TP · spends accumulated TP', { type: 'weapon', id })) : [];
  return utilityAbilities.filter(item => item.action.type !== 'heal' && canUseActionRole(actor.role, item.action.type))
    .map(item => row(item.action.type, item.name, item.hint, item.action));
}

/** Resolves against fresh rows so a cooldown/TP change cannot dispatch stale UI intent. */
export function navigateCommands(current: CommandMenuState, intent: MenuIntent, rows: readonly CommandEntry[]): { state: CommandMenuState; action?: Action } {
  if (intent === 'close') return { state: closedCommandMenu() };
  if (!current.open) return { state: intent === 'open' || intent === 'confirm' ? { open: true, page: 'root', index: 0 } : current };
  if (intent === 'open') return { state: current };
  if (intent === 'back' || intent === 'left') {
    return { state: current.page === 'root' ? closedCommandMenu() : { open: true, page: parentPage[current.page], index: 0 } };
  }
  const index = Math.max(0, Math.min(current.index, Math.max(0, rows.length - 1)));
  if (intent === 'up' || intent === 'down') {
    return { state: { ...current, index: rows.length ? (index + (intent === 'down' ? 1 : -1) + rows.length) % rows.length : 0 } };
  }
  const row = rows[index];
  if (!row || row.disabled) return { state: { ...current, index } };
  if (row.page) return { state: { open: true, page: row.page, index: 0 } };
  if (intent === 'confirm' && row.action) return { state: closedCommandMenu(), action: row.action };
  return { state: { ...current, index } };
}
