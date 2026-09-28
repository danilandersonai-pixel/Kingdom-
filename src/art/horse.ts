// Процедурный конь (и другие скакуны) с всадником-монархом.
// Кадры строятся из «костей»: корпус-эллипсы, шея, голова и
// четыре ноги с походкой шаг/галоп. Всё рисуется по пикселям.

import { makeCanvas, type Sprite } from '../engine/sprite';
import { ellipse, limb, line, poly, px, rect, shade } from './px';

export interface MountLook {
  body: string;
  mane: string;
  hoof: string;
  /** Белые «носочки» на ногах. */
  socks?: string;
  blaze?: boolean;
  /** Рога (олень) или рог (единорог). */
  antlers?: string;
  horn?: string;
  /** Попона-броня боевого коня. */
  barding?: string;
  saddle: string;
  saddleTrim: string;
  /** Масштаб корпуса (медведь крупнее). */
  scale?: number;
  /** Особое телосложение. */
  kind?: 'horse' | 'griffin' | 'bear' | 'lizard';
}

export interface RiderLook {
  skin: string;
  hair: string;
  beard: boolean;
  tunic: string;
  cape: string;
  capeTrim: string;
  crown: string;
  boots: string;
  gem: string;
}

export const HORSE: MountLook = {
  body: '#8a5634',
  mane: '#2b1a12',
  hoof: '#2a2220',
  socks: '#e8e0d0',
  blaze: true,
  saddle: '#8e2a2a',
  saddleTrim: '#e0b040',
};

export const KING: RiderLook = {
  skin: '#e8b48a',
  hair: '#6a3e22',
  beard: true,
  tunic: '#3a4a8a',
  cape: '#a82a2a',
  capeTrim: '#f0e6d0',
  crown: '#f2c84a',
  boots: '#3a2a20',
  gem: '#e04040',
};

export const QUEEN: RiderLook = {
  skin: '#f0c4a0',
  hair: '#c8a050',
  beard: false,
  tunic: '#5a3a7a',
  cape: '#2a5aa0',
  capeTrim: '#f0e6d0',
  crown: '#f2c84a',
  boots: '#3a2a20',
  gem: '#40c0e0',
};

export type MountAnim = 'idle' | 'walk' | 'gallop' | 'eat';

export const MOUNT_W = 46;
export const MOUNT_H = 40;
const OX = 22;
const BASE = MOUNT_H - 1;

interface Leg {
  hipX: number;
  hipY: number;
  phase: number;
  front: boolean;
  near: boolean;
}

function legPose(anim: MountAnim, t: number, leg: Leg, k = 1): { kx: number; ky: number; fx: number; fy: number } {
  const upper = 4.6 * k;
  const lower = 4.8 * k;
  let a1 = 0;
  let bend = 0;
  let lift = 0;
  const ph = (t + leg.phase) % 1;
  const s = Math.sin(ph * Math.PI * 2);
  const c = Math.cos(ph * Math.PI * 2);
  if (anim === 'walk') {
    a1 = s * 0.38;
    bend = Math.max(0, c) * 0.9;
    lift = Math.max(0, c) * 1.2;
  } else if (anim === 'gallop') {
    a1 = s * 0.75;
    bend = Math.max(0, c) * 1.5;
    lift = Math.max(0, c) * 2.2;
  } else if (anim === 'eat') {
    a1 = leg.front ? 0.12 : -0.05;
  } else {
    a1 = leg.front ? 0.04 : -0.04;
  }
  const kx = leg.hipX + Math.sin(a1) * upper;
  const ky = leg.hipY - Math.cos(a1) * upper;
  // Нижняя часть ноги подгибается назад, когда нога в воздухе.
  const a2 = a1 - bend * (leg.front ? 1 : 0.8);
  let fx = kx + Math.sin(a2) * lower;
  let fy = ky - Math.cos(a2) * lower;
  fy = Math.max(fy, lift * 0.3);
  if (fy < 0) fy = 0;
  if (anim === 'idle' || anim === 'eat') fx = kx + Math.sin(a2) * lower;
  return { kx, ky, fx, fy };
}

