// Погода: дождь и снег в экранных координатах, с кругами на воде.

import { fxRng } from '../engine/rng';
import type { Ripple } from './water';

interface Drop {
  x: number;
  y: number;
  v: number;
  len: number;
}

export type WeatherKind = 'clear' | 'rain' | 'snow';

export class Weather {
  kind: WeatherKind = 'clear';
  /** 0..1 — текущая сила осадков (плавно меняется). */
  intensity = 0;
  target = 0;
  private drops: Drop[] = [];
  /** Брызги капель на земле: x, y, возраст. */
  private splashes: Array<[number, number, number]> = [];
  wind = -0.3;

  set(kind: WeatherKind, strength: number): void {
    if (kind !== this.kind && this.intensity > 0.05) {
      // Сначала затихает текущая погода.
      this.target = 0;
      this.pending = { kind, strength };
      return;
    }
    this.kind = kind;
    this.target = kind === 'clear' ? 0 : strength;
  }

  private pending: { kind: WeatherKind; strength: number } | null = null;

  update(dt: number, w: number, h: number, waterTop: number, camDx: number, ripples: Ripple[], camX: number, groundY = waterTop - 11): void {
    const speed = 0.25;
    if (this.intensity < this.target) this.intensity = Math.min(this.target, this.intensity + speed * dt);
    else this.intensity = Math.max(this.target, this.intensity - speed * dt);
    if (this.pending && this.intensity <= 0.02) {
      this.kind = this.pending.kind;
      this.target = this.kind === 'clear' ? 0 : this.pending.strength;
      this.pending = null;
    }

    const want = Math.floor(this.intensity * (this.kind === 'rain' ? 260 : 160) * (w / 480));
    while (this.drops.length < want) {
      this.drops.push({ x: fxRng.range(-40, w + 40), y: fxRng.range(-h, 0), v: fxRng.range(0.8, 1.2), len: fxRng.int(3, 6) });
    }
    if (this.drops.length > want) this.drops.length = want;

    const rain = this.kind === 'rain';
    for (const s of this.splashes) {
      s[2] += dt;
      s[0] -= camDx * dt;
    }
    this.splashes = this.splashes.filter((s) => s[2] < 0.16);
    for (const d of this.drops) {
      if (rain) {
        d.y += 230 * d.v * dt;
        d.x += (this.wind * 90 * d.v - camDx * 0.2) * dt;
      } else {
        d.y += 22 * d.v * dt;
        d.x += (Math.sin(d.y * 0.05 + d.v * 10) * 10 + this.wind * 12 - camDx * 0.15) * dt;
      }
      // Часть капель падает на землю (брызги), остальные — в реку (круги).
      const onGround = d.v < 0.9;
      const floor = onGround ? groundY + (d.v - 0.8) * 20 : waterTop + (d.v - 0.9) * 160;
      if (d.y > Math.min(h, floor)) {
        if (rain && !onGround && fxRng.chance(0.8)) {
          ripples.push({ x: camX - w / 2 + d.x, r: fxRng.range(2, 5), life: 1 });
        }
        if (rain && onGround && this.splashes.length < 60) this.splashes.push([d.x, floor, 0]);
        d.y = fxRng.range(-20, 0);
        d.x = fxRng.range(-40, w + 40);
      }
      if (d.x < -50) d.x += w + 90;
      if (d.x > w + 50) d.x -= w + 90;
    }
  }

  draw(ctx: CanvasRenderingContext2D, nightness: number): void {
    if (this.splashes.length) {
      ctx.fillStyle = nightness > 0.5 ? 'rgba(150,170,210,0.6)' : 'rgba(210,225,240,0.7)';
      for (const [x, y, t] of this.splashes) {
        const xx = Math.round(x);
        const yy = Math.round(y);
        if (t < 0.08) ctx.fillRect(xx, yy - 1, 1, 1);
        else {
          ctx.fillRect(xx - 1, yy - 2, 1, 1);
          ctx.fillRect(xx + 1, yy - 2, 1, 1);
        }
      }
    }
    if (!this.drops.length) return;
    const rain = this.kind === 'rain';
    const base = nightness > 0.5 ? '150,170,210' : '200,215,235';
    ctx.fillStyle = `rgba(${rain ? base : '245,248,255'},${rain ? 0.45 : 0.85})`;
    for (const d of this.drops) {
      const x = Math.round(d.x);
      const y = Math.round(d.y);
      if (rain) {
        for (let i = 0; i < d.len; i++) ctx.fillRect(x + Math.round(i * this.wind * 0.4), y - i, 1, 1);
      } else {
        ctx.fillRect(x, y, d.v > 1.05 ? 2 : 1, d.v > 1.05 ? 2 : 1);
      }
    }
  }
}
