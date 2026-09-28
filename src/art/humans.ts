// Процедурные человечки: бродяги, крестьяне, лучники, строители,
// фермеры, рыцари, отшельники, торговец. Кадры строятся из частей тела
// с позами для шага, бега и рабочих действий.

import { makeCanvas, type Sprite } from '../engine/sprite';
import { Rng } from '../engine/rng';
import { limb, line, poly, px, rect, shade, ellipse } from './px';

export type HeadWear = 'none' | 'hood' | 'straw' | 'cap' | 'helmet' | 'crown' | 'bandana' | 'tophat' | 'wizard' | 'feather';
export type Tool = 'none' | 'bow' | 'hammer' | 'scythe' | 'sword' | 'staff' | 'pike' | 'torch' | 'bomb' | 'pack' | 'coinbag' | 'lute';

export interface HumanLook {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'long' | 'bald' | 'messy';
  beard: boolean;
  tunic: string;
  pants: string;
  boots: string;
  head: HeadWear;
  headColor: string;
  tool: Tool;
  shield?: string;
  shieldEmblem?: string;
  armor?: boolean;
  quiver?: boolean;
  hunched?: boolean;
  robe?: boolean;
  apron?: string;
  ghost?: boolean;
  /** Ребёнок: короче ноги и туловище, голова той же величины. */
  child?: boolean;
}

export type HumanAnim = 'idle' | 'walk' | 'run' | 'act' | 'panic' | 'hold' | 'sit' | 'wave';

export const HUMAN_W = 22;
export const HUMAN_H = 30;
const OX = 10;
const BASE = HUMAN_H - 1;

interface Pose {
  bob: number;
  lean: number;
  legF: number;
  legB: number;
  kneeF: number;
  kneeB: number;
  armF: number;
  armB: number;
  elbowF: number;
  /** Угол инструмента (0 — вниз, PI/2 — вперёд, PI — вверх). */
  toolAng: number;
  /** Натяжение тетивы 0..1. */
  draw: number;
  /** Насколько опущены бёдра (сидит). */
  hipDrop: number;
}

const FRAMES: Record<HumanAnim, number> = { idle: 4, walk: 6, run: 6, act: 4, panic: 4, hold: 2, sit: 4, wave: 4 };

