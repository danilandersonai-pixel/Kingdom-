// Процедурные пиксельные деревья. Дерево строится как карта материалов
// (кора, листва, снег, цветы) и тонов освещения 0..4 (от глубокой тени до блика).
// Лиственные кроны — «клубы»-сферы со светом сверху-слева, затенением глубины,
// тенями клуб от клуба и фактурой листьев; хвойные — ярусы свисающих лап.
// Фоновые слои красят маски цветами атмосферы, деревья игрового слоя
// получают полные палитры пород и времён года.

import { Rng } from '../engine/rng';
import { makeCanvas } from '../engine/sprite';

export type TreeKind = 'pine' | 'tallpine' | 'oak' | 'maple' | 'birch' | 'bare' | 'bush' | 'dead';

/** Материалы пикселя. */
export const BARK = 1;
export const LEAF = 2;
export const SNOW = 3;
export const ACCENT = 4;

export interface TreeMasks {
  w: number;
  h: number;
  /** Точка основания ствола. */
  ax: number;
  /** 0 — пусто, иначе BARK / LEAF / SNOW / ACCENT. */
  mat: Uint8Array;
  /** Тон 0..4: глубокая тень, тень, основной, свет, блик. */
  tone: Uint8Array;
}

// Свет сверху-слева и немного спереди.
const LX = -0.55;
const LY = -0.68;
const LZ = 0.48;

function blank(w: number, h: number): TreeMasks {
  return { w, h, ax: Math.floor(w / 2), mat: new Uint8Array(w * h), tone: new Uint8Array(w * h) };
}

function put(m: TreeMasks, x: number, y: number, mat: number, tone: number): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return;
  const i = y * m.w + x;
  m.mat[i] = mat;
  m.tone[i] = tone;
}

function matAt(m: TreeMasks, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return 0;
  return m.mat[y * m.w + x];
}

/** Детерминированный хэш пикселя → [0, 1). */
function hash(x: number, y: number, s: number): number {
  let n = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/** Гладкий шум значений. */
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s);
  const b = hash(xi + 1, yi, s);
  const c = hash(xi, yi + 1, s);
  const d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Ячейки Вороного: смещение от центра ближайшей грозди и ширина «шва» между гроздьями. */
function cellAt(x: number, y: number, size: number, s: number): [number, number, number] {
  const gx = Math.floor(x / size);
  const gy = Math.floor(y / size);
  let best = 1e9;
  let second = 1e9;
  let bdx = 0;
  let bdy = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = (gx + i + 0.2 + hash(gx + i, gy + j, s) * 0.6) * size;
      const cy = (gy + j + 0.2 + hash(gx + i, gy + j, s + 1) * 0.6) * size;
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < best) {
        second = best;
        best = d;
        bdx = x - cx;
        bdy = y - cy;
      } else if (d < second) second = d;
    }
  }
  return [bdx / size, bdy / size, Math.sqrt(second) - Math.sqrt(best)];
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function quant(v: number, cuts: readonly number[]): number {
  let t = 0;
  while (t < cuts.length && v >= cuts[t]) t++;
  return t;
}

const LEAF_CUTS = [0.3, 0.45, 0.6, 0.76] as const;

// ——— Кора ———

