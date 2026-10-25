import type { Action, Actor, Element, GameState, Role, WeaponId } from './types.ts';

export const FIXED_STEP = 1 / 20;
export const ARENA_RADIUS = 24;
export const MOVE_SPEED = 6;
export const MELEE_RANGE = 4.6;
export const MAGIC_RANGE = 18;
export const CHAIN_WINDOW = 8;
export const CHAIN_MIN_DELAY = 1.5;
export const BURST_WINDOW = 8;
export const TP_MAX = 3000;
export const TP_COST = 1000;
export const CONE_HALF_ANGLE = Math.PI / 5;
// Provisional encounter rule: the god trial must be finished before collapse.
export const GOD_ENRAGE_TIME = 450;
export const GOD_ENRAGE_WARNING = 30;
export const GOD_ENRAGE_CAST = 10;
// Provisional neutral attack values preserve the existing encounter's base damage.
export const ATTACK_BASELINE = 100;
export const DEFAULT_SEED = 0x51f15e;
export const ELEMENTS: Element[] = ['fire', 'ice', 'lightning'];
export const TRAITS: Record<Role, { name: string; description: string; critChance: number; extraHitChance: number; storeTp: number; enmity: number; physicalReduction: number; healingPower: number }> = {
  vanguard: { name: 'Relentless', description: '10% critical chance; 15% chance for a half-strength extra auto hit.', critChance: .10, extraHitChance: .15, storeTp: 1, enmity: 1, physicalReduction: 0, healingPower: 100 },
  warden: { name: 'Iron Resolve', description: '10% extra auto hit; +30% enmity; 10% less physical damage.', critChance: .05, extraHitChance: .10, storeTp: 1, enmity: 1.3, physicalReduction: .10, healingPower: 100 },
  hunter: { name: 'Tactical Precision', description: '15% critical chance; +25% TP from outgoing hits.', critChance: .15, extraHitChance: 0, storeTp: 1.25, enmity: 1, physicalReduction: 0, healingPower: 100 },
  arcanist: { name: 'Elemental Cycle', description: 'Three distinct spells within 12 seconds restore 140 MP. Magic Bursts deal 10% more damage.', critChance: 0, extraHitChance: 0, storeTp: 1, enmity: 1, physicalReduction: 0, healingPower: 100 },
  luminary: { name: 'Triage', description: '20% stronger healing below 35% health; healing generates 25% less enmity.', critChance: 0, extraHitChance: 0, storeTp: 1, enmity: 1, physicalReduction: 0, healingPower: 100 },
};
export const ABILITY_DEFINITIONS: Record<string, { name: string; cooldown: number; mp: number; description: string }> = {
  'weapon:cleave': { name: 'Arc Cleave', cooldown: 2, mp: 0, description: 'Spend all TP. Opens Liquefaction.' },
  'weapon:pierce': { name: 'Vector Pierce', cooldown: 2, mp: 0, description: 'Spend all TP. Opens Induration.' },
  'weapon:resonance': { name: 'Q Resonance', cooldown: 2, mp: 0, description: 'Spend all TP. Opens Impaction.' },
  'magic:fire': { name: 'Solar Flare', cooldown: 6, mp: 70, description: 'Fire magic; 2 second spell recovery.' },
  'magic:ice': { name: 'Stillwinter', cooldown: 6, mp: 70, description: 'Ice magic; 2 second spell recovery.' },
  'magic:lightning': { name: 'Ion Judgment', cooldown: 6, mp: 70, description: 'Thunder magic; 2 second spell recovery.' },
  criticalDash: { name: 'Critical Dash', cooldown: 45, mp: 0, description: 'Three guaranteed 2× critical hits, gaining TP; return to the starting position.' },
  elementalShot: { name: 'Elemental Shot', cooldown: 6, mp: 35, description: 'Fire the selected elemental arrow. 35 MP; matching shots Magic Burst. Shared 6 second recast.' },
  splitVolley: { name: 'Split Volley', cooldown: 45, mp: 0, description: 'Five arrows generate 1,250 TP and permit one self-chain for 8 seconds.' },
  rapidWeave: { name: 'Rapid Weave', cooldown: 180, mp: 0, description: '12 seconds: two rapid casts of each element, with 0.5 second recovery.' },
  aegis: { name: 'Aegis', cooldown: 90, mp: 120, description: 'All living allies within 18 units block their next incoming hit.' },
  revelry: { name: 'Revelry', cooldown: 45, mp: 0, description: 'Grant a stacking party attack bonus.' },
  provoke: { name: 'Provoke', cooldown: 18, mp: 0, description: 'Generate enmity.' },
  shimmerWave: { name: 'Shimmer Wave', cooldown: 20, mp: 120, description: 'Restore 350 HP to each living ally within 18 units. Triage strengthens healing below 35% HP.' },
  mendingThread: { name: 'Mending Thread', cooldown: 18, mp: 80, description: 'Restore 100 HP every 2 seconds for 12 seconds to a selected ally, or the most wounded in range. Triage applies; refreshes rather than stacks.' },
  heal: { name: 'Restore', cooldown: 5, mp: 70, description: 'Heal a selected ally, or the lowest health percentage in range.' },
  guard: { name: 'Guard', cooldown: 14, mp: 0, description: '65% damage reduction for 5 seconds.' },
  dodge: { name: 'Evade', cooldown: 4, mp: 0, description: 'Evade with brief invulnerability.' },
};
export const REVELRY = {
  name: 'Revelry', cooldown: 45, maxStacks: 5,
  bonusPerStack: 5,
} as const;

