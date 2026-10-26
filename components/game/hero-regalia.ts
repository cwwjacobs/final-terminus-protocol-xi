import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Small, opaque, bone-bound additions to the painted heroes. Each attachment
 * merges its colored metal, inset and gem pieces into one draw call. No lights,
 * textures, skeleton edits or animation channels are introduced. */
export interface HeroRegalia {
  readonly meshCount: number;
  update(attack: number, alive: boolean): void;
  reset(): void;
  setWireframe(value: boolean): void;
  dispose(): void;
}

interface Look { metal: string; dark: string; gem: string; shoulder: number; motif: 'lion' | 'vine' | 'falcon' | 'moon' | 'thread' }
const LOOKS: Record<string, Look> = {
  heracles: { metal: '#c8a56a', dark: '#26384b', gem: '#a5deff', shoulder: .175, motif: 'lion' },
  bacchus: { metal: '#c5a16b', dark: '#303e37', gem: '#c6e7b0', shoulder: .148, motif: 'vine' },
  dolos: { metal: '#ab966c', dark: '#263b42', gem: '#a7e8d7', shoulder: .14, motif: 'falcon' },
  hecate: { metal: '#b5adcd', dark: '#3b294c', gem: '#d2b0ff', shoulder: .122, motif: 'moon' },
  ariadne: { metal: '#dac792', dark: '#c5c9c3', gem: '#e7fff1', shoulder: .12, motif: 'thread' },
};
type V3 = [number, number, number];

/** Each input primitive is consumed here, then replaced by one merged buffer. */
function piece(list: THREE.BufferGeometry[], primitive: THREE.BufferGeometry, color: string,
  position: V3 = [0, 0, 0], scale: V3 = [1, 1, 1], rotation: V3 = [0, 0, 0]) {
  const geometry = primitive.index ? primitive.toNonIndexed() : primitive;
  if (geometry !== primitive) primitive.dispose();
  for (const key of Object.keys(geometry.attributes)) if (!['position', 'normal'].includes(key)) geometry.deleteAttribute(key);
  geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale)));
  const tint = new THREE.Color(color), count = geometry.attributes.position.count, colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) tint.toArray(colors, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); list.push(geometry);
}

function shoulder(look: Look, sign: number) {
  const list: THREE.BufferGeometry[] = [], r = look.shoulder;
  // Y follows the upper-arm bone. A shallow faceted cap rides the shoulder,
  // while the rim runs around the arm rather than floating in world space.
  piece(list, new THREE.SphereGeometry(r, 10, 6), look.dark, [0, .055, 0], [1, 1.1, 1.12]);
  piece(list, new THREE.TorusGeometry(r, .014, 4, 16), look.metal, [0, .105, 0], [1, 1.12, 1], [Math.PI / 2, 0, 0]);
  if (look.motif === 'lion') {
    piece(list, new THREE.IcosahedronGeometry(.075, 0), look.metal, [0, .06, r], [1.1, 1.2, .6]);
    for (const x of [-.047, .047]) piece(list, new THREE.ConeGeometry(.026, .055, 4), look.metal, [x, .015, r], [1, 1, .7], [0, 0, x > 0 ? -.4 : .4]);
    piece(list, new THREE.OctahedronGeometry(.023, 0), look.gem, [0, .058, r + .05], [1.2, .65, .5]);
  } else if (look.motif === 'moon') {
    piece(list, new THREE.TorusGeometry(.072, .017, 4, 14, Math.PI * 1.5), look.metal, [0, .055, r + .015], [1, 1, 1], [0, 0, sign * .35]);
    piece(list, new THREE.OctahedronGeometry(.032, 0), look.gem, [0, .055, r + .025], [.7, 1.1, .6]);
  } else {
    // Feather / leaf / thread blades have distinct silhouettes using the same
    // inexpensive faceted primitive, all merged into the shoulder mesh.
    const count = look.motif === 'thread' ? 3 : 4;
    for (let i = 0; i < count; i++) {
      const a = (i - (count - 1) / 2) * .055;
      piece(list, new THREE.OctahedronGeometry(.045, 0), i % 2 ? look.gem : look.metal,
        [a, .05 + Math.abs(a) * .6, r + .014], [look.motif === 'vine' ? .65 : .35, 1.65, .32], [0, 0, a * -3]);
    }
  }
  return list;
}

