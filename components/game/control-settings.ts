export const COMMANDS = [
  { id: 'forward', label: 'Move forward', group: 'Movement', defaultKey: 'KeyW' },
  { id: 'backward', label: 'Move backward', group: 'Movement', defaultKey: 'KeyS' },
  { id: 'left', label: 'Strafe left', group: 'Movement', defaultKey: 'KeyA' },
  { id: 'right', label: 'Strafe right', group: 'Movement', defaultKey: 'KeyD' },
  { id: 'cameraLeft', label: 'Look left', group: 'Camera', defaultKey: 'ArrowLeft' },
  { id: 'cameraRight', label: 'Look right', group: 'Camera', defaultKey: 'ArrowRight' },
  { id: 'cameraUp', label: 'Look up', group: 'Camera', defaultKey: 'ArrowUp' },
  { id: 'cameraDown', label: 'Look down', group: 'Camera', defaultKey: 'ArrowDown' },
  { id: 'zoomIn', label: 'Zoom in', group: 'Camera', defaultKey: 'PageUp' },
  { id: 'zoomOut', label: 'Zoom out', group: 'Camera', defaultKey: 'PageDown' },
  { id: 'recenter', label: 'Recenter camera', group: 'Camera', defaultKey: 'KeyV', defaultButton: 11 },
  { id: 'targetNext', label: 'Next target', group: 'Targeting', defaultKey: 'Tab', defaultButton: 10 },
  { id: 'targetPrevious', label: 'Previous target', group: 'Targeting', defaultKey: 'Shift+Tab' },
  { id: 'engage', label: 'Engage / disengage', group: 'Combat', defaultKey: 'Space', defaultButton: 0 },
  { id: 'cleave', label: 'Arc Cleave', group: 'Combat', defaultKey: 'Digit1', defaultButton: 2 },
  { id: 'pierce', label: 'Vector Pierce', group: 'Combat', defaultKey: 'Digit2', defaultButton: 3 },
  { id: 'resonance', label: 'Q Resonance', group: 'Combat', defaultKey: 'Digit3', defaultButton: 5 },
  { id: 'fire', label: 'Fire magic', group: 'Combat', defaultKey: 'Digit4', defaultButton: 12 },
  { id: 'ice', label: 'Ice magic', group: 'Combat', defaultKey: 'Digit5', defaultButton: 13 },
  { id: 'lightning', label: 'Lightning magic', group: 'Combat', defaultKey: 'Digit6', defaultButton: 14 },
  { id: 'provoke', label: 'Provoke', group: 'Combat', defaultKey: 'KeyR', defaultButton: 7 },
  { id: 'heal', label: 'Mend', group: 'Combat', defaultKey: 'KeyF', defaultButton: 4 },
  { id: 'guard', label: 'Guard', group: 'Combat', defaultKey: 'ShiftLeft', defaultButton: 6 },
  { id: 'dodge', label: 'Evade', group: 'Combat', defaultKey: 'KeyC', defaultButton: 1 },
  { id: 'revelry', label: 'Revelry', group: 'Combat', defaultKey: 'KeyQ', defaultButton: 15 },
] as const;

export type Command = (typeof COMMANDS)[number]['id'];
export interface ControlSettings {
  version: 2;
  keys: Record<Command, string>;
  buttons: Partial<Record<Command, number>>;
  mouseSensitivity: number;
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
    version: 2,
    keys: Object.fromEntries(COMMANDS.map(command => [command.id, command.defaultKey])) as Record<Command, string>,
    buttons: Object.fromEntries(COMMANDS.flatMap(command => 'defaultButton' in command ? [[command.id, command.defaultButton]] : [])),
    mouseSensitivity: 1, stickSensitivity: 1, zoomSensitivity: 1,
    invertMouseX: false, invertMouseY: false, invertPadX: false, invertPadY: false,
    invertMoveX: false, invertMoveY: false,
    cameraHeight: 1.5, shoulderOffset: 0, defaultDistance: 12,
  };
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Saved bindings are data: discard unknown fields, bound numbers and remove conflicts. */
export function normalizeControls(value: unknown): ControlSettings {
  const result = defaults();
  if (!object(value) || (value.version !== undefined && value.version !== 1 && value.version !== 2)) return result;
  if (object(value.keys)) for (const command of COMMANDS) {
    const key = value.keys[command.id];
    if (safeKey(key)) result.keys[command.id] = key;
  }
  if (object(value.buttons)) {
    // An omitted entry in an explicitly saved buttons map means unbound.
    result.buttons = {};
    for (const command of COMMANDS) {
      const button = value.buttons[command.id];
      if (safeButton(button)) result.buttons[command.id] = button;
    }
    // Older preferences never contained Revelry. Add its new default only if it
    // does not displace an existing binding; v2 omissions remain deliberate unbinds.
    if (value.version !== 2 && !Object.hasOwn(value.buttons, 'revelry') &&
        !Object.values(result.buttons).includes(15)) result.buttons.revelry = 15;
  }
  const usedKeys = new Set<string>(), usedButtons = new Set<number>();
  for (const command of COMMANDS) {
    const key = result.keys[command.id], button = result.buttons[command.id];
    if (key && usedKeys.has(key)) result.keys[command.id] = '';
    else if (key) usedKeys.add(key);
    if (button !== undefined && usedButtons.has(button)) delete result.buttons[command.id];
    else if (button !== undefined) usedButtons.add(button);
  }
  for (const key of ['mouseSensitivity', 'stickSensitivity', 'zoomSensitivity'] as const) {
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
