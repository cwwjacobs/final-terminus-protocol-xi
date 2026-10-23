import * as THREE from 'three';
import { CombatNumberPool, type CombatNumber } from './world-feedback.ts';
import { GLYPH_EM, GLYPH_HEIGHT, GLYPH_TOP, MAX_GLYPHS_PER_NUMBER, glyphDefinitions, layoutGlyphs, type GlyphKey } from './combat-glyphs.ts';

const SVG = 'http://www.w3.org/2000/svg';
const colors: Record<CombatNumber['tone'], { face: string; depth: string }> = {
  damage: { face: '#fff0ce', depth: '#8c6a2a' }, hurt: { face: '#ffac9b', depth: '#8a3a2c' }, heal: { face: '#bcffdf', depth: '#2d7a58' },
  chain: { face: '#e2baff', depth: '#6b3d9c' }, burst: { face: '#bceeff', depth: '#2c6a90' },
};
/** Camera distance at which a number is drawn at its base size; the default follow distance. */
const REFERENCE_DISTANCE = 12;
const MIN_SCALE = .7, MAX_SCALE = 1.4;
/** Spawn punch: the number lands at PUNCH× size and settles over PUNCH_TIME seconds. */
const PUNCH_TIME = .18;
/** Fake extrusion offset of the depth layer, in em units. */
const DEPTH_X = 14, DEPTH_Y = 18;
let instances = 0;

/** Depth cue for a projected world point: nearer hits read larger, far ones
 * smaller, bounded so numbers stay legible at any zoom. Pure. */
export function depthScale(distance: number): number {
  if (!Number.isFinite(distance) || distance <= 0) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, REFERENCE_DISTANCE / distance));
}

/** Spawn punch factor over the number's age; 1 once settled. Pure. */
export function punchScale(age: number, tone: CombatNumber['tone'], reducedMotion: boolean): number {
  if (reducedMotion || !Number.isFinite(age) || age >= PUNCH_TIME) return 1;
  const peak = tone === 'burst' || tone === 'chain' ? 1.6 : 1.3;
  const t = Math.max(0, age) / PUNCH_TIME;
  return 1 + (peak - 1) * (1 - t) * (1 - t);
}

/** One DOM layer and fixed reusable nodes. Numbers are vector outlines: a
 * single hidden <defs> holds the glyph set and every label is an <svg> with a
 * fixed set of <use> nodes in two layers (a dark depth slab and the face), so
 * a new number only rewrites hrefs and x offsets. Each frame sets one
 * transform: projection, depth scale, spawn punch and a tilt that follows the
 * camera pitch so numbers sit in the world plane rather than on the glass.
 * No per-hit canvas textures, React renders, layout reads or GPU
 * allocations. Owner disposes it with the scene. */
export class FloatingFeedback {
  readonly pool: CombatNumberPool;
  private readonly layer: HTMLDivElement;
  private readonly labels: SVGSVGElement[];
  private readonly faces: SVGUseElement[][];
  private readonly depths: SVGUseElement[][];
  private readonly ids: number[];
  private readonly glyphId: (key: GlyphKey) => string;
  private readonly point = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();

  constructor(host: HTMLElement, capacity: number) {
    this.pool = new CombatNumberPool(capacity);
    this.layer = document.createElement('div');
    this.layer.dataset.combatFeedback = 'true'; this.layer.setAttribute('aria-hidden', 'true');
    this.layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;perspective:900px';
    const definitions = glyphDefinitions(`combat-glyph-${instances++}`);
    this.glyphId = definitions.id;
    const sheet = document.createElementNS(SVG, 'svg');
    sheet.setAttribute('width', '0'); sheet.setAttribute('height', '0'); sheet.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    const defs = document.createElementNS(SVG, 'defs');
    for (const entry of definitions.entries) {
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('id', entry.id); path.setAttribute('d', entry.d); defs.appendChild(path);
    }
    sheet.appendChild(defs); this.layer.appendChild(sheet);
    this.ids = this.pool.slots.map(() => -1);
    this.faces = []; this.depths = [];
    this.labels = this.pool.slots.map(() => {
      const label = document.createElementNS(SVG, 'svg');
      label.dataset.combatNumber = 'true';
      label.style.cssText = 'position:absolute;left:0;top:0;opacity:0;overflow:visible;stroke:#020610;stroke-width:70;stroke-linejoin:round;paint-order:stroke;filter:drop-shadow(0 3px 3px #02061099);will-change:transform,opacity;transform-origin:50% 100%';
      const depth = document.createElementNS(SVG, 'g'), face = document.createElementNS(SVG, 'g');
      depth.setAttribute('transform', `translate(${DEPTH_X} ${DEPTH_Y})`); depth.dataset.layer = 'depth'; face.dataset.layer = 'face';
      const uses: SVGUseElement[] = [], shadows: SVGUseElement[] = [];
      for (let i = 0; i < MAX_GLYPHS_PER_NUMBER; i++) {
        const shadow = document.createElementNS(SVG, 'use'), use = document.createElementNS(SVG, 'use');
        shadow.style.display = 'none'; use.style.display = 'none';
        depth.appendChild(shadow); face.appendChild(use); shadows.push(shadow); uses.push(use);
      }
      label.appendChild(depth); label.appendChild(face);
      this.depths.push(shadows); this.faces.push(uses); this.layer.appendChild(label); return label;
    });
    host.appendChild(this.layer);
  }