function bracer(look: Look, length: number) {
  const list: THREE.BufferGeometry[] = [], radius = look.shoulder * .52;
  const y = Math.max(.08, length * .6);
  piece(list, new THREE.CylinderGeometry(radius, radius * 1.2, .13, 8, 1, true), look.dark, [0, y, 0]);
  for (const offset of [-.065, .065]) piece(list, new THREE.TorusGeometry(radius * (offset > 0 ? 1 : 1.2), .009, 4, 12), look.metal, [0, y + offset, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  piece(list, new THREE.OctahedronGeometry(.032, 0), look.gem, [0, y, radius + .014], [.6, 1.35, .5]);
  return list;
}

function chest(look: Look) {
  const list: THREE.BufferGeometry[] = [];
  // The upper chest faces local +Z in these imported, metre-scale rigs.
  piece(list, new THREE.TorusGeometry(.145, .012, 4, 20, Math.PI), look.metal, [0, .04, .165], [1, .65, 1], [0, 0, Math.PI]);
  piece(list, new THREE.OctahedronGeometry(.065, 0), look.metal, [0, -.07, .18], [.9, 1.15, .3]);
  piece(list, new THREE.OctahedronGeometry(.037, 0), look.gem, [0, -.07, .202], [.65, 1.25, .3]);
  for (const sign of [-1, 1]) {
    piece(list, new THREE.OctahedronGeometry(.055, 0), look.metal, [sign * .095, -.025, .177], [.3, 1.6, .22], [0, 0, sign * -.65]);
  }
  return list;
}

function weapon(id: string, look: Look) {
  const list: THREE.BufferGeometry[] = [];
  if (id === 'heracles') {
    // Lightning inlay follows the round shield already fitted to forearm_L.
    const shape = new THREE.Shape(); shape.moveTo(.055, .27); shape.lineTo(-.13, .015); shape.lineTo(-.018, .015);
    shape.lineTo(-.06, -.23); shape.lineTo(.14, .075); shape.lineTo(.028, .075); shape.closePath();
    piece(list, new THREE.ShapeGeometry(shape), look.gem, [0, .13, -.061]);
  } else if (id === 'dolos') {
    for (const sign of [-1, 1]) {
      piece(list, new THREE.OctahedronGeometry(.045, 0), look.metal, [0, sign * .65, .025], [.55, 1.7, .5]);
      piece(list, new THREE.TorusGeometry(.036, .008, 4, 12), look.gem, [0, sign * .56, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    }
  } else {
    const y = id === 'bacchus' ? 1.48 : id === 'hecate' ? 1.52 : 1.42;
    piece(list, new THREE.TorusGeometry(id === 'hecate' ? .3 : .2, .009, 4, 20), look.gem, [0, y, 0], [1, 1, 1], [.65, .35, 0]);
    for (const sign of [-1, 1]) piece(list, new THREE.OctahedronGeometry(.043, 0), look.metal, [sign * .16, y - .08, 0], [.55, 1.4, .35], [0, 0, sign * -.65]);
  }
  return list;
}

export function createHeroRegalia(id: string, model: THREE.Object3D): HeroRegalia | null {
  const look = LOOKS[id]; if (!look) return null;
  const names = ['upper_arm_L', 'upper_arm_R', 'forearm_L', 'forearm_R', 'upper_chest'];
  // Partial, incompatible and placeholder rigs retain their original appearance.
  const bones = names.map(name => model.getObjectByName(name));
  if (bones.some(bone => !(bone instanceof THREE.Bone))) return null;
  const paint = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: .67, roughness: .4,
    emissive: look.gem, emissiveIntensity: .015 });
  const meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  let disposed = false;
  const attach = (parent: THREE.Object3D, label: string, pieces: THREE.BufferGeometry[]) => {
    const geometry = mergeGeometries(pieces, false); pieces.forEach(part => part.dispose());
    if (!geometry) throw new Error('Hero regalia geometry could not merge');
    const mesh = new THREE.Mesh(geometry, paint); mesh.name = `regalia:${id}:${label}`;
    mesh.castShadow = false; mesh.receiveShadow = true; parent.add(mesh); meshes.push(mesh);
  };
  try {
    attach(bones[0]!, 'shoulder-L', shoulder(look, -1)); attach(bones[1]!, 'shoulder-R', shoulder(look, 1));
    for (let i = 2; i < 4; i++) {
      const hand = model.getObjectByName(i === 2 ? 'hand_L' : 'hand_R');
      attach(bones[i]!, i === 2 ? 'bracer-L' : 'bracer-R', bracer(look, hand?.position.length() ?? .3));
    }
    attach(bones[4]!, 'gorget', chest(look));
    const prop = model.getObjectByName(id === 'bacchus' ? 'bacchus-thyrsus' : id === 'heracles' ? 'forearm_L' : id === 'dolos' ? 'prop:hand_L' : 'prop:hand_R');
    if (prop) attach(prop, id === 'heracles' ? 'shield-inlay' : 'weapon-inlay', weapon(id, look));
  } catch (error) {
    meshes.forEach(mesh => { mesh.removeFromParent(); mesh.geometry.dispose(); }); paint.dispose(); throw error;
  }
  return {
    meshCount: meshes.length,
    update(attack, alive) { if (!disposed) paint.emissiveIntensity = alive ? .015 + (Number.isFinite(attack) ? THREE.MathUtils.clamp(attack, 0, 1) : 0) * .1 : 0; },
    reset() { if (!disposed) paint.emissiveIntensity = .015; },
    setWireframe(value) { if (!disposed) paint.wireframe = value; },
    dispose() { if (disposed) return; disposed = true; meshes.forEach(mesh => { mesh.removeFromParent(); mesh.geometry.dispose(); }); paint.dispose(); },
  };
}
