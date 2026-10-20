import test from 'node:test';
import assert from 'node:assert/strict';
import {deadzone,movement} from '../components/game/input.ts';
test('controller deadzone suppresses drift and preserves full range',()=>{assert.equal(deadzone(.1),0);assert.equal(deadzone(-.17),0);assert.equal(deadzone(1),1);assert.equal(deadzone(-1),-1);});
test('camera-relative forward and strafe remain orthogonal after rotation',()=>{for(const yaw of [0,Math.PI/2,Math.PI,-2.7]){const f=movement(0,1,yaw),s=movement(1,0,yaw);assert.ok(Math.abs(f.x*s.x+f.z*s.z)<1e-10);assert.ok(Math.abs(Math.hypot(f.x,f.z)-1)<1e-10);}assert.ok(movement(0,1,Math.PI).z<-.99);});
