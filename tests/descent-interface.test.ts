import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gameClient = readFileSync(new URL('../components/game/GameClient.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../components/game/LogosSequencePanel.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../components/game/combat-hud.css', import.meta.url), 'utf8');

test('the descent removes every combat surface that can cover ready-up', () => {
  assert.match(gameClient, /!sequenceLocked\(state\)&&state\.status==='fighting'&&!menu&&<CombatHUD/);
  assert.match(gameClient, /!sequenceLocked\(state\)&&inputProfile\.touch&&state\.status==='fighting'&&<TouchControls/);
  assert.match(gameClient, /!sequenceLocked\(state\)&&showRoster&&state\.status==='fighting'&&<aside className="party-panel"/);
  assert.match(gameClient, /!sequenceLocked\(state\)&&showLog&&!ended&&<section className="combat-log"/);
});

test('ready-up precedes the scrollable scoreboard and wins the overlay stack', () => {
  assert.ok(panel.indexOf('className="descent-readiness"') < panel.indexOf('className="descent-stats"'));
  assert.match(css, /\.logos-intermission\{[^}]*z-index:30/);
  assert.match(css, /@media\(max-height:620px\) and \(min-width:600px\)/);
  assert.match(css, /\.descent-readiness button\{min-height:48px/);
});