export function drawMountFrame(ctx: CanvasRenderingContext2D, anim: MountAnim, t: number, m: MountLook, r: RiderLook | null): void {
  const S = m.scale ?? 1;
  const X = (x: number) => OX + x * S;
  const Y = (y: number) => BASE - y * S;
  const body = m.body;
  const dark = shade(body, 0.72);
  const light = shade(body, 1.18);
  const farBody = shade(body, 0.6);

  // Покачивание корпуса.
  let bob = 0;
  let pitch = 0;
  if (anim === 'walk') bob = Math.abs(Math.sin(t * Math.PI * 2)) * 0.6;
  else if (anim === 'gallop') {
    bob = Math.sin(t * Math.PI * 2) * 1.3 + 0.6;
    pitch = Math.cos(t * Math.PI * 2) * 0.9;
  } else if (anim === 'idle') bob = Math.sin(t * Math.PI * 2) * 0.25;
  const drop = m.kind === 'bear' ? 3 : m.kind === 'lizard' ? 3.5 : 0;
  const by = (y: number, x: number) => y + bob + (x / 10) * pitch * 0.5 - drop;

  const legs: Leg[] =
    anim === 'gallop'
      ? [
          { hipX: -6.5, hipY: 10.5, phase: 0.0, front: false, near: false },
          { hipX: -6.0, hipY: 10.5, phase: 0.1, front: false, near: true },
          { hipX: 6.0, hipY: 10.2, phase: 0.45, front: true, near: false },
          { hipX: 6.5, hipY: 10.2, phase: 0.55, front: true, near: true },
        ]
      : [
          { hipX: -6.5, hipY: 10.5, phase: 0.0, front: false, near: false },
          { hipX: -6.0, hipY: 10.5, phase: 0.5, front: false, near: true },
          { hipX: 6.0, hipY: 10.2, phase: 0.25, front: true, near: false },
          { hipX: 6.5, hipY: 10.2, phase: 0.75, front: true, near: true },
        ];

  const drawLeg = (leg0: Leg) => {
    const leg = drop ? { ...leg0, hipY: leg0.hipY - drop } : leg0;
    const p = legPose(anim, t, leg, drop ? (leg0.hipY - drop) / leg0.hipY : 1);
    const hipY = by(leg.hipY, leg.hipX);
    const ky = p.ky + (hipY - leg.hipY);
    const fy = Math.max(0, p.fy + (hipY - leg.hipY) * 0.4);
    const col = leg.near ? dark : farBody;
    const hx = X(leg.hipX);
    const thick = m.kind === 'bear' ? 1.6 : 1;
    limb(ctx, hx, Y(hipY + 1.2), X(p.kx), Y(ky), (leg.front ? 2.6 : 3.2) * S * thick, 1.8 * S * thick, col);
    limb(ctx, X(p.kx), Y(ky), X(p.fx), Y(fy + 1), 1.6 * S * thick, 1.4 * S * thick, col);
    if (m.socks && leg.near) line(ctx, X(p.fx), Y(fy + 1.8), X(p.fx), Y(fy + 1), m.socks);
    rect(ctx, X(p.fx) - 1, Y(fy + 0.6), 2 * S, 1, m.hoof);
  };

  // Плащ всадника — позади всего.
  if (r) drawCape(ctx, anim, t, r, X, Y, by);

  // Дальние ноги.
  drawLeg(legs[0]);
  drawLeg(legs[2]);

  // Хвост.
  const sway = anim === 'gallop' ? Math.sin(t * Math.PI * 2) * 1.5 + 2 : anim === 'walk' ? Math.sin(t * Math.PI * 2) * 0.8 : Math.sin(t * Math.PI * 2) * 0.6;
  const tailLift = anim === 'gallop' ? 3.5 : 0;
  const kind = m.kind ?? 'horse';
  if (kind === 'lizard') {
    // Длинный хвост ящера почти до земли.
    limb(ctx, X(-9), Y(by(13, -9)), X(-15 - sway * 0.3), Y(by(8, -15)), 4 * S, 3 * S, body);
    limb(ctx, X(-15 - sway * 0.3), Y(by(8, -15)), X(-21 - sway), Y(3), 3 * S, 1.2 * S, body);
    line(ctx, X(-9), Y(by(11, -9)), X(-20 - sway), Y(3), dark);
  } else if (kind === 'bear') {
    ellipse(ctx, X(-10), Y(by(14, -10)), 1.5 * S, 1.5 * S, dark);
  } else if (kind === 'griffin') {
    // Львиный хвост с кисточкой.
    limb(ctx, X(-10), Y(by(15, -10)), X(-14 - sway * 0.4), Y(by(10 + tailLift, -14)), 1.4 * S, 1.2 * S, body);
    ellipse(ctx, X(-14.5 - sway * 0.4), Y(by(9 + tailLift, -14)), 1.6, 1.6, m.mane);
  } else {
    const tMidX = -12.6 - sway * 0.35;
    const tMidY = by(13.2 + tailLift * 0.6, -12);
    const tTipX = -12.2 - sway - (anim === 'gallop' ? 3 : 0);
    const tTipY = by(5.5 + tailLift * 1.4, -12);
    limb(ctx, X(-10.2), Y(by(16.4, -10)), X(tMidX), Y(tMidY), 2.8 * S, 2.6 * S, m.mane);
    limb(ctx, X(tMidX), Y(tMidY), X(tTipX), Y(tTipY), 2.6 * S, 1.2 * S, m.mane);
    line(ctx, X(-10.6), Y(by(16, -10)), X(tMidX + 0.6), Y(tMidY - 1), shade(m.mane, 1.5));
  }

  // Корпус: круп, бочка, грудь.
  ellipse(ctx, X(-6.8), Y(by(13.4, -7)), 4.3 * S, 4.3 * S, body);
  ellipse(ctx, X(0), Y(by(12.6, 0)), 9.2 * S, 3.9 * S, body);
  ellipse(ctx, X(6.6), Y(by(13, 7)), 3.7 * S, 4.2 * S, body);
  // Тень снизу и блик сверху.
  for (let x = -10; x <= 10; x++) {
    const yb = by(9.4, x);
    if (Math.abs(x) < 8.5) px(ctx, X(x), Y(yb), dark);
    if (Math.abs(x) < 7.5) px(ctx, X(x), Y(yb + 1), dark);
  }
  for (let x = -9; x <= 7; x++) {
    const top = x < -3 ? 17.3 - Math.abs(x + 7) * 0.12 : 16.2;
    px(ctx, X(x), Y(by(top, x)), light);
  }

  // Шея и голова.
  const eat = anim === 'eat';
  const chew = eat ? Math.sin(t * Math.PI * 4) * 0.4 : 0;
  const headBob = anim === 'gallop' ? Math.sin(t * Math.PI * 2 + 1) * 1.2 : anim === 'walk' ? Math.sin(t * Math.PI * 4) * 0.5 : 0;
  const neckBase: [number, number] = [7.2, by(15.2, 7)];
  const headTop: [number, number] = eat ? [12, by(8, 12)] : [11.4, by(22.3, 11) + headBob];
  const muzzle: [number, number] = eat ? [13.5, 1.8 + chew] : [16.6, by(18.2, 16) + headBob];
  if (kind === 'bear') {
    // Короткая толстая шея, круглая голова, круглые уши, короткая морда.
    limb(ctx, X(neckBase[0]), Y(neckBase[1]), X(headTop[0] - 1), Y(headTop[1] - 3), 6 * S, 5 * S, body);
    ellipse(ctx, X(headTop[0]), Y(headTop[1] - 3), 3.4 * S, 3 * S, body);
    ellipse(ctx, X(headTop[0] - 1.5), Y(headTop[1] - 0.2), 1.2, 1.2, dark);
    limb(ctx, X(headTop[0] + 2), Y(headTop[1] - 4), X(headTop[0] + 5), Y(headTop[1] - 5), 2.4, 2, light);
    px(ctx, X(headTop[0] + 5), Y(headTop[1] - 4.6), '#140c0a');
    px(ctx, X(headTop[0] + 1.5), Y(headTop[1] - 2.5), '#140c0a');
  } else if (kind === 'lizard') {
    // Длинная плоская голова без ушей и гривы, гребень на спине.
    limb(ctx, X(neckBase[0]), Y(neckBase[1]), X(headTop[0]), Y(headTop[1] - 3), 4.4 * S, 3.4 * S, body);
    limb(ctx, X(headTop[0] - 1), Y(headTop[1] - 3), X(muzzle[0] + 1.5), Y(muzzle[1] - 1), 3.4 * S, 2.2 * S, body);
    line(ctx, X(headTop[0] + 1), Y(headTop[1] - 4.6), X(muzzle[0] + 1.5), Y(muzzle[1] - 1.5), dark);
    px(ctx, X(headTop[0] + 1.5), Y(headTop[1] - 2.6), '#f2d040');
    for (let x = -8; x <= 6; x += 2) px(ctx, X(x), Y(by(17.6, x)), light);
  } else if (kind === 'griffin') {
    // Орлиная голова с клювом, перья на шее, сложенное крыло на боку.
    limb(ctx, X(neckBase[0]), Y(neckBase[1]), X(headTop[0]), Y(headTop[1] - 1), 5 * S, 3.6 * S, m.mane);
    ellipse(ctx, X(headTop[0] + 1), Y(headTop[1] - 1.5), 2.8, 2.6, m.mane);
    poly(ctx, [[X(headTop[0] + 3), Y(headTop[1] - 1)], [X(headTop[0] + 6.5), Y(headTop[1] - 2.5)], [X(headTop[0] + 5), Y(headTop[1] - 4)], [X(headTop[0] + 3), Y(headTop[1] - 3)]], '#e0b030');
    px(ctx, X(headTop[0] + 2), Y(headTop[1] - 0.6), '#140c0a');
    px(ctx, X(headTop[0] - 1), Y(headTop[1] + 1.5), m.mane);
    poly(ctx, [[X(6), Y(by(16, 6))], [X(-8), Y(by(18.5, -8))], [X(-12), Y(by(13, -12))], [X(-4), Y(by(11.5, -4))]], shade(body, 0.85));
    for (let i = 0; i < 4; i++) line(ctx, X(-4 - i * 2), Y(by(17.5 - i * 0.4, -4)), X(-6 - i * 2), Y(by(12.5, -6)), shade(body, 0.65));
  } else {
    limb(ctx, X(neckBase[0]), Y(neckBase[1]), X(headTop[0]), Y(headTop[1] - 1), 5.2 * S, 3.2 * S, body);
    // Грива вдоль шеи.
    limb(ctx, X(neckBase[0] - 1.8), Y(neckBase[1] + 2.2), X(headTop[0] - 0.8), Y(headTop[1] + 0.8), 1.8 * S, 1.4 * S, m.mane);
    // Голова.
    limb(ctx, X(headTop[0]), Y(headTop[1]), X(muzzle[0]), Y(muzzle[1]), 3.6 * S, 2.4 * S, body);
    px(ctx, X(muzzle[0]), Y(muzzle[1] - 0.5), dark);
    // Ухо.
    poly(ctx, [[X(headTop[0] - 0.8), Y(headTop[1] + 1)], [X(headTop[0] + 0.4), Y(headTop[1] + 3)], [X(headTop[0] + 1.1), Y(headTop[1] + 0.8)]], body);
    if (m.blaze) line(ctx, X(headTop[0] + 1.6), Y(headTop[1] - 0.6), X(muzzle[0] - 0.8), Y(muzzle[1] + 0.2), '#efe6d6');
    // Глаз.
    const ex = eat ? headTop[0] + 0.6 : headTop[0] + 1.3;
    const ey = eat ? headTop[1] - 1.5 : headTop[1] - 1;
    px(ctx, X(ex), Y(ey), '#140c0a');
  }
  if (m.antlers) {
    const ax = X(headTop[0] - 0.2);
    const ay = Y(headTop[1] + 1.5);
    line(ctx, ax, ay, ax - 3, ay - 5, m.antlers);
    line(ctx, ax - 3, ay - 5, ax - 6, ay - 7, m.antlers);
    line(ctx, ax - 2, ay - 3, ax - 1, ay - 7, m.antlers);
    line(ctx, ax - 4, ay - 6, ax - 4, ay - 9, m.antlers);
    line(ctx, ax + 1, ay, ax + 3, ay - 5, m.antlers);
    line(ctx, ax + 3, ay - 5, ax + 2, ay - 8, m.antlers);
  }
  if (m.horn) {
    const hx = X(headTop[0] + 1.6);
    const hy = Y(headTop[1] + 0.6);
    line(ctx, hx, hy, hx + 4, hy - 4, m.horn);
    px(ctx, hx + 2, hy - 2, '#ffffff');
  }

  // Седло или попона.
  if (m.barding) {
    poly(ctx, [[X(-10), Y(by(15.5, -10))], [X(8.5), Y(by(15.5, 8))], [X(9.5), Y(by(9.5, 9))], [X(-10.5), Y(by(10, -10))]], m.barding);
    for (let x = -10; x <= 9; x += 2) px(ctx, X(x), Y(by(10, x)), shade(m.barding, 0.7));
  }
  rect(ctx, X(-3.4), Y(by(17.4, -3)), 7 * S, 3, m.saddle);
  rect(ctx, X(-3.4), Y(by(14.6, -3)), 7 * S, 1, m.saddleTrim);
  rect(ctx, X(-2.4), Y(by(13.6, -2)), 5 * S, 1, m.saddle);

  // Ближние ноги.
  drawLeg(legs[1]);
  drawLeg(legs[3]);

  if (r) drawRider(ctx, anim, t, r, X, Y, by, [headTop[0] + 0.8, headTop[1] - 1.8]);
}

