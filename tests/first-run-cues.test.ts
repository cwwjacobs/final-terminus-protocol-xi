import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../game/engine.ts';
import { defaults } from '../components/game/control-settings.ts';
import { firstRunCue, restoredCueProgress, FIRST_RUN_CUES } from '../components/game/first-run-cues.ts';

function encounter() {
  const state = createGame(); state.status = 'fighting';
  state.party.forEach(actor => { actor.x = state.boss.x; actor.z = state.boss.z; actor.engaged = true; actor.tp = 1200; });
  return state;
}

test('Engage cue follows live remaps, supports touch and never changes gameplay', () => {
  const state = encounter(), settings = defaults(); state.party[0].engaged = false;
  settings.keys.engage = 'KeyZ'; settings.buttons.engage = 9;
  const before = JSON.stringify(state);
  assert.match(firstRunCue(state, 0, settings, 'desktop', [])!.text, /Z · Auto attack/);
  assert.match(firstRunCue(state, 0, settings, 'controller', [])!.text, /Start · Auto attack/);
  assert.match(firstRunCue(state, 0, settings, 'touch', [])!.text, /Auto attack on the ability bar/);
  settings.keys.engage = '';
  assert.doesNotMatch(firstRunCue(state, 0, settings, 'desktop', [])!.text, /Unbound/);
  assert.equal(JSON.stringify(state), before);
});

test('TP advice appears only for a currently usable TP action and respects Son of Zeus', () => {
  const state = encounter(), settings = defaults();
  for (const slot of [0, 1, 2]) assert.equal(firstRunCue(state, slot, settings, 'desktop', [])?.id, 'tactical-points');
  for (const slot of [3, 4]) assert.equal(firstRunCue(state, slot, settings, 'desktop', []), null, 'casters are not told to spend TP on weaponskills');
  state.party[0].tp = 999;
  assert.equal(firstRunCue(state, 0, settings, 'desktop', []), null);
  state.party[1].sonOfZeus = true;
  assert.match(firstRunCue(state, 1, settings, 'desktop', [])!.text, /3 · Clap/);
  state.party[1].cooldowns.clap = 5;
  assert.equal(firstRunCue(state, 1, settings, 'desktop', []), null);
  state.party[2].x = 100;
  assert.equal(firstRunCue(state, 2, settings, 'desktop', []), null, 'out-of-range commands are not advertised as ready');
});

test('chain cue follows real close windows and never suggests an ordinary self-chain', () => {
  const state = encounter(), settings = defaults(); state.time = 10;
  state.chain = { property: 'Liquefaction', opener: 1, remaining: 6, weapon: 'cleave', openedAt: 8 };
  const cue = firstRunCue(state, 0, settings, 'controller', []);
  assert.equal(cue?.id, 'chain-burst'); assert.match(cue!.text, /Y · Vector Pierce/);
  assert.equal(firstRunCue(state, 1, settings, 'desktop', []), null);
  state.chain.openedAt = 9;
  assert.equal(firstRunCue(state, 0, settings, 'desktop', []), null, 'not before minimum chain delay');
});

test('burst cue uses the matching available spell or selected shot, not just an opener', () => {
  const state = encounter(), settings = defaults(); state.burst = { element: 'ice', remaining: 5 };
  assert.match(firstRunCue(state, 3, settings, 'desktop', [])!.text, /2 · Ice/);
  assert.equal(firstRunCue(state, 2, settings, 'desktop', []), null, 'wrong selected shot is not a burst');
  state.party[2].shotElement = 'ice';
  assert.match(firstRunCue(state, 2, settings, 'controller', [])!.text, /LT · Elemental Shot/);
  state.party[3].cooldowns['magic:ice'] = 4;
  assert.equal(firstRunCue(state, 3, settings, 'desktop', []), null);
  state.burst.remaining = 0;
  assert.equal(firstRunCue(state, 2, settings, 'desktop', []), null);
});

test('saved cue progress is bounded; completed tips, dead actors and cinematics remain quiet', () => {
  assert.deepEqual(restoredCueProgress(['engage', 'engage', 'fake', 'chain-burst']), ['engage', 'chain-burst']);
  assert.deepEqual(restoredCueProgress({ engage: true }), []);
  const state = encounter(), settings = defaults();
  assert.equal(firstRunCue(state, 0, settings, 'desktop', FIRST_RUN_CUES), null);
  state.party[0].hp = 0;
  assert.equal(firstRunCue(state, 0, settings, 'desktop', []), null);
  state.party[0].hp = state.party[0].maxHp; state.logos.stage = 'descent';
  assert.equal(firstRunCue(state, 0, settings, 'desktop', []), null);
  state.logos.stage = 'none'; state.status = 'victory';
  assert.equal(firstRunCue(state, 0, settings, 'desktop', []), null);
});
