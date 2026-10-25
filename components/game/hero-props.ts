import * as THREE from 'three';

/** Procedural weapon props for the four heroes without an authored prop.
 *
 * Bacchus's thyrsus lives in bacchus-combat.ts with its two-hand grip solver;
 * these follow the same attachment convention (the rig's hand local Y runs
 * toward the fingers, so a shaft lies along hand X) and ride whichever hand
 * the authored rig motions move. They are presentation only: no collision, no
 * combat meaning, disposed with the visual. */

export interface HeroProps {
  setWireframe(value: boolean): void;
  dispose(): void;
}

type Owned = { geometries: Set<THREE.BufferGeometry>; materials: Set<THREE.Material> };

const palette = () => ({
  wood: new THREE.MeshStandardMaterial({ color: '#4a3338', roughness: .68, metalness: .18 }),
  bronze: new THREE.MeshStandardMaterial({ color: '#cfa65c', roughness: .34, metalness: .8 }),
  dark: new THREE.MeshStandardMaterial({ color: '#2a2230', roughness: .5, metalness: .55 }),
  violet: new THREE.MeshStandardMaterial({ color: '#c9b2ff', emissive: '#7a4de0', emissiveIntensity: .55, roughness: .3, metalness: .4 }),
  pearl: new THREE.MeshStandardMaterial({ color: '#fff1d6', emissive: '#d9a24a', emissiveIntensity: .45, roughness: .3, metalness: .4 }),
  string: new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: .9, metalness: 0 }),
});

function attach(model: THREE.Object3D, bone: string, build: (group: THREE.Group, part: (g: THREE.BufferGeometry, m: THREE.Material, x?: number, y?: number, z?: number) => THREE.Mesh) => void,
  owned: Owned, pose: { rotation?: [number, number, number]; position?: [number, number, number] } = {}): THREE.Group | null {
  const hand = model.getObjectByName(bone);
  if (!(hand instanceof THREE.Bone)) return null;
  const group = new THREE.Group();
  group.name = `prop:${bone}`;
  // Shaft across the palm, as the thyrsus does; a one-handed staff rests head-up
  // when the arm hangs, which is the opposite sense from the two-hand ready grip.
  group.rotation.set(...(pose.rotation ?? [0, 0, Math.PI / 2]));
  group.position.set(...(pose.position ?? [0, .065, 0]));
  const part = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    owned.geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); return mesh;
  };
  build(group, part);
  hand.add(group);
  return group;
}

