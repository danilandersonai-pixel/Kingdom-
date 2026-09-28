// Мелкие предметы: монеты (с вращением), самоцветы, корона,
// стрелы, инструменты на прилавках, мешочек-кошелёк для интерфейса.

import { fromRows, type Sprite, makeCanvas } from '../engine/sprite';
import { line, px, ellipse } from './px';

const COIN_PAL = { Y: '#f2c84a', y: '#c8962a', W: '#fff4c0', d: '#8a5a1a' };

let coinFrames: Sprite[] | null = null;
export function coinSprites(): Sprite[] {
  if (coinFrames) return coinFrames;
  coinFrames = [
    fromRows(['.yYy.', 'yYWYd', 'yYYYd', 'yYYyd', '.ydd.'], COIN_PAL, 2, 5),
    fromRows(['.yY.', 'yYWd', 'yYYd', 'yYyd', '.dd.'], COIN_PAL, 2, 5),
    fromRows(['.Y.', 'yWd', 'yYd', 'yYd', '.d.'], COIN_PAL, 1, 5),
    fromRows(['Y', 'W', 'Y', 'y', 'd'], COIN_PAL, 0, 5),
    fromRows(['.Y.', 'dWy', 'dYy', 'dYy', '.d.'], COIN_PAL, 1, 5),
    fromRows(['.Yy.', 'dWYy', 'dYYy', 'dyYy', '.dd.'], COIN_PAL, 2, 5),
  ];
  return coinFrames;
}

const GEM_PAL = { C: '#5ae0f0', c: '#2a9ab8', W: '#e8ffff', d: '#1a5a78' };
let gem: Sprite | null = null;
export function gemSprite(): Sprite {
  if (gem) return gem;
  gem = fromRows(['..W..', '.WCc.', 'CCCcc', '.Ccd.', '..d..'], GEM_PAL, 2, 5);
  return gem;
}
let bigGem: Sprite | null = null;
export function hudGem(): Sprite {
  if (bigGem) return bigGem;
  bigGem = fromRows(['...W...', '..WCc..', '.WCCcc.', 'CCCCccd', '.CCccd.', '..Ccd..', '...d...'], GEM_PAL, 3, 7);
  return bigGem;
}

let crown: Sprite | null = null;
export function crownSprite(): Sprite {
  if (crown) return crown;
  crown = fromRows(['Y.Y.Y', 'YYRYY', 'yyyyy'], { Y: '#f2c84a', y: '#c8962a', R: '#e04040' }, 2, 3);
  return crown;
}

let arrow: Sprite | null = null;
export function arrowSprite(): Sprite {
  if (arrow) return arrow;
  arrow = fromRows(['ww.....', '.wwwwmM'], { w: '#e8e0c8', m: '#b8b8b8', M: '#e0e0e0' }, 3, 1);
  return arrow;
}

export type RackItem = 'bow' | 'hammer' | 'scythe' | 'shield' | 'bomb' | 'pike' | 'sword' | 'bread';

