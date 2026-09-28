// Мелкая живность для атмосферы: куры, овцы, кошки, вороны, совы, бабочки,
// летучие мыши, утки. Кадры маленькие — несколько пикселей, как в оригинале.

import { makeCanvas, type Sprite } from '../engine/sprite';
import { ellipse, line, poly, px, rect } from './px';

export type CritterKind = 'hen' | 'rooster' | 'sheep' | 'cat' | 'crow' | 'owl' | 'butterfly' | 'bat' | 'duck' | 'duckling';
export type CritterAnim = 'idle' | 'walk' | 'peck' | 'fly' | 'sleep' | 'swim';

const cache = new Map<string, Sprite[]>();

function frame(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): Sprite {
  const [c, ctx] = makeCanvas(w, h);
  paint(ctx);
  return { img: c, w, h, ax: Math.floor(w / 2), ay: h };
}

function hen(ctx: CanvasRenderingContext2D, anim: CritterAnim, f: number, rooster: boolean): void {
  const body = rooster ? '#8a4a22' : f % 2 === 0 && anim === 'idle' ? '#f0ece0' : '#f0ece0';
  const shade = rooster ? '#5a2e16' : '#c8c0b0';
  const peck = anim === 'peck' && f % 2 === 1;
  const step = anim === 'walk' ? f % 2 : 0;
  ellipse(ctx, 4, 5, 3, 2, body);
  px(ctx, 2, 6, shade);
  px(ctx, 3, 6, shade);
  // Хвост.
  px(ctx, 1, 3, rooster ? '#1e2a3a' : shade);
  px(ctx, 1, 4, rooster ? '#2e5a3a' : body);
  if (rooster) px(ctx, 0, 2, '#1e2a3a');
  // Голова.
  const hx = peck ? 7 : 6;
  const hy = peck ? 6 : 3;
  rect(ctx, hx, hy, 2, 2, body);
  px(ctx, hx + 2, hy + 1, '#e8a830');
  px(ctx, hx, hy - 1, '#d02a1a');
  if (rooster) px(ctx, hx + 1, hy - 1, '#d02a1a');
  px(ctx, hx + 1, hy, '#1a1010');
  // Лапки.
  px(ctx, 3 + step, 7, '#e8a830');
  px(ctx, 5 - step, 7, '#e8a830');
}

function sheep(ctx: CanvasRenderingContext2D, anim: CritterAnim, f: number): void {
  const wool = '#eeeae0';
  const dark = '#c8c2b4';
  const step = anim === 'walk' ? f % 2 : 0;
  // Ноги.
  for (const [x, ph] of [[3, 0], [5, 1], [9, 1], [11, 0]] as Array<[number, number]>) rect(ctx, x, 7, 1, 3 - ((step + ph) % 2), '#3a3030');
  // Шерсть клубами.
  ellipse(ctx, 7, 5, 5, 3, wool);
  for (const [x, y] of [[3, 3], [6, 2], [9, 2], [11, 4]] as Array<[number, number]>) ellipse(ctx, x, y, 1.6, 1.4, wool);
  line(ctx, 3, 7, 11, 7, dark);
  // Голова.
  const graze = anim === 'peck';
  const hx = 12;
  const hy = graze ? 7 : 4;
  rect(ctx, hx, hy, 3, 2, '#2e2626');
  px(ctx, hx + 1, hy, '#6a6060');
  px(ctx, hx - 1, hy, '#2e2626');
}

