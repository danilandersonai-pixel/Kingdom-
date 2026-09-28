// Карта в меню паузы и при выборе острова: пять островов кампании
// (неоткрытые — в тумане, с разрушенной пещерой — со звездой) и схема
// текущего острова на доске с подписанной легендой значков.

import type { World } from '../game/world';
import type { Campaign } from '../game/campaign';
import type { Structure } from '../game/structures/structure';
import type { Portal } from '../game/structures/portal';
import type { Wall } from '../game/structures/defense';
import type { CentralDock, FarDock } from '../game/structures/boat';
import { drawText, textWidth } from '../engine/font';
import { toRoman } from '../engine/math';
import { SEASON_NAMES } from '../game/time';
import { ISLANDS } from '../game/config';
import { drawPanel } from './panel';

type Ctx = CanvasRenderingContext2D;

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

// ——— Значки схемы (нижний край — y) ———

function iconTown(ctx: Ctx, x: number, y: number): void {
  rect(ctx, x - 3, y - 6, 7, 6, '#e8c060');
  rect(ctx, x - 3, y - 8, 1, 2, '#e8c060');
  rect(ctx, x, y - 8, 1, 2, '#e8c060');
  rect(ctx, x + 3, y - 8, 1, 2, '#e8c060');
  rect(ctx, x - 3, y - 6, 7, 1, '#fff0a0');
  rect(ctx, x, y - 3, 1, 3, '#5a3a1a');
}

function iconWall(ctx: Ctx, x: number, y: number, level: number, destroyed: boolean): void {
  const c = destroyed ? '#6a3a2a' : level >= 5 ? '#8a90a0' : level >= 3 ? '#b8b8c0' : '#b07a42';
  const h = 3 + Math.min(level, 5);
  rect(ctx, x, y - h, 2, h, c);
  rect(ctx, x, y - h, 2, 1, destroyed ? '#8a5a4a' : '#f0e8d8');
}

function iconTower(ctx: Ctx, x: number, y: number): void {
  rect(ctx, x - 1, y - 7, 3, 7, '#b08a5a');
  rect(ctx, x - 2, y - 8, 5, 1, '#d8b080');
}

function iconPortal(ctx: Ctx, x: number, y: number, destroyed: boolean, big: boolean): void {
  if (destroyed) {
    rect(ctx, x - 2, y - 2, 5, 2, '#5a5058');
    rect(ctx, x - 1, y - 3, 1, 1, '#5a5058');
    return;
  }
  const w = big ? 7 : 5;
  const h = big ? 9 : 7;
  const l = x - Math.floor(w / 2);
  rect(ctx, l, y - h + 1, w, h - 1, '#b070e8');
  rect(ctx, l + 1, y - h, w - 2, 1, '#b070e8');
  rect(ctx, l + 1, y - h + 2, w - 2, h - 2, '#2a123a');
  rect(ctx, l + 2, y - h + 3, w - 4, 1, '#e0a0ff');
}

function iconCamp(ctx: Ctx, x: number, y: number): void {
  rect(ctx, x - 1, y - 1, 3, 1, '#6a4a2a');
  rect(ctx, x, y - 3, 1, 2, '#ffb040');
  rect(ctx, x - 1, y - 2, 3, 1, '#ff7a20');
}

function iconBoat(ctx: Ctx, x: number, y: number, wreck: boolean): void {
  const hull = wreck ? '#6a5a4a' : '#c89a60';
  rect(ctx, x - 3, y - 2, 7, 1, hull);
  rect(ctx, x - 2, y - 1, 5, 1, hull);
  if (!wreck) {
    rect(ctx, x, y - 7, 1, 5, '#e8e0cc');
    rect(ctx, x + 1, y - 6, 2, 3, '#e8e0cc');
  } else rect(ctx, x - 1, y - 4, 1, 2, '#6a5a4a');
}

