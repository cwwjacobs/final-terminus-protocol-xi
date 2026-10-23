import type { Action } from '../../game/types.ts';
import { COMMANDS, keyboardEventBinding, normalizeControls } from './control-settings.ts';
import type { Command, ControlSettings } from './control-settings.ts';
import type { MenuIntent } from './command-menu.ts';
import { resetTouchStick, type InputMode, type TouchStickState } from './touch-input.ts';

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
  touch?: { stick: TouchStickState; enabled: () => boolean };
  onInputMode?: (mode: InputMode) => void;
  commandMenu?: { isOpen: () => boolean; onInput: (intent: MenuIntent) => void };
}

const combat: Partial<Record<Command, Action>> = {
  engage: { type: 'engage' }, cleave: { type: 'weapon', id: 'cleave' },
  pierce: { type: 'weapon', id: 'pierce' }, resonance: { type: 'weapon', id: 'resonance' },
  fire: { type: 'magic', element: 'fire' }, ice: { type: 'magic', element: 'ice' }, lightning: { type: 'magic', element: 'lightning' },
  provoke: { type: 'provoke' }, heal: { type: 'heal' }, guard: { type: 'guard' }, dodge: { type: 'dodge' },
  revelry: { type: 'revelry' },
};
const continuous = new Set<Command>(['forward', 'backward', 'left', 'right', 'cameraLeft', 'cameraRight', 'cameraUp', 'cameraDown', 'zoomIn', 'zoomOut']);
const modifier = (code: string) => code === 'ShiftLeft' || code === 'ShiftRight';
const bounded = (n: number, maximum: number) => Number.isFinite(n) ? Math.max(-maximum, Math.min(maximum, n)) : 0;