function cat(ctx: CanvasRenderingContext2D, anim: CritterAnim, f: number, color: string): void {
  const dark = color === '#2a2626' ? '#161414' : color === '#d07a2a' ? '#a05a1a' : '#5a5a62';
  if (anim === 'sleep') {
    ellipse(ctx, 5, 6, 4, 1.8, color);
    px(ctx, 8, 5, color);
    px(ctx, 9, 4, color);
    line(ctx, 1, 7, 5, 7, dark);
    return;
  }
  if (anim === 'idle') {
    // Сидит: хвост обвит вокруг лап.
    rect(ctx, 3, 3, 4, 5, color);
    rect(ctx, 3, 7, 5, 1, dark);
    rect(ctx, 4, 1, 3, 2, color);
    px(ctx, 4, 0, color);
    px(ctx, 6, 0, color);
    px(ctx, 5, 1, f % 3 === 0 ? color : '#c8d860');
    line(ctx, 2, 7, 1, 5, color);
    return;
  }
  const step = f % 2;
  ellipse(ctx, 5, 5, 3.5, 1.6, color);
  rect(ctx, 8, 2, 2, 2, color);
  px(ctx, 8, 1, color);
  px(ctx, 9, 1, color);
  px(ctx, 9, 3, '#c8d860');
  line(ctx, 2, 4, 0, 1 + step, color);
  for (const x of [3, 7]) rect(ctx, x + (step && x === 3 ? 1 : 0), 6, 1, 2, dark);
}

function crow(ctx: CanvasRenderingContext2D, anim: CritterAnim, f: number): void {
  const c = '#1e1c22';
  const hi = '#3e3a48';
  if (anim === 'fly') {
    // Силуэт в полёте: тело, голова с клювом, хвост веером, широкое крыло.
    ellipse(ctx, 4, 4, 2.5, 1.2, c);
    rect(ctx, 6, 3, 2, 2, c);
    px(ctx, 8, 4, '#4a4440');
    px(ctx, 0, 3, c);
    px(ctx, 0, 5, c);
    px(ctx, 1, 4, c);
    const up = f % 2 === 0;
    if (up) {
      poly(ctx, [[2, 4], [5, 4], [2, 0]], c);
      px(ctx, 2, 0, hi);
    } else {
      poly(ctx, [[2, 4], [5, 4], [3, 7]], c);
    }
    return;
  }
  const peck = anim === 'peck' && f % 2 === 1;
  ellipse(ctx, 4, 5, 2.5, 1.6, c);
  px(ctx, 2, 4, hi);
  line(ctx, 1, 5, 0, 4, c);
  const hx = peck ? 6 : 6;
  const hy = peck ? 6 : 3;
  rect(ctx, hx, hy, 2, 2, c);
  px(ctx, hx + 2, hy + 1, '#3a3430');
  px(ctx, hx + 1, hy, '#8a8a8a');
  px(ctx, 3, 7, '#3a3430');
  px(ctx, 5, 7, '#3a3430');
}

function owl(ctx: CanvasRenderingContext2D, anim: CritterAnim, f: number): void {
  const c = '#7a5a3a';
  const d = '#4a3422';
  if (anim === 'fly') {
    ellipse(ctx, 5, 4, 2.5, 1.5, c);
    const up = f % 2 === 0;
    line(ctx, 3, 4, 0, up ? 1 : 6, c);
    line(ctx, 7, 4, 10, up ? 1 : 6, c);
    return;
  }
  rect(ctx, 2, 2, 5, 6, c);
  rect(ctx, 2, 6, 5, 2, d);
  px(ctx, 2, 1, c);
  px(ctx, 6, 1, c);
  // Глаза (светятся ночью — см. drawEmissive).
  const blink = f % 5 === 4;
  px(ctx, 3, 3, blink ? d : '#f2d44a');
  px(ctx, 5, 3, blink ? d : '#f2d44a');
  px(ctx, 4, 4, '#c8a040');
  for (const x of [3, 5]) px(ctx, x, 6, '#a88a62');
}

