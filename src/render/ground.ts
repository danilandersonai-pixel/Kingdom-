// Полоса земли вдоль острова. Её вид зависит от клеток рельефа: на лугах —
// трава разной высоты (выщипанная конём, отрастающая весной) и цветы, в лесу —
// мох, папоротник, грибы и опавшие листья, в городе — утоптанная земля,
// зимой — снег с сугробами. У воды — береговые камни и камыш.
// Рисуется кусками по 128 пикселей; кусок перерисовывается, когда меняются его клетки.
// Трава и камыш слегка колышутся (три кадра ветра).

import { hash2 } from '../engine/math';
import { makeCanvas } from '../engine/sprite';
import type { Season } from './atmosphere';

export const GROUND_H = 11;
/** Сколько пикселей растительности может торчать над линией земли. */
export const GRASS_UP = 16;
const CHUNK = 128;
const H = GRASS_UP + GROUND_H;
const CELL = 13;

/** Что земле нужно знать о рельефе (см. game/terrain). */
export interface TerrainView {
  readonly left: number;
  readonly cells: number;
  readonly forest: Uint8Array;
  readonly grass: Float32Array;
  readonly blocked: Uint8Array;
  readonly bush: Uint8Array;
}

interface Pal {
  /** Дёрн сверху почвы: 3 тона. */
  turf: string[];
  /** Лесная подстилка: 3 тона. */
  moss: string[];
  /** Утоптанная земля. */
  path: string[];
  soil: string[];
  stone: string[];
  blade: string[];
  tip: string;
  flowers: string[];
  leaves: string[];
  reed: string[];
  cattail: string;
  fern: string[];
}

const PAL: Record<Season, Pal> = {
  spring: {
    turf: ['#4f8a38', '#5f9c42', '#3f7230'],
    moss: ['#3a5a2c', '#2e4a26', '#4a6a34'],
    path: ['#6a5238', '#5a4430', '#7a6044'],
    soil: ['#3e2c1f', '#35261b', '#2c2017', '#46331f'],
    stone: ['#3a3634', '#5c5652', '#7c7670', '#9a948c'],
    blade: ['#4f8a38', '#62a044', '#3e7230', '#78b050'],
    tip: '#a6d466',
    flowers: ['#f4f0e0', '#f2d44a', '#e89ab8', '#8aa8e8', '#f4f0e0'],
    leaves: [],
    reed: ['#4a7a34', '#5e9040', '#3a6228'],
    cattail: '#6a4a2a',
    fern: ['#3e7a30', '#56963c', '#2e5e26'],
  },
  summer: {
    turf: ['#5a8434', '#6a9640', '#48702c'],
    moss: ['#34522a', '#2a4424', '#446230'],
    path: ['#735a3c', '#624c34', '#846a48'],
    soil: ['#402e1f', '#37281b', '#2e2117', '#4a3622'],
    stone: ['#3a3634', '#5c5652', '#7c7670', '#9a948c'],
    blade: ['#5a8434', '#6e9a3e', '#48702c', '#88aa48'],
    tip: '#c4c46a',
    flowers: ['#f2d44a', '#f4f0e0', '#e8783a', '#c88ae0'],
    leaves: [],
    reed: ['#4e7a30', '#62903c', '#3e6226'],
    cattail: '#5e3e22',
    fern: ['#3a6e2c', '#4e8836', '#2a5424'],
  },
  autumn: {
    turf: ['#7c7434', '#8c823c', '#66602c'],
    moss: ['#4a4a26', '#3a3c20', '#5a5a2e'],
    path: ['#735a3c', '#624c34', '#846a48'],
    soil: ['#3e2c1f', '#35261b', '#2c2017', '#46331f'],
    stone: ['#3a3634', '#5c5652', '#7c7670', '#9a948c'],
    blade: ['#8a7e3a', '#9e8e44', '#6e6430', '#b09a50'],
    tip: '#d8b860',
    flowers: [],
    leaves: ['#c8621e', '#e0962c', '#a83a1a', '#d8b03a', '#8a4a1c'],
    reed: ['#8a7a3e', '#a08c48', '#6e6030'],
    cattail: '#5a3a1e',
    fern: ['#8a5a26', '#a8742e', '#6a4420'],
  },
  winter: {
    turf: ['#eef3f8', '#dfe7f0', '#c9d4e2'],
    moss: ['#e6edf4', '#d4dde8', '#bfcbdc'],
    path: ['#d8e0ea', '#c4cfdc', '#e8eef4'],
    soil: ['#3a3038', '#322a31', '#2a232a', '#443a42'],
    stone: ['#34323a', '#56525c', '#76727c', '#96929c'],
    blade: ['#8a7a5a', '#9e8e6a', '#6e6248', '#b0a07a'],
    tip: '#c8b890',
    flowers: [],
    leaves: [],
    reed: ['#a89a70', '#bcae84', '#8a7e5a'],
    cattail: '#5a4632',
    fern: ['#8a7a5a', '#a09070', '#6e6248'],
  },
};

