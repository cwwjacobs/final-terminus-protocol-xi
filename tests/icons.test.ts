import test from 'node:test';
import assert from 'node:assert/strict';
import { ABILITY_MARKS, ICONS, iconMarkup, roleIcon, type IconName } from '../components/game/icons.ts';
import { abilities } from '../components/game/catalog.ts';
import { ROLE_MARKERS } from '../components/game/party-markers.ts';
import { MAGIC, WEAPONS } from '../game/content.ts';

const PATH = /^[MmLlHhVvCcSsQqTtAaZz][-\d.,\s MmLlHhVvCcSsQqTtAaZz]*$/;

test('every HUD consumer names a registered outline', () => {
  for (const ability of abilities) assert.ok(ability.icon in ICONS, `${ability.name} icon ${ability.icon}`);
  for (const role of Object.keys(ROLE_MARKERS)) {
    assert.equal(roleIcon(role), role, 'every role has a pictorial emblem');
    assert.equal(ICONS[roleIcon(role)].box, 64, 'sigils are 64-box marks');
    assert.ok(`${role}Shape` in ICONS, 'and keeps its floor-ring shape');
  }
  assert.equal(roleIcon('not-a-role'), 'vanguard', 'unknown role falls back instead of throwing in render');
  for (const weapon of Object.keys(WEAPONS)) assert.ok(weapon in ABILITY_MARKS, `enemy mark for ${weapon}`);
  for (const element of Object.keys(MAGIC)) assert.ok(element in ABILITY_MARKS, `enemy mark for ${element}`);
});

test('outlines are valid absolute-or-relative path data in their declared box', () => {
  for (const [name, definition] of Object.entries(ICONS)) {
    assert.ok(definition.box === 24 || definition.box === 64, name);
    assert.ok(definition.shapes.length > 0, name);
    for (const shape of definition.shapes) {
      assert.match(shape.d, PATH, `${name} path data`);
      for (const number of shape.d.match(/-?\d+(\.\d+)?/g) ?? [])
        assert.ok(Math.abs(Number(number)) <= definition.box + 1, `${name} coordinate ${number} leaves the ${definition.box} box`);
    }
  }
});

test('markup renders one svg per icon with currentColor and no text glyphs', () => {
  for (const name of Object.keys(ICONS) as IconName[]) {
    const markup = iconMarkup(name);
    assert.match(markup, /^<svg class="ui-icon" viewBox="0 0 \d+ \d+"/);
    assert.ok(markup.includes('stroke="currentColor"'));
    assert.ok(!/<text/.test(markup), 'icons are outlines, not font glyphs');
    assert.equal((markup.match(/<path/g) ?? []).length, ICONS[name].shapes.length);
  }
});

test('negative control: a malformed outline is rejected by the same validator', () => {
  assert.doesNotMatch('M12 3l9 9-9 9-9-9z♜', PATH);
  assert.doesNotMatch('<script>', PATH);
});
