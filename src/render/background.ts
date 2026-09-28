// Фон: небо, солнце, луна, звёзды, облака и пять слоёв леса с параллаксом.
// Слои хранятся как маски и перекрашиваются при смене атмосферы — так
// дальние деревья становятся синее к горизонту и темнеют ночью.

import { Rng, fxRng } from '../engine/rng';
import { fbm1, hash2, clamp } from '../engine/math';
import { makeCanvas, rgb, type RGB, mix, hex } from '../engine/sprite';
import type { Atmosphere, LayerTone, Season } from './atmosphere';
import { LAYER_COUNT } from './atmosphere';
import { makeTree, masksToCanvases, makeBush, type TreeKind } from './treegen';

interface AtlasItem {
  x: number;
  w: number;
  h: number;
  ax: number;
}

interface LayerDef {
  parallax: number;
  /** Смещение основания слоя над линией земли. */
  lift: number;
  cell: number;
  perCell: [number, number];
  kinds: Array<[TreeKind, number]>;
  heights: [number, number];
  variants: number;
  ridge?: { base: number; amp: number; scale: number; snowCaps?: boolean };
}

const LAYERS: LayerDef[] = [
  { parallax: 0.05, lift: 30, cell: 200, perCell: [0, 0], kinds: [], heights: [0, 0], variants: 0, ridge: { base: 10, amp: 46, scale: 180, snowCaps: true } },
  { parallax: 0.14, lift: 22, cell: 60, perCell: [4, 7], kinds: [['pine', 3], ['oak', 1]], heights: [12, 26], variants: 14, ridge: { base: 8, amp: 26, scale: 160 } },
  { parallax: 0.28, lift: 15, cell: 90, perCell: [4, 7], kinds: [['pine', 3], ['oak', 2], ['birch', 1], ['tallpine', 1]], heights: [30, 60], variants: 16, ridge: { base: 3, amp: 8, scale: 120 } },
  { parallax: 0.46, lift: 8, cell: 120, perCell: [2, 5], kinds: [['pine', 3], ['oak', 3], ['birch', 1], ['maple', 1], ['tallpine', 1]], heights: [48, 92], variants: 18 },
  { parallax: 0.66, lift: 3, cell: 210, perCell: [1, 2], kinds: [['pine', 2], ['oak', 3], ['birch', 1], ['maple', 1], ['tallpine', 1]], heights: [64, 116], variants: 16 },
];

const RIDGE_PERIOD = 1024;

class Layer {
  readonly def: LayerDef;
  readonly index: number;
  private maskBase!: HTMLCanvasElement;
  private maskShade!: HTMLCanvasElement;
  private maskLight!: HTMLCanvasElement;
  /** Отдельные маски хвойных — им свой, вечнозелёный тон. */
  private everBase!: HTMLCanvasElement;
  private everShade!: HTMLCanvasElement;
  private everLight!: HTMLCanvasElement;
  private colored!: HTMLCanvasElement;
  private coloredCtx!: CanvasRenderingContext2D;
  private scratch!: HTMLCanvasElement;
  private scratchCtx!: CanvasRenderingContext2D;
  private items: AtlasItem[] = [];
  private ridgeItem: AtlasItem | null = null;
  private lastTone = '';
  private readonly seed: number;

  constructor(def: LayerDef, index: number, seed: number, season: Season) {
    this.def = def;
    this.index = index;
    this.seed = seed;
    this.build(season);
  }

