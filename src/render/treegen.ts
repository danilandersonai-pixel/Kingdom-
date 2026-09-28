// Процедурные пиксельные деревья. Каждое дерево строится как три маски:
// основа, тень и свет. Фоновые слои раскрашивают маски цветами атмосферы,
// а деревья игрового слоя получают полноценные цвета времени года.

import { Rng } from '../engine/rng';
import { makeCanvas } from '../engine/sprite';

export type TreeKind = 'pine' | 'oak' | 'birch' | 'bare' | 'bush' | 'dead';

export interface TreeMasks {
  w: number;
  h: number;
  /** Точка основания ствола. */
  ax: number;
  /** 0 — пусто, 1 — ствол, 2 — листва/крона. */
  kind: Uint8Array;
  /** 0 — обычный тон, 1 — тень, 2 — свет, 3 — снег/блик. */
  tone: Uint8Array;
}

function blank(w: number, h: number): TreeMasks {
  return { w, h, ax: Math.floor(w / 2), kind: new Uint8Array(w * h), tone: new Uint8Array(w * h) };
}

function set(m: TreeMasks, x: number, y: number, kind: number, tone = 0): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return;
  const i = y * m.w + x;
  m.kind[i] = kind;
  m.tone[i] = tone;
}

function get(m: TreeMasks, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return 0;
  return m.kind[y * m.w + x];
}

function disc(m: TreeMasks, cx: number, cy: number, r: number, rng: Rng, kind = 2): void {
  const r2 = r * r;
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = dx * dx + dy * dy;
      // Неровный край, но без «шума» внутри.
      const edge = d > r2 * 0.72;
      if (d > r2 * (edge ? 0.8 + rng.next() * 0.3 : 1)) continue;
      // Свет сверху-слева, тень снизу-справа — объёмные «клубы» листвы.
      const nx = dx / r;
      const ny = dy / r;
      const lit = -nx * 0.55 - ny * 0.85;
      let tone = 0;
      if (lit > 0.38) tone = 2;
      else if (lit < -0.32) tone = 1;
      set(m, x, y, kind, tone);
    }
  }
}

function trunk(m: TreeMasks, x: number, yTop: number, yBottom: number, wBottom: number, wTop: number, rng: Rng): void {
  for (let y = yTop; y <= yBottom; y++) {
    const t = (y - yTop) / Math.max(1, yBottom - yTop);
    const w = wTop + (wBottom - wTop) * t;
    const flare = y > yBottom - 3 ? (y - (yBottom - 3)) * 0.7 : 0;
    const half = (w + flare) / 2;
    const wob = Math.round(Math.sin(y * 0.3 + x) * 0.4);
    for (let xx = Math.round(x - half) + wob; xx <= Math.round(x + half) + wob - 1; xx++) set(m, xx, y, 1, 0);
  }
  void rng;
}

function branch(m: TreeMasks, x0: number, y0: number, ang: number, len: number, thick: number, rng: Rng, depth: number, kind = 1): void {
  let x = x0;
  let y = y0;
  const steps = Math.max(1, Math.round(len));
  for (let i = 0; i < steps; i++) {
    x += Math.cos(ang);
    y -= Math.sin(ang);
    ang += (rng.next() - 0.5) * 0.25;
    const t = Math.max(1, Math.round(thick * (1 - i / steps)));
    for (let k = 0; k < t; k++) set(m, x + (k - (t >> 1)), y, kind, 0);
  }
  if (depth > 0) {
    const n = rng.int(1, 2);
    for (let i = 0; i < n; i++) {
      branch(m, x, y, ang + rng.range(-0.7, 0.7), len * rng.range(0.5, 0.7), thick * 0.6, rng, depth - 1, kind);
    }
  }
}

/** Доводка тонов: светлая кромка сверху, тень снизу, освещённая сторона ствола. */
function shadeFoliage(m: TreeMasks, rng: Rng, lightDir = -1): void {
  const { w, h } = m;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const k = m.kind[i];
      if (!k) continue;
      if (k === 2) {
        if (get(m, x, y - 1) !== 2 && m.tone[i] !== 1) m.tone[i] = 2;
        else if (get(m, x, y + 1) === 0) m.tone[i] = 1;
      } else if (k === 1) {
        const left = get(m, x - 1, y) !== 1;
        const right = get(m, x + 1, y) !== 1;
        if ((lightDir < 0 && left) || (lightDir > 0 && right)) m.tone[i] = 2;
        else if ((lightDir < 0 && right) || (lightDir > 0 && left)) m.tone[i] = 1;
        else if (rng.chance(0.08)) m.tone[i] = 1;
      }
    }
  }
}

function addSnow(m: TreeMasks, rng: Rng): void {
  const { w, h } = m;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      if (m.kind[i] && get(m, x, y - 1) === 0) {
        m.tone[i] = 3;
        if (rng.chance(0.6) && y + 1 < h && m.kind[i + w]) m.tone[i + w] = 3;
      }
    }
  }
}

