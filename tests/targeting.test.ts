import test from 'node:test';
import assert from 'node:assert/strict';
import { cycleTarget, cycleLivingAlly } from '../components/game/targeting.ts';
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

test('friendly selection skips fallen members, wraps, and remains independent of enemy selection', () => {
  const party = [{ hp: 50 }, { hp: 0 }, { hp: 25 }, { hp: 1 }];
  let enemy: string | null = 'boss';
  let ally = cycleLivingAlly(null, party);
  assert.equal(ally, 0);
  ally = cycleLivingAlly(ally, party);
  assert.equal(ally, 2);
  assert.equal(cycleLivingAlly(ally, party, -1), 0);
  assert.equal(cycleLivingAlly(0, party, -1), 3);
  assert.equal(cycleLivingAlly(3, party), 0);
  assert.equal(enemy, 'boss');
  enemy = cycleTarget(enemy, ['boss']);
  assert.equal(ally, 2);
  assert.equal(cycleLivingAlly(1, party), 0);
  assert.equal(cycleLivingAlly(null, party, -1), 3);
  assert.equal(cycleLivingAlly(0, [{ hp: 0 }, { hp: -1 }]), null);
  assert.equal(cycleLivingAlly(2, []), null);
  assert.deepEqual(party, [{ hp: 50 }, { hp: 0 }, { hp: 25 }, { hp: 1 }]);
});
