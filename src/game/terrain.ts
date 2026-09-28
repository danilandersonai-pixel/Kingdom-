// Рельеф острова по клеткам в 1 м: лес или равнина, трава (для выпаса
// и кроликов), занятость постройками. Лес задаётся живыми деревьями.

import { M, TIME } from './config';
import type { World } from './world';
import type { Season } from '../render/atmosphere';
import { hash2 } from '../engine/math';

export class Terrain {
  readonly left: number;
  readonly cells: number;
  /** Сколько деревьев покрывает клетку. */
  readonly forest: Uint8Array;
  /** Высота травы 0..1. */
  readonly grass: Float32Array;
  /** Клетка занята постройкой, стеной или полем — трава не растёт. */
  readonly blocked: Uint8Array;
  /** Высокая трава — «кроличий куст». */
  readonly bush: Uint8Array;

  constructor(left: number, right: number) {
    this.left = left;
    this.cells = Math.ceil((right - left) / M) + 1;
    this.forest = new Uint8Array(this.cells);
    this.grass = new Float32Array(this.cells);
    this.blocked = new Uint8Array(this.cells);
    this.bush = new Uint8Array(this.cells);
  }

  cell(x: number): number {
    return Math.max(0, Math.min(this.cells - 1, Math.floor((x - this.left) / M)));
  }

  cellX(i: number): number {
    return this.left + (i + 0.5) * M;
  }

  isForest(x: number): boolean {
    return this.forest[this.cell(x)] > 0;
  }

  /** Дерево покрывает ±3 м вокруг себя. */
  addTree(x: number, delta: 1 | -1): void {
    const c = this.cell(x);
    for (let i = c - 3; i <= c + 3; i++) {
      if (i < 0 || i >= this.cells) continue;
      this.forest[i] = Math.max(0, this.forest[i] + delta);
    }
  }

  block(x0: number, x1: number, on: boolean): void {
    for (let i = this.cell(x0); i <= this.cell(x1); i++) {
      this.blocked[i] = on ? Math.min(255, this.blocked[i] + 1) : Math.max(0, this.blocked[i] - 1);
      if (on) {
        this.grass[i] = 0;
        this.bush[i] = 0;
      }
    }
  }

  canGraze(x: number, season: Season): boolean {
    if (season === 'winter') return false;
    const i = this.cell(x);
    return !this.forest[i] && this.grass[i] > 0.35;
  }

  eat(x: number, amount: number): void {
    const i = this.cell(x);
    this.grass[i] = Math.max(0, this.grass[i] - amount);
  }

  /** Раз в день: трава появляется весной, разрастается летом и осенью, гибнет зимой. */
  dailyGrowth(season: Season, day: number, seed: number): void {
    if (season === 'winter') {
      this.grass.fill(0);
      this.bush.fill(0);
      return;
    }
    const next = new Float32Array(this.grass);
    for (let i = 0; i < this.cells; i++) {
      if (this.forest[i] || this.blocked[i]) {
        next[i] = 0;
        continue;
      }
      const g = this.grass[i];
      if (season === 'spring' && hash2(i, day + seed) < 0.35) next[i] = Math.min(1, g + 0.6);
      const nb = Math.max(this.grass[i - 1] ?? 0, this.grass[i + 1] ?? 0);
      if (nb > 0.5 && hash2(i, day * 7 + seed) < 0.5) next[i] = Math.min(1, Math.max(g, nb * 0.8) + 0.2);
      else next[i] = Math.min(1, g + (g > 0 ? 0.25 : 0));
    }
    this.grass.set(next);
    // Высокая трава на крупных лужайках — там живут кролики.
    for (let i = 2; i < this.cells - 2; i++) {
      const lush = this.grass[i - 1] > 0.7 && this.grass[i] > 0.8 && this.grass[i + 1] > 0.7;
      if (lush && !this.bush[i] && hash2(i, day * 13 + seed) < 0.06) this.bush[i] = 1;
      if (!lush) this.bush[i] = 0;
    }
    void TIME;
  }

  /** Расстояние до ближайшей клетки леса (для солнца: Жадность в лесу не горит). */
  isOpen(x: number): boolean {
    return !this.isForest(x);
  }

  serialize(): { g: number[]; b: number[] } {
    return { g: Array.from(this.grass, (v) => Math.round(v * 100)), b: Array.from(this.bush) };
  }

  restore(o: { g: number[]; b: number[] }): void {
    o.g.forEach((v, i) => {
      if (i < this.cells) this.grass[i] = v / 100;
    });
    o.b.forEach((v, i) => {
      if (i < this.cells) this.bush[i] = v;
    });
  }
}

export function attachTerrain(w: World): Terrain {
  const t = new Terrain(w.island.left, w.island.right);
  w.terrain = t;
  return t;
}
