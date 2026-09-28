// Животные: кролики, олени, собака, птицы, рыба.

import { makeCanvas, type Sprite } from '../engine/sprite';
import { ellipse, limb, line, poly, px, rect } from './px';

export type AnimalKind = 'rabbit' | 'deer' | 'stag' | 'dog' | 'bird' | 'fish';
export type AnimalAnim = 'idle' | 'move' | 'graze' | 'fly';

function rabbit(ctx: CanvasRenderingContext2D, anim: AnimalAnim, t: number): void {
  const fur = '#8a7a66';
  const dark = '#6a5a4a';
  const hop = anim === 'move' ? Math.sin(t * Math.PI) * 3 : 0;
  const stretch = anim === 'move' ? Math.sin(t * Math.PI) : 0;
  const base = 9 - hop;
  ellipse(ctx, 5, base - 2, 3 + stretch, 2, fur);
  ellipse(ctx, 8 + stretch, base - 3.5, 1.6, 1.6, fur);
  // Уши.
  line(ctx, 8 + stretch, base - 5, 7 + stretch, base - 8 + (anim === 'graze' ? 2 : 0), fur);
  line(ctx, 9 + stretch, base - 5, 9 + stretch, base - 7.5 + (anim === 'graze' ? 2 : 0), dark);
  px(ctx, 9 + stretch, base - 4, '#1a1010');
  // Хвостик.
  px(ctx, 2, base - 3, '#f0ece4');
  // Лапы.
  rect(ctx, 3 - stretch, base - 1, 2, 1, dark);
  rect(ctx, 7 + stretch * 2, base - 1, 1, 1, dark);
}

function deer(ctx: CanvasRenderingContext2D, anim: AnimalAnim, t: number, stag: boolean): void {
  const fur = '#9a6a42';
  const dark = '#6a4428';
  const light = '#c89a6a';
  const s = Math.sin(t * Math.PI * 2);
  const run = anim === 'move';
  const base = 22;
  const by = base - 10 - (run ? Math.abs(s) * 1.2 : 0);
  // Ноги.
  const legs: Array<[number, number]> = [[-5, 0], [-4, 0.5], [4, 0.25], [5, 0.75]];
  for (const [lx, ph] of legs) {
    const a = run ? Math.sin((t + ph) * Math.PI * 2) * 0.6 : 0;
    const fx = lx + Math.sin(a) * 8;
    limb(ctx, 14 + lx, by + 1, 14 + fx, base, 1.5, 1.2, lx === -4 || lx === 5 ? fur : dark);
  }
  ellipse(ctx, 14, by - 1, 7, 3, fur);
  line(ctx, 8, by - 3, 19, by - 3, light);
  px(ctx, 7, by - 2, '#f0ece4');
  // Шея и голова.
  const graze = anim === 'graze';
  const hx = graze ? 22 : 21;
  const hy = graze ? base - 3 : by - 8;
  limb(ctx, 19, by - 2, hx, hy + 1, 3, 2, fur);
  limb(ctx, hx - 1, hy, hx + 3, hy + 1.5, 2.6, 1.6, fur);
  px(ctx, hx + 1, hy - 0.5, '#1a1010');
  px(ctx, hx - 1, hy - 2, dark);
  if (stag) {
    const ax = hx - 1;
    const ay = hy - 2;
    line(ctx, ax, ay, ax - 2, ay - 5, '#d8c8a8');
    line(ctx, ax - 2, ay - 5, ax - 4, ay - 7, '#d8c8a8');
    line(ctx, ax - 1, ay - 3, ax + 1, ay - 6, '#d8c8a8');
    line(ctx, ax - 3, ay - 6, ax - 2, ay - 8, '#d8c8a8');
  }
}

function dog(ctx: CanvasRenderingContext2D, anim: AnimalAnim, t: number): void {
  const fur = '#b08a5a';
  const dark = '#7a5a3a';
  const s = Math.sin(t * Math.PI * 2);
  const run = anim === 'move';
  const base = 13;
  const by = base - 5 - (run ? Math.abs(s) : 0);
  for (const [lx, ph] of [[-3, 0], [-2, 0.5], [3, 0.25], [4, 0.75]] as Array<[number, number]>) {
    const a = run ? Math.sin((t + ph) * Math.PI * 2) * 0.7 : 0;
    line(ctx, 9 + lx, by + 1, 9 + lx + Math.sin(a) * 3, base, lx === -2 || lx === 4 ? fur : dark);
  }
  ellipse(ctx, 9, by - 0.5, 5, 2.4, fur);
  line(ctx, 5, by - 2, 12, by - 2, '#d0aa7a');
  // Хвост виляет.
  line(ctx, 4, by - 1, 2, by - 4 - (anim === 'idle' ? s * 1.5 : 1), fur);
  // Голова.
  ellipse(ctx, 14, by - 3, 2.2, 2, fur);
  rect(ctx, 15, by - 3, 3, 2, fur);
  px(ctx, 17, by - 3, '#1a1010');
  px(ctx, 14, by - 4, '#1a1010');
  poly(ctx, [[12, by - 4], [13, by - 7], [14, by - 4]], dark);
}

/** Далёкая птица: изогнутые крылья «v» / «ᴧ» без палочки тела. */
function bird(ctx: CanvasRenderingContext2D, _anim: AnimalAnim, t: number): void {
  const s = Math.sin(t * Math.PI * 2);
  const c = '#2a2630';
  const mid = Math.round(3 + s * 1.2);
  const tip = Math.round(3 + s * 2.4);
  px(ctx, 3, 3, c);
  line(ctx, 2, 3, 1, mid, c);
  line(ctx, 1, mid, 0, tip, c);
  line(ctx, 4, 3, 5, mid, c);
  line(ctx, 5, mid, 6, tip, c);
}

function fish(ctx: CanvasRenderingContext2D): void {
  ellipse(ctx, 4, 2, 3, 1.4, '#a8b8c0');
  poly(ctx, [[0, 0], [2, 2], [0, 4]], '#8898a0');
  px(ctx, 6, 2, '#1a1a20');
}

const SIZE: Record<AnimalKind, [number, number]> = {
  rabbit: [12, 10],
  deer: [28, 23],
  stag: [28, 23],
  dog: [20, 14],
  bird: [7, 7],
  fish: [8, 5],
};

const cache = new Map<string, Sprite[]>();

export function animalFrames(kind: AnimalKind, anim: AnimalAnim): Sprite[] {
  const key = `${kind}:${anim}`;
  let frames = cache.get(key);
  if (frames) return frames;
  const [W, H] = SIZE[kind];
  const n = anim === 'idle' ? 2 : 4;
  frames = [];
  for (let i = 0; i < n; i++) {
    const [c, ctx] = makeCanvas(W, H);
    const t = i / n;
    if (kind === 'rabbit') rabbit(ctx, anim, t);
    else if (kind === 'deer') deer(ctx, anim, t, false);
    else if (kind === 'stag') deer(ctx, anim, t, true);
    else if (kind === 'dog') dog(ctx, anim, t);
    else if (kind === 'bird') bird(ctx, anim, t);
    else fish(ctx);
    frames.push({ img: c, w: W, h: H, ax: Math.floor(W / 2), ay: H });
  }
  cache.set(key, frames);
  return frames;
}