  build(season: Season): void {
    const def = this.def;
    const rng = new Rng(this.seed * 31 + this.index * 977);
    const snow = season === 'winter';
    const leafless = season === 'winter';
    const trees: ReturnType<typeof masksToCanvases>[] = [];
    const metas: Array<{ w: number; h: number; ax: number; ever: boolean }> = [];
    const totalWeight = def.kinds.reduce((s, [, w]) => s + w, 0);
    for (let i = 0; i < def.variants; i++) {
      let r = rng.next() * totalWeight;
      let kind: TreeKind = def.kinds[0][0];
      for (const [k, w] of def.kinds) {
        if ((r -= w) <= 0) {
          kind = k;
          break;
        }
      }
      const h = Math.round(rng.range(def.heights[0], def.heights[1]));
      const detail = [0, 0.15, 0.3, 0.5, 0.7][this.index] ?? 0.5;
      const m = kind === 'bush' ? makeBush(rng, h * 2, h, snow) : makeTree(kind, rng, h, snow, leafless && kind !== 'pine' && kind !== 'tallpine', detail);
      trees.push(masksToCanvases(m));
      metas.push({ w: m.w, h: m.h, ax: m.ax, ever: kind === 'pine' || kind === 'tallpine' });
    }

    let ridge: ReturnType<typeof this.makeRidge> | null = null;
    if (def.ridge) ridge = this.makeRidge(rng, snow);

    const width = metas.reduce((s, m) => s + m.w + 1, 0) + (ridge ? RIDGE_PERIOD + 1 : 0) + 1;
    const height = Math.max(ridge ? ridge.h : 1, ...metas.map((m) => m.h), 1);
    const [b, bc] = makeCanvas(width, height);
    const [s, sc] = makeCanvas(width, height);
    const [l, lc] = makeCanvas(width, height);
    const [eb, ebc] = makeCanvas(width, height);
    const [es, esc] = makeCanvas(width, height);
    const [el, elc] = makeCanvas(width, height);
    let x = 0;
    this.items = [];
    if (ridge) {
      bc.drawImage(ridge.base, x, height - ridge.h);
      sc.drawImage(ridge.shade, x, height - ridge.h);
      lc.drawImage(ridge.light, x, height - ridge.h);
      this.ridgeItem = { x, w: RIDGE_PERIOD, h: ridge.h, ax: 0 };
      x += RIDGE_PERIOD + 1;
    } else {
      this.ridgeItem = null;
    }
    trees.forEach((t, i) => {
      const m = metas[i];
      (m.ever ? ebc : bc).drawImage(t.base, x, height - m.h);
      (m.ever ? esc : sc).drawImage(t.shade, x, height - m.h);
      (m.ever ? elc : lc).drawImage(t.light, x, height - m.h);
      this.items.push({ x, w: m.w, h: m.h, ax: m.ax });
      x += m.w + 1;
    });
    this.maskBase = b;
    this.maskShade = s;
    this.maskLight = l;
    this.everBase = eb;
    this.everShade = es;
    this.everLight = el;
    [this.colored, this.coloredCtx] = makeCanvas(width, height);
    [this.scratch, this.scratchCtx] = makeCanvas(width, height);
    this.lastTone = '';
  }

  private makeRidge(rng: Rng, snow: boolean) {
    const r = this.def.ridge!;
    const heights: number[] = [];
    const seed = rng.int(0, 100000);
    for (let x = 0; x < RIDGE_PERIOD; x++) {
      // Бесшовная периодическая «гряда».
      const a = fbm1(x / r.scale, seed, 5);
      const b = fbm1((x + RIDGE_PERIOD) / r.scale, seed, 5);
      const t = x / RIDGE_PERIOD;
      const v = a * (1 - t) + b * t;
      heights.push(Math.round(r.base + Math.pow(v, 1.6) * r.amp * 1.6));
    }
    const h = Math.max(...heights) + 2;
    const [base, bc] = makeCanvas(RIDGE_PERIOD, h);
    const [shade, sc] = makeCanvas(RIDGE_PERIOD, h);
    const [light, lc] = makeCanvas(RIDGE_PERIOD, h);
    bc.fillStyle = sc.fillStyle = lc.fillStyle = '#fff';
    const smooth = heights.map((_, x) => {
      let acc = 0;
      for (let k = -6; k <= 6; k++) acc += heights[(x + k + RIDGE_PERIOD) % RIDGE_PERIOD];
      return acc / 13;
    });
    for (let x = 0; x < RIDGE_PERIOD; x++) {
      const top = h - heights[x];
      bc.fillRect(x, top, 1, heights[x]);
      const slope = smooth[(x + 2) % RIDGE_PERIOD] - smooth[(x - 2 + RIDGE_PERIOD) % RIDGE_PERIOD];
      // Склоны, обращённые вправо (поднимающиеся к востоку), — в тени.
      if (slope > 0.15) {
        const depth = Math.min(heights[x], Math.round(4 + slope * 10));
        sc.fillRect(x, top + 1, 1, depth);
        if (slope > 0.6) sc.fillRect(x, top + depth + 1, 1, Math.min(heights[x] - depth - 1, 8));
      }
      // Верхний свет и снежные шапки.
      const capH = r.snowCaps && heights[x] > r.base + r.amp * 0.7 ? 2 + Math.round((heights[x] - r.base - r.amp * 0.7) * 0.35) : snow ? 2 : 1;
      lc.fillRect(x, top, 1, capH);
    }
    void rng;
    return { base, shade, light, h };
  }

