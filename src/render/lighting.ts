// Освещение: ночью объекты мира затемняются, а вокруг огня, факелов
// и монарха остаются тёплые пятна света с мягким ореолом.

import { makeCanvas, rgb, type RGB } from '../engine/sprite';
import type { Atmosphere } from './atmosphere';

export interface Light {
  /** Мировая координата X. */
  x: number;
  /** Высота над землёй. */
  y: number;
  radius: number;
  color: RGB;
  intensity: number;
  /** Мерцание огня (0..1). */
  flicker?: number;
  /** Рисовать ли тёплый ореол поверх фона. */
  halo?: boolean;
}

export class Lighting {
  private dark: HTMLCanvasElement;
  private dctx: CanvasRenderingContext2D;

  constructor(w: number, h: number) {
    [this.dark, this.dctx] = makeCanvas(w, h);
  }

  resize(w: number, h: number): void {
    [this.dark, this.dctx] = makeCanvas(w, h);
  }

  /** Затемняет мир (только там, где есть пиксели объектов). */
  apply(worldCtx: CanvasRenderingContext2D, lights: Light[], a: Atmosphere, camX: number, groundY: number, w: number, h: number, time: number): void {
    if (a.overlayAlpha < 0.01) return;
    const d = this.dctx;
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, w, h);
    d.fillStyle = rgb(a.overlay, a.overlayAlpha);
    d.fillRect(0, 0, w, h);
    d.globalCompositeOperation = 'destination-out';
    const left = camX - w / 2;
    const lit: Array<[Light, number, number, number, number]> = [];
    for (const l of lights) {
      const sx = l.x - left;
      if (sx < -l.radius || sx > w + l.radius) continue;
      const sy = groundY - l.y;
      const fl = l.flicker ? 1 - l.flicker * 0.5 + Math.sin(time * 13 + l.x) * 0.25 * l.flicker + Math.sin(time * 7.3 + l.x * 0.3) * 0.25 * l.flicker : 1;
      const r = l.radius * (0.94 + 0.06 * fl);
      // Свет не возвращает полдень: в пятне остаётся немного ночи.
      const k = Math.min(0.86, l.intensity * a.glow * fl);
      if (k <= 0.01) continue;
      const g = d.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, `rgba(0,0,0,${k.toFixed(3)})`);
      g.addColorStop(0.55, `rgba(0,0,0,${(k * 0.65).toFixed(3)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g;
      d.fillRect(sx - r, sy - r, r * 2, r * 2);
      lit.push([l, sx, sy, r, k]);
    }
    // Тёплый отсвет: освещённое пятно окрашено цветом огня, а не дневным светом.
    d.globalCompositeOperation = 'source-over';
    for (const [l, sx, sy, r, k] of lit) {
      const rr = r * 0.75;
      const g = d.createRadialGradient(sx, sy, 0, sx, sy, rr);
      g.addColorStop(0, rgb(l.color, 0.14 * k));
      g.addColorStop(1, rgb(l.color, 0));
      d.fillStyle = g;
      d.fillRect(sx - rr, sy - rr, rr * 2, rr * 2);
    }
    worldCtx.globalCompositeOperation = 'source-atop';
    worldCtx.drawImage(this.dark, 0, 0);
    worldCtx.globalCompositeOperation = 'source-over';
  }

  /** Тот же ночной слой (с пятнами света) — поверх переднего плана у воды. */
  shade(fg: CanvasRenderingContext2D, a: Atmosphere, y: number, w: number, h: number): void {
    if (a.overlayAlpha < 0.01) return;
    fg.globalCompositeOperation = 'source-atop';
    fg.drawImage(this.dark, 0, y, w, h, 0, y, w, h);
    fg.globalCompositeOperation = 'source-over';
  }

  /** Тёплые ореолы — аддитивно поверх всего кадра. */
  halos(ctx: CanvasRenderingContext2D, lights: Light[], a: Atmosphere, camX: number, groundY: number, w: number, time: number): void {
    if (a.glow < 0.02) return;
    const left = camX - w / 2;
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (l.halo === false) continue;
      const sx = l.x - left;
      if (sx < -l.radius || sx > w + l.radius) continue;
      const sy = groundY - l.y;
      const fl = l.flicker ? 1 + Math.sin(time * 11 + l.x) * 0.12 * l.flicker : 1;
      const r = l.radius * 0.8 * fl;
      // Ореол мягкий: несколько огней рядом (костёр, факелы) не выжигают фигуры в сплошной цвет.
      const k = Math.min(0.2, 0.11 * l.intensity * a.glow * fl);
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, rgb(l.color, k));
      g.addColorStop(1, rgb(l.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
