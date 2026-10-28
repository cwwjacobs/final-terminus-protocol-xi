import type { Role } from '../../game/types.ts';
import { ULTIMATES } from '../../game/content.ts';

export const COMMANDS = [
  { id: 'forward', label: 'Move forward', group: 'Movement', defaultKey: 'KeyW' },
  { id: 'backward', label: 'Move backward', group: 'Movement', defaultKey: 'KeyS' },
  { id: 'left', label: 'Strafe left', group: 'Movement', defaultKey: 'KeyA' },
  { id: 'right', label: 'Strafe right', group: 'Movement', defaultKey: 'KeyD' },
  { id: 'cameraLeft', label: 'Look left', group: 'Camera', defaultKey: 'KeyJ' },
  { id: 'cameraRight', label: 'Look right', group: 'Camera', defaultKey: 'KeyL' },
  { id: 'cameraUp', label: 'Look up', group: 'Camera', defaultKey: 'KeyI' },
  { id: 'cameraDown', label: 'Look down', group: 'Camera', defaultKey: 'KeyK' },
  { id: 'zoomIn', label: 'Zoom in', group: 'Camera', defaultKey: 'PageUp' },
  { id: 'zoomOut', label: 'Zoom out', group: 'Camera', defaultKey: 'PageDown' },
  { id: 'recenter', label: 'Recenter camera', group: 'Camera', defaultKey: 'KeyV', defaultButton: 11 },
  { id: 'targetNext', label: 'Next enemy (Tab)', group: 'Targeting', defaultKey: 'Tab' },
  { id: 'targetPrevious', label: 'Previous enemy (Tab)', group: 'Targeting', defaultKey: 'Shift+Tab' },
  { id: 'targetEnemyPrevious', label: 'Previous enemy', group: 'Targeting', defaultKey: 'ArrowLeft', defaultButton: 14 },
  { id: 'targetEnemyNext', label: 'Next enemy', group: 'Targeting', defaultKey: 'ArrowRight', defaultButton: 15 },
  { id: 'targetAllyPrevious', label: 'Previous ally', group: 'Targeting', defaultKey: 'ArrowUp', defaultButton: 12 },
  { id: 'targetAllyNext', label: 'Next ally', group: 'Targeting', defaultKey: 'ArrowDown', defaultButton: 13 },
  { id: 'primary1', label: 'Primary ability 1 · role dependent', group: 'Combat', defaultKey: 'Digit1', defaultButton: 2 },
  { id: 'primary2', label: 'Primary ability 2 · role dependent', group: 'Combat', defaultKey: 'Digit2', defaultButton: 3 },
  { id: 'primary3', label: 'Primary ability 3 · role dependent', group: 'Combat', defaultKey: 'Digit3', defaultButton: 5 },
  { id: 'engage', label: 'Engage / disengage', group: 'Combat', defaultKey: 'Space', defaultButton: 0 },
  { id: 'utility1', label: 'Role technique · Dash / Provoke / Volley / Weave', group: 'Combat', defaultKey: 'KeyQ', defaultButton: 7 },
  { id: 'utility2', label: 'Role support · Revelry / War Cry', group: 'Combat', defaultKey: 'KeyE', defaultButton: 6 },
  { id: 'ultimate', label: 'Divine ultimate · unlocks against Logos', group: 'Combat', defaultKey: 'KeyG', defaultButton: 10 },
  ...(['fearless', 'thunderclap', 'rainOfFire', 'fission', 'rejuvenator', 'lightningShock', 'bolt', 'clap'] as const).map(id => ({ id, label: id === 'rainOfFire' ? 'Rain of Fire' : id === 'lightningShock' ? 'Lightning Shock' : id[0].toUpperCase() + id.slice(1), group: 'Direct ability overrides', defaultKey: '' })),
  { id: 'cleave', label: 'Arc Cleave', group: 'Direct ability overrides', defaultKey: '' },
  { id: 'pierce', label: 'Vector Pierce', group: 'Direct ability overrides', defaultKey: '' },
  { id: 'resonance', label: 'Q Resonance', group: 'Direct ability overrides', defaultKey: '' },
  { id: 'fire', label: 'Fire magic', group: 'Direct ability overrides', defaultKey: '' },
  { id: 'ice', label: 'Ice magic', group: 'Direct ability overrides', defaultKey: '' },
  { id: 'lightning', label: 'Lightning magic', group: 'Direct ability overrides', defaultKey: '' },
  { id: 'provoke', label: 'Provoke', group: 'Direct ability overrides', defaultKey: '' },
  { id: 'warCry', label: 'War Cry', group: 'Direct ability overrides', defaultKey: '' },
  { id: 'heal', label: 'Restore', group: 'Direct ability overrides', defaultKey: '' },
  { id: 'guard', label: 'Guard', group: 'Combat', defaultKey: 'ShiftLeft', defaultButton: 4 },
  { id: 'dodge', label: 'Evade', group: 'Combat', defaultKey: 'KeyC', defaultButton: 1 },
  { id: 'revelry', label: 'Revelry · optional direct binding', group: 'Direct ability overrides', defaultKey: '' },
  { id: 'criticalDash', label: 'Critical Dash', group: 'Direct ability overrides', defaultKey: '' },
  { id: 'selectShot', label: 'Change shot element', group: 'Combat', defaultKey: 'KeyR', defaultButton: 8 },
  { id: 'elementalShot', label: 'Elemental Shot', group: 'Direct ability overrides', defaultKey: '' },
  { id: 'splitVolley', label: 'Split Volley', group: 'Direct ability overrides', defaultKey: '' },
  { id: 'rapidWeave', label: 'Rapid Weave · optional direct binding', group: 'Direct ability overrides', defaultKey: '' },
  { id: 'shimmerWave', label: 'Shimmer Wave', group: 'Direct ability overrides', defaultKey: '' },
  { id: 'mendingThread', label: 'Mending Thread', group: 'Direct ability overrides', defaultKey: '' },
  { id: 'aegis', label: 'Aegis', group: 'Direct ability overrides', defaultKey: '' },
  { id: 'commandMenu', label: 'Optional command menu', group: 'Menus', defaultKey: '' },
] as const;