/** Ствол от yTop до yBottom с корневым наплывом, полосами коры и сучками. */
function trunk(m: TreeMasks, cx: number, yTop: number, yBottom: number, wBottom: number, wTop: number, rng: Rng, birch = false): void {
  const s = rng.int(0, 1 << 20);
  const lean = rng.range(-0.06, 0.06);
  for (let y = yTop; y <= yBottom; y++) {
    const t = (y - yTop) / Math.max(1, yBottom - yTop);
    let w = wTop + (wBottom - wTop) * t;
    // Корни расходятся у земли.
    const flare = yBottom - y < 4 ? (4 - (yBottom - y)) * 0.75 : 0;
    w += flare;
    const c = cx + (yBottom - y) * lean;
    const xl = Math.round(c - w / 2);
    const xr = Math.round(c + w / 2) - 1;
    const span = Math.max(1, xr - xl + 1);
    for (let x = xl; x <= xr; x++) {
      const u = (x - xl + 0.5) / span;
      let tone: number;
      if (span <= 2) tone = x === xl ? 3 : 1;
      else tone = u < 0.22 ? 3 : u < 0.55 ? 2 : u < 0.84 ? 1 : 0;
      if (birch) {
        // Берёза: белая кора с чёрными чечевичками и тёмным низом.
        tone = u < 0.25 ? 3 : u < 0.8 ? 2 : 1;
        const mark = hash(Math.floor(x / 2), y, s) < 0.16 && hash(x, Math.floor(y / 2), s + 5) < 0.6;
        if (mark) tone = 0;
        if (yBottom - y < 3 + hash(x, 0, s) * 3) tone = Math.min(tone, 1);
      } else {
        // Вертикальные борозды коры.
        const groove = vnoise(x * 1.7, y / 5, s) > 0.7;
        if (groove && tone > 0 && span > 2) tone--;
      }
      put(m, x, y, BARK, tone);
    }
  }
  // Сучки и дупла.
  if (!birch) {
    const knots = Math.floor((yBottom - yTop) / 22);
    for (let k = 0; k < knots; k++) {
      const y = rng.int(yTop + 3, yBottom - 6);
      const t = (y - yTop) / Math.max(1, yBottom - yTop);
      const w = wTop + (wBottom - wTop) * t;
      const x = Math.round(cx + rng.range(-w * 0.2, w * 0.15));
      put(m, x, y, BARK, 0);
      put(m, x, y - 1, BARK, 3);
      if (w > 4) put(m, x + 1, y, BARK, 0);
    }
  }
  // Корни, выползающие в стороны.
  const roots = rng.int(1, 3);
  for (let r = 0; r < roots; r++) {
    const dir = rng.chance(0.5) ? -1 : 1;
    const len = rng.int(2, 3 + Math.round(wBottom / 2));
    const x0 = cx + dir * (wBottom / 2 + 1);
    for (let i = 0; i < len; i++) put(m, x0 + dir * i, yBottom - (i < len - 1 ? 1 : 0), BARK, dir < 0 ? 2 : 1);
  }
}

/** Ветвь-«конечность» с толщиной w0→w1: освещена сторона к свету. */
function limb(m: TreeMasks, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  // Нормаль, смотрящая к свету (вверх-влево).
  let nx = -dy / len;
  let ny = dx / len;
  if (nx * LX + ny * LY < 0) {
    nx = -nx;
    ny = -ny;
  }
  const steps = Math.ceil(len * 1.5);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = x0 + dx * t;
    const cy = y0 + dy * t;
    const r = (w0 + (w1 - w0) * t) / 2;
    if (r < 0.75) {
      const px = Math.round(cx);
      const py = Math.round(cy);
      if (matAt(m, px, py) !== BARK) put(m, px, py, BARK, 1);
      continue;
    }
    for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) {
      for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
        const ox = xx + 0.5 - cx;
        const oy = yy + 0.5 - cy;
        if (ox * ox + oy * oy > r * r + 0.3) continue;
        const s = (ox * nx + oy * ny) / r;
        const tone = s > 0.4 ? 3 : s > -0.25 ? 2 : s > -0.7 ? 1 : 0;
        put(m, xx, yy, BARK, tone);
      }
    }
  }
}

// ——— Листва ———

interface Clump {
  x: number;
  y: number;
  r: number;
  /** Глубина центра (к зрителю — больше). */
  z: number;
  /** Сплющенность по вертикали. */
  sq: number;
  k: number;
  ph: number;
}

interface CrownOpts {
  seed: number;
  /** Сила фактуры листьев. */
  texture: number;
  /** Насколько темнее низ кроны. */
  bottomDark: number;
  /** Сколько «окон» вырезать в кроне. */
  holes: number;
  /** Масштаб листовых гроздей. */
  grain: number;
}

