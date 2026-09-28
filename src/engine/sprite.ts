// Спрайты: маленькие картинки на отдельных canvas с точкой привязки
// (обычно — посередине у ног), плюс кэш отражённых по горизонтали копий.

export interface Sprite {
  img: HTMLCanvasElement;
  w: number;
  h: number;
  /** Точка привязки внутри спрайта (в пикселях). */
  ax: number;
  ay: number;
  flipped?: Sprite;
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D недоступен');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

export type Palette = Record<string, string>;

/**
 * Собирает спрайт из строк: каждый символ — пиксель, цвет берётся из палитры.
 * Символы '.' и ' ' — прозрачные.
 */
export function fromRows(rows: string[], pal: Palette, ax?: number, ay?: number): Sprite {
  const h = rows.length;
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const [c, ctx] = makeCanvas(w, h);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = pal[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return { img: c, w, h, ax: ax ?? Math.floor(w / 2), ay: ay ?? h };
}

/** Спрайт из функции рисования. */
export function drawn(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void, ax?: number, ay?: number): Sprite {
  const [c, ctx] = makeCanvas(w, h);
  paint(ctx);
  return { img: c, w, h, ax: ax ?? Math.floor(w / 2), ay: ay ?? h };
}

export function flipOf(s: Sprite): Sprite {
  if (s.flipped) return s.flipped;
  const [c, ctx] = makeCanvas(s.w, s.h);
  ctx.translate(s.w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(s.img, 0, 0);
  const f: Sprite = { img: c, w: s.w, h: s.h, ax: s.w - s.ax, ay: s.ay };
  f.flipped = s;
  s.flipped = f;
  return f;
}

/** Одноцветный силуэт спрайта (для вспышек и теней). */
export function silhouette(s: Sprite, color: string): Sprite {
  const [c, ctx] = makeCanvas(s.w, s.h);
  ctx.drawImage(s.img, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, s.w, s.h);
  return { img: c, w: s.w, h: s.h, ax: s.ax, ay: s.ay };
}

// ——— Зимой на верхних кромках построек лежит снег ———
let snowMode = false;
const snowCache = new WeakMap<Sprite, Sprite>();

/** Включить снежный режим для следующих blit (мир включает его для построек зимой). */
export function setSnowMode(on: boolean): void {
  snowMode = on;
}

function snowHash(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Копия спрайта со снегом на крышах, карнизах и зубцах. Узкие штыри
 *  (древки, шесты) без снега; крутые скаты держат тонкий слой. */
function snowOf(s: Sprite): Sprite {
  let o = snowCache.get(s);
  if (o) return o;
  const w = s.img.width;
  const h = s.img.height;
  const [c, ctx] = makeCanvas(w, h);
  ctx.drawImage(s.img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  const A = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]);
  const top = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (A(x, y) >= 200 && A(x, y - 1) < 60) top[y * w + x] = 1;
  const isTop = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && top[y * w + x] === 1;
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * w + x) * 4;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!top[y * w + x]) continue;
      const flatL = isTop(x - 1, y);
      const flatR = isTop(x + 1, y);
      const slope = isTop(x - 1, y - 1) || isTop(x + 1, y - 1) || isTop(x - 1, y + 1) || isTop(x + 1, y + 1);
      if (!flatL && !flatR && !slope) continue;
      const k = snowHash(x, y);
      set(x, y, 238, 244, 252);
      // На ровном — слой потолще и сугробы, на скате — тонкая кромка.
      if (flatL && flatR) {
        if (A(x, y + 1) >= 200 && k > 0.3) set(x, y + 1, 206, 218, 234);
        if (y > 0 && k > 0.72) set(x, y - 1, 246, 250, 255);
      } else if (A(x, y + 1) >= 200 && k > 0.7) set(x, y + 1, 214, 224, 238);
    }
  }
  ctx.putImageData(data, 0, 0);
  o = { img: c, w: s.w, h: s.h, ax: s.ax, ay: s.ay };
  snowCache.set(s, o);
  return o;
}

// ——— Кромка лунного света: верхние и правые края силуэта ———
const rimCache = new Map<string, WeakMap<Sprite, Sprite>>();

/** Контур силуэта со стороны луны (сверху и справа) одним цветом —
 *  ночью тёмные фигуры отделяются от тёмного фона. */
export function rimOf(s: Sprite, color: string): Sprite {
  let m = rimCache.get(color);
  if (!m) {
    m = new WeakMap();
    rimCache.set(color, m);
  }
  let o = m.get(s);
  if (o) return o;
  const w = s.img.width;
  const h = s.img.height;
  const [c, ctx] = makeCanvas(w, h);
  ctx.drawImage(s.img, 0, 0);
  const d = ctx.getImageData(0, 0, w, h).data;
  const A = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]);
  const out = ctx.createImageData(w, h);
  const [r, g, b] = hex(color);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (A(x, y) < 128 || (A(x, y - 1) >= 128 && A(x + 1, y) >= 128)) continue;
      const i = (y * w + x) * 4;
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = b;
      out.data[i + 3] = 255;
    }
  }
  ctx.clearRect(0, 0, w, h);
  ctx.putImageData(out, 0, 0);
  o = { img: c, w: s.w, h: s.h, ax: s.ax, ay: s.ay };
  m.set(s, o);
  return o;
}

/** Рисует спрайт так, чтобы точка привязки попала в (x, y). */
export function blit(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, flip = false, alpha = 1): void {
  let sp = flip ? flipOf(s) : s;
  if (snowMode) sp = snowOf(sp);
  const dx = Math.round(x - sp.ax);
  const dy = Math.round(y - sp.ay);
  if (alpha !== 1) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * alpha;
    ctx.drawImage(sp.img, dx, dy);
    ctx.globalAlpha = a;
  } else {
    ctx.drawImage(sp.img, dx, dy);
  }
}

/** Разбор цвета '#rrggbb' в массив. */
export type RGB = [number, number, number];

export function hex(c: string): RGB {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgb(c: RGB, a = 1): string {
  const r = Math.round(c[0]);
  const g = Math.round(c[1]);
  const b = Math.round(c[2]);
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function mul(a: RGB, k: number): RGB {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export function toHex(c: RGB): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}