export type Command = (typeof COMMANDS)[number]['id'];
export interface ControlSettings {
  version: 5;
  keys: Record<Command, string>;
  buttons: Partial<Record<Command, number>>;
  mouseSensitivity: number;
  touchSensitivity: number;
  stickSensitivity: number;
  zoomSensitivity: number;
  invertMouseX: boolean;
  invertMouseY: boolean;
  invertPadX: boolean;
  invertPadY: boolean;
  invertMoveX: boolean;
  invertMoveY: boolean;
  cameraHeight: number;
  shoulderOffset: number;
  defaultDistance: number;
}

const commandIds = new Set<string>(COMMANDS.map(command => command.id));
const validCode = /^(?:Shift\+)?(?:Key[A-Z]|Digit[0-9]|Numpad[0-9]|Numpad(?:Add|Subtract|Multiply|Divide|Decimal|Enter)|Arrow(?:Left|Right|Up|Down)|PageUp|PageDown|Home|End|Insert|Delete|Backspace|Enter|Space|Tab|ShiftLeft|ShiftRight|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Minus|Equal|Backquote)$/;
const safeKey = (value: unknown): value is string => typeof value === 'string' && (value === '' || (validCode.test(value) && !value.startsWith('Shift+Shift')));
const safeButton = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 31;

