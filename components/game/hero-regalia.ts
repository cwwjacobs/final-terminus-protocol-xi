import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Fitted cloth follows the imported bones. No replacement anatomy, texture
 * requests, lights, physics or animation channels. Six opaque draws per hero. */
export interface HeroRegalia {
  readonly meshCount: number;
  setVisible(value: boolean): void;
  update(attack: number, alive: boolean): void;
  reset(): void;
  setWireframe(value: boolean): void;
  dispose(): void;
}
export type WardrobePoint = [number, number, number];
export type WardrobeRow = [number, number, number];
export type WardrobeWeights = (x: number, y: number, z: number) => [string, number][];

/** Consumes every temporary primitive; merged buffers have one explicit owner. */
export function wardrobePiece(parts: THREE.BufferGeometry[], source: THREE.BufferGeometry, color: string,
  position: WardrobePoint = [0, 0, 0], scale: WardrobePoint = [1, 1, 1], rotation: WardrobePoint = [0, 0, 0]) {
  const g = source.index ? source.toNonIndexed() : source; if (g !== source) source.dispose();
  for (const key of Object.keys(g.attributes)) if (!['position', 'normal'].includes(key)) g.deleteAttribute(key);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale)));
  const colorValue = new THREE.Color(color), count = g.attributes.position.count, colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colorValue.toArray(colors, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(g);
}

/** Open-ended, pleated elliptical panels. The nearly vertical hem has side
 * slits and never uses a cone or a replacement body primitive. */
