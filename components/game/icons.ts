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


/** Role sigils in the 64-unit box, in the Nova/Lumae house style: mono-line,
 * vertical axis, four-point star crown, two sparkle satellites, a geometric
 * core and a flourished base. Cores are the Greek letters of the earlier
 * GameSigils set: Υ Bacchus, Π Heracles, Λ Dolos, Ψ Hecate, ∞ Ariadne. */
export const ROLE_EMBLEMS = {
  vanguard: [fill('M32 1L33.1 4.9L37 6L33.1 7.1L32 11L30.9 7.1L27 6L30.9 4.9Z'), fill('M13 12.4L13.6 14.4L15.6 15L13.6 15.6L13 17.6L12.4 15.6L10.4 15L12.4 14.4Z'), fill('M51 12.4L51.6 14.4L53.6 15L51.6 15.6L51 17.6L50.4 15.6L48.4 15L50.4 14.4Z'), stroke('M32 58V30M20 16c4 8 8 12 12 14 4-2 8-6 12-14'), stroke('M32 14l6 6-6 6-6-6z'), stroke('M32 17.5l2.5 2.5-2.5 2.5-2.5-2.5z', 1.2), stroke('M24 44h16'), stroke('M32 52c-5-2-10 0-12 4 3 3 8 2 12-4zM32 52c5-2 10 0 12 4-3 3-8 2-12-4z', 1.6)],
  warden: [fill('M32 1L33.1 4.9L37 6L33.1 7.1L32 11L30.9 7.1L27 6L30.9 4.9Z'), fill('M13 12.4L13.6 14.4L15.6 15L13.6 15.6L13 17.6L12.4 15.6L10.4 15L12.4 14.4Z'), fill('M51 12.4L51.6 14.4L53.6 15L51.6 15.6L51 17.6L50.4 15.6L48.4 15L50.4 14.4Z'), stroke('M14 30c4-10 32-10 36 0', 1.6), stroke('M18 24h28M23 24v22M41 24v22'), stroke('M32 36a3.2 3.2 0 1 0 0 .1', 1.5), stroke('M16 50h32'), stroke('M22 56h20', 1.6)],
  hunter: [fill('M32 1L33.1 4.9L37 6L33.1 7.1L32 11L30.9 7.1L27 6L30.9 4.9Z'), fill('M13 12.4L13.6 14.4L15.6 15L13.6 15.6L13 17.6L12.4 15.6L10.4 15L12.4 14.4Z'), fill('M51 12.4L51.6 14.4L53.6 15L51.6 15.6L51 17.6L50.4 15.6L48.4 15L50.4 14.4Z'), stroke('M32 58V20'), stroke('M22 32l10-14 10 14'), stroke('M14 48c6-9 30-9 36 0', 1.6), stroke('M14 48v3M50 48v3', 1.6), stroke('M27 56l5-4 5 4', 1.6)],
  arcanist: [fill('M32 1L33.1 4.9L37 6L33.1 7.1L32 11L30.9 7.1L27 6L30.9 4.9Z'), fill('M13 12.4L13.6 14.4L15.6 15L13.6 15.6L13 17.6L12.4 15.6L10.4 15L12.4 14.4Z'), fill('M51 12.4L51.6 14.4L53.6 15L51.6 15.6L51 17.6L50.4 15.6L48.4 15L50.4 14.4Z'), stroke('M32 58V16M20 18c0 10 4 16 12 16s12-6 12-16'), fill('M20 12.8L20.5 14.5L22.2 15L20.5 15.5L20 17.2L19.5 15.5L17.8 15L19.5 14.5Z'), fill('M44 12.8L44.5 14.5L46.2 15L44.5 15.5L44 17.2L43.5 15.5L41.8 15L43.5 14.5Z'), stroke('M14 40c0-8 8-12 18-12s18 4 18 12-8 12-18 12-18-4-18-12z', 1.4), stroke('M26 50h12')],
  luminary: [fill('M32 1L33.1 4.9L37 6L33.1 7.1L32 11L30.9 7.1L27 6L30.9 4.9Z'), fill('M13 12.4L13.6 14.4L15.6 15L13.6 15.6L13 17.6L12.4 15.6L10.4 15L12.4 14.4Z'), fill('M51 12.4L51.6 14.4L53.6 15L51.6 15.6L51 17.6L50.4 15.6L48.4 15L50.4 14.4Z'), stroke('M32 58V14'), stroke('M32 30c-4-8-14-8-14 0s10 8 14 0 14-8 14 0-10 8-14 0', 1.8), stroke('M18 50c6 0 10 2 14 6 4-4 8-6 14-6', 1.6), fill('M46 50a2.2 2.2 0 1 0 0 .1'), stroke('M26 42h12', 1.6)],
} as const satisfies Record<string, IconShape[]>;

