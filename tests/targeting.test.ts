import test from 'node:test';
import assert from 'node:assert/strict';
import { cycleTarget } from '../components/game/targeting.ts';
test('a single target selects and remains selected on every cycle', () => {
  let selected: string | null = null;
  for (let i=0;i<8;i++) { selected=cycleTarget(selected,['boss']); assert.equal(selected,'boss'); }
  assert.equal(cycleTarget('boss',['boss'],-1),'boss');
});
test('target cycling wraps both directions and tolerates missing or duplicate targets', () => {
  assert.equal(cycleTarget('a',['a','b','c']), 'b');
  assert.equal(cycleTarget('c',['a','b','c']), 'a');
  assert.equal(cycleTarget('a',['a','b','c'],-1), 'c');
  assert.equal(cycleTarget(null,['a','b'],-1), 'b');
  assert.equal(cycleTarget('gone',['a','a','b']), 'a');
  assert.equal(cycleTarget('a',[]),null);
});
