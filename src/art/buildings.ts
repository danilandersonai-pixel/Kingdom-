// Постройки: стены и башни по уровням, городской центр от костра до замка,
// лавки инструментов, ферма, лагерь бродяг, сундук, порталы Жадности,
// лодка, статуи, хижина отшельника. Всё рисуется кодом по пикселям.

import { makeCanvas, type Sprite } from '../engine/sprite';
import { Rng } from '../engine/rng';
import { ellipse, line, poly, px, rect, shade } from './px';
import { hash2 } from '../engine/math';

const WOOD = '#7a5234';
const WOOD_D = '#553823';
const WOOD_L = '#9a6c46';
const STONE = '#8a8a90';
const STONE_D = '#5e5e66';
const ROPE = '#c8b080';
const IRON = '#4a4e56';

const cache = new Map<string, Sprite>();

function build(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, ax?: number): Sprite {
  let s = cache.get(key);
  if (s) return s;
  const [c, ctx] = makeCanvas(w, h);
  paint(ctx, w, h);
  s = { img: c, w, h, ax: ax ?? Math.floor(w / 2), ay: h };
  cache.set(key, s);
  return s;
}

/** Каменная кладка в прямоугольнике. */
function masonry(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, base = STONE): void {
  rect(ctx, x, y, w, h, base);
  const d = shade(base, 0.68);
  const l = shade(base, 1.22);
  for (let row = 0; row * 4 < h; row++) {
    const yy = y + row * 4;
    rect(ctx, x, yy, w, 1, d);
    const off = row % 2 === 0 ? 0 : 3;
    for (let xx = x + off; xx < x + w; xx += 6) {
      px(ctx, xx, yy + 1, d);
      px(ctx, xx, yy + 2, d);
      px(ctx, xx, yy + 3, d);
      if (hash2(xx + seed, yy) > 0.5) px(ctx, xx + 1, yy + 1, l);
    }
  }
  // Свет слева, тень справа.
  rect(ctx, x, y, 1, h, l);
  rect(ctx, x + w - 1, y, 1, h, d);
}

/** Бревно с заострённым верхом. */
function stake(ctx: CanvasRenderingContext2D, x: number, bottom: number, height: number, wdt = 2): void {
  const top = bottom - height;
  rect(ctx, x, top + 2, wdt, height - 2, WOOD);
  rect(ctx, x, top + 2, 1, height - 2, WOOD_L);
  if (wdt > 2) rect(ctx, x + wdt - 1, top + 2, 1, height - 2, WOOD_D);
  px(ctx, x + (wdt > 2 ? 1 : 0), top, WOOD_L);
  rect(ctx, x, top + 1, wdt, 1, WOOD);
}

// ——— Стены ———
export function wallSprite(level: number, dmg: number): Sprite {
  const d = dmg > 0.66 ? 2 : dmg > 0.33 ? 1 : 0;
  const key = `wall:${level}:${d}`;
  const sizes: Array<[number, number]> = [[14, 5], [10, 14], [12, 22], [14, 28], [16, 34], [18, 40]];
  const [w, h] = sizes[Math.min(level, 5)];
  return build(key, w, h, (ctx) => {
    const r = new Rng(level * 31 + 7);
    switch (level) {
      case 0: {
        // Насыпь — место под стену.
        ellipse(ctx, w / 2, h, 7, 4, '#5a4632');
        ellipse(ctx, w / 2, h, 5, 3, '#6a5440');
        px(ctx, 4, h - 3, '#8a8078');
        px(ctx, 9, h - 2, '#7a7068');
        break;
      }
      case 1: {
        const hs = [12, 14, 11, 13];
        hs.forEach((hh, i) => stake(ctx, 1 + i * 2, h, hh - (d === 2 && i === 1 ? 5 : 0)));
        rect(ctx, 0, h - 8, w, 1, ROPE);
        rect(ctx, 0, h - 4, w, 1, ROPE);
        break;
      }
      case 2: {
        for (let i = 0; i < 5; i++) stake(ctx, 1 + i * 2, h, 19 + r.int(0, 3) - (d === 2 && i === 2 ? 7 : 0));
        rect(ctx, 0, h - 15, w, 2, WOOD_D);
        rect(ctx, 0, h - 6, w, 2, WOOD_D);
        px(ctx, 2, h - 15, IRON);
        px(ctx, 9, h - 6, IRON);
        break;
      }
      case 3: {
        masonry(ctx, 0, 4, w, h - 4, 3);
        for (let i = 0; i < 3; i++) masonry(ctx, i * 5, 0, 4, 5, 9);
        break;
      }
      case 4: {
        masonry(ctx, 0, 5, w, h - 5, 5);
        for (let i = 0; i < 4; i++) masonry(ctx, i * 4 + (i === 3 ? 0 : 0), 0, 3, 6, 11);
        rect(ctx, 2, 12, w - 4, 1, STONE_D);
        break;
      }
      default: {
        masonry(ctx, 0, 6, w, h - 6, 8, '#7a7a84');
        for (let i = 0; i < 4; i++) masonry(ctx, i * 5, 0, 3, 7, 13, '#7a7a84');
        for (const yy of [10, 20, 30]) {
          rect(ctx, 0, yy, w, 2, IRON);
          for (let xx = 1; xx < w; xx += 4) px(ctx, xx, yy, '#8a929c');
        }
        break;
      }
    }
    if (d > 0 && level >= 3) {
      // Трещины.
      const cr = new Rng(level * 13 + d);
      for (let k = 0; k < d * 3; k++) {
        let cx = cr.int(1, w - 2);
        let cy = cr.int(4, h - 4);
        for (let s = 0; s < 5; s++) {
          px(ctx, cx, cy, '#2a2a30');
          cx += cr.int(-1, 1);
          cy += 1;
        }
      }
      if (d === 2) {
        ctx.clearRect(w - 5, 0, 5, 7);
        ctx.clearRect(0, 0, 3, 4);
      }
    }
  });
}

