// Мягкая тень под персонажем на земле: две полупрозрачные строки на дёрне.

export function groundShadow(ctx: CanvasRenderingContext2D, cx: number, gy: number, w: number, alpha = 0.24): void {
  const x = Math.round(cx - w / 2);
  ctx.fillStyle = `rgba(12,8,14,${alpha})`;
  ctx.fillRect(x, gy, Math.round(w), 1);
  ctx.fillStyle = `rgba(12,8,14,${(alpha * 0.55).toFixed(3)})`;
  ctx.fillRect(x + 1, gy + 1, Math.max(1, Math.round(w) - 2), 1);
}