export const PARTY = [
  { id: 'bacchus', name: 'Bacchus', role: 'vanguard', color: '#efc56b', hp: 2400, mp: 420 },
  { id: 'heracles', name: 'Heracles', role: 'warden', color: '#79b9ff', hp: 3200, mp: 400 },
  { id: 'dolos', name: 'Dolos', role: 'hunter', color: '#6ee7b7', hp: 1900, mp: 320 },
  { id: 'hecate', name: 'Hecate', role: 'arcanist', color: '#bca2ff', hp: 1700, mp: 1500 },
  { id: 'ariadne', name: 'Ariadne', role: 'luminary', color: '#f1a3ce', hp: 1900, mp: 1800 },
] as const;

export const ROLES: Record<Role, { description: string; damage: number; delay: number; tp: number; range: number; patk: number; matk: number }> = {
  vanguard: { description: 'Lead the assault. Open a chain; let the party answer.', damage: 112, delay: 2.35, tp: 240, range: MELEE_RANGE, patk: 100, matk: 100 },
  warden: { description: 'Hold enmity with Provoke, then Guard Crown Resonance’s blows.', damage: 78, delay: 2.8, tp: 245, range: MELEE_RANGE, patk: 100, matk: 100 },
  hunter: { description: 'Attack from range. Close another actor’s weaponskill into a timed skillchain.', damage: 120, delay: 2.15, tp: 240, range: 13, patk: 100, matk: 100 },
  arcanist: { description: 'Match the chain’s element to land a Magic Burst.', damage: 46, delay: 3.1, tp: 200, range: 13, patk: 100, matk: 100 },
  luminary: { description: 'Restore the lowest-health ally and keep the lattice alive.', damage: 38, delay: 3.3, tp: 180, range: 13, patk: 100, matk: 100 },
};

export function getAttackStats(actor: Pick<Actor, 'role' | 'revelryStacks'>): { patk: number; matk: number } {
  const base = ROLES[actor.role];
  const bonus = actor.revelryStacks * REVELRY.bonusPerStack;
  return { patk: base.patk + bonus, matk: base.matk + bonus };
}