function pose(anim: HumanAnim, t: number, look: HumanLook): Pose {
  const s = Math.sin(t * Math.PI * 2);
  const c = Math.cos(t * Math.PI * 2);
  const p: Pose = { bob: 0, lean: 0, legF: 0, legB: 0, kneeF: 0, kneeB: 0, armF: 0.15, armB: -0.1, elbowF: 0, toolAng: 0.2, draw: 0, hipDrop: 0 };
  switch (anim) {
    case 'idle':
      p.bob = s > 0.3 ? 0.5 : 0;
      p.legF = 0.08;
      p.legB = -0.08;
      break;
    case 'walk':
      p.legF = s * 0.5;
      p.legB = -s * 0.5;
      p.kneeF = Math.max(0, c) * 0.5;
      p.kneeB = Math.max(0, -c) * 0.5;
      p.armF = -s * 0.45 + 0.1;
      p.armB = s * 0.45;
      p.bob = Math.abs(s) > 0.7 ? 0 : 0.6;
      break;
    case 'run':
      p.legF = s * 0.85;
      p.legB = -s * 0.85;
      p.kneeF = Math.max(0, c) * 1.1;
      p.kneeB = Math.max(0, -c) * 1.1;
      p.armF = -s * 0.9 + 0.3;
      p.armB = s * 0.9 + 0.2;
      p.elbowF = 0.6;
      p.lean = 1;
      p.bob = Math.abs(s) > 0.6 ? 0 : 1;
      break;
    case 'panic':
      p.legF = s * 0.8;
      p.legB = -s * 0.8;
      p.kneeF = Math.max(0, c);
      p.kneeB = Math.max(0, -c);
      p.armF = Math.PI * 0.85 + s * 0.25;
      p.armB = Math.PI * 0.8 - s * 0.25;
      p.bob = Math.abs(s) > 0.6 ? 0 : 1;
      break;
    case 'hold':
      p.armF = Math.PI * 0.95;
      p.armB = Math.PI * 0.9;
      p.bob = s > 0 ? 0.5 : 0;
      break;
    case 'sit':
      // Сидит на бревне у костра, протянув руки к огню.
      p.hipDrop = 2;
      p.legF = 1.3;
      p.legB = 1.15;
      p.kneeF = 1.3;
      p.kneeB = 1.15;
      p.armF = 1.1 + s * 0.08;
      p.armB = 0.9;
      p.elbowF = -0.3;
      p.lean = 0.5;
      p.bob = s > 0.5 ? 0.4 : 0;
      break;
    case 'wave':
      // Машет монарху.
      p.armF = Math.PI * 0.8 + s * 0.35;
      p.elbowF = 0.4 + c * 0.2;
      p.legF = 0.08;
      p.legB = -0.08;
      break;
    case 'act':
      actPose(p, t, look.tool);
      break;
  }
  if (look.tool === 'bow' && anim !== 'act') p.toolAng = 0;
  if (look.tool === 'scythe' && anim !== 'act') p.toolAng = Math.PI * 0.92;
  if (look.tool === 'staff' || look.tool === 'pike' || look.tool === 'torch') p.toolAng = Math.PI * 0.95;
  if (look.tool === 'sword' && anim !== 'act') p.toolAng = 0.5;
  if (look.tool === 'lute' && (anim === 'sit' || anim === 'idle' || anim === 'act')) {
    // Левая рука на грифе, правая перебирает струны.
    p.armB = 1.55;
    p.armF = 0.95 + Math.abs(s) * 0.3;
    p.elbowF = 0.35;
  }
  return p;
}

function actPose(p: Pose, t: number, tool: Tool): void {
  const f = Math.floor(t * 4);
  switch (tool) {
    case 'bow':
      // Поднять лук, натянуть, отпустить.
      p.armF = Math.PI / 2;
      p.armB = Math.PI / 2 - 0.2;
      p.draw = [0.2, 0.7, 1, 0][f];
      p.toolAng = 0;
      break;
    case 'hammer':
      p.armF = [Math.PI * 0.95, Math.PI * 0.75, Math.PI * 0.4, Math.PI * 0.3][f];
      p.toolAng = [Math.PI * 1.1, Math.PI * 0.9, Math.PI * 0.45, Math.PI * 0.3][f];
      p.lean = f >= 2 ? 1 : 0;
      break;
    case 'scythe':
      p.armF = [Math.PI * 0.2, Math.PI * 0.45, Math.PI * 0.6, Math.PI * 0.35][f];
      p.armB = p.armF - 0.3;
      p.toolAng = [Math.PI * 0.55, Math.PI * 0.35, Math.PI * 0.2, Math.PI * 0.45][f];
      p.lean = f === 2 ? 1 : 0;
      break;
    case 'sword':
      p.armF = [Math.PI * 0.95, Math.PI * 0.8, Math.PI * 0.45, Math.PI * 0.3][f];
      p.toolAng = [Math.PI * 1.05, Math.PI * 0.85, Math.PI * 0.5, Math.PI * 0.3][f];
      p.lean = f >= 2 ? 1 : 0;
      p.legF = 0.3;
      p.legB = -0.3;
      break;
    case 'pike':
      p.armF = Math.PI * 0.45;
      p.toolAng = Math.PI * 0.5;
      p.lean = [0, 1, 2, 1][f];
      p.legF = 0.35;
      p.legB = -0.35;
      break;
    case 'torch':
    case 'bomb':
    case 'pack':
      p.armF = Math.PI * 0.9;
      p.armB = Math.PI * 0.85;
      break;
    default:
      // Взмах рукой (бросить монету / помахать).
      p.armF = [0.3, Math.PI * 0.5, Math.PI * 0.8, Math.PI * 0.5][f];
      break;
  }
}