  recolor(tone: LayerTone, ever: LayerTone): void {
    const key = [tone.base, tone.shade, tone.light, ever.base, ever.shade, ever.light].map((c) => c.map(Math.round).join(',')).join('|');
    if (key === this.lastTone) return;
    this.lastTone = key;
    const c = this.coloredCtx;
    const w = this.colored.width;
    const h = this.colored.height;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h);
    for (const [mask, color] of [
      [this.maskBase, tone.base],
      [this.maskShade, tone.shade],
      [this.maskLight, tone.light],
      [this.everBase, ever.base],
      [this.everShade, ever.shade],
      [this.everLight, ever.light],
    ] as const) {
      const s = this.scratchCtx;
      s.globalCompositeOperation = 'source-over';
      s.clearRect(0, 0, w, h);
      s.drawImage(mask, 0, 0);
      s.globalCompositeOperation = 'source-in';
      s.fillStyle = rgb(color);
      s.fillRect(0, 0, w, h);
      c.drawImage(this.scratch, 0, 0);
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, screenW: number, groundY: number, tone: { base: RGB }): void {
    const def = this.def;
    const lx = camX * def.parallax; // центр экрана в координатах слоя
    const left = lx - screenW / 2;
    const right = lx + screenW / 2;
    const baseY = groundY - def.lift;
    const atlasH = this.colored.height;

    // Заливка под слоем до земли, чтобы между слоями не было щелей.
    ctx.fillStyle = rgb(tone.base);
    ctx.fillRect(0, baseY - 1, screenW, groundY - baseY + 12);

    if (this.ridgeItem) {
      const it = this.ridgeItem;
      const start = Math.floor(left / RIDGE_PERIOD) * RIDGE_PERIOD;
      for (let x0 = start; x0 < right; x0 += RIDGE_PERIOD) {
        const sx = Math.round(x0 - left);
        ctx.drawImage(this.colored, it.x, atlasH - it.h, it.w, it.h, sx, baseY - it.h + 1, it.w, it.h);
      }
    }
    if (!this.items.length) return;

    const cellW = def.cell;
    const maxW = 200;
    const c0 = Math.floor((left - maxW) / cellW);
    const c1 = Math.floor((right + maxW) / cellW);
    for (let c = c0; c <= c1; c++) {
      const r = new Rng(Math.floor(hash2(c, this.seed + this.index * 101) * 4294967296));
      const n = r.int(def.perCell[0], def.perCell[1]);
      for (let i = 0; i < n; i++) {
        const px = c * cellW + r.next() * cellW;
        const it = this.items[r.int(0, this.items.length - 1)];
        const dy = r.int(0, 3);
        const sx = Math.round(px - left - it.ax);
        if (sx > screenW || sx + it.w < 0) continue;
        ctx.drawImage(this.colored, it.x, atlasH - it.h, it.w, it.h, sx, baseY - it.h + dy + 1, it.w, it.h);
      }
    }
  }
}

interface Cloud {
  x: number;
  y: number;
  speed: number;
  item: AtlasItem;
  /** 0 — дальний слой (меньше, бледнее, медленнее), 1 — ближний. */
  layer: number;
}