/** Shared by the command UI and authoritative action validation. */
export function canUseActionRole(role: Role, type: Action['type']): boolean {
  if (!Object.hasOwn(ROLES, role)) return false;
  if (type === 'weapon') return role === 'vanguard' || role === 'warden' || role === 'hunter';
  if (type === 'magic') return role === 'arcanist';
  if (type === 'heal' || type === 'aegis' || type === 'shimmerWave' || type === 'mendingThread') return role === 'luminary';
  if (type === 'provoke') return role === 'warden';
  if (type === 'revelry' || type === 'criticalDash') return role === 'vanguard';
  if (type === 'elementalShot' || type === 'selectShot') return role === 'hunter';
  if (type === 'splitVolley') return role === 'hunter';
  if (type === 'rapidWeave') return role === 'arcanist';
  return type === 'guard' || type === 'dodge' || type === 'move' || type === 'engage' || type === 'start';
}

export const WEAPONS: Record<WeaponId, { name: string; property: string; damage: number; next: WeaponId }> = {
  cleave: { name: 'Arc Cleave', property: 'Liquefaction', damage: 660, next: 'pierce' },
  pierce: { name: 'Vector Pierce', property: 'Induration', damage: 700, next: 'resonance' },
  resonance: { name: 'Q Resonance', property: 'Impaction', damage: 740, next: 'cleave' },
};
export const SKILLCHAINS: Record<string, { property: string; element: Element }> = {
  'cleave:pierce': { property: 'Fusion', element: 'fire' },
  'pierce:resonance': { property: 'Distortion', element: 'ice' },
  'resonance:cleave': { property: 'Fragmentation', element: 'lightning' },
};
export const MAGIC: Record<Element, { name: string; color: string }> = {
  fire: { name: 'Solar Flare', color: '#ff9266' },
  ice: { name: 'Stillwinter', color: '#8ce3ff' },
  lightning: { name: 'Ion Judgment', color: '#cbb1ff' },
};

export function cooldownKey(action: Action): string {
  return action.type === 'weapon' ? `weapon:${action.id}` : action.type === 'magic' ? `magic:${action.element}` : action.type;
}

export function getCooldown(actor: Actor, action: Action): number {
  if (action.type === 'magic' && actor.rapidWeave && actor.rapidWeave.charges[action.element] > 0) return actor.rapidWeave.refresh[action.element] ?? 0;
  return actor.cooldowns[cooldownKey(action)] ?? 0;
}

