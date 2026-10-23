export type Mode = 'trial' | 'god';
export type Role = 'vanguard' | 'warden' | 'hunter' | 'arcanist' | 'luminary';
export type WeaponId = 'cleave' | 'pierce' | 'resonance';
export type Element = 'fire' | 'ice' | 'lightning';
export type Action =
  | { type: 'move'; x: number; z: number; facing?: number }
  | { type: 'engage' }
  | { type: 'weapon'; id: WeaponId }
  | { type: 'magic'; element: Element }
  | { type: 'revelry' }
  | { type: 'provoke' }
  | { type: 'heal' }
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
}

export interface GameState {
  version: 1;
  time: number;
  combatTime: number;
  tick: number;
  remainder: number;
  eventSeq: number;
  mode: Mode;
  status: 'ready' | 'fighting' | 'victory' | 'defeat';
  party: Actor[];
  boss: {
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
    cast: BossCast | null;
  };
  chain: null | { property: string; opener: number; remaining: number; weapon: WeaponId; openedAt: number };
  burst: null | { element: Element; remaining: number };
  events: { id: number; time: number; kind: string; text: string; actor?: number; value?: number; target?: number }[];
}

export interface ActionResult { ok: boolean; error?: string }