export function wardrobeWrap(rows: WardrobeRow[], start = 0, end = Math.PI * 2, pleat = .009, segments = 32) {
  const vertices: number[] = [];
  const point = (row: WardrobeRow, step: number) => {
    const a = start + (end - start) * step / segments, fold = Math.cos(a * 16) * pleat;
    return [Math.sin(a) * (row[1] + fold), row[0], Math.cos(a) * (row[2] + fold)];
  };
  for (let y = 0; y < rows.length - 1; y++) for (let i = 0; i < segments; i++) {
    const a = point(rows[y], i), b = point(rows[y], i + 1), c = point(rows[y + 1], i), d = point(rows[y + 1], i + 1);
    vertices.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.computeVertexNormals(); return g;
}

export function wardrobeRibbon(points: WardrobePoint[], widths: number[], fold = .009) {
  const vertices: number[] = [];
  const at = (i: number, side: number) => [points[i][0] + widths[i] * side, points[i][1], points[i][2] + (Math.abs(side) + Math.cos(side * Math.PI * 4)) * fold];
  for (let i = 0; i < points.length - 1; i++) for (let x = 0; x < 12; x++) {
    const s = -1 + x / 6, t = s + 1 / 6, a = at(i, s), b = at(i, t), c = at(i + 1, s), d = at(i + 1, t);
    vertices.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.computeVertexNormals(); return g;
}

export function wardrobeScale(model: THREE.Object3D) {
  model.updateWorldMatrix(true, true); const head = model.getObjectByName('head');
  return head ? THREE.MathUtils.clamp(model.worldToLocal(head.getWorldPosition(new THREE.Vector3())).y / 1.584, .85, 1.15) : 1;
}
export function wardrobeTorsoWeights(scale: number): WardrobeWeights {
  return (_x, y) => {
    const h = y / scale;
    if (h < 1.08) return [['hips', 1]];
    if (h < 1.23) { const t = (h - 1.08) / .15; return [['spine', 1 - t], ['chest', t]]; }
    const t = THREE.MathUtils.clamp((h - 1.23) / .17, 0, 1); return [['chest', 1 - t], ['upper_chest', t]];
  };
}
export function wardrobeLegWeights(scale: number): WardrobeWeights {
  return (x, y) => {
    const h = y / scale, left = THREE.MathUtils.clamp(.5 + x / (.16 * scale), 0, 1);
    const thigh = THREE.MathUtils.clamp((.96 - h) / .3, 0, 1), shin = THREE.MathUtils.clamp((.58 - h) / .25, 0, 1);
    return [['hips', 1 - thigh], ['thigh_L', thigh * (1 - shin) * left], ['thigh_R', thigh * (1 - shin) * (1 - left)], ['shin_L', thigh * shin * left], ['shin_R', thigh * shin * (1 - left)]];
  };
}

export function createWardrobeOwner(model: THREE.Object3D, prefix: string) {
  let borrowed: THREE.Skeleton | undefined;
  model.traverse(node => { if (!borrowed && node instanceof THREE.SkinnedMesh) borrowed = node.skeleton; });
  const bones: THREE.Bone[] = borrowed ? [...borrowed.bones] : [];
  if (!borrowed) model.traverse(node => { if (node instanceof THREE.Bone) bones.push(node); });
  model.updateWorldMatrix(true, true); const skeleton = borrowed ?? new THREE.Skeleton(bones);
  if (!borrowed) skeleton.calculateInverses();
  const indices = new Map(bones.map((bone, i) => [bone.name, i]));
  const meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [], paints = new Set<THREE.MeshStandardMaterial>(); let disposed = false;
  const attach = (parent: THREE.Object3D, label: string, parts: THREE.BufferGeometry[], paint: THREE.MeshStandardMaterial, weights?: WardrobeWeights) => {
    const geometry = mergeGeometries(parts, false); parts.forEach(part => part.dispose()); if (!geometry) throw new Error('Wardrobe buffers could not merge');
    let mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    if (weights) {
      const p = geometry.attributes.position, skinIndex = new Uint16Array(p.count * 4), skinWeight = new Float32Array(p.count * 4);
      for (let i = 0; i < p.count; i++) {
        const influences = weights(p.getX(i), p.getY(i), p.getZ(i)).filter(([name, weight]) => indices.has(name) && weight > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
        const total = influences.reduce((sum, entry) => sum + entry[1], 0);
        for (let j = 0; j < influences.length; j++) { skinIndex[i * 4 + j] = indices.get(influences[j][0])!; skinWeight[i * 4 + j] = influences[j][1] / total; }
        if (!total) { skinIndex[i * 4] = indices.get('hips') ?? 0; skinWeight[i * 4] = 1; }
      }
      geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4)); geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
      const garment = new THREE.SkinnedMesh(geometry, paint); garment.bind(skeleton, model.matrixWorld); garment.frustumCulled = false; mesh = garment;
    } else mesh = new THREE.Mesh(geometry, paint);
    mesh.name = `${prefix}:${label}`; mesh.castShadow = false; mesh.receiveShadow = true; parent.add(mesh); meshes.push(mesh); paints.add(paint); return mesh;
  };
  return { meshes, paints, attach,
    setVisible(value: boolean) { if (!disposed) meshes.forEach(mesh => { mesh.visible = value; }); },
    setWireframe(value: boolean) { if (!disposed) paints.forEach(paint => { paint.wireframe = value; }); },
    dispose() { if (disposed) return; disposed = true; meshes.forEach(mesh => { mesh.removeFromParent(); mesh.geometry.dispose(); }); paints.forEach(paint => paint.dispose()); if (!borrowed) skeleton.dispose(); },
  };
}

interface Look { metal: string; cloth: string; mantle: string; gem: string; hem: number; width: number; depth: number; }
const LOOKS: Record<string, Look> = {
  heracles: { metal: '#b39a69', cloth: '#6b5137', mantle: '#95774f', gem: '#bbd9e2', hem: .64, width: .28, depth: .31 },
  bacchus: { metal: '#b99e68', cloth: '#573447', mantle: '#a68b63', gem: '#c1d9ac', hem: .6, width: .25, depth: .23 },
  dolos: { metal: '#97825b', cloth: '#29352f', mantle: '#404b3b', gem: '#9ac7b6', hem: .7, width: .245, depth: .246 },
  hecate: { metal: '#aca9bd', cloth: '#292237', mantle: '#463650', gem: '#bdafe0', hem: .18, width: .25, depth: .267 },
  ariadne: { metal: '#bda66c', cloth: '#d9d2bb', mantle: '#ede6cf', gem: '#daede0', hem: .16, width: .25, depth: .245 },
};
const paint = (metalness: number) => new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, emissiveIntensity: 0, metalness, roughness: metalness > .4 ? .38 : .85, side: THREE.DoubleSide });