export function drawHuman(ctx: CanvasRenderingContext2D, look: HumanLook, anim: HumanAnim, t: number): void {
  const X = (x: number) => OX + x;
  const Y = (y: number) => BASE - y;
  const p = pose(anim, t, look);
  const hunch = look.hunched ? 1 : 0;
  const hipY = (look.child ? 3.4 : 5) - p.hipDrop;
  const legLen = look.child ? 3.4 : 5;
  const torso = look.child ? 4 : 6;
  const body = look.armor ? '#9aa4b0' : look.tunic;
  const bodyDark = shade(body, 0.74);
  const bodyLight = shade(body, 1.2);
  const pantsDark = shade(look.pants, 0.75);

  const shX = p.lean + hunch * 1;
  const shY = hipY + torso + p.bob - hunch;
  const headX = shX + (look.hunched ? 1 : 0);
  const headY = shY + 0.5;

  const armPoint = (ang: number, len: number, fromX: number, fromY: number): [number, number] => [fromX + Math.sin(ang) * len, fromY - Math.cos(ang) * len];

  // Колчан за спиной.
  if (look.quiver) {
    limb(ctx, X(shX - 2.5), Y(shY + 1.5), X(shX - 3.5), Y(shY - 4), 2, 2, '#6a4428');
    px(ctx, X(shX - 2), Y(shY + 2.5), '#d8d0b8');
    px(ctx, X(shX - 3), Y(shY + 2), '#d8d0b8');
  }
  // Заплечный мешок торговца.
  if (look.tool === 'pack') {
    rect(ctx, X(shX - 5), Y(shY + 3), 4, 7, '#7a5a3a');
    rect(ctx, X(shX - 5), Y(shY + 3), 4, 1, '#9a7a4a');
    rect(ctx, X(shX - 4), Y(shY - 1), 2, 1, '#5a3a22');
  }

  // Дальняя рука.
  const handB = armPoint(p.armB, 4, shX - 0.5, shY - 0.5);
  limb(ctx, X(shX - 0.5), Y(shY - 0.5), X(handB[0]), Y(handB[1]), 1.6, 1.4, bodyDark);
  px(ctx, X(handB[0]), Y(handB[1]), shade(look.skin, 0.85));

  // Ноги.
  const thigh = legLen * 0.52;
  const drawLeg = (ang: number, knee: number, hipX: number, color: string, boot: string) => {
    const kx = hipX + Math.sin(ang) * thigh;
    const ky = hipY - Math.cos(ang) * thigh;
    const a2 = ang - knee;
    const fx = kx + Math.sin(a2) * (legLen - thigh);
    const fy = Math.max(0, ky - Math.cos(a2) * (legLen - thigh));
    limb(ctx, X(hipX), Y(hipY), X(kx), Y(ky), 2, 1.8, color);
    limb(ctx, X(kx), Y(ky), X(fx), Y(fy + 0.8), 1.8, 1.6, color);
    rect(ctx, X(fx - 0.5), Y(fy + 0.5), 2, 1, boot);
  };
  drawLeg(p.legB, p.kneeB, -0.4, pantsDark, shade(look.boots, 0.8));

  // Туловище: туника расширяется книзу.
  if (look.robe) {
    poly(ctx, [[X(shX - 2), Y(shY)], [X(shX + 2.2), Y(shY)], [X(3), Y(0.6)], [X(-3), Y(0.6)]], body);
    line(ctx, X(-3), Y(0.8), X(3), Y(0.8), bodyDark);
  } else {
    poly(ctx, [[X(shX - 2), Y(shY)], [X(shX + 2.2), Y(shY)], [X(2.8), Y(hipY - 1.5)], [X(-2.6), Y(hipY - 1.5)]], body);
  }
  // Свет и тень на тунике.
  line(ctx, X(shX + 1.6), Y(shY - 0.5), X(2.2), Y(hipY - 0.8), bodyLight);
  line(ctx, X(shX - 1.6), Y(shY - 0.5), X(-2.2), Y(hipY - 0.8), bodyDark);
  if (look.apron) poly(ctx, [[X(shX + 0.2), Y(shY - 2)], [X(shX + 2.2), Y(shY - 2)], [X(2.6), Y(hipY - 1.2)], [X(0.4), Y(hipY - 1.2)]], look.apron);
  if (!look.robe) rect(ctx, X(-2.2), Y(hipY + 0.8), 5, 1, look.armor ? '#6a5a4a' : '#3a2a1e');
  if (look.armor) {
    // Нагрудник: блики и заклёпки.
    px(ctx, X(shX + 1), Y(shY - 1.5), '#e0e6ec');
    px(ctx, X(shX + 1), Y(shY - 2.5), '#c8d0d8');
    rect(ctx, X(-2.4), Y(hipY - 0.6), 5, 1, '#7a848e');
  }

  // Ближняя нога.
  if (!look.robe) drawLeg(p.legF, p.kneeF, 0.6, look.pants, look.boots);
  else rect(ctx, X(0.5 + p.legF * 2), Y(0.5), 2, 1, look.boots);

  // Голова.
  const hx = headX - 1.5;
  const hy = headY + 4.5;
  rect(ctx, X(hx), Y(hy), 4, 4, look.skin);
  px(ctx, X(hx + 3), Y(hy - 1.5), '#2a1a14');
  px(ctx, X(hx + 1), Y(hy - 3), shade(look.skin, 0.85));
  // Волосы.
  if (look.hairStyle !== 'bald') {
    rect(ctx, X(hx), Y(hy), 4, 1, look.hair);
    rect(ctx, X(hx), Y(hy), 1, 3, look.hair);
    if (look.hairStyle === 'long') rect(ctx, X(hx - 1), Y(hy - 1), 1, 4, look.hair);
    if (look.hairStyle === 'messy') {
      px(ctx, X(hx - 1), Y(hy - 1), look.hair);
      px(ctx, X(hx + 2), Y(hy + 1), look.hair);
      px(ctx, X(hx), Y(hy + 1), look.hair);
    }
  }
  if (look.beard) {
    rect(ctx, X(hx + 1), Y(hy - 2.6), 3, 2, look.hair);
    px(ctx, X(hx + 3), Y(hy - 3.6), look.hair);
  }
  drawHeadwear(ctx, look, X, Y, hx, hy);

  // Щит на ближней руке (рыцарь).
  if (look.shield) {
    const sx = shX + 1.5;
    const sy = shY - 1;
    poly(ctx, [[X(sx), Y(sy + 1)], [X(sx + 4), Y(sy + 1)], [X(sx + 4), Y(sy - 3)], [X(sx + 2), Y(sy - 5.5)], [X(sx), Y(sy - 3)]], look.shield);
    line(ctx, X(sx), Y(sy + 1), X(sx + 3), Y(sy + 1), shade(look.shield, 1.3));
    if (look.shieldEmblem) {
      px(ctx, X(sx + 2), Y(sy - 0.5), look.shieldEmblem);
      px(ctx, X(sx + 2), Y(sy - 1.5), look.shieldEmblem);
      px(ctx, X(sx + 1), Y(sy - 0.5), look.shieldEmblem);
      px(ctx, X(sx + 3), Y(sy - 0.5), look.shieldEmblem);
    }
  }

  // Ближняя рука и инструмент.
  const elbow = armPoint(p.armF, 2.2, shX + 0.6, shY - 0.5);
  const handF = armPoint(p.armF - p.elbowF, 2.2, elbow[0], elbow[1]);
  limb(ctx, X(shX + 0.6), Y(shY - 0.5), X(elbow[0]), Y(elbow[1]), 1.7, 1.6, look.armor ? '#b8c0c8' : shade(body, 0.9));
  limb(ctx, X(elbow[0]), Y(elbow[1]), X(handF[0]), Y(handF[1]), 1.6, 1.4, look.armor ? '#b8c0c8' : shade(body, 0.9));
  drawTool(ctx, look, p, X, Y, handF, handB, shX, shY);
  px(ctx, X(handF[0]), Y(handF[1]), look.skin);
}

