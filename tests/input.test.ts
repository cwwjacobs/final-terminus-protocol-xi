import test from 'node:test';
import assert from 'node:assert/strict';
import { createTouchStick, touchAxes, normalizeLayout, usesTouchLayout } from '../components/game/touch-input.ts';
import { bindInput, deadzone, movement } from '../components/game/input.ts';
import { bindButton, bindKey, buttonLabel, COMMANDS, defaults, keyboardEventBinding, keyLabel, normalizeControls } from '../components/game/control-settings.ts';
import type { Command, ControlSettings } from '../components/game/control-settings.ts';
import type { Action } from '../game/types.ts';
import type { MenuIntent } from '../components/game/command-menu.ts';

test('controller deadzone suppresses drift, bounds malformed axes and preserves full travel', () => {
  assert.equal(deadzone(0.1), 0); assert.equal(deadzone(-0.18), 0);
  assert.equal(deadzone(1), 1); assert.equal(deadzone(-1), -1);
  assert.equal(deadzone(7), 1); assert.equal(deadzone(NaN), 0);
});

test('screen-right and forward have correct signs through all camera quadrants', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -2.7]) {
    const forward = movement(0, 1, yaw), right = movement(1, 0, yaw);
    assert.ok(Math.abs(forward.x * right.x + forward.z * right.z) < 1e-10);
    assert.ok(Math.abs(Math.hypot(forward.x, forward.z) - 1) < 1e-10);
  }
  assert.ok(movement(1, 0, Math.PI).x > 0.99, 'right must move +x while facing -z');
  assert.ok(movement(-1, 0, Math.PI).x < -0.99);
  assert.ok(movement(1, 0, 0).x < -0.99, 'right must move -x while facing +z');
  assert.ok(movement(1, 0, Math.PI / 2).z > 0.99);
  assert.ok(movement(0, 1, Math.PI).z < -0.99);
});

test('camera-relative rounding cannot emit movement outside authoritative network bounds', () => {
  const world = movement(0.013, 0.9999154964295733, 1.5837966929894132);
  assert.equal(world.x, 1);
  assert.ok(Math.abs(world.z) <= 1);
  const h = harness();
  try {
    h.state.pad = h.pad; h.frame(); h.state.yaw = 1.5837966929894132;
    h.pad.axes[0] = 0.18 + 0.82 * 0.013;
    h.pad.axes[1] = -(0.18 + 0.82 * 0.9999154964295733);
    h.frame();
    assert.ok(Math.abs(h.move().x) <= 1 && Math.abs(h.move().z) <= 1);
  } finally { h.close(); }
});

test('defaults provide unique bindings with every inversion disabled', () => {
  const settings = defaults();
  assert.equal(Object.keys(settings.keys).length, COMMANDS.length);
  assert.equal(new Set(Object.values(settings.keys)).size, COMMANDS.length);
  assert.equal(new Set(Object.values(settings.buttons)).size, Object.keys(settings.buttons).length);
  assert.equal(settings.keys.targetPrevious, 'Shift+Tab');
  assert.equal(settings.buttons.recenter, 11); assert.equal(settings.buttons.targetNext, 10);
  assert.equal(settings.buttons.zoomIn, undefined); assert.equal(settings.buttons.zoomOut, undefined);
  for (const [key, value] of Object.entries(settings)) if (key.startsWith('invert')) assert.equal(value, false);
  settings.keys.forward = 'KeyI';
  assert.equal(defaults().keys.forward, 'KeyW', 'default instances must not share mutable maps');
});