// ——— Башни лучников ———
export const TOWER_PLATFORM = [0, 19, 28, 36, 44];
export function towerSprite(level: number): Sprite {
  const key = `tower:${level}`;
  const sizes: Array<[number, number]> = [[14, 5], [16, 22], [18, 34], [18, 40], [20, 54]];
  const [w, h] = sizes[Math.min(level, 4)];
  return build(key, w, h, (ctx) => {
    const top = h - TOWER_PLATFORM[level];
    switch (level) {
      case 0:
        ellipse(ctx, w / 2, h, 6, 3, '#5a4632');
        rect(ctx, 6, h - 5, 2, 4, WOOD);
        rect(ctx, 5, h - 6, 4, 1, WOOD_L);
        break;
      case 1: {
        // Помост на сваях.
        rect(ctx, 2, top, 2, h - top, WOOD);
        rect(ctx, w - 4, top, 2, h - top, WOOD);
        line(ctx, 3, top + 3, w - 4, h - 3, WOOD_D);
        line(ctx, w - 4, top + 3, 3, h - 3, WOOD_D);
        rect(ctx, 0, top, w, 2, WOOD_L);
        rect(ctx, 0, top - 4, 1, 4, WOOD);
        rect(ctx, w - 1, top - 4, 1, 4, WOOD);
        rect(ctx, 0, top - 4, w, 1, WOOD_D);
        break;
      }
      case 2: {
        rect(ctx, 2, top, 2, h - top, WOOD);
        rect(ctx, w - 4, top, 2, h - top, WOOD);
        for (let y = top + 4; y < h - 2; y += 8) {
          line(ctx, 3, y, w - 4, y + 7, WOOD_D);
          line(ctx, w - 4, y, 3, y + 7, WOOD_D);
        }
        rect(ctx, 0, top, w, 2, WOOD_L);
        for (let x = 0; x < w; x += 3) rect(ctx, x, top - 5, 2, 5, WOOD);
        // Навес.
        poly(ctx, [[-1, top - 12], [w + 1, top - 12], [w / 2, top - 18]], '#8a3a2a');
        rect(ctx, 1, top - 12, 1, 7, WOOD_D);
        rect(ctx, w - 2, top - 12, 1, 7, WOOD_D);
        break;
      }
      case 3: {
        masonry(ctx, 2, top + 2, w - 4, h - top - 2, 21);
        masonry(ctx, 0, top - 4, w, 6, 23);
        for (let x = 0; x < w; x += 4) masonry(ctx, x, top - 8, 3, 4, 25);
        break;
      }
      default: {
        masonry(ctx, 2, top + 2, w - 4, h - top - 2, 31);
        masonry(ctx, 0, top - 3, w, 5, 33);
        rect(ctx, 1, top - 10, 1, 7, WOOD_D);
        rect(ctx, w - 2, top - 10, 1, 7, WOOD_D);
        poly(ctx, [[-2, top - 10], [w + 2, top - 10], [w / 2, top - 20]], '#5a6a8a');
        line(ctx, w / 2, top - 20, w / 2, top - 26, WOOD_D);
        rect(ctx, w / 2 + 1, top - 26, 4, 3, '#a82a2a');
        break;
      }
    }
  });
}

// ——— Городской центр ———
export const TC_SIZES: Array<[number, number]> = [[20, 8], [24, 30], [36, 36], [44, 50], [50, 60], [62, 72], [72, 84]];

