// Фон: небо, солнце, луна, звёзды, облака и пять слоёв леса с параллаксом.
// Слои хранятся как маски и перекрашиваются при смене атмосферы — так
// дальние деревья становятся синее к горизонту и темнеют ночью.

import { Rng, fxRng } from '../engine/rng';
import { fbm1, hash2, clamp } from '../engine/math';
import { makeCanvas, rgb, type RGB, mix } from '../engine/sprite';
import type { Atmosphere, Season } from './atmosphere';
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
  { parallax: 0.28, lift: 15, cell: 90, perCell: [4, 7], kinds: [['pine', 3], ['oak', 2], ['birch', 1]], heights: [30, 60], variants: 16, ridge: { base: 3, amp: 8, scale: 120 } },
  { parallax: 0.46, lift: 8, cell: 120, perCell: [2, 5], kinds: [['pine', 3], ['oak', 3], ['birch', 1]], heights: [48, 92], variants: 18 },
  { parallax: 0.66, lift: 3, cell: 210, perCell: [1, 2], kinds: [['pine', 2], ['oak', 3], ['birch', 1]], heights: [64, 112], variants: 16 },
];

const RIDGE_PERIOD = 1024;

class Layer {
  readonly def: LayerDef;
  readonly index: number;
  private maskBase!: HTMLCanvasElement;
  private maskShade!: HTMLCanvasElement;
  private maskLight!: HTMLCanvasElement;
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
    const metas: Array<{ w: number; h: number; ax: number }> = [];
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
      const m = kind === 'bush' ? makeBush(rng, h * 2, h, snow) : makeTree(kind, rng, h, snow, leafless && kind !== 'pine');
      trees.push(masksToCanvases(m));
      metas.push({ w: m.w, h: m.h, ax: m.ax });
    }

    let ridge: ReturnType<typeof this.makeRidge> | null = null;
    if (def.ridge) ridge = this.makeRidge(rng, snow);

    const width = metas.reduce((s, m) => s + m.w + 1, 0) + (ridge ? RIDGE_PERIOD + 1 : 0) + 1;
    const height = Math.max(ridge ? ridge.h : 1, ...metas.map((m) => m.h), 1);
    const [b, bc] = makeCanvas(width, height);
    const [s, sc] = makeCanvas(width, height);
    const [l, lc] = makeCanvas(width, height);
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
      bc.drawImage(t.base, x, height - m.h);
      sc.drawImage(t.shade, x, height - m.h);
      lc.drawImage(t.light, x, height - m.h);
      this.items.push({ x, w: m.w, h: m.h, ax: m.ax });
      x += m.w + 1;
    });
    this.maskBase = b;
    this.maskShade = s;
    this.maskLight = l;
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

  recolor(tone: { base: RGB; shade: RGB; light: RGB }): void {
    const key = `${tone.base.map(Math.round)}|${tone.shade.map(Math.round)}|${tone.light.map(Math.round)}`;
    if (key === this.lastTone) return;
    this.lastTone = key;
    const c = this.coloredCtx;
    const w = this.colored.width;
    const h = this.colored.height;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h);
    c.drawImage(this.maskBase, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = rgb(tone.base);
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
    for (const [mask, color] of [
      [this.maskShade, tone.shade],
      [this.maskLight, tone.light],
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
}

interface Star {
  x: number;
  y: number;
  b: number;
  tw: number;
  big: boolean;
}

export class Background {
  private layers: Layer[] = [];
  private stars: Star[] = [];
  private clouds: Cloud[] = [];
  private cloudBase!: HTMLCanvasElement;
  private cloudShade!: HTMLCanvasElement;
  private cloudLight!: HTMLCanvasElement;
  private cloudColored!: HTMLCanvasElement;
  private cloudColoredCtx!: CanvasRenderingContext2D;
  private cloudScratch!: [HTMLCanvasElement, CanvasRenderingContext2D];
  private cloudTone = '';
  private season: Season;
  private recolorTimer = 0;

  constructor(seed: number, season: Season) {
    this.season = season;
    for (let i = 0; i < LAYERS.length; i++) this.layers.push(new Layer(LAYERS[i], i, seed, season));
    const rng = new Rng(seed ^ 0xabcdef);
    for (let i = 0; i < 170; i++) {
      this.stars.push({ x: rng.next(), y: Math.pow(rng.next(), 1.4), b: rng.range(0.3, 1), tw: rng.range(0.5, 3), big: rng.chance(0.07) });
    }
    this.buildClouds(rng);
  }

  setSeason(season: Season): void {
    if (season === this.season) return;
    this.season = season;
    for (const l of this.layers) l.build(season);
  }

  private buildClouds(rng: Rng): void {
    const shapes: Array<{ w: number; h: number; base: Uint8Array; tone: Uint8Array }> = [];
    for (let i = 0; i < 7; i++) {
      const w = rng.int(40, 110);
      const h = rng.int(10, 22);
      const base = new Uint8Array(w * h);
      const tone = new Uint8Array(w * h);
      const blobs = rng.int(4, 8);
      const circles: Array<[number, number, number]> = [];
      for (let b = 0; b < blobs; b++) {
        const r = rng.range(h * 0.35, h * 0.6);
        circles.push([rng.range(r, w - r), h - r - rng.range(0, h * 0.25), r]);
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let inside = false;
          for (const [cx, cy, r] of circles) {
            const dx = (x - cx) / (r * 1.5);
            const dy = (y - cy) / r;
            if (dx * dx + dy * dy <= 1) inside = true;
          }
          // Плоское дно облака.
          if (inside && y <= h - 2) base[y * w + x] = 1;
        }
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i2 = y * w + x;
          if (!base[i2]) continue;
          const up = y === 0 || !base[i2 - w];
          const up2 = y < 2 || !base[i2 - 2 * w];
          const down = y === h - 1 || !base[i2 + w];
          if (up || (up2 && hash2(x, y + i * 99) > 0.5)) tone[i2] = 2;
          else if (down || (y > h * 0.62 && hash2(x, y) > 0.35)) tone[i2] = 1;
        }
      }
      shapes.push({ w, h, base, tone });
    }
    const width = shapes.reduce((s, c) => s + c.w + 1, 0);
    const height = Math.max(...shapes.map((s) => s.h));
    const [b, bc] = makeCanvas(width, height);
    const [s, sc] = makeCanvas(width, height);
    const [l, lc] = makeCanvas(width, height);
    const items: AtlasItem[] = [];
    let x = 0;
    for (const sh of shapes) {
      for (let y = 0; y < sh.h; y++) {
        for (let xx = 0; xx < sh.w; xx++) {
          const i2 = y * sh.w + xx;
          if (!sh.base[i2]) continue;
          const yy = height - sh.h + y;
          bc.fillStyle = '#fff';
          bc.fillRect(x + xx, yy, 1, 1);
          if (sh.tone[i2] === 1) {
            sc.fillStyle = '#fff';
            sc.fillRect(x + xx, yy, 1, 1);
          } else if (sh.tone[i2] === 2) {
            lc.fillStyle = '#fff';
            lc.fillRect(x + xx, yy, 1, 1);
          }
        }
      }
      items.push({ x, w: sh.w, h: sh.h, ax: 0 });
      x += sh.w + 1;
    }
    this.cloudBase = b;
    this.cloudShade = s;
    this.cloudLight = l;
    [this.cloudColored, this.cloudColoredCtx] = makeCanvas(width, height);
    this.cloudScratch = makeCanvas(width, height);
    for (let i = 0; i < 9; i++) {
      this.clouds.push({ x: rng.range(0, 2400), y: rng.range(0.08, 0.5), speed: rng.range(1.5, 5), item: rng.pick(items) });
    }
  }

  private recolorClouds(a: Atmosphere): void {
    const key = `${a.cloudBase.map(Math.round)}|${a.cloudLight.map(Math.round)}`;
    if (key === this.cloudTone) return;
    this.cloudTone = key;
    const c = this.cloudColoredCtx;
    const w = this.cloudColored.width;
    const h = this.cloudColored.height;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h);
    c.drawImage(this.cloudBase, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = rgb(a.cloudBase);
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
    const [sc, scc] = this.cloudScratch;
    for (const [mask, col] of [
      [this.cloudShade, a.cloudShade],
      [this.cloudLight, a.cloudLight],
    ] as const) {
      scc.globalCompositeOperation = 'source-over';
      scc.clearRect(0, 0, w, h);
      scc.drawImage(mask, 0, 0);
      scc.globalCompositeOperation = 'source-in';
      scc.fillStyle = rgb(col);
      scc.fillRect(0, 0, w, h);
      c.drawImage(sc, 0, 0);
    }
  }

  update(dt: number): void {
    for (const c of this.clouds) c.x += c.speed * dt;
    this.recolorTimer -= dt;
  }

  /** Небо, светила и облака. */
  drawSky(ctx: CanvasRenderingContext2D, a: Atmosphere, camX: number, w: number, horizonY: number, time: number): void {
    const g = ctx.createLinearGradient(0, 0, 0, horizonY);
    g.addColorStop(0, rgb(a.skyTop));
    g.addColorStop(0.55, rgb(a.skyMid));
    g.addColorStop(1, rgb(a.skyHorizon));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, horizonY + 40);

    // Звёзды.
    if (a.starAlpha > 0.01) {
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
    }

    // Солнце.
    if (a.sunH > -0.05) {
      const sx = Math.round(w * 0.7);
      const sy = Math.round(horizonY - 8 - a.sunH * (horizonY - 34));
      this.glow(ctx, sx, sy, 46, a.sunColor, 0.35);
      this.disc(ctx, sx, sy, 7, rgb(a.sunColor));
    }
    // Луна.
    if (a.moonH > -0.05) {
      const mx = Math.round(w * 0.3);
      const my = Math.round(horizonY - 8 - a.moonH * (horizonY - 40));
      const r = a.bloodMoon ? 13 : 9;
      this.glow(ctx, mx, my, a.bloodMoon ? 70 : 40, a.moonColor, a.bloodMoon ? 0.4 : 0.18);
      this.disc(ctx, mx, my, r, rgb(a.moonColor));
      // Кратеры.
      ctx.fillStyle = a.bloodMoon ? 'rgba(90,10,10,0.45)' : 'rgba(150,150,140,0.45)';
      ctx.fillRect(mx - 3, my - 2, 3, 2);
      ctx.fillRect(mx + 2, my + 2, 2, 2);
      ctx.fillRect(mx - 1, my + 4, 2, 1);
      if (a.bloodMoon) {
        ctx.fillRect(mx + 4, my - 5, 3, 2);
        ctx.fillRect(mx - 7, my + 3, 2, 2);
      }
    }

    // Облака.
    this.recolorClouds(a);
    const cw = w + 300;
    for (const c of this.clouds) {
      const x = ((((c.x - camX * 0.04) % 2400) + 2400) % 2400) - 150;
      if (x > cw) continue;
      const it = c.item;
      ctx.drawImage(this.cloudColored, it.x, this.cloudColored.height - it.h, it.w, it.h, Math.round(x), Math.round(c.y * horizonY * 0.75), it.w, it.h);
    }
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
      for (let i = 0; i < this.layers.length; i++) this.layers[i].recolor(a.layers[i]);
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