export function makePine(rng: Rng, height: number, snow = false): TreeMasks {
  const maxHalf = Math.max(3, Math.round(height * rng.range(0.2, 0.27)));
  const w = maxHalf * 2 + 5;
  const h = height + 1;
  const m = blank(w, h);
  const cx = Math.floor(w / 2);
  const trunkH = Math.max(3, Math.round(height * 0.12));
  trunk(m, cx, h - trunkH - 4, h - 1, Math.max(2, Math.round(height / 22)), Math.max(1, Math.round(height / 30)), rng);
  const tiers = Math.max(3, Math.round(height / rng.range(9, 13)));
  const top = 0;
  const bottom = h - trunkH - 1;
  const span = bottom - top;
  for (let y = top; y <= bottom; y++) {
    const t = (y - top) / span;
    const tier = Math.floor(t * tiers);
    const inTier = t * tiers - tier;
    const tierMax = ((tier + 1) / tiers) * maxHalf;
    const tierMin = (tier / tiers) * maxHalf * 0.55;
    let half = tierMin + (tierMax - tierMin) * Math.pow(inTier, 0.8);
    half = Math.max(0.5, half + (rng.next() - 0.5) * 1.6);
    const l = Math.round(cx - half);
    const r = Math.round(cx + half);
    for (let x = l; x <= r; x++) {
      const rel = (x - cx) / Math.max(1, half);
      let tone = 0;
      if (inTier > 0.74 && rel > -0.35) tone = 1;
      else if (rel < -0.4 && inTier < 0.65) tone = 2;
      else if (rel > 0.5) tone = 1;
      set(m, x, y, 2, tone);
    }
    // Свисающие «иголки» на концах ярусов.
    if (inTier > 0.8 && rng.chance(0.7)) {
      set(m, cx - half - 1, y + 1, 2);
      set(m, cx + half + 1, y + 1, 2);
    }
  }
  shadeFoliage(m, rng);
  if (snow) addSnow(m, rng);
  m.ax = cx;
  return m;
}

export function makeOak(rng: Rng, height: number, snow = false, leafless = false): TreeMasks {
  const crownR = Math.max(4, Math.round(height * rng.range(0.24, 0.32)));
  const w = crownR * 2 + 12;
  const h = height + 2;
  const m = blank(w, h);
  const cx = Math.floor(w / 2);
  const trunkTop = Math.round(h * 0.35);
  const tb = Math.max(2, Math.round(height / 13));
  trunk(m, cx, trunkTop, h - 1, tb + 1, Math.max(1, tb - 1), rng);
  // Ветви от ствола.
  const nb = rng.int(2, 4);
  for (let i = 0; i < nb; i++) {
    const y0 = rng.int(trunkTop, Math.round(h * 0.6));
    const dir = i % 2 === 0 ? -1 : 1;
    const ang = Math.PI / 2 + dir * rng.range(0.4, 0.9);
    branch(m, cx, y0, ang, height * rng.range(0.15, 0.3), Math.max(1, tb * 0.6), rng, leafless ? 3 : 1);
  }
  if (leafless) {
    branch(m, cx, trunkTop, Math.PI / 2 + rng.range(-0.2, 0.2), height * 0.3, tb * 0.7, rng, 3);
  } else {
    const cy = trunkTop - crownR * 0.25;
    const blobs = rng.int(6, 11);
    for (let i = 0; i < blobs; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0, crownR * 0.75);
      const r = crownR * rng.range(0.4, 0.7);
      disc(m, cx + Math.cos(a) * d * 1.15, cy + Math.sin(a) * d * 0.75, r, rng);
    }
    disc(m, cx, cy, crownR * 0.72, rng);
  }
  shadeFoliage(m, rng);
  if (snow) addSnow(m, rng);
  m.ax = cx;
  return m;
}

export function makeBirch(rng: Rng, height: number, snow = false, leafless = false): TreeMasks {
  const crownR = Math.max(3, Math.round(height * rng.range(0.14, 0.2)));
  const w = crownR * 2 + 8;
  const h = height + 1;
  const m = blank(w, h);
  const cx = Math.floor(w / 2);
  const trunkTop = Math.round(h * 0.12);
  trunk(m, cx, trunkTop, h - 1, 2, 1, rng);
  if (!leafless) {
    const n = rng.int(5, 8);
    for (let i = 0; i < n; i++) {
      const y = trunkTop + rng.range(0, h * 0.55);
      disc(m, cx + rng.range(-crownR * 0.6, crownR * 0.6), y, crownR * rng.range(0.45, 0.8), rng);
    }
  } else {
    for (let i = 0; i < 4; i++) branch(m, cx, trunkTop + i * 5, Math.PI / 2 + rng.range(-0.8, 0.8), height * 0.2, 1, rng, 2);
  }
  shadeFoliage(m, rng);
  // Берёза: у ствола особая раскраска — пометим светлым тоном (снег/белый).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (m.kind[i] === 1) m.tone[i] = rng.chance(0.18) ? 1 : 3;
    }
  }
  if (snow) addSnow(m, rng);
  m.ax = cx;
  return m;
}

