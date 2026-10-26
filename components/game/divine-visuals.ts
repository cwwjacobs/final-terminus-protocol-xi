import * as THREE from 'three';
import type { GameState } from '../../game/types.ts';
import type { ActorRig } from './actors.ts';

/** Fixed, reusable geometry for the Logos unlocks. State owns every status;
 * this layer only reads snapshots and displays confirmed combat events. */
export function createDivinePresentation(scene: THREE.Scene, rigs: ActorRig[], quality: 'low' | 'high') {
  const root = new THREE.Group(); root.name = 'divine-presentation'; scene.add(root);
  const sphere = new THREE.SphereGeometry(1, quality === 'high' ? 20 : 12, 12);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const cone = new THREE.ConeGeometry(1, 1, 12);
  const torus = new THREE.TorusGeometry(1, .025, 5, 48);
  const glow = (color: string, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const stone = new THREE.MeshStandardMaterial({ color: '#161924', metalness: .6, roughness: .3 });
  const silver = new THREE.MeshStandardMaterial({ color: '#d0dbef', emissive: '#7488a5', emissiveIntensity: .35, metalness: .9, roughness: .3 });
  const white = new THREE.MeshStandardMaterial({ color: '#f2f0e1', roughness: .8 });
  const skin = new THREE.MeshStandardMaterial({ color: '#d4b694', roughness: .65 });
  const gold = new THREE.MeshStandardMaterial({ color: '#f6d68c', metalness: .75, roughness: .35 });
  const eye = glow('#e8f4ff'), blue = glow('#b0dcff'), violet = glow('#e8b9ff'), red = glow('#ff7548'), green = glow('#a7ffdf'), yellow = glow('#ffe8a5');
  const piece = (parent: THREE.Object3D, shape: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const mesh = new THREE.Mesh(shape, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
  };
  const boltLine = (parent: THREE.Object3D, material: THREE.Material, points: number[]) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const line = new THREE.Line(geo, material); parent.add(line); return line;
  };
  const statue = () => {
    const figure = new THREE.Group();
    piece(figure, cylinder, stone, 0, .25, 0, 1.35, .5, 1.1);
    for (const sign of [-1, 1]) {
      piece(figure, sphere, stone, sign * .58, 1.65, 0, .5, 1.6, .6);
      piece(figure, sphere, stone, sign * 1.65, 4.15, .05, .48, 1.7, .55);
      piece(figure, sphere, stone, sign * 1.65, 2.6, .3, .55, .65, .6);
      piece(figure, sphere, silver, sign * 1.15, 5.1, .1, .58, .1, .6);
      piece(figure, sphere, eye, sign * .25, 6.46, .63, .14, .035, .05);
      boltLine(figure, silver, [sign * .2, 5.2, .8, sign * .5, 4.6, .86, sign * .3, 4.3, .89, sign * .8, 3.7, .64]);
      boltLine(figure, silver, [sign * 1.65, 4.9, .51, sign * 1.5, 4.2, .58, sign * 1.8, 3.4, .58]);
    }
    piece(figure, sphere, stone, 0, 4.2, 0, 1.4, 1.85, .85);
    piece(figure, cylinder, stone, 0, 5.7, 0, .4, .6, .45);
    piece(figure, sphere, stone, 0, 6.45, 0, .65, .85, .66);
    piece(figure, sphere, silver, 0, 6.13, .62, .25, .025, .035);
    return figure;
  };
  const logos = statue(); logos.name = 'Logos-black-marble'; root.add(logos);
  const echoes = [statue(), statue()]; echoes.forEach(echo => { echo.scale.setScalar(.36); root.add(echo); });
  const zeus = new THREE.Group(); zeus.name = 'Son-of-Zeus'; rigs[1].root.add(zeus);
  piece(zeus, sphere, skin, 0, 1.4, 0, .4, .5, .24);
  piece(zeus, cone, white, 0, .7, 0, .43, 1.1, .32).rotation.z = Math.PI;
  piece(zeus, cylinder, gold, 0, 1.07, 0, .41, .08, .27);
  const sash = piece(zeus, cylinder, white, -.12, 1.48, .19, .1, .68, .07); sash.rotation.z = -.5;
  for (const sign of [-1, 1]) {
    piece(zeus, sphere, skin, sign * .46, 1.4, 0, .13, .42, .14).rotation.z = sign * .2;
    piece(zeus, cylinder, gold, sign * .51, 1.14, .02, .14, .1, .15);
    piece(zeus, sphere, skin, sign * .17, .34, .02, .11, .3, .12);
    piece(zeus, sphere, gold, sign * .17, .1, .1, .13, .09, .22);
  }
  piece(zeus, sphere, skin, 0, 1.94, 0, .23, .29, .23);
  for (let i = 0; i < 9; i++) {
    const a = i / 8 * Math.PI * 2;
    piece(zeus, sphere, white, Math.sin(a) * .21, 2.06 + Math.cos(a) * .11, -.04, .11, .14, .14);
  }
  piece(zeus, cone, white, 0, 1.72, .19, .17, .4, .16).rotation.z = Math.PI;
  piece(zeus, sphere, blue, -.09, 1.97, .219, .045, .022, .025);
  piece(zeus, sphere, blue, .09, 1.97, .219, .045, .022, .025);
  boltLine(zeus, blue, [.57, 1.7, .1, .43, 1.34, .12, .64, 1.39, .12, .49, .95, .14]);
  const aura = piece(zeus, torus, blue, 0, .07, 0, .9, .9, .9); aura.rotation.x = Math.PI / 2;
  const wards = rigs.map(rig => {
    const material = glow('#a7ffdf', .12);
    const mesh = piece(rig.root, sphere, material, 0, 1.1, 0, .95, 1.25, .95);
    return mesh;
  });
  const fear = rigs.map(rig => {
    const group = new THREE.Group(); rig.root.add(group);
    const gems = Array.from({ length: 10 }, (_, i) => piece(group, sphere, yellow, Math.sin(i * Math.PI / 5) * .75, 2.2, Math.cos(i * Math.PI / 5) * .75, .045, .045, .045));
    return { group, gems };
  });
  const atom = new THREE.Group(); atom.name = 'Fission-splitting-atom'; root.add(atom);
  const nuclei = [-1, 1].map(sign => {
    const group = new THREE.Group(); atom.add(group);
    for (let i = 0; i < 7; i++) piece(group, sphere, i % 2 ? violet : blue, Math.sin(i * 2.4) * .25, Math.cos(i * 2.4) * .25, (i % 3 - 1) * .18, .21, .21, .21);
    group.userData.sign = sign; return group;
  });
  const orbitals = Array.from({ length: 3 }, (_, i) => {
    const orbital = piece(atom, torus, violet, 0, 0, 0, 1.8, 1.8, 1.8); orbital.rotation.set(i * Math.PI / 3, i * .7, 0); return orbital;
  });
  const neutrons = Array.from({ length: 12 }, () => piece(atom, sphere, blue, 0, 0, 0, .08, .08, .2));
  const splitWave = piece(atom, torus, violet, 0, -2.3, 0, 1, 1, 1); splitWave.rotation.x = Math.PI / 2;
  const fire = new THREE.Group(); root.add(fire);
  const arrows = Array.from({ length: quality === 'high' ? 36 : 20 }, (_, i) => {
    const a = i * 2.399963, r = 1 + i % 10;
    const arrow = piece(fire, cone, red, Math.sin(a) * r, 0, Math.cos(a) * r, .12, 1.3, .12);
    arrow.rotation.z = Math.PI; arrow.userData.phase = i % 7 / 7; return arrow;
  });
  const shock = piece(root, torus, blue, 0, .1, 0, 1, 1, 1); shock.rotation.x = Math.PI / 2;
  const support = rigs.map(rig => {
    const group = new THREE.Group(); root.add(group);
    const rings = [0, 1, 2].map(i => { const r = piece(group, torus, green, 0, .2 + i * .7, 0, 1, 1, 1); r.rotation.x = Math.PI / 2; return r; });
    return { group, rings, rig };
  });
  const strike = new THREE.Group(); root.add(strike);
  const lightning = boltLine(strike, blue, [0, 11, 0, -.8, 8, .1, .5, 8.3, 0, -.3, 4.4, 0, .5, 4.8, 0, 0, .2, 0]);
  const arcs = [0, 1].map(() => boltLine(root, blue, [0, 0, 0, 0, 0, 0, 0, 0, 0]));
  const burns = [0, 1, 2].map(() => {
    const group = new THREE.Group(); root.add(group);
    for (let i = 0; i < 6; i++) piece(group, cone, red, Math.sin(i) * .7, .4, Math.cos(i) * .7, .14, .8, .14);
    return group;
  });
  let atomAge = -1, rainAge = -1, shockAge = -1, supportAge = -1, boltAge = -1, arcAge = -1;
  const reset = () => { atomAge = rainAge = shockAge = supportAge = boltAge = arcAge = -1; atom.visible = fire.visible = shock.visible = strike.visible = false; support.forEach(x => { x.group.visible = false; }); arcs.forEach(x => { x.visible = false; }); };
  reset();
  return {
    zeus,
    reset,
    event(event: GameState['events'][number], state: GameState) {
      if (event.kind === 'ability') {
        if (event.source === 'fission') { atomAge = 0; atom.position.set(state.boss.x, 2.5, state.boss.z); }
        if (event.source === 'rainOfFire') { rainAge = 0; fire.position.set(state.boss.x, 0, state.boss.z); }
        if (event.source === 'thunderclap' || event.source === 'clap') { shockAge = 0; const actor = state.party[event.actor ?? 1]; shock.position.set(actor.x, .1, actor.z); }
        if (event.source === 'rejuvenator') supportAge = 0;
        if (event.source === 'lightningShock') {
          arcAge = 0;
          let previous: { x: number; z: number } = state.boss;
          state.enemies.filter(e => e.hp > 0).forEach((enemy, i) => {
            const positions = arcs[i].geometry.attributes.position as THREE.BufferAttribute;
            positions.setXYZ(0, previous.x, 1.7, previous.z); positions.setXYZ(1, (previous.x + enemy.x) / 2, 2.3, (previous.z + enemy.z) / 2 + .5); positions.setXYZ(2, enemy.x, 1.3, enemy.z);
            positions.needsUpdate = true; arcs[i].geometry.computeBoundingSphere(); previous = enemy;
          });
        }
      }
      if (event.source === 'bolt' && (event.kind === 'magic' || event.kind === 'burst')) { boltAge = 0; strike.position.set(state.boss.x, 0, state.boss.z); }
    },
    update(dt: number, state: GameState, time: number, reducedMotion: boolean) {
      logos.visible = state.encounter === 'logos'; logos.position.set(state.boss.x, 0, state.boss.z); logos.rotation.y = state.boss.facing;
      logos.rotation.z = state.boss.hp <= 0 ? -.28 : state.boss.stunRemaining > 0 ? .03 : 0;
      echoes.forEach((echo, i) => { const enemy = state.enemies[i]; echo.visible = !!enemy && enemy.hp > 0; if (enemy) { echo.position.set(enemy.x, 0, enemy.z); const target = state.party[enemy.target]; if (target) echo.rotation.y = Math.atan2(target.x - enemy.x, target.z - enemy.z); } });
      zeus.visible = state.party[1].sonOfZeus;
      rigs.forEach((rig, i) => {
        const actor = state.party[i]; wards[i].visible = actor.hp > 0 && actor.hpShield > 0;
        fear[i].group.visible = actor.hp > 0 && actor.criticalCharges > 0;
        fear[i].group.rotation.y = reducedMotion ? 0 : time * .4;
        fear[i].gems.forEach((gem, index) => { gem.visible = index < actor.criticalCharges; });
      });
      atom.visible = atomAge >= 0 && atomAge < 4.2;
      if (atom.visible) {
        atomAge += dt; const split = Math.max(0, Math.min(1, (atomAge - .8) / 1.1));
        nuclei.forEach(group => { group.position.x = group.userData.sign * (.12 + split * 3); group.rotation.y = reducedMotion ? 0 : atomAge; });
        orbitals.forEach((orbital, i) => { orbital.visible = split < .8; if (!reducedMotion) orbital.rotation.z = atomAge * (i + 1) * .7; });
        neutrons.forEach((neutron, i) => { const a = i / 12 * Math.PI * 2; neutron.visible = split > .1; neutron.position.set(Math.sin(a) * split * 10, Math.sin(i * 3) * split * 3, Math.cos(a) * split * 10); });
        splitWave.visible = split > 0; splitWave.scale.setScalar(Math.max(.1, split * 12));
      }
      fire.visible = rainAge >= 0 && rainAge < 2;
      if (fire.visible) { rainAge += dt; arrows.forEach(arrow => { arrow.position.y = 12 - ((rainAge * .9 + arrow.userData.phase) % 1) * 12; }); }
      shock.visible = shockAge >= 0 && shockAge < 1;
      if (shock.visible) { shockAge += dt; shock.scale.setScalar(reducedMotion ? 12 : 1 + shockAge * 24); }
      support.forEach(({ group, rings }, i) => { group.visible = supportAge >= 0 && supportAge < 2; group.position.set(state.party[i].x, 0, state.party[i].z); rings.forEach((ring, j) => { ring.scale.setScalar(.8 + supportAge * .3); ring.position.y = .2 + j * .7 + (reducedMotion ? 0 : supportAge * .5); }); });
      if (supportAge >= 0) supportAge += dt;
      strike.visible = boltAge >= 0 && boltAge < .6; lightning.visible = strike.visible;
      if (boltAge >= 0) boltAge += dt;
      arcs.forEach((arc, i) => { arc.visible = arcAge >= 0 && arcAge < .7 && !!state.enemies[i] && state.enemies[i].hp > 0; });
      if (arcAge >= 0) arcAge += dt;
      [state.boss, ...state.enemies].forEach((enemy, i) => { const group = burns[i]; group.visible = enemy.hp > 0 && !!enemy.burn; group.position.set(enemy.x, 0, enemy.z); group.scale.y = reducedMotion ? 1 : 1 + Math.sin(time * 7 + i) * .2; });
      burns.forEach((group, i) => { if (i > state.enemies.length) group.visible = false; });
    },
  };
}
