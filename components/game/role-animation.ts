import { MAGIC, WEAPONS } from '../../game/content.ts';
import type { Role } from '../../game/types.ts';

/** Pure mapping from authoritative combat events to library clips.
 *
 * Clip names are the ones inside public/assets/animations/hero-animations.glb,
 * built by scripts/animation/retarget.py from the CC0 kits listed in
 * docs/ANIMATION-SOURCES.md. The kernel decides whether an action happened;
 * this file only decides what a confirmed action looks like, where in the clip
 * the visual contact falls, and whether the clip owns the legs. Multi-hit
 * signature abilities need dedicated sequencing before they can use this layer. */

export type ActionKey =
  | 'auto' | 'weapon:cleave' | 'weapon:pierce' | 'weapon:resonance'
  | 'magic' | 'burst' | 'heal' | 'provoke' | 'guard' | 'dodge' | 'revelry'
  | 'hit' | 'down';

export interface ActionClip {
  /** Library clip name. */
  clip: string;
  /** Seconds into the clip when the strike/cast visually lands; the impact effect waits for it. */
  contact: number;
  /** Legs stay on locomotion ('upper') or the clip owns the whole body ('full'). */
  body: 'upper' | 'full';
  /** Clip holds its last frame instead of returning to locomotion (death). */
  hold?: boolean;
  /** Playback rate; 1 is the library's timing. */
  rate?: number;
}

/** Clip names are the Quaternius Universal Animation Library (Standard, CC0)
 * clips retargeted by scripts/animation/retarget.py; contact times were
 * measured as the frame of peak hand reach on the retargeted hero rig.
 * INTERIM marks clips standing in for motion the free library lacks (bow,
 * two-handed polearm, a true block); the receipt carries the same list so a
 * later pack can replace them without touching the kernel. */
export const INTERIM_CLIPS = ['Pistol_Shoot', 'Punch_Enter', 'Punch_Cross', 'Interact'] as const;

/** Shared defaults every role falls back to. */
const SHARED: Partial<Record<ActionKey, ActionClip>> = {
  hit: { clip: 'Hit_Chest', contact: 0, body: 'full' },
  down: { clip: 'Death01', contact: 0, body: 'full', hold: true },
  dodge: { clip: 'Roll', contact: 0, body: 'full', rate: 1.25 },
  guard: { clip: 'Punch_Enter', contact: .2, body: 'upper' },
  provoke: { clip: 'Interact', contact: .6, body: 'upper', rate: 1.4 },
  revelry: { clip: 'Spell_Simple_Enter', contact: .45, body: 'upper' },
};

const TWO_HANDED: Partial<Record<ActionKey, ActionClip>> = {
  auto: { clip: 'Sword_Attack', contact: .3, body: 'upper', rate: 1.35 },
  'weapon:cleave': { clip: 'Sword_Attack', contact: .3, body: 'upper' },
  'weapon:pierce': { clip: 'Punch_Cross', contact: .27, body: 'upper' },
  'weapon:resonance': { clip: 'Sword_Attack', contact: .3, body: 'upper', rate: .8 },
};

export const ROLE_ACTIONS: Record<Role, Partial<Record<ActionKey, ActionClip>>> = {
  vanguard: { ...SHARED, ...TWO_HANDED },
  warden: { ...SHARED, ...TWO_HANDED },
  hunter: {
    ...SHARED,
    auto: { clip: 'Pistol_Shoot', contact: .47, body: 'upper', rate: 1.3 },
    'weapon:cleave': { clip: 'Pistol_Shoot', contact: .47, body: 'upper' },
    'weapon:pierce': { clip: 'Pistol_Shoot', contact: .47, body: 'upper', rate: .8 },
    'weapon:resonance': { clip: 'Pistol_Shoot', contact: .47, body: 'upper', rate: .9 },
  },
  arcanist: {
    ...SHARED,
    auto: { clip: 'Spell_Simple_Shoot', contact: .15, body: 'upper', rate: 1.2 },
    magic: { clip: 'Spell_Simple_Shoot', contact: .15, body: 'upper' },
    burst: { clip: 'Spell_Simple_Shoot', contact: .15, body: 'upper', rate: .75 },
  },
  luminary: {
    ...SHARED,
    auto: { clip: 'Spell_Simple_Shoot', contact: .15, body: 'upper', rate: 1.2 },
    heal: { clip: 'Spell_Simple_Enter', contact: .5, body: 'upper' },
    magic: { clip: 'Spell_Simple_Shoot', contact: .15, body: 'upper' },
  },
};

/** Bones a body:'upper' clip may write; legs, feet and hips stay with locomotion. */
export const UPPER_BODY_BONES = ['spine', 'chest', 'upper_chest', 'neck', 'head',
  'clavicle_L', 'upper_arm_L', 'forearm_L', 'hand_L', 'clavicle_R', 'upper_arm_R', 'forearm_R', 'hand_R'] as const;

/** Locomotion clips the library may add on top of the hero file's own idle/walk.
 * Strafe clips are not in this library; the runtime only receives scalar speed today. */
export const LOCOMOTION = { run: 'Jog_Fwd_Loop' } as const;
/** Speed (m/s) above which the run loop takes over from the hero's walk. */
export const RUN_SPEED = 2.2;

/** Every library clip the maps reference, for the asset receipt test. */
export function referencedClips(): string[] {
  const names = new Set<string>(Object.values(LOCOMOTION));
  for (const role of Object.values(ROLE_ACTIONS)) for (const entry of Object.values(role)) if (entry) names.add(entry.clip);
  return [...names].sort();
}

/** Classify an authoritative event. Only kinds the kernel emits for a party
 * actor map to a key; log lines, boss casts and chain bookkeeping return null. */
export function actionKey(event: { kind: string; text: string; source?: string }): ActionKey | null {
  // Signature actions need dedicated choreography; don't infer an ordinary
  // weaponskill from their display text or replace their authoritative timing.
  if (['criticalDash', 'splitVolley', 'rapidWeave', 'aegis'].includes(event.source ?? '')) return null;
  switch (event.kind) {
    case 'auto': return 'auto';
    case 'weapon': {
      const id = (Object.keys(WEAPONS) as (keyof typeof WEAPONS)[]).find(key => event.text.includes(WEAPONS[key].name));
      return id ? `weapon:${id}` : null;
    }
    case 'magic': return 'magic';
    case 'burst': return 'burst';
    case 'heal': return 'heal';
    case 'provoke': return 'provoke';
    case 'guard': return 'guard';
    case 'dodge': return 'dodge';
    case 'revelry': return 'revelry';
    case 'hit': return 'hit';
    case 'down': return 'down';
    default: return null;
  }
}

export function clipFor(role: Role, key: ActionKey): ActionClip | null {
  return ROLE_ACTIONS[role]?.[key] ?? null;
}

/** Element color for cast effects; keeps the map and content.ts in one place. */
export function elementColor(text: string): string | null {
  const element = (Object.keys(MAGIC) as (keyof typeof MAGIC)[]).find(key => text.includes(MAGIC[key].name));
  return element ? MAGIC[element].color : null;
}