/** Растеризует клубы листвы с освещением: z-буфер, нормали, тени клуб от клуба. */
function crown(m: TreeMasks, clumps: Clump[], o: CrownOpts): void {
  const { w, h } = m;
  const n = w * h;
  const zb = new Float32Array(n).fill(-1e9);
  const nxa = new Float32Array(n);
  const nya = new Float32Array(n);
  const nza = new Float32Array(n);
  const owner = new Int16Array(n).fill(-1);
  let top = h;
  let bottom = 0;
  clumps.forEach((c, ci) => {
    const ry = c.r * c.sq;
    for (let y = Math.max(0, Math.floor(c.y - ry - 2)); y <= Math.min(h - 1, Math.ceil(c.y + ry + 2)); y++) {
      for (let x = Math.max(0, Math.floor(c.x - c.r - 2)); x <= Math.min(w - 1, Math.ceil(c.x + c.r + 2)); x++) {
        const dx = (x + 0.5 - c.x) / c.r;
        const dy = (y + 0.5 - c.y) / ry;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1.45) continue;
        const ang = Math.atan2(dy, dx);
        // Неровный лиственный край.
        const edge = 1 + 0.09 * Math.sin(ang * c.k + c.ph) + 0.06 * Math.sin(ang * (c.k * 2 + 1) + c.ph * 1.7) + (hash(x, y, o.seed + ci) - 0.5) * 0.16;
        const e2 = edge * edge;
        if (d2 > e2) continue;
        const nz = Math.sqrt(Math.max(0, 1 - d2 / e2));
        const z = c.z + nz * c.r;
        const i = y * w + x;
        if (z <= zb[i]) continue;
        zb[i] = z;
        nxa[i] = dx / edge;
        nya[i] = dy / edge;
        nza[i] = nz;
        owner[i] = ci;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  });
  let zmin = 1e9;
  let zmax = -1e9;
  for (let i = 0; i < n; i++) {
    if (owner[i] < 0) continue;
    if (zb[i] < zmin) zmin = zb[i];
    if (zb[i] > zmax) zmax = zb[i];
  }
  const zr = Math.max(1, zmax - zmin);
  const mid = top + (bottom - top) * 0.45;
  const lum = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (owner[i] < 0) continue;
      const nl = Math.hypot(nxa[i], nya[i], nza[i]) || 1;
      const d = Math.max(0, (nxa[i] * LX + nya[i] * LY + nza[i] * LZ) / nl);
      let v = 0.22 + 0.78 * d;
      v *= 0.62 + 0.38 * ((zb[i] - zmin) / zr);
      v *= 1 - o.bottomDark * smooth(mid, bottom + 1, y);
      // Грозди листьев: каждая освещена сверху-слева, между ними — тёмные швы.
      const tex = o.texture * DETAIL;
      const [cdx, cdy, seam] = cellAt(x + 0.5, y + 0.5, o.grain, o.seed);
      v += (cdx * LX + cdy * LY) * tex * 1.6;
      if (seam < 0.7) v -= tex * 0.45;
      v += (vnoise(x / (o.grain * 2.5), y / (o.grain * 2), o.seed + 3) - 0.5) * tex * 0.6;
      v += (hash(x, y, o.seed + 7) - 0.5) * 0.06 * DETAIL;
      // Тень от клуба, лежащего ближе к свету (выше-левее).
      for (const [sx, sy] of [
        [-1, -1],
        [-2, -2],
        [0, -2],
      ] as const) {
        const xx = x + sx;
        const yy = y + sy;
        if (xx < 0 || yy < 0) continue;
        const j = yy * w + xx;
        if (owner[j] >= 0 && owner[j] !== owner[i] && zb[j] > zb[i] + 1.5) {
          v -= 0.17;
          break;
        }
      }
      lum[i] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (owner[i] < 0) continue;
      let t = quant(lum[i], LEAF_CUTS);
      // Кромка силуэта: к свету — блик, от света — глубокая тень.
      const upEmpty = y === 0 || owner[i - w] < 0;
      const leftEmpty = x === 0 || owner[i - 1] < 0;
      const downEmpty = y === h - 1 || owner[i + w] < 0;
      const rightEmpty = x === w - 1 || owner[i + 1] < 0;
      if ((upEmpty || leftEmpty) && t >= 2) t = Math.min(4, t + 1);
      else if ((downEmpty || rightEmpty) && t <= 2) t = Math.max(0, t - 1);
      put(m, x, y, LEAF, t);
    }
  }
  // «Окна» в кроне — сквозь них видно ветви (или небо).
  for (let k = 0; k < o.holes; k++) {
    for (let tries = 0; tries < 12; tries++) {
      const x = Math.floor(hash(k, tries, o.seed + 31) * w);
      const y = Math.floor(top + hash(tries, k, o.seed + 37) * (bottom - top));
      const i = y * w + x;
      if (x < 5 || x >= w - 5 || owner[i] < 0) continue;
      let inside = true;
      for (let yy = -5; yy <= 5 && inside; yy++) for (let xx = -5; xx <= 5; xx++) if (x + xx < 0 || x + xx >= w || y + yy < 0 || y + yy >= h || owner[(y + yy) * w + x + xx] < 0) inside = false;
      if (!inside) continue;
      const r = 2 + hash(x, y, o.seed) * 1.2;
      for (let yy = -3; yy <= 3; yy++) {
        for (let xx = -3; xx <= 3; xx++) {
          if (xx * xx + yy * yy > r * r) continue;
          const j = (y + yy) * w + x + xx;
          m.mat[j] = 0;
          m.tone[j] = 0;
        }
      }
      // Под «окном» — тень.
      for (let xx = -1; xx <= 1; xx++) {
        const j = (y + Math.ceil(r) + 1) * w + x + xx;
        if (m.mat[j] === LEAF) m.tone[j] = Math.max(0, m.tone[j] - 1);
      }
      break;
    }
  }
}

