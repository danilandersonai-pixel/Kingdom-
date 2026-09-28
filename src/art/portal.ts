// Порталы Жадности и утёс с пещерой. Камень рисуется «рельефом»: из маски
// формы строится карта высоты (расстояние до края), по ней — нормали и свет
// сверху-слева; поверх — пласты, трещины, мох. Вихрь портала анимирован.

import { Rng } from '../engine/rng';
import { makeCanvas, type Sprite } from '../engine/sprite';

const cache = new Map<string, Sprite>();

function h32(x: number, y: number, s: number): number {
  let n = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/** Плавный шум: значения в узлах сетки с шагом scale, между ними — сглаженная интерполяция. */
function vnoise(x: number, y: number, scale: number, s: number): number {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = h32(x0, y0, s);
  const b = h32(x0 + 1, y0, s);
  const c = h32(x0, y0 + 1, s);
  const d = h32(x0 + 1, y0 + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function parse(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Карта «высоты» внутри маски: расстояние до ближайшего пустого пикселя (чамфер 3-4). */
function heightMap(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e6;
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? INF : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4, at(x + 1, y - 1) + 1.4);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!mask[i]) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4, at(x - 1, y + 1) + 1.4);
    }
  }
  return d;
}

interface RockOpts {
  seed: number;
  /** 5 тонов от глубокой тени к блику. */
  tones: readonly string[];
  /** Насколько «круглый» рельеф (пикселей до плато). */
  bevel: number;
  strata?: number;
  cracks?: number;
}

/** Раскрасить маску камня рельефным светом. Возвращает индекс тона на пиксель (-1 — пусто). */
function rockTones(mask: Uint8Array, w: number, h: number, o: RockOpts): Int8Array {
  const hm = heightMap(mask, w, h);
  const out = new Int8Array(w * h).fill(-1);
  const hv = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : Math.min(o.bevel, hm[y * w + x]));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      // Нормаль по градиенту высоты; свет сверху-слева.
      const gx = hv(x + 1, y) - hv(x - 1, y);
      const gy = hv(x, y + 1) - hv(x, y - 1);
      let lum = 0.55 + (gx * 0.55 + gy * 0.7) * 0.22;
      lum += (h32(x >> 1, y >> 1, o.seed) - 0.5) * 0.18 + (h32(x, y, o.seed + 1) - 0.5) * 0.08;
      if (o.strata) {
        const band = Math.sin((y + Math.sin(x * 0.11 + o.seed) * 3) * (Math.PI * 2 / o.strata));
        if (band > 0.93) lum -= 0.22;
        else if (band < -0.9) lum += 0.08;
      }
      out[i] = lum < 0.3 ? 0 : lum < 0.45 ? 1 : lum < 0.62 ? 2 : lum < 0.78 ? 3 : 4;
    }
  }
  // Трещины: извилистые тёмные линии сверху вниз.
  const rng = new Rng(o.seed);
  for (let k = 0; k < (o.cracks ?? 0); k++) {
    let x = rng.int(4, w - 5);
    let y = rng.int(0, Math.floor(h * 0.6));
    const len = rng.int(8, 26);
    for (let s = 0; s < len; s++) {
      const i = y * w + x;
      if (y >= h || !mask[i]) break;
      out[i] = 0;
      if (x + 1 < w && mask[i + 1] && out[i + 1] > 1) out[i + 1] = 3;
      y++;
      if (rng.chance(0.35)) x += rng.chance(0.5) ? 1 : -1;
    }
  }
  return out;
}