function drawHeadwear(ctx: CanvasRenderingContext2D, look: HumanLook, X: (x: number) => number, Y: (y: number) => number, hx: number, hy: number): void {
  const c = look.headColor;
  const dark = shade(c, 0.75);
  switch (look.head) {
    case 'hood':
      rect(ctx, X(hx - 1), Y(hy + 1), 5, 2, c);
      rect(ctx, X(hx - 1), Y(hy - 1), 2, 4, c);
      px(ctx, X(hx - 2), Y(hy - 2), dark);
      px(ctx, X(hx + 3), Y(hy + 1), dark);
      break;
    case 'straw':
      rect(ctx, X(hx - 2), Y(hy), 8, 1, c);
      rect(ctx, X(hx), Y(hy + 1), 4, 1, c);
      px(ctx, X(hx + 1), Y(hy + 2), dark);
      px(ctx, X(hx + 2), Y(hy + 2), dark);
      rect(ctx, X(hx), Y(hy), 4, 1, dark);
      break;
    case 'cap':
      rect(ctx, X(hx), Y(hy + 1), 4, 2, c);
      rect(ctx, X(hx + 3), Y(hy), 2, 1, dark);
      break;
    case 'helmet':
      rect(ctx, X(hx - 0.5), Y(hy + 1), 5, 2, c);
      rect(ctx, X(hx - 0.5), Y(hy - 1), 1, 3, c);
      rect(ctx, X(hx + 2), Y(hy - 1), 3, 1, dark);
      px(ctx, X(hx + 1), Y(hy + 2), '#e8e8f0');
      // Плюмаж.
      px(ctx, X(hx), Y(hy + 3), look.shield ?? '#b02a2a');
      px(ctx, X(hx - 1), Y(hy + 3), look.shield ?? '#b02a2a');
      px(ctx, X(hx - 2), Y(hy + 2), look.shield ?? '#b02a2a');
      break;
    case 'crown':
      rect(ctx, X(hx), Y(hy + 1), 4, 1, c);
      px(ctx, X(hx), Y(hy + 2), c);
      px(ctx, X(hx + 2), Y(hy + 2), c);
      px(ctx, X(hx + 3), Y(hy + 2), c);
      break;
    case 'bandana':
      rect(ctx, X(hx), Y(hy + 0.5), 4, 1, c);
      px(ctx, X(hx - 1), Y(hy - 0.5), c);
      break;
    case 'tophat':
      rect(ctx, X(hx - 1), Y(hy + 1), 6, 1, c);
      rect(ctx, X(hx), Y(hy + 4), 4, 3, c);
      rect(ctx, X(hx), Y(hy + 2), 4, 1, '#b02a2a');
      break;
    case 'wizard':
      poly(ctx, [[X(hx - 1.5), Y(hy + 1)], [X(hx + 5), Y(hy + 1)], [X(hx + 1), Y(hy + 7)]], c);
      rect(ctx, X(hx - 1.5), Y(hy + 1), 7, 1, dark);
      break;
    case 'feather':
      // Берет барда с длинным пером.
      rect(ctx, X(hx - 1), Y(hy + 1), 6, 2, c);
      rect(ctx, X(hx - 1), Y(hy), 6, 1, dark);
      line(ctx, X(hx - 1), Y(hy + 2), X(hx - 4), Y(hy + 5), '#f4ece0');
      px(ctx, X(hx - 4), Y(hy + 5), '#e8c860');
      break;
    default:
      break;
  }
}