/** Вернуть кору под листвой там, где листву вырезали (ветви видны в «окнах»). */
function overlayCrown(m: TreeMasks, bark: TreeMasks): void {
  for (let i = 0; i < m.w * m.h; i++) {
    if (m.mat[i] === 0 && bark.mat[i] === BARK) {
      m.mat[i] = BARK;
      m.tone[i] = Math.max(0, bark.tone[i] - 1);
    }
  }
}

/** Отдельные листья, свисающие ниже кроны. */
function stray(m: TreeMasks, rng: Rng, n: number): void {
  for (let k = 0; k < n; k++) {
    const x = rng.int(1, m.w - 2);
    for (let y = m.h - 1; y > 0; y--) {
      if (matAt(m, x, y - 1) === LEAF && matAt(m, x, y) === 0) {
        put(m, x, y, LEAF, rng.chance(0.5) ? 1 : 2);
        if (rng.chance(0.3)) put(m, x, y + 1, LEAF, 1);
        break;
      }
    }
  }
}

/** Снег ложится на всё, что смотрит вверх. */
function snowify(m: TreeMasks, rng: Rng, depth: number): void {
  const { w, h } = m;
  for (let x = 0; x < w; x++) {
    for (let y = 1; y < h; y++) {
      const i = y * w + x;
      const mt = m.mat[i];
      if (!mt || mt === SNOW || m.mat[i - w]) continue;
      // Ствол у земли снег не держит.
      if (mt === BARK && y > h - 6) continue;
      const d = mt === LEAF ? depth : Math.max(1, depth - 1);
      for (let k = 0; k < d; k++) {
        const j = i + k * w;
        if (y + k >= h || !m.mat[j]) break;
        if (k > 0 && rng.chance(0.35)) break;
        m.mat[j] = SNOW;
        m.tone[j] = k === 0 ? 2 : 1;
      }
    }
  }
  // Тень от снега на левом краю шапки — чуть темнее справа.
  for (let y = 0; y < h; y++) {
    for (let x = w - 1; x > 0; x--) {
      const i = y * w + x;
      if (m.mat[i] === SNOW && m.mat[i + 1] !== SNOW && m.tone[i] === 2 && rng.chance(0.5)) m.tone[i] = 1;
    }
  }
}

/** Цветы весной (или плоды) — гроздья на освещённой стороне кроны. */
function blossom(m: TreeMasks, rng: Rng, density: number): void {
  const { w, h } = m;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (m.mat[i] !== LEAF || m.tone[i] < 2) continue;
      if (rng.next() > density) continue;
      put(m, x, y, ACCENT, 1);
      if (rng.chance(0.6)) put(m, x - 1, y - 1, ACCENT, 2);
      if (rng.chance(0.4)) put(m, x + 1, y, ACCENT, 1);
    }
  }
}

// ——— Породы ———

