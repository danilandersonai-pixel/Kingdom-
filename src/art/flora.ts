// Палитры деревьев и кустов игрового слоя по породам и временам года.
// Осенью у каждого дерева свой наряд (рыжий дуб, алый клён, жёлтая берёза),
// весной часть деревьев цветёт, зимой хвоя тёмная под снежными шапками.

import { Rng } from '../engine/rng';
import type { Sprite } from '../engine/sprite';
import type { Season } from '../render/atmosphere';
import { addBlossom, makeBush, makeTree, paintTree, type TreeKind, type TreePalette } from '../render/treegen';

const SNOW = ['#8e9cb8', '#cdd6e6', '#f4f7fc'] as const;

const BARK: Record<string, readonly string[]> = {
  oak: ['#1a120d', '#2c1f16', '#44311f', '#5e452c'],
  pine: ['#170f0b', '#281a12', '#3b281a', '#523a26'],
  tallpine: ['#24120b', '#472414', '#6a381e', '#8e522c'],
  birch: ['#1c1a1a', '#8c877e', '#d6d1c4', '#f3f0e6'],
  dead: ['#1a1613', '#2c261f', '#453c33', '#62564a'],
};

type Leaves = readonly string[];

// Лето.
const OAK_SUMMER: Leaves[] = [
  ['#15261b', '#213b25', '#2f542f', '#437036', '#66913f'],
  ['#17281a', '#243f24', '#34592d', '#4b7735', '#72993f'],
];
const MAPLE_SUMMER: Leaves = ['#15271a', '#223f24', '#32592c', '#4a7934', '#74a043'];
const BIRCH_SUMMER: Leaves = ['#1c311e', '#2c4a28', '#426b33', '#5f8f3b', '#90b852'];
const PINE_SUMMER: Leaves = ['#0d1c17', '#152e1e', '#1e4027', '#2d5731', '#4a773e'];
const TALLPINE_SUMMER: Leaves = ['#0f1f19', '#183120', '#23452a', '#355e34', '#567e44'];

// Весна: свежая, светлая зелень.
const OAK_SPRING: Leaves = ['#182e1e', '#264628', '#386733', '#538d3c', '#84b64e'];
const BIRCH_SPRING: Leaves = ['#1e361e', '#305826', '#487e32', '#68a63e', '#a2cf5e'];
const PINE_SPRING: Leaves = ['#0e1e18', '#17321f', '#214629', '#315f34', '#58884a'];

// Осень.
const AUTUMN_ORANGE: Leaves = ['#2c180d', '#552a11', '#884417', '#b66820', '#e19f3e'];
const AUTUMN_OLIVE: Leaves = ['#2b260f', '#4b4115', '#76661d', '#a38c27', '#d4bc4c'];
const AUTUMN_RED: Leaves = ['#290d0b', '#541511', '#8c2317', '#bd3c1f', '#ea7832'];
const AUTUMN_YELLOW: Leaves = ['#3b2e0f', '#6a5315', '#a4821d', '#d0ab2e', '#f2d863'];
const AUTUMN_BUSH: Leaves = ['#2a1a0e', '#4e2e12', '#7a4a1a', '#a46a24', '#cf9640'];

// Зима: хвоя темнее и синее.
const PINE_WINTER: Leaves = ['#0b1816', '#122722', '#1b382d', '#294c3c', '#3d604c'];

const BLOSSOM_PINK = ['#b86a86', '#e8a8bc', '#fbe2ea'] as const;
const BLOSSOM_WHITE = ['#b8b0b0', '#ece6e2', '#fffaf6'] as const;

function leavesFor(kind: TreeKind, season: Season, variant: number): Leaves {
  const pick = <T,>(arr: readonly T[]) => arr[variant % arr.length];
  switch (kind) {
    case 'pine':
      return season === 'winter' ? PINE_WINTER : season === 'spring' ? PINE_SPRING : PINE_SUMMER;
    case 'tallpine':
      return season === 'winter' ? PINE_WINTER : TALLPINE_SUMMER;
    case 'birch':
      return season === 'autumn' ? AUTUMN_YELLOW : season === 'spring' ? BIRCH_SPRING : BIRCH_SUMMER;
    case 'maple':
      return season === 'autumn' ? (variant % 4 === 3 ? AUTUMN_ORANGE : AUTUMN_RED) : season === 'spring' ? OAK_SPRING : MAPLE_SUMMER;
    case 'bush':
      return season === 'autumn' ? AUTUMN_BUSH : season === 'spring' ? OAK_SPRING : OAK_SUMMER[0];
    default:
      if (season === 'autumn') return pick([AUTUMN_ORANGE, AUTUMN_OLIVE, AUTUMN_ORANGE, AUTUMN_YELLOW]);
      if (season === 'spring') return OAK_SPRING;
      return pick(OAK_SUMMER);
  }
}

export function treePalette(kind: TreeKind, season: Season, variant: number): TreePalette {
  const bark = BARK[kind === 'maple' || kind === 'bare' || kind === 'bush' ? 'oak' : kind] ?? BARK.oak;
  return {
    bark,
    leaf: leavesFor(kind, season, variant),
    snow: SNOW,
    accent: variant % 2 ? BLOSSOM_WHITE : BLOSSOM_PINK,
  };
}

// Кэш с вытеснением давно не нужных спрайтов (порядок Map — порядок использования).
// Раньше кэш очищался целиком при смене сезона в ключе — ягодник («лето»)
// и деревья («весна») сбрасывали его друг другу каждый кадр.
const cache = new Map<string, Sprite>();
const CACHE_MAX = 420;

function cached(key: string): Sprite | undefined {
  const s = cache.get(key);
  if (s) {
    cache.delete(key);
    cache.set(key, s);
  }
  return s;
}

function remember(key: string, s: Sprite): void {
  cache.set(key, s);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}

/** Спрайт дерева игрового слоя (кэшируется по породе, варианту, высоте и сезону). */
export function treeSprite(kind: TreeKind, variant: number, height: number, season: Season): Sprite {
  const key = `${kind}:${variant}:${height}:${season}`;
  let s = cached(key);
  if (s) return s;
  const rng = new Rng(variant * 7919 + height * 31 + kind.length * 101);
  const winter = season === 'winter';
  const leafless = winter && kind !== 'pine' && kind !== 'tallpine';
  const m = makeTree(kind, rng, height, winter, leafless);
  // Весной каждое третье лиственное дерево в цвету.
  if (season === 'spring' && (kind === 'oak' || kind === 'maple') && variant % 3 === 0) addBlossom(m, new Rng(variant + height), 0.05);
  const img = paintTree(m, treePalette(kind, season, variant));
  s = { img, w: m.w, h: m.h, ax: m.ax, ay: m.h };
  remember(key, s);
  return s;
}

/** Куст (для ягодника и декора). */
export function bushSprite(seed: number, width: number, height: number, season: Season): Sprite {
  const key = `bush:${seed}:${width}:${height}:${season}`;
  let s = cached(key);
  if (s) return s;
  const m = makeBush(new Rng(seed), width, height, season === 'winter');
  const img = paintTree(m, { bark: BARK.oak, leaf: season === 'winter' ? PINE_WINTER : leavesFor('bush', season, seed), snow: SNOW });
  s = { img, w: m.w, h: m.h, ax: m.ax, ay: m.h };
  remember(key, s);
  return s;
}
