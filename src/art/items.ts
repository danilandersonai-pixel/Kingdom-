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
 *  с тёмным нутром и передняя — волнистый край над шнурком, стянутое горло,
 *  мягкое пузо со складками. Монеты рисуются между ними: нижний ряд
 *  прячется за передним краем. */
export const POUCH = { w: 64, h: 50, mouthY: 15, rx: 21, ry: 5 };

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
  const ell = (x: number, y: number, a: number, b: number) => {
    const dx = (x + 0.5 - cx) / a;
    const dy = (y + 0.5 - my) / b;
    return dx * dx + dy * dy;
  };
  // Волнистый край: радиус «оборки» гуляет по углу — кожа собрана в складки.
  const inFrillOuter = (x: number, y: number) => {
    const ang = Math.atan2((y + 0.5 - my) / (ry + 2), (x + 0.5 - cx) / (rx + 3));
    const wave = 1 + 0.07 * Math.sin(ang * 9) + 0.03 * Math.sin(ang * 23);
    return ell(x, y, rx + 3, ry + 2) <= wave * wave;
  };
  const inMouth = (x: number, y: number) => ell(x, y, rx, ry) <= 1;
  const inFrill = (x: number, y: number) => inFrillOuter(x, y) && !inMouth(x, y);
  // Шнурок под передним краем; горло стянуто, ниже — пузо, дно чуть провисает вправо.
  const cordY = (x: number) => {
    const k = Math.min(1, Math.abs(x + 0.5 - cx) / (rx + 3));
    return Math.round(my + (ry + 2) * Math.sqrt(1 - k * k) + 1);
  };
  const neckY = my + ry + 3;
  const span = H - 1 - neckY;
  // Груша: узкое стянутое горло, пузо в нижней половине, круглое дно.
  const neckHalf = rx - 3;
  const halfW = (y: number) => {
    const t = (y + 0.5 - neckY) / span;
    if (t < 0) return neckHalf;
    const belly = 0.56;
    const peak = rx + 9;
    if (t < belly) return neckHalf + (peak - neckHalf) * Math.pow(Math.sin((Math.PI * t) / (2 * belly)), 0.8);
    const k = (t - belly) / (1 - belly);
    return k >= 1 ? 0 : peak * Math.pow(1 - k * k, 0.5);
  };
  const sag = (y: number) => Math.round(Math.max(0, (y - neckY - span * 0.5) / span) * 4);
  const inBody = (x: number, y: number) => y > neckY - 2 && Math.abs(x + 0.5 - cx - sag(y)) <= halfW(y) && !inFrillOuter(x, y) && !inMouth(x, y);
  const LEATHER = ['#3a2412', '#4a2e17', '#5a381d', '#6c4424', '#7e512b', '#926034', '#a8723e'];

  // ——— Задняя стенка: нутро и дальняя половина оборки.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dy = y + 0.5 - my;
      if (inMouth(x, y)) {
        const t = (dy + ry) / (2 * ry);
        put(bctx, x, y, t < 0.35 ? '#1c1109' : t < 0.7 ? '#28180d' : '#342012');
      } else if (dy < 0.5 && inFrill(x, y)) {
        const top = !inFrillOuter(x, y - 1);
        const fold = Math.round(Math.atan2(dy, x + 0.5 - cx) * 6) % 2 === 0;
        put(bctx, x, y, top ? (x < cx ? '#b8844e' : '#9a6c3c') : fold ? '#6a4424' : '#825530');
      }
    }
  }
  // Тёмный контур дальней оборки.
  for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) if (y + 0.5 - my < 0 && !inFrillOuter(x, y) && inFrillOuter(x, y + 1)) put(bctx, x, y, '#24140a');

  // ——— Передняя стенка: пузо со светом слева-сверху.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inBody(x, y)) continue;
      const hw = halfW(y);
      const u = (x + 0.5 - cx - sag(y)) / Math.max(1, hw);
      const t = (y + 0.5 - neckY) / span;
      let l = 0.64 - 0.42 * u - 0.45 * t - 0.25 * u * u;
      if (y <= cordY(x) + 2) l -= 0.25; // тень под шнурком
      const out = (xx: number, yy: number) => !inBody(xx, yy) && !inFrillOuter(xx, yy);
      if (out(x - 1, y) || out(x + 1, y) || out(x, y + 1) || (out(x, y - 1) && y > neckY)) {
        put(fctx, x, y, '#22130a');
        continue;
      }
      const i = Math.max(0, Math.min(LEATHER.length - 1, Math.round(l * (LEATHER.length - 1))));
      put(fctx, x, y, LEATHER[i]);
    }
  }
  // Складки от стянутого горла: изогнутые борозды со светлой кромкой.
  for (const [fx, bend, len] of [[-15, -6, 17], [-7, -3, 22], [2, 1, 24], [10, 5, 20], [17, 8, 13]] as Array<[number, number, number]>) {
    for (let k = 0; k < len; k++) {
      const t = k / len;
      const y = neckY + 2 + k;
      const x = Math.round(cx + fx + bend * t * t);
      if (!inBody(x, y) || !inBody(x, y + 1)) break;
      put(fctx, x, y, t > 0.75 ? '#5a381d' : '#44291a');
      if (inBody(x - 1, y) && t < 0.75) put(fctx, x - 1, y, '#9a6a3a');
    }
  }
  // Ближняя половина оборки: светлая кромка у нутра, складки-сборки.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (y + 0.5 - my < 0.5 || !inFrill(x, y)) continue;
      const inner = inMouth(x, y - 1);
      const fold = Math.round(Math.atan2(y + 0.5 - my, x + 0.5 - cx) * 7) % 2 === 0;
      const left = x < cx;
      put(fctx, x, y, inner ? (left ? '#d49c60' : '#b07c48') : fold ? (left ? '#8a5c34' : '#704826') : left ? '#a06c3c' : '#86582e');
    }
  }
  // Контур оборки снизу и по бокам.
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W; x++) {
      if (y + 0.5 - my < 0.5 || inFrillOuter(x, y) || inBody(x, y)) continue;
      if (inFrillOuter(x, y - 1) || inFrillOuter(x - 1, y) || inFrillOuter(x + 1, y)) put(fctx, x, y, '#24140a');
    }
  }
  // Шнурок: витой, светлые и тёмные звенья, чуть провисает.
  for (let x = Math.round(cx - rx - 2); x <= Math.round(cx + rx + 2); x++) {
    const y = cordY(x);
    put(fctx, x, y, (x + 40) % 3 === 0 ? '#8a6a3a' : '#e0c080');
    if ((x + 40) % 3 === 1) put(fctx, x, y + 1, '#6a5028');
  }
  // Узел и две кисточки справа.
  const kx = Math.round(cx + 12);
  const ky = cordY(kx);
  for (const [dx, dy, c] of [[-1, 0, '#c8a868'], [0, 0, '#f0d898'], [1, 0, '#c8a868'], [0, 1, '#a88848'], [-1, 1, '#e0c080'], [1, 1, '#e0c080']] as Array<[number, number, string]>) put(fctx, kx + dx, ky + dy, c);
  for (const [dir, len] of [[-1, 8], [1, 6]] as Array<[number, number]>) {
    for (let k = 2; k <= len; k++) put(fctx, kx + (k > 3 ? dir : 0), ky + k, '#d0b070');
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

/** Монеты в кошельке лежат плашмя: сверху видно круглое лицо и тонкий край. */
let flatCoins: Sprite[] | null = null;
export function pileCoinSprites(): Sprite[] {
  if (flatCoins) return flatCoins;
  const P = { Y: '#f2c84a', y: '#c8962a', W: '#fff4c0', d: '#7a4e14', o: '#a87424' };
  flatCoins = [
    fromRows(['.yYy.', 'yWYYy', 'oyyyo', '.ddd.'], P, 2, 4),
    fromRows(['.yYy.', 'yYWYy', 'oyyyo', '.ddd.'], P, 2, 4),
    fromRows(['.YYy.', 'yWYyy', 'oyYyo', '.ddd.'], P, 2, 4),
  ];
  return flatCoins;
}
