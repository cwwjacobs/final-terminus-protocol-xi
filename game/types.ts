export type Mode = 'trial' | 'god';
export type Role = 'vanguard' | 'warden' | 'hunter' | 'arcanist' | 'luminary';
export type WeaponId = 'cleave' | 'pierce' | 'resonance';
export type Element = 'fire' | 'ice' | 'lightning';
export type Action =
  | { type: 'move'; x: number; z: number; facing?: number }
  | { type: 'engage' }
  | { type: 'selectEnemy'; id: string }
  | { type: 'weapon'; id: WeaponId }
  | { type: 'magic'; element: Element }
  | { type: 'elementalShot' }
  | { type: 'selectShot'; element?: Element }
  | { type: 'revelry' }
  | { type: 'criticalDash' }
  | { type: 'splitVolley' }
  | { type: 'rapidWeave' }
  | { type: 'aegis' }
  | { type: 'fission' | 'rainOfFire' | 'rejuvenator' | 'fearless' | 'thunderclap' }
  | { type: 'lightningShock' | 'bolt' | 'clap' }
  | { type: 'faceLogos' }
  | { type: 'readyForLogos'; ready: boolean }
  | { type: 'provoke' }
  | { type: 'heal'; target?: number }
  | { type: 'shimmerWave' }
  | { type: 'mendingThread'; target?: number }
  | { type: 'guard' }
  | { type: 'dodge' }
  | { type: 'start' };

export interface Actor {
  id: string;
  name: string;
  role: Role;
  color: string;
  x: number;
  z: number;
  facing: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  tp: number;
  revelryStacks: number;
  human: boolean;
  engaged: boolean;
  moveX: number;
  moveZ: number;
  ce: number;
  ve: number;
  cooldowns: Record<string, number>;
  attackTimer: number;
  guardUntil: number;
  dodgeUntil: number;
  aiTimer: number;
  shieldCharges: number;
  hpShield: number;
  criticalCharges: number;
  sonOfZeus: boolean;
  mendingThread: null | { remaining: number; tickIn: number; source: number };
  recovery: number;
  spellRecovery: number;
  shotElement: Element;
  enemyTarget: string;
  selfChainUntil: number;
  rapidWeave: null | { remaining: number; charges: Record<Element, number>; refresh: Record<Element, number> };
  elementalCycle: { elements: Element[]; remaining: number };
  sequence: null | { id: number; kind: 'criticalDash' | 'splitVolley'; elapsed: number; nextHit: number; landedHits: number; originX: number; originZ: number };
}

export interface BossCast {
  name: string;
  remaining: number;
  total: number;
  kind: 'circle' | 'cone' | 'raid';
  x: number;
  z: number;
  radius: number;
  angle: number;
  abilityId?: string;
  target?: number;
  pulses?: number;
}

/** Presentation-only identity and a copied boss impact area. Optional for old saves. */
export interface CombatPresentationMetadata {
  abilityId?: string;
  weaponId?: WeaponId;
  element?: Element;
  enemyId?: string;
  area?: Pick<BossCast, 'kind' | 'x' | 'z' | 'radius' | 'angle' | 'target' | 'total' | 'pulses' | 'abilityId'>;
}

export interface EnemyStatus {
  stunRemaining: number;
  burn: null | { source: number; total: number; dealt: number; ticks: number; tickIn: number };
}

export interface Enemy extends EnemyStatus {
  id: string;
  name: string;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  target: number;
  attackTimer: number;
}

export interface ActorRunStats {
  /** Effective HP removed/restored; overkill and overhealing are excluded. */
  damage: number;
  healing: number;
  taken: number;
  deaths: number;
}

export interface RunStats {
  /** Combat clock when recording began; legacy active saves start mid-run. */
  startedAt: number;
  partial: boolean;
  party: ActorRunStats[];
}

export interface GameState {
  version: 2;
  rng: number;
  sequenceSeq: number;
  time: number;
  combatTime: number;
  tick: number;
  remainder: number;
  eventSeq: number;
  mode: Mode;
  status: 'ready' | 'fighting' | 'victory' | 'defeat';
  encounter: 'crown' | 'logos';
  logos: { stage: 'none' | 'descent' | 'sentinels' | 'giant' | 'collapse' | 'escaped'; elapsed: number; readySlots?: number[] };
  ultimatesUnlocked: boolean;
  duskRemaining: number;
  enemies: Enemy[];
  runStats: RunStats;
  storm: import('./static-storm.ts').StaticStorm;
  party: Actor[];
  boss: EnemyStatus & {
    name: string;
    x: number;
    z: number;
    hp: number;
    maxHp: number;
    target: number;
    phase: number;
    facing: number;
    attackTimer: number;
    specialTimer: number;
    castCount: number;
    cooldowns: Record<string, number>;
    cast: BossCast | null;
  };
  chain: null | { property: string; opener: number; remaining: number; weapon: WeaponId; openedAt: number };
  burst: null | { element: Element; remaining: number };
  events: ({ id: number; time: number; kind: string; text: string; actor?: number; value?: number; target?: number; source?: string; critical?: boolean; sequenceId?: number; hitIndex?: number } & CombatPresentationMetadata)[];
}

export interface ActionResult { ok: boolean; error?: string }