function iconCrown(ctx: Ctx, x: number, y: number): void {
  rect(ctx, x - 2, y - 2, 5, 2, '#f2c84a');
  rect(ctx, x - 2, y - 4, 1, 2, '#f2c84a');
  rect(ctx, x, y - 4, 1, 2, '#f2c84a');
  rect(ctx, x + 2, y - 4, 1, 2, '#f2c84a');
  rect(ctx, x, y - 1, 1, 1, '#e04040');
}

// ——— Острова кампании ———

function hash(i: number, k: number): number {
  const h = Math.sin(i * 91.7 + k * 17.3) * 43758.5453;
  return h - Math.floor(h);
}

function drawIsland(ctx: Ctx, x: number, y: number, i: number, fog: boolean, cleared: boolean): number {
  const rw = Math.round(18 + (ISLANDS[i - 1].half / 320) * 42);
  const l = Math.round(x - rw / 2);
  // Вода вокруг.
  rect(ctx, l - 6, y + 1, rw + 12, 1, fog ? '#2a3040' : '#3a6a9a');
  rect(ctx, l - 3, y + 3, rw + 6, 1, fog ? '#22283a' : '#2a4a72');
  // Берег и холм: ступени сужаются кверху, справа — утёс.
  const dirt = fog ? '#343846' : '#6a5038';
  const dark = fog ? '#2c303e' : '#4a3626';
  const grass = fog ? '#40465a' : cleared ? '#6aa04a' : '#4e8a3a';
  const lit = fog ? '#4a5066' : cleared ? '#8ac05a' : '#6aa84a';
  rect(ctx, l, y - 1, rw, 2, dark);
  rect(ctx, l + 2, y - 3, rw - 4, 2, dirt);
  rect(ctx, l + 5, y - 5, rw - 10, 2, dirt);
  rect(ctx, l + 1, y - 2, rw - 2, 1, grass);
  rect(ctx, l + 3, y - 4, rw - 6, 1, grass);
  rect(ctx, l + 6, y - 6, rw - 12, 1, lit);
  // Утёс пещеры Жадности на краю.
  const rock = fog ? '#3a3e4e' : '#7a7064';
  rect(ctx, l + rw - 7, y - 10, 6, 9, rock);
  rect(ctx, l + rw - 6, y - 12, 4, 2, rock);
  rect(ctx, l + rw - 6, y - 12, 2, 1, fog ? '#444a5c' : '#a09888');
  rect(ctx, l + rw - 2, y - 9, 1, 8, fog ? '#30343f' : '#5a5248');
  if (!fog) {
    rect(ctx, l + rw - 5, y - 5, 3, 4, cleared ? '#4a4038' : '#2a123a');
    if (!cleared) rect(ctx, l + rw - 4, y - 4, 1, 1, '#b070e8');
  }
  // Деревья: хвойные и лиственные вперемешку.
  const n = 3 + Math.floor(rw / 8);
  for (let k = 0; k < n; k++) {
    const tx = l + 4 + Math.floor(hash(i, k) * (rw - 14));
    const th = 3 + Math.floor(hash(i, k + 9) * 4);
    const base = y - (tx > l + 6 && tx < l + rw - 8 ? 6 : 4);
    const c = fog ? '#30354a' : k % 3 === 0 ? '#2a4e2a' : k % 3 === 1 ? '#3a6a34' : '#2e5a2e';
    if (k % 2) {
      rect(ctx, tx, base - th, 1, th, c);
      rect(ctx, tx - 1, base - th + 2, 3, th - 2, c);
    } else {
      rect(ctx, tx - 1, base - th, 3, th - 1, c);
      rect(ctx, tx, base - 1, 1, 1, fog ? '#2c303e' : '#4a3626');
    }
  }
  return rw;
}

