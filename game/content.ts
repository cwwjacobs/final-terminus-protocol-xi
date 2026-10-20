import type { Element, Role, WeaponId } from './types.ts';

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

export const PARTY = [
  { id: 'bacchus', name: 'Bacchus', role: 'vanguard', color: '#efc56b', hp: 2400, mp: 420 },
  { id: 'heracles', name: 'Heracles', role: 'warden', color: '#79b9ff', hp: 3200, mp: 400 },
  { id: 'dolos', name: 'Dolos', role: 'hunter', color: '#6ee7b7', hp: 1900, mp: 320 },
  { id: 'hecate', name: 'Hecate', role: 'arcanist', color: '#bca2ff', hp: 1700, mp: 1500 },
  { id: 'ariadne', name: 'Ariadne', role: 'luminary', color: '#f1a3ce', hp: 1900, mp: 1800 },
] as const;

export const ROLES: Record<Role, { description: string; damage: number; delay: number; tp: number; range: number }> = {
  vanguard: { description: 'Lead the assault. Open a chain; let the party answer.', damage: 112, delay: 2.35, tp: 240, range: MELEE_RANGE },
  warden: { description: 'Hold enmity with Provoke, then Guard the Regent’s blows.', damage: 78, delay: 2.8, tp: 245, range: MELEE_RANGE },
  hunter: { description: 'Close another actor’s weaponskill into a timed skillchain.', damage: 120, delay: 2.15, tp: 240, range: MELEE_RANGE },
  arcanist: { description: 'Match the chain’s element to land a Magic Burst.', damage: 46, delay: 3.1, tp: 200, range: 13 },
  luminary: { description: 'Restore the lowest-health ally and keep the lattice alive.', damage: 38, delay: 3.3, tp: 180, range: 13 },
};

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

export const ACTIONS = {
  engage: { name: 'Engage', description: 'Begin auto attacks when in range.' },
  weapon: { name: 'Weaponskill', description: 'Spend all TP (minimum 1,000). A second actor can close a chain 1.5–8 seconds later.' },
  magic: { name: 'Magic', description: '70 MP. Match the burst element within 8 seconds for amplified damage.' },
  provoke: { name: 'Provoke', description: 'Generate cumulative and volatile enmity. 18 second cooldown.' },
  heal: { name: 'Restore', description: '70 MP. Heal the most wounded living ally within 18 units.' },
  guard: { name: 'Guard', description: 'Reduce incoming damage by 65% for 5 seconds.' },
  dodge: { name: 'Dodge', description: 'Evade in your movement direction, or away from the boss. Brief invulnerability.' },
} as const;
