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

/** Крупная монета для кошелька в интерфейсе. */
let bigCoin: Sprite | null = null;
export function hudCoin(): Sprite {
  if (bigCoin) return bigCoin;
  bigCoin = fromRows(['..yyy..', '.yYYYy.', 'yYWWYYd', 'yYWYYYd', 'yYYYYyd', '.yYyyd.', '..ddd..'], COIN_PAL, 3, 7);
  return bigCoin;
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

/** Кожаный кошелёк для интерфейса. */
let purse: Sprite | null = null;
export function purseSprite(): Sprite {
  if (purse) return purse;
  purse = fromRows(
    [
      '....bb....',
      '...bBBb...',
      '....bb....',
      '..bBBBBb..',
      '.bBBLBBBb.',
      'bBBLBBBBBb',
      'bBBBBBBBBb',
      'bBBBBBBBbb',
      '.bBBBBBbb.',
      '..bbbbbb..',
    ],
    { b: '#4a2e1a', B: '#7a5030', L: '#a07048' },
    5,
    10,
  );
  return purse;
}

/** Кожаный мешочек-кошелёк: внутри видна горка монет. */
let pouch: Sprite | null = null;
export function pouchSprite(): Sprite {
  if (pouch) return pouch;
  const W = 64;
  const H = 36;
  const [c, ctx] = makeCanvas(W, H);
  const cx = W / 2;
  // Тело мешка.
  ellipse(ctx, cx, H - 15, 31, 15, '#3a2414');
  ellipse(ctx, cx, H - 16, 29, 13.5, '#6a4426');
  ellipse(ctx, cx, H - 17, 26, 11, '#1e140c');
  // Горлышко и завязка.
  ctx.fillStyle = '#6a4426';
  ctx.fillRect(cx - 14, 4, 28, 5);
  ctx.fillStyle = '#8a5e36';
  ctx.fillRect(cx - 14, 4, 28, 1);
  ctx.fillStyle = '#c8a060';
  ctx.fillRect(cx - 16, 8, 32, 1);
  ctx.fillRect(cx + 12, 9, 1, 4);
  ctx.fillRect(cx + 14, 9, 1, 3);
  // Блики на коже.
  line(ctx, cx - 24, H - 22, cx - 19, H - 27, '#8a5e36');
  line(ctx, cx + 20, H - 7, cx + 25, H - 11, '#4a2e18');
  pouch = { img: c, w: W, h: H, ax: Math.floor(W / 2), ay: H };
  return pouch;
}