export function drawMap(ctx: Ctx, W: number, H: number, w: World, c: Campaign, monarchX: number[], selected: number | null = null): void {
  const px = Math.round(W * 0.08);
  const pw = W - px * 2;
  const iy = Math.round(H * 0.25);
  const blink = Math.floor(performance.now() / 400) % 2 === 0;
  for (let i = 1; i <= 5; i++) {
    const x = Math.round(px + (pw * (i - 0.5)) / 5);
    const reached = i <= c.reached + (selected !== null ? 1 : 0);
    const cleared = c.caves.has(i);
    const cur = i === c.current;
    const sel = selected === i;
    const rw = drawIsland(ctx, x, iy, i, !reached, cleared);
    if (!reached) drawText(ctx, '?', x, iy - 16, { align: 'center', color: '#8a8a9a' });
    drawText(ctx, toRoman(i), x, iy + 6, { align: 'center', color: sel ? '#fff4d8' : cur ? '#f2c84a' : reached ? '#d8ccb0' : '#8a8a9a' });
    if (sel) {
      rect(ctx, x - rw / 2 - 4, iy + 14, rw + 8, 1, '#f2c84a');
      if (blink) drawText(ctx, 'v', x, iy - 22, { align: 'center', color: '#f2c84a' });
    }
    if (cur) {
      // Флаг над островом, где сейчас монарх.
      rect(ctx, x - 1, iy - 16, 1, 11, '#e8e0cc');
      rect(ctx, x, iy - 16, 5, 3, '#c83a3a');
      rect(ctx, x, iy - 16, 5, 1, '#e86a5a');
    }
    if (cleared) {
      // Звезда: пещера этого острова взорвана.
      const sx = x + Math.round(rw / 2) - 3;
      const sy = iy - 13;
      rect(ctx, sx, sy - 1, 1, 3, '#fff0a0');
      rect(ctx, sx - 1, sy, 3, 1, '#fff0a0');
    }
  }

  // ——— Схема острова на доске: текущего, а при выборе пути — выбранного ———
  const sy = Math.round(H * 0.6);
  drawPanel(ctx, px - 10, sy - 22, pw + 20, 76, 0.7);
  const shownIndex = selected ?? c.current;
  const known = shownIndex === c.current ? w : c.islands.get(shownIndex)?.world ?? null;
  if (!known) {
    // Неизведанный остров: туман вместо схемы.
    for (let x = px; x < px + pw; x += 3) {
      const h = 2 + Math.round((Math.sin(x * 0.07) + Math.sin(x * 0.19 + 1)) * 1.5 + 2);
      rect(ctx, x, sy - h, 3, h, '#3a3e50');
    }
    rect(ctx, px, sy, pw, 3, '#40465a');
    rect(ctx, px - 4, sy + 5, pw + 8, 3, '#2a3048');
    drawText(ctx, 'НЕИЗВЕДАННАЯ ЗЕМЛЯ', Math.round(W / 2), sy + 16, { align: 'center', color: '#c8bca0' });
    drawText(ctx, `ОСТРОВ ${toRoman(shownIndex)}`, Math.round(W / 2), sy + 30, { align: 'center', color: '#e8dcc0' });
    drawText(ctx, 'Сюда ещё не ступал ни один монарх.', Math.round(W / 2), sy + 41, { align: 'center', color: '#b0a488' });
    return;
  }
  drawIslandScheme(ctx, W, px, pw, sy, known, known === w ? monarchX : [], c, shownIndex);
}