export function townCenterSprite(level: number, banner = '#a82a2a'): Sprite {
  const key = `tc:${level}:${banner}`;
  const [w, h] = TC_SIZES[Math.min(level, 6)];
  return build(key, w, h, (ctx) => {
    const cx = Math.floor(w / 2);
    const flag = (x: number, y: number, len = 8) => {
      line(ctx, x, y, x, y + len, WOOD_D);
      rect(ctx, x + 1, y, 5, 4, banner);
      px(ctx, x + 3, y + 1, '#f2c84a');
      px(ctx, x + 6, y + 1, banner);
      px(ctx, x + 6, y + 2, banner);
    };
    switch (level) {
      case 0: {
        // Заброшенное кострище.
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI;
          px(ctx, cx + Math.cos(a) * 7, h - 1 - Math.sin(a) * 1.5, '#7a7a80');
        }
        line(ctx, cx - 5, h - 2, cx + 4, h - 3, WOOD_D);
        line(ctx, cx - 3, h - 4, cx + 5, h - 2, WOOD);
        break;
      }
      case 1: {
        // Лагерь: тотем со знаменем.
        rect(ctx, cx - 1, 4, 3, h - 4, WOOD);
        rect(ctx, cx - 1, 4, 1, h - 4, WOOD_L);
        rect(ctx, cx - 3, 8, 7, 2, WOOD_D);
        poly(ctx, [[cx + 2, 4], [cx + 10, 5], [cx + 9, 13], [cx + 2, 12]], banner);
        px(ctx, cx + 6, 8, '#f2c84a');
        px(ctx, cx + 5, 7, '#f2c84a');
        px(ctx, cx + 7, 7, '#f2c84a');
        px(ctx, cx, 2, '#f2c84a');
        px(ctx, cx, 3, WOOD_D);
        // Брёвна-скамейки.
        rect(ctx, 1, h - 3, 7, 2, WOOD_D);
        rect(ctx, w - 8, h - 3, 7, 2, WOOD_D);
        break;
      }
      case 2: {
        // Деревянный дом с частоколом.
        rect(ctx, 4, h - 16, w - 8, 16, WOOD);
        for (let x = 5; x < w - 5; x += 3) rect(ctx, x, h - 16, 1, 16, WOOD_D);
        poly(ctx, [[1, h - 16], [w - 1, h - 16], [cx, h - 30]], '#6a4a30');
        line(ctx, 1, h - 16, cx, h - 30, WOOD_L);
        rect(ctx, cx - 3, h - 9, 6, 9, '#2a1a12');
        for (let x = 0; x < w; x += 3) stake(ctx, x, h, 7);
        flag(cx, 0, 6);
        break;
      }
      case 3: {
        // Деревянная крепость с вышкой.
        rect(ctx, 6, h - 24, w - 12, 24, WOOD);
        for (let x = 7; x < w - 6; x += 3) rect(ctx, x, h - 24, 1, 24, WOOD_D);
        rect(ctx, cx - 6, h - 40, 12, 16, WOOD_L);
        for (let x = cx - 5; x < cx + 6; x += 3) rect(ctx, x, h - 40, 1, 16, WOOD);
        poly(ctx, [[cx - 8, h - 40], [cx + 8, h - 40], [cx, h - 48]], '#6a3a2a');
        poly(ctx, [[3, h - 24], [w - 3, h - 24], [w - 8, h - 30], [8, h - 30]], '#6a4a30');
        rect(ctx, cx - 3, h - 10, 6, 10, '#2a1a12');
        rect(ctx, cx - 3, h - 34, 2, 3, '#e8c060');
        rect(ctx, cx + 1, h - 34, 2, 3, '#e8c060');
        for (let x = 0; x < w; x += 3) stake(ctx, x, h, 9);
        flag(cx, 0, 4);
        flag(4, h - 36, 12);
        flag(w - 8, h - 36, 12);
        break;
      }
      case 4: {
        // Каменная цитадель.
        masonry(ctx, 6, h - 34, w - 12, 34, 41);
        masonry(ctx, cx - 8, h - 50, 16, 18, 43);
        for (let x = cx - 8; x < cx + 8; x += 4) masonry(ctx, x, h - 54, 3, 4, 45);
        for (let x = 6; x < w - 6; x += 4) masonry(ctx, x, h - 37, 3, 4, 47);
        rect(ctx, cx - 4, h - 14, 8, 14, '#2a1a12');
        rect(ctx, cx - 4, h - 15, 8, 1, WOOD_L);
        rect(ctx, cx - 1, h - 44, 2, 4, '#e8c060');
        rect(ctx, 10, h - 26, 2, 3, '#e8c060');
        rect(ctx, w - 12, h - 26, 2, 3, '#e8c060');
        flag(cx, 0, 6);
        break;
      }
      case 5: {
        // Замок с двумя башнями.
        masonry(ctx, 10, h - 36, w - 20, 36, 51);
        masonry(ctx, 1, h - 52, 12, 52, 53);
        masonry(ctx, w - 13, h - 52, 12, 52, 55);
        for (let x = 1; x < 13; x += 4) masonry(ctx, x, h - 56, 3, 4, 57);
        for (let x = w - 13; x < w - 1; x += 4) masonry(ctx, x, h - 56, 3, 4, 59);
        masonry(ctx, cx - 9, h - 58, 18, 24, 61);
        poly(ctx, [[cx - 11, h - 58], [cx + 11, h - 58], [cx, h - 70]], '#4a5a8a');
        for (let x = 10; x < w - 10; x += 4) masonry(ctx, x, h - 39, 3, 4, 63);
        rect(ctx, cx - 5, h - 16, 10, 16, '#2a1a12');
        for (let y = h - 15; y < h; y += 3) rect(ctx, cx - 5, y, 10, 1, IRON);
        rect(ctx, 6, h - 40, 2, 4, '#e8c060');
        rect(ctx, w - 8, h - 40, 2, 4, '#e8c060');
        rect(ctx, cx - 1, h - 50, 2, 4, '#e8c060');
        flag(cx, 0, 6);
        flag(6, h - 66, 10);
        flag(w - 7, h - 66, 10);
        break;
      }
      default: {
        // Великий замок.
        masonry(ctx, 12, h - 40, w - 24, 40, 71, '#9a9aa4');
        masonry(ctx, 1, h - 60, 14, 60, 73, '#9a9aa4');
        masonry(ctx, w - 15, h - 60, 14, 60, 75, '#9a9aa4');
        masonry(ctx, cx - 11, h - 68, 22, 30, 77, '#9a9aa4');
        poly(ctx, [[-1, h - 60], [17, h - 60], [8, h - 72]], '#3a4a7a');
        poly(ctx, [[w - 17, h - 60], [w + 1, h - 60], [w - 8, h - 72]], '#3a4a7a');
        poly(ctx, [[cx - 13, h - 68], [cx + 13, h - 68], [cx, h - 82]], '#3a4a7a');
        for (let x = 12; x < w - 12; x += 4) masonry(ctx, x, h - 44, 3, 4, 79, '#9a9aa4');
        rect(ctx, cx - 6, h - 18, 12, 18, '#2a1a12');
        for (let y = h - 17; y < h; y += 3) rect(ctx, cx - 6, y, 12, 1, IRON);
        for (const [x, y] of [[6, h - 46], [w - 8, h - 46], [cx - 1, h - 56], [cx - 5, h - 30], [cx + 3, h - 30]] as Array<[number, number]>) rect(ctx, x, y, 2, 4, '#e8c060');
        flag(cx, 0, 4);
        flag(7, h - 78, 8);
        flag(w - 8, h - 78, 8);
        break;
      }
    }
  });
}

