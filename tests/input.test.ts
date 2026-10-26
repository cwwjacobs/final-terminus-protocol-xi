import test from 'node:test';
import assert from 'node:assert/strict';
import { createTouchStick, touchAxes, normalizeLayout, resolveLayout, usesTouchLayout } from '../components/game/touch-input.ts';
import { bindInput, deadzone, movement } from '../components/game/input.ts';
import { bindButton, bindKey, bindingWarnings, buttonLabel, COMMANDS, defaults, keyboardEventBinding, keyLabel, normalizeControls, roleCommand, effectiveBindingCommand, ROLE_SLOT_COMMANDS } from '../components/game/control-settings.ts';
import type { Command, ControlSettings } from '../components/game/control-settings.ts';
import type { Action, Role } from '../game/types.ts';
import type { MenuIntent } from '../components/game/command-menu.ts';
import { createGame, applyAction } from '../game/engine.ts';
import { withHealingTarget } from '../components/game/kit-ui.ts';
import { cycleLivingAlly } from '../components/game/targeting.ts';

// Serialized fixtures from the shipped layouts; do not derive migration inputs
// from current defaults, which would conceal a broken version upgrade.
function legacyControls(version: 1 | 2 | 3 = 3) {
  const keys: Record<string, string> = {
    forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD',
    cameraLeft: 'ArrowLeft', cameraRight: 'ArrowRight', cameraUp: 'ArrowUp', cameraDown: 'ArrowDown',
    zoomIn: 'PageUp', zoomOut: 'PageDown', recenter: 'KeyV', targetNext: 'Tab', targetPrevious: 'Shift+Tab',
    engage: 'Space', cleave: 'Digit1', pierce: 'Digit2', resonance: 'Digit3', fire: 'Digit4', ice: 'Digit5', lightning: 'Digit6',
    provoke: 'KeyR', heal: 'KeyF', guard: 'ShiftLeft', dodge: 'KeyC', revelry: 'KeyQ', commandMenu: 'Enter',
  };
  const buttons: Record<string, number> = { recenter: 11, targetNext: 10, cleave: 2, pierce: 3, resonance: 5, fire: 12, ice: 13, lightning: 14, provoke: 7, heal: 4, guard: 6, dodge: 1, revelry: 15, commandMenu: 0 };
  if (version === 1) { delete keys.revelry; delete buttons.revelry; }
  if (version !== 3) { delete keys.commandMenu; delete buttons.commandMenu; buttons.engage = 0; }
  return { ...defaults(), version, keys, buttons };
}

function v4Controls() {
  const keys: Record<string, string> = { ...legacyControls().keys,
    cameraLeft: 'KeyJ', cameraRight: 'KeyL', cameraUp: 'KeyI', cameraDown: 'KeyK',
    targetEnemyPrevious: 'ArrowLeft', targetEnemyNext: 'ArrowRight', targetAllyPrevious: 'ArrowUp', targetAllyNext: 'ArrowDown',
    primary1: 'Digit1', primary2: 'Digit2', primary3: 'Digit3',
    cleave: 'Shift+Digit1', pierce: 'Shift+Digit2', resonance: 'Shift+Digit3',
    criticalDash: 'KeyZ', splitVolley: 'KeyX', rapidWeave: 'KeyE', aegis: 'KeyT',
  };
  const buttons: Record<string, number> = { recenter: 11, targetNext: 10, targetEnemyPrevious: 14, targetEnemyNext: 15, targetAllyPrevious: 12, targetAllyNext: 13, primary1: 2, primary2: 3, primary3: 5, provoke: 7, heal: 4, guard: 6, dodge: 1, commandMenu: 0 };
  return { ...defaults(), version: 4, keys, buttons };
}

