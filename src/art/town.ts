// Городской центр: семь уровней от кострища до Железной крепости.
// Кладка из камней разного тона, брёвна, доски, солома и черепица;
// окна, факелы, флаги и трубы описаны отдельно — их «оживляет» сама постройка
// (окна светятся ночью, факелы мерцают, флаги развеваются, из труб идёт дым).

import { makeCanvas, type Sprite } from '../engine/sprite';
import { hash2 } from '../engine/math';
import { px, rect, line, poly, shade } from './px';

export const TC_SIZES: Array<[number, number]> = [[20, 8], [26, 32], [38, 38], [48, 54], [52, 60], [54, 64], [66, 76], [76, 88]];

export interface TcDetails {
  /** Окна [x, y, w, h] — ночью светятся. */
  windows: Array<[number, number, number, number]>;
  /** Факелы [x, y]. */
  torches: Array<[number, number]>;
  /** Древки флагов [x, y] (верх древка), флаг рисуется сбоку. */
  flags: Array<[number, number]>;
  /** Трубы [x, y] — точка дыма. */
  chimneys: Array<[number, number]>;
}

const DETAILS: TcDetails[] = [];

const WOOD = '#7a5234';
const WOOD_D = '#553823';
const WOOD_DD = '#3a2616';
const WOOD_L = '#9a6c46';
const THATCH = ['#6e5226', '#8c6c32', '#a8863e', '#c4a452'];
const TILE = ['#3a2a3a', '#553846', '#6e4652', '#8a5a62'];
const SLATE = ['#262a3e', '#343a56', '#46507a', '#5c6a98'];
const STONE = ['#4c4c56', '#65656f', '#7e7e88', '#9696a0', '#b0b0b8'];
const IRONS = ['#24262c', '#34373f', '#474b55', '#5e636e'];
const GLASS = '#1c1620';

const cache = new Map<string, Sprite>();

/** Каменная кладка: блоки разной длины в перевязку, свет сверху-слева, мох у земли. */
export function masonry(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, seed: number, pal: readonly string[] = STONE, moss = true): void {
  const rowH = 4;
  for (let row = 0; row * rowH < h; row++) {
    const yy = y0 + row * rowH;
    const rh = Math.min(rowH, y0 + h - yy);
    let xx = x0 - Math.floor(hash2(row, seed) * 4);
    let k = 0;
    while (xx < x0 + w) {
      const bw = 4 + Math.floor(hash2(row * 31 + k, seed) * 5);
      const tone = hash2(row * 7 + k, seed + 3);
      const base = pal[tone < 0.2 ? 1 : tone < 0.8 ? 2 : 3];
      const a = Math.max(x0, xx);
      const b = Math.min(x0 + w, xx + bw);
      if (b > a) {
        rect(ctx, a, yy, b - a, rh, base);
        // Верхняя грань блока светлее, нижняя — шов.
        rect(ctx, a, yy, b - a, 1, shade(base, 1.14));
        if (rh >= 4) rect(ctx, a, yy + rh - 1, b - a, 1, pal[0]);
        if (xx + bw < x0 + w) rect(ctx, xx + bw - 1, yy, 1, rh, pal[0]);
        // Выбоины и пятна.
        if (hash2(row * 13 + k, seed + 5) > 0.7) px(ctx, a + 1 + Math.floor(hash2(k, row) * Math.max(1, b - a - 2)), yy + 1 + (rh > 3 ? 1 : 0), pal[1]);
      }
      xx += bw;
      k++;
    }
  }
  // Общий свет слева и тень справа.
  rect(ctx, x0, y0, 1, h, pal[4]);
  rect(ctx, x0 + w - 1, y0, 1, h, pal[0]);
  if (moss) {
    for (let x = x0; x < x0 + w; x++) {
      const m = Math.floor(hash2(x, seed + 9) * 4);
      for (let y = 0; y < m; y++) px(ctx, x, y0 + h - 1 - y, y === m - 1 ? '#4a6a34' : '#3a5428');
    }
  }
}