export function makeOak(rng: Rng, height: number, snow = false, leafless = false, maple = false): TreeMasks {
  const crownR = Math.max(6, Math.round(height * rng.range(0.3, maple ? 0.34 : 0.4)));
  const w = Math.round(crownR * 2.8) + 16;
  const h = height + 12;
  const m = blank(w, h);
  const cx = Math.floor(w / 2);
  const fork = Math.round(h - height * rng.range(maple ? 0.3 : 0.26, maple ? 0.38 : 0.36));
  const tb = Math.max(3, Math.round(height / 15));
  trunk(m, cx, fork, h - 1, tb + 1, Math.max(2, tb - 1), rng);
  const crownCy = fork - crownR * (maple ? 0.8 : 0.62);
  // Скелет: основные ветви от развилки к лопастям кроны.
  const lobes: Array<[number, number, number]> = [];
  const nMain = rng.int(maple ? 3 : 4, maple ? 5 : 6);
  for (let i = 0; i < nMain; i++) {
    // Лопасти по верхней дуге эллипса кроны, крайние — ниже.
    const a = Math.PI * (1.08 + (0.84 * (i + 0.5)) / nMain) + rng.range(-0.12, 0.12);
    const rx = crownR * (maple ? 0.62 : 0.78) * rng.range(0.85, 1.1);
    const ry = crownR * (maple ? 0.62 : 0.5) * rng.range(0.85, 1.1);
    const x1 = cx + Math.cos(a) * rx;
    const y1 = crownCy + Math.sin(a) * ry + (Math.abs(Math.cos(a)) > 0.7 ? crownR * 0.2 : 0);
    limb(m, cx + rng.range(-1, 1), fork + 2, x1, y1 + 2, Math.max(2, tb - 1), Math.max(1, tb * 0.35));
    lobes.push([x1, y1, rng.range(0.9, 1.15)]);
    if (leafless) {
      // Зимой видны разветвления и тонкие веточки.
      for (let t = 0; t < 3; t++) {
        const b = a + rng.range(-0.8, 0.8);
        const l2 = crownR * rng.range(0.3, 0.55);
        const x2 = x1 + Math.cos(b) * l2;
        const y2 = y1 + Math.sin(b) * l2 * 0.8;
        limb(m, x1, y1, x2, y2, Math.max(1, tb * 0.3), 0.7);
        for (let u = 0; u < 2; u++) {
          const c = b + rng.range(-0.9, 0.9);
          const l3 = l2 * rng.range(0.3, 0.55);
          limb(m, x2, y2, x2 + Math.cos(c) * l3, y2 + Math.sin(c) * l3 * 0.8, 0.7, 0.6);
        }
      }
    }
  }
  if (leafless) {
    if (snow) snowify(m, rng, 1);
    m.ax = cx;
    return m;
  }
  const bark: TreeMasks = { ...m, mat: m.mat.slice(), tone: m.tone.slice() };
  const clumps: Clump[] = [];
  const mk = (x: number, y: number, r: number, z: number): Clump => ({ x, y, r, z, sq: rng.range(0.72, 0.9), k: rng.int(5, 8), ph: rng.range(0, 6.28) });
  // Центральная масса — дальше от зрителя, лопасти перед ней.
  clumps.push(mk(cx, crownCy + crownR * 0.05, crownR * (maple ? 0.66 : 0.6), -crownR * 0.15));
  for (const [x, y, s] of lobes) {
    clumps.push(mk(x, y, crownR * rng.range(0.4, 0.52) * s, rng.range(-crownR * 0.05, crownR * 0.3)));
    // Каждая лопасть — из 2–3 клубов.
    const sub = rng.int(1, 2);
    for (let k = 0; k < sub; k++) {
      clumps.push(mk(x + rng.range(-crownR * 0.28, crownR * 0.28), y + rng.range(-crownR * 0.2, crownR * 0.14), crownR * rng.range(0.24, 0.34) * s, rng.range(0, crownR * 0.4)));
    }
  }
  // Нижние клубы у развилки — крона «садится» на ветви.
  for (const dir of [-1, 1]) clumps.push(mk(cx + dir * crownR * rng.range(0.25, 0.5), crownCy + crownR * 0.38, crownR * rng.range(0.28, 0.36), rng.range(-crownR * 0.1, crownR * 0.2)));
  crown(m, clumps, { seed: rng.int(0, 1 << 20), texture: 0.2, bottomDark: 0.36, holes: maple ? rng.int(0, 1) : rng.int(1, 3), grain: Math.max(3, Math.min(5.5, height / 20)) });
  overlayCrown(m, bark);
  stray(m, rng, Math.round(crownR / 3));
  if (snow) snowify(m, rng, 2);
  m.ax = cx;
  return m;
}

