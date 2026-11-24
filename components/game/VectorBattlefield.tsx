'use client';

import { useEffect, useState } from 'react';
import { ARENA_RADIUS, CONE_HALF_ANGLE } from '../../game/content';
import { arenaRadius } from '../../game/logos-arena';
import { SENTINEL_ENTRY_SECONDS, SENTINEL_NAMES, statuesEntering } from '../../game/logos';
import type { BossCast, GameState } from '../../game/types';
import type { CameraState } from './camera';
import Icon from './Icon';
import './vector-battlefield.css';

const ETCHES = Array.from({ length: 48 }, (_, i) => (
  <path key={i} transform={`rotate(${i * 7.5})`} d={i % 4 ? 'M0 22.8v.8' : 'M0 4v2l.8 1v11l-.8 1v4.6'}/>
));
const SEATS = SENTINEL_NAMES.map((name, i) => ({
  name, id: `sentinel-${i}`, x: 34 * Math.sin(i * Math.PI / 3), z: 34 * Math.cos(i * Math.PI / 3),
}));
const RUSH_ART = ['rush-melee-charge', 'rush-leap-attack', 'rush-ranged-throw'];

function dangerPath(cast: BossCast) {
  const half = CONE_HALF_ANGLE;
  const x = Math.sin(half) * cast.radius, z = Math.cos(half) * cast.radius;
  return `M0 0 L${-x} ${z} A${cast.radius} ${cast.radius} 0 0 0 ${x} ${z} Z`;
}

function Carving({ part, x, y, size }: { part: 'head' | 'left-hand' | 'right-hand'; x: number; y: number; size: number }) {
  // The original separated contours occupy different regions of the same plate.
  const plate = part === 'head' ? '138 0 105 124' : part === 'left-hand' ? '0 155 109 140' : '155 282 129 118';
  const file = part === 'head' ? 'giant-head' : `giant-hand-screen-${part === 'left-hand' ? 'left' : 'right'}`;
  return <svg x={x - size / 2} y={y - size} width={size} height={size} viewBox={plate}>
    <image href={`/assets/logos/${file}.svg`} width="302" height="420"/>
    {part === 'head' && <image href="/assets/logos/giant-crown.svg" width="302" height="420"/>}
  </svg>;
}

type Props = {
  state: GameState; slot: number; camera: CameraState; selectedTarget: string | null; selectedAlly: number | null;
  onReady: (status: { ready: boolean; loaded: number; total: number }) => void;
};

