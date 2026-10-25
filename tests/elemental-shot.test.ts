import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createGame, stepGame } from '../game/engine.ts';
import { restoreSave } from '../lib/local-save.ts';
import { parseRoomRequest } from '../lib/rooms.ts';
import { enemyMark } from '../components/game/enemy-mark.ts';
import { abilityCue } from '../components/game/combat-feedback.ts';
import { actionKey } from '../components/game/role-animation.ts';
import type { Action } from '../game/types.ts';
function battle() {
 const state=createGame();applyAction(state,2,{type:'start'});
 state.party.forEach(a=>{a.human=true;a.engaged=true;a.x=0;a.z=0;});return state;
}
test('each selected shot bursts only on a live matching element; cooldown shared across switches',()=>{
 for(const element of ['fire','ice','lightning'] as const){
  const s=battle(); const a=s.party[2];
  assert.equal(applyAction(s,2,{type:'selectShot',element}).ok,true);
  s.burst={element,remaining:5};
  assert.equal(abilityCue(s,2,{type:'elementalShot'},false)?.kind,'burst-ready');
  assert.equal(applyAction(s,2,{type:'elementalShot'}).ok,true);
  const hit=s.events.at(-1)!;assert.equal(hit.kind,'burst');assert.equal(hit.value,780);assert.equal(a.mp,285);assert.equal(actionKey(hit),'auto');
  assert.equal(applyAction(s,2,{type:'selectShot'}).ok,true);
  const before=JSON.stringify(s);assert.equal(applyAction(s,2,{type:'elementalShot'}).ok,false);assert.equal(JSON.stringify(s),before);
  stepGame(s,6.1);assert.equal(applyAction(s,2,{type:'elementalShot'}).ok,true);assert.equal(s.events.at(-1)!.kind,'magic');assert.equal(s.events.at(-1)!.value,230);
 }
});
test('a mismatched shot never bursts or creates a burst window',()=>{
 const s=battle();s.burst={element:'ice',remaining:4};
 assert.equal(applyAction(s,2,{type:'elementalShot'}).ok,true);assert.equal(s.events.at(-1)!.kind,'magic');assert.equal(s.burst.element,'ice');
});
test('shots enforce role, MP, range and engagement without spending on rejection',()=>{
 for(const condition of ['role','mp','range','engaged','invalid'] as const){
  const s=battle();const a=s.party[2];let slot=2;let action:Action={type:'elementalShot'};
  if(condition==='role')slot=0;if(condition==='mp')a.mp=34;if(condition==='range')a.z=24;if(condition==='engaged')a.engaged=false;if(condition==='invalid')action={type:'selectShot',element:'bogus'} as unknown as Action;
  const before=JSON.stringify(s);assert.equal(applyAction(s,slot,action).ok,false,condition);assert.equal(JSON.stringify(s),before,condition);
 }
});
test('shot selection survives saves; older saves default to fire and malformed elements are rejected',()=>{
 const s=battle();applyAction(s,2,{type:'selectShot',element:'ice'});assert.equal(restoreSave(s)?.party[2].shotElement,'ice');
 const old=structuredClone(s);old.party.forEach(a=>Reflect.deleteProperty(a,'shotElement'));assert.equal(restoreSave(old)?.party[2].shotElement,'fire');
 Reflect.set(s.party[2],'shotElement','bogus');assert.equal(restoreSave(s),null);
});
test('room parser accepts selection and firing, rejects unknown elements and injected fields',()=>{
 const base={op:'sync',code:'a'.repeat(32),token:'b'.repeat(32),seq:0};
 for(const action of [{type:'selectShot',element:'ice'},{type:'selectShot'},{type:'elementalShot'}])assert.doesNotThrow(()=>parseRoomRequest({...base,actions:[action]}));
 for(const action of [{type:'selectShot',element:'bogus'},{type:'elementalShot',damage:9999}])assert.throws(()=>parseRoomRequest({...base,actions:[action]}));
});
test('seal countdown follows live window time and disappears on expiry',()=>{
 const s=battle();s.burst={element:'fire',remaining:4.5};assert.equal(enemyMark(s)?.remaining,4.5);stepGame(s,.5);assert.ok(Math.abs(enemyMark(s)!.remaining-4)<.01);stepGame(s,4.1);assert.equal(enemyMark(s),null);
});
