// Памятные моменты: деревянная табличка в золотой рамке съезжает сверху,
// над ней — золотой салют. Как «исторические моменты» оригинала.

import { drawText, textWidth } from '../engine/font';
import { fxRng } from '../engine/rng';

interface Plaque {
  title: string;
  sub: string;
  t: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  /** Насыщенный цвет той же искры — для дневного неба. */
  deep: string;
}

const DURATION = 6;

export class Plaques {
  private queue: Plaque[] = [];
  private sparks: Spark[] = [];
  private burstT = 0;

  show(title: string, sub = ''): void {
    // Одинаковые подряд не повторяем.
    if (this.queue.some((p) => p.title === title)) return;
    this.queue.push({ title, sub, t: 0 });
  }

  get active(): boolean {
    return this.queue.length > 0;
  }

  /** Салют без таблички (экран победы): залпы по краям и над надписью. */
  celebrate(dt: number, w: number, h: number): void {
    this.burstT -= dt;
    if (this.burstT <= 0) {
      this.burstT = fxRng.range(0.18, 0.4);
      const side = fxRng.chance(0.5) ? fxRng.range(w * 0.06, w * 0.3) : fxRng.range(w * 0.7, w * 0.94);
      this.firework(fxRng.chance(0.7) ? side : fxRng.range(w * 0.3, w * 0.7), fxRng.range(h * 0.08, h * 0.3), true);
    }
  }

  /** Только искры (поверх затемнения экрана победы). */
  drawSparks(ctx: CanvasRenderingContext2D, day = false): void {
    const q = this.queue;
    this.queue = [];
    this.draw(ctx, 0, 0, day);
    this.queue = q;
  }

  update(dt: number, w: number, h: number): void {
    const p = this.queue[0];
    if (p) {
      p.t += dt;
      // Салют — первые три секунды.
      if (p.t < 3.2) {
        this.burstT -= dt;
        if (this.burstT <= 0) {
          this.burstT = fxRng.range(0.25, 0.5);
          // Слева и справа от таблички — не на верёвках и не на надписи.
          const x = fxRng.chance(0.5) ? fxRng.range(w * 0.08, w * 0.28) : fxRng.range(w * 0.72, w * 0.92);
          this.firework(x, fxRng.range(h * 0.08, h * 0.34));
        }
      }
      if (p.t > DURATION) this.queue.shift();
    }
    for (const s of this.sparks) {
      s.life -= dt;
      s.vy += 38 * dt;
      s.vx *= Math.exp(-1.4 * dt);
      s.vy *= Math.exp(-0.6 * dt);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
  }

  private firework(x: number, y: number, festive = false): void {
    const n = fxRng.int(20, 32);
    const speed = fxRng.range(34, 56);
    // Палитры залпов: золото, а на празднике победы — ещё алый, лазурь, изумруд, сирень.
    const sets = festive
      ? [['#fff6c8', '#ffe070', '#f2c84a'], ['#ffd0c0', '#ff6a4a', '#e8342a'], ['#e0f0ff', '#7ac0ff', '#3a7ad8'], ['#e0ffe8', '#6ae08a', '#2aa85a'], ['#f4e0ff', '#c88aff', '#8a4ad8']]
      : [['#fff6c8', '#ffe070', '#f2c84a'], ['#fff6c8', '#ffe070', '#f2c84a'], ['#fff6c8', '#ffe070', '#f2c84a'], ['#ffffff', '#c8e8ff', '#8ac8ff']];
    const pal = fxRng.pick(sets);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + fxRng.range(-0.1, 0.1);
      const s = speed * fxRng.range(0.75, 1.05);
      const life = fxRng.range(0.9, 1.6);
      this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color: fxRng.pick(pal), deep: fxRng.chance(0.6) ? pal[2] : pal[1] });
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, day = false): void {
    // Искры салюта: ночью складываются светом, днём — плотные цветные точки
    // (на светлом небе «свечение» выглядит бледным мусором).
    if (this.sparks.length) {
      ctx.globalCompositeOperation = day ? 'source-over' : 'lighter';
      const size = day ? 2 : 1;
      for (const s of this.sparks) {
        const a = Math.min(1, (s.life / s.max) * 1.6);
        ctx.globalAlpha = a;
        ctx.fillStyle = day ? s.deep : s.color;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), size, size);
        // Хвостик.
        ctx.globalAlpha = a * 0.4;
        ctx.fillRect(Math.round(s.x - s.vx * 0.03), Math.round(s.y - s.vy * 0.03), 1, 1);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    const p = this.queue[0];
    if (!p) return;
    // Въезд сверху, пауза, уход вверх.
    const inT = Math.min(1, p.t / 0.6);
    const outT = Math.max(0, (p.t - (DURATION - 0.7)) / 0.7);
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const offset = (1 - ease(inT)) * -60 + ease(outT) * -60;
    const bw = Math.max(textWidth(p.title, 2), textWidth(p.sub, 1)) + 28;
    const bh = p.sub ? 36 : 26;
    const x = Math.round(w / 2 - bw / 2);
    const y = Math.round(h * 0.16 + offset);
    // Верёвки.
    ctx.fillStyle = '#6a5438';
    ctx.fillRect(x + 8, y - 20, 1, 20);
    ctx.fillRect(x + bw - 9, y - 20, 1, 20);
    // Доска: золотая рамка, тёмное дерево, светлая кромка.
    ctx.fillStyle = '#2a1608';
    ctx.fillRect(x - 1, y - 1, bw + 2, bh + 2);
    ctx.fillStyle = '#c89a3a';
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = '#f2d06a';
    ctx.fillRect(x, y, bw, 1);
    ctx.fillRect(x, y, 1, bh);
    ctx.fillStyle = '#4a2c16';
    ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    ctx.fillStyle = '#5c381e';
    for (let yy = y + 4; yy < y + bh - 3; yy += 4) ctx.fillRect(x + 3, yy, bw - 6, 1);
    // Уголки-заклёпки.
    ctx.fillStyle = '#ffe070';
    for (const [cx, cy] of [[x + 3, y + 3], [x + bw - 4, y + 3], [x + 3, y + bh - 4], [x + bw - 4, y + bh - 4]]) ctx.fillRect(cx, cy, 1, 1);
    drawText(ctx, p.title, Math.round(w / 2), y + 6, { align: 'center', scale: 2, color: '#ffe070', shadow: '#1a0c04' });
    if (p.sub) drawText(ctx, p.sub, Math.round(w / 2), y + 24, { align: 'center', color: '#e8d8b0', shadow: '#1a0c04' });
  }
}