export function defaults(): ControlSettings {
  return {
    version: 5,
    keys: Object.fromEntries(COMMANDS.map(command => [command.id, command.defaultKey])) as Record<Command, string>,
    buttons: Object.fromEntries(COMMANDS.flatMap(command => 'defaultButton' in command ? [[command.id, command.defaultButton]] : [])),
    mouseSensitivity: 1, touchSensitivity: 1, stickSensitivity: 1, zoomSensitivity: 1,
    invertMouseX: false, invertMouseY: false, invertPadX: false, invertPadY: false,
    invertMoveX: false, invertMoveY: false,
    cameraHeight: 1.5, shoulderOffset: 0, defaultDistance: 12,
  };
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

// These are the shipped v1–v3 mappings, not inferred from the current defaults.
// Only a recognizable untouched preset is migrated; custom layouts retain their choices.
const oldKeys: Record<string, string> = {
  forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD',
  cameraLeft: 'ArrowLeft', cameraRight: 'ArrowRight', cameraUp: 'ArrowUp', cameraDown: 'ArrowDown',
  zoomIn: 'PageUp', zoomOut: 'PageDown', recenter: 'KeyV', targetNext: 'Tab', targetPrevious: 'Shift+Tab',
  engage: 'Space', cleave: 'Digit1', pierce: 'Digit2', resonance: 'Digit3',
  fire: 'Digit4', ice: 'Digit5', lightning: 'Digit6', provoke: 'KeyR', heal: 'KeyF',
  guard: 'ShiftLeft', dodge: 'KeyC', revelry: 'KeyQ', commandMenu: 'Enter',
};
const oldButtons: Record<string, number> = {
  recenter: 11, targetNext: 10, cleave: 2, pierce: 3, resonance: 5,
  fire: 12, ice: 13, lightning: 14, provoke: 7, heal: 4, guard: 6, dodge: 1, revelry: 15, commandMenu: 0,
};
function legacyPreset(map: Record<string, unknown>, expected: Record<string, string | number>, version: unknown): boolean {
  const preset = { ...expected };
  if (version !== 2 && version !== 3) delete preset.revelry;
  if (version !== 3) {
    delete preset.commandMenu;
    if (expected === oldButtons) preset.engage = 0;
  }
  // Later fields occasionally appeared before the version bump; they are safe
  // only if they agree with the shipped binding.
  return Object.entries(preset).every(([id, binding]) => map[id] === binding)
    && Object.entries(map).every(([id, binding]) => binding === preset[id] || binding === expected[id]);
}

export type PrimaryCommand = 'primary1' | 'primary2' | 'primary3';
export type RoleSlotCommand = PrimaryCommand | 'utility1' | 'utility2';
export const ROLE_SLOT_COMMANDS: readonly RoleSlotCommand[] = ['primary1', 'primary2', 'primary3', 'utility1', 'utility2'];
/** The same slots drive input, HUD ordering and effective binding labels. */
export const ROLE_ACTION_SLOTS: Record<Role, readonly (Command | null)[]> = {
  vanguard: ['cleave', 'pierce', 'resonance', 'criticalDash', 'revelry'],
  warden: ['cleave', 'pierce', 'resonance', 'provoke', 'warCry'],
  hunter: ['cleave', 'pierce', 'resonance', 'splitVolley', 'elementalShot'],
  arcanist: ['fire', 'ice', 'lightning', 'rapidWeave', null],
  luminary: ['heal', 'aegis', 'shimmerWave', 'mendingThread', null],
};
export function roleCommand(role: Role, slot: Command, sonOfZeus = false): Command | null {
  if (slot === 'ultimate') return ULTIMATES[role];
  if (role === 'warden' && sonOfZeus && ['primary1', 'primary2', 'primary3'].includes(slot)) return (['lightningShock', 'bolt', 'clap'] as const)[Number(slot.at(-1)) - 1];
  const index = ROLE_SLOT_COMMANDS.indexOf(slot as RoleSlotCommand);
  return index < 0 ? slot : ROLE_ACTION_SLOTS[role]?.[index] ?? null;
}
export function primaryCommand(role: Role, slot: PrimaryCommand): Command | null { return roleCommand(role, slot); }

export function effectiveBindingCommand(role: Role, action: Command, settings: ControlSettings, mode: 'keyboard' | 'controller', sonOfZeus = false): Command | null {
  const bound = (command: Command) => mode === 'controller' ? settings.buttons[command] !== undefined : !!settings.keys[command];
  return [...ROLE_SLOT_COMMANDS, 'ultimate' as const].find(slot => roleCommand(role, slot, sonOfZeus) === action && bound(slot)) ?? (bound(action) ? action : null);
}

/** Old per-device presets are recognized exactly; one customized device never
 * causes the other device's bindings to be silently overwritten. */
const v4Keys: Record<string, string> = {
  ...oldKeys, cameraLeft: 'KeyJ', cameraRight: 'KeyL', cameraUp: 'KeyI', cameraDown: 'KeyK',
  targetEnemyPrevious: 'ArrowLeft', targetEnemyNext: 'ArrowRight', targetAllyPrevious: 'ArrowUp', targetAllyNext: 'ArrowDown',
  primary1: 'Digit1', primary2: 'Digit2', primary3: 'Digit3',
  cleave: 'Shift+Digit1', pierce: 'Shift+Digit2', resonance: 'Shift+Digit3',
  criticalDash: 'KeyZ', splitVolley: 'KeyX', rapidWeave: 'KeyE', aegis: 'KeyT',
};
const v4Buttons: Record<string, number> = {
  recenter: 11, targetNext: 10, targetEnemyPrevious: 14, targetEnemyNext: 15,
  targetAllyPrevious: 12, targetAllyNext: 13, primary1: 2, primary2: 3, primary3: 5,
  provoke: 7, heal: 4, guard: 6, dodge: 1, commandMenu: 0,
};
const exactPreset = (map: Record<string, unknown>, expected: Record<string, string | number>) =>
  Object.keys(map).length === Object.keys(expected).length && Object.entries(expected).every(([key, value]) => map[key] === value);

/** Explain missing effective action mappings without mistaking optional aliases
 * for missing controls. Custom maps are preserved even when a new slot is free. */
export function bindingWarnings(settings: ControlSettings): string[] {
  const warnings: string[] = [];
  for (const mode of ['keyboard', 'controller'] as const) if (!effectiveBindingCommand('vanguard', 'fearless', settings, mode))
    warnings.push(`Divine ultimate has no ${mode} binding. Your existing bindings were kept; assign Ultimate below or restore defaults.`);
  for (const id of ['targetEnemyPrevious', 'targetEnemyNext', 'targetAllyPrevious', 'targetAllyNext', 'primary1', 'primary2', 'primary3'] as const) {
    if (!settings.keys[id] && settings.buttons[id] === undefined) warnings.push(`${COMMANDS.find(command => command.id === id)!.label} is unbound. Your existing bindings were kept; assign it below or restore defaults.`);
  }
  const seen = new Set<Command>();
  for (const role of Object.keys(ROLE_ACTION_SLOTS) as Role[]) for (const action of ROLE_ACTION_SLOTS[role]) {
    if (!action || seen.has(action)) continue;
    seen.add(action);
    const label = COMMANDS.find(command => command.id === action)!.label;
    for (const mode of ['keyboard', 'controller'] as const) if (!effectiveBindingCommand(role, action, settings, mode))
      warnings.push(`${label} has no ${mode} binding. Your existing bindings were kept; assign a role slot or direct binding below.`);
  }
  return warnings;
}

/** Saved bindings are data: discard unknown fields, bound numbers and remove conflicts. */
export function normalizeControls(value: unknown): ControlSettings {
  const result = defaults();
  if (!object(value) || (value.version !== undefined && ![1, 2, 3, 4, 5].includes(value.version as number))) return result;
  const legacy = value.version !== 5;
  const beforeV4 = value.version !== 4 && value.version !== 5;
  const keys = object(value.keys) ? value.keys : undefined;
  const buttons = object(value.buttons) ? value.buttons : undefined;
  const migrateKeys = legacy && keys && (value.version === 4 ? exactPreset(keys, v4Keys) : legacyPreset(keys, oldKeys, value.version));
  const migrateButtons = legacy && buttons && (value.version === 4 ? exactPreset(buttons, v4Buttons) : legacyPreset(buttons, oldButtons, value.version));
  if (keys && !migrateKeys) {
    if (legacy) for (const command of COMMANDS) result.keys[command.id] = (beforeV4 ? oldKeys : v4Keys)[command.id] ?? '';
    for (const command of COMMANDS) if (safeKey(keys[command.id])) result.keys[command.id] = keys[command.id] as string;
  }
  if (buttons && !migrateButtons) {
    // Omitted entries in an explicitly saved map mean unbound. In particular,
    // never steal A for Commands or LT/RT for a newly added role technique.
    result.buttons = {};
    for (const command of COMMANDS) if (safeButton(buttons[command.id])) result.buttons[command.id] = buttons[command.id] as number;
  }
  const usedKeys = new Set<string>(), usedButtons = new Set<number>();
  // Explicit saved choices take priority over defaults introduced by a new release.
  const ordered = keys && !migrateKeys ? [...COMMANDS.filter(command => safeKey(keys[command.id])), ...COMMANDS.filter(command => !safeKey(keys[command.id]))] : COMMANDS;
  for (const command of ordered) {
    const key = result.keys[command.id];
    if (key && usedKeys.has(key)) result.keys[command.id] = '';
    else if (key) usedKeys.add(key);
  }
  for (const command of COMMANDS) {
    const button = result.buttons[command.id];
    if (button !== undefined && usedButtons.has(button)) delete result.buttons[command.id];
    else if (button !== undefined) usedButtons.add(button);
  }
  if (beforeV4 && keys && !migrateKeys) for (const command of COMMANDS) {
    // New keyboard commands are added only when their default is genuinely free.
    if (command.defaultKey && !(command.id in oldKeys) && !Object.hasOwn(keys, command.id) && !usedKeys.has(command.defaultKey)) {
      result.keys[command.id] = command.defaultKey;
      usedKeys.add(command.defaultKey);
    }
  }
  for (const key of ['mouseSensitivity', 'touchSensitivity', 'stickSensitivity', 'zoomSensitivity'] as const) {
    const n = value[key];
    if (typeof n === 'number' && Number.isFinite(n)) result[key] = Math.max(0.1, Math.min(3, n));
  }
  for (const [key, low, high] of [['cameraHeight', 0.2, 5], ['shoulderOffset', -3, 3], ['defaultDistance', 4, 24]] as const) {
    const n = value[key];
    if (typeof n === 'number' && Number.isFinite(n)) result[key] = Math.max(low, Math.min(high, n));
  }
  for (const key of ['invertMouseX', 'invertMouseY', 'invertPadX', 'invertPadY', 'invertMoveX', 'invertMoveY'] as const) {
    if (typeof value[key] === 'boolean') result[key] = value[key];
  }
  return result;
}

/** Browser/system chords and Escape remain reserved, including during remapping. */
export function keyboardEventBinding(event: Pick<KeyboardEvent, 'code' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'>): string {
  if (event.ctrlKey || event.metaKey || event.altKey) return '';
  const key = event.shiftKey && event.code !== 'ShiftLeft' && event.code !== 'ShiftRight' ? `Shift+${event.code}` : event.code;
  return safeKey(key) ? key : '';
}

export function bindKey(settings: ControlSettings, command: Command, code: string): ControlSettings {
  const result = normalizeControls(settings);
  if (!commandIds.has(command) || !safeKey(code)) return result;
  const previous = result.keys[command];
  const conflict = code ? COMMANDS.find(other => other.id !== command && result.keys[other.id] === code) : undefined;
  if (conflict) result.keys[conflict.id] = previous === code ? '' : previous;
  result.keys[command] = code;
  return result;
}

export function bindButton(settings: ControlSettings, command: Command, button: number | undefined): ControlSettings {
  const result = normalizeControls(settings);
  if (!commandIds.has(command) || (button !== undefined && !safeButton(button))) return result;
  const previous = result.buttons[command];
  const conflict = button === undefined ? undefined : COMMANDS.find(other => other.id !== command && result.buttons[other.id] === button);
  if (conflict) {
    if (previous !== undefined && previous !== button) result.buttons[conflict.id] = previous;
    else delete result.buttons[conflict.id];
  }
  if (button === undefined) delete result.buttons[command];
  else result.buttons[command] = button;
  return result;
}

export function keyLabel(code: string): string {
  if (!code) return 'Unbound';
  const labels: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', PageUp: 'Page Up', PageDown: 'Page Down', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Minus: '−', Equal: '=', Backquote: '`' };
  return code.split('+').map(part => labels[part] ?? part.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ')).join(' + ');
}

export function buttonLabel(button: number): string {
  return ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Guide'][button] ?? `Button ${button}`;
}
