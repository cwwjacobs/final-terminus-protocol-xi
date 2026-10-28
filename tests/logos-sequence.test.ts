import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createGame, stepGame } from '../game/engine.ts';
import { enemyTargets, offensiveTarget, SENTINEL_ENTRY_SECONDS } from '../game/logos.ts';
import { restoreSave, validSave } from '../lib/local-save.ts';
import { parseRoomRequest } from '../lib/rooms.ts';
import type { GameState } from '../game/types.ts';

function advance(s: GameState, seconds: number) { while(seconds>1e-8){const t=Math.min(30,seconds);stepGame(s,t);seconds-=t;} }
function descend(){const s=createGame();s.party.forEach(a=>{a.human=true;a.x=0;a.z=-1;a.attackTimer=100000;a.engaged=true;});applyAction(s,0,{type:'start'});s.boss.hp=1;s.party[0].tp=1000;applyAction(s,0,{type:'weapon',id:'cleave'});assert.equal(s.status,'victory');assert.ok(applyAction(s,0,{type:'faceLogos'}).ok);return s;}
function giant(){const s=descend();advance(s,60 + SENTINEL_ENTRY_SECONDS);for(const e of [...s.enemies]){s.party[0].x=e.x;s.party[0].z=e.z+1;s.party[0].tp=1000;s.party[0].recovery=0;s.party[0].cooldowns['weapon:cleave']=0;applyAction(s,0,{type:'selectEnemy',id:e.id});e.hp=1;assert.ok(applyAction(s,0,{type:'weapon',id:'cleave'}).ok);}s.party.forEach((a,i)=>{a.x=(i-2)*2;a.z=-1;a.attackTimer=100000;a.recovery=0;a.human=true;});return s;}

test('descent preserves the Crown scoreboard and takes exactly 60 seconds without combat or input spending',()=>{
 const s=descend(),stats=structuredClone(s.runStats),clock=s.combatTime;
 assert.equal(s.logos.stage,'descent');assert.equal(s.enemies.length,6);assert.equal(s.ultimatesUnlocked,false);
 const before=structuredClone(s);assert.equal(applyAction(s,3,{type:'fission'}).ok,false);assert.equal(applyAction(s,0,{type:'move',x:1,z:0}).ok,false);assert.deepEqual(s,before);
 advance(s,59.95);assert.equal(s.logos.stage,'descent');assert.deepEqual(s.runStats,stats);assert.equal(s.combatTime,clock);assert.ok(validSave(s));
 advance(s,.05);assert.equal(s.logos.stage,'sentinels');assert.equal(s.combatTime,0);assert.equal(enemyTargets(s).length,6);assert.ok(validSave(s));
 assert.equal(applyAction(s,3,{type:'selectEnemy',id:'boss'}).ok,false,'head is not targetable through the sentinel wave');
});

test('the six existing statues have a protected landing window and the exact Ariadne / Logos exchange',()=>{
 const s=descend(); const ids=s.enemies.map(enemy=>enemy.id); advance(s,60);
 assert.deepEqual(s.enemies.map(enemy=>enemy.id),ids,'arrival uses the existing six statues');
 const question=s.events.find(event=>event.kind==='lair_question');
 assert.equal(question?.text,'Logos..?');assert.equal(question?.actor,s.party.findIndex(actor=>actor.id==='ariadne'));
 assert.equal(s.events.filter(event=>event.kind==='lair_answer').length,0);
 const positions=s.enemies.map(enemy=>[enemy.x,enemy.z,enemy.attackTimer]);
 const enemy=s.enemies[0];s.party[3].x=enemy.x;s.party[3].z=enemy.z;
 assert.equal(applyAction(s,3,{type:'selectEnemy',id:enemy.id}).ok,true,'preselecting an incoming statue is allowed');
 const before=structuredClone(s);
 assert.equal(applyAction(s,3,{type:'magic',element:'fire'}).ok,false);
 assert.deepEqual(s,before,'a landing statue cannot consume the player’s MP or cooldowns');
 assert.equal(applyAction(s,3,{type:'guard'}).ok,true);
 assert.equal(applyAction(s,0,{type:'move',x:1,z:0}).ok,true);
 const health=s.party.map(actor=>actor.hp),enemyHealth=s.enemies.map(enemy=>enemy.hp);
 advance(s,SENTINEL_ENTRY_SECONDS-.05);
 assert.deepEqual(s.enemies.map(enemy=>[enemy.x,enemy.z,enemy.attackTimer]),positions);
 assert.deepEqual(s.enemies.map(enemy=>enemy.hp),enemyHealth,'automatic attacks cannot strike flying statues');
 assert.deepEqual(s.party.map(actor=>actor.hp),health);
 assert.equal(s.events.filter(event=>event.kind==='lair_answer').length,0);
 advance(s,.05);
 assert.equal(s.events.find(event=>event.kind==='lair_answer')?.text,'Logos!');
 assert.equal(s.events.find(event=>event.kind==='lair_answer')?.actor,undefined,'Logos is not a party speaker');
 assert.equal(applyAction(s,3,{type:'magic',element:'fire'}).ok,true);
 advance(s,3);
 assert.equal(s.events.filter(event=>event.kind==='lair_question').length,1);
 assert.equal(s.events.filter(event=>event.kind==='lair_answer').length,1);
 assert.ok(validSave(s));
});

