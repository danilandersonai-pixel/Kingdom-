// Пиксельный шрифт 5×7 с латиницей, кириллицей и цифрами.
// Текст выводится заглавными буквами — как надписи в старых играх.

import { makeCanvas } from './sprite';

const G: Record<string, string> = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####',
  F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.###.',
  H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '###|.#.|.#.|.#.|.#.|.#.|###',
  J: '..###|...#.|...#.|...#.|#..#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
  N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.',
  T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|.#.#.|.#.#.|..#..|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#',
  X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
  '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
  '3': '####.|....#|....#|.###.|....#|....#|####.',
  '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  '5': '#####|#....|####.|....#|....#|#...#|.###.',
  '6': '.###.|#....|#....|####.|#...#|#...#|.###.',
  '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
  '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  '9': '.###.|#...#|#...#|.####|....#|....#|.###.',
  Б: '#####|#....|#....|####.|#...#|#...#|####.',
  Г: '#####|#....|#....|#....|#....|#....|#....',
  Д: '..##.|.#.#.|.#.#.|.#.#.|.#.#.|#####|#...#',
  Ё: '.#.#.|#####|#....|####.|#....|#....|#####',
  Ж: '#.#.#|#.#.#|.###.|..#..|.###.|#.#.#|#.#.#',
  З: '.###.|#...#|....#|..##.|....#|#...#|.###.',
  И: '#...#|#...#|#..##|#.#.#|##..#|#...#|#...#',
  Й: '.#.#.|#...#|#..##|#.#.#|##..#|#...#|#...#',
  Л: '..###|.#..#|.#..#|.#..#|.#..#|.#..#|#...#',
  П: '#####|#...#|#...#|#...#|#...#|#...#|#...#',
  У: '#...#|#...#|#...#|.####|....#|....#|.###.',
  Ф: '..#..|.###.|#.#.#|#.#.#|.###.|..#..|..#..',
  Ц: '#..#.|#..#.|#..#.|#..#.|#..#.|#####|....#',
  Ч: '#...#|#...#|#...#|.####|....#|....#|....#',
  Ш: '#.#.#|#.#.#|#.#.#|#.#.#|#.#.#|#.#.#|#####',
  Щ: '#.#.#|#.#.#|#.#.#|#.#.#|#.#.#|#####|....#',
  Ъ: '##...|.#...|.#...|.###.|.#..#|.#..#|.###.',
  Ы: '#...#|#...#|#...#|###.#|#.#.#|#.#.#|###.#',
  Ь: '#....|#....|#....|####.|#...#|#...#|####.',
  Э: '.###.|#...#|....#|..###|....#|#...#|.###.',
  Ю: '#..#.|#.#.#|#.#.#|###.#|#.#.#|#.#.#|#..#.',
  Я: '.####|#...#|#...#|.####|..#.#|.#..#|#...#',
  '.': '.|.|.|.|.|.|#',
  ',': '..|..|..|..|..|.#|#.',
  '!': '#|#|#|#|#|.|#',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
  ':': '.|.|#|.|.|#|.',
  ';': '..|..|.#|..|..|.#|#.',
  '-': '....|....|....|####|....|....|....',
  '—': '.....|.....|.....|#####|.....|.....|.....',
  '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
  '(': '.#|#.|#.|#.|#.|#.|.#',
  ')': '#.|.#|.#|.#|.#|.#|#.',
  '/': '....#|...#.|...#.|..#..|.#...|.#...|#....',
  "'": '#|#|.|.|.|.|.',
  '"': '#.#|#.#|...|...|...|...|...',
  '«': '.....|..#.#|.#.#.|#.#..|.#.#.|..#.#|.....',
  '»': '.....|#.#..|.#.#.|..#.#|.#.#.|#.#..|.....',
  '%': '##..#|##..#|...#.|..#..|.#...|#..##|#..##',
  '×': '.....|#...#|.#.#.|..#..|.#.#.|#...#|.....',
  '<': '...#|..#.|.#..|#...|.#..|..#.|...#',
  '>': '#...|.#..|..#.|...#|..#.|.#..|#...',
  '=': '....|....|####|....|####|....|....',
  '*': '.....|#.#.#|.###.|#####|.###.|#.#.#|.....',
};

// Кириллица, совпадающая по начертанию с латиницей.
const SAME: Record<string, string> = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X' };

export const GLYPH_H = 7;
export const LINE_H = 10;

interface Glyph {
  x: number;
  w: number;
}

class FontAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly glyphs = new Map<string, Glyph>();

  constructor() {
    const entries = Object.entries(G);
    const total = entries.reduce((s, [, g]) => s + g.split('|')[0].length + 1, 0);
    const [c, ctx] = makeCanvas(total, GLYPH_H);
    ctx.fillStyle = '#fff';
    let x = 0;
    for (const [ch, data] of entries) {
      const rows = data.split('|');
      const w = rows[0].length;
      rows.forEach((row, y) => {
        for (let i = 0; i < row.length; i++) if (row[i] === '#') ctx.fillRect(x + i, y, 1, 1);
      });
      this.glyphs.set(ch, { x, w });
      x += w + 1;
    }
    for (const [cyr, lat] of Object.entries(SAME)) {
      const g = this.glyphs.get(lat);
      if (g) this.glyphs.set(cyr, g);
    }
    this.canvas = c;
  }
}

let atlas: FontAtlas | null = null;
const tinted = new Map<string, HTMLCanvasElement>();

function getAtlas(): FontAtlas {
  if (!atlas) atlas = new FontAtlas();
  return atlas;
}

function tintedAtlas(color: string): HTMLCanvasElement {
  let c = tinted.get(color);
  if (!c) {
    const a = getAtlas();
    const [cc, ctx] = makeCanvas(a.canvas.width, a.canvas.height);
    ctx.drawImage(a.canvas, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, cc.width, cc.height);
    tinted.set(color, cc);
    c = cc;
  }
  return c;
}

function normalize(text: string): string {
  return text.toUpperCase().replace(/Ё/g, 'Ё');
}

export function textWidth(text: string, scale = 1): number {
  const a = getAtlas();
  let w = 0;
  for (const ch of normalize(text)) {
    if (ch === ' ') {
      w += 3;
      continue;
    }
    const g = a.glyphs.get(ch);
    w += (g ? g.w : 3) + 1;
  }
  return Math.max(0, w - 1) * scale;
}

export type Align = 'left' | 'center' | 'right';

export interface TextOpts {
  color?: string;
  align?: Align;
  scale?: number;
  shadow?: string | null;
  outline?: string | null;
  alpha?: number;
}

function drawRaw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale: number): void {
  const a = getAtlas();
  const img = tintedAtlas(color);
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const ch of normalize(text)) {
    if (ch === ' ') {
      cx += 3 * scale;
      continue;
    }
    const g = a.glyphs.get(ch);
    if (!g) {
      cx += 4 * scale;
      continue;
    }
    ctx.drawImage(img, g.x, 0, g.w, GLYPH_H, cx, cy, g.w * scale, GLYPH_H * scale);
    cx += (g.w + 1) * scale;
  }
}

// Готовые строки: текст с тенью или обводкой рисуется один раз на отдельный
// холст, потом — одним drawImage (обводка — это 9 проходов по каждой букве).
interface TextImage {
  img: HTMLCanvasElement;
  pad: number;
}
const textCache = new Map<string, TextImage>();
const TEXT_CACHE_MAX = 300;

function textImage(text: string, color: string, scale: number, shadow: string | null, outline: string | null): TextImage {
  const key = `${text}\u0001${color}\u0001${scale}\u0001${shadow}\u0001${outline}`;
  let t = textCache.get(key);
  if (t) {
    textCache.delete(key);
    textCache.set(key, t);
    return t;
  }
  const pad = scale;
  const [c, ctx] = makeCanvas(textWidth(text, scale) + pad * 2 + scale, GLYPH_H * scale + pad * 2 + scale);
  if (outline) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) drawRaw(ctx, text, pad + dx * scale, pad + dy * scale, outline, scale);
  } else if (shadow) {
    drawRaw(ctx, text, pad + scale, pad + scale, shadow, scale);
  }
  drawRaw(ctx, text, pad, pad, color, scale);
  t = { img: c, pad };
  textCache.set(key, t);
  while (textCache.size > TEXT_CACHE_MAX) textCache.delete(textCache.keys().next().value as string);
  return t;
}

/** Рисует строку текста; y — верхний край букв. */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, opts: TextOpts = {}): void {
  if (!text) return;
  const scale = opts.scale ?? 1;
  const color = opts.color ?? '#f4ecd8';
  const w = textWidth(text, scale);
  let left = x;
  if (opts.align === 'center') left = x - Math.floor(w / 2);
  else if (opts.align === 'right') left = x - w;
  const prevAlpha = ctx.globalAlpha;
  if (opts.alpha !== undefined) ctx.globalAlpha = prevAlpha * opts.alpha;
  const shadow = opts.outline ? null : opts.shadow === null ? null : (opts.shadow ?? 'rgba(0,0,0,0.55)');
  const t = textImage(text, color, scale, shadow, opts.outline ?? null);
  ctx.drawImage(t.img, Math.round(left) - t.pad, Math.round(y) - t.pad);
  ctx.globalAlpha = prevAlpha;
}

/** Разбивает текст на строки не шире maxW. */
export function wrapText(text: string, maxW: number, scale = 1): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (textWidth(test, scale) > maxW && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}