// ——— Лавки инструментов ———
export type ShopKind = 'bow' | 'hammer' | 'scythe' | 'shield' | 'bomb' | 'pike' | 'sword' | 'bread';
const AWNING: Record<ShopKind, string> = { bow: '#4a7a3a', hammer: '#9a5a2a', scythe: '#c8a040', shield: '#a82a2a', bomb: '#5a5a6a', pike: '#6a4a8a', sword: '#4a4e56', bread: '#c87a3a' };

export function shopSprite(kind: ShopKind): Sprite {
  return build(`shop:${kind}`, 24, 22, (ctx, w, h) => {
    const aw = AWNING[kind];
    rect(ctx, 2, 6, 2, h - 6, WOOD);
    rect(ctx, w - 4, 6, 2, h - 6, WOOD);
    // Навес в полоску.
    poly(ctx, [[0, 7], [w, 7], [w - 2, 2], [2, 2]], aw);
    for (let x = 2; x < w - 2; x += 4) poly(ctx, [[x, 7], [x + 2, 7], [x + 2, 2], [x, 2]], shade(aw, 1.3));
    for (let x = 0; x < w; x += 4) {
      px(ctx, x + 1, 8, aw);
      px(ctx, x + 2, 8, shade(aw, 0.7));
    }
    // Перекладина для инструментов.
    rect(ctx, 2, 10, w - 4, 1, WOOD_D);
    // Прилавок.
    rect(ctx, 1, h - 5, w - 2, 2, WOOD_L);
    rect(ctx, 2, h - 3, w - 4, 3, WOOD_D);
  });
}

// ——— Ферма ———
export function farmSprite(stage: number, winter: boolean, built: boolean): Sprite {
  const key = `farm:${stage}:${winter}:${built}`;
  return build(key, 48, 14, (ctx, w, h) => {
    if (!built) {
      // Плодородная земля с колышком.
      rect(ctx, 2, h - 2, w - 4, 2, '#4a3222');
      for (let x = 3; x < w - 3; x += 3) px(ctx, x, h - 2, '#6a4a30');
      rect(ctx, 5, h - 7, 1, 5, WOOD);
      rect(ctx, 3, h - 8, 5, 2, '#c8b890');
      return;
    }
    rect(ctx, 0, h - 3, w, 3, '#4a3020');
    for (let x = 0; x < w; x += 2) px(ctx, x, h - 3, '#6a4630');
    if (winter) {
      for (let x = 0; x < w; x++) if (hash2(x, 5) > 0.3) px(ctx, x, h - 4, '#e8eef4');
      return;
    }
    const cols = ['#7a9a3a', '#5a8a2a', '#8aaa3a', '#d8b848'];
    const heights = [2, 4, 7, 8];
    for (let x = 1; x < w - 1; x += 2) {
      const hh = heights[stage] - (hash2(x, stage) > 0.6 ? 1 : 0);
      line(ctx, x, h - 3, x, h - 3 - hh, cols[stage]);
      if (stage === 3) px(ctx, x, h - 3 - hh, '#f0d868');
    }
  });
}

export function millSprite(): Sprite {
  return build('mill', 26, 40, (ctx, w, h) => {
    poly(ctx, [[6, h], [w - 6, h], [w - 9, 12], [9, 12]], '#c8b894');
    for (let y = 16; y < h; y += 4) line(ctx, 7, y, w - 7, y, '#a89874');
    poly(ctx, [[7, 13], [w - 7, 13], [w / 2, 5]], '#7a3a2a');
    rect(ctx, w / 2 - 2, h - 8, 4, 8, '#2a1a12');
  });
}