export function createHeroProps(id: string, model: THREE.Object3D): HeroProps | null {
  if (!['heracles', 'dolos', 'hecate', 'ariadne'].includes(id)) return null;
  const owned: Owned = { geometries: new Set(), materials: new Set() };
  const mats = palette();
  Object.values(mats).forEach(m => owned.materials.add(m));
  const groups: THREE.Group[] = [];
  const add = (group: THREE.Group | null) => { if (group) groups.push(group); };
  switch (id) {
    case 'heracles': {
      // Heracles's recognizable heavy club; the upper-body motion now fits
      // this single-handed grip, while the shield stays on the left forearm.
      add(attach(model, 'hand_R', (_, part) => {
        part(new THREE.CylinderGeometry(.045, .035, .65, 9), mats.wood, 0, .12);
        const head = part(new THREE.CylinderGeometry(.17, .09, .7, 7), mats.wood, 0, .78);head.rotation.y = .2;
        for (const y of [.48, .98]) part(new THREE.CylinderGeometry(y > .5 ? .16 : .105, y > .5 ? .16 : .105, .055, 9), mats.bronze, 0, y);
        part(new THREE.SphereGeometry(.17, 7, 5), mats.wood, 0, 1.1).scale.y = .7;
      }, owned));
      // Round shield on the left forearm, face outward.
      add(attach(model, 'forearm_L', (group, part) => {
        const disc = part(new THREE.CylinderGeometry(.4, .42, .035, 28), mats.dark, 0, 0, 0);
        disc.rotation.x = Math.PI / 2;
        const boss = part(new THREE.SphereGeometry(.09, 16, 12), mats.bronze, 0, 0, .04);
        boss.scale.z = .6;
        const rim = part(new THREE.TorusGeometry(.4, .025, 10, 36), mats.bronze, 0, 0, 0);
        rim.rotation.x = 0; void group;
      }, owned, { rotation: [0, 0, 0], position: [0, .13, -.09] }));
      break;
    }
    case 'dolos': {
      // Recurve bow in the left hand; the draw motion pulls the right hand back.
      add(attach(model, 'hand_L', (_, part) => {
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -.7, 0), new THREE.Vector3(0, 0, .2), new THREE.Vector3(0, .7, 0));
        part(new THREE.TubeGeometry(curve, 24, .018, 7, false), mats.wood);
        part(new THREE.CylinderGeometry(.028, .028, .2, 8), mats.dark);
        part(new THREE.CylinderGeometry(.004, .004, 1.36, 4), mats.string, 0, 0, -.05);
        for (const y of [-.71, .71]) part(new THREE.SphereGeometry(.028, 8, 6), mats.bronze, 0, y, 0);
      }, owned));
      break;
    }
    case 'hecate': {
      // Orbital staff: dark shaft, two bronze rings around a violet core.
      add(attach(model, 'hand_R', (_, part) => {
        part(new THREE.CylinderGeometry(.02, .028, 1.9, 8), mats.dark, 0, .45);
        const core = part(new THREE.IcosahedronGeometry(.1, 1), mats.violet, 0, 1.52);
        core.scale.setScalar(1.1);
        const ringA = part(new THREE.TorusGeometry(.2, .016, 10, 40), mats.bronze, 0, 1.52); ringA.rotation.x = Math.PI / 3;
        const ringB = part(new THREE.TorusGeometry(.26, .014, 10, 40), mats.bronze, 0, 1.52); ringB.rotation.x = -Math.PI / 4; ringB.rotation.y = Math.PI / 3;
        part(new THREE.SphereGeometry(.04, 10, 8), mats.bronze, 0, -.5);
      }, owned));
      break;
    }
    case 'ariadne': {
      // Thread staff: pale shaft wound with gold, a four-point star at the tip.
      add(attach(model, 'hand_R', (_, part) => {
        part(new THREE.CylinderGeometry(.018, .025, 1.95, 8), mats.string, 0, .45);
        const star = part(new THREE.OctahedronGeometry(.13, 0), mats.pearl, 0, 1.58); star.scale.set(.5, 1.6, .5);
        const star2 = part(new THREE.OctahedronGeometry(.13, 0), mats.pearl, 0, 1.58); star2.scale.set(1.6, .5, .5);
        const wreath = part(new THREE.TorusGeometry(.17, .014, 8, 32), mats.bronze, 0, 1.4); wreath.rotation.x = Math.PI / 2;
        for (const y of [-.2, .2, .6, 1.0]) part(new THREE.TorusGeometry(.03, .006, 6, 16), mats.bronze, 0, y).rotation.x = Math.PI / 2;
      }, owned));
      break;
    }
    default: return null;
  }
  if (!groups.length) {
    owned.materials.forEach(material => material.dispose());
    return null;
  }
  // Named attachment is shared by the runtime particle/weapon-trail layer.
  const weaponGroup = id === 'dolos' ? groups.find(group => group.parent?.name === 'hand_L') : groups.find(group => group.parent?.name === 'hand_R');
  if (weaponGroup) {
    const tip = new THREE.Object3D();tip.name = 'hero-weapon-tip';
    tip.position.y = id === 'heracles' ? 1.18 : id === 'hecate' ? 1.52 : id === 'ariadne' ? 1.58 : 0;
    weaponGroup.add(tip);
  }
  return {
    setWireframe(value) { owned.materials.forEach(m => { (m as THREE.MeshStandardMaterial).wireframe = value; }); },
    dispose() {
      groups.forEach(group => group.removeFromParent());
      owned.geometries.forEach(g => g.dispose()); owned.materials.forEach(m => m.dispose());
      owned.geometries.clear(); owned.materials.clear();
    },
  };
}