test('untouched v4 maps migrate while custom keyboard and pad maps retain their bindings independently', () => {
  const untouched = v4Controls();
  assert.deepEqual(normalizeControls(untouched), defaults());
  const custom = v4Controls(); custom.keys.revelry = 'KeyH'; custom.keys.forward = 'KeyQ';
  const migrated = normalizeControls(custom);
  for (const [id, key] of Object.entries(custom.keys)) assert.equal(migrated.keys[id as Command], key);
  assert.equal(migrated.keys.utility1, ''); assert.equal(migrated.keys.utility2, '');
  assert.deepEqual(migrated.buttons, defaults().buttons, 'untouched controller preset upgrades independently');
  const customQ = v4Controls(); customQ.keys.forward = 'KeyH';
  const keptQ = normalizeControls(customQ);
  assert.equal(keptQ.keys.revelry, 'KeyQ');
  assert.equal(keptQ.keys.utility1, '');
  assert.equal(effectiveBindingCommand('vanguard', 'revelry', keptQ, 'keyboard'), 'revelry');
  const padCustom = v4Controls(); padCustom.buttons.commandMenu = 8;
  const kept = normalizeControls(padCustom);
  assert.deepEqual(kept.buttons, padCustom.buttons);
  assert.deepEqual(kept.keys, defaults().keys);
  assert.deepEqual(normalizeControls(JSON.parse(JSON.stringify(kept))), kept);
});

test('every role action has a direct default key and controller binding with no duplicate primary Guard', () => {
  const settings = defaults();
  for (const role of ['vanguard', 'warden', 'hunter', 'arcanist', 'luminary'] as const) {
    const actions = ROLE_SLOT_COMMANDS.map(slot => roleCommand(role, slot)).filter((command): command is Command => command !== null);
    assert.equal(new Set(actions).size, actions.length);
    for (const action of [...actions, 'guard', 'dodge', 'engage'] as Command[]) {
      assert.ok(effectiveBindingCommand(role, action, settings, 'keyboard'), `${role}: ${action} keyboard`);
      assert.ok(effectiveBindingCommand(role, action, settings, 'controller'), `${role}: ${action} controller`);
    }
  }
  assert.equal(roleCommand('luminary', 'primary3'), 'shimmerWave');
  assert.deepEqual(bindingWarnings(settings), []);
  const custom = bindKey(bindKey(settings, 'primary1', ''), 'fire', 'KeyH');
  assert.equal(effectiveBindingCommand('arcanist', 'fire', custom, 'keyboard'), 'fire');
});

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
  const activeKeys = Object.values(settings.keys).filter(Boolean);
  assert.equal(new Set(activeKeys).size, activeKeys.length);
  assert.equal(new Set(Object.values(settings.buttons)).size, Object.keys(settings.buttons).length);
  assert.equal(settings.keys.targetPrevious, 'Shift+Tab');
  assert.equal(settings.buttons.recenter, 11); assert.equal(settings.buttons.ultimate, 10);
  assert.equal(settings.buttons.targetEnemyNext, 15); assert.equal(settings.buttons.targetEnemyPrevious, 14);
  assert.equal(settings.buttons.zoomIn, undefined); assert.equal(settings.buttons.zoomOut, undefined);
  for (const [key, value] of Object.entries(settings)) if (key.startsWith('invert')) assert.equal(value, false);
  settings.keys.forward = 'KeyI';
  assert.equal(defaults().keys.forward, 'KeyW', 'default instances must not share mutable maps');
});