  spawn(feedback: CombatNumber, position: { x: number; y: number; z: number }): void {
    this.pool.spawn(feedback, position);
  }

  private write(index: number, feedback: CombatNumber): void {
    const label = this.labels[index], layout = layoutGlyphs(feedback.text), tone = colors[feedback.tone];
    const em = feedback.tone === 'burst' || feedback.tone === 'chain' ? 21 : 19;
    label.dataset.value = feedback.text;
    label.setAttribute('viewBox', `0 ${GLYPH_TOP} ${layout.width + DEPTH_X} ${GLYPH_HEIGHT + DEPTH_Y}`);
    label.setAttribute('width', ((layout.width + DEPTH_X) * em / GLYPH_EM).toFixed(1));
    label.setAttribute('height', ((GLYPH_HEIGHT + DEPTH_Y) * em / GLYPH_EM).toFixed(1));
    const face = this.faces[index], depth = this.depths[index];
    face.forEach((use, i) => {
      const key = layout.keys[i], shadow = depth[i];
      if (key === undefined) { use.style.display = 'none'; shadow.style.display = 'none'; return; }
      const href = `#${this.glyphId(key)}`, x = String(layout.x[i]);
      use.setAttribute('href', href); use.setAttribute('x', x); use.style.display = ''; use.style.fill = tone.face;
      shadow.setAttribute('href', href); shadow.setAttribute('x', x); shadow.style.display = ''; shadow.style.fill = tone.depth;
    });
  }

  update(dt: number, camera: THREE.Camera, width: number, height: number, reducedMotion: boolean): void {
    this.pool.update(dt); camera.getWorldDirection(this.direction);
    const tilt = reducedMotion ? 0 : -Math.asin(Math.max(-1, Math.min(1, this.direction.y))) * .55;
    this.pool.slots.forEach((slot, index) => {
      const label = this.labels[index], feedback = slot.feedback;
      if (!feedback) { label.style.opacity = '0'; this.ids[index] = -1; return; }
      if (this.ids[index] !== feedback.id) { this.write(index, feedback); this.ids[index] = feedback.id; }
      const progress = slot.age / this.pool.duration;
      this.point.set(slot.x, slot.y + (reducedMotion ? 0 : progress * .65), slot.z);
      this.delta.copy(this.point).sub(camera.position);
      const inFront = this.delta.dot(this.direction) > 0, distance = this.delta.length();
      this.point.project(camera);
      const visible = inFront && this.point.z >= -1 && this.point.z < 1 && Math.abs(this.point.x) < 1 && Math.abs(this.point.y) < 1;
      label.style.opacity = visible ? String(Math.min(1, (1 - progress) * 4)) : '0';
      const column = slot.lane % 3 === 0 ? 0 : slot.lane % 3 === 1 ? -1 : 1, row = Math.floor(slot.lane / 3);
      const scale = depthScale(distance) * punchScale(slot.age, feedback.tone, reducedMotion);
      label.style.transform = `translate3d(${(this.point.x * .5 + .5) * width + column * 46}px,${(-this.point.y * .5 + .5) * height - row * 25}px,0) translate(-50%,-100%) rotateX(${tilt.toFixed(3)}rad) scale(${scale.toFixed(3)})`;
    });
  }

  reset(): void {
    this.pool.reset(); this.ids.fill(-1);
    this.labels.forEach(label => { label.style.opacity = '0'; });
  }

  dispose(): void { this.reset(); this.layer.remove(); }
}