export function makeBush(rng: Rng, width: number, height: number, snow = false): TreeMasks {
  const w = width + 4;
  const h = height + 2;
  const m = blank(w, h);
  const n = Math.max(3, Math.round(width / 5));
  for (let i = 0; i < n; i++) {
    const x = 2 + (i + 0.5) * (width / n) + rng.range(-1, 1);
    const r = rng.range(height * 0.45, height * 0.7);
    disc(m, x, h - r * 0.8, r, rng);
  }
  shadeFoliage(m, rng);
  if (snow) addSnow(m, rng);
  m.ax = Math.floor(w / 2);
  return m;
}

export function makeDead(rng: Rng, height: number): TreeMasks {
  const w = Math.round(height * 0.7) + 6;
  const h = height + 1;
  const m = blank(w, h);
  const cx = Math.floor(w / 2);
  trunk(m, cx, Math.round(h * 0.3), h - 1, 3, 2, rng);
  for (let i = 0; i < 3; i++) branch(m, cx, Math.round(h * (0.3 + i * 0.12)), Math.PI / 2 + rng.range(-1.1, 1.1), height * 0.3, 2, rng, 2);
  shadeFoliage(m, rng);
  m.ax = cx;
  return m;
}

export function makeTree(kind: TreeKind, rng: Rng, height: number, snow: boolean, leafless: boolean): TreeMasks {
  switch (kind) {
    case 'pine':
      return makePine(rng, height, snow);
    case 'oak':
      return makeOak(rng, height, snow, leafless);
    case 'birch':
      return makeBirch(rng, height, snow, leafless);
    case 'bare':
      return makeOak(rng, height, snow, true);
    case 'bush':
      return makeBush(rng, Math.round(height * 1.6), height, snow);
    case 'dead':
      return makeDead(rng, height);
  }
}

/** Маски → три канвы (основа, тень, свет) для раскраски цветами слоя. */
export function masksToCanvases(m: TreeMasks): { base: HTMLCanvasElement; shade: HTMLCanvasElement; light: HTMLCanvasElement } {
  const [b, bc] = makeCanvas(m.w, m.h);
  const [s, sc] = makeCanvas(m.w, m.h);
  const [l, lc] = makeCanvas(m.w, m.h);
  const bi = bc.createImageData(m.w, m.h);
  const si = sc.createImageData(m.w, m.h);
  const li = lc.createImageData(m.w, m.h);
  for (let i = 0; i < m.w * m.h; i++) {
    if (!m.kind[i]) continue;
    const o = i * 4;
    bi.data[o] = bi.data[o + 1] = bi.data[o + 2] = bi.data[o + 3] = 255;
    const t = m.tone[i];
    // Ствол в фоне всегда чуть темнее кроны.
    if (t === 1 || (m.kind[i] === 1 && t === 0)) si.data[o] = si.data[o + 1] = si.data[o + 2] = si.data[o + 3] = 255;
    if (t === 2 || t === 3) li.data[o] = li.data[o + 1] = li.data[o + 2] = li.data[o + 3] = 255;
  }
  bc.putImageData(bi, 0, 0);
  sc.putImageData(si, 0, 0);
  lc.putImageData(li, 0, 0);
  return { base: b, shade: s, light: l };
}

export interface TreeColors {
  trunk: string;
  trunkShade: string;
  trunkLight: string;
  leaf: string;
  leafShade: string;
  leafLight: string;
  snow: string;
  birchBark?: string;
}

/** Полноцветное дерево для игрового слоя. */
export function masksToColor(m: TreeMasks, c: TreeColors, birch = false): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(m.w, m.h);
  const img = ctx.createImageData(m.w, m.h);
  const cache = new Map<string, [number, number, number]>();
  const parse = (hexStr: string): [number, number, number] => {
    let v = cache.get(hexStr);
    if (!v) {
      const n = parseInt(hexStr.slice(1), 16);
      v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      cache.set(hexStr, v);
    }
    return v;
  };
  for (let i = 0; i < m.w * m.h; i++) {
    const k = m.kind[i];
    if (!k) continue;
    const t = m.tone[i];
    let col: string;
    if (k === 1) {
      if (birch) col = t === 1 ? '#2a2622' : t === 3 ? (c.birchBark ?? '#e8e4d8') : '#c8c2b4';
      else col = t === 1 ? c.trunkShade : t === 2 ? c.trunkLight : t === 3 ? c.snow : c.trunk;
    } else {
      col = t === 1 ? c.leafShade : t === 2 ? c.leafLight : t === 3 ? c.snow : c.leaf;
    }
    const [r, g, b] = parse(col);
    const o = i * 4;
    img.data[o] = r;
    img.data[o + 1] = g;
    img.data[o + 2] = b;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