export function makeBirch(rng: Rng, height: number, snow = false, leafless = false): TreeMasks {
  const crownR = Math.max(5, Math.round(height * rng.range(0.17, 0.22)));
  const w = crownR * 3 + 14;
  const h = height + 10;
  const m = blank(w, h);
  const cx = Math.floor(w / 2);
  const top = h - height;
  const trunkTop = top + Math.round(height * 0.06);
  trunk(m, cx, trunkTop, h - 1, height > 80 ? 4 : 3, 2, rng, true);
  const crownTop = top + height * 0.04;
  const crownBottom = top + height * rng.range(0.56, 0.66);
  // Тонкие ветви: вверх у макушки, в стороны и вниз — ниже.
  const tips: Array<[number, number]> = [];
  const nb = rng.int(6, 9);
  for (let i = 0; i < nb; i++) {
    const t = (i + 0.5) / nb;
    const y0 = crownTop + (crownBottom - crownTop) * t;
    const dir = i % 2 === 0 ? -1 : 1;
    const spread = crownR * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
    const x1 = cx + dir * spread * rng.range(0.7, 1.0);
    const y1 = y0 - spread * rng.range(0.25, 0.55);
    limb(m, cx, y0, x1, y1, 1.6, 0.8);
    const x2 = x1 + dir * rng.range(1, 3);
    const y2 = y1 + rng.range(3, 7);
    limb(m, x1, y1, x2, y2, 0.8, 0.6);
    tips.push([x1, y1], [x2, y2]);
  }
  if (leafless) {
    if (snow) snowify(m, rng, 1);
    m.ax = cx;
    return m;
  }
  const bark: TreeMasks = { ...m, mat: m.mat.slice(), tone: m.tone.slice() };
  const clumps: Clump[] = [];
  const mk = (x: number, y: number, r: number, z: number): Clump => ({ x, y, r, z, sq: rng.range(1.0, 1.3), k: rng.int(6, 10), ph: rng.range(0, 6.28) });
  // Плотное ядро кроны — вытянутый эллипс.
  const core = rng.int(6, 9);
  for (let i = 0; i < core; i++) {
    const t = rng.next();
    const y = crownTop + crownR * 0.4 + (crownBottom - crownTop - crownR * 0.6) * t;
    const half = crownR * 0.55 * Math.sin(Math.PI * Math.min(1, 0.15 + t));
    clumps.push(mk(cx + rng.range(-half, half), y, crownR * rng.range(0.34, 0.5), rng.range(-2, crownR * 0.4)));
  }
  // Гроздья на концах ветвей.
  tips.forEach(([x, y], i) => {
    if (i % 2 === 1 && rng.chance(0.5)) return;
    clumps.push(mk(x, y + 1, crownR * rng.range(0.2, 0.32), rng.range(-1, crownR * 0.3)));
  });
  crown(m, clumps, { seed: rng.int(0, 1 << 20), texture: 0.22, bottomDark: 0.22, holes: rng.int(1, 3), grain: Math.max(2.5, Math.min(3.5, height / 28)) });
  overlayCrown(m, bark);
  stray(m, rng, Math.round(crownR / 2));
  if (snow) snowify(m, rng, 1);
  m.ax = cx;
  return m;
}

/** Ель: ярусы свисающих лап с тенью от верхнего яруса. */
export function makePine(rng: Rng, height: number, snow = false): TreeMasks {
  const maxHalf = Math.max(4, Math.round(height * rng.range(0.19, 0.25)));
  const w = maxHalf * 2 + 7;
  const h = height + 1;
  const m = blank(w, h);
  const cx = Math.floor(w / 2);
  const trunkH = Math.max(4, Math.round(height * 0.1));
  trunk(m, cx, Math.round(h * 0.3), h - 1, Math.max(3, Math.round(height / 20)), 2, rng);
  const s = rng.int(0, 1 << 20);
  const tiers = Math.max(4, Math.round(height / rng.range(9, 12)));
  const top = 0;
  const bottom = h - trunkH - 2;
  const step = (bottom - top) / tiers;
  const tierOf = new Int16Array(w * h).fill(-1);
  // Сверху вниз: нижние ярусы шире и перекрывают верхние только лапами.
  for (let k = 0; k < tiers; k++) {
    const yTop = top + k * step - (k === 0 ? 0 : step * 0.35);
    const th = step * (k === 0 ? 1.25 : 1.55);
    const hw = Math.max(1.5, maxHalf * Math.pow((k + 1) / tiers, 0.85) + rng.range(-0.8, 0.8));
    const droop = th * rng.range(0.22, 0.35);
    for (let y = Math.floor(yTop); y <= Math.ceil(yTop + th + droop); y++) {
      if (y < 0 || y >= h) continue;
      const t = (y - yTop) / th;
      for (let x = Math.floor(cx - hw - 2); x <= Math.ceil(cx + hw + 2); x++) {
        const u = (x + 0.5 - cx) / hw;
        const au = Math.abs(u);
        if (au > 1.05) continue;
        // Верхняя кромка — конус; нижняя — свисающие к краям лапы с зубцами хвои.
        const upper = Math.pow(au, 1.25) * 0.95;
        const saw = (hash(Math.floor((x + k * 3) / 2), k, s) - 0.5) * 0.28 + Math.sin(x * 1.9 + k) * 0.08;
        const lower = 1 + droop / th * Math.pow(au, 1.6) - 0.12 * (1 - au) + saw;
        if (t < upper || t > lower) continue;
        const i = y * w + x;
        if (tierOf[i] >= 0 && tierOf[i] < k && t < upper + 0.25) continue;
        // Освещение: левая часть и верх яруса светлее, под верхним ярусом — тень.
        let v = 0.58 - u * 0.24;
        v += (0.5 - Math.abs(t - 0.5)) * 0.18;
        v -= smooth(0.72, 1.05, t) * 0.26;
        if (t < upper + 0.2) v -= 0.08;
        v += (vnoise(x / 1.6, y / 1.1, s + k) - 0.5) * 0.3;
        v += (hash(x, y, s + 3) - 0.5) * 0.08;
        tierOf[i] = k;
        put(m, x, y, LEAF, quant(v, LEAF_CUTS));
      }
    }
  }
  // Глубокая тень под каждым ярусом (там, где начинается следующий).
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const k = tierOf[i];
      if (k < 0) continue;
      const up = tierOf[i - w];
      if (up >= 0 && up < k) {
        m.tone[i] = Math.max(0, Math.min(m.tone[i], 1) - (x > cx ? 1 : 0));
        if (y + 1 < h && tierOf[i + w] === k) m.tone[i + w] = Math.max(0, m.tone[i + w] - 1);
      }
    }
  }
  // Верхушка.
  put(m, cx, 0, LEAF, 3);
  if (snow) snowify(m, rng, 2);
  m.ax = cx;
  return m;
}