test('saved settings normalize bounds, invalid types and duplicate key/button bindings', () => {
  const settings = normalizeControls({ version: 1, keys: { forward: 'KeyD', backward: 'Escape', cameraUp: 'Ctrl+KeyR' }, buttons: { forward: 4, backward: 4, heal: 500, engage: NaN }, mouseSensitivity: Infinity, stickSensitivity: 80, zoomSensitivity: -2, cameraHeight: 100, shoulderOffset: -50, defaultDistance: 0, invertMouseX: true, invertMouseY: 'true', extra: 'discard' });
  assert.equal(settings.keys.forward, 'KeyD'); assert.equal(settings.keys.right, '');
  assert.equal(settings.keys.backward, 'KeyS'); assert.equal(settings.keys.cameraUp, 'ArrowUp');
  assert.deepEqual(settings.buttons, { forward: 4 });
  assert.equal(settings.mouseSensitivity, 1); assert.equal(settings.stickSensitivity, 3); assert.equal(settings.zoomSensitivity, 0.1);
  assert.equal(settings.cameraHeight, 5); assert.equal(settings.shoulderOffset, -3); assert.equal(settings.defaultDistance, 4);
  assert.equal(settings.invertMouseX, true); assert.equal(settings.invertMouseY, false);
  assert.equal('extra' in settings, false);
  for (const bad of [null, [], 'bad', { version: 99 }]) assert.deepEqual(normalizeControls(bad), defaults());
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
  assert.equal(buttons.buttons.engage, 1); assert.equal(buttons.buttons.dodge, 0);
  buttons = bindButton(bindButton(buttons, 'targetPrevious', undefined), 'targetPrevious', 1);
  assert.equal(buttons.buttons.targetPrevious, 1); assert.equal(buttons.buttons.engage, undefined);
  assert.deepEqual(bindButton(original, 'engage', -1), original);
});

test('untouched v1-v3 presets migrate to directional targeting and role slots, retaining camera preferences', () => {
  for (const version of [1, 2, 3] as const) {
    const old = legacyControls(version);
    old.mouseSensitivity = 1.7; old.invertPadY = true;
    const migrated = normalizeControls(old);
    assert.deepEqual(migrated, { ...defaults(), mouseSensitivity: 1.7, invertPadY: true });
    assert.deepEqual(normalizeControls(JSON.parse(JSON.stringify(migrated))), migrated);
  }
});

test('custom v3 keys and buttons survive migration and conflicting additions are visibly unbound', () => {
  const old = legacyControls();
  old.keys.forward = 'KeyE'; old.keys.revelry = ''; old.buttons.heal = 8;
  delete old.buttons.guard;
  const migrated = normalizeControls(old);
  assert.equal(migrated.version, 5);
  for (const [id, key] of Object.entries(old.keys)) assert.equal(migrated.keys[id as Command], key);
  assert.deepEqual(migrated.buttons, old.buttons);
  assert.equal(migrated.keys.rapidWeave, '', 'must not steal a deliberately bound E key');
  assert.equal(migrated.keys.targetAllyNext, '', 'must not steal custom camera arrows');
  assert.equal(migrated.keys.primary1, '', 'must not steal existing explicit weaponskill keys');
  assert.ok(bindingWarnings(migrated).some(message => message.includes('Next ally')));
  assert.ok(bindingWarnings(migrated).some(message => message.includes('Primary ability 1')));
  assert.equal(migrated.keys.utility1, 'KeyQ', 'the previously cleared Q can safely become a role slot');
  assert.equal(effectiveBindingCommand('arcanist', 'rapidWeave', migrated, 'keyboard'), 'utility1');
  assert.deepEqual(normalizeControls(JSON.parse(JSON.stringify(migrated))), migrated);
});

