// Запросы о королевстве: где внешние стены, что внутри, где городской центр.

import type { World } from './world';
import type { Structure } from './structures/structure';
import { M } from './config';

export interface WallLike extends Structure {
  blocks: boolean;
  destroyed: boolean;
}

/** Все стены стороны, от центра наружу. */
export function wallsOnSide(w: World, side: -1 | 1): WallLike[] {
  const tc = townX(w);
  return w
    .all<Structure>('structure')
    .filter((s) => s.type === 'wall' && Math.sign(s.x - tc) === side)
    .sort((a, b) => Math.abs(a.x - tc) - Math.abs(b.x - tc)) as WallLike[];
}

/** Самая дальняя целая стена стороны. */
export function outerWall(w: World, side: -1 | 1): WallLike | null {
  const walls = wallsOnSide(w, side);
  for (let i = walls.length - 1; i >= 0; i--) if (walls[i].blocks) return walls[i];
  return null;
}

/**
 * Место для подвижной постройки (мастерская, знамёна) рядом с x: пока её тело
 * half задевает другую постройку, сдвигаемся за неё в сторону dir.
 */
export function clearSpot(w: World, self: Structure, x: number, half: number, dir: number): number {
  const all = w.all<Structure>('structure');
  for (let k = 0; k < 16; k++) {
    let hit: Structure | null = null;
    for (const s of all) {
      if (s !== self && s.solid > 0 && Math.abs(s.x - x) < s.solid + half + 2) {
        hit = s;
        break;
      }
    }
    if (!hit) return x;
    x = hit.x + dir * (hit.solid + half + 3);
  }
  return x;
}

export function townX(w: World): number {
  return w.cache.townX;
}

/** Граница королевства со стороны side: внешняя стена или окрестности костра. */
export function kingdomEdge(w: World, side: -1 | 1): number {
  const ow = outerWall(w, side);
  if (ow) return ow.x;
  return townX(w) + side * 9 * M;
}

export function insideKingdom(w: World, x: number, margin = 0): boolean {
  return x > kingdomEdge(w, -1) + margin && x < kingdomEdge(w, 1) - margin;
}

/** Есть ли целая стена строго между a и b. */
export function wallBetween(w: World, a: number, b: number): WallLike | null {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  let best: WallLike | null = null;
  let bd = Infinity;
  for (const s of w.all<Structure>('structure')) {
    if (s.type !== 'wall') continue;
    const wl = s as WallLike;
    if (!wl.blocks) continue;
    if (s.x > lo && s.x < hi) {
      const d = Math.abs(s.x - a);
      if (d < bd) {
        bd = d;
        best = wl;
      }
    }
  }
  return best;
}

export function sideOf(w: World, x: number): -1 | 1 {
  return x < townX(w) ? -1 : 1;
}
