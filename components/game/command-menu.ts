import type { Action, GameState } from '../../game/types.ts';
import { canUseActionRole, MAGIC, MAGIC_RANGE, ROLES, WEAPONS } from '../../game/content.ts';

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

/** Presentation availability only; the kernel still validates every selected action. */
export function commandUnavailable(state: GameState, slot: number, action: Action): string | null {
  const actor = state.party[slot];
  if (!actor || actor.hp <= 0) return 'Character is down';
  if (state.status === 'victory' || state.status === 'defeat') return 'Prepare another encounter';
  if (action.type === 'start') return state.status === 'ready' ? null : 'Encounter already started';
  if (action.type === 'engage') return null;
  if (!canUseActionRole(actor.role, action.type)) return 'Not in this role’s kit';
  if (state.status !== 'fighting') return 'Start the encounter first';
  if ((actor.cooldowns[action.type] ?? 0) > 0) return `${Math.ceil(actor.cooldowns[action.type])}s cooldown`;
  const distance = Math.hypot(actor.x - state.boss.x, actor.z - state.boss.z);
  if (action.type === 'weapon') {
    if (!actor.engaged) return 'Engage first';
    if (actor.tp < 1000) return 'Requires 1,000 TP';
    if (distance > ROLES[actor.role].range) return 'Out of weapon range';
  }
  if ((action.type === 'magic' || action.type === 'heal') && actor.mp < 70) return 'Requires 70 MP';
  if (action.type === 'magic' && distance > MAGIC_RANGE) return 'Out of spell range';
  return null;
}

export function commandEntries(state: GameState, slot: number, page: CommandPage): CommandEntry[] {
  const actor = state.party[slot];
  if (!actor) return [];
  const row = (id: string, label: string, detail: string, action: Action): CommandEntry => {
    const reason = commandUnavailable(state, slot, action);
    return { id, label, detail: reason ?? detail, action, disabled: !!reason };
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
    ? [row('heal', 'Mend', '70 MP · lowest-health living ally in range', { type: 'heal' })] : [];
  if (page === 'adversaries') return canUseActionRole(actor.role, 'magic')
    ? (['fire', 'ice', 'lightning'] as const).map(element => row(element, MAGIC[element].name, `${element} · 70 MP · selected enemy`, { type: 'magic', element })) : [];
  if (page === 'weapons') return canUseActionRole(actor.role, 'weapon')
    ? (['cleave', 'pierce', 'resonance'] as const).map(id => row(id, WEAPONS[id].name, '1,000+ TP · spends accumulated TP', { type: 'weapon', id })) : [];
  return ([
    ['revelry', 'Revelry', 'Grant one party stack · 45s cooldown'],
    ['provoke', 'Provoke', 'Draw enemy enmity'],
    ['guard', 'Guard', 'Reduce incoming damage for 5 seconds'],
    ['dodge', 'Evade', 'Brief evasion in your movement direction'],
  ] as const).filter(([type]) => canUseActionRole(actor.role, type)).map(([type, label, detail]) => row(type, label, detail, { type }));
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
