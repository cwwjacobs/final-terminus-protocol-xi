// Reproducible active-input simulation: descent, six sentinels, giant and escape.
// Not a browser or hardware playtest. --full-game also plays Crown first.
// Run: node --experimental-strip-types scripts/verify-logos-encounters.mjs
import assert from 'node:assert/strict';
import {offensiveTarget,sequenceLocked} from '../game/logos.ts';
import {createGame,applyAction,stepGame,isInTelegraph,setHuman} from '../game/engine.ts';
import {WEAPONS,ELEMENTS,ULTIMATES} from '../game/content.ts';
const fullGame=process.argv.includes('--full-game');
for(const mode of ['trial','god'])for(let slot=0;slot<5;slot++){
 const s=createGame(mode,123);s.party.forEach((_,i)=>setHuman(s,i,i===slot));
 if(fullGame)applyAction(s,slot,{type:'start'});else{s.status='victory';applyAction(s,slot,{type:'faceLogos'});}
 let seen=0,chains=0,bursts=0,newHits=0,crownSeconds=0;
 const stages=new Set();
 for(let tick=0;tick<24000&&(s.status==='fighting'||s.status==='victory'&&s.encounter==='crown');tick++){
  if(s.status==='victory'&&s.encounter==='crown'){crownSeconds=s.combatTime;assert.ok(s.party.every(a=>a.hp>0));applyAction(s,slot,{type:'faceLogos'});}
  stages.add(s.encounter==='crown'?'crown':s.logos.stage);
  if(sequenceLocked(s)){stepGame(s,.05);continue;}
  const a=s.party[slot],b={...s.boss,...offensiveTarget(s,s.party[slot])};
  if(tick%4===0&&a.hp>0){
   let dx=b.x-a.x,dz=b.z-a.z;const d=Math.hypot(dx,dz); const range=slot===0||slot===1?3.3:10;
   if(d<=range+1&&d>=range-1.5)dx=dz=0;else if(d<range-1.5){dx=-dx;dz=-dz;}
   if(b.cast?.abilityId==='regentsDecree'&&b.cast.target===slot){applyAction(s,slot,{type:'guard'});if(b.cast.remaining<.55)applyAction(s,slot,{type:'dodge'});}
   if(b.cast&&isInTelegraph(a,b.cast)){
    if(b.cast.kind==='raid')applyAction(s,slot,{type:'guard'});
    else if(b.cast.kind==='cone'){dx=Math.cos(b.cast.angle)*8;dz=-Math.sin(b.cast.angle)*8;}
    else {dx=a.x-b.cast.x;dz=a.z-b.cast.z;if(Math.hypot(dx,dz)<.1)dx=1;}
    if(b.cast.kind!=='raid'&&b.cast.remaining<.6)applyAction(s,slot,{type:'dodge'});
   }
   const l=Math.max(1,Math.hypot(dx,dz));applyAction(s,slot,{type:'move',x:dx/l,z:dz/l});
   if(s.combatTime>9 && (slot!==4 || s.party.some(p=>p.hp>0 && p.hp<p.maxHp*.6)))applyAction(s,slot,{type:ULTIMATES[a.role]});
   if(slot===1&&a.sonOfZeus){if(b.stunRemaining<.1){if(a.tp>=1000)applyAction(s,slot,{type:'clap'});applyAction(s,slot,{type:'lightningShock'});}applyAction(s,slot,{type:'bolt'});}
   if(slot===0)applyAction(s,slot,{type:'revelry'});
   if(slot===1){applyAction(s,slot,{type:'provoke'});if(a.hp<a.maxHp*.72)applyAction(s,slot,{type:'guard'});}
   if(slot<=2){
    const chain=s.chain;
    if(a.tp>=1000&&(!chain||((chain.opener!==slot||a.selfChainUntil>s.time||a.id==='bacchus'&&a.criticalCharges>0)&&s.time-chain.openedAt>=1.8)))applyAction(s,slot,{type:'weapon',id:chain?WEAPONS[chain.weapon].next:slot===2?'pierce':'cleave'});
    if(slot===0&&a.tp<=2280)applyAction(s,slot,{type:'criticalDash'});
    if(slot===2&&a.tp<=1750&&(!chain||chain.opener===slot))applyAction(s,slot,{type:'splitVolley'});
   }
   if(slot===3){
    if(a.mp>=420&&(s.burst||b.phase>=2))applyAction(s,slot,{type:'rapidWeave'});
    const cycle=a.elementalCycle.elements;const order=[...ELEMENTS.filter(e=>!cycle.includes(e)),...cycle];if(s.burst)order.unshift(s.burst.element);
    for(const element of order)if(applyAction(s,slot,{type:'magic',element}).ok)break;
   }
   if(slot===4){
    if(s.party.some(p=>p.hp>0&&p.maxHp-p.hp>360))applyAction(s,slot,{type:'heal'});
    if(b.cast&&(b.cast.kind==='raid'||b.cast.abilityId==='regentsDecree'))applyAction(s,slot,{type:'aegis'});
   }
  }
  stepGame(s,.05);
  for(const e of s.events.filter(e=>e.id>seen)){chains+=e.kind==='chain';bursts+=e.kind==='burst';newHits+=e.kind==='weapon'&&['criticalDash','splitVolley'].includes(e.source);seen=e.id;}
 }
 assert.equal(s.status,'victory', `${mode} ${s.party[slot].name}`);
 assert.equal(s.party.filter(a=>a.hp>0).length,5);
 assert.ok(s.ultimatesUnlocked && s.encounter==='logos');
 assert.equal(s.logos.stage,'escaped');
 for(const stage of ['descent','sentinels','giant','collapse'])assert.ok(stages.has(stage),stage);
 if(fullGame)assert.ok(crownSeconds>0&&stages.has('crown'));
 console.log(JSON.stringify({mode,role:s.party[slot].name,seed:123,status:s.status,crownSeconds,logosSeconds:s.combatTime,stage:s.logos.stage,bossHp:s.boss.hp,alive:s.party.filter(a=>a.hp>0).length,chains,bursts,newHits}));
}
