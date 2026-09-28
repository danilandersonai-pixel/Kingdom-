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
    // Иногда строка «выпадает» — даёт характерные штрихи на воде.
    const streak = hash2(r, Math.floor(time * 3 * calm)) < (0.06 + depth * 0.08) * calm;
    if (streak) continue;
    ctx.drawImage(scene, 0, srcY, w, 1, off, waterTop + r, w, 1);
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

  if (frozen > 0.01) {
    // Лёд: белёсая корка, трещины и снежные полосы, привязанные к миру.
    ctx.fillStyle = `rgba(214,228,240,${(0.38 * frozen).toFixed(3)})`;
    ctx.fillRect(0, waterTop, w, waterH);
    const left0 = camX - w / 2;
    ctx.fillStyle = `rgba(255,255,255,${(0.35 * frozen).toFixed(3)})`;
    for (let c = Math.floor(left0 / 40) - 1; c <= Math.floor((left0 + w) / 40) + 1; c++) {
      const hv = hash2(c, 77);
      const x = Math.round(c * 40 + hv * 30 - left0);
      const y = waterTop + 2 + Math.floor(hash2(c, 78) * (waterH - 6));
      ctx.fillRect(x, y, 6 + Math.floor(hv * 18), 1);
      ctx.fillStyle = `rgba(120,150,180,${(0.4 * frozen).toFixed(3)})`;
      ctx.fillRect(x + 3, y + 2, 1, 2);
      ctx.fillRect(x + 4, y + 4, 2, 1);
      ctx.fillStyle = `rgba(255,255,255,${(0.35 * frozen).toFixed(3)})`;
    }
    return;
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
