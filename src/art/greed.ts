// Жадность (Greed): тёмные существа в белых масках.
// Мелкие «жаднята», летуны, громилы-плодители и похитители короны.

import { makeCanvas, type Sprite } from '../engine/sprite';
import { ellipse, limb, line, poly, px, rect } from './px';

export type GreedKind = 'greedling' | 'floater' | 'breeder' | 'stealer';
export type GreedAnim = 'run' | 'attack' | 'carry' | 'idle' | 'fly';

const BODY = '#1b1123';
const RIM = '#3c2852';
const MASK = '#f0ebe0';
const MASK_SHADE = '#bdb3a4';
const HOLE = '#12081a';
const GLOW = '#ff5a4a';

function mask(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, variant: number, broken: boolean): void {
  if (broken) {
    // Без маски — тёмное «лицо» со светящимися глазами.
    px(ctx, cx - 1, cy, GLOW);
    px(ctx, cx + 1, cy, GLOW);
    return;
  }
  ellipse(ctx, cx, cy, rx, ry, MASK);
  // Тень по нижнему краю маски.
  for (let x = Math.round(cx - rx + 1); x < Math.round(cx + rx); x++) px(ctx, x, Math.round(cy + ry - 1), MASK_SHADE);
  // Глазницы и выражение — у каждой маски своё.
  const ey = Math.round(cy - ry * 0.15);
  px(ctx, Math.round(cx - rx * 0.45), ey, HOLE);
  px(ctx, Math.round(cx + rx * 0.4), ey, HOLE);
  if (rx >= 3) {
    px(ctx, Math.round(cx - rx * 0.45), ey + 1, HOLE);
    px(ctx, Math.round(cx + rx * 0.4), ey + 1, HOLE);
  }
  const my = Math.round(cy + ry * 0.45);
  if (variant % 3 === 0) line(ctx, cx - 1, my, cx + 1, my, HOLE);
  else if (variant % 3 === 1) {
    px(ctx, cx - 1, my, HOLE);
    px(ctx, cx + 1, my, HOLE);
    px(ctx, cx, my - 1, HOLE);
  } else px(ctx, cx, my, HOLE);
}

function drawGreedling(ctx: CanvasRenderingContext2D, anim: GreedAnim, t: number, variant: number, broken: boolean, W: number, H: number): void {
  const ox = Math.floor(W / 2);
  const base = H - 1;
  const s = Math.sin(t * Math.PI * 2);
  const bounce = anim === 'run' ? Math.abs(s) * 1.6 : anim === 'idle' ? (s > 0 ? 0.6 : 0) : 0;
  const lunge = anim === 'attack' ? [0, 1.5, 2.5, 0.5][Math.floor(t * 4)] : 0;
  const by = base - 3.2 - bounce;
  const bx = ox + lunge * 0.6;
  // Ножки.
  const l1 = anim === 'run' ? s * 1.6 : 0.6;
  const l2 = anim === 'run' ? -s * 1.6 : -0.6;
  line(ctx, bx - 1, by + 1, bx - 1 + l1, base, BODY);
  line(ctx, bx + 1, by + 1, bx + 1 + l2, base, BODY);
  // Тело — сгорбленный комок с «рожками».
  ellipse(ctx, bx, by - 1.5, 3.6, 3.4, BODY);
  ellipse(ctx, bx - 0.8, by - 3.4, 3, 2.6, BODY);
  px(ctx, bx - 3, by - 6.2, BODY);
  px(ctx, bx - 2, by - 5.8, BODY);
  px(ctx, bx + 1, by - 6.4, BODY);
  // Кромка света.
  line(ctx, bx - 3, by - 4.8, bx - 0.5, by - 5.6, RIM);
  // Руки.
  if (anim === 'carry') {
    line(ctx, bx - 1, by - 3, bx - 2, by - 8, BODY);
    line(ctx, bx + 1, by - 3, bx + 2, by - 8, BODY);
  } else if (anim === 'attack') {
    const reach = [1, 3, 5, 2][Math.floor(t * 4)];
    line(ctx, bx + 1, by - 2, bx + 2 + reach, by - 2 - (reach > 3 ? 1 : 2), BODY);
    line(ctx, bx - 1, by - 2, bx - 3, by, BODY);
  } else {
    line(ctx, bx + 1, by - 1, bx + 3 + s * 0.8, by + 0.5, BODY);
    line(ctx, bx - 1, by - 1, bx - 3 - s * 0.8, by + 0.5, BODY);
  }
  // Маска на передней стороне головы.
  mask(ctx, Math.round(bx + 1.5), Math.round(by - 3), 2.2, 2.6, variant, broken);
}

function drawFloater(ctx: CanvasRenderingContext2D, anim: GreedAnim, t: number, variant: number, broken: boolean, W: number, H: number): void {
  const ox = Math.floor(W / 2);
  const s = Math.sin(t * Math.PI * 2);
  const cy = Math.floor(H / 2) - 1 + s * 1.2;
  // Крылья-перепонки.
  const flap = s * 5;
  poly(ctx, [[ox - 2, cy - 2], [ox - 11, cy - 4 - flap], [ox - 9, cy + 1 - flap * 0.4], [ox - 6, cy + 2]], BODY);
  poly(ctx, [[ox + 2, cy - 2], [ox + 11, cy - 4 - flap], [ox + 9, cy + 1 - flap * 0.4], [ox + 6, cy + 2]], BODY);
  line(ctx, ox - 2, cy - 2, ox - 11, cy - 4 - flap, RIM);
  line(ctx, ox + 2, cy - 2, ox + 11, cy - 4 - flap, RIM);
  // Тело.
  ellipse(ctx, ox, cy, 4.5, 5, BODY);
  line(ctx, ox - 2, cy - 4, ox + 1, cy - 5, RIM);
  // Свисающие «когти».
  line(ctx, ox - 2, cy + 4, ox - 3, cy + 8 + (anim === 'carry' ? 0 : s), BODY);
  line(ctx, ox + 2, cy + 4, ox + 3, cy + 8 - (anim === 'carry' ? 0 : s), BODY);
  mask(ctx, ox + 1, Math.round(cy - 1), 2.8, 3, variant, broken);
}

