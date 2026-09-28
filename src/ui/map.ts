// Карта в меню паузы: пять островов кампании и схема текущего острова
// (город, стены, башни, порталы, лагеря, лодка, монарх).

import type { World } from '../game/world';
import type { Campaign } from '../game/campaign';
import type { Structure } from '../game/structures/structure';
import type { Portal } from '../game/structures/portal';
import type { Wall } from '../game/structures/defense';
import type { CentralDock } from '../game/structures/boat';
import { drawText } from '../engine/font';
import { toRoman } from '../engine/math';
import { SEASON_NAMES } from '../game/time';

export function drawMap(ctx: CanvasRenderingContext2D, W: number, H: number, w: World, c: Campaign, monarchX: number[], selected: number | null = null): void {
  const px = Math.round(W * 0.08);
  const pw = W - px * 2;
  // Острова кампании.
  const iy = Math.round(H * 0.2);
  for (let i = 1; i <= 5; i++) {
    const x = Math.round(px + (pw * (i - 0.5)) / 5);
    const reached = i <= c.reached + (selected !== null ? 1 : 0);
    const cleared = c.caves.has(i);
    const cur = i === c.current;
    const sel = selected === i;
    const rw = 18 + i * 3;
    ctx.fillStyle = cleared ? '#6a8a4a' : reached ? '#8a7a5a' : '#3a3a42';
    ctx.fillRect(x - rw / 2, iy, rw, 5);
    ctx.fillRect(x - rw / 2 + 3, iy - 3, rw - 6, 3);
    if (sel) {
      ctx.fillStyle = '#f2c84a';
      ctx.fillRect(x - rw / 2 - 2, iy + 8, rw + 4, 1);
    }
    drawText(ctx, toRoman(i), x, iy + 11, { align: 'center', color: cur ? '#f2c84a' : reached ? '#e8dcc0' : '#6a6a70' });
    if (cur) {
      // Значок лодки над текущим островом.
      ctx.fillStyle = '#c8a878';
      ctx.fillRect(x - 4, iy - 9, 8, 2);
      ctx.fillStyle = '#e8e0cc';
      ctx.fillRect(x, iy - 15, 1, 6);
      ctx.fillRect(x + 1, iy - 14, 3, 3);
    }
    if (cleared) drawText(ctx, '*', x + rw / 2, iy - 8, { color: '#f2e2a8' });
  }

  // Схема текущего острова.
  const sy = Math.round(H * 0.55);
  const L = w.island.left;
  const R = w.island.right;
  const toX = (x: number) => Math.round(px + ((x - L) / (R - L)) * pw);
  ctx.fillStyle = '#4a5a3a';
  ctx.fillRect(px, sy, pw, 2);
  ctx.fillStyle = '#2a4a6a';
  ctx.fillRect(px, sy + 3, pw, 3);
  for (let i = 0; i < w.terrain.cells; i += 2) {
    if (w.terrain.forest[i]) {
      ctx.fillStyle = '#2e4a2e';
      ctx.fillRect(toX(w.terrain.cellX(i)), sy - 4, 1, 4);
    }
  }
  for (const s of w.all<Structure>('structure')) {
    const x = toX(s.x);
    switch (s.type) {
      case 'townCenter':
        ctx.fillStyle = '#e8c060';
        ctx.fillRect(x - 2, sy - 8, 5, 8);
        break;
      case 'wall': {
        const wl = s as Wall;
        if (wl.level > 0) {
          ctx.fillStyle = wl.destroyed ? '#6a3a2a' : wl.level >= 5 ? '#6a7080' : wl.level >= 3 ? '#a0a0a8' : '#9a6a3a';
          ctx.fillRect(x, sy - 3 - wl.level, 1, 3 + wl.level);
        }
        break;
      }
      case 'tower':
        if (s.level > 0) {
          ctx.fillStyle = '#b08a5a';
          ctx.fillRect(x, sy - 7, 2, 7);
        }
        break;
      case 'portal': {
        const p = s as Portal;
        if ((p as unknown as { kind: string }).kind === 'nest' || (p as unknown as { kind: string }).kind === 'teleport') break;
        ctx.fillStyle = p.destroyed ? '#4a3a4a' : '#9a5ad0';
        ctx.fillRect(x - 1, sy - 6, 3, 6);
        break;
      }
      case 'camp':
        ctx.fillStyle = '#ff9a40';
        ctx.fillRect(x, sy - 2, 2, 2);
        break;
      case 'dock': {
        const d = s as CentralDock;
        ctx.fillStyle = d.stage === 'wreck' ? '#6a5a4a' : '#c8a878';
        ctx.fillRect(x - 2, sy + 2, 5, 2);
        break;
      }
      case 'lighthouse':
        ctx.fillStyle = '#e8e0cc';
        ctx.fillRect(x, sy - 5, 1, 5);
        break;
      default:
        break;
    }
  }
  for (const mx of monarchX) {
    ctx.fillStyle = '#f2c84a';
    ctx.fillRect(toX(mx) - 1, sy - 12, 3, 3);
  }
  const t = w.time;
  drawText(ctx, `ОСТРОВ ${toRoman(w.island.index)}   ДЕНЬ ${t.day}   ${SEASON_NAMES[t.season].toUpperCase()}`, Math.round(W / 2), sy + 14, { align: 'center', color: '#d8ccb0' });
  drawText(ctx, `ПРАВЛЕНИЕ ${toRoman(c.reign)}   ПЕЩЕР ВЗОРВАНО ${c.caves.size} ИЗ 5`, Math.round(W / 2), sy + 26, { align: 'center', color: '#a89c80' });
}
