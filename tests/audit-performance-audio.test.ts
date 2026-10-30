import assert from 'node:assert/strict';
import test from 'node:test';
import { RenderBudget, RenderCadence } from '../components/game/render-budget.ts';
import { CombatAudioQueue, createAudioFramePump, combatSoundPlan, createCombatAudio, COMBAT_AUDIO_LIMITS } from '../components/game/combat-audio.ts';

test('idle rendering stays near 30Hz at common refresh rates; combat and visibility transitions are immediate', () => {
  for(const refresh of [60,75,90,120,144,165]){
    const cadence=new RenderCadence();let rendered=0;
    for(let i=0;i<refresh*10;i++)if(cadence.shouldRender(i*1000/refresh,false))rendered++;
    assert.ok(Math.abs(rendered-300)<=1,`${refresh}Hz display rendered ${rendered} idle frames`);
    assert.equal(cadence.shouldRender(10001,true),true);
    assert.equal(cadence.shouldRender(10002,true),true);
    assert.equal(cadence.shouldRender(10003,true,true),false);
    assert.equal(cadence.shouldRender(10004,false),true);
    assert.equal(cadence.shouldRender(NaN,true),false);
  }
  const budget=new RenderBudget('high',1.015);
  for(let i=0;i<15;i++)budget.sample(25);
  assert.ok(budget.pixelRatio>=budget.minimum);
  for(let i=0;i<500;i++)budget.sample(90);
  assert.ok(budget.pixelRatio<=1.015);
  const before=budget.pixelRatio;
  for(let i=0;i<50;i++)budget.sample(30,false);
  assert.equal(budget.pixelRatio,before,'idle cadence never degrades combat resolution');
});

test('audio pump requests frames only for pending work, coalesces wakes and cancels pause/unmount work', () => {
  const callbacks=new Map<number,FrameRequestCallback>();let sequence=0,work=2,played=0;
  const pump=createAudioFramePump(()=>{played++;return --work>0;},cb=>{callbacks.set(++sequence,cb);return sequence;},id=>{callbacks.delete(id);});
  assert.equal(callbacks.size,0);
  pump.wake();pump.wake();assert.equal(callbacks.size,1);
  const flush=()=>{const [id,cb]=callbacks.entries().next().value!;callbacks.delete(id);cb(16);};
  flush();assert.equal(callbacks.size,1);flush();assert.equal(callbacks.size,0);assert.equal(played,2);
  pump.wake();pump.stop();assert.equal(callbacks.size,0);
  pump.wake();pump.dispose();assert.equal(callbacks.size,0);pump.wake();assert.equal(callbacks.size,0);
});

test('outcome, stage and War Cry sounds are fresh event cues with no restored-history or target fan-out replay', () => {
  for(const kind of ['victory','defeat','phase','descent','sentinels_awaken','awakening']){
    const event={id:1,time:0,kind,text:''};
    const plan=combatSoundPlan(event);assert.equal(plan.length,1);assert.equal(plan[0].priority,3);
    const queue=new CombatAudioQueue();queue.enqueue(event,0);queue.enqueue(event,0);
    assert.equal(queue.drain(0,[]).length,1);assert.equal(queue.drain(.1,[]).length,0);
    queue.reset();assert.equal(queue.size,0);
  }
  assert.equal(combatSoundPlan({id:1,time:0,kind:'ability',source:'warCry',text:''})[0].sound,'warCry');
  assert.equal(combatSoundPlan({id:2,time:0,kind:'weapon',source:'warCry',text:'',value:220}).length,0);
});

// Inspect the real synthesis graph/lifecycle with a small Web Audio adapter.
// It establishes scheduled cues, cleanup and bounded voices, not audible mix quality.
test('synthesized cues use one compressed audio graph; ground warnings preserve boss charges and cleanup stops every voice', async () => {
  const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'), oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  const sources:MockNode[]=[];let contexts=0,closed=0,resumed=0;
  class Param {value=0;setValueAtTime(v:number){this.value=v;}exponentialRampToValueAtTime(v:number){this.value=v;}linearRampToValueAtTime(v:number){this.value=v;}setTargetAtTime(v:number){this.value=v;}}
  class MockNode {
    gain=new Param();frequency=new Param();Q=new Param();threshold=new Param();knee=new Param();ratio=new Param();attack=new Param();release=new Param();
    state='running';currentTime=0;sampleRate=24000;destination={};buffer:unknown;type='';onended:(()=>void)|null=null;
    started=false;stopped=false;disconnected=false;connections:unknown[]=[];
    connect(node:unknown){this.connections.push(node);}disconnect(){this.disconnected=true;}
    start(){this.started=true;}stop(at?:number){if(at===undefined)this.stopped=true;}
  }
  const contextRef:{current?:MockContext}={};
  class MockContext extends MockNode {
    compressor:MockNode|null=null;
    constructor(){super();contexts++;contextRef.current=this;}
    createGain(){return new MockNode();}
    createDynamicsCompressor(){return this.compressor=new MockNode();}
    createOscillator(){const n=new MockNode();sources.push(n);return n;}
    createBufferSource(){const n=new MockNode();sources.push(n);return n;}
    createBiquadFilter(){return new MockNode();}
    createBuffer(_channels:number,count:number){return {getChannelData:()=>new Float32Array(count)};}
    async resume(){resumed++;this.state='running';}async close(){closed++;this.state='closed';}
  }
  const restore=(key:'window'|'document',descriptor:PropertyDescriptor|undefined)=>{if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);};
  try{
    Object.defineProperty(globalThis,'window',{configurable:true,value:{AudioContext:MockContext}});
    const doc={hidden:false};Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
    const audio=createCombatAudio();audio.unlock();audio.unlock();assert.equal(contexts,1);
    assert.equal(contextRef.current!.compressor!.ratio.value,4);
    contextRef.current!.state='interrupted';audio.unlock();await Promise.resolve();assert.equal(resumed,1);
    const cast={name:'Warning',kind:'circle' as const,total:3,remaining:3,x:0,z:0,radius:4,angle:0};
    audio.beginBossCharge(cast);const charge=sources[0];
    audio.play('groundCharge',.6,3);assert.equal(charge.stopped,false,'independent ground cue does not restart the boss warning');
    for(const sound of ['warCry','victory','defeat','phase','fire','ice','lightning'] as const)audio.play(sound);
    assert.ok(sources.filter(s=>s.started&&!s.stopped).length<=COMBAT_AUDIO_LIMITS.voices);
    audio.setVolume(0);assert.ok(sources.every(s=>s.stopped||!s.started));
    const count=sources.length;audio.play('warCry');assert.equal(sources.length,count);
    audio.setVolume(.35);doc.hidden=true;audio.play('victory');assert.equal(sources.length,count);
    doc.hidden=false;audio.play('defeat');assert.ok(sources.length>count);
    audio.silence();assert.ok(sources.every(s=>s.disconnected));
    audio.dispose();audio.dispose();audio.unlock();assert.equal(contexts,1);assert.equal(closed,1);
  }finally{restore('window',oldWindow);restore('document',oldDocument);}
});
