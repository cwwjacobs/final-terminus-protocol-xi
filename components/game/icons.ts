/** Vector HUD icons. One registry, drawn in a 24-unit box (ability marks in
 * the 64-unit box shared with the enemy mark), stroked and filled with
 * currentColor so CSS color rules keep working. Replacing Unicode glyphs with
 * outlines means every platform draws the same shape at the same weight and no
 * icon depends on which symbols Georgia or Arial happen to carry. */

export interface IconShape { d: string; fill?: boolean; width?: number }
export interface IconDefinition { box: number; stroke: number; shapes: IconShape[] }

const stroke = (d: string, width?: number): IconShape => width === undefined ? { d } : { d, width };
const fill = (d: string): IconShape => ({ d, fill: true });

/** Weaponskill and element marks. The enemy mark draws these same paths. */
export const ABILITY_MARKS = {
  cleave: [stroke('M22 44 42 20M20 37l7 7'), fill('m26 40 12-19 4-1-1 5Z')],
  pierce: [stroke('M32 45V20m-8 8 8-8 8 8M27 42V29m10 13V29')],
  resonance: [stroke('m32 17 14 15-14 15-14-15Z')],
  fire: [stroke('M32 17c2 10 13 12 11 23-2 13-23 12-23-1 0-7 6-10 6-15 2 4 4 6 5 7 3-5 3-9 1-14Zm1 18c-8 7-7 11-1 12 6-1 7-6 1-12Z')],
  ice: [stroke('M32 17v30M19 24l26 16M19 40l26-16m-18-3 5 4 5-4m-10 22 5-4 5 4M20 29l6-1-2-6m16 20-2-6 6-1M20 35l6 1-2 6m16-20-2 6 6 1')],
  lightning: [stroke('m36 17-16 18h11l-3 13 16-20H33Z')],
} as const satisfies Record<string, IconShape[]>;


/** Pictorial role emblems in the 64-unit box: what each role does, not a shape. */
export const ROLE_EMBLEMS = {
  vanguard: [stroke('M32 26v30'), stroke('M25 56h14'), stroke('M32 6c6 2 10 8 10 14 0 5-4 9-10 10-6-1-10-5-10-10 0-6 4-12 10-14z'), stroke('M26 13l6 4 6-4M24 20l8 5 8-5M28 27l4 2 4-2', 1.8), stroke('M32 10v18', 1.4), fill('M32 34c-8 0-11 6-8 12 6 0 9-5 8-12z'), stroke('M32 42c7-1 9 4 6 9', 1.8)],
  warden: [stroke('M32 6l20 6v16c0 14-9 23-20 29C21 51 12 42 12 28V12z'), stroke('M32 12l14 4v12c0 10-6 17-14 22-8-5-14-12-14-22V16z', 1.6), fill('M32 22l4 4h5l-3 4 1 6-7-3-7 3 1-6-3-4h5z'), stroke('M26 38h12')],
  hunter: [stroke('M16 6c18 7 18 45 0 52'), stroke('M16 6v52', 1.3), stroke('M8 32h46'), fill('M58 32l-10-6v12z'), stroke('M9 32l5-6M9 32l5 6', 2), fill('M14 29h4v6h-4z')],
  arcanist: [stroke('M32 12c11 0 20 9 20 20s-9 20-20 20-20-9-20-20 9-20 20-20z', 1.6), stroke('M14 24c9-9 27-9 36 0M50 40c-9 9-27 9-36 0', 1.6), fill('M32 20l4 8 8 4-8 4-4 8-4-8-8-4 8-4z'), fill('M52 32a2 2 0 1 0 4 0 2 2 0 1 0-4 0M8 32a2 2 0 1 0 4 0 2 2 0 1 0-4 0')],
  luminary: [stroke('M32 4v10M32 50v10M4 32h10M50 32h10', 1.4), fill('M32 14l5 13 13 5-13 5-5 13-5-13-13-5 13-5z'), stroke('M32 12c11 0 20 9 20 20s-9 20-20 20S12 43 12 32c0-6 3-12 8-16', 1.8), fill('M20 16a2.6 2.6 0 1 0 0 .1')],
} as const satisfies Record<string, IconShape[]>;

const mark = (shapes: readonly IconShape[]): IconDefinition => ({ box: 64, stroke: 3, shapes: [...shapes] });
const icon = (...shapes: IconShape[]): IconDefinition => ({ box: 24, stroke: 1.8, shapes });

