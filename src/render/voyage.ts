// Плавание между островами: лодка идёт по открытому морю под тем же небом,
// волны бегут назад, за кормой пена, над мачтой чайки, покинутый остров
// уходит за край, а на горизонте растёт тот, к которому плывём. Сцена
// рисуется поверх мира, пока за ней загружается новый остров.

import { blit, makeCanvas, mix, rgb, hex, type RGB } from '../engine/sprite';
import { hash2, toRoman } from '../engine/math';
import { drawText } from '../engine/font';
import { boatSprite } from '../art/buildings';
import { mountFrames, type MountLook, type RiderLook } from '../art/horse';
import { humanFrames } from '../art/humans';
import type { Atmosphere } from './atmosphere';
import type { Background } from './background';

/** Кто стоит на палубе: монарх на своём скакуне. */
export interface VoyageCast {
  key: string;
  mount: MountLook;
  rider: RiderLook;
}

/** Длительность сцены (с): появление, путь, уход. */
export const VOYAGE_TIME = 4;

export class Voyage {
  private sprites: [HTMLCanvasElement, CanvasRenderingContext2D] | null = null;
  private dark: [HTMLCanvasElement, CanvasRenderingContext2D] | null = null;

  /**
   * v — время с начала сцены (0..VOYAGE_TIME); from/dest — номера островов.
   */
  draw(ctx: CanvasRenderingContext2D, bg: Background, a: Atmosphere, v: number, w: number, h: number, horizonY: number, time: number, from: number, dest: number, cast: VoyageCast): void {
    const seaTop = horizonY + 4;
    const waterY = Math.round(h * 0.74);
    // Небо того же часа: солнце или луна, облака, звёзды.
    bg.drawSky(ctx, a, v * 70, w, horizonY, time);

    // Острова на горизонте: покинутый уходит влево, новый растёт справа.
    const far = mix(a.layers[0].base, a.skyHorizon, 0.35);
    const k = v / VOYAGE_TIME;
    this.island(ctx, Math.round(w * 0.1 - k * w * 0.5), seaTop + 1, 0.9 - k * 0.3, from * 31 + 7, far);
    this.island(ctx, Math.round(w * 1.12 - k * w * 0.36), seaTop + 1, 0.5 + k * 0.55, dest * 31 + 7, mix(far, a.layers[1].base, k * 0.35));

    this.sea(ctx, a, w, h, seaTop, time);

    // Лодка с монархом и командой — на отдельном холсте: так её можно
    // затемнить ночью (с фонарём на корме) и отразить в воде.
    const [sc, s] = this.canvas('sprites', w, h);
    s.clearRect(0, 0, w, h);
    const bob = Math.sin(time * 1.7) * 1.4;
    const bx = Math.round(w * (0.3 + k * 0.1));
    const boat = boatSprite(3);
    const bottom = Math.round(waterY + 6 + bob);
    const top = bottom - boat.h;
    blit(s, boat, bx, bottom);
    // Команда и монарх стоят в лодке: потом корпус рисуется ещё раз поверх ног.
    const archer = humanFrames('archer', 1, 'idle')[0];
    const builder = humanFrames('builder', 2, 'idle')[0];
    blit(s, builder, bx - 27, top + 56);
    blit(s, archer, bx + 28, top + 53, true);
    const frames = mountFrames(cast.key, 'idle', cast.mount, cast.rider);
    blit(s, frames[Math.floor(time * 2.5) % frames.length], bx + 4, top + 57);
    s.drawImage(boat.img, 0, 49, boat.w, boat.h - 49, bx - boat.ax, top + 49, boat.w, boat.h - 49);
    // Фонарь на корме.
    const lx = bx - 33;
    const ly = top + 44;
    s.fillStyle = '#3a2a1a';
    s.fillRect(lx, ly - 5, 1, 6);
    s.fillStyle = a.glow > 0.2 ? '#ffd27a' : '#c8a060';
    s.fillRect(lx - 1, ly - 7, 3, 3);
    // Ниже ватерлинии лодки не видно — там вода.
    s.clearRect(0, waterY + 1, w, h - waterY - 1);
    if (a.overlayAlpha > 0.01) this.shade(s, a, w, h, lx, ly - 6);
    // Отражение: построчно, с рябью, всё бледнее в глубину.
    for (let r = 0; r < 34; r++) {
      const off = Math.round(Math.sin(r * 0.45 + time * 2.2) * (0.6 + r * 0.05));
      ctx.globalAlpha = 0.32 * (1 - r / 34);
      ctx.drawImage(sc, 0, waterY - r, w, 1, off, waterY + 1 + r, w, 1);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(sc, 0, 0);

    // Пена у борта и след за кормой.
    const foam = rgb(mix(hex('#ffffff'), a.skyHorizon, 0.3), 0.8 * (1 - a.overlayAlpha * 0.6));
    ctx.fillStyle = foam;
    for (let i = 0; i < 12; i++) {
      const d = (time * 34 + i * 11) % 110;
      const fx = bx - 34 - d;
      const fy = waterY + 1 + (i % 3);
      ctx.globalAlpha = 1 - d / 110;
      ctx.fillRect(Math.round(fx), fy, 2 + (i % 4), 1);
    }
    ctx.globalAlpha = 1;
    const splash = Math.max(0, Math.sin(time * 1.7 + 1.2));
    ctx.fillRect(bx + 34, waterY, 3, 1);
    if (splash > 0.5) ctx.fillRect(bx + 36, waterY - 1, 2, 1);
    ctx.fillRect(bx - 30, waterY + 1, 60, 1);

    // Чайки — днём и в сумерках; ночью над морем тихо.
    if (a.overlayAlpha < 0.45) this.gulls(ctx, a, bx, top + 8, time, v);

    // Куда плывём.
    const ta = Math.min(1, Math.max(0, (v - 0.5) / 0.6)) * Math.min(1, Math.max(0, (VOYAGE_TIME - 0.5 - v) / 0.6));
    if (ta > 0.01) {
      drawText(ctx, `К ОСТРОВУ ${toRoman(dest)}`, Math.floor(w / 2), Math.floor(h * 0.16), { align: 'center', scale: 2, color: '#f4e4b8', alpha: ta, outline: '#1a1208' });
    }
  }

  private canvas(which: 'sprites' | 'dark', w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    let c = which === 'sprites' ? this.sprites : this.dark;
    if (!c || c[0].width !== w || c[0].height !== h) {
      c = makeCanvas(w, h);
      if (which === 'sprites') this.sprites = c;
      else this.dark = c;
    }
    return c;
  }

  /** Ночь на лодке: затемнение с пятном тёплого света от фонаря. */
  private shade(s: CanvasRenderingContext2D, a: Atmosphere, w: number, h: number, lx: number, ly: number): void {
    const [dc, d] = this.canvas('dark', w, h);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, w, h);
    d.fillStyle = rgb(a.overlay, a.overlayAlpha);
    d.fillRect(0, 0, w, h);
    if (a.glow > 0.05) {
      d.globalCompositeOperation = 'destination-out';
      const g = d.createRadialGradient(lx, ly, 0, lx, ly, 46);
      const k = Math.min(0.8, 0.8 * a.glow);
      g.addColorStop(0, `rgba(0,0,0,${k.toFixed(3)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g;
      d.fillRect(lx - 46, ly - 46, 92, 92);
      d.globalCompositeOperation = 'source-over';
      const t = d.createRadialGradient(lx, ly, 0, lx, ly, 30);
      t.addColorStop(0, rgb(hex('#ffb060'), 0.16 * a.glow));
      t.addColorStop(1, rgb(hex('#ffb060'), 0));
      d.fillStyle = t;
      d.fillRect(lx - 30, ly - 30, 60, 60);
    }
    s.globalCompositeOperation = 'source-atop';
    s.drawImage(dc, 0, 0);
    s.globalCompositeOperation = 'source-over';
  }

  /** Открытое море до горизонта: цвет к глубине темнеет, блики бегут назад. */
  private sea(ctx: CanvasRenderingContext2D, a: Atmosphere, w: number, h: number, top: number, time: number): void {
    const surf = mix(a.waterDeep, a.skyHorizon, 0.55);
    const deep = mix(a.waterDeep, hex('#000000'), 0.25);
    for (let y = top; y < h; y++) {
      const t = (y - top) / (h - top);
      ctx.fillStyle = rgb(mix(surf, deep, Math.pow(t, 0.6)));
      ctx.fillRect(0, y, w, 1);
    }
    ctx.fillStyle = rgb(mix(surf, a.skyHorizon, 0.6));
    ctx.fillRect(0, top, w, 1);
    // Блики: у горизонта мелкие и медленные, у края кадра — длинные и быстрые.
    const glint: RGB = mix(surf, hex('#ffffff'), 0.45);
    const n = 70;
    for (let i = 0; i < n; i++) {
      const d = hash2(i, 41);
      const y = Math.round(top + 2 + d * d * (h - top - 4));
      const depth = (y - top) / (h - top);
      const speed = 6 + depth * 46;
      const len = 1 + Math.round(depth * 7 + hash2(i, 42) * 3);
      const x = ((hash2(i, 43) * 1000 - time * speed) % (w + 40) + w + 40) % (w + 40) - 20;
      ctx.fillStyle = rgb(glint, (0.25 + 0.35 * depth) * (0.4 + 0.6 * a.clear));
      ctx.fillRect(Math.round(x), y, len, 1);
    }
    // Дорожка от солнца или луны.
    const useSun = a.sunH > -0.05;
    const lit = useSun ? 0.35 + 0.4 * (1 - Math.min(1, Math.max(0, a.sunH) / 0.5)) : a.moonH > 0 ? 0.35 : 0;
    if (lit > 0.05) {
      const cx = w * (useSun ? a.sunX : a.moonX);
      const col = useSun ? mix(a.sunColor, hex('#ffffff'), 0.3) : a.moonColor;
      for (let y = top + 1; y < h; y += 2) {
        const depth = (y - top) / (h - top);
        const spread = 4 + depth * 36;
        const x = cx + Math.sin(y * 1.7 + time * 3) * spread * 0.6;
        const len = 2 + Math.round(depth * 6);
        ctx.fillStyle = rgb(col, lit * (0.5 + 0.5 * Math.sin(y * 3.1 + time * 5)) * a.clear);
        ctx.fillRect(Math.round(x - len / 2), y, len, 1);
      }
    }
  }

  /** Силуэт острова на горизонте: холмы и лес по кромке. */
  private island(ctx: CanvasRenderingContext2D, cx: number, base: number, scale: number, seed: number, col: RGB): void {
    const half = Math.round(80 * scale);
    ctx.fillStyle = rgb(col);
    for (let x = -half; x <= half; x++) {
      const u = (x + half) / (half * 2);
      const hill = Math.pow(Math.sin(Math.PI * u), 0.7) * (5 + 7 * hash2(seed, 1)) * scale;
      // Лес: ели — острые пики, лиственные — округлые шапки.
      const cell = Math.floor((x + half) / Math.max(3, 5 * scale));
      const inCell = ((x + half) % Math.max(3, 5 * scale)) / Math.max(3, 5 * scale);
      const pine = hash2(cell, seed) > 0.5;
      const th = (4 + hash2(cell, seed + 1) * 6) * scale * Math.pow(Math.sin(Math.PI * u), 0.4);
      const tree = pine ? th * (1 - Math.abs(inCell - 0.5) * 2) : th * Math.sqrt(Math.max(0, 1 - Math.pow((inCell - 0.5) * 2, 2)));
      const hgt = Math.round(hill + tree);
      if (hgt > 0) ctx.fillRect(cx + x, base - hgt, 1, hgt);
    }
  }

  /** Чайки: кружат над мачтой, машут крыльями. */
  private gulls(ctx: CanvasRenderingContext2D, a: Atmosphere, bx: number, y0: number, time: number, v: number): void {
    const body = rgb(mix(hex('#f2f0e8'), a.overlay, a.overlayAlpha * 0.8));
    const tip = rgb(mix(hex('#3a3a40'), a.overlay, a.overlayAlpha * 0.5));
    for (let i = 0; i < 3; i++) {
      const ph = time * (0.6 + i * 0.13) + i * 2.1;
      const x = Math.round(bx + Math.cos(ph) * (26 + i * 12) + v * (4 + i * 3));
      const y = Math.round(y0 - 10 - i * 7 + Math.sin(ph * 1.3) * 5);
      const up = Math.floor(time * (5 + i) + i) % 2 === 0;
      ctx.fillStyle = body;
      ctx.fillRect(x - 1, y, 3, 1);
      if (up) {
        ctx.fillRect(x - 3, y - 1, 2, 1);
        ctx.fillRect(x + 2, y - 1, 2, 1);
        ctx.fillStyle = tip;
        ctx.fillRect(x - 4, y - 2, 1, 1);
        ctx.fillRect(x + 4, y - 2, 1, 1);
      } else {
        ctx.fillRect(x - 3, y + 1, 2, 1);
        ctx.fillRect(x + 2, y + 1, 2, 1);
        ctx.fillStyle = tip;
        ctx.fillRect(x - 4, y + 1, 1, 1);
        ctx.fillRect(x + 4, y + 1, 1, 1);
      }
    }
  }
}