const rackCache = new Map<RackItem, Sprite>();
export function rackItemSprite(item: RackItem): Sprite {
  let s = rackCache.get(item);
  if (s) return s;
  const [c, ctx] = makeCanvas(9, 11);
  switch (item) {
    case 'bow':
      line(ctx, 3, 0, 5, 3, '#7a4a24');
      line(ctx, 5, 3, 5, 7, '#7a4a24');
      line(ctx, 5, 7, 3, 10, '#7a4a24');
      line(ctx, 3, 0, 3, 10, '#e8e0c8');
      break;
    case 'hammer':
      line(ctx, 4, 3, 4, 10, '#7a5230');
      line(ctx, 2, 2, 7, 2, '#70747a');
      line(ctx, 2, 3, 7, 3, '#50545a');
      break;
    case 'scythe':
      line(ctx, 2, 1, 5, 10, '#7a5230');
      line(ctx, 2, 1, 7, 2, '#c8ccd0');
      line(ctx, 7, 2, 8, 4, '#e8ecf0');
      break;
    case 'shield':
      ctx.fillStyle = '#a82a2a';
      ctx.fillRect(1, 1, 7, 6);
      ctx.fillRect(2, 7, 5, 2);
      ctx.fillRect(3, 9, 3, 1);
      px(ctx, 4, 3, '#f2c84a');
      px(ctx, 4, 4, '#f2c84a');
      px(ctx, 3, 3, '#f2c84a');
      px(ctx, 5, 3, '#f2c84a');
      break;
    case 'bomb':
      ellipse(ctx, 4, 7, 3.5, 3.5, '#2a2a32');
      px(ctx, 3, 5, '#6a6a74');
      line(ctx, 5, 3, 6, 1, '#c8a060');
      break;
    case 'pike':
      line(ctx, 4, 2, 4, 10, '#7a5230');
      line(ctx, 4, 0, 4, 2, '#d0d4d8');
      break;
    case 'bread':
      ellipse(ctx, 4, 7, 4, 2.5, '#c8883a');
      ellipse(ctx, 4, 6, 3, 1.5, '#e0a858');
      break;
    case 'sword':
      line(ctx, 4, 0, 4, 7, '#dde2e8');
      line(ctx, 2, 7, 6, 7, '#a08040');
      line(ctx, 4, 8, 4, 10, '#6a4a2a');
      break;
  }
  s = { img: c, w: 9, h: 11, ax: 4, ay: 11 };
  rackCache.set(item, s);
  return s;
}

/** Кожаный мешочек-кошелёк, раскрытый сверху. Две части: задняя стенка
 *  с тёмным нутром и передняя с загнутым краем, шнурком и кисточками.
 *  Монеты рисуются между ними — нижний ряд прячется за передним краем. */
export const POUCH = { w: 64, h: 47, mouthY: 14, rx: 24, ry: 6 };

/** Внутренний край горловины (передний) над смещением dx от центра. */
export function pouchRimY(dx: number): number {
  const k = Math.min(1, Math.abs(dx) / POUCH.rx);
  return POUCH.mouthY + POUCH.ry * Math.sqrt(1 - k * k);
}