test('saved settings normalize bounds, invalid types and duplicate key/button bindings', () => {
  const settings = normalizeControls({ version: 1, keys: { forward: 'KeyD', backward: 'Escape', cameraUp: 'Ctrl+KeyR' }, buttons: { forward: 4, backward: 4, heal: 500, engage: NaN }, mouseSensitivity: Infinity, stickSensitivity: 80, zoomSensitivity: -2, cameraHeight: 100, shoulderOffset: -50, defaultDistance: 0, invertMouseX: true, invertMouseY: 'true', extra: 'discard' });
  assert.equal(settings.keys.forward, 'KeyD'); assert.equal(settings.keys.right, '');
  assert.equal(settings.keys.backward, 'KeyS'); assert.equal(settings.keys.cameraUp, 'ArrowUp');
  assert.deepEqual(settings.buttons, { forward: 4, revelry: 15, commandMenu: 0 });
  assert.equal(settings.mouseSensitivity, 1); assert.equal(settings.stickSensitivity, 3); assert.equal(settings.zoomSensitivity, 0.1);
  assert.equal(settings.cameraHeight, 5); assert.equal(settings.shoulderOffset, -3); assert.equal(settings.defaultDistance, 4);
  assert.equal(settings.invertMouseX, true); assert.equal(settings.invertMouseY, false);
  assert.equal('extra' in settings, false);
  for (const bad of [null, [], 'bad', { version: 4 }]) assert.deepEqual(normalizeControls(bad), defaults());
  const unbound = bindButton(bindKey(defaults(), 'engage', ''), 'engage', undefined);
  assert.deepEqual(normalizeControls(JSON.parse(JSON.stringify(unbound))), unbound);
});

test('rebinding swaps a conflict or unbinds it, leaves source settings intact and rejects reserved chords', () => {
  const original = defaults();
  let next = bindKey(original, 'forward', 'KeyD');
  assert.equal(next.keys.forward, 'KeyD'); assert.equal(next.keys.right, 'KeyW');
  assert.equal(original.keys.forward, 'KeyW');
  next = bindKey(bindKey(next, 'forward', ''), 'forward', 'KeyS');
  assert.equal(next.keys.forward, 'KeyS'); assert.equal(next.keys.backward, '');
  for (const reserved of ['Escape', 'Ctrl+KeyR', 'Meta+KeyW', 'Alt+F4', 'F5']) assert.deepEqual(bindKey(original, 'engage', reserved), original);
  let buttons = bindButton(original, 'engage', 1);
  assert.equal(buttons.buttons.engage, 1); assert.equal(buttons.buttons.dodge, undefined);
  buttons = bindButton(bindButton(buttons, 'targetPrevious', undefined), 'targetPrevious', 1);
  assert.equal(buttons.buttons.targetPrevious, 1); assert.equal(buttons.buttons.engage, undefined);
  assert.deepEqual(bindButton(original, 'engage', -1), original);
});

test('legacy controls gain Revelry without displacing saved bindings or resurrecting v2 unbinds', () => {
  const legacy = JSON.parse(JSON.stringify(defaults()));
  legacy.version = 1;
  delete legacy.keys.revelry;
  delete legacy.buttons.revelry;
  const migrated = normalizeControls(legacy);
  assert.equal(migrated.version, 3);
  assert.equal(migrated.keys.revelry, 'KeyQ');
  assert.equal(migrated.buttons.revelry, 15);
  legacy.keys.forward = 'KeyQ'; legacy.buttons.targetPrevious = 15;
  const conflicted = normalizeControls(legacy);
  assert.equal(conflicted.keys.forward, 'KeyQ'); assert.equal(conflicted.keys.revelry, '');
  assert.equal(conflicted.buttons.targetPrevious, 15); assert.equal(conflicted.buttons.revelry, undefined);
  const unbound = bindButton(bindKey(migrated, 'revelry', ''), 'revelry', undefined);
  assert.deepEqual(normalizeControls(JSON.parse(JSON.stringify(unbound))), unbound);
});

