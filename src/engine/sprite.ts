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

/** Рисует спрайт так, чтобы точка привязки попала в (x, y). */
export function blit(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, flip = false, alpha = 1): void {
  const sp = flip ? flipOf(s) : s;
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
