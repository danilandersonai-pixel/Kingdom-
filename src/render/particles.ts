// Частицы: искры костра, пыль из-под копыт, дым, щепки, блеск монет,
// светлячки и листья. Координаты мировые: x — вдоль острова, y — высота.

import { fxRng } from '../engine/rng';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  gravity: number;
  drag: number;
  /** Светится ночью (рисуется поверх затемнения). */
  emissive: boolean;
  fade: boolean;
  wobble: number;
  /** Падает до земли и лежит. */
  settle: boolean;
}

export class Particles {
  readonly list: Particle[] = [];
  max = 900;

  spawn(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({
      vx: 0,
      vy: 0,
      life: 1,
      max: 1,
      size: 1,
      color: '#fff',
      gravity: 0,
      drag: 0,
      emissive: false,
      fade: true,
      wobble: 0,
      settle: false,
      ...p,
    });
  }

  burst(x: number, y: number, n: number, opts: Partial<Particle> & { speed?: number; spread?: number; up?: number }): void {
    const speed = opts.speed ?? 30;
    const spread = opts.spread ?? Math.PI;
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (fxRng.next() - 0.5) * spread;
      const s = speed * (0.4 + fxRng.next() * 0.8);
      const life = (opts.life ?? 0.6) * (0.6 + fxRng.next() * 0.8);
      this.spawn({ ...opts, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + (opts.up ?? 0), life, max: life });
    }
  }

  update(dt: number): void {
    const l = this.list;
    let w = 0;
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.gravity * dt;
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      if (p.wobble) p.vx += Math.sin(p.life * 6 + p.x) * p.wobble * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y < 0) {
        if (p.settle) {
          p.y = 0;
          p.vx = 0;
          p.vy = 0;
        } else if (p.gravity > 0) {
          p.life = 0;
          continue;
        }
      }
      l[w++] = p;
    }
    l.length = w;
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, w: number, groundY: number, emissive: boolean): void {
    const left = camX - w / 2;
    for (const p of this.list) {
      if (p.emissive !== emissive) continue;
      const sx = Math.round(p.x - left);
      if (sx < -4 || sx > w + 4) continue;
      const sy = Math.round(groundY - p.y);
      const a = p.fade ? Math.max(0, Math.min(1, (p.life / p.max) * 1.4)) : 1;
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const s = Math.max(1, Math.round(p.size));
      ctx.fillRect(sx - (s >> 1), sy - (s >> 1), s, s);
    }
    ctx.globalAlpha = 1;
  }
}