test('keyboard capture and labels agree for Shift+Tab, modifier release and reserved browser shortcuts', () => {
  const event = { code: 'Tab', shiftKey: true, altKey: false, ctrlKey: false, metaKey: false };
  assert.equal(keyboardEventBinding(event), 'Shift+Tab');
  assert.equal(keyboardEventBinding({ ...event, code: 'ShiftLeft', shiftKey: false }), 'ShiftLeft');
  for (const flag of ['altKey', 'ctrlKey', 'metaKey'] as const) assert.equal(keyboardEventBinding({ ...event, [flag]: true }), '');
  assert.equal(keyboardEventBinding({ ...event, code: 'Escape' }), '');
  assert.equal(keyLabel('Shift+Tab'), 'Shift + Tab'); assert.equal(keyLabel('KeyW'), 'W'); assert.equal(keyLabel(''), 'Unbound');
  assert.equal(buttonLabel(10), 'L3'); assert.equal(buttonLabel(15), 'D-pad →');
});

test('legacy default A migrates from engage to Commands without losing unrelated remaps', () => {
  assert.equal(defaults().keys.commandMenu, 'Enter');
  assert.equal(defaults().buttons.commandMenu, 0); assert.equal(defaults().buttons.engage, undefined);
  const old = { ...defaults(), version: 2, keys: { ...defaults().keys }, buttons: { ...defaults().buttons, engage: 0, heal: 8 } };
  Reflect.deleteProperty(old.keys, 'commandMenu'); Reflect.deleteProperty(old.buttons, 'commandMenu');
  const migrated = normalizeControls(old);
  assert.equal(migrated.buttons.commandMenu, 0); assert.equal(migrated.buttons.engage, undefined);
  assert.equal(migrated.buttons.heal, 8);
  old.buttons.engage = 9; old.buttons.heal = 0; old.keys.heal = 'Enter';
  const custom = normalizeControls(old);
  assert.equal(custom.buttons.engage, 9); assert.equal(custom.buttons.heal, 0); assert.equal(custom.buttons.commandMenu, undefined);
  assert.equal(custom.keys.heal, 'Enter'); assert.equal(custom.keys.commandMenu, '');
  const explicit = bindButton(bindKey(migrated, 'commandMenu', ''), 'engage', 0);
  assert.equal(explicit.buttons.engage, 0); assert.equal(explicit.buttons.commandMenu, undefined);
  assert.deepEqual(normalizeControls(JSON.parse(JSON.stringify(explicit))), explicit, 'v3 choices and unbinds survive reload');
});

type FakeEvent = { prevented: boolean; preventDefault: () => void } & Record<string, unknown>;
function surface() {
  const listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  return {
    listeners,
    addEventListener(type: string, listener: (event: FakeEvent) => void) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(listener); },
    removeEventListener(type: string, listener: (event: FakeEvent) => void) { listeners.get(type)?.delete(listener); },
    emit(type: string, properties: Record<string, unknown> = {}) {
      const event: FakeEvent = { prevented: false, preventDefault() { this.prevented = true; }, ...properties };
      for (const listener of listeners.get(type) ?? []) listener(event);
      return event;
    },
  };
}