function drawTool(ctx: CanvasRenderingContext2D, look: HumanLook, p: Pose, X: (x: number) => number, Y: (y: number) => number, hand: [number, number], handB: [number, number], shX: number, shY: number): void {
  const [hx, hy] = hand;
  const dir = (ang: number, len: number): [number, number] => [hx + Math.sin(ang) * len, hy - Math.cos(ang) * len];
  const wood = '#7a5230';
  const metal = '#c8ccd0';
  switch (look.tool) {
    case 'bow': {
      // Лук вертикально перед рукой.
      const bx = hx + 1;
      const top: [number, number] = [bx - 1, hy + 5];
      const bot: [number, number] = [bx - 1, hy - 5];
      line(ctx, X(top[0]), Y(top[1]), X(bx + 1), Y(hy + 2), '#6a4020');
      line(ctx, X(bx + 1), Y(hy + 2), X(bx + 1), Y(hy - 2), '#6a4020');
      line(ctx, X(bx + 1), Y(hy - 2), X(bot[0]), Y(bot[1]), '#6a4020');
      const pull = p.draw * 4;
      if (p.draw > 0) {
        line(ctx, X(top[0]), Y(top[1]), X(bx - 1 - pull), Y(hy), '#e8e0c8');
        line(ctx, X(bx - 1 - pull), Y(hy), X(bot[0]), Y(bot[1]), '#e8e0c8');
        // Стрела.
        line(ctx, X(bx - 1 - pull), Y(hy), X(bx + 3), Y(hy), '#d8c8a0');
        px(ctx, X(bx + 3), Y(hy), metal);
      } else {
        line(ctx, X(top[0]), Y(top[1]), X(bot[0]), Y(bot[1]), '#d8d0b8');
      }
      void handB;
      break;
    }
    case 'hammer': {
      const end = dir(p.toolAng, 4.5);
      line(ctx, X(hx), Y(hy), X(end[0]), Y(end[1]), wood);
      const perp = p.toolAng + Math.PI / 2;
      const a: [number, number] = [end[0] + Math.sin(perp) * 1.5, end[1] - Math.cos(perp) * 1.5];
      const b: [number, number] = [end[0] - Math.sin(perp) * 1.5, end[1] + Math.cos(perp) * 1.5];
      limb(ctx, X(a[0]), Y(a[1]), X(b[0]), Y(b[1]), 2, 2, '#6a6e74');
      break;
    }
    case 'scythe': {
      const tail = dir(p.toolAng + Math.PI, 3);
      const tip = dir(p.toolAng, 8);
      line(ctx, X(tail[0]), Y(tail[1]), X(tip[0]), Y(tip[1]), wood);
      // Лезвие загибается вперёд от верхушки.
      const bladeAng = p.toolAng + Math.PI / 2 + 0.3;
      const b1: [number, number] = [tip[0] + Math.sin(bladeAng) * 3, tip[1] - Math.cos(bladeAng) * 3];
      const b2: [number, number] = [b1[0] + Math.sin(bladeAng + 0.6) * 2.5, b1[1] - Math.cos(bladeAng + 0.6) * 2.5];
      line(ctx, X(tip[0]), Y(tip[1]), X(b1[0]), Y(b1[1]), metal);
      line(ctx, X(b1[0]), Y(b1[1]), X(b2[0]), Y(b2[1]), '#e8ecf0');
      break;
    }
    case 'sword': {
      const tip = dir(p.toolAng, 6);
      const guard = dir(p.toolAng, 1);
      line(ctx, X(guard[0]), Y(guard[1]), X(tip[0]), Y(tip[1]), '#dde2e8');
      const perp = p.toolAng + Math.PI / 2;
      line(ctx, X(guard[0] + Math.sin(perp)), Y(guard[1] - Math.cos(perp)), X(guard[0] - Math.sin(perp)), Y(guard[1] + Math.cos(perp)), '#a08040');
      break;
    }
    case 'staff': {
      line(ctx, X(hx + 0.5), Y(hy + 5), X(hx + 0.5), Y(0), '#6a4a2a');
      px(ctx, X(hx + 0.5), Y(hy + 5), '#a0c0e0');
      break;
    }
    case 'pike': {
      const tail = dir(p.toolAng + Math.PI, 4);
      const tip = dir(p.toolAng, 10);
      line(ctx, X(tail[0]), Y(tail[1]), X(tip[0]), Y(tip[1]), wood);
      const tip2 = dir(p.toolAng, 12);
      line(ctx, X(tip[0]), Y(tip[1]), X(tip2[0]), Y(tip2[1]), metal);
      break;
    }
    case 'torch': {
      line(ctx, X(hx), Y(hy), X(hx), Y(hy + 4), wood);
      px(ctx, X(hx), Y(hy + 5), '#ffcf5a');
      px(ctx, X(hx), Y(hy + 6), '#ff8a3a');
      break;
    }
    case 'bomb': {
      ellipse(ctx, X(hx), Y(hy + 3), 3, 3, '#2a2a32');
      px(ctx, X(hx + 1), Y(hy + 5), '#6a6a74');
      line(ctx, X(hx + 1), Y(hy + 6), X(hx + 2), Y(hy + 7), '#c8a060');
      break;
    }
    case 'lute': {
      // Лютня поперёк тела: корпус у бедра, гриф к плечу; ближняя рука перебирает струны.
      const bx = shX + 1;
      const by = shY - 4;
      ellipse(ctx, X(bx), Y(by), 2.2, 1.6, '#a8662a');
      px(ctx, X(bx), Y(by), '#3a2010');
      px(ctx, X(bx - 1), Y(by + 1), '#c88a4a');
      line(ctx, X(bx - 1), Y(by + 1), X(bx - 4), Y(by + 4), '#6a3e1a');
      px(ctx, X(bx - 5), Y(by + 4), '#6a3e1a');
      break;
    }
    case 'coinbag': {
      ellipse(ctx, X(hx), Y(hy - 2), 2, 2, '#b08a3a');
      px(ctx, X(hx), Y(hy - 0.5), '#f2c84a');
      break;
    }
    default:
      break;
  }
  void shX;
  void shY;
}