/** Бабочка сбоку: большое переднее крыло, маленькое заднее, тёмный кончик. */
function butterfly(ctx: CanvasRenderingContext2D, f: number, color: string, tip: string): void {
  const open = f % 2 === 0;
  // Тельце и усик.
  px(ctx, 2, 3, '#2a2020');
  px(ctx, 3, 3, '#2a2020');
  px(ctx, 4, 2, '#2a2020');
  if (open) {
    // Крылья раскрыты: переднее вверх-назад, заднее ниже.
    rect(ctx, 0, 0, 3, 2, color);
    px(ctx, 1, 2, color);
    px(ctx, 0, 0, tip);
    px(ctx, 0, 3, color);
    px(ctx, 1, 3, color);
  } else {
    // Сложены над спиной — узкий треугольник.
    px(ctx, 2, 0, color);
    rect(ctx, 1, 1, 2, 2, color);
    px(ctx, 1, 0, tip);
  }
}

function bat(ctx: CanvasRenderingContext2D, f: number): void {
  const c = '#1a1420';
  px(ctx, 3, 2, c);
  px(ctx, 3, 3, c);
  const up = f % 2 === 0;
  line(ctx, 2, 2, 0, up ? 0 : 3, c);
  line(ctx, 4, 2, 6, up ? 0 : 3, c);
  if (!up) {
    px(ctx, 1, 3, c);
    px(ctx, 5, 3, c);
  }
}

function duck(ctx: CanvasRenderingContext2D, f: number, small: boolean): void {
  if (small) {
    ellipse(ctx, 2, 3, 2, 1, '#d8c060');
    rect(ctx, 3, 1, 2, 2, '#d8c060');
    px(ctx, 5, 2, '#e89a30');
    px(ctx, 4, 1, '#2a2010');
    return;
  }
  const bob = f % 2;
  ellipse(ctx, 4, 4 + bob * 0.3, 4, 1.6, '#8a6a4a');
  line(ctx, 1, 3, 6, 3, '#a88a62');
  // Зелёная голова селезня.
  rect(ctx, 6, 0, 2, 3, '#2e6a3a');
  px(ctx, 6, 3, '#f0ece0');
  px(ctx, 8, 1, '#e8b030');
  px(ctx, 7, 1, '#1a1010');
  px(ctx, 0, 3, '#5a4432');
}

const SIZE: Record<CritterKind, [number, number]> = {
  hen: [10, 8],
  rooster: [10, 8],
  sheep: [16, 10],
  cat: [11, 8],
  crow: [9, 8],
  owl: [11, 9],
  butterfly: [5, 4],
  bat: [7, 4],
  duck: [9, 6],
  duckling: [6, 4],
};

export function critterFrames(kind: CritterKind, anim: CritterAnim, variant = 0): Sprite[] {
  const key = `${kind}:${anim}:${variant}`;
  let frames = cache.get(key);
  if (frames) return frames;
  const [w, h] = SIZE[kind];
  const n = kind === 'owl' && anim === 'idle' ? 5 : anim === 'sleep' ? 1 : 2;
  frames = [];
  for (let f = 0; f < n; f++) {
    frames.push(
      frame(w, h, (ctx) => {
        switch (kind) {
          case 'hen':
          case 'rooster':
            hen(ctx, anim, f, kind === 'rooster');
            break;
          case 'sheep':
            sheep(ctx, anim, f);
            break;
          case 'cat':
            cat(ctx, anim, f, ['#6a6a72', '#d07a2a', '#2a2626'][variant % 3]);
            break;
          case 'crow':
            crow(ctx, anim, f);
            break;
          case 'owl':
            owl(ctx, anim, f);
            break;
          case 'butterfly':
            butterfly(ctx, f, ['#e8e0c4', '#f2d44a', '#e88a3a', '#8ab8f0', '#e8a0c0'][variant % 5], ['#3a3430', '#8a6a1a', '#5a2a14', '#3a5a8a', '#8a4a6a'][variant % 5]);
            break;
          case 'bat':
            bat(ctx, f);
            break;
          case 'duck':
          case 'duckling':
            duck(ctx, f, kind === 'duckling');
            break;
        }
      }),
    );
  }
  cache.set(key, frames);
  return frames;
}