const SNOW = ['#f6f9fc', '#e4ebf3', '#c8d3e2', '#aab8cc'];

/** '#rrggbb' → 0xAABBGGRR для Uint32 буфера. */
const cache32 = new Map<string, number>();
function c32(hex: string): number {
  let v = cache32.get(hex);
  if (v === undefined) {
    const n = parseInt(hex.slice(1), 16);
    v = (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
    cache32.set(hex, v);
  }
  return v;
}

function pick<T>(arr: readonly T[], r: number): T {
  return arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];
}

interface Chunk {
  sig: string;
  frames: HTMLCanvasElement[];
}

export class Ground {
  terrain: TerrainView | null = null;
  private cache = new Map<number, Chunk>();
  private season: Season;

  constructor(season: Season, private readonly seed: number) {
    this.season = season;
  }

  setSeason(season: Season): void {
    if (season !== this.season) {
      this.season = season;
      this.cache.clear();
    }
  }

  /** Клетка рельефа под мировой X (или null — за краем данных). */
  private cellAt(wx: number): number {
    const t = this.terrain;
    if (!t) return -1;
    return Math.max(0, Math.min(t.cells - 1, Math.floor((wx - t.left) / CELL)));
  }

  private signature(index: number): string {
    const t = this.terrain;
    if (!t) return this.season;
    const a = this.cellAt(index * CHUNK - CELL);
    const b = this.cellAt((index + 1) * CHUNK + CELL);
    let s = this.season;
    for (let i = a; i <= b; i++) s += `${t.forest[i] ? 1 : 0}${t.blocked[i] ? 1 : 0}${Math.round(t.grass[i] * 3)}${t.bush[i]}`;
    return s;
  }

  private chunk(index: number): Chunk {
    const sig = this.signature(index);
    let c = this.cache.get(index);
    if (c && c.sig === sig) return c;
    c = { sig, frames: this.paint(index) };
    this.cache.set(index, c);
    if (this.cache.size > 48) {
      const first = this.cache.keys().next().value;
      if (first !== undefined && first !== index) this.cache.delete(first);
    }
    return c;
  }