/** Сосна: высокий голый ствол с рыжей корой и плоскими клубами хвои наверху. */
export function makeTallPine(rng: Rng, height: number, snow = false): TreeMasks {
  const crownR = Math.max(5, Math.round(height * rng.range(0.16, 0.2)));
  const w = crownR * 3 + 18;
  const h = height + 10;
  const m = blank(w, h);
  const cx = Math.floor(w / 2);
  const crownBase = Math.round(h * rng.range(0.32, 0.42));
  const tb = Math.max(3, Math.round(height / 22));
  trunk(m, cx, Math.round(h * 0.08), h - 1, tb + 1, 2, rng);
  const tips: Array<[number, number]> = [];
  const nb = rng.int(4, 6);
  for (let i = 0; i < nb; i++) {
    const y0 = Math.round(h * 0.1 + (crownBase - h * 0.1) * (i / nb) + rng.range(0, 4));
    const dir = i % 2 === 0 ? -1 : 1;
    const len = crownR * rng.range(0.6, 1.1) * (0.6 + 0.4 * (i / nb));
    const x1 = cx + dir * len;
    const y1 = y0 - rng.range(1, 5);
    limb(m, cx, y0 + 2, x1, y1, 2, 1);
    tips.push([x1, y1]);
  }
  const bark: TreeMasks = { ...m, mat: m.mat.slice(), tone: m.tone.slice() };
  const clumps: Clump[] = [];
  for (const [x, y] of tips) clumps.push({ x, y: y - 1, r: crownR * rng.range(0.42, 0.6), z: rng.range(-2, 3), sq: rng.range(0.45, 0.6), k: rng.int(7, 11), ph: rng.range(0, 6.28) });
  clumps.push({ x: cx, y: Math.round(h * 0.08), r: crownR * 0.5, z: 2, sq: 0.6, k: 8, ph: 1 });
  crown(m, clumps, { seed: rng.int(0, 1 << 20), texture: 0.2, bottomDark: 0.42, holes: 0, grain: Math.max(2.5, Math.min(4, height / 32)) });
  overlayCrown(m, bark);
  if (snow) snowify(m, rng, 2);
  m.ax = cx;
  return m;
}

export function makeBush(rng: Rng, width: number, height: number, snow = false): TreeMasks {
  const w = width + 6;
  const h = height + 3;
  const m = blank(w, h);
  const n = Math.max(3, Math.round(width / 5));
  const clumps: Clump[] = [];
  for (let i = 0; i < n; i++) {
    const x = 3 + (i + 0.5) * (width / n) + rng.range(-1, 1);
    const r = rng.range(height * 0.45, height * 0.68);
    clumps.push({ x, y: h - r * 0.75, r, z: rng.range(-1, 2) + (1 - Math.abs(i / (n - 1 || 1) - 0.5) * 2) * 2, sq: rng.range(0.8, 0.95), k: rng.int(5, 8), ph: rng.range(0, 6.28) });
  }
  crown(m, clumps, { seed: rng.int(0, 1 << 20), texture: 0.2, bottomDark: 0.35, holes: 0, grain: Math.max(2.2, height / 4) });
  if (snow) snowify(m, rng, 2);
  m.ax = Math.floor(w / 2);
  return m;
}

export function makeDead(rng: Rng, height: number): TreeMasks {
  const w = Math.round(height * 0.7) + 8;
  const h = height + 1;
  const m = blank(w, h);
  const cx = Math.floor(w / 2);
  const fork = Math.round(h * 0.35);
  trunk(m, cx, fork, h - 1, 4, 3, rng);
  for (let i = 0; i < 4; i++) {
    const a = rng.range(-1.1, 1.1);
    const len = height * rng.range(0.2, 0.34);
    const y0 = fork + rng.range(0, h * 0.15);
    const x1 = cx + Math.sin(a) * len;
    const y1 = y0 - Math.cos(a) * len;
    limb(m, cx, y0, x1, y1, 2.5, 1);
    const b = a + rng.range(-0.8, 0.8);
    limb(m, x1, y1, x1 + Math.sin(b) * len * 0.4, y1 - Math.cos(b) * len * 0.4, 1, 0.6);
  }
  m.ax = cx;
  return m;
}