// ——— Лагерь бродяг ———
export function campSprite(): Sprite {
  return build('camp', 32, 18, (ctx, w, h) => {
    // Латаная палатка из светлой ткани.
    poly(ctx, [[1, h], [19, h], [10, h - 15]], '#a8987a');
    poly(ctx, [[10, h - 15], [19, h], [14, h]], '#7a6a54');
    line(ctx, 10, h - 15, 10, h - 17, WOOD);
    line(ctx, 10, h - 15, 1, h - 1, '#c8b898');
    rect(ctx, 9, h - 6, 3, 6, '#2a2018');
    rect(ctx, 4, h - 6, 3, 3, '#8a6a4a');
    rect(ctx, 13, h - 9, 2, 3, '#6a7a6a');
    rect(ctx, 15, h - 4, 2, 2, '#9a5a4a');
    // Котелок на палке и кострище.
    line(ctx, 22, h - 1, 28, h - 2, WOOD_D);
    line(ctx, 22, h - 2, 28, h - 1, WOOD);
    px(ctx, 21, h - 1, '#7a7a80');
    px(ctx, 29, h - 1, '#7a7a80');
    line(ctx, 21, h - 9, 29, h - 9, WOOD_D);
    rect(ctx, 24, h - 8, 3, 2, '#3a3a40');
    void w;
  });
}

// ——— Сундук ———
export function chestSprite(open: boolean, gem = false): Sprite {
  return build(`chest:${open}:${gem}`, 11, 9, (ctx, w, h) => {
    const body = gem ? '#3a4a6a' : WOOD;
    const trim = gem ? '#8ae0f0' : '#d8a840';
    rect(ctx, 1, h - 5, w - 2, 5, body);
    rect(ctx, 1, h - 5, w - 2, 1, trim);
    rect(ctx, 5, h - 4, 1, 2, trim);
    if (open) {
      rect(ctx, 1, 0, w - 2, 3, shade(body, 0.8));
      rect(ctx, 1, 0, w - 2, 1, trim);
      rect(ctx, 2, h - 6, w - 4, 1, '#1a1210');
    } else {
      rect(ctx, 1, h - 8, w - 2, 3, shade(body, 1.15));
      rect(ctx, 1, h - 8, w - 2, 1, trim);
    }
  });
}

// ——— Портал Жадности ———
export function portalFrame(t: number, broken: boolean, big: boolean): Sprite {
  const W = big ? 44 : 30;
  const H = big ? 58 : 40;
  const f = Math.floor(t * 6) % 6;
  return build(`portal:${big}:${broken}:${broken ? 0 : f}`, W, H, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h * 0.55;
    if (broken) {
      for (let i = 0; i < 9; i++) {
        const x = 3 + (i * (w - 6)) / 9;
        rect(ctx, x, h - 3 - (i % 3), 3, 3 + (i % 3), '#2a2230');
      }
      return;
    }
    // Каменное обрамление-клыки.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const rx = cx + Math.cos(a) * (w * 0.46);
      const ry = cy + Math.sin(a) * (h * 0.44);
      poly(ctx, [[rx - 2, ry], [rx + 2, ry], [cx + Math.cos(a) * w * 0.3, cy + Math.sin(a) * h * 0.3]], '#2a2230');
    }
    ellipse(ctx, cx, cy, w * 0.38, h * 0.42, '#140a1e');
    ellipse(ctx, cx, cy, w * 0.33, h * 0.37, '#2a1440');
    // Вихрь.
    for (let k = 0; k < 3; k++) {
      const rot = (f / 6) * Math.PI * 2 + (k * Math.PI * 2) / 3;
      for (let s = 0; s < 14; s++) {
        const rr = s / 14;
        const a = rot + rr * 4;
        px(ctx, cx + Math.cos(a) * rr * w * 0.3, cy + Math.sin(a) * rr * h * 0.34, rr > 0.6 ? '#8a4ab8' : '#5a2a88');
      }
    }
    ellipse(ctx, cx, cy, 2, 2.5, '#d8a0ff');
    rect(ctx, 0, h - 2, w, 2, '#2a2230');
  });
}

/** Утёс с большим порталом на краю острова. */
export function cliffSprite(side: -1 | 1): Sprite {
  return build(`cliff:${side}`, 90, 150, (ctx, w, h) => {
    const r = new Rng(77);
    const pts: Array<[number, number]> = [];
    // Скала поднимается к краю острова.
    const edge = side > 0 ? w : 0;
    const inner = side > 0 ? 0 : w;
    pts.push([inner, h]);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const x = inner + (edge - inner) * t;
      const y = h - 20 - Math.pow(t, 0.7) * (h - 30) + r.range(-4, 4);
      pts.push([x, y]);
    }
    pts.push([edge, h]);
    poly(ctx, pts, '#4a4450');
    for (let i = 0; i < 70; i++) {
      const x = r.int(0, w - 1);
      const y = r.int(20, h - 1);
      const t = side > 0 ? x / w : 1 - x / w;
      if (y > h - 20 - Math.pow(t, 0.7) * (h - 30) + 3) rect(ctx, x, y, r.int(2, 5), 1, r.chance(0.5) ? '#5a5462' : '#3a3440');
    }
  });
}

// ——— Пристань и лодка ———
export function dockSprite(): Sprite {
  return build('dock', 56, 20, (ctx, w, h) => {
    // Настил пристани на сваях, уходящих в воду.
    rect(ctx, 0, h - 16, w, 3, WOOD_L);
    rect(ctx, 0, h - 13, w, 1, WOOD_D);
    for (let x = 0; x < w; x += 4) px(ctx, x, h - 16, WOOD_D);
    for (let x = 3; x < w; x += 11) {
      rect(ctx, x, h - 13, 2, 13, WOOD_D);
      px(ctx, x, h - 13, WOOD);
    }
    // Швартовочные тумбы и верёвка.
    rect(ctx, 2, h - 20, 2, 4, WOOD_D);
    rect(ctx, w - 4, h - 20, 2, 4, WOOD_D);
    line(ctx, 4, h - 19, w - 4, h - 19, ROPE);
  });
}