interface Star {
  x: number;
  y: number;
  b: number;
  tw: number;
  big: boolean;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

/** Облачные маски: тень, основа, свет, кромка со стороны солнца. */
const CLOUD_TONES = 4;

export class Background {
  private layers: Layer[] = [];
  private stars: Star[] = [];
  private clouds: Cloud[] = [];
  private cloudMasks: HTMLCanvasElement[] = [];
  private cloudColored!: HTMLCanvasElement;
  private cloudColoredCtx!: CanvasRenderingContext2D;
  private cloudScratch!: [HTMLCanvasElement, CanvasRenderingContext2D];
  private cloudTone = '';
  private season: Season;
  private recolorTimer = 0;
  private milky!: HTMLCanvasElement;
  private meteors: Meteor[] = [];
  private aurora: [HTMLCanvasElement, CanvasRenderingContext2D] | null = null;
  private auroraT = 0;
  private auroraStrip: HTMLCanvasElement | null = null;
  private lastTime = 0;

  constructor(seed: number, season: Season) {
    this.season = season;
    for (let i = 0; i < LAYERS.length; i++) this.layers.push(new Layer(LAYERS[i], i, seed, season));
    const rng = new Rng(seed ^ 0xabcdef);
    for (let i = 0; i < 190; i++) {
      this.stars.push({ x: rng.next(), y: Math.pow(rng.next(), 1.4), b: rng.range(0.3, 1), tw: rng.range(0.5, 3), big: rng.chance(0.07) });
    }
    this.buildClouds(rng);
    this.buildMilkyWay(rng);
  }

  setSeason(season: Season): void {
    if (season === this.season) return;
    this.season = season;
    for (const l of this.layers) l.build(season);
  }