function harness(initialSettings: ControlSettings = defaults()) {
  const win = surface(), doc = { ...surface(), activeElement: { tagName: 'BODY', isContentEditable: false, closest: (() => null) as (selector?: string) => object | null }, hidden: false, hasFocus: () => true };
  const pad = { connected: true, index: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) };
  const touch = createTouchStick();
  const state = { touchEnabled: true, settings: initialSettings, enabled: true, commandOpen: false, facing: 1.23, yaw: Math.PI, pad: null as typeof pad | null };
  const menuInputs: MenuIntent[] = [];
  const sent: Action[] = [], commands: Command[] = [], looks: number[][] = [], zooms: number[] = [], connections: boolean[] = [];
  let callback: FrameRequestCallback | null = null, now = performance.now() + 100;
  const replacements = { window: win, document: doc, navigator: { getGamepads: () => state.pad ? [state.pad] : [] }, requestAnimationFrame: (fn: FrameRequestCallback) => { callback = fn; return 1; }, cancelAnimationFrame: () => { callback = null; } };
  const descriptors = Object.fromEntries(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const cleanup = bindInput({ touch: { stick: touch, enabled: () => state.touchEnabled }, send: action => sent.push(action), getFacing: () => state.facing, getCameraYaw: () => state.yaw, getSettings: () => state.settings, onPad: present => connections.push(present), enabled: () => state.enabled, onCommand: command => commands.push(command), commandMenu: { isOpen: () => state.commandOpen, onInput: intent => { menuInputs.push(intent); if (intent === 'open') state.commandOpen = true; if (intent === 'back' || intent === 'close') state.commandOpen = false; } }, onLook: (x, y) => { looks.push([x, y]); state.yaw += x; }, onZoom: delta => zooms.push(delta) });
  return {
    state, touch, sent, commands, looks, zooms, connections, menuInputs, win, doc, pad,
    frame() { now += 60; assert.ok(callback); callback(now); },
    key(code: string, type = 'keydown', extra: Record<string, unknown> = {}) { return win.emit(type, { code, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...extra }); },
    move() { const action = sent.filter((action): action is Extract<Action, { type: 'move' }> => action.type === 'move').at(-1); assert.ok(action); return action; },
    close() {
      cleanup();
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test('camera movement preserves idle actor facing and camera-relative strafe uses the corrected basis', () => {
  const h = harness();
  try {
    h.key('ArrowRight'); h.frame();
    assert.ok(h.looks.at(-1)![0] < 0); assert.equal(h.move().facing, 1.23);
    assert.equal(h.move().x, 0); assert.equal(h.move().z, 0);
    h.key('ArrowRight', 'keyup'); h.state.yaw = Math.PI;
    h.key('KeyD'); h.frame();
    assert.ok(h.move().x > 0.99); assert.equal(h.move().facing, Math.PI);
    h.key('KeyD', 'keyup'); h.key('KeyW'); h.frame(); assert.ok(h.move().z < -0.99);
    h.key('KeyW', 'keyup'); h.frame(); assert.equal(h.move().facing, 1.23);
  } finally { h.close(); }
});

test('Tab cycles targets in gameplay, Shift+Tab never also guards, and menus preserve native Tab', () => {
  const h = harness();
  try {
    assert.equal(h.key('Tab').prevented, true); h.key('Tab', 'keyup');
    assert.deepEqual(h.commands, ['targetNext']);
    h.key('ShiftLeft', 'keydown', { shiftKey: true }); h.key('Tab', 'keydown', { shiftKey: true });
    h.key('Tab', 'keyup', { shiftKey: true }); h.key('ShiftLeft', 'keyup');
    assert.deepEqual(h.commands, ['targetNext', 'targetPrevious']);
    assert.equal(h.sent.some(action => action.type === 'guard'), false);
    h.key('ShiftLeft', 'keydown', { shiftKey: true }); h.key('ShiftLeft', 'keyup');
    assert.equal(h.sent.filter(action => action.type === 'guard').length, 1);
    h.state.enabled = false; assert.equal(h.key('Tab').prevented, false);
    assert.equal(h.commands.length, 2);
    assert.equal(h.key('Escape').prevented, false);
  } finally { h.close(); }
});

test('Revelry keyboard and controller bindings emit one intent per press and respect menus', () => {
  const h = harness();
  try {
    h.key('KeyQ'); h.key('KeyQ', 'keydown', { repeat: true }); h.key('KeyQ', 'keyup');
    assert.equal(h.sent.filter(action => action.type === 'revelry').length, 1);
    h.state.pad = h.pad; h.frame();
    h.pad.buttons[15].pressed = true; h.frame(); h.frame();
    assert.equal(h.sent.filter(action => action.type === 'revelry').length, 2);
    h.state.enabled = false; h.key('KeyQ');
    h.pad.buttons[15].pressed = false; h.frame(); h.pad.buttons[15].pressed = true; h.frame();
    assert.equal(h.sent.filter(action => action.type === 'revelry').length, 2);
    h.state.enabled = true; h.frame();
    assert.equal(h.sent.filter(action => action.type === 'revelry').length, 2);
    h.pad.buttons[15].pressed = false; h.frame();
    h.state.settings = bindKey(h.state.settings, 'revelry', 'KeyT'); h.frame();
    h.key('KeyQ'); h.key('KeyT');
    assert.equal(h.sent.filter(action => action.type === 'revelry').length, 3);
  } finally { h.close(); }
});

test('buttons, text fields, links and editable content suppress gameplay without trapping Tab', () => {
  const h = harness();
  try {
    for (const tag of ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A', 'SUMMARY']) {
      h.doc.activeElement.tagName = tag;
      assert.equal(h.key('Tab').prevented, false); h.key('Digit1'); h.key('KeyW'); h.frame();
      assert.equal(h.move().x, 0); assert.equal(h.move().z, 0);
    }
    h.doc.activeElement.tagName = 'DIV'; h.doc.activeElement.isContentEditable = true;
    h.key('Digit1'); assert.equal(h.sent.some(action => action.type === 'weapon'), false);
    assert.equal(h.commands.length, 0);
  } finally { h.close(); }
});

test('mouse orbit and wheel operate only on battlefield and every default/inverted sign is correct', () => {
  const h = harness();
  try {
    h.win.emit('mousedown', { target: { tagName: 'BUTTON' }, button: 0 });
    h.win.emit('mousemove', { movementX: 10, movementY: -10 }); assert.equal(h.looks.length, 0);
    h.win.emit('mousedown', { target: { tagName: 'CANVAS' }, button: 0 });
    h.win.emit('mousemove', { movementX: 10, movementY: -10 });
    assert.deepEqual(h.looks.at(-1), [-0.06, -0.06]);
    assert.equal(h.win.emit('wheel', { target: { tagName: 'DIV' }, deltaY: 100, deltaMode: 0 }).prevented, false);
    assert.equal(h.win.emit('wheel', { target: { tagName: 'CANVAS' }, deltaY: 100, deltaMode: 0 }).prevented, true);
    assert.equal(h.zooms.at(-1), 1);
    h.state.settings = { ...h.state.settings, invertMouseX: true, invertMouseY: true, mouseSensitivity: 2 };
    h.win.emit('mousedown', { target: { tagName: 'CANVAS' }, button: 0 });
    h.win.emit('mousemove', { movementX: 10, movementY: -10 });
    assert.deepEqual(h.looks.at(-1), [0.12, 0.12]);
    h.state.enabled = false; h.win.emit('mousemove', { movementX: 10, movementY: -10 });
    assert.equal(h.looks.length, 2);
  } finally { h.close(); }
});

test('blur, menu entry and rebinding clear keyboard movement until a fresh press', () => {
  const h = harness();
  try {
    h.key('KeyW'); h.frame(); assert.ok(h.move().z < -0.99);
    h.win.emit('blur'); h.frame(); assert.equal(h.move().z, 0);
    h.win.emit('focus'); h.frame(); assert.equal(h.move().z, 0);
    h.key('KeyW'); h.state.enabled = false; h.frame();
    h.state.enabled = true; h.frame(); assert.equal(h.move().z, 0);
    h.key('KeyW'); h.frame();
    h.state.settings = bindKey(h.state.settings, 'forward', 'KeyI'); h.frame(); assert.equal(h.move().z, 0);
    h.key('KeyW', 'keydown', { repeat: true }); h.frame(); assert.equal(h.move().z, 0);
    h.key('KeyI'); h.frame(); assert.ok(h.move().z < -0.99);
  } finally { h.close(); }
});

test('gamepad input must return neutral after focus/menu/settings changes and never replays held actions', () => {
  const h = harness();
  try {
    h.state.pad = h.pad; h.frame(); assert.deepEqual(h.connections, [true]);
    h.pad.axes[0] = 1; h.pad.buttons[2].pressed = true; h.frame();
    assert.ok(h.move().x > 0.99); assert.equal(h.sent.filter(action => action.type === 'weapon').length, 1);
    h.frame(); assert.equal(h.sent.filter(action => action.type === 'weapon').length, 1);
    h.win.emit('blur'); h.frame(); assert.equal(h.move().x, 0);
    h.win.emit('focus'); h.frame(); assert.equal(h.move().x, 0);
    assert.equal(h.sent.filter(action => action.type === 'weapon').length, 1);
    h.pad.axes[0] = 0; h.pad.buttons[2].pressed = false; h.frame();
    h.pad.buttons[2].pressed = true; h.frame(); assert.equal(h.sent.filter(action => action.type === 'weapon').length, 2);
    h.state.settings = { ...h.state.settings, invertMoveX: true }; h.frame();
    h.pad.axes[0] = 1; h.frame(); assert.equal(h.move().x, 0);
    h.pad.axes[0] = 0; h.pad.buttons[2].pressed = false; h.frame();
    h.pad.axes[0] = 1; h.frame(); assert.ok(h.move().x < -0.99);
  } finally { h.close(); }
});

test('right-stick axes, mapped held camera/movement buttons and zoom are independently configurable', () => {
  const settings = bindButton(bindButton(bindButton(defaults(), 'forward', 8), 'cameraUp', 9), 'zoomOut', 15);
  const h = harness(settings);
  try {
    h.state.pad = h.pad; h.frame();
    h.pad.axes[2] = 1; h.pad.axes[3] = -1; h.frame();
    assert.ok(h.looks.at(-1)![0] < 0 && h.looks.at(-1)![1] < 0);
    assert.equal(h.move().facing, h.state.facing);
    h.pad.axes[2] = h.pad.axes[3] = 0;
    h.state.settings = { ...h.state.settings, invertPadX: true, invertPadY: true }; h.frame();
    h.pad.axes[2] = 1; h.pad.axes[3] = -1; h.frame();
    assert.ok(h.looks.at(-1)![0] > 0 && h.looks.at(-1)![1] > 0);
    h.pad.axes[2] = h.pad.axes[3] = 0; h.state.yaw = Math.PI;
    h.pad.buttons[8].pressed = true; h.pad.buttons[9].pressed = true; h.pad.buttons[15].pressed = true; h.frame();
    assert.ok(h.move().z < -0.99); assert.ok(h.looks.at(-1)![1] < 0); assert.ok(h.zooms.at(-1)! > 0);
    h.pad.buttons[10].pressed = true; h.frame(); assert.equal(h.commands.at(-1), 'targetNext');
    assert.ok(h.sent.every(action => ['move', 'engage', 'weapon', 'magic', 'provoke', 'heal', 'guard', 'dodge', 'start'].includes(action.type)));
  } finally { h.close(); }
});

test('Enter opens Commands on its own press and menu navigation suppresses combat, movement and camera', () => {
  const h = harness();
  try {
    h.key('KeyW'); h.frame(); assert.ok(h.move().z < -.99);
    h.key('ShiftLeft', 'keydown', { shiftKey: true });
    h.key('Enter'); assert.equal(h.state.commandOpen, true); assert.deepEqual(h.menuInputs, ['open']);
    assert.equal(h.move().z, 0, 'opening immediately stops held movement');
    h.key('Enter', 'keydown', { repeat: true }); h.key('Enter', 'keyup');
    assert.deepEqual(h.menuInputs, ['open']);
    h.key('ArrowDown'); h.key('ArrowDown', 'keydown', { repeat: true });
    h.key('Digit1'); h.key('KeyQ'); h.key('Space'); h.key('KeyW'); h.key('ShiftLeft', 'keyup');
    h.win.emit('mousedown', { target: { tagName: 'CANVAS' }, button: 0 });
    h.win.emit('mousemove', { movementX: 10, movementY: 10 });
    assert.equal(h.win.emit('wheel', { target: { tagName: 'CANVAS' }, deltaY: 100 }).prevented, false);
    h.frame(); assert.equal(h.move().z, 0); assert.equal(h.looks.length, 0); assert.equal(h.zooms.length, 0);
    assert.deepEqual(h.menuInputs, ['open', 'down', 'down']);
    assert.ok(h.sent.every(action => action.type === 'move'));
    assert.equal(h.key('Tab').prevented, false);
    h.key('Enter'); h.key('Enter', 'keydown', { repeat: true });
    assert.equal(h.menuInputs.filter(intent => intent === 'confirm').length, 1);
    h.key('Escape'); assert.equal(h.state.commandOpen, false); h.frame();
    h.key('KeyW', 'keydown', { repeat: true }); h.frame(); assert.equal(h.move().z, 0);
    h.key('KeyW', 'keyup'); h.key('KeyW'); h.frame(); assert.ok(h.move().z < -.99);
  } finally { h.close(); }
});

test('A opens the menu without engaging, held navigation repeats, and B cannot leak into Evade', () => {
  const h = harness();
  try {
    h.state.pad = h.pad; h.frame();
    h.pad.buttons[0].pressed = true; h.frame(); h.frame();
    assert.deepEqual(h.menuInputs, ['open']); assert.equal(h.sent.filter(action => action.type !== 'move').length, 0);
    h.pad.buttons[0].pressed = false; h.frame();
    h.pad.buttons[13].pressed = true; h.frame();
    assert.deepEqual(h.menuInputs, ['open', 'down']);
    h.frame(); h.frame(); h.frame(); assert.equal(h.menuInputs.length, 2, 'repeat has an initial delay');
    h.frame(); h.frame(); h.frame(); assert.equal(h.menuInputs.length, 3);
    h.frame(); h.frame(); assert.equal(h.menuInputs.length, 4);
    h.pad.buttons[13].pressed = false; h.frame();
    h.pad.buttons[0].pressed = true; h.frame(); h.frame();
    assert.equal(h.menuInputs.filter(intent => intent === 'confirm').length, 1);
    h.pad.buttons[0].pressed = false; h.frame();
    h.pad.buttons[1].pressed = true; h.frame(); h.frame();
    assert.equal(h.state.commandOpen, false); assert.equal(h.sent.some(action => action.type === 'dodge'), false);
    h.pad.buttons[1].pressed = false; h.frame();
    h.pad.buttons[1].pressed = true; h.frame();
    assert.equal(h.sent.filter(action => action.type === 'dodge').length, 1, 'fresh press uses the normal closed-menu mapping');
  } finally { h.close(); }
});

test('menu focus works on its rows; settings dialogs keep native navigation and held pad presses never replay', () => {
  const h = harness();
  try {
    h.key('Enter'); h.frame();
    h.doc.activeElement.tagName = 'BUTTON';
    h.doc.activeElement.closest = selector => selector === '[data-command-menu]' ? {} : null;
    assert.equal(h.key('ArrowDown').prevented, true);
    h.state.enabled = false;
    assert.equal(h.key('Enter').prevented, false); assert.equal(h.key('Escape').prevented, false);
    assert.equal(h.key('ArrowDown').prevented, false); assert.equal(h.key('Tab').prevented, false);
    h.state.pad = h.pad; h.pad.buttons[0].pressed = true; h.frame();
    h.state.enabled = true; h.frame();
    assert.equal(h.menuInputs.filter(intent => intent === 'confirm').length, 0);
    h.pad.buttons[0].pressed = false; h.frame(); h.pad.buttons[0].pressed = true; h.frame();
    assert.equal(h.menuInputs.filter(intent => intent === 'confirm').length, 1);
    h.win.emit('blur'); h.win.emit('focus'); h.frame();
    assert.equal(h.menuInputs.filter(intent => intent === 'confirm').length, 1);
    h.doc.activeElement.closest = selector => selector === '[data-command-menu]' || selector === '[data-command-native]' ? {} : null;
    assert.equal(h.key('Enter').prevented, false, 'native close/back buttons remain keyboard accessible');
  } finally { h.close(); }
});


test('touch stick uses a radial deadzone, keeps diagonal speed bounded and maps screen up forward', () => {
  assert.deepEqual(touchAxes(2, -2, 40), { x: 0, z: 0 });
  assert.deepEqual(touchAxes(0, -40, 40), { x: 0, z: 1 });
  assert.deepEqual(touchAxes(100, 0, 40), { x: 1, z: -0 });
  for (const [x, y] of [[40, 40], [-400, 300], [0, 900]]) {
    const axis = touchAxes(x, y, 40);
    assert.ok(Math.hypot(axis.x, axis.z) <= 1.0000000001);
  }
  assert.deepEqual(touchAxes(NaN, 20, 40), { x: 0, z: 0 });
  assert.deepEqual(touchAxes(10, 20, 0), { x: 0, z: 0 });
});

test('layout follows active input while touch and desktop overrides stay explicit', () => {
  assert.equal(usesTouchLayout('auto', 'touch'), true);
  assert.equal(usesTouchLayout('auto', 'keyboard'), false);
  assert.equal(usesTouchLayout('auto', 'controller'), false);
  assert.equal(usesTouchLayout('touch', 'controller'), true);
  assert.equal(usesTouchLayout('desktop', 'touch'), false);
  assert.equal(normalizeLayout('invalid'), 'auto');
});

test('touch movement shares the camera basis, survives ability input and stops on blur, menu or layout change', () => {
  const h = harness();
  try {
    h.touch.pointerId = 1; h.touch.x = 1; h.frame();
    assert.ok(h.move().x > .99);
    h.key('KeyQ'); h.frame();
    assert.equal(h.sent.filter(action => action.type === 'revelry').length, 1);
    assert.ok(h.move().x > .99, 'combat must not steal movement');
    h.win.emit('blur'); h.frame();
    assert.equal(h.move().x, 0); assert.equal(h.touch.pointerId, null);
    h.win.emit('focus'); h.frame(); assert.equal(h.move().x, 0);
    h.touch.pointerId = 2; h.touch.z = 1; h.frame(); assert.ok(h.move().z < -.99);
    h.state.commandOpen = true; h.frame(); assert.equal(h.move().z, 0);
    h.state.commandOpen = false; h.frame(); assert.equal(h.move().z, 0);
    h.touch.pointerId = 3; h.touch.x = 1; h.state.touchEnabled = false; h.frame(); assert.equal(h.move().x, 0);
    h.state.enabled = false; h.frame(); assert.equal(h.touch.pointerId, null);
  } finally { h.close(); }
});

test('touch camera isolates pointer IDs, pinches to zoom and cancels without leaving camera motion', () => {
  const h = harness();
  const pointer = (pointerId: number, clientX: number, clientY: number, tagName = 'CANVAS') => ({ pointerId, pointerType: 'touch', clientX, clientY, target: { tagName } });
  try {
    h.win.emit('pointerdown', pointer(9, 0, 0, 'BUTTON'));
    h.win.emit('pointermove', pointer(9, 30, 30)); assert.equal(h.looks.length, 0);
    assert.equal(h.win.emit('pointerdown', pointer(1, 100, 100)).prevented, true);
    h.win.emit('pointermove', pointer(1, 110, 90));
    assert.deepEqual(h.looks.at(-1), [-.06, -.06]);
    h.win.emit('pointerdown', pointer(2, 210, 90));
    h.win.emit('pointermove', pointer(2, 230, 90));
    assert.equal(h.looks.length, 1); assert.equal(h.zooms.at(-1), -.5);
    h.win.emit('pointercancel', pointer(2, 230, 90));
    h.win.emit('pointerup', pointer(1, 110, 90));
    h.win.emit('pointermove', pointer(1, 200, 200)); assert.equal(h.looks.length, 1);
    h.win.emit('pointerdown', pointer(3, 100, 100)); h.state.enabled = false;
    h.win.emit('pointermove', pointer(3, 200, 200)); assert.equal(h.looks.length, 1);
    h.state.enabled = true; h.win.emit('pointermove', pointer(3, 210, 210)); assert.equal(h.looks.length, 1);
  } finally { h.close(); }
});
