/** Hysteresis changes resolution only after sustained load, never every frame.
 * The user's quality choice still owns shadows, geometry and effect capacities. */
export class RenderBudget {
  private ratio: number;
  private slow = 0;
  private fast = 0;
  readonly maximum: number;
  readonly minimum: number;
  constructor(quality: 'low' | 'high', deviceRatio: number) {
    this.maximum = Math.min(Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1, quality === 'high' ? 1.5 : 1);
    this.minimum = Math.min(this.maximum, quality === 'high' ? .85 : .75);
    this.ratio = this.maximum;
  }
  get pixelRatio() { return this.ratio; }
  sample(fps: number, active = true): number | null {
    if (!active || !Number.isFinite(fps) || fps <= 0) { this.slow = this.fast = 0; return null; }
    this.slow = fps < 44 ? this.slow + 1 : 0;
    this.fast = fps > 57 ? this.fast + 1 : 0;
    let next = this.ratio;
    if (this.slow >= 3) next = Math.max(this.minimum, this.ratio - .15);
    else if (this.fast >= 12) next = Math.min(this.maximum, this.ratio + .1);
    if (Math.abs(next - this.ratio) < .001) return null;
    this.ratio = Math.min(this.maximum, Math.max(this.minimum, Math.round(next * 100) / 100)); this.slow = this.fast = 0; return this.ratio;
  }
}

/** Keep idle/results at 30 Hz without the 24/25 Hz jitter of a last-frame test.
 * Combat follows the display refresh; hidden tabs never spend scene work. */
export class RenderCadence {
  private next = 0;
  private active: boolean | null = null;
  shouldRender(now: number, active: boolean, hidden = false): boolean {
    if (!Number.isFinite(now)) return false;
    if (hidden) { this.active = null; this.next = now; return false; }
    if (active || this.active !== active) {
      this.active = active; this.next = now + 1000 / 30; return true;
    }
    if (now + .25 < this.next) return false;
    const interval = 1000 / 30;
    this.next += Math.max(1, Math.floor((now - this.next) / interval) + 1) * interval;
    return true;
  }
}