function paintTones(data: Uint8ClampedArray, tones: Int8Array, pal: readonly string[]): void {
  const cols = pal.map(parse);
  for (let i = 0; i < tones.length; i++) {
    const t = tones[i];
    if (t < 0) continue;
    const [r, g, b] = cols[t];
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
}

const PORTAL_ROCK = ['#120e16', '#221b28', '#342a3c', '#4a3e52', '#66586e'];
const RUIN_ROCK = ['#26222a', '#3c3640', '#57505c', '#746c78', '#948c96'];
const VORTEX = ['#0c0612', '#1a0a2a', '#2e1248', '#4a1e70', '#7036a4', '#a864dc', '#e2b8ff'];

/** Портал: зубчатая каменная арка с вихрем внутри и корнями по земле. */
export function portalSprite(t: number, broken: boolean, big: boolean): Sprite {
  const frames = 8;
  const f = broken ? 0 : Math.floor(t * 7) % frames;
  const key = `portal2:${big}:${broken}:${f}`;
  let s = cache.get(key);
  if (s) return s;
  const RW = big ? 46 : 32;
  const RH = big ? 62 : 44;
  const pad = big ? 22 : 18;
  const W = RW + pad * 2;
  const H = RH + 4;
  const cx = W / 2;
  const cy = H - RH * 0.47 - 3;
  const seed = big ? 911 : 577;
  const rng = new Rng(seed);
  const [cv, ctx] = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  const mask = new Uint8Array(W * H);
  const inner = new Uint8Array(W * H);
  const teeth = big ? 11 : 9;
  const ph = rng.range(0, 6);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - cx) / (RW / 2);
      const dy = (y + 0.5 - cy) / (RH / 2);
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      // Внешний край с зубцами, внутренний — с клыками внутрь.
      const saw = Math.abs(((a / (Math.PI * 2)) * teeth + ph) % 1 - 0.5) * 2;
      const outer = 0.93 + 0.13 * (1 - saw) + (h32(Math.round(a * 20), 0, seed) - 0.5) * 0.06;
      const saw2 = Math.abs(((a / (Math.PI * 2)) * (teeth + 2) + ph * 1.3) % 1 - 0.5) * 2;
      const inn = 0.66 - 0.09 * (1 - saw2) * (1 - saw2);
      const i = y * W + x;
      if (broken) continue;
      if (r < outer && r > inn && y < H - 1) mask[i] = 1;
      else if (r <= inn) inner[i] = 1;
    }
  }
  // «Рога» сверху по бокам.
  if (!broken) {
    for (const side of [-1, 1]) {
      const bx = cx + side * RW * 0.28;
      const by = cy - RH * 0.36;
      const len = big ? 12 : 8;
      for (let k = 0; k < len; k++) {
        const t2 = k / len;
        const x = bx + side * t2 * len * 0.55;
        const y = by - t2 * len;
        const half = (1 - t2) * (big ? 3 : 2.2);
        for (let yy = Math.floor(y - 1); yy <= Math.ceil(y + 1); yy++) {
          for (let xx = Math.floor(x - half); xx <= Math.ceil(x + half); xx++) {
            if (xx >= 0 && yy >= 0 && xx < W && yy < H) mask[yy * W + xx] = 1;
          }
        }
      }
    }
  }
  // Руины разрушенного портала: насыпь камней и обломки клыков.
  if (broken) {
    for (let x = 0; x < W; x++) {
      const t2 = (x - pad * 0.6) / (W - pad * 1.2);
      if (t2 < 0 || t2 > 1) continue;
      const mound = Math.sin(Math.PI * t2) * (big ? 11 : 8) + (h32(x >> 2, 3, seed) - 0.5) * 4;
      for (let y = Math.max(0, Math.floor(H - mound)); y < H - 1; y++) mask[y * W + x] = 1;
    }
    for (let k = 0; k < 3; k++) {
      const x0 = Math.round(cx + (k - 1) * RW * 0.32 + rng.range(-2, 2));
      const hh = rng.int(big ? 14 : 10, big ? 26 : 18);
      for (let y = 0; y < hh; y++) {
        const half = Math.max(1, Math.round((1 - y / hh) * 3));
        for (let xx = x0 - half; xx <= x0 + half; xx++) if (xx >= 0 && xx < W) mask[(H - 2 - y) * W + xx] = 1;
      }
    }
  }
  const tones = rockTones(mask, W, H, { seed, tones: PORTAL_ROCK, bevel: 3, cracks: broken ? 0 : big ? 3 : 2 });
  paintTones(img.data, tones, broken ? RUIN_ROCK : PORTAL_ROCK);
  // Вихрь: спиральные рукава вращаются, у края ярче, в центре — светящееся ядро.
  if (!broken) {
    const vc = VORTEX.map(parse);
    const rot = (f / frames) * Math.PI * 2;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!inner[i]) continue;
        const dx = (x + 0.5 - cx) / (RW * 0.33);
        const dy = (y + 0.5 - cy) / (RH * 0.33);
        const rho = Math.min(1, Math.hypot(dx, dy));
        const th = Math.atan2(dy, dx);
        const arm = Math.sin(th * 3 - rho * 8 + rot);
        let v = 1.2 + arm * 1.3 + rho * 2.6 + (h32(x, y, f) - 0.5) * 0.8;
        if (rho < 0.13) v = 6;
        else if (rho < 0.22) v = Math.max(v, 4.6);
        const k = Math.max(0, Math.min(6, Math.round(v)));
        const [r, g, b] = vc[k];
        img.data[i * 4] = r;
        img.data[i * 4 + 1] = g;
        img.data[i * 4 + 2] = b;
        img.data[i * 4 + 3] = 255;
      }
    }
    // Искры в вихре.
    for (let k = 0; k < 6; k++) {
      const a = h32(k, f, 7) * Math.PI * 2;
      const rr = 0.3 + h32(k, f, 9) * 0.6;
      const x = Math.round(cx + Math.cos(a) * rr * RW * 0.3);
      const y = Math.round(cy + Math.sin(a) * rr * RH * 0.3);
      const i = y * W + x;
      if (x >= 0 && y >= 0 && x < W && y < H && inner[i]) {
        const [r, g, b] = vc[6];
        img.data.set([r, g, b, 255], i * 4);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  // Корни-щупальца по земле и светящиеся кристаллы в камне.
  const roots = broken ? 2 : 4;
  for (let k = 0; k < roots; k++) {
    const side = k % 2 ? 1 : -1;
    let x = cx + side * RW * 0.35;
    let y = H - 2;
    const len = pad + rng.int(-4, 4);
    for (let s2 = 0; s2 < len; s2++) {
      ctx.fillStyle = s2 < len * 0.4 ? '#1c1424' : '#2a2032';
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      if (s2 < len * 0.3) ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 1);
      x += side;
      y += Math.sin(s2 * 0.7 + k) * 0.6;
      y = Math.min(H - 1, Math.max(H - 4, y));
    }
  }
  if (!broken) {
    for (let k = 0; k < 5; k++) {
      const a = h32(k, 5, seed) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * RW * 0.42);
      const y = Math.round(cy + Math.sin(a) * RH * 0.42);
      if (y > H - 4) continue;
      ctx.fillStyle = '#b070e8';
      ctx.fillRect(x, y, 1, 2);
      ctx.fillStyle = '#e8c8ff';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  s = { img: cv, w: W, h: H, ax: Math.round(cx), ay: H };
  cache.set(key, s);
  return s;
}

const CLIFF = ['#141119', '#221e28', '#332d3a', '#463f4e', '#5d5566', '#7a7182'];

/** Утёс на краю острова — массив скалы, в подножии которого зев пещеры.
 *  Силуэт — ступени-плиты с рваным верхом; внутри наклонные пласты
 *  породы с трещинами; на уступах мох, трава и кусты; наружная часть
 *  уходит за верх экрана — дальше острова нет. */
export function cliffSprite(side: -1 | 1): Sprite {
  const key = `cliff3:${side}`;
  let s = cache.get(key);
  if (s) return s;
  const W = 290;
  const H = 214;
  const caveX = 46;
  const caveW = 29;
  const caveH = 60;
  const rng = new Rng(4242);
  // ——— Силуэт (для side = +1: к городу — слева, наружу — вправо).
  // Огибающая высоты: низкий порог у города, крутой подъём над пещерой,
  // уступы и стена во всю высоту кадра снаружи.
  const env = (x: number) => {
    if (x < 4) return 0;
    if (x < 30) return 6 + (x - 4) * 2.7;
    if (x < 90) return 76 + (x - 30) * 0.7;
    if (x < 170) return 118 + (x - 90) * 1.1;
    return H + 10;
  };
  const top = new Float32Array(W).fill(H);
  let x = 4;
  while (x < W) {
    const sw = x < 40 ? rng.int(6, 12) : rng.int(18, 46);
    const cx = Math.min(W - 1, x + sw / 2);
    const hh = Math.max(0, env(cx) + rng.range(-7, 5));
    const slope = rng.range(-0.22, 0.18);
    for (let k = 0; k < sw && x + k < W; k++) {
      const xx = x + k;
      // Плавные бугры, рваная кромка и редкие выбоины.
      const bump = (vnoise(xx, 0, 23, 90) - 0.5) * 14;
      const jag = (h32(xx >> 1, 7, 91) - 0.5) * 3 + (h32(xx, 8, 92) > 0.88 ? -2 : 0);
      top[xx] = Math.round(H - hh + slope * (k - sw / 2) + bump + jag);
    }
    x += sw;
  }
  // Над пещерой скала не ниже арки: покатое плечо, а не отвесная стенка.
  for (let xx = caveX - caveW; xx <= caveX + caveW; xx++) {
    const d = (xx - caveX) / caveW;
    const arch = caveH * Math.sqrt(Math.max(0, 1 - d * d));
    const need = arch + 10 + Math.round(h32(xx >> 2, 3, 93) * 5) + (d > 0 ? 8 : 0);
    if (xx >= 0 && xx < W) top[xx] = Math.min(top[xx], H - need);
  }
  const inCave = (xx: number, yy: number) => {
    const dx = (xx + 0.5 - caveX) / caveW;
    const dy = (H - yy) / caveH;
    return dx * dx + dy * dy < 1 && yy > H - caveH;
  };
  const mask = new Uint8Array(W * H);
  for (let xx = 0; xx < W; xx++) {
    for (let yy = Math.max(0, top[xx]); yy < H; yy++) if (!inCave(xx, yy)) mask[yy * W + xx] = 1;
  }
  // Осыпь у подножия: округлые глыбы с обеих сторон пещеры.
  const boulders: Array<[number, number, number]> = [];
  for (let k = 0; k < 7; k++) {
    const bx = k < 3 ? rng.int(0, caveX - caveW + 2) : rng.int(caveX + caveW - 6, 140);
    boulders.push([bx, rng.int(4, 9), rng.int(3, 6)]);
  }
  for (const [bx, rx, ry] of boulders) {
    for (let yy = H - ry * 2; yy < H; yy++) {
      for (let xx = bx - rx; xx <= bx + rx; xx++) {
        if (xx < 0 || xx >= W) continue;
        const dx = (xx - bx) / rx;
        const dy = (yy - (H - ry)) / ry;
        if (dx * dx + dy * dy <= 1 && !inCave(xx, yy)) mask[yy * W + xx] = 1;
      }
    }
  }

  // ——— Пласты породы: полосы разной толщины, изогнутые и чуть наклонённые.
  const dip = -0.1;
  const bands: number[] = [];
  for (let y = -60, b = 0; y < H + 60; b++) {
    bands.push(y);
    y += 3 + Math.floor(h32(b, 1, 94) * 13);
  }
  const bandAt = (yy: number): [number, number, number] => {
    let lo = 0;
    let hi = bands.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (bands[mid] <= yy) lo = mid;
      else hi = mid;
    }
    return [lo, yy - bands[lo], bands[lo + 1] - bands[lo]];
  };
  const rock = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < W && yy < H && mask[yy * W + xx] === 1;
  // Длинные трещины через много пластов.
  const fissure = new Uint8Array(W * H);
  for (let k = 0; k < 9; k++) {
    let fx = rng.int(caveX + caveW, W - 4);
    let fy = Math.max(0, Math.round(top[fx]) + rng.int(0, 20));
    const len = rng.int(24, 90);
    for (let st = 0; st < len && fy < H - 4; st++, fy++) {
      if (rock(fx, fy)) fissure[fy * W + fx] = 1;
      if (h32(k, st, 97) < 0.28) fx += h32(k, st, 98) < 0.55 ? 1 : -1;
    }
  }
  const tones = new Int8Array(W * H).fill(-1);
  for (let yy = 0; yy < H; yy++) {
    for (let xx = 0; xx < W; xx++) {
      if (!rock(xx, yy)) continue;
      const i = yy * W + xx;
      const warp = (vnoise(xx, 0, 37, 93) - 0.5) * 12 + Math.sin(xx * 0.13) * 0.8;
      const [b, pos, bh] = bandAt(yy + xx * dip + warp);
      // Пласты разной породы и пятна потемнее и посветлее.
      let lum = 2.1 + h32(b, 2, 95) * 0.7 + (vnoise(xx, yy, 19, 94) - 0.5) * 1.1;
      if (bh > 4) {
        if (pos === 0) lum += 0.75; // кромка пласта на свету
        else if (pos === bh - 1) lum -= 0.85; // тень под кромкой
      }
      // Редкие поперечные швы, кое-где косые.
      const jStep = 16 + Math.floor(h32(b, 3, 96) * 34);
      const jOff = Math.floor(h32(b, 4, 97) * jStep);
      const seg = Math.floor((xx + jOff) / jStep);
      const slant = h32(b, seg, 99) > 0.5 && pos > bh / 2 ? 1 : 0;
      const jx = (xx + jOff - slant) % jStep;
      const hasJoint = bh > 3 && h32(b, seg, 98) > 0.45;
      if (hasJoint && jx === 0) lum = 0.5;
      else if (hasJoint && jx === 1) lum += 0.6;
      if (fissure[i]) lum = 0.3;
      else if (xx > 0 && fissure[i - 1]) lum += 0.7;
      // Крупная форма: свет слева-сверху по краям силуэта, тень справа и у земли.
      if (!rock(xx - 1, yy) || !rock(xx - 2, yy)) lum += 0.8;
      if (!rock(xx, yy - 1)) lum += 1.1;
      else if (!rock(xx, yy - 2)) lum += 0.5;
      if (!rock(xx + 1, yy) || !rock(xx + 2, yy)) lum -= 0.8;
      if (yy > H - 16) lum -= ((yy - (H - 16)) / 16) * 0.9;
      lum += (1 - yy / H) * 0.3 + (h32(xx >> 1, yy >> 1, 99) - 0.5) * 0.45;
      tones[i] = Math.max(0, Math.min(5, Math.round(lum)));
    }
  }
  const [cv, ctx] = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  paintTones(img.data, tones, CLIFF);
  // Зев пещеры: густая тьма с лиловым отсветом у входа.
  const out = img.data;
  for (let xx = 0; xx < W; xx++) {
    for (let yy = H - caveH; yy < H; yy++) {
      if (!inCave(xx, yy)) continue;
      const dx = (xx + 0.5 - caveX) / caveW;
      const dy = (H - yy) / caveH;
      const d = dx * dx + dy * dy;
      const i = yy * W + xx;
      const glow = Math.max(0, 1 - d) * 0.5 + (yy > H - 10 ? 0.15 : 0);
      out[i * 4] = Math.round(10 + glow * 50);
      out[i * 4 + 1] = Math.round(6 + glow * 14);
      out[i * 4 + 2] = Math.round(16 + glow * 70);
      out[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const put = (xx: number, yy: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(xx, yy, 1, 1);
  };
  // Кромка арки: светлый обод сверху-слева, тёмный справа.
  for (let xx = caveX - caveW - 1; xx <= caveX + caveW + 1; xx++) {
    for (let yy = H - caveH - 2; yy < H; yy++) {
      if (!rock(xx, yy) || !(inCave(xx, yy + 1) || inCave(xx + 1, yy) || inCave(xx - 1, yy))) continue;
      put(xx, yy, xx < caveX ? CLIFF[4] : CLIFF[1]);
    }
  }
  // Мох и трава на уступах: где над камнем пусто.
  for (let xx = 0; xx < W; xx++) {
    for (let yy = 1; yy < H - 1; yy++) {
      if (!rock(xx, yy) || rock(xx, yy - 1) || inCave(xx, yy - 1)) continue;
      // Ровная площадка — гуще: мох в два слоя и травинки.
      const flat = rock(xx - 1, yy) && rock(xx + 1, yy) && !rock(xx - 1, yy - 1) && !rock(xx + 1, yy - 1);
      if (h32(xx, yy, 3) > (flat ? 0.08 : 0.3)) {
        put(xx, yy, h32(xx, yy, 4) > 0.5 ? '#4a6a34' : '#35502a');
        if (h32(xx, yy, 5) > (flat ? 0.2 : 0.6)) put(xx, yy + 1, '#2a3e22');
        if (flat && h32(xx, yy, 6) > 0.65) {
          put(xx, yy - 1, '#56783a');
          if (h32(xx, yy, 7) > 0.55) put(xx, yy - 2, '#6a8a44');
        }
      }
    }
  }
  // Кусты на широких уступах: низкие, прижатые к камню.
  for (let k = 0; k < 40; k++) {
    const bx = rng.int(14, W - 6);
    const by = Math.round(top[bx]) + 1;
    if (by < 6 || by > H - caveH - 6 || Math.abs(top[bx - 4] - top[bx]) > 3 || Math.abs(top[bx + 4] - top[bx]) > 3) continue;
    const rx = rng.int(3, 7);
    const ry = Math.max(2, Math.round(rx * rng.range(0.45, 0.7)));
    for (let yy = -ry * 2; yy <= 0; yy++) {
      for (let xx = -rx; xx <= rx; xx++) {
        const d = (xx * xx) / (rx * rx) + ((yy + ry) * (yy + ry)) / (ry * ry);
        if (d > 1 || h32(bx + xx, by + yy, 14) > 0.93) continue;
        const lit = xx < rx * 0.2 && yy < -ry;
        put(bx + xx, by + yy, lit ? (h32(bx + xx, by + yy, 15) > 0.5 ? '#5e823e' : '#4c7034') : d > 0.55 ? '#223820' : '#30502a');
      }
    }
  }
  // Свисающие лианы с уступов.
  for (let k = 0; k < 14; k++) {
    const vx = rng.int(caveX - caveW + 2, W - 8);
    const y0 = Math.round(top[vx]) + rng.int(1, 12);
    if (y0 < 0) continue;
    const len = rng.int(8, 30);
    let xx = vx;
    for (let y = 0; y < len; y++) {
      const yy = y0 + y;
      if (yy >= H - 2 || inCave(xx, yy)) break;
      put(xx, yy, y % 5 === 0 ? '#4a6a36' : '#2c4424');
      if (y % 6 === 3) put(xx + (y % 12 === 3 ? 1 : -1), yy, '#3e5a30');
      if (h32(vx, y, 11) > 0.85) xx += h32(vx, y, 12) > 0.5 ? 1 : -1;
    }
  }
  // Сталактиты-клыки над входом.
  for (let k = 0; k < 7; k++) {
    const sx = caveX - caveW + 6 + k * ((caveW * 2 - 12) / 6);
    const d = (sx - caveX) / caveW;
    const y0 = H - Math.round(caveH * Math.sqrt(Math.max(0, 1 - d * d)));
    const len = 3 + Math.round(h32(k, 2, 8) * 6);
    for (let y = 0; y < len; y++) {
      ctx.fillStyle = y < len - 1 ? '#2a2430' : '#3e3646';
      const half = Math.max(0, Math.round((1 - y / len) * 1.5));
      ctx.fillRect(Math.round(sx) - half, y0 + y, half * 2 + 1, 1);
    }
  }
  // Лиловые кристаллы Жадности проросли в камень у входа.
  for (let k = 0; k < 6; k++) {
    const a = Math.PI * (0.15 + h32(k, 1, 13) * 0.7);
    const cx2 = Math.round(caveX - Math.cos(a) * (caveW + 4 + h32(k, 2, 13) * 6));
    const cy2 = Math.round(H - Math.sin(a) * (caveH + 3 + h32(k, 3, 13) * 5));
    if (!rock(cx2, cy2)) continue;
    put(cx2, cy2, '#b070e8');
    put(cx2, cy2 - 1, '#e8c8ff');
    if (k % 2) put(cx2 + 1, cy2, '#7a3ab0');
  }
  let img2: HTMLCanvasElement = cv;
  if (side < 0) {
    const [fc, fctx] = makeCanvas(W, H);
    fctx.translate(W, 0);
    fctx.scale(-1, 1);
    fctx.drawImage(cv, 0, 0);
    img2 = fc;
  }
  // Точка привязки — центр пещеры у земли.
  const ax = side > 0 ? caveX : W - caveX;
  s = { img: img2, w: W, h: H, ax, ay: H };
  cache.set(key, s);
  return s;
}