export default function VectorBattlefield({ state, slot, camera, selectedTarget, selectedAlly, onReady }: Props) {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(preference.matches);
    sync(); preference.addEventListener('change', sync);
    onReady({ ready: true, loaded: 0, total: 0 });
    return () => preference.removeEventListener('change', sync);
  }, [onReady]);

  const yaw = camera.yaw, cos = Math.cos(yaw), sin = Math.sin(yaw);
  const tilt = .69 + .12 * Math.sin(camera.pitch);
  const radius = arenaRadius(state), stage = state.logos.stage;
  const crown = state.encounter === 'crown', dormant = crown || stage === 'descent';
  const entry = statuesEntering(state);
  const entryTime = stage === 'giant' ? SENTINEL_ENTRY_SECONDS - (state.logos.statueEntryRemaining ?? 0) : state.logos.elapsed;
  const span = 88 * Math.sqrt(camera.distance / 12);
  const screen = (x: number, z: number) => ({ x: -cos * x + sin * z, y: (-sin * x - cos * z) * tilt });
  const cast = state.boss.cast, boss = screen(state.boss.x, state.boss.z);
  const floorOpacity = stage === 'escaped' ? 0 : stage === 'collapse' ? Math.max(0, 1 - state.logos.elapsed / 2.4) : 1;
  const storm = state.storm;
  const stormTarget = storm.target === 'heracles' ? state.party[1] : storm.target === 'boss' ?
    (state.enemies.find(enemy => enemy.id === storm.enemyId) ?? state.boss) : storm;
  const ringColor = stage === 'giant' && radius < 13.5 ? '#ff9986' : '#c9af78';

  return <div className="quantum-scene vector-scene">
    <svg className="vector-field" data-game-canvas="true" role="img" aria-label="Overhead vector battlefield" viewBox={`${-span/2} ${-span*.34} ${span} ${span*.68}`}>
      <defs>
        <radialGradient id="arena-stone"><stop stopColor="#35323c"/><stop offset=".57" stopColor="#212532"/><stop offset="1" stopColor="#151822"/></radialGradient>
        <radialGradient id="arena-aura"><stop stopColor="#547184" stopOpacity=".21"/><stop offset="1" stopColor="#000" stopOpacity="0"/></radialGradient>
      </defs>
      <ellipse rx="47" ry="28" fill="url(#arena-aura)"/>
      {dormant && SEATS.map(seat => {
        const p = screen(seat.x, seat.z);
        return <image key={seat.id} href={`/assets/logos/sentinel-${seat.name.toLowerCase()}.svg`} x={p.x-4.3} y={p.y-11.7} width="8.6" height="12" opacity={storm.charge > 0 ? .72 : .38}/>;
      })}
      <g transform={`matrix(${-cos} ${-sin*tilt} ${sin} ${-cos*tilt} 0 0)`}>
        <g opacity={floorOpacity}>
          <circle r={radius} fill="url(#arena-stone)" stroke={ringColor} strokeWidth=".19"/>
          <g transform={`scale(${radius/ARENA_RADIUS})`} stroke="#969db2" fill="none">
            {[2.7,7,13,19,23.35].map(r => <circle key={r} r={r} opacity=".36" strokeWidth=".065"/>)}
            <g stroke={ringColor} opacity=".56" strokeWidth=".095">{ETCHES}</g>
          </g>
          {cast && <g fill="#ff776a" fillOpacity=".28" stroke="#ffad8c" strokeWidth=".18">
            {cast.kind === 'raid' ? <circle r={radius}/> : cast.kind === 'cone' ?
              <path d={dangerPath(cast)} transform={`translate(${cast.x} ${cast.z}) rotate(${-cast.angle*180/Math.PI})`}/> :
              <circle cx={cast.x} cy={cast.z} r={cast.radius}/>}
          </g>}
          {storm.charge > 0 && <circle cx={stormTarget.x} cy={stormTarget.z} r="3" stroke="#a5dbff" strokeDasharray=".55 .35" strokeWidth=".18" fill="#98c9ff" fillOpacity=".16"/>}
        </g>
      </g>
      {selectedTarget === 'boss' && state.status === 'fighting' && (crown || stage === 'giant') &&
        <ellipse cx={boss.x} cy={boss.y} rx={crown ? 3.5 : 5.2} ry={crown ? 1.3 : 1.65} fill="none" stroke="#ffd58b" strokeWidth=".19"/>}
      {state.boss.hp > 0 && stage !== 'escaped' && (crown ?
        <g transform={`translate(${boss.x} ${boss.y})`}>
          <ellipse rx="2.9" ry="1" fill="#08080c" opacity=".58"/>
          <path d="M-2.2 -.1 -2.9 -3.5 -1.1 -2.45 0 -5.2 1.1 -2.45 2.9 -3.5 2.2 -.1 Z" fill="#95754e" stroke="#ffe1a2" strokeWidth=".22"/>
          <path d="M-2.1 -.7 Q0 -1.4 2.1 -.7" fill="none" stroke="#fff0bd" strokeWidth=".16"/>
        </g> : <Carving part="head" x={boss.x} y={boss.y} size={12}/>)}
      {!dormant && state.enemies.filter(enemy => enemy.hp > 0).map(enemy => {
        const index = SEATS.findIndex(seat => seat.id === enemy.id);
        const jump = entry && index >= 0 ? Math.max(0,Math.min(1,(entryTime-index*.18)/(SENTINEL_ENTRY_SECONDS-.9))) : 1;
        const travel = reducedMotion ? Number(jump >= 1) : jump * jump * (3 - 2 * jump);
        const x = index >= 0 ? SEATS[index].x * (1-travel) + enemy.x * travel : enemy.x;
        const z = index >= 0 ? SEATS[index].z * (1-travel) + enemy.z * travel : enemy.z;
        const p = screen(x,z);
        const hand = ['left-hand','echo-0'].includes(enemy.id) ? 'left-hand' : ['right-hand','echo-1'].includes(enemy.id) ? 'right-hand' : null;
        if (!hand && index < 0) return null;
        const size = 4.3 + (1-travel)*7;
        return <g key={enemy.id} transform={`translate(${p.x} ${p.y})`}>
          <ellipse rx="1.8" ry=".68" fill="#08090d"/>
          {hand ? <Carving part={hand} x={0} y={0} size={5.3}/> : <image href={`/assets/logos/${RUSH_ART[index%3]}.svg`} x={-size/2} y={-size} width={size} height={size}/>}
          {selectedTarget === enemy.id && <ellipse rx="2.25" ry=".93" fill="none" stroke="#ffcf81" strokeWidth=".2"/>}
        </g>;
      })}
      {crown && state.enemies.filter(enemy=>enemy.hp>0).map(enemy => {
        const p = screen(enemy.x,enemy.z), color=enemy.kind==='storm-shard'?'#c0a8ff':'#96b8c8';
        return <g key={enemy.id} transform={`translate(${p.x} ${p.y})`} opacity={(enemy.emergeRemaining??0)>0?.55:1}>
          <path d="M-1 0 -.8 -1.75 .3 -2.75 1.1 -.65 .4 .1Z" fill={color} stroke="#d9d5df" strokeWidth=".12"/>
          {selectedTarget===enemy.id&&<ellipse rx="1.6" ry=".65" fill="none" stroke="#ffcf81" strokeWidth=".18"/>}
        </g>;
      })}
      {state.party.map((actor,i) => {
        const p = screen(actor.x, actor.z);
        return <g key={actor.id} transform={`translate(${p.x} ${p.y})`} opacity={actor.hp > 0 ? 1 : .38}>
          {(i===slot||i===selectedAlly) && <ellipse rx="1.65" ry="1.18" fill="none" stroke={i===slot?'#f9ebc3':'#8df7d6'} strokeWidth=".19"/>}
          <circle r="1.12" fill="#11151f" stroke={actor.color} strokeWidth=".16"/>
          <svg x="-.79" y="-.79" width="1.58" height="1.58" viewBox="0 0 16 16" color={actor.color}><Icon name={actor.role}/></svg>
          <text className="vector-name" x="0" y="-1.75">{actor.name}</text>
          {actor.hp < actor.maxHp && <path d={`M-1.25 1.54h${2.5*actor.hp/actor.maxHp}`} stroke={actor.color} strokeWidth=".2"/>}
        </g>;
      })}
    </svg>
  </div>;
}
