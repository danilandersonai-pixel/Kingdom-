// Полоса земли вдоль всего острова: трава сверху, почва с камушками,
// сезонная раскраска (снег зимой, жёлтая трава осенью).
// Рисуется кусками по 256 пикселей и кэшируется.

import { hash2 } from '../engine/math';
import { makeCanvas } from '../engine/sprite';
import type { Season } from './atmosphere';

export const GROUND_H = 11;
/** Сколько пикселей травинок торчит над линией земли. */
export const GRASS_UP = 6;
const CHUNK = 256;

interface GroundPalette {
  grass: string[];
  blade: string[];
  soil: string[];
  pebble: string[];
  edge: string;
  snow?: string[];
}

const PALETTES: Record<Season, GroundPalette> = {
  spring: {
    grass: ['#5c8a3a', '#4f7a32', '#6e9c44'],
    blade: ['#6fa446', '#4f7a32', '#88b85a', '#a8c86a'],
    soil: ['#3a2a1e', '#33251b', '#2e2118'],
    pebble: ['#5a4a3a', '#6a5a48', '#4a3c30'],
    edge: '#1e1610',
  },
  summer: {
    grass: ['#6a8a36', '#5a7a2e', '#7c9a40'],
    blade: ['#7ca044', '#5a7a2e', '#9ab45a', '#c0b860'],
    soil: ['#3c2c1e', '#35271b', '#302218'],
    pebble: ['#5c4c3a', '#6c5c48', '#4c3e30'],
    edge: '#1e1610',
  },
  autumn: {
    grass: ['#8a7a36', '#7a6a2e', '#9a7a3a'],
    blade: ['#a08a40', '#7a6a2e', '#b89a4a', '#c07a3a'],
    soil: ['#3a2a1e', '#33251b', '#2e2118'],
    pebble: ['#5a4a3a', '#6a5a48', '#4a3c30'],
    edge: '#1e1610',
  },
  winter: {
    grass: ['#e8eef4', '#d6dee8', '#f4f8fc'],
    blade: ['#e8eef4', '#c8d2de', '#ffffff', '#b8c4d2'],
    soil: ['#3a3038', '#332a32', '#2e262c'],
    pebble: ['#5a5460', '#6a6470', '#4a4450'],
    edge: '#1a161c',
    snow: ['#f4f8fc', '#e2e8f0', '#cfd8e4'],
  },
};

export class Ground {
  private cache = new Map<string, HTMLCanvasElement>();
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

  private chunk(index: number): HTMLCanvasElement {
    const key = `${index}:${this.season}`;
    let c = this.cache.get(key);
    if (c) return c;
    const h = GROUND_H + GRASS_UP;
    const [cv, ctx] = makeCanvas(CHUNK, h);
    const p = PALETTES[this.season];
    const s = this.seed;
    for (let x = 0; x < CHUNK; x++) {
      const wx = index * CHUNK + x;
      const n = hash2(wx, s);
      const n2 = hash2(wx, s + 7);
      const top = GRASS_UP;
      // Почва.
      for (let y = 0; y < GROUND_H; y++) {
        const r = hash2(wx, y * 13 + s);
        let col = p.soil[Math.floor(r * p.soil.length)];
        if (y >= GROUND_H - 1) col = p.edge;
        else if (r > 0.94 && y > 2) col = p.pebble[Math.floor(hash2(wx, y) * p.pebble.length)];
        ctx.fillStyle = col;
        ctx.fillRect(x, top + y, 1, 1);
      }
      // Каменистые вкрапления крупнее одного пикселя.
      if (n2 > 0.985) {
        ctx.fillStyle = p.pebble[1];
        ctx.fillRect(x, top + 4 + Math.floor(n * 4), 2, 1);
      }
      // Верхний слой травы (2–3 пикселя).
      const grassDepth = p.snow ? 3 + Math.round(n * 1.5) : 2 + (n > 0.7 ? 1 : 0);
      for (let y = 0; y < grassDepth; y++) {
        const r = hash2(wx, 100 + y + s);
        const pal = p.snow ?? p.grass;
        ctx.fillStyle = pal[Math.floor(r * pal.length)];
        ctx.fillRect(x, top + y, 1, 1);
      }
      // Травинки над землёй.
      if (n > 0.35) {
        const bladeH = Math.floor(Math.pow(hash2(wx, s + 31), 2.2) * (p.snow ? 2 : GRASS_UP));
        for (let y = 1; y <= bladeH; y++) {
          ctx.fillStyle = p.blade[Math.floor(hash2(wx, y + 50) * p.blade.length)];
          ctx.fillRect(x, top - y, 1, 1);
        }
      }
    }
    // Цветы весной и летом.
    if (this.season === 'spring' || this.season === 'summer') {
      for (let x = 2; x < CHUNK - 2; x++) {
        const wx = index * CHUNK + x;
        if (hash2(wx, s + 99) > 0.985) {
          const colors = this.season === 'spring' ? ['#f2e6a0', '#e8a0c0', '#ffffff'] : ['#f2d060', '#e8e0c0'];
          ctx.fillStyle = colors[Math.floor(hash2(wx, 5) * colors.length)];
          const hgt = 2 + Math.floor(hash2(wx, 6) * 3);
          ctx.fillRect(x, GRASS_UP - hgt, 1, 1);
          ctx.fillStyle = '#4f7a32';
          ctx.fillRect(x, GRASS_UP - hgt + 1, 1, hgt - 1);
        }
      }
    }
    this.cache.set(key, cv);
    if (this.cache.size > 64) {
      const first = this.cache.keys().next().value;
      if (first !== undefined) this.cache.delete(first);
    }
    c = cv;
    return c;
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, w: number, groundY: number): void {
    const left = camX - w / 2;
    const c0 = Math.floor(left / CHUNK);
    const c1 = Math.floor((left + w) / CHUNK);
    for (let c = c0; c <= c1; c++) {
      const sx = Math.round(c * CHUNK - left);
      ctx.drawImage(this.chunk(c), sx, groundY - GRASS_UP);
    }
  }
}