/** Песчаный пляж на краю острова. */
export function beachSprite(side: -1 | 1): Sprite {
  return build(`beach:${side}`, 90, 14, (ctx, w, h) => {
    for (let x = 0; x < w; x++) {
      const t = side > 0 ? x / w : 1 - x / w;
      const top = Math.round(3 + t * 9);
      rect(ctx, x, top, 1, h - top, (x * 13) % 7 === 0 ? '#c8b088' : '#d8c098');
      if (t > 0.85) rect(ctx, x, top, 1, 1, '#e8f0f0');
    }
  });
}

export function boatSprite(stage: number): Sprite {
  return build(`boat:${stage}`, 80, 70, (ctx, w, h) => {
    const hullTop = h - 16;
    if (stage === 0) {
      // Разбитый остов, лежащий на боку: рёбра шпангоутов и обломок мачты.
      poly(ctx, [[6, h - 1], [66, h - 1], [72, h - 14], [58, h - 20], [12, h - 12]], '#4a3424');
      poly(ctx, [[10, h - 3], [62, h - 3], [66, h - 12], [14, h - 10]], '#5a4030');
      for (let x = 14; x < 64; x += 5) line(ctx, x, h - 11, x - 3, h - 26 + ((x * 7) % 6), WOOD_L);
      line(ctx, 40, h - 14, 58, h - 38, WOOD_D);
      line(ctx, 41, h - 14, 59, h - 38, WOOD);
      poly(ctx, [[58, h - 38], [66, h - 30], [52, h - 26]], '#b8b0a0');
      return;
    }
    // Корпус.
    poly(ctx, [[6, hullTop], [w - 4, hullTop - 4], [w - 12, h - 2], [14, h - 2]], WOOD);
    for (let y = hullTop + 3; y < h - 2; y += 3) line(ctx, 9, y, w - 8, y - 1, WOOD_D);
    line(ctx, 6, hullTop, w - 4, hullTop - 4, WOOD_L);
    if (stage >= 2) {
      rect(ctx, w / 2 - 1, 6, 2, hullTop - 6, WOOD_D);
      line(ctx, w / 2, 6, 8, hullTop, ROPE);
      line(ctx, w / 2, 6, w - 6, hullTop - 4, ROPE);
    }
    if (stage >= 3) {
      poly(ctx, [[w / 2 + 2, 8], [w / 2 + 22, 16], [w / 2 + 20, 38], [w / 2 + 2, 42]], '#e8e0cc');
      poly(ctx, [[w / 2 - 2, 10], [w / 2 - 18, 18], [w / 2 - 16, 36], [w / 2 - 2, 40]], '#d8d0bc');
      rect(ctx, w / 2 + 6, 22, 8, 6, '#a82a2a');
      rect(ctx, w / 2 - 1, 2, 7, 4, '#a82a2a');
    }
  });
}

// ——— Статуя (святилище) ———
export type StatueKind = 'archer' | 'builder' | 'farmer' | 'knight' | 'scythe';
export function statueSprite(kind: StatueKind, active: boolean): Sprite {
  return build(`statue:${kind}:${active}`, 18, 32, (ctx, w, h) => {
    const st = active ? '#d8c070' : '#8a8a90';
    const sd = active ? '#a88a3a' : '#5e5e66';
    masonry(ctx, 2, h - 8, w - 4, 8, 91, '#7a7a82');
    const cx = w / 2;
    // Фигура.
    rect(ctx, cx - 2, h - 20, 4, 12, st);
    rect(ctx, cx - 2, h - 20, 1, 12, sd);
    rect(ctx, cx - 2, h - 25, 4, 4, st);
    if (kind === 'archer') line(ctx, cx + 3, h - 24, cx + 3, h - 12, sd);
    if (kind === 'builder') rect(ctx, cx + 2, h - 22, 3, 2, sd);
    if (kind === 'farmer' || kind === 'scythe') line(ctx, cx + 3, h - 26, cx + 3, h - 9, sd);
    if (kind === 'knight') rect(ctx, cx + 2, h - 18, 3, 5, sd);
  });
}

// ——— Хижина отшельника ———
export function hutSprite(): Sprite {
  return build('hut', 24, 22, (ctx, w, h) => {
    rect(ctx, 3, h - 11, w - 6, 11, '#8a7a5a');
    for (let x = 4; x < w - 3; x += 3) rect(ctx, x, h - 11, 1, 11, '#6a5a42');
    poly(ctx, [[0, h - 10], [w, h - 10], [w - 6, h - 20], [6, h - 20]], '#6a7a4a');
    rect(ctx, w - 8, h - 22, 3, 5, STONE_D);
    rect(ctx, w / 2 - 2, h - 7, 4, 7, '#2a1a12');
    rect(ctx, 6, h - 8, 3, 3, '#e8c060');
  });
}