const mark = (shapes: readonly IconShape[]): IconDefinition => ({ box: 64, stroke: 3, shapes: [...shapes] });
const sigil = (shapes: readonly IconShape[]): IconDefinition => ({ box: 64, stroke: 2.2, shapes: [...shapes] });
const icon = (...shapes: IconShape[]): IconDefinition => ({ box: 24, stroke: 1.8, shapes });

export const ICONS = {
  fission: icon(stroke('M10 5C3 0 0 14 10 19M14 5c7-5 10 9 0 14M7 10l-4 2m14-2 4 2M11 7l-1 4 3 2-1 4'), fill('M8 11a1.3 1.3 0 1 0 0 .1M16 11a1.3 1.3 0 1 0 0 .1')),
  rainOfFire: icon(stroke('m5 3-2 8m9-8-2 8m9-8-2 8M5 14c0 3-3 3-3 5a3 3 0 0 0 6 0c0-2-3-2-3-5ZM16 13c0 4-3 4-3 6a3 3 0 0 0 6 0c0-2-3-2-3-6Z')),
  rejuvenator: icon(stroke('M12 2v20M5 9h14M3 16c3 0 5 4 9 4s6-4 9-4M4 4l3 2m13-2-3 2')),
  fearless: icon(stroke('m12 2 3 6 6 1-5 5 1 7-5-3-5 3 1-7-5-5 6-1Z'), stroke('m9 12 2 2 4-5')),
  thunderclap: icon(stroke('m13 2-6 10h5l-1 10 7-12h-5ZM3 7l2 1m16-1-2 1M2 16l3-1m17 1-3-1')),
  lightningShock: icon(stroke('m6 3-3 6h4l-2 6 7-8H8l2-4M11 16l3 3 3-4 4 2')),
  bolt: icon(stroke('m14 2-9 11h7l-2 9 9-13h-7Z')),
  clap: icon(stroke('M2 4l7 7v8H5l-3-6m20-9-7 7v8h4l3-6M12 2v4m-4-4 1 3m7-3-1 3M10 22h4')),
  dusk: icon(stroke('M3 17h18M5 14a7 7 0 0 1 14 0M12 2v3M3 6l2 2m16-2-2 2M7 21h10'), fill('M12 8l1 3 3 1-3 1-1 3-1-3-3-1 3-1Z')),
  // Brand and navigation
  sigil: icon(stroke('M9.5 9.5V7a2.5 2.5 0 1 0-2.5 2.5h10a2.5 2.5 0 1 0-2.5-2.5v10a2.5 2.5 0 1 0 2.5-2.5h-10a2.5 2.5 0 1 0 2.5 2.5Z', 1.5)),
  party: icon(stroke('M12 3l9 9-9 9-9-9z'), fill('M12 8l4 4-4 4-4-4z')),
  guide: icon(stroke('M9.3 9.2a2.7 2.7 0 1 1 4 2.5c-1 .6-1.3 1.2-1.3 2.3'), fill('M12 17a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z')),
  settings: icon(stroke('M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'), stroke('M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1', 2.2)),
  menu: icon(stroke('M4 7h16M4 12h16M4 17h16', 2)),
  // Party role sigils: thyrsus Υ, gate Π, arrow Λ, trident Ψ, thread ∞
  vanguard: sigil(ROLE_EMBLEMS.vanguard), warden: sigil(ROLE_EMBLEMS.warden), hunter: sigil(ROLE_EMBLEMS.hunter),
  arcanist: sigil(ROLE_EMBLEMS.arcanist), luminary: sigil(ROLE_EMBLEMS.luminary),
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
  warCry: icon(stroke('M3 8h4l5-4v16l-5-4H3z'), stroke('M15 8q4 4 0 8M18 5q7 7 0 14')),
  provoke: icon(stroke('M6 21h12M8 20v-8h8v8M6.5 12h11M6.5 12V4h3v3h2V4h2v3h2V4h2.5v8')),
  criticalDash: icon(stroke('M3 18 9 6M8 18 14 6M13 18 19 6'), stroke('m17 4 4 2-1 4')),
  splitVolley: icon(stroke('M4 19 12 4l8 15M12 4v16M8 7l4-3 4 3M3 15l1 4 4-1m9-3 3 4-4-1')),
  rapidWeave: icon(stroke('M5 8a8 8 0 0 1 14-2M19 3v4h-4M19 16A8 8 0 0 1 5 18M5 21v-4h4'), stroke('m13 8-4 5h4l-2 4 5-6h-4z')),
  aegis: icon(stroke('M12 3 20 6v6c0 4-4 7-8 9-4-2-8-5-8-9V6z'), stroke('M12 7v9M8 11h8')),
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

/** Party portrait sigil for a role; falls back to the vanguard thyrsus so an
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