/** Pure shared validation. Rejected commands must not spend resources or advance RNG. */
export function actionUnavailable(state: GameState, slot: number, action: Action): string | null {
  if (!Number.isInteger(slot) || slot < 0 || slot >= state.party.length) return 'Invalid party slot.';
  if (!action || typeof action !== 'object' || Array.isArray(action)) return 'Invalid action.';
  if (!['move', 'engage', 'weapon', 'magic', 'revelry', 'provoke', 'heal', 'guard', 'dodge', 'start', 'criticalDash', 'splitVolley', 'rapidWeave', 'aegis', 'elementalShot', 'selectShot', 'shimmerWave', 'mendingThread'].includes(action.type)) return 'Unknown action.';
  if (state.status === 'victory' || state.status === 'defeat') return 'The encounter is over.';
  const actor = state.party[slot];
  if (actor.hp <= 0) return 'This actor has fallen.';
  if (!canUseActionRole(actor.role, action.type)) return `${actor.name} cannot use this ability.`;
  if (action.type === 'move') return !Number.isFinite(action.x) || !Number.isFinite(action.z) || Math.abs(action.x) > 100 || Math.abs(action.z) > 100 || (action.facing !== undefined && !Number.isFinite(action.facing)) ? 'Movement must contain finite, bounded numbers.' : null;
  if (action.type === 'selectShot') return action.element === undefined || ELEMENTS.includes(action.element) ? null : 'Unknown shot element.';
  if (action.type === 'engage') return null;
  if (action.type === 'start') return state.status === 'ready' ? null : 'The encounter has already started.';
  if (state.status !== 'fighting') return 'Engage Crown Resonance first.';
  if (action.type === 'weapon' && !Object.hasOwn(WEAPONS, action.id)) return 'Unknown weaponskill.';
  if (action.type === 'magic' && !Object.hasOwn(MAGIC, action.element)) return 'Unknown magic element.';
  if (getCooldown(actor, action) > 1e-8) return `${ABILITY_DEFINITIONS[cooldownKey(action)]?.name ?? action.type} is on cooldown.`;
  const offensive = ['weapon', 'magic', 'criticalDash', 'splitVolley', 'elementalShot'].includes(action.type);
  if (offensive && actor.sequence) return 'Finish the current attack sequence.';
  if (offensive && actor.recovery > 1e-8) return 'Recovering from an attack.';
  if ((action.type === 'magic' || action.type === 'elementalShot') && actor.spellRecovery > 1e-8) return 'Recovering from a spell.';
  const range = Math.hypot(actor.x - state.boss.x, actor.z - state.boss.z);
  if (action.type === 'weapon' || action.type === 'criticalDash' || action.type === 'splitVolley' || action.type === 'elementalShot') {
    if (!actor.engaged) return 'Engage before attacking.';
    if (range > ROLES[actor.role].range) return 'Move into attack range.';
  }
  if ((action.type === 'magic' || action.type === 'provoke') && range > MAGIC_RANGE) return 'Move into magic range.';
  if (action.type === 'weapon' && actor.tp < TP_COST) return 'A weaponskill requires 1,000 TP.';
  if (actor.mp < (ABILITY_DEFINITIONS[cooldownKey(action)]?.mp ?? 0)) return 'Not enough MP.';
  if (action.type === 'shimmerWave' && !state.party.some(p => p.hp > 0 && p.hp < p.maxHp && Math.hypot(actor.x - p.x, actor.z - p.z) <= MAGIC_RANGE)) return 'No wounded ally in range.';
  if (action.type === 'heal' || action.type === 'mendingThread') {
    const valid = (p: Actor) => p.hp > 0 && p.hp < p.maxHp && Math.hypot(actor.x - p.x, actor.z - p.z) <= MAGIC_RANGE;
    if (action.target !== undefined) {
      if (!Number.isInteger(action.target) || !state.party[action.target] || !valid(state.party[action.target])) return 'Selected ally cannot be healed.';
    } else if (!state.party.some(valid)) return 'No wounded ally in range.';
  }
  return null;
}

export const ACTIONS = {
  engage: { name: 'Engage', description: 'Begin auto attacks when in range.' },
  weapon: { name: 'Weaponskill', description: 'Spend all TP (minimum 1,000). Close a compatible chain 1.5–8 seconds later; Dolos can self-chain after Split Volley.' },
  magic: { name: 'Magic', description: '70 MP. Match the burst element within 8 seconds for amplified damage.' },
  revelry: { name: REVELRY.name, description: 'Grant one stack of +5 Physical attack and +5 Magic attack to every living party member, up to five. Damage clears only the recipient’s stacks. 45 second cooldown.' },
  criticalDash: ABILITY_DEFINITIONS.criticalDash,
  splitVolley: ABILITY_DEFINITIONS.splitVolley,
  rapidWeave: ABILITY_DEFINITIONS.rapidWeave,
  aegis: ABILITY_DEFINITIONS.aegis,
  provoke: { name: 'Provoke', description: 'Generate cumulative and volatile enmity. 18 second cooldown.' },
  shimmerWave: { name: 'Shimmer Wave', cooldown: 20, mp: 120, description: 'Restore 350 HP to each living ally within 18 units. Triage strengthens healing below 35% HP.' },
  mendingThread: { name: 'Mending Thread', cooldown: 18, mp: 80, description: 'Restore 100 HP every 2 seconds for 12 seconds to a selected ally, or the most wounded in range. Triage applies; refreshes rather than stacks.' },
  heal: { name: 'Restore', description: '70 MP. Heal the most wounded living ally within 18 units.' },
  guard: { name: 'Guard', description: 'Reduce incoming damage by 65% for 5 seconds.' },
  dodge: { name: 'Dodge', description: 'Evade in your movement direction, or away from the boss. Brief invulnerability.' },
} as const;
