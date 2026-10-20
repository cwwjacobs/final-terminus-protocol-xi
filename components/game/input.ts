import type { Action } from '../../game/types.ts';

export const deadzone = (n: number, threshold = .18) => Math.abs(n) < threshold ? 0 : Math.sign(n) * (Math.abs(n) - threshold) / (1 - threshold);
export const movement = (x:number,z:number,yaw:number) => ({x:Math.cos(yaw)*x + Math.sin(yaw)*z,z:-Math.sin(yaw)*x + Math.cos(yaw)*z});
export function bindInput(send:(a:Action)=>void, getFacing:()=>number, onPad:(v:boolean)=>void, enabled:()=>boolean) {
 const keys=new Set<string>(); let yaw=getFacing(), last=performance.now(), lastMove=0, prev:boolean[]=[], dragging=false, frame=0, focused=document.hasFocus();
 const editable=()=> /INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName || '');
 const actions:Record<string,Action>={Space:{type:'engage'},Digit1:{type:'weapon',id:'cleave'},Digit2:{type:'weapon',id:'pierce'},Digit3:{type:'weapon',id:'resonance'},Digit4:{type:'magic',element:'fire'},Digit5:{type:'magic',element:'ice'},Digit6:{type:'magic',element:'lightning'},KeyR:{type:'provoke'},KeyF:{type:'heal'},ShiftLeft:{type:'guard'},KeyC:{type:'dodge'}};
 function down(e:KeyboardEvent){if(editable()||!enabled())return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);if(!e.repeat&&actions[e.code])send(actions[e.code]);}
 function up(e:KeyboardEvent){keys.delete(e.code);}
 function focus(){focused=true;}
 function clear(){focused=false;keys.clear();dragging=false;send({type:'move',x:0,z:0,facing:yaw});}
 function mouseDown(e:MouseEvent){if((e.target as HTMLElement).tagName==='CANVAS')dragging=true;}
 function mouseMove(e:MouseEvent){if(dragging&&enabled())yaw-=e.movementX*.006;}
 function mouseUp(){dragging=false;}
 const padActions:Record<number,Action>={0:{type:'engage'},1:{type:'dodge'},2:{type:'weapon',id:'cleave'},3:{type:'weapon',id:'pierce'},4:{type:'heal'},5:{type:'weapon',id:'resonance'},6:{type:'guard'},7:{type:'provoke'},12:{type:'magic',element:'fire'},13:{type:'magic',element:'ice'},14:{type:'magic',element:'lightning'}};
 let padPresent=false;
 function loop(now:number){const dt=Math.min((now-last)/1000,.05);last=now;const pad=navigator.getGamepads?.().find(p=>p?.connected);if(!!pad!==padPresent){padPresent=!!pad;onPad(padPresent);}let x=0,z=0;
 if(focused&&!document.hidden&&enabled()&&!editable()){
 yaw+=((keys.has('ArrowLeft')||keys.has('KeyQ')?1:0)-(keys.has('ArrowRight')||keys.has('KeyE')?1:0))*dt*2.1;
 x=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);z=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
 if(pad){x+=deadzone(pad.axes[0]||0);z-=deadzone(pad.axes[1]||0);yaw-=deadzone(pad.axes[2]||0)*dt*2.5;for(const [i,action]of Object.entries(padActions)){const n=+i;if(pad.buttons[n]?.pressed&&!prev[n])send(action);}prev=pad.buttons.map(b=>b.pressed);}
 }else{prev=pad?.buttons.map(b=>b.pressed)||[];}
 const len=Math.max(1,Math.hypot(x,z));const m=movement(x/len,z/len,yaw);if(now-lastMove>=50){send({type:'move',...m,facing:yaw});lastMove=now;}frame=requestAnimationFrame(loop);}
 window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',clear);window.addEventListener('focus',focus);window.addEventListener('mousedown',mouseDown);window.addEventListener('mousemove',mouseMove);window.addEventListener('mouseup',mouseUp);frame=requestAnimationFrame(loop);
 return ()=>{cancelAnimationFrame(frame);window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',clear);window.removeEventListener('focus',focus);window.removeEventListener('mousedown',mouseDown);window.removeEventListener('mousemove',mouseMove);window.removeEventListener('mouseup',mouseUp);};
}
