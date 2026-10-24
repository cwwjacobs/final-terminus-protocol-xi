import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createGame } from '../game/engine.ts';
import { closedCommandMenu, commandEntries, commandUnavailable, navigateCommands, type CommandMenuState } from '../components/game/command-menu.ts';

test('root command order is stable and Items does not imply an implemented inventory', () => {
  const rows = commandEntries(createGame(), 0, 'root');
  assert.deepEqual(rows.map(row => row.label), ['Attack', 'Spells', 'Abilities', 'Weapon Abilities', 'Items', 'Disengage']);
  assert.equal(rows[4].disabled, true); assert.equal(rows[4].action, undefined); assert.equal(rows[4].page, undefined);
  assert.match(rows[4].detail, /not implemented/);
});

test('opening cannot also activate Attack; Attack engages but never toggles an engaged actor off', () => {
  const game = createGame(), rows = commandEntries(game, 0, 'root');
  const opened = navigateCommands(closedCommandMenu(), 'confirm', rows);
  assert.equal(opened.state.open, true); assert.equal(opened.action, undefined);
  const selected = navigateCommands(opened.state, 'confirm', rows);
  assert.deepEqual(selected.action, { type: 'start' }); assert.equal(selected.state.open, false);
  assert.equal(applyAction(game, 0, selected.action!).ok, true);
  assert.equal(game.party[0].engaged, true);
  const engaged = commandEntries(game, 0, 'root');
  assert.equal(engaged[0].disabled, true); assert.equal(engaged[0].action, undefined);
  assert.equal(navigateCommands(opened.state, 'confirm', engaged).action, undefined);
  const stop = navigateCommands({ ...opened.state, index: 5 }, 'confirm', engaged);
  assert.deepEqual(stop.action, { type: 'engage' }); applyAction(game, 0, stop.action!);
  assert.equal(game.party[0].engaged, false); assert.equal(game.status, 'fighting');
  assert.deepEqual(commandEntries(game, 0, 'root')[0].action, { type: 'engage' });
});

test('nested spells preserve ally/adversary meaning and back closes one level at a time', () => {
  const game = createGame();
  let menu: CommandMenuState = { open: true, page: 'root', index: 1 };
  menu = navigateCommands(menu, 'right', commandEntries(game, 3, menu.page)).state;
  assert.equal(menu.page, 'spells');
  menu = navigateCommands({ ...menu, index: 1 }, 'confirm', commandEntries(game, 3, menu.page)).state;
  assert.equal(menu.page, 'adversaries');
  assert.deepEqual(commandEntries(game, 3, menu.page).map(row => row.action), [
    { type: 'magic', element: 'fire' }, { type: 'magic', element: 'ice' }, { type: 'magic', element: 'lightning' },
  ]);
  menu = navigateCommands(menu, 'back', []).state; assert.equal(menu.page, 'spells');
  menu = navigateCommands(menu, 'left', []).state; assert.equal(menu.page, 'root');
  menu = navigateCommands(menu, 'back', []).state; assert.equal(menu.open, false);
  const ally = commandEntries(game, 4, 'allies');
  assert.deepEqual(ally[0].action, { type: 'heal' }); assert.match(ally[0].detail, /Engage/);
  applyAction(game, 4, { type: 'start' });
  game.party[0].hp -= 100; game.party[0].x = game.party[4].x; game.party[0].z = game.party[4].z;
  assert.match(commandEntries(game, 4, 'allies')[0].detail, /lowest-health/);
});

test('role-filtered pages expose only existing permissions, with honest empty categories', () => {
  const game = createGame();
  assert.deepEqual(commandEntries(game, 0, 'abilities').map(row => row.id), ['revelry', 'criticalDash', 'guard', 'dodge']);
  assert.deepEqual(commandEntries(game, 1, 'abilities').map(row => row.id), ['provoke', 'guard', 'dodge']);
  for (const [slot, signature] of [[2, 'splitVolley'], [3, 'rapidWeave'], [4, 'aegis']] as const) assert.deepEqual(commandEntries(game, slot, 'abilities').map(row => row.id), [signature, 'guard', 'dodge']);
  for (const slot of [0, 1, 2]) assert.equal(commandEntries(game, slot, 'weapons').length, 3);
  for (const slot of [3, 4]) assert.deepEqual(commandEntries(game, slot, 'weapons'), []);
  for (const slot of [0, 1, 2, 4]) assert.deepEqual(commandEntries(game, slot, 'adversaries'), []);
  for (const slot of [0, 1, 2, 3]) assert.deepEqual(commandEntries(game, slot, 'allies'), []);
});

test('fresh resource/cooldown state blocks stale selections without mutating combat', () => {
  const game = createGame(); applyAction(game, 0, { type: 'start' });
  game.party[0].x = game.boss.x; game.party[0].z = game.boss.z + 3; game.party[0].tp = 1000;
  const menu: CommandMenuState = { open: true, page: 'weapons', index: 0 };
  assert.equal(commandEntries(game, 0, 'weapons')[0].disabled, false);
  game.party[0].tp = 999;
  const before = JSON.stringify(game);
  assert.equal(navigateCommands(menu, 'confirm', commandEntries(game, 0, 'weapons')).action, undefined);
  assert.equal(JSON.stringify(game), before);
  game.party[0].tp = 1000; game.party[0].cooldowns['weapon:cleave'] = 2;
  assert.match(commandUnavailable(game, 0, { type: 'weapon', id: 'cleave' })!, /cooldown/);
  assert.equal(commandUnavailable(game, 0, { type: 'weapon', id: 'pierce' }), null, 'independent weaponskill recast');
  game.party[3].mp = 69;
  assert.equal(commandEntries(game, 3, 'adversaries')[0].disabled, true);
  game.party[0].hp = 0;
  assert.equal(commandEntries(game, 0, 'root')[5].disabled, true);
});

test('navigation wraps safely through disabled rows and empty menus; right never fires actions', () => {
  const game = createGame(), rows = commandEntries(game, 0, 'root');
  const menu: CommandMenuState = { open: true, page: 'root', index: 0 };
  assert.equal(navigateCommands(menu, 'up', rows).state.index, 5);
  assert.equal(navigateCommands({ ...menu, index: 5 }, 'down', rows).state.index, 0);
  assert.equal(navigateCommands(menu, 'right', rows).action, undefined);
  assert.equal(navigateCommands({ ...menu, index: 4 }, 'confirm', rows).state.open, true);
  assert.equal(navigateCommands({ ...menu, page: 'allies', index: 80 }, 'down', []).state.index, 0);
  assert.equal(navigateCommands({ ...menu, page: 'allies' }, 'confirm', []).action, undefined);
  assert.deepEqual(navigateCommands({ ...menu, page: 'allies' }, 'close', []).state, closedCommandMenu());
});