// ——— Роли и варианты внешности ———

export type Role =
  | 'vagrant'
  | 'peasant'
  | 'archer'
  | 'builder'
  | 'farmer'
  | 'knight'
  | 'pikeman'
  | 'hermit'
  | 'merchant'
  | 'banker'
  | 'ghost'
  | 'squire'
  | 'child'
  | 'bard';

const SKINS = ['#e8b48a', '#d8a078', '#f0c4a0', '#b87a50', '#8a5a3a', '#f2d0b0'];
const HAIRS = ['#3a2418', '#6a3e22', '#a06a3a', '#c8a050', '#2a2a2a', '#8a8078', '#d8d0c0'];
const PEASANT_TUNICS = ['#c8b894', '#b0a080', '#d0c0a0', '#a8b0a0', '#c0a898'];

export function lookFor(role: Role, variant: number, kingdomColor = '#a82a2a'): HumanLook {
  const r = new Rng(variant * 7919 + role.length * 131 + 17);
  const skin = r.pick(SKINS);
  const hair = r.pick(HAIRS);
  const base: HumanLook = {
    skin,
    hair,
    hairStyle: r.pick(['short', 'short', 'long', 'messy'] as const),
    beard: r.chance(0.35),
    tunic: r.pick(PEASANT_TUNICS),
    pants: '#5a4432',
    boots: '#3a2a20',
    head: 'none',
    headColor: '#6a4a2a',
    tool: 'none',
  };
  switch (role) {
    case 'vagrant':
      return {
        ...base,
        tunic: r.pick(['#6a5e52', '#5a544a', '#72665a', '#5e5048']),
        pants: '#44403a',
        boots: shade(skin, 0.7),
        hairStyle: 'messy',
        beard: r.chance(0.6),
        hunched: true,
        head: r.chance(0.3) ? 'bandana' : 'none',
        headColor: '#5a4a3a',
      };
    case 'peasant':
      return base;
    case 'archer':
      return { ...base, tunic: r.pick(['#4a6a3a', '#56703e', '#3e5e36']), pants: '#4a3a2a', head: 'hood', headColor: r.pick(['#3e5a2e', '#4a6a38']), tool: 'bow', quiver: true };
    case 'builder':
      return { ...base, tunic: r.pick(['#9a6a3a', '#a07040', '#8a5a34']), pants: '#4a3a30', head: 'cap', headColor: '#6a4a2a', tool: 'hammer', apron: '#c8a878' };
    case 'farmer':
      return { ...base, tunic: r.pick(['#b8a068', '#a89060', '#c0a870']), pants: '#6a5a3a', head: 'straw', headColor: '#e0c870', tool: 'scythe' };
    case 'knight':
      return { ...base, armor: true, tunic: '#9aa4b0', pants: '#6a7480', boots: '#4a4e54', head: 'helmet', headColor: '#aab4be', tool: 'sword', shield: kingdomColor, shieldEmblem: '#f2c84a', beard: false };
    case 'squire':
      return { ...base, tunic: kingdomColor, pants: '#4a4e54', head: 'cap', headColor: '#4a4e54', tool: 'sword' };
    case 'pikeman':
      return { ...base, tunic: shade(kingdomColor, 0.9), pants: '#4a4e54', head: 'helmet', headColor: '#8a929a', tool: 'pike' };
    case 'hermit':
      return { ...base, tunic: '#6a6a5a', pants: '#5a5a4a', robe: true, hairStyle: 'long', hair: '#e8e4d8', beard: true, head: 'wizard', headColor: '#5a5a6a', tool: 'staff', hunched: true };
    case 'merchant':
      return { ...base, tunic: '#7a3a5a', pants: '#4a3a3a', head: 'tophat', headColor: '#3a2a3a', tool: 'pack', beard: true };
    case 'banker':
      return { ...base, tunic: '#3a4a6a', pants: '#2a2a3a', head: 'tophat', headColor: '#1e1e28', tool: 'coinbag' };
    case 'child':
      return {
        ...base,
        child: true,
        beard: false,
        tunic: r.pick(['#c84a3a', '#4a7ac8', '#d8b040', '#6aa048', '#c878a8']),
        pants: r.pick(['#5a4432', '#3a4a6a', '#6a5a3a']),
        hairStyle: r.pick(['short', 'messy', 'long'] as const),
      };
    case 'bard':
      return { ...base, tunic: r.pick(['#a8323a', '#3a6a8a', '#6a3a8a']), pants: '#3a2a3a', head: 'feather', headColor: r.pick(['#2a4a3a', '#6a2a3a', '#3a3a6a']), tool: 'lute', beard: r.chance(0.5) };
    case 'ghost':
      return { ...base, tunic: '#bfe0f0', pants: '#a0c8e0', boots: '#a0c8e0', skin: '#d8f0ff', hair: '#b0d8f0', head: 'crown', headColor: '#e8f4ff', ghost: true, robe: true };
  }
}

const cache = new Map<string, Sprite[]>();

export function humanFrames(role: Role, variant: number, anim: HumanAnim, kingdomColor = '#a82a2a'): Sprite[] {
  const key = `${role}:${variant}:${anim}:${kingdomColor}`;
  let frames = cache.get(key);
  if (frames) return frames;
  const look = lookFor(role, variant, kingdomColor);
  const n = FRAMES[anim];
  frames = [];
  for (let i = 0; i < n; i++) {
    const [c, ctx] = makeCanvas(HUMAN_W, HUMAN_H);
    drawHuman(ctx, look, anim, i / n);
    if (look.ghost) {
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = 'rgba(200,235,255,0.55)';
      ctx.fillRect(0, 0, HUMAN_W, HUMAN_H);
    }
    frames.push({ img: c, w: HUMAN_W, h: HUMAN_H, ax: OX, ay: HUMAN_H });
  }
  cache.set(key, frames);
  return frames;
}

export const HUMAN_VARIANTS = 6;