test('legacy custom controls gain missing commands without displacing saved bindings or resurrecting v4 unbinds', () => {
  const legacy = legacyControls(1);
  legacy.keys.forward = 'KeyQ'; legacy.buttons.targetPrevious = 15;
  const migrated = normalizeControls(legacy);
  assert.equal(migrated.version, 5);
  assert.equal(migrated.keys.forward, 'KeyQ'); assert.equal(migrated.keys.revelry, '');
  assert.equal(migrated.buttons.targetPrevious, 15); assert.equal(migrated.buttons.revelry, undefined);
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

test('direct defaults engage on A and optional custom Commands never steal saved A mappings', () => {
  assert.equal(defaults().keys.commandMenu, '');
  assert.equal(defaults().buttons.commandMenu, undefined); assert.equal(defaults().buttons.engage, 0);
  const old = legacyControls(2); old.buttons.heal = 8;
  Reflect.deleteProperty(old.keys, 'commandMenu'); Reflect.deleteProperty(old.buttons, 'commandMenu');
  const migrated = normalizeControls(old);
  assert.equal(migrated.buttons.commandMenu, undefined); assert.equal(migrated.buttons.engage, 0);
  assert.equal(migrated.buttons.heal, 8);
  old.buttons.engage = 9; old.buttons.heal = 0; old.keys.heal = 'Enter';
  const custom = normalizeControls(old);
  assert.equal(custom.buttons.engage, 9); assert.equal(custom.buttons.heal, 0); assert.equal(custom.buttons.commandMenu, undefined);
  assert.equal(custom.keys.heal, 'Enter'); assert.equal(custom.keys.commandMenu, '');
  const explicit = bindButton(bindKey(migrated, 'commandMenu', 'Enter'), 'commandMenu', 0);
  assert.equal(explicit.buttons.engage, undefined); assert.equal(explicit.buttons.commandMenu, 0);
  assert.deepEqual(normalizeControls(JSON.parse(JSON.stringify(explicit))), explicit, 'explicit optional Commands survives reload');
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

function harness(initialSettings: ControlSettings = defaults(), routing?: { send?: (action: Action) => void; command?: (command: Command) => void; ui?: boolean }) {
  const win = surface(), doc = { ...surface(), activeElement: { tagName: 'BODY', isContentEditable: false, closest: (() => null) as (selector?: string) => object | null }, hidden: false, hasFocus: () => true };
  const pad = { connected: true, index: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  const touch = createTouchStick();
  const state = { touchEnabled: true, settings: initialSettings, enabled: true, commandOpen: false, uiOpen: false, role: 'vanguard' as Role, facing: 1.23, yaw: Math.PI, pad: null as typeof pad | null };
  const uiInputs: MenuIntent[] = [];
  const menuInputs: MenuIntent[] = [];
  const sent: Action[] = [], commands: Command[] = [], looks: number[][] = [], zooms: number[] = [], connections: boolean[] = [];
  let callback: FrameRequestCallback | null = null, now = performance.now() + 100;
  const replacements = { window: win, document: doc, navigator: { getGamepads: () => state.pad ? [state.pad] : [] }, requestAnimationFrame: (fn: FrameRequestCallback) => { callback = fn; return 1; }, cancelAnimationFrame: () => { callback = null; } };
  const descriptors = Object.fromEntries(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const cleanup = bindInput({ ui: routing?.ui ? { isOpen: () => state.uiOpen, onToggle: () => { state.uiOpen = !state.uiOpen; }, onInput: intent => { uiInputs.push(intent); if (intent === 'back') state.uiOpen = false; } } : undefined, touch: { stick: touch, enabled: () => state.touchEnabled }, send: action => { sent.push(action); routing?.send?.(action); }, getFacing: () => state.facing, getRole: () => state.role, getCameraYaw: () => state.yaw, getSettings: () => state.settings, onPad: present => connections.push(present), enabled: () => state.enabled, onCommand: command => { commands.push(command); routing?.command?.(command); }, commandMenu: { isOpen: () => state.commandOpen, onInput: intent => { menuInputs.push(intent); if (intent === 'open') state.commandOpen = true; if (intent === 'back' || intent === 'close') state.commandOpen = false; } }, onLook: (x, y) => { looks.push([x, y]); state.yaw += x; }, onZoom: delta => zooms.push(delta) });
  return {
    state, touch, sent, commands, looks, zooms, connections, menuInputs, uiInputs, win, doc, pad,
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
    h.key('KeyL'); h.frame();
    assert.ok(h.looks.at(-1)![0] < 0); assert.equal(h.move().facing, 1.23);
    assert.equal(h.move().x, 0); assert.equal(h.move().z, 0);
    h.key('KeyL', 'keyup'); h.state.yaw = Math.PI;
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

test('combat arrows and D-pad split ally and enemy selection without firing magic or moving the camera', () => {
  const h = harness();
  try {
    for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) { h.key(code); h.key(code, 'keyup'); }
    assert.deepEqual(h.commands, ['targetAllyPrevious', 'targetAllyNext', 'targetPrevious', 'targetNext']);
    h.state.pad = h.pad; h.frame();
    for (const button of [12, 13, 14, 15]) { h.pad.buttons[button].pressed = true; h.frame(); h.pad.buttons[button].pressed = false; h.frame(); }
    assert.deepEqual(h.commands.slice(4), ['targetAllyPrevious', 'targetAllyNext', 'targetPrevious', 'targetNext']);
    assert.ok(h.sent.every(action => action.type === 'move'));
    assert.equal(h.looks.length, 0);
    h.state.commandOpen = true; h.key('ArrowUp'); h.key('ArrowRight');
    assert.deepEqual(h.menuInputs, ['up', 'right']);
    assert.equal(h.commands.length, 8);
    h.state.commandOpen = false; h.doc.activeElement.tagName = 'INPUT';
    assert.equal(h.key('ArrowDown').prevented, false);
    assert.equal(h.commands.length, 8);
  } finally { h.close(); }
});

test('primary keyboard and X/Y/RB slots resolve the current role on each press', () => {
  const h = harness();
  const expected: Record<Role, Action[]> = {
    vanguard: [{ type: 'weapon', id: 'cleave' }, { type: 'weapon', id: 'pierce' }, { type: 'weapon', id: 'resonance' }],
    warden: [{ type: 'weapon', id: 'cleave' }, { type: 'weapon', id: 'pierce' }, { type: 'weapon', id: 'resonance' }],
    hunter: [{ type: 'weapon', id: 'cleave' }, { type: 'weapon', id: 'pierce' }, { type: 'weapon', id: 'resonance' }],
    arcanist: [{ type: 'magic', element: 'fire' }, { type: 'magic', element: 'ice' }, { type: 'magic', element: 'lightning' }],
    luminary: [{ type: 'heal' }, { type: 'aegis' }, { type: 'shimmerWave' }],
  };
  try {
    h.state.pad = h.pad; h.frame();
    for (const role of Object.keys(expected) as Role[]) {
      h.state.role = role;
      const before = h.sent.filter(action => action.type !== 'move').length;
      for (const code of ['Digit1', 'Digit2', 'Digit3']) { h.key(code); h.key(code, 'keyup'); }
      for (const button of [2, 3, 5]) { h.pad.buttons[button].pressed = true; h.frame(); h.pad.buttons[button].pressed = false; h.frame(); }
      assert.deepEqual(h.sent.filter(action => action.type !== 'move').slice(before), [...expected[role], ...expected[role]]);
    }
    h.state.settings = bindButton(bindKey(h.state.settings, 'primary1', 'KeyH'), 'primary1', 8); h.frame();
    h.state.role = 'arcanist'; h.key('KeyH');
    assert.deepEqual(h.sent.at(-1), { type: 'magic', element: 'fire' });
  } finally { h.close(); }
});

test('default A engages directly and LB guards; neither requires Commands', () => {
  const h = harness();
  try {
    h.state.pad = h.pad; h.frame();
    h.pad.buttons[0].pressed = true; h.frame(); h.frame();
    assert.deepEqual(h.sent.filter(action => action.type !== 'move'), [{ type: 'engage' }]);
    assert.deepEqual(h.menuInputs, []);
    h.pad.buttons[0].pressed = false; h.frame();
    h.pad.buttons[4].pressed = true; h.frame();
    assert.equal(h.sent.filter(action => action.type === 'guard').length, 1);
  } finally { h.close(); }
});

test('Mend routes the selected ally from keyboard and role/controller slots while menu arrows stay isolated', () => {
  for (const route of ['KeyF', 'Digit1', 2, 4] as const) {
    const game = createGame(); applyAction(game, 4, { type: 'start' });
    game.party[0].hp -= 500; game.party[1].hp = 100;
    const before = game.party[0].hp;
    let selected: number | null = null;
    const applied: Action[] = [];
    const configured = route === 'KeyF' ? bindKey(defaults(), 'heal', 'KeyF') : route === 4 ? bindButton(defaults(), 'heal', 4) : defaults();
    const h = harness(configured, {
      command: command => {
        if (command === 'targetAllyNext' || command === 'targetAllyPrevious') selected = cycleLivingAlly(selected, game.party, command === 'targetAllyPrevious' ? -1 : 1);
      },
      send: input => {
        if (input.type === 'move') return;
        const action = withHealingTarget(input, selected);
        applied.push(action);
        const result = applyAction(game, 4, action);
        assert.equal(result.ok, true, result.error);
        if (action.type === 'heal' && action.target !== undefined) selected = null;
      },
    });
    try {
      h.state.role = 'luminary';
      h.key('ArrowDown'); h.key('ArrowDown', 'keyup');
      assert.equal(selected, 0);
      h.state.commandOpen = true;
      h.key('ArrowDown'); h.key('ArrowDown', 'keyup'); h.key('Digit1'); h.key('Digit1', 'keyup');
      assert.equal(selected, 0, 'menu navigation cannot replace the selected ally');
      assert.deepEqual(h.menuInputs, ['down']);
      assert.equal(applied.length, 0, 'a primary shortcut cannot leak through the command menu');
      h.state.commandOpen = false;
      if (typeof route === 'number') {
        h.state.pad = h.pad; h.frame();
        h.pad.buttons[route].pressed = true; h.frame();
      } else { h.key(route); h.key(route, 'keyup'); }
      assert.deepEqual(applied, [{ type: 'heal', target: 0 }]);
      assert.ok(game.party[0].hp > before, 'Mend must heal the selected ally');
      assert.equal(game.party[1].hp, 100, 'manual Mend must not substitute the lowest-health ally');
      assert.equal(selected, null, 'a successful manual heal returns to automatic selection');
    } finally { h.close(); }
  }
});

test('role techniques have direct keyboard and analog-trigger inputs without using the D-pad', () => {
  const h = harness();
  try {
    h.state.pad = h.pad; h.frame();
    for (const [role, expected] of [['vanguard', 'criticalDash'], ['hunter', 'splitVolley'], ['arcanist', 'rapidWeave'], ['warden', 'provoke']] as const) {
      h.state.role = role;
      const before = h.sent.filter(action => action.type === expected).length;
      h.key('KeyQ'); h.key('KeyQ', 'keydown', { repeat: true }); h.key('KeyQ', 'keyup');
      assert.equal(h.sent.filter(action => action.type === expected).length, before + 1);
      h.pad.buttons[7].value = .8; h.frame(); h.frame();
      assert.equal(h.sent.filter(action => action.type === expected).length, before + 2, 'one analog press, not one cast per frame');
      h.pad.buttons[7].value = .3; h.frame();
    }
    h.state.role = 'vanguard'; h.pad.buttons[6].value = .8; h.frame(); h.frame();
    assert.equal(h.sent.filter(action => action.type === 'revelry').length, 1);
    h.pad.buttons[6].value = 0; h.frame(); h.pad.buttons[6].value = .8; h.frame();
    assert.equal(h.sent.filter(action => action.type === 'revelry').length, 2);
    h.state.commandOpen = true; h.key('KeyQ');
    assert.equal(h.sent.filter(action => action.type === 'criticalDash').length, 2);
  } finally { h.close(); }
});

test('Revelry keyboard and controller bindings emit one intent per press and respect menus', () => {
  const h = harness(bindButton(defaults(), 'revelry', 8));
  try {
    h.key('KeyE'); h.key('KeyE', 'keydown', { repeat: true }); h.key('KeyE', 'keyup');
    assert.equal(h.sent.filter(action => action.type === 'revelry').length, 1);
    h.state.pad = h.pad; h.frame();
    h.pad.buttons[8].pressed = true; h.frame(); h.frame();
    assert.equal(h.sent.filter(action => action.type === 'revelry').length, 2);
    h.state.enabled = false; h.key('KeyE');
    h.pad.buttons[8].pressed = false; h.frame(); h.pad.buttons[8].pressed = true; h.frame();
    assert.equal(h.sent.filter(action => action.type === 'revelry').length, 2);
    h.state.enabled = true; h.frame();
    assert.equal(h.sent.filter(action => action.type === 'revelry').length, 2);
    h.pad.buttons[8].pressed = false; h.frame();
    h.state.settings = bindKey(bindKey(h.state.settings, 'utility2', ''), 'revelry', 'KeyT'); h.frame();
    h.key('KeyE'); h.key('KeyT');
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
  const settings = bindButton(bindButton(bindButton(bindButton(defaults(), 'forward', 8), 'cameraUp', 9), 'zoomOut', 15), 'targetNext', 10);
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
  const h = harness(bindButton(bindKey(defaults(), 'commandMenu', 'Enter'), 'commandMenu', 0));
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
  const h = harness(bindButton(bindKey(defaults(), 'commandMenu', 'Enter'), 'commandMenu', 0));
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
  const h = harness(bindButton(bindKey(defaults(), 'commandMenu', 'Enter'), 'commandMenu', 0));
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
    h.key('KeyE'); h.frame();
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

test('PC, mobile and controller resolve to independent layouts and explicit choices survive input changes', () => {
  assert.equal(resolveLayout('auto', 'keyboard'), 'desktop');
  assert.equal(resolveLayout('auto', 'touch'), 'touch');
  assert.equal(resolveLayout('auto', 'controller'), 'controller');
  for (const input of ['keyboard', 'touch', 'controller'] as const) {
    assert.equal(resolveLayout('controller', input), 'controller');
    assert.equal(resolveLayout('desktop', input), 'desktop');
    assert.equal(resolveLayout('touch', input), 'touch');
  }
  assert.equal(normalizeLayout('controller'), 'controller');
});

test('Escape opens the game menu, closes results, and backs out of Commands without opening another menu', () => {
  const h = harness(defaults(), { ui: true });
  try {
    assert.equal(h.key('Escape').prevented, true);
    assert.equal(h.state.uiOpen, true);
    h.key('Escape', 'keydown', { repeat: true });
    assert.equal(h.state.uiOpen, true, 'holding Escape does not bounce between screens');
    h.key('Escape');
    assert.equal(h.state.uiOpen, false);
    assert.deepEqual(h.uiInputs, ['back']);
    h.state.commandOpen = true;
    h.key('Escape');
    assert.equal(h.state.commandOpen, false);
    assert.equal(h.state.uiOpen, false);
    assert.equal(h.menuInputs.at(-1), 'back');
    assert.deepEqual(h.sent.filter(action => action.type !== 'move'), []);
  } finally { h.close(); }
});

test('menu keyboard navigation preserves native buttons and forms, and suppresses gameplay', () => {
  const h = harness(defaults(), { ui: true });
  try {
    h.state.uiOpen = true;
    h.key('Enter'); h.key('ArrowDown'); h.key('Digit1'); h.key('KeyW'); h.frame();
    assert.deepEqual(h.uiInputs, ['confirm', 'down']);
    assert.deepEqual(h.sent.filter(action => action.type !== 'move'), []);
    assert.equal(h.move().x, 0); assert.equal(h.move().z, 0);
    h.doc.activeElement.tagName = 'BUTTON';
    assert.equal(h.key('Enter').prevented, false, 'native button activation is not duplicated');
    h.doc.activeElement.tagName = 'SELECT';
    assert.equal(h.key('ArrowDown').prevented, false, 'native select navigation stays native');
    h.key('Escape'); assert.equal(h.state.uiOpen, false, 'Escape exits even from a form');
  } finally { h.close(); }
});

test('controller Menu, A, B and D-pad navigate overlays without casting or evading behind them', () => {
  const h = harness(defaults(), { ui: true });
  try {
    h.state.pad = h.pad; h.frame();
    h.pad.buttons[9].pressed = true; h.frame();
    assert.equal(h.state.uiOpen, true);
    h.frame(); assert.equal(h.state.uiOpen, true, 'held Menu does not toggle repeatedly');
    h.pad.buttons[9].pressed = false; h.frame();
    h.pad.buttons[13].pressed = true; h.frame();
    assert.equal(h.uiInputs.at(-1), 'down');
    h.pad.buttons[13].pressed = false; h.frame();
    h.pad.buttons[0].pressed = true; h.frame(); h.frame();
    assert.equal(h.uiInputs.filter(intent => intent === 'confirm').length, 1);
    h.pad.buttons[0].pressed = false; h.frame();
    h.pad.buttons[1].pressed = true; h.frame(); h.frame();
    assert.equal(h.state.uiOpen, false);
    assert.deepEqual(h.sent.filter(action => action.type !== 'move'), [], 'closing does not also Evade');
    assert.deepEqual(h.menuInputs, [], 'confirming an overlay does not open combat Commands');
    h.pad.buttons[1].pressed = false; h.frame();
    h.pad.buttons[1].pressed = true; h.frame();
    assert.equal(h.sent.filter(action => action.type === 'dodge').length, 1, 'normal gameplay resumes after release');
  } finally { h.close(); }
});

test('controller overlay navigation remains available when gameplay is disabled and ignores unfocused windows', () => {
  const h = harness(defaults(), { ui: true });
  try {
    h.state.uiOpen = true; h.state.enabled = false; h.state.pad = h.pad; h.frame();
    h.pad.axes[1] = .9; h.frame();
    assert.equal(h.uiInputs.at(-1), 'down');
    assert.equal(h.move().z, 0);
    h.pad.axes[1] = 0; h.frame();
    h.win.emit('blur');
    h.pad.buttons[1].pressed = true; h.frame();
    assert.equal(h.state.uiOpen, true);
    h.pad.buttons[1].pressed = false; h.win.emit('focus'); h.frame();
    h.pad.buttons[1].pressed = true; h.frame();
    assert.equal(h.state.uiOpen, false);
  } finally { h.close(); }
});

test('G and default L3 dispatch the currently controlled hero’s ultimate; saved L3 target binding remains intact', () => {
  const h = harness();
  try {
    h.state.pad = h.pad; h.frame();
    for (const [role, type] of [['vanguard', 'fearless'], ['warden', 'thunderclap'], ['hunter', 'rainOfFire'], ['arcanist', 'fission'], ['luminary', 'rejuvenator']] as const) {
      h.state.role = role;
      h.key('KeyG'); h.key('KeyG', 'keyup');
      assert.equal(h.sent.filter(a => a.type !== 'move').at(-1)?.type, type);
      h.pad.buttons[10].pressed = true; h.frame();
      assert.equal(h.sent.filter(a => a.type !== 'move').at(-1)?.type, type);
      h.pad.buttons[10].pressed = false; h.frame();
    }
    const old = defaults(); delete old.buttons.ultimate; old.buttons.targetNext = 10;
    const kept = normalizeControls(JSON.parse(JSON.stringify(old)));
    assert.equal(kept.buttons.targetNext, 10); assert.equal(kept.buttons.ultimate, undefined);
    assert.ok(bindingWarnings(kept).some(w => w.includes('Divine ultimate') && w.includes('controller')));
  } finally { h.close(); }
});