function drawBreeder(ctx: CanvasRenderingContext2D, anim: GreedAnim, t: number, variant: number, broken: boolean, W: number, H: number): void {
  const ox = Math.floor(W / 2);
  const base = H - 1;
  const s = Math.sin(t * Math.PI * 2);
  const slam = anim === 'attack' ? [0, -2, -3, 3][Math.floor(t * 4)] : 0;
  const squash = anim === 'run' ? s * 0.8 : 0;
  // Толстые ноги-тумбы.
  rect(ctx, ox - 7 + s, base - 6, 4, 7, BODY);
  rect(ctx, ox + 3 - s, base - 6, 4, 7, BODY);
  // Огромное тело.
  ellipse(ctx, ox, base - 16 + squash, 13 - squash, 12 + squash, BODY);
  ellipse(ctx, ox - 2, base - 26 + squash + slam * 0.5, 9, 6, BODY);
  // Кромка.
  for (let x = -8; x <= 4; x++) px(ctx, ox + x, Math.round(base - 31 + squash + Math.abs(x) * 0.25 + slam * 0.5), RIM);
  // Лапы.
  limb(ctx, ox + 8, base - 20, ox + 14 + slam, base - 10 - slam * 2, 3, 2.5, BODY);
  limb(ctx, ox - 9, base - 20, ox - 13, base - 9, 3, 2.5, BODY);
  // Большая маска и мелкие маски-наросты.
  mask(ctx, ox + 4, Math.round(base - 22 + squash + slam * 0.5), 4, 4.5, variant, broken);
  mask(ctx, ox - 6, base - 13, 1.6, 1.8, variant + 1, false);
  mask(ctx, ox + 1, base - 9, 1.4, 1.6, variant + 2, false);
}

function drawStealer(ctx: CanvasRenderingContext2D, anim: GreedAnim, t: number, variant: number, broken: boolean, W: number, H: number): void {
  const ox = Math.floor(W / 2);
  const s = Math.sin(t * Math.PI * 2);
  const cy = Math.floor(H / 2) + s;
  const flap = s * 6;
  poly(ctx, [[ox - 2, cy - 6], [ox - 14, cy - 12 - flap], [ox - 12, cy - 3 - flap * 0.3], [ox - 4, cy]], BODY);
  poly(ctx, [[ox + 2, cy - 6], [ox + 14, cy - 12 - flap], [ox + 12, cy - 3 - flap * 0.3], [ox + 4, cy]], BODY);
  line(ctx, ox - 2, cy - 6, ox - 14, cy - 12 - flap, RIM);
  line(ctx, ox + 2, cy - 6, ox + 14, cy - 12 - flap, RIM);
  // Вытянутое тело.
  ellipse(ctx, ox, cy - 3, 3.5, 7, BODY);
  // Длинные руки.
  const reach = anim === 'carry' ? -4 : 0;
  line(ctx, ox + 2, cy - 2, ox + 5, cy + 6 + reach, BODY);
  line(ctx, ox - 2, cy - 2, ox - 5, cy + 6 + reach, BODY);
  line(ctx, ox + 5, cy + 6 + reach, ox + 6, cy + 8 + reach, BODY);
  mask(ctx, ox + 1, cy - 7, 2.6, 3.2, variant, broken);
  // Рожки.
  px(ctx, ox - 2, cy - 11, BODY);
  px(ctx, ox + 2, cy - 11, BODY);
}

export const GREED_SIZE: Record<GreedKind, [number, number]> = {
  greedling: [16, 16],
  floater: [26, 22],
  breeder: [36, 40],
  stealer: [32, 30],
};

const FRAMES: Record<GreedAnim, number> = { run: 4, attack: 4, carry: 4, idle: 2, fly: 4 };
const cache = new Map<string, Sprite[]>();

export function greedFrames(kind: GreedKind, anim: GreedAnim, variant: number, broken = false): Sprite[] {
  const key = `${kind}:${anim}:${variant % 6}:${broken}`;
  let frames = cache.get(key);
  if (frames) return frames;
  const [W, H] = GREED_SIZE[kind];
  frames = [];
  const n = FRAMES[anim];
  for (let i = 0; i < n; i++) {
    const [c, ctx] = makeCanvas(W, H);
    const t = i / n;
    if (kind === 'greedling') drawGreedling(ctx, anim, t, variant, broken, W, H);
    else if (kind === 'floater') drawFloater(ctx, anim, t, variant, broken, W, H);
    else if (kind === 'breeder') drawBreeder(ctx, anim, t, variant, broken, W, H);
    else drawStealer(ctx, anim, t, variant, broken, W, H);
    frames.push({ img: c, w: W, h: H, ax: Math.floor(W / 2), ay: H });
  }
  cache.set(key, frames);
  return frames;
}

/** Отдельная маска, слетевшая с головы (частица). */
export function maskSprite(variant: number): Sprite {
  const key = `mask:${variant % 6}`;
  const f = cache.get(key);
  if (f) return f[0];
  const [c, ctx] = makeCanvas(7, 7);
  mask(ctx, 3, 3, 2.4, 2.8, variant, false);
  const s: Sprite = { img: c, w: 7, h: 7, ax: 3, ay: 6 };
  cache.set(key, [s]);
  return s;
}