/** Зубцы по верху стены. */
function crenels(ctx: CanvasRenderingContext2D, x0: number, y: number, w: number, seed: number, pal: readonly string[] = STONE): void {
  for (let x = x0; x < x0 + w - 2; x += 5) {
    masonry(ctx, x, y - 4, 3, 4, seed + x, pal, false);
    px(ctx, x, y - 4, pal[4]);
  }
}

/** Бревенчатая стена: горизонтальные брёвна с торцами. */
function logWall(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, seed: number): void {
  for (let y = y0; y < y0 + h; y += 3) {
    const t = hash2(y, seed);
    rect(ctx, x0, y, w, 1, t > 0.5 ? WOOD_L : '#8a6040');
    rect(ctx, x0, y + 1, w, 1, WOOD);
    rect(ctx, x0, y + 2, w, 1, WOOD_D);
    for (let x = x0 + 2; x < x0 + w - 2; x++) if (hash2(x, y + seed) > 0.9) px(ctx, x, y + 1, WOOD_D);
    // Торцы брёвен.
    px(ctx, x0, y + 1, '#b08858');
    px(ctx, x0 + w - 1, y + 1, '#6a4a2c');
  }
}

/** Дощатая стена: вертикальные доски. */
function plankWall(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, seed: number): void {
  rect(ctx, x0, y0, w, h, WOOD);
  for (let x = x0; x < x0 + w; x += 3) {
    rect(ctx, x, y0, 1, h, WOOD_L);
    rect(ctx, x + 2, y0, 1, h, WOOD_D);
    if (hash2(x, seed) > 0.6) px(ctx, x + 1, y0 + Math.floor(hash2(x, seed + 1) * h), WOOD_DD);
  }
}

/** Двускатная крыша: солома или черепица, свет слева. */
function roof(ctx: CanvasRenderingContext2D, x0: number, x1: number, base: number, peak: number, pal: readonly string[], seed: number, overhang = 2): void {
  const cx = (x0 + x1) / 2;
  for (let y = peak; y < base; y++) {
    const t = (y - peak) / (base - peak);
    const half = ((x1 - x0) / 2 + overhang) * t;
    const a = Math.round(cx - half);
    const b = Math.round(cx + half);
    for (let x = a; x <= b; x++) {
      const left = x < cx;
      let tone = left ? 2 : 1;
      // Ряды черепицы/соломы.
      if ((y - peak) % 3 === 0) tone = left ? 1 : 0;
      if (hash2(x, y + seed) > 0.85) tone = Math.min(3, tone + 1);
      if (x === a || x === b) tone = 0;
      px(ctx, x, y, pal[tone]);
    }
  }
  // Конёк.
  px(ctx, Math.round(cx), peak - 1, pal[3]);
}

/** Коническая крыша башни. */
function cone(ctx: CanvasRenderingContext2D, cx: number, base: number, halfW: number, height: number, pal: readonly string[]): void {
  for (let y = 0; y < height; y++) {
    const half = halfW * (y / height);
    const yy = base - height + y;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const u = (x - (cx - half)) / Math.max(1, half * 2);
      const tone = u < 0.3 ? 3 : u < 0.6 ? 2 : u < 0.85 ? 1 : 0;
      px(ctx, x, yy, pal[(y % 3 === 2 && tone > 0) ? tone - 1 : tone]);
    }
  }
  px(ctx, Math.round(cx), base - height - 1, '#e8c060');
}

function door(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, iron = false): void {
  // Арка ворот.
  rect(ctx, x - 1, y - 1, w + 2, h + 1, WOOD_DD);
  rect(ctx, x, y, w, h, iron ? IRONS[1] : '#5a3a22');
  for (let xx = x + 1; xx < x + w; xx += 2) rect(ctx, xx, y, 1, h, iron ? IRONS[0] : '#4a2e1a');
  for (let yy = y + 2; yy < y + h; yy += 4) rect(ctx, x, yy, w, 1, iron ? IRONS[3] : IRONS[1]);
  px(ctx, x + w - 2, y + Math.floor(h / 2), '#e8c060');
  rect(ctx, x, y, w, 1, WOOD_L);
}