  /** Кучевые облака из освещённых «шаров» и перистые полосы. */
  private buildClouds(rng: Rng): void {
    const shapes: Array<{ w: number; h: number; tone: Uint8Array }> = [];
    // Свет почти сверху: тона ложатся спокойными слоями, без косой «штриховки».
    const LX = -0.3;
    const LY = -0.82;
    const LZ = 0.5;
    for (let i = 0; i < 12; i++) {
      const stratus = i >= 8;
      const w = stratus ? rng.int(90, 200) : rng.int(40, 112);
      const hb = stratus ? rng.int(5, 9) : rng.int(Math.max(14, Math.round(w * 0.2)), Math.max(18, Math.round(w * 0.32)));
      const circles: Array<[number, number, number]> = [];
      if (stratus) {
        // Длинная полоса: тоньше к концам, с редкими утолщениями.
        const n = Math.round(w / 9);
        for (let b = 0; b < n; b++) {
          const t = (b + 0.5) / n;
          const r = hb * rng.range(0.45, 0.9) * (0.45 + 0.55 * Math.sin(Math.PI * t));
          circles.push([t * w, hb - r * 0.9 + rng.range(-1, 1), r]);
        }
      } else {
        // Крупные шары в середине, мелкие по краям.
        const n = rng.int(5, 9);
        for (let b = 0; b < n; b++) {
          const t = (b + 0.5) / n;
          const bell = Math.sin(Math.PI * t);
          const r = hb * (0.28 + 0.42 * bell) * rng.range(0.85, 1.15);
          circles.push([t * w + rng.range(-3, 3), hb - r * rng.range(0.75, 1.0) - 1, r]);
        }
        // Верхние «шапки».
        const caps = rng.int(1, 3);
        for (let b = 0; b < caps; b++) {
          const x = rng.range(0.3, 0.7) * w;
          const r = hb * rng.range(0.3, 0.45);
          circles.push([x, hb * rng.range(0.3, 0.5), r]);
        }
      }
      // Холст по реальной высоте шаров: макушки не обрезаются в «полку».
      const top = Math.min(...circles.map(([, cy, r]) => cy - r));
      const shift = Math.max(0, Math.ceil(-top) + 1);
      for (const c of circles) c[1] += shift;
      const h = hb + shift;
      const tone = new Uint8Array(w * h);
      const zb = new Float32Array(w * h).fill(-1);
      // Низ почти ровный, но концы облака приподняты и скруглены.
      const base = (x: number) => h - 1 - (stratus ? 0 : Math.round(3 * Math.pow(Math.abs((x + 0.5) / w - 0.5) * 2, 3)));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (y > base(x)) continue;
          for (const [cx, cy, r] of circles) {
            const dx = (x + 0.5 - cx) / (r * (stratus ? 2.2 : 1.25));
            const dy = (y + 0.5 - cy) / r;
            const d2 = dx * dx + dy * dy;
            if (d2 > 1) continue;
            const z = Math.sqrt(1 - d2) * r;
            const i2 = y * w + x;
            if (z <= zb[i2]) continue;
            zb[i2] = z;
            const nz = Math.sqrt(1 - d2);
            let lum = 0.3 + 0.7 * Math.max(0, dx * LX + dy * LY + nz * LZ);
            lum -= Math.max(0, (y - shift - hb * 0.62) / hb) * 0.9; // тень снизу
            lum += (hash2(x >> 1, (y >> 1) + i * 97) - 0.5) * 0.08;
            tone[i2] = lum < 0.38 ? 1 : lum < 0.62 ? 2 : 3;
          }
        }
      }
      // Тень у основания и кромка со стороны солнца.
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i2 = y * w + x;
          if (!tone[i2]) continue;
          if (!stratus && y >= base(x) - 1 && tone[i2] > 1) tone[i2] = 1;
          const up = y === 0 || !tone[i2 - w];
          const left = x === 0 || !tone[i2 - 1];
          if ((up || left) && tone[i2] >= 2) tone[i2] = 4;
        }
      }
      shapes.push({ w, h, tone });
    }
    const width = shapes.reduce((s, c) => s + c.w + 1, 0);
    const height = Math.max(...shapes.map((s) => s.h));
    const masks = Array.from({ length: CLOUD_TONES }, () => makeCanvas(width, height));
    const datas = masks.map(([, c]) => c.createImageData(width, height));
    const items: AtlasItem[] = [];
    let x = 0;
    for (const sh of shapes) {
      for (let y = 0; y < sh.h; y++) {
        for (let xx = 0; xx < sh.w; xx++) {
          const t = sh.tone[y * sh.w + xx];
          if (!t) continue;
          const o = ((height - sh.h + y) * width + x + xx) * 4;
          const d = datas[t - 1].data;
          d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 255;
        }
      }
      items.push({ x, w: sh.w, h: sh.h, ax: 0 });
      x += sh.w + 1;
    }
    masks.forEach(([, c], i) => c.putImageData(datas[i], 0, 0));
    this.cloudMasks = masks.map(([cv]) => cv);
    [this.cloudColored, this.cloudColoredCtx] = makeCanvas(width, height);
    this.cloudScratch = makeCanvas(width, height);
    for (let i = 0; i < 14; i++) {
      const layer = i < 6 ? 0 : 1;
      const item = items[layer === 0 ? rng.int(0, items.length - 1) : rng.int(0, 7)];
      this.clouds.push({ x: rng.range(0, 2600), y: layer === 0 ? rng.range(0.12, 0.62) : rng.range(0.04, 0.46), speed: rng.range(1.5, 5) * (layer ? 1 : 0.55), item, layer });
    }
    this.clouds.sort((a, b) => a.layer - b.layer);
  }

  /** Млечный путь — пыльная полоса звёзд. */
  private buildMilkyWay(rng: Rng): void {
    const W = 900;
    const Hh = 220;
    const [c, ctx] = makeCanvas(W, Hh);
    const img = ctx.createImageData(W, Hh);
    for (let i = 0; i < 5200; i++) {
      const t = rng.next();
      const x = t * W;
      const center = Hh * (0.85 - t * 0.7);
      const off = (rng.next() + rng.next() + rng.next() - 1.5) * 26;
      const y = Math.round(center + off);
      if (y < 0 || y >= Hh) continue;
      const o = (y * W + Math.floor(x)) * 4;
      const b = 120 + Math.floor(rng.next() * 135);
      img.data[o] = b;
      img.data[o + 1] = b;
      img.data[o + 2] = Math.min(255, b + 30);
      img.data[o + 3] = Math.floor(40 + rng.next() * 90 * (1 - Math.abs(off) / 40));
    }
    ctx.putImageData(img, 0, 0);
    this.milky = c;
  }

  private recolorClouds(a: Atmosphere): void {
    const rim = mix(a.cloudLight, a.bloodMoon ? a.moonColor : a.starAlpha > 0.5 ? hex('#aab8e8') : hex('#fff4dc'), 0.45);
    const cols: RGB[] = [a.cloudShade, a.cloudBase, a.cloudLight, rim];
    const key = cols.map((c) => c.map(Math.round).join(',')).join('|');
    if (key === this.cloudTone) return;
    this.cloudTone = key;
    const c = this.cloudColoredCtx;
    const w = this.cloudColored.width;
    const h = this.cloudColored.height;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h);
    const [sc, scc] = this.cloudScratch;
    this.cloudMasks.forEach((mask, i) => {
      scc.globalCompositeOperation = 'source-over';
      scc.clearRect(0, 0, w, h);
      scc.drawImage(mask, 0, 0);
      scc.globalCompositeOperation = 'source-in';
      scc.fillStyle = rgb(cols[i]);
      scc.fillRect(0, 0, w, h);
      c.drawImage(sc, 0, 0);
    });
  }

  update(dt: number): void {
    for (const c of this.clouds) c.x += c.speed * dt;
    this.recolorTimer -= dt;
    for (const m of this.meteors) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life -= dt;
    }
    this.meteors = this.meteors.filter((m) => m.life > 0);
  }

  /** Небо, светила и облака. */
  drawSky(ctx: CanvasRenderingContext2D, a: Atmosphere, camX: number, w: number, horizonY: number, time: number): void {
    const dt = Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    const g = ctx.createLinearGradient(0, 0, 0, horizonY);
    g.addColorStop(0, rgb(a.skyTop));
    g.addColorStop(0.55, rgb(a.skyMid));
    g.addColorStop(1, rgb(a.skyHorizon));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, horizonY + 40);

    // Звёзды и Млечный путь.
    if (a.starAlpha > 0.01) {
      ctx.globalAlpha = a.starAlpha * 0.55;
      const mx = -((camX * 0.01) % 300) - 200;
      ctx.drawImage(this.milky, Math.round(mx), 0, this.milky.width, Math.round(horizonY * 0.95));
      ctx.globalAlpha = 1;
      const shift = camX * 0.01;
      for (const s of this.stars) {
        const tw = 0.55 + 0.45 * Math.sin(time * s.tw + s.x * 100);
        const alpha = a.starAlpha * s.b * tw;
        if (alpha < 0.05) continue;
        const sx = Math.round((((s.x * w * 1.3 - shift) % (w * 1.3)) + w * 1.3) % (w * 1.3));
        const sy = Math.round(s.y * horizonY * 0.85);
        if (sx >= w) continue;
        ctx.fillStyle = `rgba(255,250,235,${alpha.toFixed(3)})`;
        ctx.fillRect(sx, sy, 1, 1);
        if (s.big && alpha > 0.4) {
          ctx.fillStyle = `rgba(255,250,235,${(alpha * 0.45).toFixed(3)})`;
          ctx.fillRect(sx - 1, sy, 1, 1);
          ctx.fillRect(sx + 1, sy, 1, 1);
          ctx.fillRect(sx, sy - 1, 1, 1);
          ctx.fillRect(sx, sy + 1, 1, 1);
        }
      }
      // Падающие звёзды.
      if (a.starAlpha > 0.6 && !a.bloodMoon && fxRng.chance(dt * 0.06)) {
        const dir = fxRng.chance(0.5) ? -1 : 1;
        this.meteors.push({ x: fxRng.range(0.15, 0.85) * w, y: fxRng.range(0.05, 0.35) * horizonY, vx: dir * fxRng.range(90, 150), vy: fxRng.range(35, 60), life: fxRng.range(0.5, 0.9) });
      }
      for (const m of this.meteors) {
        const len = 7;
        for (let k = 0; k < len; k++) {
          const t = k / len;
          ctx.fillStyle = `rgba(255,250,235,${(a.starAlpha * Math.min(1, m.life * 2) * (1 - t) * 0.9).toFixed(3)})`;
          ctx.fillRect(Math.round(m.x - m.vx * t * 0.06), Math.round(m.y - m.vy * t * 0.06), 1, 1);
        }
      }
    }

    // Северное сияние зимними ночами.
    if (a.aurora > 0.05) this.drawAurora(ctx, a, w, horizonY, time, camX);

    // Солнце и зарево у горизонта на закате/рассвете (за тучами — бледнее).
    ctx.globalAlpha = a.clear;
    if (a.sunH > -0.25) {
      const sx = Math.round(w * a.sunX);
      const sy = Math.round(horizonY - 8 - a.sunH * (horizonY - 34));
      const low = 1 - Math.min(1, Math.max(0, a.sunH) / 0.35);
      if (low > 0) this.glow(ctx, sx, horizonY - 6, 150, mix(a.sunColor, hex('#ff8a3a'), 0.5), 0.28 * low);
      if (a.sunH > -0.05) {
        this.glow(ctx, sx, sy, 46 + low * 20, a.sunColor, 0.35);
        this.disc(ctx, sx, sy, 7 + Math.round(low * 2), rgb(a.sunColor));
      }
    }
    // Луна с фазами (в Кровавую луну — всегда полная и огромная).
    if (a.moonH > -0.05) {
      const mx = Math.round(w * a.moonX);
      const my = Math.round(horizonY - 8 - a.moonH * (horizonY - 40));
      const r = a.bloodMoon ? 13 : 9;
      const lit = a.bloodMoon ? 1 : (1 - Math.cos(a.moonPhase * Math.PI * 2)) / 2;
      this.glow(ctx, mx, my, a.bloodMoon ? 70 : 26 + lit * 18, a.moonColor, (a.bloodMoon ? 0.4 : 0.18) * (0.3 + 0.7 * lit));
      this.moon(ctx, mx, my, r, a);
    }
    ctx.globalAlpha = 1;

    // Облака: дальний слой бледнее и медленнее.
    this.recolorClouds(a);
    const cw = w + 300;
    for (const c of this.clouds) {
      const par = c.layer ? 0.05 : 0.025;
      const x = ((((c.x - camX * par) % 2600) + 2600) % 2600) - 180;
      if (x > cw) continue;
      const it = c.item;
      if (!c.layer) ctx.globalAlpha = 0.72;
      const y = Math.round(c.y * horizonY * (c.layer ? 0.7 : 0.8));
      ctx.drawImage(this.cloudColored, it.x, this.cloudColored.height - it.h, it.w, it.h, Math.round(x), y, it.w, it.h);
      ctx.globalAlpha = 1;
    }
  }

  private moon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, a: Atmosphere): void {
    const f = a.moonPhase;
    const bright = rgb(a.moonColor);
    const dark = a.bloodMoon ? 'rgba(90,10,10,0.9)' : 'rgba(60,70,100,0.35)';
    for (let y = -r; y <= r; y++) {
      const hw = Math.floor(Math.sqrt(r * r - y * y + r * 0.6));
      // Терминатор: растущая луна освещена справа, убывающая — слева.
      const k = Math.cos(f * Math.PI * 2) * hw;
      let x0 = -hw;
      let x1 = hw;
      if (!a.bloodMoon) {
        if (f < 0.5) x0 = Math.round(k);
        else x1 = Math.round(-k);
      }
      ctx.fillStyle = dark;
      ctx.fillRect(cx - hw, cy + y, hw * 2 + 1, 1);
      if (x1 >= x0) {
        ctx.fillStyle = bright;
        ctx.fillRect(cx + x0, cy + y, x1 - x0 + 1, 1);
      }
    }
    // Моря (кратеры) видны на освещённой части.
    ctx.fillStyle = a.bloodMoon ? 'rgba(90,10,10,0.45)' : 'rgba(150,150,140,0.45)';
    const spots: Array<[number, number, number, number]> = [
      [-3, -2, 3, 2],
      [2, 2, 2, 2],
      [-1, 4, 2, 1],
      [3, -4, 2, 1],
    ];
    const f2 = a.moonPhase;
    for (const [x, y, ww, hh] of spots) {
      const onLit = a.bloodMoon || (f2 < 0.5 ? x >= Math.cos(f2 * Math.PI * 2) * r : x <= -Math.cos(f2 * Math.PI * 2) * r);
      if (onLit) ctx.fillRect(cx + x, cy + y, ww, hh);
    }
    if (a.bloodMoon) {
      ctx.fillRect(cx + 4, cy - 5, 3, 2);
      ctx.fillRect(cx - 7, cy + 3, 2, 2);
    }
  }

  /** Северное сияние: занавесы света в половинном разрешении — столбцы из готовой градиентной полоски. */
  private drawAurora(ctx: CanvasRenderingContext2D, a: Atmosphere, w: number, horizonY: number, time: number, camX: number): void {
    const hw = Math.ceil(w / 2);
    const hh = Math.ceil(horizonY / 2);
    if (!this.aurora || this.aurora[0].width !== hw || this.aurora[0].height !== hh) this.aurora = makeCanvas(hw, hh);
    if (!this.auroraStrip) {
      const [c, sctx] = makeCanvas(1, 40);
      const g = sctx.createLinearGradient(0, 0, 0, 40);
      g.addColorStop(0, 'rgba(170,110,230,0)');
      g.addColorStop(0.1, 'rgba(170,110,230,0.8)');
      g.addColorStop(0.28, 'rgba(90,255,160,0.9)');
      g.addColorStop(0.7, 'rgba(70,220,150,0.35)');
      g.addColorStop(1, 'rgba(60,200,140,0)');
      sctx.fillStyle = g;
      sctx.fillRect(0, 0, 1, 40);
      this.auroraStrip = c;
    }
    const [cv, c] = this.aurora;
    if (time - this.auroraT > 0.12 || time < this.auroraT) {
      this.auroraT = time;
      c.clearRect(0, 0, hw, hh);
      const shift = camX * 0.006;
      for (let band = 0; band < 2; band++) {
        for (let x = 0; x < hw; x++) {
          const wx = x + shift * 40;
          const top = hh * (0.14 + band * 0.14) + Math.sin(wx * 0.021 + time * 0.25 + band * 2) * 9 + Math.sin(wx * 0.057 - time * 0.4) * 4;
          const len = 20 + 16 * Math.sin(wx * 0.013 + time * 0.2 + band) ** 2;
          const ray = 0.45 + 0.55 * Math.sin(wx * 0.33 + time * 1.3 + band * 3) ** 2;
          const k = ray * (0.55 + 0.45 * Math.sin(wx * 0.009 - time * 0.15 + band * 4)) * (band ? 0.7 : 1);
          if (k < 0.05) continue;
          c.globalAlpha = Math.min(1, k);
          c.drawImage(this.auroraStrip, x, Math.round(top), 1, Math.round(len));
        }
      }
      c.globalAlpha = 1;
    }
    ctx.globalAlpha = Math.min(1, a.aurora);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(cv, 0, 0, hw * 2, hh * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  private disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
    ctx.fillStyle = color;
    for (let y = -r; y <= r; y++) {
      const half = Math.floor(Math.sqrt(r * r - y * y + r * 0.6));
      ctx.fillRect(cx - half, cy + y, half * 2 + 1, 1);
    }
  }

  private glow(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: RGB, alpha: number): void {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgb(color, alpha));
    g.addColorStop(1, rgb(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  /** Слои леса с дымкой между ними. */
  drawLayers(ctx: CanvasRenderingContext2D, a: Atmosphere, camX: number, w: number, groundY: number, force = false): void {
    if (this.recolorTimer <= 0 || force) {
      for (let i = 0; i < this.layers.length; i++) this.layers[i].recolor(a.layers[i], a.evergreen[i]);
      this.recolorTimer = 0.2;
    }
    for (let i = 0; i < this.layers.length; i++) {
      const tone = a.layers[i];
      this.layers[i].draw(ctx, camX, w, groundY, tone);
      // Дымка у земли после дальних слоёв.
      if (i >= 1 && i <= 3 && a.fogAlpha > 0.01) {
        const top = groundY - 60 + i * 8;
        const g = ctx.createLinearGradient(0, top, 0, groundY);
        const fog = mix(a.fogColor, a.skyHorizon, 0.3);
        g.addColorStop(0, rgb(fog, 0));
        g.addColorStop(1, rgb(fog, clamp(a.fogAlpha * (1.1 - i * 0.18), 0, 0.8)));
        ctx.fillStyle = g;
        ctx.fillRect(0, top, w, groundY - top);
      }
    }
    void LAYER_COUNT;
    void fxRng;
  }
}
