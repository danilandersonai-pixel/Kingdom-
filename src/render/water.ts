// Вода: зеркальное отражение всей сцены с рябью, затемнение в глубину
// и блики. Отражение делается построчно из копии кадра.

import { hash2 } from '../engine/math';
import { rgb, mix, type RGB, hex } from '../engine/sprite';
import type { Atmosphere } from './atmosphere';

export interface Ripple {
  x: number;
  r: number;
  life: number;
}

export function drawWater(
  ctx: CanvasRenderingContext2D,
  scene: HTMLCanvasElement,
  waterTop: number,
  w: number,
  h: number,
  time: number,
  a: Atmosphere,
  camX: number,
  ripples: Ripple[],
  frozen = 0,
): void {
  const waterH = h - waterTop;
  ctx.fillStyle = rgb(a.waterDeep);
  ctx.fillRect(0, waterTop, w, waterH);

  // Зимой река замерзает: отражение почти не рябит.
  const calm = 1 - frozen * 0.85;
  for (let r = 0; r < waterH; r++) {
    const srcY = Math.max(0, waterTop - 1 - Math.floor(r * 1.02));
    const depth = r / waterH;
    const amp1 = Math.min(2.4, 0.35 + r * 0.045) * calm;
    const amp2 = Math.min(1.6, r * 0.025) * calm;
    const off = Math.round(Math.sin(r * 0.9 + time * 2.4) * amp1 + Math.sin(r * 0.23 - time * 1.1 + 1.3) * amp2);
    // Иногда строка рвётся на куски с разным сдвигом и бликом —
    // характерные короткие штрихи на воде, а не линия во всю ширину.
    const frame = Math.floor(time * 3 * calm);
    const streak = hash2(r, frame) < (0.06 + depth * 0.08) * calm;
    if (!streak) {
      ctx.drawImage(scene, 0, srcY, w, 1, off, waterTop + r, w, 1);
      continue;
    }
    let x0 = 0;
    for (let k = 0; x0 < w; k++) {
      const len = 18 + Math.floor(hash2(r * 7 + k, frame + 11) * 70);
      const shift = off + Math.round((hash2(r + k * 13, frame + 5) - 0.5) * (4 + depth * 6));
      const x1 = Math.min(w, x0 + len);
      ctx.drawImage(scene, Math.max(0, x0 - shift), srcY, x1 - x0, 1, x0, waterTop + r, x1 - x0, 1);
      x0 = x1;
    }
    const gx = Math.floor(hash2(r, frame + 21) * w);
    const glen = 6 + Math.floor(hash2(r, frame + 22) * 26);
    ctx.fillStyle = rgb(mix(a.skyHorizon, hex('#ffffff'), 0.4), 0.16 * calm);
    ctx.fillRect(gx, waterTop + r, glen, 1);
  }

  // Затемнение в глубину.
  const g = ctx.createLinearGradient(0, waterTop, 0, h);
  g.addColorStop(0, rgb(a.waterDeep, a.waterAlpha * 0.75));
  g.addColorStop(1, rgb(mix(a.waterDeep, hex('#000000'), 0.35), Math.min(0.95, a.waterAlpha + 0.28)));
  ctx.fillStyle = g;
  ctx.fillRect(0, waterTop, w, waterH);

  // Кромка воды у берега.
  ctx.fillStyle = rgb(mix(a.skyHorizon, a.waterDeep, 0.55), 0.55);
  ctx.fillRect(0, waterTop, w, 1);

  // Дорожка света от солнца (ярче на закате и рассвете) или луны.
  const sunLow = a.sunH > -0.05 ? 1 - Math.min(1, Math.max(0, a.sunH) / 0.5) : 0;
  const moonLit = a.moonH > 0 ? (a.bloodMoon ? 1 : (1 - Math.cos(a.moonPhase * Math.PI * 2)) / 2) * Math.min(1, a.moonH * 3) : 0;
  const useSun = a.sunH > -0.05;
  const strength = (useSun ? 0.18 + sunLow * 0.5 : moonLit * 0.45) * (1 - frozen * 0.6) * a.clear;
  if (strength > 0.03) {
    const col = useSun ? mix(a.sunColor, hex('#ffb060'), sunLow * 0.5) : a.moonColor;
    const cx = w * (useSun ? a.sunX : a.moonX);
    for (let r = 1; r < waterH; r += 1) {
      const depth = r / waterH;
      const spread = 4 + r * 0.7;
      const dashes = 1 + Math.floor(depth * 3);
      for (let k = 0; k < dashes; k++) {
        const hv = hash2(r * 7 + k, Math.floor(time * 4 + k));
        if (hv < 0.35) continue;
        const x = Math.round(cx + (hash2(r, k + Math.floor(time * 3)) - 0.5) * spread * 2);
        const len = 1 + Math.floor(hv * (2 + depth * 5));
        const alpha = strength * (1 - depth * 0.75) * (0.5 + 0.5 * hv);
        ctx.fillStyle = rgb(col, alpha);
        ctx.fillRect(x, waterTop + r, len, 1);
      }
    }
  }

  if (frozen > 0.01) {
    // Лёд: белёсая корка, трещины и снежные полосы, привязанные к миру.
    // Цвет льда берём из неба — ночью он синий и тёмный, а не светится.
    const ice = mix(mix(a.cloudLight, a.skyHorizon, 0.5), a.waterDeep, 0.25);
    const snowy = mix(ice, a.cloudLight, 0.6);
    const crack = mix(ice, a.waterDeep, 0.6);
    ctx.fillStyle = rgb(ice, 0.42 * frozen);
    ctx.fillRect(0, waterTop, w, waterH);
    const left0 = camX - w / 2;
    for (let c = Math.floor(left0 / 40) - 1; c <= Math.floor((left0 + w) / 40) + 1; c++) {
      const hv = hash2(c, 77);
      const x = Math.round(c * 40 + hv * 30 - left0);
      const y = waterTop + 2 + Math.floor(hash2(c, 78) * (waterH - 6));
      ctx.fillStyle = rgb(snowy, 0.45 * frozen);
      ctx.fillRect(x, y, 6 + Math.floor(hv * 18), 1);
      ctx.fillStyle = rgb(crack, 0.55 * frozen);
      ctx.fillRect(x + 3, y + 2, 1, 2);
      ctx.fillRect(x + 4, y + 4, 2, 1);
    }
    // Лунная/солнечная дорожка на льду — мягкое пятно.
    return;
  }

  // Туман над водой на рассвете и в сырую погоду.
  if (a.fogAlpha > 0.14) {
    const k = Math.min(0.5, (a.fogAlpha - 0.14) * 2.2);
    const left0 = camX * 0.8 - w / 2;
    for (let band = 0; band < 3; band++) {
      const y = waterTop - 3 + band * 4;
      const scroll = left0 + time * (4 + band * 2);
      const start = Math.floor(scroll / 8);
      const frac = scroll - start * 8;
      for (let i = -1; i <= Math.ceil(w / 8) + 1; i++) {
        const v = hash2(start + i, band * 13 + 5);
        if (v < 0.35) continue;
        ctx.fillStyle = rgb(a.fogColor, k * v * (0.5 - band * 0.12));
        ctx.fillRect(Math.round(i * 8 - frac), y, 8, 3);
      }
    }
  }

  // Блики: короткие горизонтальные штрихи, привязанные к миру.
  const glint: RGB = mix(a.skyHorizon, hex('#ffffff'), 0.25);
  const cell = 24;
  const left = camX - w / 2;
  const c0 = Math.floor(left / cell) - 1;
  const c1 = Math.floor((left + w) / cell) + 1;
  for (let c = c0; c <= c1; c++) {
    for (let k = 0; k < 2; k++) {
      const hv = hash2(c, k * 7 + 3);
      const row = Math.floor(hash2(c, k * 11 + 5) * waterH);
      const phase = time * (0.6 + hv) + hv * 10;
      const alpha = Math.max(0, Math.sin(phase)) * (0.08 + 0.22 * (1 - row / waterH));
      if (alpha < 0.02) continue;
      const len = 2 + Math.floor(hv * 7);
      const x = Math.round(c * cell + hv * cell - left + Math.sin(time * 0.5 + c) * 2);
      ctx.fillStyle = rgb(glint, alpha);
      ctx.fillRect(x, waterTop + 1 + row, len, 1);
    }
  }

  // Круги от капель дождя и всплесков.
  for (const rp of ripples) {
    const sx = Math.round(rp.x - left);
    if (sx < -20 || sx > w + 20) continue;
    const t = 1 - rp.life;
    const rad = 1 + t * rp.r;
    ctx.fillStyle = rgb(glint, 0.35 * rp.life);
    const y = waterTop + 2 + Math.floor(hash2(Math.floor(rp.x), 1) * Math.min(20, waterH - 4));
    ctx.fillRect(Math.round(sx - rad), y, Math.max(1, Math.round(rad * 2)), 1);
  }
}