export const ICONS = {
  // Brand and navigation
  sigil: icon(stroke('M9.5 9.5V7a2.5 2.5 0 1 0-2.5 2.5h10a2.5 2.5 0 1 0-2.5-2.5v10a2.5 2.5 0 1 0 2.5-2.5h-10a2.5 2.5 0 1 0 2.5 2.5Z', 1.5)),
  party: icon(stroke('M12 3l9 9-9 9-9-9z'), fill('M12 8l4 4-4 4-4-4z')),
  guide: icon(stroke('M9.3 9.2a2.7 2.7 0 1 1 4 2.5c-1 .6-1.3 1.2-1.3 2.3'), fill('M12 17a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z')),
  settings: icon(stroke('M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'), stroke('M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1', 2.2)),
  menu: icon(stroke('M4 7h16M4 12h16M4 17h16', 2)),
  // Party roles, pictorial: thyrsus, shield, bow, orbit, thread-and-star
  vanguard: mark(ROLE_EMBLEMS.vanguard), warden: mark(ROLE_EMBLEMS.warden), hunter: mark(ROLE_EMBLEMS.hunter),
  arcanist: mark(ROLE_EMBLEMS.arcanist), luminary: mark(ROLE_EMBLEMS.luminary),
  // Party roles, geometric: the same shapes as the floor rings in party-markers.ts
  vanguardShape: icon(stroke('M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z')),
  wardenShape: icon(stroke('M12 3l9 9-9 9-9-9z')),
  hunterShape: icon(stroke('M12 4l9 15H3z')),
  arcanistShape: icon(fill('M12 2.5l1.6 6.1 5.4-3.2-3.2 5.4 6.1 1.6-6.1 1.6 3.2 5.4-5.4-3.2L12 21.5l-1.6-6.1-5.4 3.2 3.2-5.4L2.5 12.4l6.1-1.6-3.2-5.4 5.4 3.2z')),
  luminaryShape: icon(stroke('M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z'), fill('M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z')),
  // Ability marks
  cleave: mark(ABILITY_MARKS.cleave), pierce: mark(ABILITY_MARKS.pierce), resonance: mark(ABILITY_MARKS.resonance),
  fire: mark(ABILITY_MARKS.fire), ice: mark(ABILITY_MARKS.ice), lightning: mark(ABILITY_MARKS.lightning),
  // Utility actions
  revelry: icon(fill('M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z')),
  provoke: icon(stroke('M6 21h12M8 20v-8h8v8M6.5 12h11M6.5 12V4h3v3h2V4h2v3h2V4h2.5v8')),
  mend: icon(stroke('M12 4.5v15M4.5 12h15', 3)),
  guard: icon(stroke('M12 3l7 2.8v5.4c0 4.9-3 8.3-7 9.8-4-1.5-7-4.9-7-9.8V5.8z')),
  evade: icon(stroke('M6 18L18 6M9 6h9v9')),
  // Status and controls
  target: icon(stroke('M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z'), stroke('M12 2v4M12 18v4M2 12h4M18 12h4'), fill('M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z')),
  engaged: icon(stroke('M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z'), fill('M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z')),
  disengaged: icon(stroke('M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z'), stroke('M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z')),
  enmity: icon(fill('M12 3l9 9-9 9-9-9z')),
  enmityIdle: icon(stroke('M12 3l9 9-9 9-9-9z')),
  arrow: icon(stroke('M4 12h16M14 6l6 6-6 6')),
  arrowBack: icon(stroke('M20 12H4M10 6l-6 6 6 6')),
  arrowOut: icon(stroke('M7 17L17 7M9 7h8v8')),
  chevron: icon(stroke('M9 5l7 7-7 7', 2)),
  cursor: icon(fill('M7 4l12 8-12 8z')),
  close: icon(stroke('M6 6l12 12M18 6L6 18', 2)),
  cross: icon(stroke('M12 3v18M3 12h18', 1.2)),
} as const satisfies Record<string, IconDefinition>;

export type IconName = keyof typeof ICONS;

/** Party portrait emblem for a role; falls back to the vanguard thyrsus so an
 * unknown role still renders rather than throwing in the HUD. */
export function roleIcon(role: string): IconName {
  return role in ICONS && ['vanguard', 'warden', 'hunter', 'arcanist', 'luminary'].includes(role) ? role as IconName : 'vanguard';
}

/** Inline markup for a registry icon, for callers outside React. */
export function iconMarkup(name: IconName, className = 'ui-icon'): string {
  const definition = ICONS[name];
  const shapes = definition.shapes.map(shape => shape.fill
    ? `<path d="${shape.d}" fill="currentColor" stroke="none"/>`
    : `<path d="${shape.d}"${shape.width !== undefined ? ` stroke-width="${shape.width}"` : ''}/>`).join('');
  return `<svg class="${className}" viewBox="0 0 ${definition.box} ${definition.box}" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="${definition.stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`;
}
