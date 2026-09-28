// Постройки: стены и башни по уровням, городской центр от костра до замка,
// лавки инструментов, ферма, лагерь бродяг, сундук, порталы Жадности,
// лодка, статуи, хижина отшельника. Всё рисуется кодом по пикселям.

import { masonry as masonry2 } from './town';
import { makeCanvas, type Sprite } from '../engine/sprite';
import { Rng } from '../engine/rng';
import { ellipse, line, poly, px, rect, shade } from './px';
import { hash2 } from '../engine/math';
import { rackItemSprite, type RackItem } from './items';

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

/** Каменная кладка в прямоугольнике (палитра из базового цвета, мох у высоких стен). */
function masonry(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, base = STONE): void {
  const pal = [shade(base, 0.55), shade(base, 0.76), base, shade(base, 1.12), shade(base, 1.3)];
  masonry2(ctx, x, y, w, h, seed, pal, h >= 14);
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
        // Заострённые колья, связанные верёвкой; крайние наклонены наружу.
        const hs = [11, 14, 12, 13];
        hs.forEach((hh, i) => {
          const tall = hh - (d === 2 && i === 1 ? 6 : 0) - (d >= 1 && i === 3 ? 2 : 0);
          const x = 1 + i * 2;
          const lean = i === 0 ? -1 : i === 3 ? 1 : 0;
          for (let y = 0; y < tall; y++) {
            const xx = x + (y > tall * 0.6 ? lean : 0);
            const top = y >= tall - 2;
            px(ctx, xx, h - 1 - y, top ? '#c8a878' : y % 5 === 2 ? WOOD_D : WOOD_L);
            if (!top) px(ctx, xx + 1, h - 1 - y, y % 4 === 1 ? '#3a2616' : WOOD);
          }
        });
        for (const y of [h - 4, h - 8]) {
          rect(ctx, 0, y, w, 1, ROPE);
          for (let x = 1; x < w; x += 2) px(ctx, x, y, '#a08858');
        }
        break;
      }
      case 2: {
        // Частокол: плотные брёвна с заострёнными концами, поперечины и железные скобы.
        for (let i = 0; i < 5; i++) {
          const x = 1 + i * 2;
          const tall = 19 + r.int(0, 3) - (d === 2 && i === 2 ? 8 : 0) - (d >= 1 && i === 4 ? 3 : 0);
          rect(ctx, x, h - tall + 2, 1, tall - 2, WOOD_L);
          rect(ctx, x + 1, h - tall + 2, 1, tall - 2, WOOD);
          px(ctx, x, h - tall + 1, '#c8a878');
          px(ctx, x + 1, h - tall + 1, WOOD_L);
          px(ctx, x, h - tall, '#d8b888');
          for (let y = h - tall + 4; y < h; y += 5) px(ctx, x + 1, y, WOOD_D);
        }
        for (const y of [h - 15, h - 6]) {
          rect(ctx, 0, y, w, 2, WOOD_D);
          rect(ctx, 0, y, w, 1, '#6a4a30');
        }
        for (const [x, y] of [[2, h - 15], [9, h - 6], [6, h - 15]] as Array<[number, number]>) {
          px(ctx, x, y, '#8a929c');
          px(ctx, x, y + 1, IRON);
        }
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
        // Железная стена: тёмная кладка в железных листах с заклёпками и шипами поверху.
        masonry(ctx, 0, 6, w, h - 6, 8, '#6a6a76');
        for (let i = 0; i < 4; i++) masonry(ctx, i * 5, 1, 3, 6, 13, '#6a6a76');
        for (let i = 0; i < 4; i++) {
          px(ctx, i * 5 + 1, 0, '#9aa2ac');
          px(ctx, i * 5 + 1, -1, '#c0c8d0');
        }
        for (const yy of [10, 20, 30]) {
          rect(ctx, 0, yy, w, 3, '#3a3d45');
          rect(ctx, 0, yy, w, 1, '#6a707a');
          rect(ctx, 0, yy + 2, w, 1, '#24262c');
          for (let xx = 1; xx < w; xx += 4) px(ctx, xx, yy + 1, '#aab2bc');
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
/** Высота площадки лучников по уровням (0–6). */
export const TOWER_PLATFORM = [0, 19, 28, 36, 44, 50, 50];

export function towerSprite(level: number): Sprite {
  const lv = Math.max(0, Math.min(6, level));
  const key = `tower2:${lv}`;
  const widths = [14, 16, 18, 18, 22, 24, 24];
  const extra = [5, 6, 20, 8, 10, 34, 36];
  const w = widths[lv];
  const plat = TOWER_PLATFORM[lv];
  const h = plat + extra[lv];
  return build(key, w, h, (ctx) => {
    const top = h - plat;
    const cx = w / 2;
    const flagPole = (x: number, y: number, len: number) => {
      line(ctx, x, y, x, y + len, WOOD_D);
      rect(ctx, x + 1, y, 4, 3, '#a82a2a');
      px(ctx, x + 5, y + 1, '#a82a2a');
      px(ctx, x + 2, y + 1, '#f2c84a');
    };
    switch (lv) {
      case 0:
        // Груда камней — место под башню.
        ellipse(ctx, cx, h, 6, 3, '#5a4632');
        for (const [x, y, c] of [[4, h - 2, '#8a8a92'], [7, h - 3, '#9a9aa2'], [9, h - 2, '#6a6a72']] as Array<[number, number, string]>) rect(ctx, x, y, 2, 2, c);
        break;
      case 1: {
        // Помост на сваях с укосинами и перилами.
        for (const x of [2, w - 4]) {
          rect(ctx, x, top, 2, h - top, WOOD);
          rect(ctx, x, top, 1, h - top, WOOD_L);
        }
        line(ctx, 3, top + 3, w - 4, h - 3, WOOD_D);
        line(ctx, w - 4, top + 3, 3, h - 3, WOOD_D);
        rect(ctx, 0, top, w, 2, WOOD_L);
        rect(ctx, 0, top + 1, w, 1, WOOD_D);
        for (const x of [0, w - 1]) rect(ctx, x, top - 5, 1, 5, WOOD);
        rect(ctx, 0, top - 5, w, 1, WOOD_D);
        rect(ctx, 0, top - 3, w, 1, WOOD);
        break;
      }
      case 2: {
        // Дозорная вышка: высокие опоры, дощатый борт и шатровая крыша на столбах.
        for (const x of [2, w - 4]) {
          rect(ctx, x, top, 2, h - top, WOOD);
          rect(ctx, x, top, 1, h - top, WOOD_L);
        }
        for (let y = top + 4; y < h - 2; y += 8) {
          line(ctx, 3, y, w - 4, y + 7, WOOD_D);
          line(ctx, w - 4, y, 3, y + 7, WOOD_D);
        }
        rect(ctx, 0, top - 6, w, 8, WOOD);
        for (let x = 0; x < w; x += 3) rect(ctx, x, top - 6, 1, 8, WOOD_L);
        rect(ctx, 0, top + 1, w, 1, WOOD_D);
        rect(ctx, 1, top - 14, 1, 8, WOOD_D);
        rect(ctx, w - 2, top - 14, 1, 8, WOOD_D);
        poly(ctx, [[-1, top - 13], [w + 1, top - 13], [cx, top - 20]], '#7a3424');
        line(ctx, -1, top - 13, cx, top - 20, '#a8543a');
        for (let y = top - 18; y < top - 13; y += 2) line(ctx, cx - (y - top + 20) * 1.2, y, cx + (y - top + 20) * 1.2, y, '#6a2c1e');
        break;
      }
      case 3: {
        // Каменная башня с зубцами и бойницей.
        masonry(ctx, 2, top + 2, w - 4, h - top - 2, 21);
        masonry(ctx, 0, top - 2, w, 5, 23);
        for (let x = 0; x < w; x += 5) masonry(ctx, x, top - 7, 3, 5, 25);
        rect(ctx, cx - 1, top + 10, 1, 4, '#1a1418');
        break;
      }
      case 4: {
        // Замковая башня: навесные бойницы (машикули), зубцы, знамя.
        masonry(ctx, 3, top + 4, w - 6, h - top - 4, 31);
        masonry(ctx, 0, top - 2, w, 6, 33);
        for (let x = 1; x < w - 1; x += 3) px(ctx, x, top + 4, '#2a2a30');
        for (let x = 0; x < w; x += 5) masonry(ctx, x, top - 8, 3, 6, 35);
        rect(ctx, cx - 1, top + 12, 1, 4, '#1a1418');
        rect(ctx, cx - 1, top + 26, 1, 4, '#1a1418');
        rect(ctx, 5, top + 8, 3, 9, '#a82a2a');
        px(ctx, 6, top + 11, '#f2c84a');
        break;
      }
      default: {
        // Укреплённая (5) и железная (6) башни: крыша над площадкой защищает от летунов.
        const iron = lv === 6;
        const base = iron ? '#5e5e6a' : '#8a8a90';
        masonry(ctx, 3, top + 4, w - 6, h - top - 4, iron ? 43 : 41, base);
        masonry(ctx, 0, top - 2, w, 6, 45, base);
        for (const y of iron ? [top + 12, top + 28, top + 42] : [top + 20]) {
          rect(ctx, 3, y, w - 6, 2, '#3a3d45');
          rect(ctx, 3, y, w - 6, 1, '#6a707a');
          for (let x = 4; x < w - 3; x += 4) px(ctx, x, y + 1, '#aab2bc');
        }
        // Столбы и крыша.
        rect(ctx, 1, top - 14, 2, 12, WOOD_D);
        rect(ctx, w - 3, top - 14, 2, 12, WOOD_D);
        const roofTop = top - 26;
        for (let y = roofTop; y < top - 12; y++) {
          const t = (y - roofTop) / (top - 12 - roofTop);
          const half = (w / 2 + 2) * t;
          for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
            const left = x < cx;
            const row = (y - roofTop) % 3 === 0;
            const colr = iron ? (left ? (row ? '#3e4450' : '#56606e') : row ? '#2a2e36' : '#3e4450') : left ? (row ? '#34405e' : '#4a5a86') : row ? '#262e46' : '#34405e';
            px(ctx, x, y, colr);
          }
        }
        if (iron) for (let x = 1; x < w; x += 4) px(ctx, x, top - 12, '#c0c8d0');
        flagPole(Math.round(cx), roofTop - 7, 7);
        rect(ctx, cx - 1, top + 14, 1, 4, '#1a1418');
        break;
      }
    }
  });
}

// ——— Лавки инструментов ———
export type ShopKind = 'bow' | 'hammer' | 'scythe' | 'shield' | 'bomb' | 'pike' | 'sword' | 'bread';
const AWNING: Record<ShopKind, string> = { bow: '#4a7a3a', hammer: '#9a5a2a', scythe: '#c8a040', shield: '#a82a2a', bomb: '#5a5a6a', pike: '#6a4a8a', sword: '#4a4e56', bread: '#c87a3a' };

const SHOP_SIGN: Partial<Record<ShopKind, RackItem>> = {
  bow: 'bow',
  hammer: 'hammer',
  scythe: 'scythe',
  shield: 'shield',
  pike: 'pike',
  sword: 'sword',
  bread: 'bread',
  bomb: 'bomb',
};

export function shopSprite(kind: ShopKind): Sprite {
  return build(`shop2:${kind}`, 24, 35, (ctx, w, hAll) => {
    // Вывеска над навесом: дощечка со знаком товара — видно, что продают,
    // даже когда стойка пуста.
    // Тёмная дощечка с процарапанным светлым знаком: в воде её отражение
    // не бросается ярким пятном.
    const sign = SHOP_SIGN[kind];
    rect(ctx, w / 2 - 5, 1, 10, 10, '#2e1e12');
    rect(ctx, w / 2 - 4, 2, 8, 8, '#6a4a2e');
    rect(ctx, w / 2 - 4, 2, 8, 1, '#86603c');
    rect(ctx, w / 2 - 1, 11, 2, 2, WOOD_D);
    if (sign) {
      const icon = rackItemSprite(sign);
      const [ic, ictx] = makeCanvas(icon.w, icon.h);
      ictx.drawImage(icon.img, 0, 0);
      ictx.globalCompositeOperation = 'source-in';
      ictx.fillStyle = '#e8d4a8';
      ictx.fillRect(0, 0, icon.w, icon.h);
      ctx.drawImage(ic, 0, 0, icon.w, icon.h, w / 2 - 3, 2, 7, 8);
    }
    ctx.translate(0, 13);
    const h = hAll - 13;
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
      // Заброшенная пашня: старые борозды, сорная трава, пара кочек.
      rect(ctx, 2, h - 3, w - 4, 3, '#4a3222');
      for (let x = 2; x < w - 2; x++) {
        px(ctx, x, h - 3, x % 3 === 0 ? '#34221a' : winter ? '#dfe7f0' : '#6a4a30');
        if (!winter && hash2(x, 3) > 0.72) {
          const gh = 1 + Math.floor(hash2(x, 4) * 3);
          line(ctx, x, h - 4, x, h - 3 - gh, hash2(x, 5) > 0.5 ? '#6a8a3a' : '#8a9a4a');
        }
      }
      return;
    }
    // Вспаханные борозды: гребни светлее, между ними тень.
    rect(ctx, 0, h - 3, w, 3, '#3e2818');
    for (let x = 0; x < w; x++) {
      px(ctx, x, h - 3, x % 3 === 0 ? '#2a1a10' : '#6a4630');
      if (x % 3 === 1) px(ctx, x, h - 2, '#5a3a24');
    }
    if (winter) {
      for (let x = 0; x < w; x++) {
        px(ctx, x, h - 3, x % 3 === 0 ? '#c8d2e0' : '#eef3f8');
        if (hash2(x, 5) > 0.5) px(ctx, x, h - 4, '#f4f8fc');
      }
      return;
    }
    // Всходы → зелёная пшеница → золотые колосья.
    const stalk = ['#6a9a3a', '#5a8a2a', '#6a9432', '#c8a038'][stage];
    const tip = ['#8aba4a', '#7aaa3a', '#8ab44a', '#f0d868'][stage];
    const heights = [1, 4, 7, 9];
    for (let x = 1; x < w - 1; x += 3) {
      for (const dx of stage === 0 ? [0] : [0, 1]) {
        const hh = heights[stage] - (hash2(x + dx, stage) > 0.6 ? 1 : 0) - dx;
        if (hh <= 0) continue;
        line(ctx, x + dx, h - 3, x + dx, h - 3 - hh, stalk);
        px(ctx, x + dx, h - 3 - hh, tip);
        if (stage === 3) {
          // Колос: пара зёрен по бокам.
          px(ctx, x + dx - 1, h - 2 - hh, '#e0bc4a');
          px(ctx, x + dx, h - 2 - hh, '#f0d868');
        }
      }
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
/** Латаный шатёр на растяжках, флажок-тряпка, скатка, мешок, бревно
 *  у кострища и котелок на треноге. Огонь рисуется отдельно (светится). */
export function campSprite(): Sprite {
  return build('camp2', 46, 28, (ctx, w, h) => {
    const G = h - 1;
    // Растяжки к колышкам.
    line(ctx, 13, 4, 0, G, '#a89878');
    line(ctx, 13, 4, 26, G, '#a89878');
    px(ctx, 0, G, WOOD_D);
    px(ctx, 26, G, WOOD_D);
    // Полотно: левый скат на свету, правый — в тени.
    poly(ctx, [[2, G + 1], [13, 3], [13, G + 1]], '#c4b490');
    poly(ctx, [[13, 3], [24, G + 1], [13, G + 1]], '#9a8a6a');
    line(ctx, 13, 3, 2, G, '#e0d2b0');
    line(ctx, 13, 3, 24, G, '#7a6a50');
    // Складки ткани.
    line(ctx, 8, 12, 6, G, '#b0a080');
    line(ctx, 18, 12, 20, G, '#8a7a5c');
    // Заплатки со стежками.
    for (const [x, y, ww, hh, c] of [[5, 16, 4, 4, '#8a6a4a'], [16, 11, 3, 4, '#6a7a6a'], [18, 19, 4, 3, '#9a5a4a']] as Array<[number, number, number, number, string]>) {
      rect(ctx, x, y, ww, hh, c);
      for (let k = 0; k < ww; k += 2) {
        px(ctx, x + k, y - 1, '#ece0c4');
        px(ctx, x + k, y + hh, '#ece0c4');
      }
    }
    // Вход: тёмный треугольник, откинутый полог.
    poly(ctx, [[10, G + 1], [13, G - 10], [16, G + 1]], '#2a2018');
    poly(ctx, [[13, G - 10], [16, G + 1], [18, G + 1]], '#d4c6a2');
    // Конёк: шест торчит над палаткой.
    rect(ctx, 12, 1, 2, 3, WOOD_D);
    px(ctx, 12, 1, WOOD_L);
    // Флажок-тряпка на палке.
    line(ctx, 27, G, 27, G - 19, WOOD_D);
    poly(ctx, [[28, G - 19], [34, G - 17], [28, G - 14]], '#a84a3a');
    px(ctx, 28, G - 19, '#c86a5a');
    // Скатка и мешок у входа.
    rect(ctx, 1, G - 2, 6, 3, '#6a4a6a');
    px(ctx, 1, G - 2, '#8a6a8a');
    rect(ctx, 3, G - 2, 1, 3, '#4a3448');
    rect(ctx, 20, G - 4, 4, 5, '#a08858');
    rect(ctx, 21, G - 5, 2, 1, '#c8b080');
    px(ctx, 20, G - 4, '#b89a68');
    // Кострище: камни по кругу.
    for (const x of [27, 29, 31, 33, 35, 37]) {
      rect(ctx, x, G - 1, 2, 2, x % 4 === 1 ? '#6a6a70' : '#7c7c84');
      px(ctx, x, G - 1, '#9a9aa2');
    }
    // Тренога и котелок.
    line(ctx, 28, G - 1, 32, G - 14, WOOD_D);
    line(ctx, 36, G - 1, 32, G - 14, WOOD);
    line(ctx, 32, G - 13, 32, G - 11, '#5a5a60');
    ellipse(ctx, 32, G - 8, 3, 2.5, '#2a2a30');
    rect(ctx, 29, G - 11, 7, 1, '#3a3a42');
    px(ctx, 30, G - 9, '#5a5a66');
    // Бревно-скамья.
    rect(ctx, 38, G - 3, 8, 3, WOOD);
    rect(ctx, 38, G - 3, 8, 1, WOOD_L);
    ellipse(ctx, 44.5, G - 1.5, 1.5, 1.5, '#b08858');
    px(ctx, 44, G - 2, '#8a6440');
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

/** Песчаный пляж на краю острова: сухой песок, мокрая полоса, ракушки, топляк, дюнная трава. */
export function beachSprite(side: -1 | 1): Sprite {
  return build(`beach2:${side}`, 110, 18, (ctx, w, h) => {
    for (let x = 0; x < w; x++) {
      // t: 0 — у суши, 1 — у воды.
      const t = side > 0 ? x / w : 1 - x / w;
      const top = Math.round(6 + Math.pow(t, 1.4) * 10);
      for (let y = top; y < h; y++) {
        const wet = t > 0.72;
        const n = hash2(x, y);
        let c = wet ? (n > 0.8 ? '#a89070' : '#9c8466') : n > 0.85 ? '#e2cca0' : n > 0.15 ? '#d6be92' : '#c8ae84';
        if (y === top) c = wet ? '#b8a078' : '#ecdab0';
        if (y > top + 3 && !wet) c = n > 0.5 ? '#c4a87c' : '#b89c72';
        px(ctx, x, y, c);
      }
      // Дюнная трава у суши.
      if (t < 0.3 && hash2(x, 7) > 0.55) {
        const gh = 2 + Math.floor(hash2(x, 8) * 4);
        for (let k = 1; k <= gh; k++) px(ctx, x + (k > gh - 2 && hash2(x, 9) > 0.5 ? side : 0), top - k, k === gh ? '#a8b060' : '#6e8a40');
      }
      // Ракушки и камушки.
      if (hash2(x, 11) > 0.96 && t > 0.25 && t < 0.85) {
        px(ctx, x, top, '#f4ece0');
        px(ctx, x + 1, top, '#d8a0a0');
      }
    }
    // Топляк — выбеленное бревно.
    const lx = side > 0 ? 38 : w - 58;
    rect(ctx, lx, 9, 20, 2, '#b8b0a0');
    rect(ctx, lx, 9, 20, 1, '#d8d2c4');
    rect(ctx, lx + 20, 8, 2, 3, '#8a8274');
    px(ctx, lx + 6, 8, '#9a9284');
  });
}

export function boatSprite(stage: number): Sprite {
  return build(`boat:${stage}`, 80, 70, (ctx, w, h) => {
    const hullTop = h - 16;
    if (stage === 0) {
      // Разбитый остов, завалившийся на борт: изогнутый киль с задранным носом,
      // остатки обшивки, несколько гнутых шпангоутов и упавшая мачта с парусом.
      const keel = (x: number) => h - 2 - Math.round(Math.pow(Math.max(0, (x - 44) / 26), 2) * 14);
      // Обшивка днища: доски вдоль киля, светлее к верхней кромке.
      for (let x = 8; x < 70; x++) {
        const k = keel(x);
        const hh = Math.round(7 + Math.sin(((x - 8) / 62) * Math.PI) * 4);
        for (let y = k - hh; y <= k; y++) {
          const plank = (y - (k - hh)) % 3 === 0;
          px(ctx, x, y, plank ? '#3a2818' : y < k - hh + 2 ? '#6a4c32' : '#523a26');
        }
        // Проломы в обшивке.
        if (x > 22 && x < 30) for (let y = k - hh + 1; y < k - 3; y++) px(ctx, x, y, '#1e140c');
      }
      // Киль — тёмная толстая линия.
      for (let x = 6; x < 72; x++) {
        px(ctx, x, keel(x), '#2a1c10');
        px(ctx, x, keel(x) - 1, '#3a2818');
      }
      // Гнутые шпангоуты: дуги от киля вверх и назад.
      for (const [x0, len] of [[16, 15], [34, 19], [50, 17], [62, 12]] as Array<[number, number]>) {
        const k = keel(x0) - 6;
        for (let t = 0; t <= len; t++) {
          const a = (t / len) * (Math.PI / 2.2);
          const x = Math.round(x0 - Math.sin(a) * len * 0.35);
          const y = Math.round(k - Math.sin(a + 0.2) * len);
          px(ctx, x, y, WOOD_L);
          px(ctx, x + 1, y, WOOD_D);
        }
      }
      // Упавшая мачта и клок паруса.
      line(ctx, 30, h - 4, 58, h - 30, WOOD_D);
      line(ctx, 31, h - 4, 59, h - 30, WOOD);
      poly(ctx, [[58, h - 30], [66, h - 23], [52, h - 19]], '#b8b0a0');
      poly(ctx, [[58, h - 30], [60, h - 26], [55, h - 22]], '#8a8478');
      // Водоросли и песок у борта.
      for (let x = 8; x < 70; x += 3) px(ctx, x, h - 1, x % 2 ? '#4a5a3a' : '#c8b490');
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
/** Бревенчатый сруб с торцами брёвен, соломенная крыша с мхом, каменная
 *  труба, светящееся окошко, дверь с петлями, поленница и грибы. */
export const HUT_CHIMNEY: [number, number] = [31, 38];
export function hutSprite(): Sprite {
  return build('hut2', 42, 40, (ctx, w, h) => {
    const G = h - 1;
    // Каменный цоколь.
    for (let x = 4; x < 38; x += 3) {
      rect(ctx, x, G - 1, 3, 2, x % 2 ? '#6e6e76' : '#7e7e86');
      px(ctx, x, G - 1, '#9a9aa2');
    }
    // Стены из брёвен: светлая кромка сверху, тень снизу.
    for (let k = 0; k < 6; k++) {
      const y = G - 4 - k * 3;
      rect(ctx, 5, y, 32, 3, '#7a5436');
      rect(ctx, 5, y, 32, 1, '#a07a50');
      rect(ctx, 5, y + 2, 32, 1, '#553823');
      // Торцы брёвен на углах — через ряд то слева, то справа.
      const ex = k % 2 ? 3 : 36;
      ellipse(ctx, ex + 1.5, y + 1.5, 1.8, 1.6, '#b08858');
      px(ctx, ex + 1, y + 1, '#8a6440');
    }
    // Дверь со скруглённым верхом, петли, ручка.
    rect(ctx, 16, G - 13, 7, 13, '#4a3020');
    rect(ctx, 17, G - 14, 5, 1, '#4a3020');
    for (const x of [18, 20]) line(ctx, x, G - 13, x, G - 1, '#3a2418');
    rect(ctx, 16, G - 10, 2, 1, '#8a8a90');
    rect(ctx, 16, G - 4, 2, 1, '#8a8a90');
    px(ctx, 21, G - 6, '#d8b060');
    // Окошко с тёплым светом и ставнями.
    rect(ctx, 27, G - 13, 6, 5, '#f0c060');
    rect(ctx, 27, G - 13, 6, 1, '#fff0a8');
    line(ctx, 30, G - 13, 30, G - 9, '#553823');
    line(ctx, 27, G - 11, 32, G - 11, '#553823');
    rect(ctx, 25, G - 13, 2, 5, '#6a4a2e');
    rect(ctx, 33, G - 13, 2, 5, '#6a4a2e');
    rect(ctx, 26, G - 8, 8, 1, '#553823');
    // Соломенная крыша: треугольный фронтон с широкими свесами.
    const top = G - 36;
    poly(ctx, [[-1, G - 18], [21, top], [43, G - 18]], '#a88a4c');
    for (let y = top + 2; y < G - 18; y += 2) {
      const t = (y - top) / (G - 18 - top);
      const half = Math.round(t * 22);
      for (let x = 21 - half; x <= 21 + half; x++) {
        const n = hash2(x, y * 3);
        const c = x < 21 ? (n > 0.6 ? '#c8a860' : '#b09050') : n > 0.6 ? '#98783e' : '#886a34';
        px(ctx, x, y, c);
        if (n > 0.9) px(ctx, x, y + 1, '#6a5028');
      }
    }
    line(ctx, 21, top, -1, G - 18, '#d8bc70');
    line(ctx, 21, top, 43, G - 18, '#6a5028');
    // Свес крыши — тёмная кромка и тень на стене.
    rect(ctx, 0, G - 18, 42, 1, '#6a5028');
    rect(ctx, 5, G - 17, 32, 1, '#3a2616');
    // Мох пятнами на соломе.
    for (let k = 0; k < 36; k++) {
      const x = Math.floor(hash2(k, 5) * 36) + 3;
      const y = G - 19 - Math.floor(hash2(k, 6) * 12);
      const t = (y - top) / (G - 18 - top);
      if (Math.abs(x - 21) > t * 21 - 1) continue;
      px(ctx, x, y, hash2(k, 7) > 0.5 ? '#5a7a3a' : '#44602e');
      if (hash2(k, 8) > 0.6) px(ctx, x + 1, y, '#44602e');
    }
    // Каменная труба справа.
    for (let y = G - 38; y < G - 24; y++) {
      for (let x = 29; x < 34; x++) px(ctx, x, y, (x + (y >> 1) * 2) % 4 === 0 ? '#5e5e66' : x === 29 ? '#9a9aa2' : '#7e7e86');
    }
    rect(ctx, 28, G - 39, 7, 2, '#6e6e76');
    rect(ctx, 28, G - 39, 7, 1, '#9a9aa2');
    // Пучок трав под свесом и поленница слева.
    line(ctx, 11, G - 17, 11, G - 13, '#6a8a44');
    line(ctx, 12, G - 17, 12, G - 12, '#8a9a54');
    px(ctx, 10, G - 13, '#a86a8a');
    for (let k = 0; k < 6; k++) {
      const x = 0 + (k % 3) * 2;
      const y = G - 2 - Math.floor(k / 3) * 2;
      ellipse(ctx, x + 1, y + 0.5, 1.2, 1.2, '#b08858');
      px(ctx, x + 1, y, '#8a6440');
    }
    // Грибы у цоколя.
    for (const [x, c] of [[37, '#c84a3a'], [39, '#d8a060']] as Array<[number, string]>) {
      px(ctx, x, G, '#e8e0cc');
      rect(ctx, x - 1, G - 1, 3, 1, c);
      px(ctx, x, G - 1, '#f4f0e8');
    }
    void w;
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
