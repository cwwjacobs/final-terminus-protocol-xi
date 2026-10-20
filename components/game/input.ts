import type { Action } from '../../game/types.ts';
import { COMMANDS, keyboardEventBinding, normalizeControls } from './control-settings.ts';
import type { Command, ControlSettings } from './control-settings.ts';

export const deadzone = (n: number, threshold = 0.18) => !Number.isFinite(n) || Math.abs(n) <= threshold ? 0 : Math.sign(n) * Math.min(1, (Math.abs(n) - threshold) / (1 - threshold));
/** Positive local x is screen-right; positive local z is camera-forward. */
export const movement = (x: number, z: number, yaw: number) => ({ x: bounded(-Math.cos(yaw) * x + Math.sin(yaw) * z, 1), z: bounded(Math.sin(yaw) * x + Math.cos(yaw) * z, 1) });

export interface InputOptions {
  send: (action: Action) => void;
  getFacing: () => number;
  getCameraYaw: () => number;
  getSettings: () => ControlSettings;
  onPad: (present: boolean) => void;
  enabled: () => boolean;
  onCommand: (command: Command) => void;
  onLook: (dx: number, dy: number) => void;
  onZoom: (delta: number) => void;
}

const combat: Partial<Record<Command, Action>> = {
  engage: { type: 'engage' }, cleave: { type: 'weapon', id: 'cleave' },
  pierce: { type: 'weapon', id: 'pierce' }, resonance: { type: 'weapon', id: 'resonance' },
  fire: { type: 'magic', element: 'fire' }, ice: { type: 'magic', element: 'ice' }, lightning: { type: 'magic', element: 'lightning' },
  provoke: { type: 'provoke' }, heal: { type: 'heal' }, guard: { type: 'guard' }, dodge: { type: 'dodge' },
};
const continuous = new Set<Command>(['forward', 'backward', 'left', 'right', 'cameraLeft', 'cameraRight', 'cameraUp', 'cameraDown', 'zoomIn', 'zoomOut']);
const modifier = (code: string) => code === 'ShiftLeft' || code === 'ShiftRight';
const bounded = (n: number, maximum: number) => Number.isFinite(n) ? Math.max(-maximum, Math.min(maximum, n)) : 0;