function drawCape(ctx: CanvasRenderingContext2D, anim: MountAnim, t: number, r: RiderLook, X: (x: number) => number, Y: (y: number) => number, by: (y: number, x: number) => number): void {
  const flow = anim === 'gallop' ? 1 : anim === 'walk' ? 0.35 : 0;
  const wave = Math.sin(t * Math.PI * 4) * (anim === 'gallop' ? 1.2 : 0.5);
  const sx = -1.8;
  const sy = by(24.2, -2);
  const tipX = sx - 3 - flow * 7;
  const tipY = sy - 9 + flow * 5 + wave;
  const midX = sx - 1.5 - flow * 5;
  const midY = sy - 5 + flow * 3 - wave * 0.5;
  poly(
    ctx,
    [
      [X(sx + 1), Y(sy)],
      [X(sx - 1), Y(sy + 0.5)],
      [X(midX - 1.5), Y(midY + 1)],
      [X(tipX - 1), Y(tipY + 1)],
      [X(tipX + 2.5), Y(tipY - 1)],
      [X(sx + 1.5), Y(sy - 6)],
    ],
    r.cape,
  );
  line(ctx, X(tipX - 1), Y(tipY + 1), X(tipX + 2.5), Y(tipY - 1), r.capeTrim);
  line(ctx, X(sx - 1), Y(sy + 0.5), X(midX - 1.5), Y(midY + 1), shade(r.cape, 1.2));
}