test('a saved mid-entry clock resumes the landing shout once under partitioned replay',()=>{
 const s=descend();advance(s,61.8);
 const restored=restoreSave(JSON.parse(JSON.stringify(s)));assert.ok(restored);
 advance(s,.6);advance(restored,.15);advance(restored,.45);
 assert.deepEqual(restored,s);
 assert.equal(s.events.filter(event=>event.kind==='lair_answer').length,1);
 assert.equal(s.ultimatesUnlocked,false,'landing alone does not unlock the giant-phase ultimates');
});

test('six actual sentinel kills raise the giant and unlock ultimates with separate head and hand targets',()=>{
 const s=giant();assert.equal(s.logos.stage,'giant');assert.equal(s.ultimatesUnlocked,true);
 assert.deepEqual(enemyTargets(s).map(e=>e.id),['boss','left-hand','right-hand']);
 assert.equal(offensiveTarget(s,s.party[1]).name,'Logos · Left hand');assert.ok(validSave(s));
 const hp=s.boss.hp,hand=s.enemies[0];s.party[1].x=hand.x;s.party[1].z=hand.z+1;s.party[1].tp=1000;
 assert.ok(applyAction(s,1,{type:'weapon',id:'cleave'}).ok);assert.ok(hand.hp<hand.maxHp);assert.equal(s.boss.hp,hp);
 assert.ok(applyAction(s,3,{type:'selectEnemy',id:'boss'}).ok);assert.ok(applyAction(s,3,{type:'magic',element:'fire'}).ok);assert.ok(s.boss.hp<hp);
});

test('Logos has its own rotation and staggered hands reform after twelve seconds',()=>{
 const s=giant();s.boss.specialTimer=0;stepGame(s,.05);assert.equal(s.boss.cast?.abilityId,'logosRay');assert.ok(validSave(s));
 s.boss.cast=null;s.boss.specialTimer=100000;const hand=s.enemies[0];hand.hp=1;s.party[1].x=hand.x;s.party[1].z=hand.z+1;s.party[1].tp=1000;
 applyAction(s,1,{type:'weapon',id:'cleave'});assert.equal(hand.hp,0);advance(s,11.95);assert.equal(hand.hp,0);advance(s,.05);assert.equal(hand.hp,hand.maxHp);
});

test('Logos coherence loss starts a six-second floor collapse, then escape and victory without declaring him dead',()=>{
 const s=giant();s.boss.hp=1;assert.ok(applyAction(s,3,{type:'magic',element:'fire'}).ok);
 assert.equal(s.logos.stage,'collapse');assert.equal(s.status,'fighting');assert.equal(applyAction(s,0,{type:'engage'}).ok,false);assert.ok(validSave(s));
 advance(s,5.95);assert.equal(s.status,'fighting');advance(s,.05);assert.equal(s.logos.stage,'escaped');assert.equal(s.status,'victory');assert.match(s.events.at(-1)!.text,/survives/);assert.ok(validSave(s));
});

test('stage clocks survive saves and partitioned replay; stale or authority-bearing target intents are rejected',()=>{
 const s=descend();advance(s,59.5);const restored=restoreSave(JSON.parse(JSON.stringify(s)));assert.ok(restored);advance(s,.5);advance(restored,.25);advance(restored,.25);assert.deepEqual(restored,s);
 assert.equal(applyAction(s,0,{type:'selectEnemy',id:'sentinel-99'}).ok,false);
 assert.throws(()=>parseRoomRequest({op:'sync',code:'a'.repeat(32),token:'b'.repeat(32),seq:1,actions:[{type:'selectEnemy',id:'boss',damage:9999}]}));
 const invalid=structuredClone(s);invalid.logos.stage='invented' as typeof invalid.logos.stage;assert.equal(restoreSave(invalid),null);
});

test('an area ultimate resolves each explicit target once and excludes the head when outside its area',()=>{
 const s=giant();s.enemies.forEach((e,i)=>{e.hp=e.maxHp=20000;e.x=i===0?-3:3;e.z=-3;});
 s.party[3].enemyTarget='left-hand';const before=s.boss.hp;
 assert.ok(applyAction(s,3,{type:'fission'}).ok);
 const hits=s.events.filter(e=>e.source==='fission'&&e.kind==='magic');
 assert.deepEqual(hits.map(e=>e.enemyId),['left-hand','right-hand','boss']);assert.ok(s.boss.hp<before);assert.ok(validSave(s));
 const far=giant();far.enemies[0].x=-10;far.enemies[0].z=7;far.enemies[1].x=10;far.enemies[1].z=7;
 far.party[3].x=-10;far.party[3].z=9;far.party[3].enemyTarget='left-hand';const hp=far.boss.hp;
 assert.ok(applyAction(far,3,{type:'fission'}).ok);assert.equal(far.boss.hp,hp);assert.equal(far.events.filter(e=>e.source==='fission'&&e.kind==='magic').length,1);
});