function torso(id: string, look: Look, s: number) {
  const p: THREE.BufferGeometry[] = [], color = id === 'heracles' ? look.metal : look.cloth;
  const rows: WardrobeRow[] = [[1.0, look.width * .83, look.depth * .88], [1.12, look.width * .88, look.depth * .95], [1.28, look.width, look.depth], [1.4, look.width, look.depth * .92]];
  const scaled = (data: WardrobeRow[]) => data.map(row => row.map(n => n * s) as WardrobeRow);
  wardrobePiece(p, wardrobeWrap(scaled(rows), 0, Math.PI * 2, id === 'heracles' ? .002 : .008), color);
  for (const y of [1.01, 1.39]) { const row = y < 1.1 ? rows[0] : rows[3]; wardrobePiece(p, wardrobeWrap(scaled([[y, row[1] + .004, row[2] + .004], [y + .018, row[1] + .004, row[2] + .004]]), 0, Math.PI * 2, .002), look.metal); }
  for (const sign of [-1, 1]) wardrobePiece(p, wardrobeRibbon([[sign * .17 * s, 1.37 * s, .21 * s], [sign * .17 * s, 1.48 * s, .08 * s], [sign * .17 * s, 1.38 * s, -.2 * s]], [.035 * s, .04 * s, .035 * s]), color);
  if (id === 'heracles') for (const sign of [-1, 1]) wardrobePiece(p, new THREE.TorusGeometry(.075 * s, .008 * s, 4, 14, Math.PI), '#c4ad7a', [sign * .1 * s, 1.26 * s, (look.depth + .006) * s], [1.15, .55, 1]);
  else wardrobePiece(p, wardrobeRibbon([[-.19 * s, 1.43 * s, .18 * s], [-.12 * s, 1.29 * s, (look.depth + .014) * s], [.02 * s, 1.13 * s, (look.depth * .95 + .014) * s], [.16 * s, 1.0 * s, (look.depth * .88 + .014) * s]], [.045 * s, .052 * s, .05 * s, .04 * s]), look.mantle);
  return p;
}
function lowerGarment(look: Look, s: number) {
  const p: THREE.BufferGeometry[] = [], h = look.hem;
  const rows: WardrobeRow[] = [[1.025, .242, .237], [.88, .273, .248], [(h + .88) / 2, .3, .252], [h, .335, .26]];
  const scaled = rows.map(row => row.map(n => n * s) as WardrobeRow);
  for (const start of [-Math.PI / 2 + .06, Math.PI / 2 + .06]) wardrobePiece(p, wardrobeWrap(scaled, start, start + Math.PI - .12, .014 * s, 24), look.cloth);
  for (const y of [1.0, h + .025]) { const row = y > .95 ? rows[0] : rows[3]; wardrobePiece(p, wardrobeWrap([[y * s, (row[1] + .005) * s, (row[2] + .005) * s], [(y + .018) * s, (row[1] + .005) * s, (row[2] + .005) * s]], 0, Math.PI * 2, .014 * s), look.metal); }
  return p;
}
function mantle(id: string, look: Look, s: number) {
  const p: THREE.BufferGeometry[] = [], points: WardrobePoint[] = [[-.16, 1.46, -.13], [-.1, 1.35, -.25], [0, 1.12, -.275], [.03, .93, -.25]];
  const widths = id === 'dolos' ? [.11, .22, .22, .18] : id === 'hecate' ? [.12, .25, .25, .23] : [.12, .23, .22, .18];
  wardrobePiece(p, wardrobeRibbon(points.map(point => point.map(n => n * s) as WardrobePoint), widths.map(n => n * s), .015 * s), look.mantle);
  if (id === 'bacchus' || id === 'heracles') for (let i = 0; i < 12; i++) { const y = 1.28 - (i % 4) * .08, x = (i < 4 ? -.16 : i < 8 ? 0 : .16) + Math.sin(i) * .01; wardrobePiece(p, new THREE.CircleGeometry((id === 'bacchus' ? .014 : .008) * s, 5), '#3d3229', [x * s, y * s, -.28 * s], [1, .65, 1], [0, Math.PI, i]); }
  else wardrobePiece(p, wardrobeRibbon([[-.17 * s, 1.46 * s, -.135 * s], [-.12 * s, 1.3 * s, -.28 * s], [-.15 * s, .95 * s, -.27 * s]], [.009 * s, .009 * s, .009 * s]), look.metal);
  return p;
}
function bracer(look: Look, length: number) {
  const p: THREE.BufferGeometry[] = [], r = length * .22, y = length * .56;
  // Shallow dorsal plates leave the inner forearm free. They do not form large
  // hollow cuffs at either wrist or elbow.
  wardrobePiece(p, new THREE.CylinderGeometry(r * .93, r, length * .38, 10, 1, true, -1.1, 2.2), look.metal, [0, y, 0]);
  for (const sign of [-1, 1]) wardrobePiece(p, new THREE.CylinderGeometry(r * (sign > 0 ? .94 : 1.01), r * (sign > 0 ? .94 : 1.01), .007, 10, 1, true, -1.1, 2.2), look.gem, [0, y + sign * length * .18, 0]); return p;
}
function weapon(id: string, look: Look) {
  const p: THREE.BufferGeometry[] = [];
  if (id === 'heracles') { const shape = new THREE.Shape(); shape.moveTo(.045, .24); shape.lineTo(-.11, .02); shape.lineTo(-.013, .02); shape.lineTo(-.05, -.2); shape.lineTo(.12, .07); shape.lineTo(.024, .07); shape.closePath(); wardrobePiece(p, new THREE.ShapeGeometry(shape), look.gem, [0, .13, -.06]); }
  else if (id === 'dolos') for (const sign of [-1, 1]) wardrobePiece(p, new THREE.TorusGeometry(.029, .006, 4, 12), look.metal, [0, sign * .59, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  else { const y = id === 'bacchus' ? 1.49 : id === 'hecate' ? 1.52 : 1.42; wardrobePiece(p, new THREE.TorusGeometry(id === 'hecate' ? .22 : .16, .007, 4, 20), look.metal, [0, y, 0], [1, 1, 1], [.65, .35, 0]); } return p;
}

export function createHeroRegalia(id: string, model: THREE.Object3D): HeroRegalia | null {
  const look = LOOKS[id]; if (!look) return null;
  if (['hips', 'spine', 'chest', 'upper_chest', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'forearm_L', 'forearm_R', 'head'].some(name => !(model.getObjectByName(name) instanceof THREE.Bone))) return null;
  const owner = createWardrobeOwner(model, `regalia:${id}`), s = wardrobeScale(model), metal = paint(.72), cloth = paint(.04);
  try {
    owner.attach(model, 'fitted-torso', torso(id, look, s), id === 'heracles' ? metal : cloth, wardrobeTorsoWeights(s));
    owner.attach(model, 'pleated-chiton', lowerGarment(look, s), cloth, wardrobeLegWeights(s));
    owner.attach(model, 'shoulder-drape', mantle(id, look, s), cloth, wardrobeTorsoWeights(s));
    for (const side of ['L', 'R']) { const forearm = model.getObjectByName(`forearm_${side}`)!, hand = model.getObjectByName(`hand_${side}`)!; owner.attach(forearm, `bracer-${side}`, bracer(look, hand.position.length()), metal); }
    const prop = model.getObjectByName(id === 'bacchus' ? 'bacchus-thyrsus' : id === 'heracles' ? 'forearm_L' : id === 'dolos' ? 'prop:hand_L' : 'prop:hand_R');
    if (prop) owner.attach(prop, id === 'heracles' ? 'shield-inlay' : 'weapon-inlay', weapon(id, look), metal);
  } catch (error) { owner.dispose(); throw error; }
  return { meshCount: owner.meshes.length, setVisible: owner.setVisible,
    update(attack, alive) { metal.emissive.set(look.gem); metal.emissiveIntensity = alive && Number.isFinite(attack) ? THREE.MathUtils.clamp(attack, 0, 1) * .025 : 0; },
    reset() { metal.emissiveIntensity = 0; }, setWireframe: owner.setWireframe, dispose: owner.dispose };
}