function win(ctx: CanvasRenderingContext2D, d: TcDetails, x: number, y: number, w: number, h: number, frame = WOOD_D): void {
  rect(ctx, x - 1, y - 1, w + 2, h + 2, frame);
  rect(ctx, x, y, w, h, GLASS);
  if (w >= 3) rect(ctx, x + Math.floor(w / 2), y, 1, h, frame);
  d.windows.push([x, y, w, h]);
}

/** Висящее знамя с короной. */
function hangingBanner(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, color: string): void {
  rect(ctx, x - 1, y - 1, 6, 1, WOOD_D);
  rect(ctx, x, y, 4, len, color);
  rect(ctx, x, y, 1, len, shade(color, 1.25));
  rect(ctx, x + 3, y, 1, len, shade(color, 0.7));
  // Ласточкин хвост.
  px(ctx, x + 1, y + len, color);
  px(ctx, x + 2, y + len, color);
  // Корона.
  px(ctx, x + 1, y + 3, '#f2c84a');
  px(ctx, x + 2, y + 3, '#f2c84a');
  px(ctx, x + 1, y + 2, '#f2c84a');
  px(ctx, x + 3, y + 2, '#f2c84a');
}

function pole(ctx: CanvasRenderingContext2D, d: TcDetails, x: number, top: number, len: number): void {
  line(ctx, x, top, x, top + len, WOOD_DD);
  px(ctx, x, top - 1, '#e8c060');
  d.flags.push([x, top]);
}

