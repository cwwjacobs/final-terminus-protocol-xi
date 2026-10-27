import * as THREE from 'three';
import { createWardrobeOwner, wardrobeLegWeights, wardrobePiece, wardrobeRibbon, wardrobeScale, wardrobeTorsoWeights, wardrobeWrap, type WardrobePoint, type WardrobeRow } from './hero-regalia.ts';

export interface HeroDivinity {
  readonly meshCount: number;
  setActive(value: boolean): void;
  update(attack: number, alive: boolean): void;
  reset(): void;
  setWireframe(value: boolean): void;
  dispose(): void;
}

const IVORY = '#e7e2d3', FOLD = '#c8c9c2', GOLD = '#c5ad6b', SILVER = '#cbd1d0';
function material(metalness: number) {
  return new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide, emissiveIntensity: 0, metalness, roughness: metalness > .5 ? .35 : .8 });
}

function toga(s: number) {
  const p: THREE.BufferGeometry[] = [];
  const rows: WardrobeRow[] = [[1.01, .225, .25], [1.15, .24, .278], [1.29, .265, .281], [1.4, .255, .25]];
  wardrobePiece(p, wardrobeWrap(rows.map(row => row.map(n => n * s) as WardrobeRow), 0, Math.PI * 2, .012 * s), IVORY);
  // Broad folded fabric crosses one shoulder and lays against the chest.
  const diagonal: WardrobePoint[] = [[-.2, 1.5, .09], [-.16, 1.37, .25], [-.055, 1.23, .298], [.1, 1.1, .28], [.19, 1.01, .25]];
  wardrobePiece(p, wardrobeRibbon(diagonal.map(v => v.map(n => n * s) as WardrobePoint), [.07, .09, .1, .1, .07].map(n => n * s), .025 * s), IVORY);
  for (const offset of [-.045, .045]) wardrobePiece(p, wardrobeRibbon(diagonal.map(v => [(v[0] + offset) * s, v[1] * s, (v[2] + .008) * s]), [.004, .004, .004, .004, .004].map(n => n * s)), GOLD);
  return p;
}
function chiton(s: number) {
  const p: THREE.BufferGeometry[] = [], rows: WardrobeRow[] = [[1.025, .25, .255], [.88, .275, .27], [.58, .3, .275], [.3, .34, .28]];
  for (const start of [-Math.PI / 2 + .075, Math.PI / 2 + .075]) wardrobePiece(p, wardrobeWrap(rows.map(row => row.map(n => n * s) as WardrobeRow), start, start + Math.PI - .15, .018 * s, 28), IVORY);
  wardrobePiece(p, wardrobeWrap([[.33 * s, .343 * s, .284 * s], [.35 * s, .343 * s, .284 * s]], 0, Math.PI * 2, .018 * s), GOLD);
  return p;
}
function backDrape(s: number) {
  const p: THREE.BufferGeometry[] = [], points: WardrobePoint[] = [[-.16, 1.48, -.1], [-.05, 1.35, -.275], [.02, 1.1, -.3], [.03, .83, -.3], [.04, .6, -.29]];
  wardrobePiece(p, wardrobeRibbon(points.map(v => v.map(n => n * s) as WardrobePoint), [.09, .215, .22, .21, .18].map(n => n * s), .027 * s), IVORY);
  for (const sign of [-1, 1]) wardrobePiece(p, wardrobeRibbon(points.map((v, i) => [(v[0] + sign * [.08, .205, .21, .20, .17][i]) * s, v[1] * s, (v[2] - .004) * s]), [.006, .006, .006, .006, .006].map(n => n * s)), GOLD);
  return p;
}

/** Preserve the real imported exposed anatomy while removing its lion hood,
 * fur cape and armor underneath the divine toga. Only the index is filtered;
 * positions, UVs, painted material and original skin weights remain intact. */
