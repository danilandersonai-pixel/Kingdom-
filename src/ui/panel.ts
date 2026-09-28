// Подложка для меню и карты: полупрозрачная тёмная доска с тонкой
// бронзовой рамкой и заклёпками по углам — текст читается на любом фоне.

export function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.7): void {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#100a06';
  // Срезанные уголки — не прямоугольник, а доска.
  ctx.fillRect(x + 1, y, w - 2, h);
  ctx.fillRect(x, y + 1, w, h - 2);
  ctx.globalAlpha = Math.min(1, alpha + 0.2);
  ctx.fillStyle = '#6a5030';
  ctx.fillRect(x + 2, y + 2, w - 4, 1);
  ctx.fillRect(x + 2, y + h - 3, w - 4, 1);
  ctx.fillRect(x + 2, y + 2, 1, h - 4);
  ctx.fillRect(x + w - 3, y + 2, 1, h - 4);
  ctx.fillStyle = '#d8b060';
  for (const [cx, cy] of [
    [x + 2, y + 2],
    [x + w - 3, y + 2],
    [x + 2, y + h - 3],
    [x + w - 3, y + h - 3],
  ]) ctx.fillRect(cx, cy, 1, 1);
  ctx.globalAlpha = 1;
}