export function stableSprite(): Sprite {
  return build('stable', 40, 24, (ctx, w, h) => {
    rect(ctx, 2, h - 14, w - 4, 14, WOOD);
    for (let x = 3; x < w - 2; x += 3) rect(ctx, x, h - 14, 1, 14, WOOD_D);
    poly(ctx, [[0, h - 13], [w, h - 13], [w - 4, h - 22], [4, h - 22]], '#8a4a2a');
    rect(ctx, 8, h - 10, 8, 10, '#2a1a12');
    rect(ctx, w - 16, h - 10, 8, 10, '#2a1a12');
    line(ctx, 8, h - 10, 15, h - 1, WOOD_L);
    line(ctx, w - 16, h - 10, w - 9, h - 1, WOOD_L);
  });
}

export function bakerySprite(): Sprite {
  return build('bakery', 30, 26, (ctx, w, h) => {
    masonry(ctx, 3, h - 14, w - 6, 14, 101, '#a08a70');
    poly(ctx, [[0, h - 13], [w, h - 13], [w / 2, h - 24]], '#7a3a2a');
    rect(ctx, w - 9, h - 26, 4, 8, STONE_D);
    ellipse(ctx, w / 2, h - 5, 4, 4, '#2a1a12');
    rect(ctx, w / 2 - 3, h - 5, 6, 1, '#ff9a40');
  });
}

export function ballistaSprite(): Sprite {
  return build('ballista', 22, 48, (ctx, w, h) => {
    masonry(ctx, 3, 14, w - 6, h - 14, 111);
    masonry(ctx, 1, 10, w - 2, 5, 113);
    rect(ctx, 5, 6, 12, 2, WOOD);
    line(ctx, 5, 3, 5, 11, WOOD_D);
    line(ctx, 16, 3, 16, 11, WOOD_D);
    line(ctx, 5, 3, 16, 7, ROPE);
    line(ctx, 5, 11, 16, 7, ROPE);
    line(ctx, 7, 7, 20, 7, '#c8ccd0');
  });
}

export function catapultSprite(): Sprite {
  return build('catapult', 24, 18, (ctx, w, h) => {
    rect(ctx, 2, h - 6, w - 4, 3, WOOD);
    ellipse(ctx, 5, h - 2, 2.5, 2.5, WOOD_D);
    ellipse(ctx, w - 5, h - 2, 2.5, 2.5, WOOD_D);
    line(ctx, 6, h - 6, 12, h - 13, WOOD_D);
    line(ctx, w - 6, h - 6, 12, h - 13, WOOD_D);
    line(ctx, 12, h - 12, 3, 2, WOOD_L);
    ellipse(ctx, 3, 3, 2.5, 2, '#5a4a3a');
  });
}

export function hornSprite(): Sprite {
  return build('horn', 14, 8, (ctx) => {
    poly(ctx, [[1, 3], [10, 1], [12, 5], [3, 5]], '#e8dcc0');
    line(ctx, 3, 3, 10, 2, '#c8b890');
    rect(ctx, 10, 1, 3, 5, '#a88a50');
  });
}

export function dogHouseSprite(): Sprite {
  return build('doghouse', 14, 12, (ctx, w, h) => {
    rect(ctx, 2, h - 7, w - 4, 7, WOOD);
    poly(ctx, [[0, h - 6], [w, h - 6], [w / 2, h - 12]], '#8a3a2a');
    ellipse(ctx, w / 2, h - 2, 2, 3, '#1a1210');
  });
}

export function lighthouseSprite(): Sprite {
  return build('lighthouse', 20, 70, (ctx, w, h) => {
    poly(ctx, [[4, h], [w - 4, h], [w - 6, 16], [6, 16]], '#d8d0c0');
    for (let y = 24; y < h; y += 12) poly(ctx, [[5, y], [w - 5, y], [w - 5, y + 5], [5, y + 5]], '#a82a2a');
    rect(ctx, 5, 8, w - 10, 8, '#2a2a30');
    rect(ctx, 7, 10, w - 14, 4, '#f2d870');
    poly(ctx, [[3, 8], [w - 3, 8], [w / 2, 1]], '#3a3a42');
  });
}

export function stumpSprite(): Sprite {
  return build('stump', 8, 4, (ctx) => {
    rect(ctx, 1, 1, 6, 3, WOOD_D);
    rect(ctx, 1, 1, 6, 1, WOOD_L);
    px(ctx, 3, 1, '#c8a878');
  });
}

export function rockSprite(v: number): Sprite {
  return build(`rock:${v % 4}`, 16, 9, (ctx, w, h) => {
    const r = new Rng(v * 17 + 3);
    ellipse(ctx, w / 2, h - 3, r.range(5, 7), r.range(3, 4.5), '#6a6a72');
    ellipse(ctx, w / 2 - 1, h - 4, r.range(3, 5), r.range(2, 3), '#8a8a92');
    px(ctx, w / 2 - 2, h - 6, '#a8a8b0');
  });
}

/** Леса вокруг строящейся постройки. */
export function scaffoldSprite(w: number, h: number): Sprite {
  return build(`scaffold:${w}:${h}`, w, h, (ctx) => {
    for (let x = 0; x < w; x += Math.max(6, Math.floor(w / 3))) rect(ctx, x, 0, 1, h, WOOD_L);
    rect(ctx, w - 1, 0, 1, h, WOOD_L);
    for (let y = 2; y < h; y += 7) rect(ctx, 0, y, w, 1, WOOD);
    for (let y = 2; y + 7 < h; y += 7) line(ctx, 0, y, Math.min(w - 1, 7), y + 7, WOOD_D);
  });
}

