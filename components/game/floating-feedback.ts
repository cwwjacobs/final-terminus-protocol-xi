import * as THREE from 'three';
import { CombatNumberPool, type CombatNumber } from './world-feedback.ts';
import { GLYPH_EM, GLYPH_HEIGHT, GLYPH_TOP, MAX_GLYPHS_PER_NUMBER, glyphDefinitions, layoutGlyphs, type GlyphKey } from './combat-glyphs.ts';

const SVG = 'http://www.w3.org/2000/svg';
const colors: Record<CombatNumber['tone'], string> = {
  damage: '#fff0ce', hurt: '#ffac9b', heal: '#bcffdf', chain: '#e2baff', burst: '#bceeff',
};
let instances = 0;

/** One DOM layer and fixed reusable nodes. Numbers are vector outlines: a
 * single hidden <defs> holds the glyph set and every label is an <svg> with a
 * fixed set of <use> nodes, so a new number only rewrites hrefs and x offsets.
 * No per-hit canvas textures, React renders, layout reads or GPU allocations.
 * Owner disposes it with the scene. */
export class FloatingFeedback {
  readonly pool: CombatNumberPool;
  private readonly layer: HTMLDivElement;
  private readonly labels: SVGSVGElement[];
  private readonly uses: SVGUseElement[][];
  private readonly ids: number[];
  private readonly glyphId: (key: GlyphKey) => string;
  private readonly point = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();

  constructor(host: HTMLElement, capacity: number) {
    this.pool = new CombatNumberPool(capacity);
    this.layer = document.createElement('div');
    this.layer.dataset.combatFeedback = 'true'; this.layer.setAttribute('aria-hidden', 'true');
    this.layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none';
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
    this.uses = [];
    this.labels = this.pool.slots.map(() => {
      const label = document.createElementNS(SVG, 'svg');
      label.dataset.combatNumber = 'true';
      label.style.cssText = 'position:absolute;left:0;top:0;opacity:0;overflow:visible;stroke:#020610;stroke-width:70;stroke-linejoin:round;paint-order:stroke;filter:drop-shadow(0 2px 2px #020610);will-change:transform,opacity';
      const uses: SVGUseElement[] = [];
      for (let i = 0; i < MAX_GLYPHS_PER_NUMBER; i++) {
        const use = document.createElementNS(SVG, 'use');
        use.style.display = 'none'; label.appendChild(use); uses.push(use);
      }
      this.uses.push(uses); this.layer.appendChild(label); return label;
    });
    host.appendChild(this.layer);
  }

  spawn(feedback: CombatNumber, position: { x: number; y: number; z: number }): void {
    this.pool.spawn(feedback, position);
  }

  private write(index: number, feedback: CombatNumber): void {
    const label = this.labels[index], layout = layoutGlyphs(feedback.text);
    const em = feedback.tone === 'burst' || feedback.tone === 'chain' ? 21 : 19;
    label.dataset.value = feedback.text;
    label.setAttribute('viewBox', `0 ${GLYPH_TOP} ${layout.width} ${GLYPH_HEIGHT}`);
    label.setAttribute('width', (layout.width * em / GLYPH_EM).toFixed(1));
    label.setAttribute('height', (GLYPH_HEIGHT * em / GLYPH_EM).toFixed(1));
    label.style.fill = colors[feedback.tone];
    this.uses[index].forEach((use, i) => {
      const key = layout.keys[i];
      if (key === undefined) { use.style.display = 'none'; return; }
      use.setAttribute('href', `#${this.glyphId(key)}`); use.setAttribute('x', String(layout.x[i])); use.style.display = '';
    });
  }

  update(dt: number, camera: THREE.Camera, width: number, height: number, reducedMotion: boolean): void {
    this.pool.update(dt); camera.getWorldDirection(this.direction);
    this.pool.slots.forEach((slot, index) => {
      const label = this.labels[index], feedback = slot.feedback;
      if (!feedback) { label.style.opacity = '0'; this.ids[index] = -1; return; }
      if (this.ids[index] !== feedback.id) { this.write(index, feedback); this.ids[index] = feedback.id; }
      const progress = slot.age / this.pool.duration;
      this.point.set(slot.x, slot.y + (reducedMotion ? 0 : progress * .65), slot.z);
      const inFront = this.delta.copy(this.point).sub(camera.position).dot(this.direction) > 0;
      this.point.project(camera);
      const visible = inFront && this.point.z >= -1 && this.point.z < 1 && Math.abs(this.point.x) < 1 && Math.abs(this.point.y) < 1;
      label.style.opacity = visible ? String(Math.min(1, (1 - progress) * 4)) : '0';
      const column = slot.lane % 3 === 0 ? 0 : slot.lane % 3 === 1 ? -1 : 1, row = Math.floor(slot.lane / 3);
      label.style.transform = `translate3d(${(this.point.x * .5 + .5) * width + column * 46}px,${(-this.point.y * .5 + .5) * height - row * 25}px,0) translate(-50%,-100%)`;
    });
  }

  reset(): void {
    this.pool.reset(); this.ids.fill(-1);
    this.labels.forEach(label => { label.style.opacity = '0'; });
  }

  dispose(): void { this.reset(); this.layer.remove(); }
}
