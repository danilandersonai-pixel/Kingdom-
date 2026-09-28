// Живая природа для атмосферы (без влияния на игру): светлячки летними
// ночами, листопад осенью, стаи птиц днём, рыба, выпрыгивающая из воды.

import { fxRng } from '../engine/rng';
import { blit } from '../engine/sprite';
import { animalFrames } from '../art/animals';
import type { Renderer } from './renderer';
import type { Season } from './atmosphere';

interface Bird {
  x: number;
  y: number;
  vx: number;
  phase: number;
}

interface Fish {
  x: number;
  t: number;
  dir: number;
}

export interface AmbienceInfo {
  season: Season;
  night: number;
  day: boolean;
  rain: number;
  frozen: boolean;
}

export class Ambience {
  private birds: Bird[] = [];
  private nextFlock = 8;
  private fish: Fish[] = [];
  private nextFish = 5;
  private timer = 0;

  constructor(private readonly r: Renderer) {}

  update(dt: number, info: AmbienceInfo): void {
    const r = this.r;
    this.timer += dt;
    const left = r.viewLeft;
    const w = r.w;
    // Светлячки: весна и лето, ночь.
    if ((info.season === 'summer' || info.season === 'spring') && info.night > 0.6 && info.rain < 0.3 && fxRng.chance(dt * 3)) {
      const life = fxRng.range(3, 6);
      r.particles.spawn({
        x: left + fxRng.range(0, w),
        y: fxRng.range(4, 30),
        vx: fxRng.range(-4, 4),
        vy: fxRng.range(-2, 3),
        life,
        max: life,
        color: fxRng.chance(0.5) ? '#d8ff80' : '#fff4a0',
        emissive: true,
        wobble: 16,
      });
    }
    // Листопад осенью.
    if (info.season === 'autumn' && fxRng.chance(dt * 4)) {
      const life = fxRng.range(4, 7);
      r.particles.spawn({
        x: left + fxRng.range(0, w + 60),
        y: fxRng.range(60, 110),
        vx: fxRng.range(-12, -4),
        vy: fxRng.range(-10, -6),
        life,
        max: life,
        color: fxRng.pick(['#c86a2a', '#e0a040', '#a84a22', '#d88a3a']),
        wobble: 30,
        settle: true,
        fade: false,
      });
    }
    // Стаи птиц днём.
    this.nextFlock -= dt;
    if (info.day && info.rain < 0.5 && this.nextFlock <= 0) {
      this.nextFlock = fxRng.range(25, 60);
      const dir = fxRng.sign();
      const n = fxRng.int(3, 7);
      const y = fxRng.range(18, r.horizonY * 0.5);
      for (let i = 0; i < n; i++) {
        this.birds.push({ x: dir > 0 ? -20 - i * 9 : w + 20 + i * 9, y: y + fxRng.range(-6, 6) + Math.abs(i - n / 2) * 2, vx: dir * fxRng.range(22, 28), phase: fxRng.next() });
      }
    }
    for (const b of this.birds) {
      b.x += b.vx * dt;
      b.phase += dt * 3;
    }
    this.birds = this.birds.filter((b) => b.x > -60 && b.x < w + 60);
    // Рыба выпрыгивает из воды (не зимой).
    this.nextFish -= dt;
    if (!info.frozen && this.nextFish <= 0) {
      this.nextFish = fxRng.range(8, 20);
      this.fish.push({ x: left + fxRng.range(40, w - 40), t: 0, dir: fxRng.sign() });
    }
    for (const f of this.fish) {
      const before = f.t;
      f.t += dt;
      if (before === 0 || (before < 0.9 && f.t >= 0.9)) r.ripples.push({ x: f.x + f.dir * f.t * 14, r: 5, life: 1 });
    }
    this.fish = this.fish.filter((f) => f.t < 1);
  }

  /** Птицы — в небе, позади леса. */
  drawSky(ctx: CanvasRenderingContext2D): void {
    const frames = animalFrames('bird', 'fly');
    for (const b of this.birds) {
      const f = frames[Math.floor(b.phase * 2) % frames.length];
      blit(ctx, f, Math.round(b.x), Math.round(b.y), b.vx < 0);
    }
  }

  /** Рыба — поверх воды. */
  drawWater(ctx: CanvasRenderingContext2D): void {
    const r = this.r;
    const frames = animalFrames('fish', 'idle');
    for (const f of this.fish) {
      const x = f.x + f.dir * f.t * 14;
      const y = Math.sin(f.t * Math.PI) * 12;
      blit(ctx, frames[0], r.sx(x), r.waterTop + 4 - y, f.dir < 0);
    }
  }
}