function paintLevel(level: number, ctx: CanvasRenderingContext2D, w: number, h: number, banner: string, d: TcDetails): void {
  const cx = Math.floor(w / 2);
  switch (level) {
    case 0: {
      // Кострище: камни по кругу и обгорелые поленья.
      for (let i = 0; i < 9; i++) {
        const a = (i / 8) * Math.PI;
        const x = Math.round(cx + Math.cos(a) * 7);
        px(ctx, x, h - 1, i % 2 ? '#6a6a72' : '#8a8a92');
        px(ctx, x, h - 2, '#5a5a62');
      }
      line(ctx, cx - 5, h - 2, cx + 4, h - 3, WOOD_DD);
      line(ctx, cx - 3, h - 4, cx + 5, h - 2, WOOD_D);
      px(ctx, cx - 1, h - 3, '#2a1a12');
      break;
    }
    case 1: {
      // Стоянка: шалаш из жердей и тотем со знаменем.
      poly(ctx, [[1, h], [9, h - 16], [17, h]], '#6e5a3a');
      for (let i = 0; i < 4; i++) line(ctx, 2 + i * 4, h, 9, h - 16, i % 2 ? '#8a7048' : '#5a4830');
      poly(ctx, [[7, h], [9, h - 7], [11, h]], '#2a1e14');
      rect(ctx, w - 7, 6, 3, h - 6, WOOD);
      rect(ctx, w - 7, 6, 1, h - 6, WOOD_L);
      rect(ctx, w - 9, 11, 7, 2, WOOD_D);
      pole(ctx, d, w - 6, 3, 4);
      // Черепа-обереги и шкура на тотеме.
      rect(ctx, w - 8, 15, 5, 4, '#a08060');
      px(ctx, w - 7, 16, '#6a5040');
      px(ctx, w - 5, 16, '#6a5040');
      rect(ctx, 18, h - 3, 6, 2, WOOD_D);
      break;
    }
    case 2: {
      // Деревня: бревенчатая изба под соломой, труба, частокол.
      logWall(ctx, 5, h - 18, w - 10, 18, 21);
      roof(ctx, 5, w - 5, h - 18, h - 32, THATCH, 23, 3);
      masonry(ctx, w - 12, h - 34, 4, 8, 25, STONE, false);
      d.chimneys.push([w - 10, h - 35]);
      door(ctx, cx - 3, h - 10, 6, 10);
      win(ctx, d, 9, h - 14, 3, 3);
      win(ctx, d, w - 12, h - 14, 3, 3);
      for (let x = 0; x < w; x += 3) {
        const hh = 6 + (x % 2);
        rect(ctx, x, h - hh + 2, 2, hh - 2, WOOD);
        px(ctx, x, h - hh + 1, WOOD_L);
        px(ctx, x, h - hh, WOOD_L);
        rect(ctx, x, h - hh + 2, 1, hh - 2, WOOD_L);
      }
      rect(ctx, 0, h - 4, w, 1, WOOD_DD);
      pole(ctx, d, cx, 0, 6);
      break;
    }
    case 3: {
      // Город: большой дом с дозорной вышкой, дощатые стены, частокол.
      plankWall(ctx, 6, h - 26, w - 12, 26, 31);
      roof(ctx, 6, w - 6, h - 26, h - 34, THATCH, 33, 3);
      plankWall(ctx, cx - 7, h - 44, 14, 14, 35);
      roof(ctx, cx - 7, cx + 7, h - 44, h - 52, TILE, 37, 2);
      win(ctx, d, cx - 4, h - 40, 2, 3);
      win(ctx, d, cx + 2, h - 40, 2, 3);
      door(ctx, cx - 3, h - 12, 7, 12);
      win(ctx, d, 11, h - 20, 3, 4);
      win(ctx, d, w - 14, h - 20, 3, 4);
      masonry(ctx, 9, h - 36, 4, 8, 39, STONE, false);
      d.chimneys.push([11, h - 37]);
      for (let x = 0; x < w; x += 3) {
        const hh = 9 + (x % 2);
        rect(ctx, x, h - hh + 2, 2, hh - 2, WOOD);
        rect(ctx, x, h - hh + 2, 1, hh - 2, WOOD_L);
        px(ctx, x, h - hh + 1, WOOD_L);
        px(ctx, x, h - hh, WOOD_L);
      }
      rect(ctx, 0, h - 5, w, 1, WOOD_DD);
      hangingBanner(ctx, 3, h - 26, 9, banner);
      hangingBanner(ctx, w - 7, h - 26, 9, banner);
      pole(ctx, d, cx, 0, 5);
      break;
    }
    case 4: {
      // Город: большой бревенчатый терем в два яруса, дозорная вышка, частокол.
      logWall(ctx, 6, h - 30, w - 12, 30, 45);
      roof(ctx, 6, w - 6, h - 30, h - 40, TILE, 46, 3);
      plankWall(ctx, cx - 9, h - 50, 18, 14, 47);
      roof(ctx, cx - 9, cx + 9, h - 50, h - 58, TILE, 48, 2);
      // Вышка слева.
      for (const x of [2, 9]) rect(ctx, x, h - 44, 2, 44, WOOD_D);
      plankWall(ctx, 1, h - 50, 11, 7, 49);
      roof(ctx, 1, 12, h - 50, h - 56, THATCH, 50, 1);
      door(ctx, cx - 4, h - 15, 8, 15);
      win(ctx, d, cx - 6, h - 46, 2, 3);
      win(ctx, d, cx + 4, h - 46, 2, 3);
      win(ctx, d, 14, h - 24, 3, 4);
      win(ctx, d, w - 17, h - 24, 3, 4);
      masonry(ctx, w - 14, h - 46, 4, 9, 51, STONE, false);
      d.chimneys.push([w - 12, h - 47]);
      for (let x = 0; x < w; x += 3) {
        const hh = 10 + (x % 2);
        rect(ctx, x, h - hh + 2, 2, hh - 2, WOOD);
        rect(ctx, x, h - hh + 2, 1, hh - 2, WOOD_L);
        px(ctx, x, h - hh + 1, WOOD_L);
        px(ctx, x, h - hh, WOOD_L);
      }
      rect(ctx, 0, h - 6, w, 1, WOOD_DD);
      hangingBanner(ctx, cx - 14, h - 30, 11, banner);
      hangingBanner(ctx, cx + 10, h - 30, 11, banner);
      pole(ctx, d, cx, h - 70, 12);
      pole(ctx, d, 6, h - 64, 8);
      break;
    }
    case 5: {
      // Форт: каменная цитадель с зубцами и донжоном.
      masonry(ctx, 5, h - 36, w - 10, 36, 41);
      crenels(ctx, 5, h - 36, w - 10, 42);
      masonry(ctx, cx - 9, h - 54, 18, 20, 43, STONE, false);
      crenels(ctx, cx - 9, h - 54, 18, 44);
      door(ctx, cx - 5, h - 15, 10, 15);
      win(ctx, d, cx - 1, h - 48, 2, 4, STONE[0]);
      win(ctx, d, 10, h - 28, 2, 4, STONE[0]);
      win(ctx, d, w - 12, h - 28, 2, 4, STONE[0]);
      hangingBanner(ctx, cx - 12, h - 34, 10, banner);
      hangingBanner(ctx, cx + 8, h - 34, 10, banner);
      d.torches.push([cx - 8, h - 14], [cx + 7, h - 14]);
      d.chimneys.push([cx + 6, h - 58]);
      pole(ctx, d, cx, 0, 6);
      break;
    }
    case 6: {
      // Замок: две круглые башни с коническими крышами, донжон, ворота с решёткой.
      masonry(ctx, 10, h - 40, w - 20, 40, 51);
      crenels(ctx, 10, h - 40, w - 20, 52);
      masonry(ctx, 1, h - 56, 13, 56, 53);
      masonry(ctx, w - 14, h - 56, 13, 56, 55);
      cone(ctx, 7.5, h - 56, 8, 12, SLATE);
      cone(ctx, w - 7.5, h - 56, 8, 12, SLATE);
      masonry(ctx, cx - 10, h - 62, 20, 26, 57, STONE, false);
      roof(ctx, cx - 10, cx + 10, h - 62, h - 74, SLATE, 59, 2);
      door(ctx, cx - 6, h - 18, 12, 18, true);
      win(ctx, d, 6, h - 44, 2, 4, STONE[0]);
      win(ctx, d, w - 8, h - 44, 2, 4, STONE[0]);
      win(ctx, d, cx - 4, h - 54, 2, 4, STONE[0]);
      win(ctx, d, cx + 2, h - 54, 2, 4, STONE[0]);
      win(ctx, d, 6, h - 26, 2, 3, STONE[0]);
      win(ctx, d, w - 8, h - 26, 2, 3, STONE[0]);
      hangingBanner(ctx, cx - 14, h - 38, 12, banner);
      hangingBanner(ctx, cx + 10, h - 38, 12, banner);
      d.torches.push([cx - 9, h - 16], [cx + 8, h - 16]);
      d.chimneys.push([cx + 7, h - 70]);
      pole(ctx, d, cx, h - 84, 8);
      pole(ctx, d, 7, h - 76, 6);
      pole(ctx, d, w - 8, h - 76, 6);
      break;
    }
    case 7: {
      // Железная крепость: великий замок с железными поясами и тёмным металлом.
      const iron = true;
      const pal = iron ? ['#3e3e48', '#555560', '#6c6c78', '#84848e', '#9e9ea8'] : STONE;
      masonry(ctx, 12, h - 44, w - 24, 44, 71, pal);
      crenels(ctx, 12, h - 44, w - 24, 72, pal);
      masonry(ctx, 1, h - 66, 15, 66, 73, pal);
      masonry(ctx, w - 16, h - 66, 15, 66, 75, pal);
      crenels(ctx, 1, h - 66, 15, 74, pal);
      crenels(ctx, w - 16, h - 66, 15, 76, pal);
      cone(ctx, 8.5, h - 70, 9, 13, SLATE);
      cone(ctx, w - 8.5, h - 70, 9, 13, SLATE);
      masonry(ctx, cx - 12, h - 74, 24, 32, 77, pal, false);
      crenels(ctx, cx - 12, h - 74, 24, 78, pal);
      cone(ctx, cx, h - 78, 11, 14, SLATE);
      if (iron) {
        // Железные пояса: нижний — по всей стене, верхний — только по башням
        // и донжону (между ними пусто, пояс не висит в воздухе).
        const band = (x0: number, x1: number, y: number) => {
          rect(ctx, x0, y, x1 - x0, 2, IRONS[1]);
          rect(ctx, x0, y, x1 - x0, 1, IRONS[3]);
          for (let x = x0 + 2; x < x1 - 1; x += 5) px(ctx, x, y + 1, IRONS[0]);
        };
        band(1, w - 1, h - 30);
        for (const [x0, x1] of [[1, 16], [cx - 12, cx + 12], [w - 16, w - 1]] as Array<[number, number]>) band(x0, x1, h - 58);
      }
      door(ctx, cx - 7, h - 21, 14, 21, true);
      for (const [x, y] of [[7, h - 52], [w - 9, h - 52], [7, h - 32], [w - 9, h - 32], [cx - 5, h - 64], [cx + 3, h - 64], [cx - 1, h - 52]] as Array<[number, number]>) win(ctx, d, x, y, 2, 4, pal[0]);
      hangingBanner(ctx, cx - 17, h - 42, 14, banner);
      hangingBanner(ctx, cx + 13, h - 42, 14, banner);
      d.torches.push([cx - 10, h - 19], [cx + 9, h - 19]);
      d.chimneys.push([cx + 8, h - 78]);
      pole(ctx, d, cx, h - 100, 8);
      pole(ctx, d, 8, h - 91, 7);
      pole(ctx, d, w - 9, h - 91, 7);
      break;
    }
  }
}

