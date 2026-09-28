// Плавание между островами: лодка идёт по открытому морю под тем же небом,
// волны бегут назад, за кормой пена, над мачтой чайки, покинутый остров
// уходит за край, а на горизонте растёт тот, к которому плывём. Сцена
// рисуется поверх мира, пока за ней загружается новый остров.

import { blit, makeCanvas, mix, rgb, hex, type RGB } from '../engine/sprite';
import { clamp, hash2, toRoman } from '../engine/math';
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
    // Ночью силуэт темнее неба у горизонта (иначе он в нём растворяется),
    // а на берегу горят огоньки.
    const night = clamp((a.overlayAlpha - 0.3) / 0.35, 0, 1);
    const far = mix(mix(a.layers[0].base, a.skyHorizon, 0.35), mix(a.skyHorizon, hex('#000000'), 0.55), night);
    const k = v / VOYAGE_TIME;
    this.island(ctx, Math.round(w * 0.1 - k * w * 0.5), seaTop + 1, 0.9 - k * 0.3, from * 31 + 7, far, night);
    this.island(ctx, Math.round(w * 1.12 - k * w * 0.36), seaTop + 1, 0.5 + k * 0.55, dest * 31 + 7, mix(far, a.layers[1].base, k * 0.35 * (1 - night)), night);

    this.sea(ctx, a, w, h, seaTop, time);
    this.surprise(ctx, a, w, seaTop, v, from, dest);

    // Лодка с монархом и командой — на отдельном холсте: так её можно
    // затемнить ночью (с фонарём на корме) и отразить в воде.
    const [sc, s] = this.canvas('sprites', w, h);
    s.clearRect(0, 0, w, h);
    const bob = Math.sin(time * 1.7) * 2 + Math.sin(time * 0.63 + 1) * 0.8;
    const bx = Math.round(w * (0.3 + k * 0.1) + Math.sin(time * 0.9) * 1.2);
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
    const lit = a.glow > 0.2;
    s.fillStyle = '#3a2a1a';
    s.fillRect(lx, ly - 5, 1, 6);
    s.fillStyle = lit ? '#ffd27a' : '#c8a060';
    s.fillRect(lx - 1, ly - 7, 3, 3);
    if (lit) {
      s.fillStyle = '#fff4c8';
      s.fillRect(lx, ly - 6, 1, 1);
    }
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

    // Пена у борта, бурун у носа и расходящийся след за кормой.
    const foamCol = mix(hex('#ffffff'), a.skyHorizon, 0.3);
    const fa = 0.85 * (1 - a.overlayAlpha * 0.6);
    for (let i = 0; i < 26; i++) {
      const d = (time * 34 + i * 9.7) % 150;
      const row = i % 2;
      // Нижняя ветвь следа уходит ближе к зрителю — «вилка» в перспективе.
      const fy = waterY + 1 + (row ? Math.round(d * 0.07) : 0) + (i % 3 === 0 ? 1 : 0);
      ctx.fillStyle = rgb(foamCol, fa * (1 - d / 150));
      ctx.fillRect(Math.round(bx - 32 - d), fy, 2 + (i % 4), 1);
    }
    ctx.fillStyle = rgb(foamCol, fa);
    ctx.fillRect(bx - 30, waterY + 1, 60, 1);
    const surge = Math.sin(time * 1.7 + 1.2);
    ctx.fillRect(bx + 33, waterY, 4, 1);
    if (surge > 0.2) ctx.fillRect(bx + 35, waterY - 1, 3, 1);
    if (surge > 0.7) ctx.fillRect(bx + 37, waterY - 2, 1, 1);

    // Ореол фонаря и его дрожащий отблеск на воде.
    if (lit) {
      const g = a.glow;
      ctx.globalCompositeOperation = 'lighter';
      const hg = ctx.createRadialGradient(lx, ly - 6, 0, lx, ly - 6, 20);
      hg.addColorStop(0, rgb(hex('#ffb060'), 0.42 * g));
      hg.addColorStop(1, rgb(hex('#ffb060'), 0));
      ctx.fillStyle = hg;
      ctx.fillRect(lx - 20, ly - 26, 40, 40);
      for (let y = waterY + 3; y < waterY + 40; y += 2) {
        const t = (y - waterY) / 40;
        const x = lx + Math.sin(y * 1.3 + time * 4) * (1 + t * 3);
        ctx.fillStyle = rgb(hex('#ffb060'), 0.35 * g * (1 - t));
        ctx.fillRect(Math.round(x - 1), y, 2 + Math.round(t * 2), 1);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // Чайки — днём и в сумерках; ночью над морем тихо.
    if (a.overlayAlpha < 0.45) this.gulls(ctx, a, bx, top + 8, time, v);

    // Куда плывём: надпись проявляется быстро — светлые буквы на облаке
    // не успевают «потеряться», оставив одну обводку.
    const ta = clamp((v - 0.5) / 0.3, 0, 1) * clamp((VOYAGE_TIME - 0.5 - v) / 0.4, 0, 1);
    if (ta > 0.01) {
      drawText(ctx, `К ОСТРОВУ ${toRoman(dest)}`, Math.floor(w / 2), Math.floor(h * 0.16), { align: 'center', scale: 2, color: '#f4e4b8', alpha: ta, outline: '#1a1208' });
    }
  }

  /**
   * Сюрприз посреди пути: вдали всплывает кит и пускает фонтан или у носа
   * выпрыгивает рыба. Что именно — зависит от рейса.
   */
  private surprise(ctx: CanvasRenderingContext2D, a: Atmosphere, w: number, seaTop: number, v: number, from: number, dest: number): void {
    const whale = hash2(from * 7 + dest, 3) < 0.6;
    const dark = mix(a.waterDeep, hex('#000000'), 0.45);
    const lightC = mix(hex('#ffffff'), a.skyHorizon, 0.35);
    if (whale) {
      const p = (v - 1.1) / 1.9;
      if (p <= 0 || p >= 1) return;
      const x = Math.round(w * 0.7 - p * 14);
      const y = seaTop + 16;
      const rise = Math.sin(p * Math.PI);
      // Спина: пологая дуга, в конце — хвостовой плавник.
      const hb = Math.round(rise * 5);
      ctx.fillStyle = rgb(dark);
      for (let dx = -12; dx <= 12; dx++) {
        const hh = Math.round(Math.sqrt(Math.max(0, 1 - (dx / 12) ** 2)) * hb);
        if (hh > 0) ctx.fillRect(x + dx, y - hh, 1, hh);
      }
      if (p > 0.55) {
        const f = Math.round(Math.sin(((p - 0.55) / 0.45) * Math.PI) * 5);
        if (f > 0) {
          ctx.fillRect(x - 15, y - f, 2, f);
          ctx.fillRect(x - 18, y - f - 1, 8, 1);
        }
      }
      // Фонтан: столб брызг и шапка, оседающая на ветру.
      if (p > 0.08 && p < 0.5) {
        const q = (p - 0.08) / 0.42;
        const hgt = Math.round(Math.sin(Math.min(1, q * 1.6) * Math.PI * 0.5) * 12 * (1 - Math.max(0, q - 0.7) / 0.3));
        ctx.fillStyle = rgb(lightC, 0.85 * (1 - q * 0.6));
        for (let k2 = 0; k2 < hgt; k2++) ctx.fillRect(x + 4 + Math.round(Math.sin(k2 * 0.9) * 0.5), y - hb - k2, 1, 1);
        for (let k2 = 0; k2 < 7; k2++) {
          const sx = x + 4 + Math.round((hash2(k2, 9) - 0.5) * 8) - Math.round(q * 3);
          const sy = y - hb - hgt + Math.round(hash2(k2, 10) * 3) + Math.round(q * 4);
          ctx.fillRect(sx, sy, 1, 1);
        }
      }
      // Круги на воде вокруг спины.
      ctx.fillStyle = rgb(lightC, 0.5 * rise);
      ctx.fillRect(x - 14, y, 5, 1);
      ctx.fillRect(x + 10, y, 5, 1);
    } else {
      // Рыба выпрыгивает у носа лодки: дуга над водой и всплеск.
      const p = (v - 1.6) / 0.9;
      if (p <= -0.2 || p >= 1.3) return;
      const x0 = Math.round(w * 0.5);
      const y0 = Math.round(seaTop + (ctx.canvas.height - seaTop) * 0.42);
      if (p > 0 && p < 1) {
        const x = x0 + Math.round(p * 16);
        const y = y0 - Math.round(Math.sin(p * Math.PI) * 10);
        ctx.fillStyle = rgb(mix(hex('#8aa0b0'), a.overlay, a.overlayAlpha * 0.6));
        ctx.fillRect(x - 2, y, 5, 2);
        ctx.fillRect(x - 3, y + (p < 0.5 ? 1 : -1), 1, 1);
        ctx.fillStyle = rgb(lightC, 0.8);
        ctx.fillRect(x + 1, y, 1, 1);
      }
      // Всплески на входе и выходе.
      ctx.fillStyle = rgb(lightC, 0.8);
      for (const [px0, t0] of [[x0, 0], [x0 + 16, 1]] as Array<[number, number]>) {
        const d = Math.abs(p - t0);
        if (d < 0.3) {
          const r = Math.round(d * 12);
          ctx.fillRect(px0 - r - 1, y0 + 1, 2, 1);
          ctx.fillRect(px0 + r, y0 + 1, 2, 1);
          if (d < 0.12) ctx.fillRect(px0, y0 - 2, 1, 2);
        }
      }
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
  private island(ctx: CanvasRenderingContext2D, cx: number, base: number, scale: number, seed: number, col: RGB, night = 0): void {
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
    // Ночью — тёплые огоньки костров и окон у берега.
    if (night > 0.05) {
      for (let i = 0; i < 4; i++) {
        const x = cx + Math.round((hash2(seed, 20 + i) - 0.5) * half * 1.4);
        const y = base - 1 - Math.round(hash2(seed, 30 + i) * 2 * scale);
        ctx.fillStyle = rgb(hex('#ffc070'), 0.9 * night);
        ctx.fillRect(x, y, 1, 1);
        ctx.fillStyle = rgb(hex('#ff9040'), 0.35 * night);
        ctx.fillRect(x - 1, y, 3, 1);
        ctx.fillRect(x, y - 1, 1, 1);
      }
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