let pouchParts: { back: Sprite; front: Sprite } | null = null;
export function pouchSprites(): { back: Sprite; front: Sprite } {
  if (pouchParts) return pouchParts;
  const { w: W, h: H, mouthY: my, rx, ry } = POUCH;
  const cx = W / 2;
  const [bc, bctx] = makeCanvas(W, H);
  const [fc, fctx] = makeCanvas(W, H);
  const put = (ctx: CanvasRenderingContext2D, x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  };
  const inEll = (x: number, y: number, a: number, b: number) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - my;
    return (dx * dx) / (a * a) + (dy * dy) / (b * b) <= 1;
  };
  // Полуширина мешка на строке y: от горловины раздувается пузом и
  // сходится круглым дном — мешочек, а не кадка.
  const span = H - 1 - my;
  const belly = 0.3;
  const peak = rx + 6;
  const halfW = (y: number) => {
    const t = (y + 0.5 - my) / span;
    if (t < 0) return 0;
    if (t < belly) return rx + 2 + (peak - rx - 2) * Math.sin((Math.PI * t) / (2 * belly));
    const k = (t - belly) / (1 - belly);
    return k >= 1 ? 0 : peak * Math.pow(1 - k * k, 0.6);
  };
  const LEATHER = ['#3e2614', '#4e3019', '#5e3b1f', '#704826', '#82552d', '#966536', '#aa7641'];
  const inBody = (x: number, y: number) => y >= my - 1 && Math.abs(x + 0.5 - cx) <= halfW(y) && !inEll(x, y, rx + 2, ry + 2);
  const inRing = (x: number, y: number) => inEll(x, y, rx + 2, ry + 2) && !inEll(x, y, rx, ry);

  // ——— Задняя стенка: нутро (темнее у задней стенки) и верхняя дуга края.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dy = y + 0.5 - my;
      if (inEll(x, y, rx, ry)) {
        const t = (dy + ry) / (2 * ry);
        put(bctx, x, y, t < 0.3 ? '#1e120a' : t < 0.6 ? '#2a1a0e' : '#362214');
      } else if (dy < 0 && inRing(x, y)) {
        // Край загнут наружу: верхний пиксель освещён, нижний — в тени.
        const outer = !inRing(x, y - 1);
        const left = x < cx;
        put(bctx, x, y, outer ? (left ? '#c08c56' : '#a0703e') : left ? '#825530' : '#6a4424');
      } else if (dy < 1 && inEll(x, y, rx + 3, ry + 3) && !inEll(x, y, rx + 2, ry + 2)) {
        put(bctx, x, y, '#24140a');
      }
    }
  }

  // ——— Передняя стенка: пузатое тело со светом слева-сверху.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inBody(x, y)) continue;
      const hw = halfW(y);
      const u = (x + 0.5 - cx) / Math.max(1, hw);
      const t = (y + 0.5 - my) / span;
      // Сфера: светлее слева-сверху, края и дно темнее.
      let l = 0.62 - 0.42 * u - 0.5 * t - 0.25 * u * u;
      // Тень под загнутым краем.
      if (inEll(x, y - 2, rx + 2, ry + 2)) l -= 0.28;
      const out = (xx: number, yy: number) => !inBody(xx, yy) && !inRing(xx, yy);
      const edge = out(x - 1, y) || out(x + 1, y) || out(x, y - 1) || !inBody(x, y + 1);
      if (edge) {
        put(fctx, x, y, '#24140a');
        continue;
      }
      const i = Math.max(0, Math.min(LEATHER.length - 1, Math.round(l * (LEATHER.length - 1))));
      put(fctx, x, y, LEATHER[i]);
    }
  }
  // Складки от горловины вниз: тёмная борозда и светлый край слева.
  const folds: Array<[number, number, number]> = [[-18, -3, 12], [-7, -1, 18], [5, 1, 16], [16, 3, 10]];
  for (const [fx, bend, len] of folds) {
    for (let k = 0; k < len; k++) {
      const y = Math.round(pouchRimY(fx) + 3 + k);
      const x = Math.round(cx + fx + (bend * k) / len);
      if (!inBody(x, y) || !inBody(x, y + 1)) break;
      const fade = k > len * 0.7;
      put(fctx, x, y, fade ? '#5e3b1f' : '#4a2c16');
      if (inBody(x - 1, y) && !fade) put(fctx, x - 1, y, '#9a6a3a');
    }
  }
  // Передняя дуга края: светлая кромка у нутра, ниже — толщина кожи.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (y + 0.5 - my < 0 || !inRing(x, y)) continue;
      const inner = !inRing(x, y - 1) && inEll(x, y - 1, rx, ry);
      const left = x < cx;
      put(fctx, x, y, inner ? (left ? '#d49c60' : '#b07c48') : left ? '#946438' : '#7a4e2a');
    }
  }
  // Шнурок вокруг горловины — витой, светлые и тёмные звенья.
  for (let x = -rx; x <= rx; x++) {
    const k = Math.min(1, Math.abs(x) / (rx + 2));
    const y = Math.round(my + (ry + 2) * Math.sqrt(1 - k * k) + 1);
    put(fctx, Math.round(cx + x), y, (x + 40) % 3 === 0 ? '#8a6a3a' : '#e0c080');
  }
  // Узел шнурка и две кисточки справа.
  const kx = Math.round(cx + 13);
  const ky = Math.round(pouchRimY(13) + 3);
  for (const [dx, dy, c] of [[-1, 0, '#c8a868'], [0, 0, '#f0d898'], [1, 0, '#c8a868'], [0, 1, '#a88848']] as Array<[number, number, string]>) put(fctx, kx + dx, ky + dy, c);
  for (const [dir, len] of [[-1, 7], [1, 5]] as Array<[number, number]>) {
    for (let k = 2; k <= len; k++) put(fctx, kx + (k > 3 ? dir : 0), ky + k, '#d0b070');
    // Кисточка: пушистый кончик.
    const tx = kx + dir;
    const ty = ky + len + 1;
    put(fctx, tx - 1, ty, '#e8d098');
    put(fctx, tx, ty, '#f4e0b0');
    put(fctx, tx + 1, ty, '#e8d098');
    put(fctx, tx, ty + 1, '#c8a868');
  }
  pouchParts = {
    back: { img: bc, w: W, h: H, ax: Math.floor(W / 2), ay: 0 },
    front: { img: fc, w: W, h: H, ax: Math.floor(W / 2), ay: 0 },
  };
  return pouchParts;
}
