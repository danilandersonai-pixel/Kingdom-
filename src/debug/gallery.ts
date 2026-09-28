// Отладочная галерея: ?scene=trees&season=summer — все породы в нескольких вариантах.
import { treeSprite, bushSprite } from '../art/flora';
import type { Season } from '../render/atmosphere';
import type { TreeKind } from '../render/treegen';
import { townCenterSprite } from '../art/town';
import { wallSprite, towerSprite } from '../art/buildings';
import { humanFrames, type Role, type HumanAnim } from '../art/humans';

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

/** ?scene=town — все уровни городского центра. */
export function townGallery(scale = 3): void {
  const levels = [1, 2, 3, 4, 5, 6, 7];
  const sprites = levels.map((l) => townCenterSprite(l));
  const W = sprites.reduce((s, sp) => s + (sp.w + 10) * scale, 20);
  const H = Math.max(...sprites.map((sp) => sp.h)) * scale + 40;
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
  ctx.fillStyle = '#4a6a2c';
  ctx.fillRect(0, H - 20, W, 20);
  let x = 10;
  for (const sp of sprites) {
    ctx.drawImage(sp.img, x, H - 20 - sp.h * scale, sp.w * scale, sp.h * scale);
    x += (sp.w + 10) * scale;
  }
}

/** ?scene=defense — стены и башни всех уровней, стены в трёх степенях повреждения. */
export function defenseGallery(scale = 4): void {
  const walls = [0, 1, 2, 3, 4, 5];
  const towers = [0, 1, 2, 3, 4, 5, 6];
  const W = 1300;
  const H = 520;
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
  ctx.fillStyle = '#8fb0cf';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#4a6a2c';
  ctx.fillRect(0, 230, W, 10);
  ctx.fillRect(0, 510, W, 10);
  let x = 10;
  for (const l of walls) {
    for (const d of [0, 0.5, 0.9]) {
      const s = wallSprite(l, d);
      ctx.drawImage(s.img, x, 230 - s.h * scale, s.w * scale, s.h * scale);
      x += (s.w + 3) * scale;
    }
    x += 12;
  }
  x = 10;
  for (const l of towers) {
    const s = towerSprite(l);
    ctx.drawImage(s.img, x, 510 - s.h * scale, s.w * scale, s.h * scale);
    x += (s.w + 12) * scale;
  }
}

/** ?scene=people — все роли: стоят, идут, работают. */
export function peopleGallery(scale = 5): void {
  const roles: Role[] = ['vagrant', 'peasant', 'archer', 'builder', 'farmer', 'squire', 'knight', 'pikeman', 'hermit', 'merchant', 'banker', 'ghost'];
  const anims: HumanAnim[] = ['idle', 'walk', 'act'];
  const cw = 22 * scale;
  const ch = 30 * scale;
  const W = roles.length * (cw + 6) + 20;
  const H = anims.length * 2 * (ch + 6) + 20;
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
  ctx.fillStyle = '#7f9fbf';
  ctx.fillRect(0, 0, W, H);
  let y = 10;
  for (const anim of anims) {
    for (const v of [0, 3]) {
      roles.forEach((role, i) => {
        const frames = humanFrames(role, v, anim);
        const f = frames[1 % frames.length];
        ctx.drawImage(f.img, 10 + i * (cw + 6), y, cw, ch);
      });
      y += ch + 6;
    }
  }
}
