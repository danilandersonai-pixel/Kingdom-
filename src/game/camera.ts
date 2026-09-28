// Камера следует за монархом и немного «забегает» вперёд по ходу движения.

import { damp } from '../engine/math';
import type { Monarch } from './entities/monarch';

export class Camera {
  x = 0;
  private lead = 0;

  snap(x: number): void {
    this.x = x;
    this.lead = 0;
  }

  follow(m: Monarch, dt: number, viewW: number, left: number, right: number, offset = 0): void {
    const want = m.moving ? m.facing * viewW * (m.galloping ? 0.2 : 0.14) : this.lead * 0.9;
    this.lead = damp(this.lead, want, 1.2, dt);
    const target = m.x + this.lead + offset;
    this.x = damp(this.x, target, 3.2, dt);
    const half = viewW / 2;
    const min = left + half - 40;
    const max = right - half + 40;
    if (min < max) this.x = Math.max(min, Math.min(max, this.x));
  }
}