/** Запас сверху спрайта — под флагштоки и конусы. */
const TOP = 20;

export function townCenterSprite(level: number, banner = '#a82a2a'): Sprite {
  const lv = Math.max(0, Math.min(7, level));
  const key = `tc2:${lv}:${banner}`;
  let s = cache.get(key);
  if (s) return s;
  const [w, h] = TC_SIZES[lv];
  const [c, ctx] = makeCanvas(w, h + TOP);
  ctx.translate(0, TOP);
  paintLevel(lv, ctx, w, h, banner, { windows: [], torches: [], flags: [], chimneys: [] });
  s = { img: c, w, h: h + TOP, ax: Math.floor(w / 2), ay: h + TOP };
  cache.set(key, s);
  return s;
}

/** Размеры спрайта уровня (без рисования — годится и для логики игры). */
export function tcFrame(level: number): { w: number; h: number; ax: number } {
  const [w, h] = TC_SIZES[Math.max(0, Math.min(7, level))];
  return { w, h: h + TOP, ax: Math.floor(w / 2) };
}

/** Окна, факелы, флаги и трубы уровня — в координатах спрайта. Считаются «вхолостую», без холста. */
export function tcDetails(level: number): TcDetails {
  const lv = Math.max(0, Math.min(7, level));
  if (!DETAILS[lv]) {
    const d: TcDetails = { windows: [], torches: [], flags: [], chimneys: [] };
    const stub = { fillStyle: '', fillRect() {} } as unknown as CanvasRenderingContext2D;
    const [w, h] = TC_SIZES[lv];
    paintLevel(lv, stub, w, h, '#a82a2a', d);
    const shift = (p: [number, number]): [number, number] => [p[0], p[1] + TOP];
    DETAILS[lv] = {
      windows: d.windows.map(([x, y, ww, hh]) => [x, y + TOP, ww, hh]),
      torches: d.torches.map(shift),
      flags: d.flags.map(shift),
      chimneys: d.chimneys.map(shift),
    };
  }
  return DETAILS[lv];
}
