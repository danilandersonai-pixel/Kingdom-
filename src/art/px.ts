// Примитивы рисования «по пикселям» без сглаживания: точки, линии,
// прямоугольники, эллипсы и многоугольники. Координаты — пиксели холста.

export type Ctx = CanvasRenderingContext2D;

export function px(ctx: Ctx, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Линия Брезенхэма заданной толщины. */
export function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string, thick = 1): void {
  ctx.fillStyle = color;
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const t0 = -Math.floor((thick - 1) / 2);
  for (;;) {
    if (thick === 1) ctx.fillRect(x0, y0, 1, 1);
    else ctx.fillRect(x0 + t0, y0 + t0, thick, thick);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Закрашенный эллипс. */
export function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color;
  const y0 = Math.floor(cy - ry);
  const y1 = Math.ceil(cy + ry);
  for (let y = y0; y <= y1; y++) {
    const t = (y + 0.5 - cy) / ry;
    if (t < -1 || t > 1) continue;
    const half = rx * Math.sqrt(1 - t * t);
    const xa = Math.round(cx - half);
    const xb = Math.round(cx + half);
    if (xb > xa) ctx.fillRect(xa, y, xb - xa, 1);
  }
}

/** Закрашенный многоугольник (правило чёт-нечет). */
export function poly(ctx: Ctx, pts: Array<[number, number]>, color: string): void {
  ctx.fillStyle = color;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) {
        xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.round(xs[i]);
      const xb = Math.round(xs[i + 1]);
      if (xb > xa) ctx.fillRect(xa, y, xb - xa, 1);
    }
  }
}

/** «Толстая» линия как многоугольник с разной толщиной на концах. */
export function limb(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, color: string): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  poly(
    ctx,
    [
      [x0 + (nx * w0) / 2, y0 + (ny * w0) / 2],
      [x1 + (nx * w1) / 2, y1 + (ny * w1) / 2],
      [x1 - (nx * w1) / 2, y1 - (ny * w1) / 2],
      [x0 - (nx * w0) / 2, y0 - (ny * w0) / 2],
    ],
    color,
  );
  if (w0 <= 1.5 && w1 <= 1.5) line(ctx, x0, y0, x1, y1, color);
}

/** Затемнить/осветлить цвет '#rrggbb' на коэффициент. */
export function shade(color: string, k: number): string {
  const v = parseInt(color.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 1 ? c + (255 - c) * (k - 1) : c * k)));
  const r = f((v >> 16) & 255);
  const g = f((v >> 8) & 255);
  const b = f(v & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
