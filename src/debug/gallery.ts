// Отладочная галерея: ?scene=trees&season=summer — все породы в нескольких вариантах.
import { treeSprite, bushSprite } from '../art/flora';
import type { Season } from '../render/atmosphere';
import type { TreeKind } from '../render/treegen';

export function treeGallery(season: Season, scale = 2): void {
  const rows: Array<[TreeKind, number]> = [
    ['pine', 110],
    ['tallpine', 135],
    ['oak', 95],
    ['maple', 85],
    ['birch', 92],
    ['dead', 70],
  ];
  const cols = 8;
  const pad = 6;
  const widths = rows.map(([k, h]) => Math.max(...Array.from({ length: cols }, (_, v) => treeSprite(k, v, h - (v % 3) * 6, season).w)));
  const W = Math.max(...widths.map((w) => (w + pad) * cols)) * scale + 20;
  const H = rows.reduce((s, [, h]) => s + h + pad + 4, 0) * scale + 60;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  for (const el of [document.documentElement, document.body]) {
    el.style.margin = '0';
    el.style.overflow = 'visible';
    el.style.height = 'auto';
  }
  document.body.appendChild(c);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#6f97c6');
  g.addColorStop(1, '#d9e6e4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  let y = 10;
  rows.forEach(([kind, h], ri) => {
    const rowH = (h + 4) * scale;
    let x = 10;
    for (let v = 0; v < cols; v++) {
      const s = treeSprite(kind, v, h - (v % 3) * 6, season);
      ctx.drawImage(s.img, x, y + rowH - s.h * scale, s.w * scale, s.h * scale);
      x += (widths[ri] + pad) * scale;
    }
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(0, y + rowH, W, 2 * scale);
    y += rowH + pad * scale;
  });
  let x = 10;
  for (let v = 0; v < 6; v++) {
    const s = bushSprite(v * 17 + 3, 14 + v * 3, 8 + (v % 3) * 2, season);
    ctx.drawImage(s.img, x, y + 40 - s.h * scale, s.w * scale, s.h * scale);
    x += (s.w + 8) * scale;
  }
}