/** Кувшинки у берега: листья-блюдца и редкие цветы, чуть покачиваются.
 *  Рисуются на передний план у воды — ночью их затемняет общий слой света. */
export function drawLilies(ctx: CanvasRenderingContext2D, waterTop: number, w: number, time: number, a: Atmosphere, camX: number): void {
  const left0 = camX - w / 2;
  for (let c = Math.floor(left0 / 70) - 1; c <= Math.floor((left0 + w) / 70) + 1; c++) {
    if (hash2(c, 301) > 0.3) continue;
    const n = 1 + Math.floor(hash2(c, 302) * 3);
    for (let k = 0; k < n; k++) {
      const x = Math.round(c * 70 + hash2(c, 303 + k) * 50 - left0 + k * 6);
      const y = waterTop + 3 + Math.floor(hash2(c, 310 + k) * 9);
      const bob = Math.round(Math.sin(time * 1.1 + c + k) * 0.6);
      const pw = 4 + Math.floor(hash2(c, 320 + k) * 3);
      ctx.fillStyle = '#2e5a2a';
      ctx.fillRect(x + bob, y, pw, 1);
      ctx.fillStyle = '#467a36';
      ctx.fillRect(x + bob + 1, y - 1, pw - 2, 1);
      // Вырез листа.
      ctx.fillStyle = rgb(a.waterDeep);
      ctx.fillRect(x + bob + (pw >> 1), y, 1, 1);
      if (hash2(c, 330 + k) > 0.6) {
        ctx.fillStyle = hash2(c, 340 + k) > 0.5 ? '#f4d0e0' : '#f6f2ea';
        ctx.fillRect(x + bob + 1, y - 2, 2, 1);
        ctx.fillStyle = '#f2d44a';
        ctx.fillRect(x + bob + 1, y - 2, 1, 1);
      }
    }
  }
}
