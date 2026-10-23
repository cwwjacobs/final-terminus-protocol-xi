import * as THREE from 'three';
import { CombatNumberPool, type CombatNumber } from './world-feedback.ts';

const colors: Record<CombatNumber['tone'], string> = {
  damage: '#fff0ce', hurt: '#ffac9b', heal: '#bcffdf', chain: '#e2baff', burst: '#bceeff',
};

/** One DOM layer and fixed reusable nodes. No per-hit canvas textures, React
 * renders, layout reads or GPU allocations. Owner disposes it with the scene. */
export class FloatingFeedback {
  readonly pool: CombatNumberPool;
  private readonly layer: HTMLDivElement;
  private readonly labels: HTMLDivElement[];
  private readonly ids: number[];
  private readonly point = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();

  constructor(host: HTMLElement, capacity: number) {
    this.pool = new CombatNumberPool(capacity);
    this.layer = document.createElement('div');
    this.layer.dataset.combatFeedback = 'true'; this.layer.setAttribute('aria-hidden', 'true');
    this.layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none';
    this.ids = this.pool.slots.map(() => -1);
    this.labels = this.pool.slots.map(() => {
      const label = document.createElement('div');
      label.style.cssText = 'position:absolute;left:0;top:0;opacity:0;white-space:nowrap;font:700 19px/1.1 Arial,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:.015em;text-shadow:0 2px 3px #020610,0 0 5px #020610,1px 0 #020610,-1px 0 #020610;will-change:transform,opacity';
      this.layer.appendChild(label); return label;
    });
    host.appendChild(this.layer);
  }

  spawn(feedback: CombatNumber, position: { x: number; y: number; z: number }): void {
    this.pool.spawn(feedback, position);
  }

  update(dt: number, camera: THREE.Camera, width: number, height: number, reducedMotion: boolean): void {
    this.pool.update(dt); camera.getWorldDirection(this.direction);
    this.pool.slots.forEach((slot, index) => {
      const label = this.labels[index], feedback = slot.feedback;
      if (!feedback) { label.style.opacity = '0'; this.ids[index] = -1; return; }
      if (this.ids[index] !== feedback.id) {
        label.textContent = feedback.text; label.style.color = colors[feedback.tone];
        label.style.fontSize = feedback.tone === 'burst' || feedback.tone === 'chain' ? '20px' : '18px';
        this.ids[index] = feedback.id;
      }
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