// ——— Шахты ———
export function mineSprite(kind: 'stone' | 'iron', built: boolean): Sprite {
  return build(`mine:${kind}:${built}`, 44, 60, (ctx, w, h) => {
    if (kind === 'stone') {
      // Две каменные колонны: левая более чем вдвое выше правой.
      masonry(ctx, 6, h - 56, 12, 56, 121, '#9a9a9e');
      masonry(ctx, 24, h - 24, 12, 24, 123, '#9a9a9e');
      if (built) {
        rect(ctx, 18, h - 10, 6, 10, '#2a2226');
        line(ctx, 4, h - 1, 40, h - 1, WOOD_D);
        rect(ctx, 30, h - 30, 8, 5, WOOD);
      }
    } else {
      // Огромная красная глыба.
      ellipse(ctx, w / 2, h - 18, 20, 18, '#8a3a2a');
      ellipse(ctx, w / 2 - 4, h - 24, 12, 10, '#a84a32');
      for (let i = 0; i < 14; i++) px(ctx, 8 + ((i * 7) % 28), h - 6 - ((i * 5) % 26), '#c86a4a');
      if (built) {
        rect(ctx, w / 2 - 4, h - 10, 8, 10, '#1e1414');
        line(ctx, 2, h - 1, 42, h - 1, WOOD_D);
      }
    }
  });
}

export function bannerSprite(color: string): Sprite {
  return build(`banner:${color}`, 12, 26, (ctx) => {
    rect(ctx, 2, 0, 1, 26, WOOD_D);
    poly(ctx, [[3, 1], [11, 2], [10, 12], [3, 11]], color);
    px(ctx, 6, 5, '#f2c84a');
    px(ctx, 7, 6, '#f2c84a');
    px(ctx, 5, 6, '#f2c84a');
    px(ctx, 6, 7, '#f2c84a');
  });
}

export function workshopSprite(): Sprite {
  return build('workshop', 28, 20, (ctx, w, h) => {
    rect(ctx, 2, h - 12, w - 4, 12, WOOD);
    for (let x = 3; x < w - 2; x += 3) rect(ctx, x, h - 12, 1, 12, WOOD_D);
    poly(ctx, [[0, h - 11], [w, h - 11], [w - 5, h - 19], [5, h - 19]], '#6a6a72');
    rect(ctx, 10, h - 8, 8, 8, '#2a1a12');
  });
}

export function teleportSprite(active: boolean): Sprite {
  return build(`teleport:${active}`, 20, 30, (ctx, w, h) => {
    masonry(ctx, 1, h - 26, 4, 26, 131);
    masonry(ctx, w - 5, h - 26, 4, 26, 133);
    masonry(ctx, 1, h - 29, w - 2, 4, 135);
    if (active) {
      ellipse(ctx, w / 2, h - 13, 5, 11, '#6ad0e0');
      ellipse(ctx, w / 2, h - 13, 3, 8, '#c8f8ff');
    }
  });
}

export function citizenHouseSprite(): Sprite {
  return build('citizenHouse', 30, 26, (ctx, w, h) => {
    rect(ctx, 3, h - 14, w - 6, 14, '#b09a7a');
    for (let x = 4; x < w - 3; x += 4) rect(ctx, x, h - 14, 1, 14, '#8a7a5a');
    poly(ctx, [[0, h - 13], [w, h - 13], [w / 2, h - 25]], '#8a4a2a');
    rect(ctx, w / 2 - 3, h - 9, 6, 9, '#2a1a12');
    rect(ctx, 6, h - 11, 3, 3, '#e8c060');
    rect(ctx, w - 9, h - 11, 3, 3, '#e8c060');
  });
}

export function bombSprite(): Sprite {
  return build('bomb', 22, 20, (ctx) => {
    rect(ctx, 2, 14, 18, 3, WOOD);
    ellipse(ctx, 6, 18, 2.5, 2.5, WOOD_D);
    ellipse(ctx, 16, 18, 2.5, 2.5, WOOD_D);
    ellipse(ctx, 11, 8, 7, 7, '#2a2a32');
    ellipse(ctx, 9, 6, 2, 2, '#5a5a64');
    line(ctx, 13, 2, 16, 0, '#c8a060');
  });
}

export function nestSprite(): Sprite {
  return build('nest', 26, 22, (ctx, w, h) => {
    ellipse(ctx, w / 2, h - 7, 12, 8, '#1e1226');
    ellipse(ctx, w / 2, h - 9, 8, 6, '#3a1e4a');
    for (let i = 0; i < 5; i++) px(ctx, 6 + i * 3, h - 12 + (i % 2), '#f0ebe0');
  });
}

export function dogTrapSprite(): Sprite {
  return build('dogTrap', 40, 14, (ctx, w, h) => {
    // Упавшее дерево.
    poly(ctx, [[0, h - 6], [w, h - 10], [w, h - 5], [0, h - 1]], '#5a3e28');
    line(ctx, 0, h - 6, w, h - 10, '#7a5638');
    ellipse(ctx, w - 4, h - 8, 5, 4, '#3a5a36');
    void w;
  });
}