function divineAnatomy(model: THREE.Object3D, s: number, alternate?: THREE.Object3D) {
  let original: THREE.SkinnedMesh | undefined;
  model.traverse(node => { if (!original && node instanceof THREE.SkinnedMesh && !node.name.startsWith('regalia:')) original = node; });
  if (!original) return null;
  let clean: THREE.SkinnedMesh | undefined;
  alternate?.updateWorldMatrix(true, true);
  alternate?.traverse(node => { if (!clean && node instanceof THREE.SkinnedMesh) clean = node; });
  const source = clean ?? original, g = source.geometry, p = g.attributes.position, joints = g.attributes.skinIndex, weights = g.attributes.skinWeight;
  if (!p || !joints || !weights) return null;
  const geometry = g.clone(), posed = geometry.attributes.position, normals = geometry.attributes.normal;
  const remap = new Map(original.skeleton.bones.map((bone, i) => [bone.name, i]));
  if (clean) {
    // Bind-space retargeting keeps Heracles's actual controlled skeleton and
    // animation. Bacchus supplies a clean human face/anatomy with no lion hood.
    const targetInverse = model.matrixWorld.clone().invert();
    const maps = source.skeleton.bones.map(bone => {
      const target = original!.skeleton.bones[remap.get(bone.name) ?? 0];
      return targetInverse.clone().multiply(target.matrixWorld).multiply(bone.matrixWorld.clone().invert()).multiply(source.matrixWorld);
    });
    const normalMaps = maps.map(matrix => new THREE.Matrix3().getNormalMatrix(matrix));
    const nextIndices = new Uint16Array(p.count * 4), out = new THREE.Vector3(), normal = new THREE.Vector3(), input = new THREE.Vector3(), temp = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      out.set(0, 0, 0); normal.set(0, 0, 0); input.fromBufferAttribute(p, i);
      for (let j = 0; j < 4; j++) {
        const old = joints.getComponent(i, j), weight = weights.getComponent(i, j);
        nextIndices[i * 4 + j] = remap.get(source.skeleton.bones[old]?.name) ?? 0;
        if (weight <= 0) continue;
        out.addScaledVector(temp.copy(input).applyMatrix4(maps[old]), weight);
        if (normals && g.attributes.normal) normal.addScaledVector(temp.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(normalMaps[old]), weight);
      }
      posed.setXYZ(i, out.x, out.y, out.z);
      if (normals) { normal.normalize(); normals.setXYZ(i, normal.x, normal.y, normal.z); }
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(nextIndices, 4));
  }
  const head = model.worldToLocal(model.getObjectByName('head')!.getWorldPosition(new THREE.Vector3()));
  const exposed = (index: number) => {
    const x = posed.getX(index) / s, y = posed.getY(index) / s, z = posed.getZ(index) / s;
    let arm = 0, leg = 0, face = 0;
    for (let j = 0; j < 4; j++) {
      const bone = source.skeleton.bones[joints.getComponent(index, j)]?.name ?? '', weight = weights.getComponent(index, j);
      if (/^(upper_arm|forearm|hand)_/.test(bone)) arm += weight;
      if (/^(thigh|shin|foot|toe)_/.test(bone)) leg += weight;
      if (bone === 'head' || bone === 'neck') face += weight;
    }
    const faceY = head.y / s;
    const headAndNeck = clean ? face > .5 && Math.abs(x) < .145 && y > faceY - .18 && y < faceY + .18
      : face > .6 && Math.abs(x) < .108 && y > faceY - .035 && y < faceY + .19 && z > .065;
    return (arm > .72 && y > 1.14) || (leg > .72 && y < .235 && Math.abs(x) < .36 && z > -.17) || headAndNeck;
  };
  const indices = g.index ? Array.from(g.index.array) : Array.from({ length: p.count }, (_, i) => i), filtered: number[] = [];
  for (let i = 0; i < indices.length; i += 3) if (exposed(indices[i]) && exposed(indices[i + 1]) && exposed(indices[i + 2])) filtered.push(indices[i], indices[i + 1], indices[i + 2]);
  geometry.setIndex(filtered);
  const ownedMaterials = clean ? (Array.isArray(source.material) ? source.material : [source.material]).map(m => m.clone()) : [];
  const bodyMaterial = clean ? Array.isArray(source.material) ? ownedMaterials : ownedMaterials[0] : source.material;
  const mesh = new THREE.SkinnedMesh(geometry, bodyMaterial); mesh.name = 'divinity:heracles:imported-anatomy';
  mesh.position.copy(original.position); mesh.quaternion.copy(original.quaternion); mesh.scale.copy(original.scale);
  mesh.bind(original.skeleton, original.bindMatrix); mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = original.receiveShadow;
  original.parent!.add(mesh); mesh.visible = false;
  return { original, mesh, ownedMaterials, cleanFace: !!clean, visibleBefore: original.visible };
}
function belt() {
  const p: THREE.BufferGeometry[] = [];
  wardrobePiece(p, new THREE.CylinderGeometry(.254, .255, .055, 28, 1, true), GOLD, [0, .02, .007], [1, 1, 1.055]);
  const bolt = new THREE.Shape(); bolt.moveTo(.012, .025); bolt.lineTo(-.025, -.002); bolt.lineTo(-.005, -.002); bolt.lineTo(-.015, -.029); bolt.lineTo(.026, .008); bolt.lineTo(.004, .008); bolt.closePath();
  wardrobePiece(p, new THREE.ShapeGeometry(bolt), '#e8e6cc', [0, .02, .28]); return p;
}
function greave(length: number) {
  const p: THREE.BufferGeometry[] = [], r = length * .25;
  wardrobePiece(p, new THREE.CylinderGeometry(r * .95, r * .69, length * .64, 12, 1, true), GOLD, [0, length * .52, 0]);
  for (const sign of [-1, 1]) wardrobePiece(p, new THREE.TorusGeometry(r * (sign > 0 ? .7 : .96), .006, 4, 16), IVORY, [0, length * (.52 + sign * .31), 0], [1, 1, 1], [Math.PI / 2, 0, 0]); return p;
}
function headDress(cleanFace: boolean) {
  const p: THREE.BufferGeometry[] = [];
  // Hair hugs the existing skull; the open front preserves the real face and
  // facial silhouette. Nothing here acts as a substitute head.
  wardrobePiece(p, wardrobeWrap([[.025, .145, .18], [.13, .155, .185], [.205, .135, .155], [.245, .07, .075], [.255, .018, .02]], .86, Math.PI * 2 - .86, .003, 32), SILVER);
  for (let i = 0; i < 8; i++) {
    const a = .9 + i / 7 * (Math.PI * 2 - 1.8), points: THREE.Vector3[] = [];
    for (let j = 0; j < 7; j++) {
      const t = j / 6, wave = Math.sin(t * Math.PI * 3 + i) * .009;
      points.push(new THREE.Vector3(Math.sin(a) * (.15 + wave), .205 - t * .265, Math.cos(a) * (.185 + wave)));
    }
    wardrobePiece(p, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 10, .009, 4, false), i % 2 ? '#dde1dc' : '#b6bfbd');
  }
  for (let i = 0; i < 9; i++) {
    const a = -1.25 + i / 8 * 2.5;
    wardrobePiece(p, new THREE.SphereGeometry(1, 7, 5), i % 2 ? '#dce0dc' : '#bfc8c5', [Math.sin(a) * .115, .205 + Math.cos(a) * .025, Math.cos(a) * .12], [.026, .021, .026], [.2, 0, a * .4]);
  }
  // Overlapping rounded locks give the beard volume instead of a flat chin
  // strap. Its silhouette tapers from both cheeks to the upper chest.
  const front = cleanFace ? .147 : .21;
  for (let row = 0; row < 4; row++) {
    const count = [5, 4, 3, 1][row], y = .035 - row * .055;
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * .031;
      wardrobePiece(p, new THREE.SphereGeometry(1, 7, 5), (i + row) % 2 ? '#d8ded9' : '#bac4c1', [x, y, front + Math.sin(row * .9) * .012], [.024, .043, .024], [0, 0, Math.sin(i + row) * .18]);
    }
  }
  for (const sign of [-1, 1]) {
    for (let lock = 0; lock < 3; lock++) wardrobePiece(p, wardrobeRibbon([[sign * (.1 + lock * .013), .19, .03 - lock * .026], [sign * (.135 + lock * .008), .105, .055 - lock * .026], [sign * (.12 + lock * .01), -.025 + lock * .008, .03 - lock * .026]], [.009, .012, .006]), lock % 2 ? '#b7bfbe' : '#dde1dc');
    wardrobePiece(p, wardrobeRibbon([[sign * .055, .174, .145], [sign * .025, .178, .159]], [.023, .018]), '#dce0da');
  }
  // A narrow gold laurel with flat, leaf-shaped metalwork follows the hairline.
  wardrobePiece(p, wardrobeWrap([[.178, .153, .159], [.187, .153, .159]], .52, Math.PI * 2 - .52, 0, 28), GOLD);
  for (const sign of [-1, 1]) for (let i = 0; i < 5; i++) {
    const a = sign * (.62 + i * .3), x = Math.sin(a) * .157, z = Math.cos(a) * .163;
    const leaf = new THREE.Shape(); leaf.moveTo(0, -.016); leaf.quadraticCurveTo(-.015, -.003, 0, .027); leaf.quadraticCurveTo(.015, .004, 0, -.016);
    wardrobePiece(p, new THREE.ShapeGeometry(leaf, 3), GOLD, [x, .188 + i * .002, z], [1, 1, 1], [0, a, sign * -.5]);
  }
  return p;
}