  private paint(index: number): HTMLCanvasElement[] {
    const season = this.season;
    const p = PAL[season];
    const winter = season === 'winter';
    const s = this.seed;
    const t = this.terrain;
    const base = new Uint32Array(CHUNK * H);
    const put = (buf: Uint32Array, x: number, y: number, col: string) => {
      if (x < 0 || x >= CHUNK || y < 0 || y >= H) return;
      buf[y * CHUNK + x] = c32(col);
    };
    const top = GRASS_UP;
    // Характер каждого столбца.
    const kind: number[] = [];
    const grass: number[] = [];
    const tall: number[] = [];
    for (let x = 0; x < CHUNK; x++) {
      const wx = index * CHUNK + x;
      const i = this.cellAt(wx);
      if (!t || i < 0) {
        kind.push(0);
        grass.push(0.6);
        tall.push(0);
        continue;
      }
      // Мягкие границы: лес/город «размываются» на пару пикселей.
      const jitter = Math.floor((hash2(wx, s + 3) - 0.5) * 6);
      const j = this.cellAt(wx + jitter);
      kind.push(t.blocked[j] ? 2 : t.forest[j] ? 1 : 0);
      grass.push(t.blocked[j] || t.forest[j] ? 0 : t.grass[j]);
      tall.push(t.bush[i]);
    }

    // ——— Почва ———
    for (let x = 0; x < CHUNK; x++) {
      const wx = index * CHUNK + x;
      for (let y = 0; y < GROUND_H; y++) {
        const n = hash2(wx >> 1, y * 17 + s);
        let col = p.soil[n < 0.45 ? 0 : n < 0.8 ? 1 : n < 0.95 ? 2 : 3];
        if (y >= GROUND_H - 3) col = p.soil[2];
        if (y === GROUND_H - 1) col = '#1a120c';
        put(base, x, top + y, col);
      }
      // Корни под лесом.
      if (kind[x] === 1 && hash2(wx, s + 41) > 0.93) {
        const len = 2 + Math.floor(hash2(wx, 2) * 4);
        for (let k = 0; k < len; k++) put(base, x + (k >> 1), top + 3 + k, '#24180f');
      }
    }
    // Камни в толще и на берегу — со светом сверху-слева.
    const stone = (x: number, y: number, w: number, h: number) => {
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          const corner = (xx === 0 || xx === w - 1) && (yy === 0 || yy === h - 1);
          if (corner && w > 2) continue;
          const lit = yy === 0 || (xx === 0 && yy < h - 1);
          const dark = yy === h - 1 || xx === w - 1;
          put(base, x + xx, y + yy, lit ? p.stone[2] : dark ? p.stone[0] : p.stone[1]);
        }
      }
      if (w > 2) put(base, x + 1, y, p.stone[3]);
    };
    for (let x = -4; x < CHUNK; x++) {
      const wx = index * CHUNK + x;
      const r = hash2(wx, s + 77);
      if (r > 0.975) stone(x, top + 3 + Math.floor(hash2(wx, 5) * 4), 2 + Math.floor(hash2(wx, 6) * 2), 2);
      // Береговые валуны у самой воды.
      if (r < 0.022) stone(x, top + GROUND_H - 4, 3 + Math.floor(hash2(wx, 7) * 3), 3);
    }

    // ——— Верхний слой: дёрн, мох, тропа, снег ———
    for (let x = 0; x < CHUNK; x++) {
      const wx = index * CHUNK + x;
      const r = hash2(wx, s + 11);
      if (winter) {
        const drift = Math.round(1.5 + Math.sin(wx * 0.045 + s) * 1.2 + Math.sin(wx * 0.13) * 0.6);
        for (let y = -drift; y < 3; y++) put(base, x, top + y, SNOW[y < -drift + 1 ? 0 : y < 1 ? 1 : 2]);
        put(base, x, top + 3, SNOW[3]);
        continue;
      }
      const pal = kind[x] === 2 ? p.path : kind[x] === 1 ? p.moss : p.turf;
      const depth = kind[x] === 2 ? 2 : 2 + (r > 0.6 ? 1 : 0);
      for (let y = 0; y < depth; y++) put(base, x, top + y, pal[y === 0 ? (r > 0.3 ? 1 : 0) : r > 0.8 ? 2 : 0]);
      // Кромка дёрна чуть свисает над почвой.
      if (kind[x] !== 2 && r > 0.7) put(base, x, top + depth, pal[2]);
      // Опавшие листья осенью.
      if (p.leaves.length && hash2(wx, s + 13) > (kind[x] === 1 ? 0.55 : 0.85)) put(base, x, top + (r > 0.5 ? 0 : 1), pick(p.leaves, hash2(wx, 14)));
      // Мелкие камушки на тропе.
      if (kind[x] === 2 && r > 0.93) put(base, x, top, p.stone[2]);
    }

    // ——— Растительность (три кадра ветра) ———
    const frames: HTMLCanvasElement[] = [];
    for (let f = 0; f < 3; f++) {
      const buf = base.slice();
      const sway = f - 1;
      const bladeAt = (x: number, h: number, colBase: string, colTip: string) => {
        for (let k = 1; k <= h; k++) {
          const off = k > h * 0.6 && h >= 4 ? sway : 0;
          put(buf, x + off, top - k, k === h ? colTip : colBase);
        }
      };
      for (let x = 0; x < CHUNK; x++) {
        const wx = index * CHUNK + x;
        const r = hash2(wx, s + 31);
        const r2 = hash2(wx, s + 32);
        if (winter) {
          // Сухие травинки из-под снега.
          if (kind[x] === 0 && r > 0.9) bladeAt(x, 2 + Math.floor(r2 * 4), pick(p.blade, r2), p.tip);
          continue;
        }
        if (kind[x] === 0) {
          const g = grass[x];
          // Низкая «щётка» между пучками.
          if (r < 0.2 + g * 0.5) bladeAt(x, 1 + (r2 > 0.6 ? 1 : 0), p.blade[2], p.blade[0]);
          // Пучки: центральная травинка выше, боковые короче и клонятся наружу.
          const every = g > 0.6 ? 3 : g > 0.3 ? 4 : 6;
          if ((wx % every) === 0 && hash2(wx, s + 34) < 0.35 + g * 0.6) {
            const wave = 0.65 + 0.35 * Math.sin(wx * 0.07 + s) + 0.2 * Math.sin(wx * 0.23);
            let hmax = Math.max(2, Math.round((1.5 + g * 6) * wave * (0.7 + r2 * 0.5)));
            if (tall[x]) hmax = 8 + Math.floor(r2 * 5);
            const shades = [p.blade[2], p.blade[0], p.blade[1], p.blade[3]];
            const offs = [-2, -1, 0, 1, 2];
            const rel = [0.45, 0.75, 1, 0.8, 0.5];
            for (let b = 0; b < 5; b++) {
              if (hash2(wx + b, s + 35) < 0.25 && b !== 2) continue;
              const h = Math.max(1, Math.round(hmax * rel[b]));
              const col = shades[(b + (r2 > 0.5 ? 1 : 0)) % shades.length];
              for (let k = 1; k <= h; k++) {
                // Боковые травинки к верху отходят от центра.
                const outward = k > h * 0.55 && offs[b] !== 0 ? Math.sign(offs[b]) : 0;
                const off = (k > h * 0.6 && h >= 4 ? sway : 0) + outward;
                put(buf, x + offs[b] + off, top - k, k === h && h >= 3 ? (b === 2 || r2 > 0.6 ? p.tip : col) : col);
              }
            }
            // Колоски высокой травы.
            if (tall[x]) {
              put(buf, x + sway, top - hmax - 1, p.tip);
              put(buf, x + sway + 1, top - hmax, p.tip);
            }
          }
          // Цветы на густой траве.
          if (p.flowers.length && g > 0.45 && hash2(wx, s + 99) > 0.972) {
            const fh = 3 + Math.floor(hash2(wx, 6) * 4);
            bladeAt(x, fh - 1, p.blade[2], p.blade[0]);
            const col = pick(p.flowers, hash2(wx, 5));
            put(buf, x + (fh >= 4 ? sway : 0), top - fh, col);
            if (hash2(wx, 8) > 0.5) {
              put(buf, x - 1 + (fh >= 4 ? sway : 0), top - fh, col);
              put(buf, x + 1 + (fh >= 4 ? sway : 0), top - fh, col);
            }
          }
        } else if (kind[x] === 1) {
          // Лесная подстилка: редкие травинки, папоротник, грибы.
          if (r > 0.82) bladeAt(x, 1 + Math.floor(r2 * 3), p.moss[2], p.moss[0]);
          if (hash2(wx >> 3, s + 51) > 0.8 && (wx & 7) === 0) {
            // Папоротник: веер листочков.
            const fh = 4 + Math.floor(hash2(wx, 52) * 4);
            for (let k = 1; k <= fh; k++) {
              const spread = Math.round(k * 0.6);
              const col = k > fh - 2 ? p.fern[1] : p.fern[k % 2 ? 0 : 2];
              put(buf, x - spread + (k > fh / 2 ? sway : 0), top - fh + k, col);
              put(buf, x + spread + (k > fh / 2 ? sway : 0), top - fh + k, col);
            }
            put(buf, x, top - fh, p.fern[1]);
          }
          if ((season === 'autumn' || season === 'summer') && hash2(wx, s + 61) > (season === 'autumn' ? 0.975 : 0.99)) {
            // Гриб: мухомор или боровик.
            const red = hash2(wx, 62) > 0.5;
            const cap = red ? '#c02a1e' : '#7a4a26';
            put(buf, x, top - 1, '#e8e0cc');
            put(buf, x, top - 2, '#e8e0cc');
            put(buf, x - 1, top - 3, cap);
            put(buf, x, top - 3, cap);
            put(buf, x + 1, top - 3, cap);
            put(buf, x, top - 4, cap);
            if (red) put(buf, x, top - 3, '#f4ecd8');
          }
        } else if (r > 0.9) {
          // Город: редкие пучки травы у построек.
          bladeAt(x, 1 + Math.floor(r2 * 2), p.blade[2], p.blade[0]);
        }
      }
      const [cv, ctx] = makeCanvas(CHUNK, H);
      const img = ctx.createImageData(CHUNK, H);
      new Uint32Array(img.data.buffer).set(buf);
      ctx.putImageData(img, 0, 0);
      frames.push(cv);
    }
    return frames;
  }

  /** Камыш и рогоз стоят в воде у берега — рисуются поверх воды и нижней кромки берега. */
  drawReeds(ctx: CanvasRenderingContext2D, camX: number, w: number, waterTop: number, time = 0): void {
    const p = PAL[this.season];
    const left = Math.floor(camX - w / 2);
    const s = this.seed;
    const gust = Math.sin(time * 0.9) * 0.6 + Math.sin(time * 2.3) * 0.25;
    const t = this.terrain;
    for (let x = left - 8; x < left + w + 8; x++) {
      if (hash2(x, s + 71) < 0.993) continue;
      // Камыш — только у берега острова, не в открытом море.
      if (t && (x < t.left + 120 || x > t.left + t.cells * CELL - 120)) continue;
      const i = this.cellAt(x);
      if (t && i >= 0 && t.blocked[i]) continue;
      const n = 3 + Math.floor(hash2(x, 72) * 5);
      for (let k = 0; k < n; k++) {
        const sx = x - left + (k - (n >> 1)) * 2 + (hash2(x + k, 75) > 0.5 ? 1 : 0);
        const h = 8 + Math.floor(hash2(x + k, 73) * 11);
        const lean = (hash2(x + k, 76) - 0.5) * 0.25 + gust * 0.12;
        const y0 = waterTop + 3 + (k % 2);
        for (let y = 0; y < h; y++) {
          const t = y / h;
          const dx = Math.round(lean * y * t * 1.4);
          ctx.fillStyle = p.reed[y > h - 3 ? 1 : (k + y) % 4 === 0 ? 2 : 0];
          ctx.fillRect(sx + dx, y0 - y, 1, 1);
        }
        const tipX = sx + Math.round(lean * h * 1.4);
        if (hash2(x + k, 74) > 0.5) {
          // Рогоз: бархатная коричневая «сосиска» и тонкий кончик.
          ctx.fillStyle = p.cattail;
          ctx.fillRect(tipX, y0 - h + 1, 1, 3);
          ctx.fillStyle = p.reed[1];
          ctx.fillRect(tipX, y0 - h - 1, 1, 1);
        }
        if (this.season === 'winter') {
          ctx.fillStyle = SNOW[0];
          ctx.fillRect(tipX, y0 - h, 1, 1);
        }
      }
      // Круги на воде у стеблей.
      ctx.fillStyle = 'rgba(220,235,240,0.18)';
      ctx.fillRect(x - left - n, waterTop + 4, n * 2 + 1, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, w: number, groundY: number, time = 0): void {
    const left = camX - w / 2;
    const c0 = Math.floor(left / CHUNK);
    const c1 = Math.floor((left + w) / CHUNK);
    for (let c = c0; c <= c1; c++) {
      const sx = Math.round(c * CHUNK - left);
      // Ветер: трава клонится вправо, выпрямляется, клонится влево.
      const seq = [1, 2, 1, 0];
      const f = seq[Math.floor(time * 1.3) % 4];
      ctx.drawImage(this.chunk(c).frames[f], sx, groundY - GRASS_UP);
    }
  }
}