function drawRider(ctx: CanvasRenderingContext2D, anim: MountAnim, t: number, r: RiderLook, X: (x: number) => number, Y: (y: number) => number, by: (y: number, x: number) => number, rein: [number, number]): void {
  const hipX = -0.6;
  const hipY = by(17.3, -1);
  const lean = anim === 'gallop' ? 1.2 : anim === 'walk' ? 0.3 : 0;
  const riderBob = anim === 'gallop' ? Math.max(0, Math.sin(t * Math.PI * 2 + 0.6)) * 0.8 : 0;
  const hy = hipY + riderBob;
  // Нога вдоль бока коня.
  limb(ctx, X(hipX), Y(hy), X(hipX + 2.4), Y(hy - 2.2), 2.2, 2, shade(r.tunic, 0.8));
  limb(ctx, X(hipX + 2.4), Y(hy - 2.2), X(hipX + 2), Y(hy - 5.6), 1.8, 1.8, r.boots);
  px(ctx, X(hipX + 2.8), Y(hy - 5.6), r.boots);
  // Корпус.
  const shX = hipX + lean;
  const shY = hy + 6;
  limb(ctx, X(hipX), Y(hy + 0.5), X(shX), Y(shY), 4.2, 4, r.tunic);
  px(ctx, X(shX + 1), Y(shY - 1), shade(r.tunic, 1.25));
  rect(ctx, X(hipX - 1.6), Y(hy + 1.6), 4, 1, '#3a2418');
  rect(ctx, X(hipX), Y(hy + 1.6), 1, 1, r.crown);
  // Голова.
  const hx = shX + 0.4;
  const hyH = shY + 1;
  rect(ctx, X(hx - 1.6), Y(hyH + 4), 4, 4, r.skin);
  rect(ctx, X(hx - 1.6), Y(hyH + 4), 1, 4, r.hair);
  rect(ctx, X(hx - 1.6), Y(hyH + 4), 4, 1, r.hair);
  px(ctx, X(hx + 1.4), Y(hyH + 2.2), '#2a1a14');
  if (r.beard) {
    rect(ctx, X(hx - 0.6), Y(hyH + 1.2), 3, 2, r.hair);
    px(ctx, X(hx + 2.4), Y(hyH + 1.2), r.hair);
  } else {
    // Длинные волосы до плеч.
    rect(ctx, X(hx - 2.6), Y(hyH + 3.4), 1, 4, r.hair);
    rect(ctx, X(hx - 1.6), Y(hyH + 0.2), 1, 1, r.hair);
  }
  // Корона: три зубца.
  const cy = hyH + 5;
  rect(ctx, X(hx - 1.6), Y(cy), 4, 1, r.crown);
  px(ctx, X(hx - 1.6), Y(cy + 1), r.crown);
  px(ctx, X(hx + 0.4), Y(cy + 1), r.crown);
  px(ctx, X(hx + 2.4), Y(cy + 1), r.crown);
  px(ctx, X(hx + 0.4), Y(cy), r.gem);
  // Рука с поводьями.
  const handX = shX + 3.6;
  const handY = shY - 3.4;
  limb(ctx, X(shX + 0.4), Y(shY - 0.6), X(handX), Y(handY), 1.6, 1.4, shade(r.tunic, 0.85));
  px(ctx, X(handX + 0.6), Y(handY), r.skin);
  line(ctx, X(handX + 1), Y(handY), X(rein[0]), Y(rein[1]), '#2a1a12');
}

const cache = new Map<string, Sprite[]>();

export function mountFrames(key: string, anim: MountAnim, m: MountLook, r: RiderLook | null): Sprite[] {
  const k = `${key}:${anim}`;
  let frames = cache.get(k);
  if (frames) return frames;
  const n = anim === 'walk' || anim === 'gallop' ? 8 : 4;
  frames = [];
  for (let i = 0; i < n; i++) {
    const [c, ctx] = makeCanvas(MOUNT_W, MOUNT_H);
    drawMountFrame(ctx, anim, i / n, m, r);
    frames.push({ img: c, w: MOUNT_W, h: MOUNT_H, ax: OX, ay: MOUNT_H });
  }
  cache.set(k, frames);
  return frames;
}