/** Seven preallocated wardrobe meshes and at most one filtered imported-body
 * draw. Togas share the original skeleton; no surrogate anatomy is generated. */
export function createHeroDivinity(id: string, model: THREE.Object3D, alternateAnatomy?: THREE.Object3D): HeroDivinity | null {
  if (id !== 'heracles' || ['hips', 'spine', 'chest', 'upper_chest', 'head', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R'].some(name => !(model.getObjectByName(name) instanceof THREE.Bone))) return null;
  const owner = createWardrobeOwner(model, 'divinity:heracles'), s = wardrobeScale(model), cloth = material(.04), gold = material(.75), hair = material(.12);
  const anatomy = divineAnatomy(model, s, alternateAnatomy);
  let active = false, disposed = false;
  try {
    owner.attach(model, 'folded-toga', toga(s), cloth, wardrobeTorsoWeights(s));
    owner.attach(model, 'pleated-chiton', chiton(s), cloth, wardrobeLegWeights(s));
    owner.attach(model, 'shoulder-drape', backDrape(s), cloth, wardrobeTorsoWeights(s));
    owner.attach(model.getObjectByName('hips')!, 'gold-belt', belt(), gold);
    for (const side of ['L', 'R']) { const bone = model.getObjectByName(`shin_${side}`)!, foot = model.getObjectByName(`foot_${side}`); owner.attach(bone, `greave-${side}`, greave(foot?.position.length() ?? .42), gold); }
    owner.attach(model.getObjectByName('head')!, 'silver-hair-beard-laurel', headDress(anatomy?.cleanFace ?? false), hair);
    owner.setVisible(false);
  } catch (error) { anatomy?.mesh.removeFromParent(); anatomy?.mesh.geometry.dispose(); anatomy?.ownedMaterials.forEach(m => m.dispose()); owner.dispose(); throw error; }
  return { meshCount: owner.meshes.length + (anatomy ? 1 : 0),
    setActive(value) { if (disposed) return; active = value; owner.setVisible(active); if (anatomy) { anatomy.original.visible = active ? false : anatomy.visibleBefore; anatomy.mesh.visible = active; } },
    update(attack, alive) { if (disposed) return; owner.setVisible(active && alive); if (anatomy) anatomy.mesh.visible = active && alive; gold.emissive.set('#a6d7e8'); gold.emissiveIntensity = active && alive && Number.isFinite(attack) ? THREE.MathUtils.clamp(attack, 0, 1) * .06 : 0; },
    reset() { if (!disposed) gold.emissiveIntensity = 0; },
    setWireframe(value) { owner.setWireframe(value); anatomy?.ownedMaterials.forEach(m => { if ('wireframe' in m) m.wireframe = value; }); },
    dispose() { if (disposed) return; disposed = true; active = false; if (anatomy) { anatomy.original.visible = anatomy.visibleBefore; anatomy.mesh.removeFromParent(); anatomy.mesh.geometry.dispose(); anatomy.ownedMaterials.forEach(m => m.dispose()); } owner.dispose(); } };
}