/** Обрезать пустые поля сверху и по бокам; низ (основание ствола) остаётся. */
function trim(m: TreeMasks): TreeMasks {
  let x0 = m.w;
  let x1 = -1;
  let y0 = m.h;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!m.mat[y * m.w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
    }
  }
  if (x1 < 0) return m;
  x0 = Math.max(0, x0 - 1);
  x1 = Math.min(m.w - 1, x1 + 1);
  y0 = Math.max(0, y0 - 1);
  const w = x1 - x0 + 1;
  const h = m.h - y0;
  if (w === m.w && h === m.h) return m;
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y + y0) * m.w + x + x0;
      out.mat[y * w + x] = m.mat[i];
      out.tone[y * w + x] = m.tone[i];
    }
  }
  out.ax = m.ax - x0;
  return out;
}

/** Сила мелкой фактуры (для дальних слоёв меньше — иначе рябит). */
let DETAIL = 1;

export function makeTree(kind: TreeKind, rng: Rng, height: number, snow: boolean, leafless: boolean, detail = 1): TreeMasks {
  DETAIL = detail;
  const m = trim(makeTreeRaw(kind, rng, height, snow, leafless));
  DETAIL = 1;
  return m;
}

function makeTreeRaw(kind: TreeKind, rng: Rng, height: number, snow: boolean, leafless: boolean): TreeMasks {
  switch (kind) {
    case 'pine':
      return makePine(rng, height, snow);
    case 'tallpine':
      return makeTallPine(rng, height, snow);
    case 'oak':
      return makeOak(rng, height, snow, leafless);
    case 'maple':
      return makeOak(rng, height, snow, leafless, true);
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

/** Маски → три канвы (основа, тень, свет) для раскраски цветами фонового слоя. */
export function masksToCanvases(m: TreeMasks): { base: HTMLCanvasElement; shade: HTMLCanvasElement; light: HTMLCanvasElement } {
  const [b, bc] = makeCanvas(m.w, m.h);
  const [s, sc] = makeCanvas(m.w, m.h);
  const [l, lc] = makeCanvas(m.w, m.h);
  const bi = bc.createImageData(m.w, m.h);
  const si = sc.createImageData(m.w, m.h);
  const li = lc.createImageData(m.w, m.h);
  for (let i = 0; i < m.w * m.h; i++) {
    const mt = m.mat[i];
    if (!mt) continue;
    const o = i * 4;
    bi.data[o] = bi.data[o + 1] = bi.data[o + 2] = bi.data[o + 3] = 255;
    const t = m.tone[i];
    let shade = false;
    let light = false;
    if (mt === SNOW || mt === ACCENT) light = true;
    else if (mt === BARK) shade = t <= 2;
    else if (t <= 1) shade = true;
    else if (t >= 3) light = true;
    if (shade) si.data[o] = si.data[o + 1] = si.data[o + 2] = si.data[o + 3] = 255;
    if (light) li.data[o] = li.data[o + 1] = li.data[o + 2] = li.data[o + 3] = 255;
  }
  bc.putImageData(bi, 0, 0);
  sc.putImageData(si, 0, 0);
  lc.putImageData(li, 0, 0);
  return { base: b, shade: s, light: l };
}

/** Палитра дерева игрового слоя: 4 тона коры, 5 тонов листвы, 3 тона снега, 3 тона цветов. */
export interface TreePalette {
  bark: readonly string[];
  leaf: readonly string[];
  snow: readonly string[];
  accent?: readonly string[];
}

/** Полноцветное дерево для игрового слоя. */
export function paintTree(m: TreeMasks, p: TreePalette): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(m.w, m.h);
  const img = ctx.createImageData(m.w, m.h);
  const parse = (hexStr: string): number => parseInt(hexStr.slice(1), 16);
  const tables: number[][] = [[], p.bark.map(parse), p.leaf.map(parse), p.snow.map(parse), (p.accent ?? p.leaf).map(parse)];
  for (let i = 0; i < m.w * m.h; i++) {
    const mt = m.mat[i];
    if (!mt) continue;
    const tab = tables[mt];
    const v = tab[Math.min(tab.length - 1, m.tone[i])];
    const o = i * 4;
    img.data[o] = (v >> 16) & 255;
    img.data[o + 1] = (v >> 8) & 255;
    img.data[o + 2] = v & 255;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

export { blossom as addBlossom };
