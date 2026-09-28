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

export type RackItem = 'bow' | 'hammer' | 'scythe' | 'shield' | 'bomb' | 'pike';

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