export function bindInput(options: InputOptions): () => void {
  const { send, getFacing, getCameraYaw, getSettings, onPad, enabled, onCommand, onLook, onZoom, commandMenu } = options;
  const held = new Set<Command>();
  const pendingModifiers = new Map<string, Command>();
  let settings = normalizeControls(getSettings()), signature = JSON.stringify(getSettings());
  let last = performance.now(), lastMove = 0, frame = 0, dragging = false;
  let focused = document.hasFocus(), wasPlayable = false, padPresent = false, padArmed = false;
  let previousButtons: boolean[] = [], padId: number | null = null;
  let menuWasOpen = false, menuPadArmed = false, menuDirection = -1, menuRepeatAt = 0;
  const touchPointers = new Map<number, { x: number; y: number }>();

  const editable = () => {
    const element = document.activeElement as HTMLElement | null;
    return !!element && (/^(INPUT|SELECT|TEXTAREA|BUTTON|A|SUMMARY)$/.test(element.tagName) || element.isContentEditable || !!element.closest?.('[role="dialog"], [role="button"], [role="menu"], [role="textbox"], [role="link"]'));
  };
  const menuOpen = () => !!commandMenu?.isOpen();
  const available = () => focused && !document.hidden && enabled();
  const menuPlayable = () => available() && (!editable() || !!(document.activeElement as HTMLElement | null)?.closest?.('[data-command-menu]'));
  const playable = () => available() && !menuOpen() && !editable();
  const stop = () => send({ type: 'move', x: 0, z: 0, facing: getFacing() });
  function clearHeld() {
    held.clear(); pendingModifiers.clear(); dragging = false; padArmed = false; menuPadArmed = false; menuDirection = -1;
    touchPointers.clear();
    if (options.touch) resetTouchStick(options.touch.stick);
    stop();
  }
  function refreshSettings() {
    const raw = getSettings(), next = JSON.stringify(raw);
    if (next !== signature) { signature = next; settings = normalizeControls(raw); clearHeld(); }
  }
  function fire(command: Command) {
    if (command === 'commandMenu' && commandMenu) { clearHeld(); commandMenu.onInput('open'); return; }
    const action = combat[command];
    if (action) send(action);
    else if (!continuous.has(command)) onCommand(command);
  }
  function down(event: KeyboardEvent) {
    if (!event.ctrlKey && !event.altKey && !event.metaKey) options.onInputMode?.('keyboard');
    refreshSettings();
    if (menuOpen()) {
      if (!menuPlayable() || event.ctrlKey || event.altKey || event.metaKey) return;
      if ((event.code === 'Enter' || event.code === 'NumpadEnter') && (document.activeElement as HTMLElement | null)?.closest?.('[data-command-native]')) return;
      const intent = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'confirm', NumpadEnter: 'confirm', Escape: 'back' } as const)[event.code as 'ArrowUp'];
      if (intent) {
        event.preventDefault();
        if (!event.repeat || intent === 'up' || intent === 'down') commandMenu!.onInput(intent);
      }
      // Tab and native form controls stay native. Every gameplay shortcut is
      // suppressed while this menu owns input, including pending modifiers.
      return;
    }
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
    if ((event.target as HTMLElement)?.tagName !== 'CANVAS' || (event.button !== 0 && event.button !== 2) || !available() || menuOpen()) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (!playable()) return;
    options.onInputMode?.('keyboard');
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
  function touchDown(event: PointerEvent) {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    if ((event.target as HTMLElement)?.tagName !== 'CANVAS' || !available() || menuOpen() || touchPointers.size >= 2) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (!playable()) return;
    event.preventDefault(); options.onInputMode?.('touch');
    touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  }
  function touchMove(event: PointerEvent) {
    const point = touchPointers.get(event.pointerId);
    if (!point) return;
    if (!playable()) { touchPointers.clear(); return; }
    event.preventDefault(); refreshSettings();
    const other = [...touchPointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      const before = Math.hypot(point.x - other.x, point.y - other.y);
      const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
      onZoom(bounded(before - after, 200) * .025 * settings.zoomSensitivity);
    } else {
      onLook(-bounded(event.clientX - point.x, 200) * .006 * settings.touchSensitivity * (settings.invertMouseX ? -1 : 1), bounded(event.clientY - point.y, 200) * .006 * settings.touchSensitivity * (settings.invertMouseY ? -1 : 1));
    }
    point.x = event.clientX; point.y = event.clientY;
  }
  function touchEnd(event: PointerEvent) { touchPointers.delete(event.pointerId); }
  function loop(now: number) {
    refreshSettings();
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05)); last = now;
    const pad = Array.from(navigator.getGamepads?.() ?? []).find(candidate => candidate?.connected);
    if (!!pad !== padPresent) { padPresent = !!pad; onPad(padPresent); }
    if ((pad?.index ?? null) !== padId) { padId = pad?.index ?? null; padArmed = false; menuPadArmed = false; previousButtons = pad?.buttons.map(button => button.pressed) ?? []; }
    const navigating = menuOpen();
    if (navigating !== menuWasOpen) { clearHeld(); menuWasOpen = navigating; }
    const active = playable();
    if (!active && (wasPlayable || held.size || dragging || pendingModifiers.size)) clearHeld();
    wasPlayable = active;
    const buttons = pad?.buttons.map(button => button.pressed) ?? [];
    const neutral = !buttons.some(Boolean) && (!pad || pad.axes.slice(0, 4).every(axis => deadzone(axis) === 0));
    if (pad && !neutral) options.onInputMode?.('controller');
    if (!navigating || !menuPlayable()) { menuPadArmed = false; menuDirection = -1; }
    else if (pad && !menuPadArmed && neutral) menuPadArmed = true;
    if (navigating && menuPlayable() && menuPadArmed) {
      // Navigation is a fixed, separate context. A/B never fall through into
      // engage/evade; held confirm/back buttons must be released to act again.
      if (buttons[1] && !previousButtons[1]) commandMenu!.onInput('back');
      else if (buttons[0] && !previousButtons[0]) commandMenu!.onInput('confirm');
      else {
        const direction = [12, 13, 14, 15].find(button => buttons[button]) ?? -1;
        if (direction !== menuDirection) {
          menuDirection = direction; menuRepeatAt = now + 360;
          if (direction >= 0) commandMenu!.onInput(({ 12: 'up', 13: 'down', 14: 'left', 15: 'right' } as const)[direction as 12]);
        } else if ((direction === 12 || direction === 13) && now >= menuRepeatAt) {
          menuRepeatAt = now + 120; commandMenu!.onInput(direction === 12 ? 'up' : 'down');
        }
      }
    }
    if (!active) padArmed = false;
    else if (pad && !padArmed && neutral) padArmed = true;
    const buttonHeld = (command: Command) => padArmed && settings.buttons[command] !== undefined && !!buttons[settings.buttons[command]!];
    const pressing = (command: Command) => held.has(command) || buttonHeld(command) ? 1 : 0;
    let x = 0, z = 0;
    if (active) {
      const opener = settings.buttons.commandMenu;
      if (padArmed && opener !== undefined && buttons[opener] && !previousButtons[opener]) fire('commandMenu');
    }
    if (active && playable()) {
      x = pressing('right') - pressing('left');
      z = pressing('forward') - pressing('backward');
      if (options.touch?.enabled()) { x += bounded(options.touch.stick.x, 1); z += bounded(options.touch.stick.z, 1); }
      let lookX = (pressing('cameraLeft') - pressing('cameraRight')) * 2.1 * dt;
      let lookY = (pressing('cameraDown') - pressing('cameraUp')) * 2.1 * dt;
      if (pad && padArmed) {
        x += deadzone(pad.axes[0] ?? 0); z -= deadzone(pad.axes[1] ?? 0);
        lookX -= deadzone(pad.axes[2] ?? 0) * dt * 2.5 * settings.stickSensitivity * (settings.invertPadX ? -1 : 1);
        lookY += deadzone(pad.axes[3] ?? 0) * dt * 2.5 * settings.stickSensitivity * (settings.invertPadY ? -1 : 1);
        for (const command of COMMANDS) {
          const button = settings.buttons[command.id];
          if (command.id !== 'commandMenu' && button !== undefined && !continuous.has(command.id) && buttons[button] && !previousButtons[button]) fire(command.id);
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
  window.addEventListener('pointerdown', touchDown, { passive: false }); window.addEventListener('pointermove', touchMove, { passive: false });
  window.addEventListener('pointerup', touchEnd); window.addEventListener('pointercancel', touchEnd); window.addEventListener('lostpointercapture', touchEnd);
  frame = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(frame); clearHeld();
    window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur); window.removeEventListener('focus', focus);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('mousedown', mouseDown); window.removeEventListener('mousemove', mouseMove); window.removeEventListener('mouseup', mouseUp);
    window.removeEventListener('wheel', wheel); window.removeEventListener('contextmenu', contextMenu);
    window.removeEventListener('pointerdown', touchDown); window.removeEventListener('pointermove', touchMove);
    window.removeEventListener('pointerup', touchEnd); window.removeEventListener('pointercancel', touchEnd); window.removeEventListener('lostpointercapture', touchEnd);
  };
}