export function bindInput(options: InputOptions): () => void {
  const { send, getFacing, getCameraYaw, getSettings, onPad, enabled, onCommand, onLook, onZoom } = options;
  const held = new Set<Command>();
  const pendingModifiers = new Map<string, Command>();
  let settings = normalizeControls(getSettings()), signature = JSON.stringify(getSettings());
  let last = performance.now(), lastMove = 0, frame = 0, dragging = false;
  let focused = document.hasFocus(), wasPlayable = false, padPresent = false, padArmed = false;
  let previousButtons: boolean[] = [], padId: number | null = null;

  const editable = () => {
    const element = document.activeElement as HTMLElement | null;
    return !!element && (/^(INPUT|SELECT|TEXTAREA|BUTTON|A|SUMMARY)$/.test(element.tagName) || element.isContentEditable || !!element.closest?.('[role="dialog"], [role="button"], [role="menu"], [role="textbox"], [role="link"]'));
  };
  const playable = () => focused && !document.hidden && enabled() && !editable();
  const stop = () => send({ type: 'move', x: 0, z: 0, facing: getFacing() });
  function clearHeld() {
    held.clear(); pendingModifiers.clear(); dragging = false; padArmed = false;
    stop();
  }
  function refreshSettings() {
    const raw = getSettings(), next = JSON.stringify(raw);
    if (next !== signature) { signature = next; settings = normalizeControls(raw); clearHeld(); }
  }
  function fire(command: Command) {
    const action = combat[command];
    if (action) send(action);
    else if (!continuous.has(command)) onCommand(command);
  }
  function down(event: KeyboardEvent) {
    refreshSettings();
    if (!playable()) return;
    const key = keyboardEventBinding(event);
    if (!key) return;
    const match = COMMANDS.find(command => settings.keys[command.id] === key)
      ?? (key.startsWith('Shift+') ? COMMANDS.find(command => settings.keys[command.id] === event.code) : undefined);
    if (!match) return;
    event.preventDefault();
    if (key.startsWith('Shift+') && settings.keys[match.id].startsWith('Shift+')) pendingModifiers.clear();
    if (event.repeat) return;
    held.add(match.id);
    if (modifier(event.code)) pendingModifiers.set(event.code, match.id);
    else if (!continuous.has(match.id)) fire(match.id);
  }
  function up(event: KeyboardEvent) {
    refreshSettings();
    const pending = pendingModifiers.get(event.code);
    pendingModifiers.delete(event.code);
    if (pending && playable() && !continuous.has(pending)) fire(pending);
    for (const command of COMMANDS) if (settings.keys[command.id].split('+').at(-1) === event.code || (modifier(event.code) && settings.keys[command.id].startsWith('Shift+'))) held.delete(command.id);
  }
  function blur() { focused = false; clearHeld(); }
  function focus() { focused = true; clearHeld(); }
  function visibility() { if (document.hidden) clearHeld(); }
  function mouseDown(event: MouseEvent) {
    refreshSettings();
    if ((event.target as HTMLElement)?.tagName !== 'CANVAS' || (event.button !== 0 && event.button !== 2) || !focused || document.hidden || !enabled()) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (!playable()) return;
    event.preventDefault(); dragging = true;
  }
  function mouseMove(event: MouseEvent) {
    refreshSettings();
    if (!dragging || !playable()) return;
    onLook(-bounded(event.movementX, 200) * 0.006 * settings.mouseSensitivity * (settings.invertMouseX ? -1 : 1), bounded(event.movementY, 200) * 0.006 * settings.mouseSensitivity * (settings.invertMouseY ? -1 : 1));
  }
  function mouseUp() { dragging = false; }
  function wheel(event: WheelEvent) {
    refreshSettings();
    if (!playable() || (event.target as HTMLElement)?.tagName !== 'CANVAS') return;
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1);
    onZoom(bounded(pixels, 1000) * 0.01 * settings.zoomSensitivity);
  }
  function contextMenu(event: MouseEvent) {
    if (playable() && (event.target as HTMLElement)?.tagName === 'CANVAS') event.preventDefault();
  }
  function loop(now: number) {
    refreshSettings();
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05)); last = now;
    const pad = Array.from(navigator.getGamepads?.() ?? []).find(candidate => candidate?.connected);
    if (!!pad !== padPresent) { padPresent = !!pad; onPad(padPresent); }
    if ((pad?.index ?? null) !== padId) { padId = pad?.index ?? null; padArmed = false; previousButtons = pad?.buttons.map(button => button.pressed) ?? []; }
    const active = playable();
    if (!active && (wasPlayable || held.size || dragging || pendingModifiers.size)) clearHeld();
    wasPlayable = active;
    const buttons = pad?.buttons.map(button => button.pressed) ?? [];
    if (!active) padArmed = false;
    else if (pad && !padArmed && !buttons.some(Boolean) && pad.axes.slice(0, 4).every(axis => deadzone(axis) === 0)) padArmed = true;
    const buttonHeld = (command: Command) => padArmed && settings.buttons[command] !== undefined && !!buttons[settings.buttons[command]!];
    const pressing = (command: Command) => held.has(command) || buttonHeld(command) ? 1 : 0;
    let x = 0, z = 0;
    if (active) {
      x = pressing('right') - pressing('left');
      z = pressing('forward') - pressing('backward');
      let lookX = (pressing('cameraLeft') - pressing('cameraRight')) * 2.1 * dt;
      let lookY = (pressing('cameraDown') - pressing('cameraUp')) * 2.1 * dt;
      if (pad && padArmed) {
        x += deadzone(pad.axes[0] ?? 0); z -= deadzone(pad.axes[1] ?? 0);
        lookX -= deadzone(pad.axes[2] ?? 0) * dt * 2.5 * settings.stickSensitivity * (settings.invertPadX ? -1 : 1);
        lookY += deadzone(pad.axes[3] ?? 0) * dt * 2.5 * settings.stickSensitivity * (settings.invertPadY ? -1 : 1);
        for (const command of COMMANDS) {
          const button = settings.buttons[command.id];
          if (button !== undefined && !continuous.has(command.id) && buttons[button] && !previousButtons[button]) fire(command.id);
        }
      }
      if (lookX || lookY) onLook(lookX, lookY);
      const zoom = pressing('zoomOut') - pressing('zoomIn');
      if (zoom) onZoom(zoom * dt * 8 * settings.zoomSensitivity);
      if (settings.invertMoveX) x = -x;
      if (settings.invertMoveY) z = -z;
    }
    previousButtons = buttons;
    const length = Math.max(1, Math.hypot(x, z)), yaw = getCameraYaw();
    const world = movement(x / length, z / length, yaw);
    if (now - lastMove >= 50) {
      send({ type: 'move', ...world, facing: x || z ? yaw : getFacing() });
      lastMove = now;
    }
    frame = requestAnimationFrame(loop);
  }

  window.addEventListener('keydown', down); window.addEventListener('keyup', up);
  window.addEventListener('blur', blur); window.addEventListener('focus', focus);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('mousedown', mouseDown); window.addEventListener('mousemove', mouseMove); window.addEventListener('mouseup', mouseUp);
  window.addEventListener('wheel', wheel, { passive: false }); window.addEventListener('contextmenu', contextMenu);
  frame = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(frame); clearHeld();
    window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur); window.removeEventListener('focus', focus);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('mousedown', mouseDown); window.removeEventListener('mousemove', mouseMove); window.removeEventListener('mouseup', mouseUp);
    window.removeEventListener('wheel', wheel); window.removeEventListener('contextmenu', contextMenu);
  };
}
