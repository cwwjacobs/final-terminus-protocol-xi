import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../game/engine.ts';
import { defaults } from '../components/game/control-settings.ts';
import { guideAbilities, guideBinding } from '../components/game/guide-controls.ts';

test('the guide resolves every hero’s default keyboard and controller kit without false Unbound labels', () => {
  const settings = defaults();
  for (const actor of createGame().party) for (const mode of ['keyboard', 'controller'] as const) {
    const rows = guideAbilities(actor, settings, mode);
    assert.ok(rows.length >= 8);
    assert.ok(rows.every(row => row.binding !== 'Unbound'), actor.name);
    const firstThree = rows.slice(0, 3).map(row => row.binding);
    assert.deepEqual(firstThree, mode === 'keyboard' ? ['1', '2', '3'] : ['X', 'Y', 'RB']);
  }
  assert.deepEqual(guideAbilities(createGame().party[3], settings, 'keyboard').slice(0, 3).map(row => row.name), ['Fire', 'Ice', 'Thunder']);
  assert.equal(guideAbilities(createGame().party[4], settings, 'keyboard')[0].command, 'heal');
});

test('the guide follows role-slot remaps and direct overrides independently for each input mode', () => {
  const actor = createGame().party[1], settings = defaults();
  settings.keys.primary1 = 'KeyZ'; settings.buttons.primary1 = 9;
  settings.keys.utility2 = ''; settings.keys.warCry = 'KeyT';
  delete settings.buttons.utility2; settings.buttons.warCry = 16;
  assert.equal(guideBinding(actor, 'cleave', settings, 'keyboard'), 'Z');
  assert.equal(guideBinding(actor, 'cleave', settings, 'controller'), 'Start');
  assert.equal(guideBinding(actor, 'warCry', settings, 'keyboard'), 'T');
  assert.equal(guideBinding(actor, 'warCry', settings, 'controller'), 'Guide');
  delete settings.buttons.warCry;
  assert.equal(guideBinding(actor, 'warCry', settings, 'controller'), 'Unbound');
  assert.equal(guideBinding(actor, 'warCry', settings, 'keyboard'), 'T');
});

test('Son of Zeus changes guide abilities while preserving their remapped slots', () => {
  const actor = createGame().party[1], settings = defaults();
  actor.sonOfZeus = true; settings.keys.primary2 = 'KeyZ';
  const keyboard = guideAbilities(actor, settings, 'keyboard');
  assert.deepEqual(keyboard.slice(0, 3).map(row => row.command), ['lightningShock', 'bolt', 'clap']);
  assert.deepEqual(keyboard.slice(0, 3).map(row => row.binding), ['1', 'Z', '3']);
  assert.deepEqual(guideAbilities(actor, settings, 'controller').slice(0, 3).map(row => row.binding), ['X', 'Y', 'RB']);
  assert.equal(guideBinding(actor, 'cleave', settings, 'keyboard'), 'Unbound', 'transformed slots do not falsely advertise normal weaponskills');
});