function drawIslandScheme(ctx: Ctx, W: number, px: number, pw: number, sy: number, w: World, monarchX: number[], c: Campaign, index: number): void {
  const L = w.island.left;
  const R = w.island.right;
  const toX = (x: number) => Math.round(px + ((x - L) / (R - L)) * pw);
  // Лес — тёмная лента крон с неровным верхом; земля и вода под ней.
  for (let i = 0; i < w.terrain.cells; i++) {
    if (!w.terrain.forest[i]) continue;
    const x = toX(w.terrain.cellX(i));
    const h = 4 + Math.round(Math.sin(i * 1.7) * 1.5 + Math.sin(i * 0.53) * 1.5);
    rect(ctx, x, sy - h, 2, h, '#24402a');
    rect(ctx, x, sy - h, 1, 1, '#3e6a3a');
  }
  rect(ctx, px, sy, pw, 3, '#4e7a3a');
  rect(ctx, px, sy, pw, 1, '#6a9a4a');
  rect(ctx, px, sy + 3, pw, 2, '#6a5038');
  rect(ctx, px - 4, sy + 5, pw + 8, 3, '#2a4a6a');
  rect(ctx, px - 4, sy + 5, pw + 8, 1, '#3a6a92');
  for (const s of w.all<Structure>('structure')) {
    const x = toX(s.x);
    switch (s.type) {
      case 'townCenter':
        iconTown(ctx, x, sy);
        break;
      case 'wall': {
        const wl = s as Wall;
        if (wl.level > 0) iconWall(ctx, x, sy, wl.level, wl.destroyed);
        break;
      }
      case 'tower':
        if (s.level > 0) iconTower(ctx, x, sy);
        break;
      case 'portal': {
        // Телепорт на руинах стоит на месте портала — руины уже нарисованы.
        const p = s as Portal | (Structure & { kind: 'teleport' });
        if (p.kind === 'teleport') break;
        iconPortal(ctx, x, sy, p.destroyed, p.kind === 'cliff');
        break;
      }
      case 'camp':
        iconCamp(ctx, x, sy);
        break;
      case 'dock': {
        const d = s as CentralDock;
        iconBoat(ctx, x, sy + 3, d.stage === 'wreck');
        break;
      }
      case 'lighthouse': {
        // Дальний причал; маяк — когда построен.
        rect(ctx, x - 3, sy + 2, 7, 1, '#9a7a50');
        if ((s as FarDock).hasLighthouse) {
          rect(ctx, x, sy - 6, 2, 6, '#e8e0cc');
          rect(ctx, x, sy - 4, 2, 1, '#c84a3a');
          rect(ctx, x - 1, sy - 8, 4, 2, '#ffe070');
        }
        break;
      }
      default:
        break;
    }
  }
  // Монарх: корона на булавке, воткнутой в землю, — видно, где именно он.
  for (const mx of monarchX) {
    const x = toX(mx);
    for (let y = sy - 9; y < sy; y += 2) rect(ctx, x, y, 1, 1, '#f2c84a');
    iconCrown(ctx, x, sy - 10);
  }
  // Легенда: значок и подпись, строкой по центру.
  const legend: Array<[string, (x: number, y: number) => void]> = [
    ['ВЫ', (x, y) => iconCrown(ctx, x, y)],
    ['ГОРОД', (x, y) => iconTown(ctx, x, y)],
    ['СТЕНА', (x, y) => iconWall(ctx, x, y, 3, false)],
    ['БАШНЯ', (x, y) => iconTower(ctx, x, y)],
    ['ЛАГЕРЬ', (x, y) => iconCamp(ctx, x, y)],
    ['ПОРТАЛ', (x, y) => iconPortal(ctx, x, y, false, false)],
    ['ПЕЩЕРА', (x, y) => iconPortal(ctx, x, y, false, true)],
    ['ЛОДКА', (x, y) => iconBoat(ctx, x, y, false)],
  ];
  const gap = 9;
  const total = legend.reduce((s, [t]) => s + 10 + textWidth(t) + gap, -gap);
  let lx = Math.round(W / 2 - total / 2);
  const ly = sy + 19;
  for (const [t, draw] of legend) {
    draw(lx + 3, ly);
    drawText(ctx, t, lx + 10, ly - 6, { color: '#b8ac90', shadow: null });
    lx += 10 + textWidth(t) + gap;
  }
  const t = w.time;
  drawText(ctx, `ОСТРОВ ${toRoman(index)}   ДЕНЬ ${toRoman(t.day)}   ${SEASON_NAMES[t.season].toUpperCase()}`, Math.round(W / 2), sy + 30, { align: 'center', color: '#e8dcc0' });
  drawText(ctx, `ПРАВЛЕНИЕ ${toRoman(c.reign)}   ВЗОРВАНО ПЕЩЕР: ${c.caves.size} ИЗ 5 (ПО ОДНОЙ НА ОСТРОВ)`, Math.round(W / 2), sy + 41, { align: 'center', color: '#b0a488' });
}
