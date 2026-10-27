import test from 'node:test';
import assert from 'node:assert/strict';
import { awaitBattlefield } from '../components/game/scene-loading.ts';

test('completed preparation opens the gate while preparation failures stay failures', async () => {
  const controller = new AbortController();
  await awaitBattlefield(Promise.resolve(), controller.signal, 50);
  await assert.rejects(awaitBattlefield(Promise.reject(new Error('driver failed')), controller.signal, 50), /driver failed/);
});

test('a stalled load reaches recovery and late completion cannot reopen its gate', async () => {
  let done!: () => void;
  const pending = new Promise<void>(resolve => { done = resolve; });
  const result = awaitBattlefield(pending, new AbortController().signal, 5);
  await assert.rejects(result, /taking too long/);
  done();
  await assert.rejects(result, /taking too long/);
});

test('leaving or retrying cancels the old loading gate, including an already cancelled attempt', async () => {
  const controller = new AbortController();
  const pending = new Promise<void>(() => {});
  const result = awaitBattlefield(pending, controller.signal, 50);
  controller.abort(new Error('old scene removed'));
  await assert.rejects(result, /old scene removed/);
  await assert.rejects(awaitBattlefield(Promise.resolve(), controller.signal, 50), /old scene removed/);
});
