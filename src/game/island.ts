// Генерация острова: город посередине, стены и башни на местах-кучах,
// лес с полянами, лагеря бродяг, сундуки, порталы, утёс и дальняя пристань.

import { World, type CampaignMeta } from './world';
import { Rng } from '../engine/rng';
import { ISLANDS, M } from './config';
import { attachTerrain } from './terrain';
import { TownCenter } from './structures/town';
import { Wall, Tower } from './structures/defense';
import { Tree, Camp, Chest, Rock, BerryBush, IslandEdge } from './structures/nature';
import { Portal } from './structures/portal';
import { Person } from './entities/person';
import { Coin } from './entities/pickups';
import { Director } from './director';
import { installCritters } from './critters';
import {
  installTownSystem,
  installCampSystem,
  installDefenseSystem,
  installWildlife,
  installTerrainGrowth,
  installCrownPickup,
  installBells,
} from './systems';
import type { TreeKind } from '../render/treegen';
import { HUMAN_VARIANTS } from '../art/humans';
import { Farm } from './structures/farm';
import { MerchantHut, Merchant } from './structures/economy';
import { CentralDock, FarDock } from './structures/boat';
import { Mine, Statue, MountSpot, DogTrap, SquadBanner, SiegeWorkshop, Teleport, CitizenHouse } from './structures/special';
import { HermitHut, HERMITS, type HermitKind } from './structures/hermits';
import { BombBanner, Nest } from './structures/cave';
import { Boar, Dog } from './entities/npc';
import { installAbilities } from './abilities';
import type { MountId } from './mounts';
import type { StatueKind } from '../art/buildings';
import type { Monarch } from './entities/monarch';
import type { Structure } from './structures/structure';

export interface IslandLayout {
  /** Места под стены (в пикселях от центра). */
  walls: number[];
  towers: number[];
  clearings: Array<[number, number]>;
  beachSide: -1 | 1;
  centralDock: number;
  farDock: number;
}

export interface GenerateOptions {
  meta?: CampaignMeta;
  /** Новое правление: монарх въезжает слева к костру с монетами по пути. */
  newReign?: boolean;
  /** Разрушенные порталы (сохраняются между правлениями), по индексу. */
  destroyedPortals?: Set<string>;
  /** Уже открытые сундуки с самоцветами (сохраняются между правлениями). */
  openedChests?: Set<string>;
}

export function generateIsland(campaignSeed: number, index: number, opts: GenerateOptions = {}): World {
  const cfg = ISLANDS[index - 1];
  const L = cfg.half * M;
  const seed = (campaignSeed * 7919 + index * 104729) >>> 0;
  const rng = new Rng(seed);
  const beachSide = rng.sign() as -1 | 1;
  const cliffSide = -beachSide as -1 | 1;
  const w = new World({ index, seed, left: -L, right: L, beachSide, tech: 0 });
  if (opts.meta) w.meta = opts.meta;
  attachTerrain(w);
  w.cache.townX = 0;

  const occupied: Array<[number, number]> = [];
  const free = (x: number, r: number) => !occupied.some(([a, b]) => x + r > a && x - r < b);
  const occupy = (x: number, r: number) => occupied.push([x - r, x + r]);

  // ——— Город ———
  const tc = w.addNow(new TownCenter(0, 0));
  occupy(0, 18 * M);

  // ——— Пристани ———
  const centralDock = beachSide * 27 * M;
  const farDock = beachSide * (L - 6 * M);

  // ——— Места под стены и башни ———
  const wallSpots: number[] = [];
  const towerSpots: number[] = [];
  for (const side of [-1, 1] as const) {
    let d = rng.range(13, 15);
    let k = 0;
    while (d < cfg.half * 0.74) {
      const x = side * d * M;
      if (side === beachSide && Math.abs(x - centralDock) < 5 * M) {
        d += 6;
        continue;
      }
      wallSpots.push(x);
      occupy(x, 1.5 * M);
      // Башня между этой и следующей стеной — через одну.
      if (k % 2 === 0) {
        const tx = side * (d + rng.range(6, 8)) * M;
        if (!(side === beachSide && Math.abs(tx - centralDock) < 6 * M)) {
          towerSpots.push(tx);
          occupy(tx, 1.4 * M);
        }
      }
      d += rng.range(13, 21);
      k++;
    }
  }
  for (const x of wallSpots) w.addNow(new Wall(x, 0));
  for (const x of towerSpots) w.addNow(new Tower(x, 0));

  // ——— Порталы ———
  const portalKey = (kind: string, n: number) => `${index}:${kind}:${n}`;
  const destroyed = opts.destroyedPortals ?? new Set<string>();
  let pn = 0;
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < cfg.smallPortals; i++) {
      const t = cfg.smallPortals === 1 ? 0.62 : 0.5 + (0.3 * i) / (cfg.smallPortals - 1);
      const x = side * (t * cfg.half + rng.range(-4, 4)) * M;
      const p = w.addNow(new Portal(x, 'small', side));
      if (destroyed.has(portalKey('small', pn))) {
        p.destroyed = true;
        p.hp = 0;
      }
      (p as Portal & { key: string }).key = portalKey('small', pn++);
      occupy(x, 4 * M);
    }
  }
  const dockPortal = w.addNow(new Portal(beachSide * (L - 24 * M), 'dock', beachSide));
  (dockPortal as Portal & { key: string }).key = portalKey('dock', 0);
  if (destroyed.has(portalKey('dock', 0))) {
    dockPortal.destroyed = true;
    dockPortal.hp = 0;
  }
  occupy(dockPortal.x, 5 * M);
  const cliffPortal = w.addNow(new Portal(cliffSide * (L - 13 * M), 'cliff', cliffSide));
  (cliffPortal as Portal & { key: string }).key = portalKey('cliff', 0);
  occupy(cliffPortal.x, 14 * M);
  occupy(centralDock, 5 * M);
  occupy(farDock, 8 * M);

  // ——— Поляны (равнины) и лес ———
  const clearings: Array<[number, number]> = [[-24 * M, 24 * M]];
  for (const side of [-1, 1] as const) {
    const n = rng.int(1, 2);
    for (let i = 0; i < n; i++) {
      const c = side * rng.range(0.32, 0.85) * cfg.half * M;
      const half = rng.range(5, 10) * M;
      clearings.push([c - half, c + half]);
    }
  }
  clearings.push([farDock - 12 * M, farDock + 12 * M]);
  const inClearing = (x: number) => clearings.some(([a, b]) => x > a && x < b);

  // ——— Лагеря бродяг (только в лесу) ———
  const campXs: number[] = [];
  if (index === 1) campXs.push(36 * M);
  let tries = 0;
  while (campXs.length < cfg.camps && tries++ < 200) {
    const side = rng.sign();
    const x = side * rng.range(0.28, 0.8) * cfg.half * M;
    if (inClearing(x) || !free(x, 4 * M) || campXs.some((c) => Math.abs(c - x) < 18 * M)) continue;
    campXs.push(x);
  }
  for (const x of campXs) occupy(x, 4 * M);

  // Места под фермы — ручьи на полянах (колодец с полями занимает ~±4 м).
  const farmSpot = (side: number, r: number): number | null => {
    // Все свободные места на полосе 24–100 м от города; ближние — вероятнее.
    const spots: number[] = [];
    for (let d = 24; d <= Math.min(100, cfg.half * 0.65); d += 0.5) if (free(side * d * M, r * M)) spots.push(side * d * M);
    if (!spots.length) return null;
    return spots[Math.floor(Math.pow(rng.next(), 1.6) * spots.length)];
  };
  for (let i = 0; i < 2 + (index > 2 ? 1 : 0); i++) {
    const side = i % 2 === 0 ? -beachSide : beachSide;
    const x = farmSpot(side, 4.6) ?? farmSpot(-side, 4.6) ?? farmSpot(side, 3.8) ?? farmSpot(-side, 3.8);
    if (x === null) continue;
    occupy(x, 4.6 * M);
    w.addNow(new Farm(x));
    // Поляна вокруг — лес здесь не растёт.
    clearings.push([x - 7 * M, x + 7 * M]);
  }

  // Деревья.
  const kinds: TreeKind[] = ['pine', 'pine', 'tallpine', 'oak', 'oak', 'maple', 'birch'];
  for (const side of [-1, 1] as const) {
    let d = 24 * M + rng.range(0, 2 * M);
    const end = L - 10 * M;
    while (d < end) {
      const x = side * d;
      const nearCamp = campXs.some((c) => Math.abs(c - x) < 3 * M);
      const nearPortal = Math.abs(x - cliffPortal.x) < 16 * M || Math.abs(x - dockPortal.x) < 4 * M;
      if (!inClearing(x) && !nearCamp && !nearPortal && !wallSpots.some((ws) => Math.abs(ws - x) < 1.2 * M) && !towerSpots.some((t) => Math.abs(t - x) < 1.2 * M)) {
        const kind = rng.pick(kinds);
        const h = kind === 'pine' ? rng.int(84, 138) : kind === 'tallpine' ? rng.int(118, 160) : kind === 'birch' ? rng.int(74, 106) : kind === 'maple' ? rng.int(64, 94) : rng.int(70, 108);
        w.addNow(new Tree(x, kind, rng.int(0, 11), h));
      }
      d += rng.range(2.2, 4) * M;
    }
  }

  for (const x of campXs) {
    const camp = w.addNow(new Camp(x));
    for (let i = 0; i < 2; i++) {
      const p = w.addNow(new Person(x + rng.range(-10, 10), 'vagrant', rng.int(0, HUMAN_VARIANTS - 1)));
      p.homeCamp = camp.id;
      camp.vagrants.push(p.id);
    }
  }

  // Два бродяги у стоянки.
  for (let i = 0; i < 2; i++) w.addNow(new Person(rng.range(-6, 6) * M, 'vagrant', rng.int(0, HUMAN_VARIANTS - 1)));

  // ——— Сундуки ———
  const chestSpot = () => {
    for (let t = 0; t < 60; t++) {
      const x = rng.sign() * rng.range(0.3, 0.9) * cfg.half * M;
      if (free(x, 2 * M)) {
        occupy(x, 2 * M);
        return x;
      }
    }
    return rng.range(-L * 0.5, L * 0.5);
  };
  for (let i = 0; i < 2; i++) w.addNow(new Chest(chestSpot(), false, 12));
  let gems = cfg.gems;
  let gn = 0;
  while (gems > 0) {
    const n = Math.min(gems, gems === 5 ? 3 : rng.int(2, 4));
    const ch = w.addNow(new Chest(chestSpot(), true, n));
    ch.key = `${index}:gems:${gn++}`;
    if (opts.openedChests?.has(ch.key)) ch.opened = true;
    gems -= n;
  }

  // ——— Ягодные кусты и камни ———
  for (let i = 0; i < 4; i++) {
    const x = rng.sign() * rng.range(0.25, 0.7) * cfg.half * M;
    if (free(x, 2 * M)) {
      occupy(x, 1.5 * M);
      w.addNow(new BerryBush(x));
    }
  }
  for (let i = 0; i < 10; i++) {
    const x = rng.range(-L + 30, L - 30);
    if (free(x, M)) w.addNow(new Rock(x, rng.int(0, 3)));
  }

  // ——— Особые объекты острова ———
  const forestSpot = (minFrac: number, maxFrac: number, r = 3 * M): number => {
    for (let t2 = 0; t2 < 80; t2++) {
      const x = rng.sign() * rng.range(minFrac, maxFrac) * cfg.half * M;
      if (free(x, r)) {
        occupy(x, r);
        return x;
      }
    }
    const x = rng.sign() * rng.range(minFrac, maxFrac) * cfg.half * M;
    occupy(x, r);
    return x;
  };
  const clearTreesAround = (x: number, r: number) => {
    for (const tr of w.all<Structure>('structure')) {
      if (tr.type === 'tree' && Math.abs(tr.x - x) < r) {
        tr.dead = true;
        w.terrain.addTree(tr.x, -1);
      }
    }
  };
  // Край острова со стороны моря.
  w.addNow(new IslandEdge(beachSide * (L - 2 * M), beachSide));
  // Пристани и лодка.
  w.addNow(new CentralDock(centralDock, index));
  w.addNow(new FarDock(farDock));
  // Торговец (острова 1–2).
  if (cfg.merchant) {
    const hx = -beachSide * rng.range(40, 60) * M;
    occupy(hx, 3 * M);
    const hut = w.addNow(new MerchantHut(hx));
    w.addNow(new Merchant(hx, hut.id, 1));
  }
  // Технологии.
  if (index === 2) w.addNow(new Mine(forestSpot(0.55, 0.8, 5 * M), 'stone'));
  if (index === 4) w.addNow(new Mine(forestSpot(0.55, 0.8, 5 * M), 'iron'));
  if (index === 2) w.addNow(new DogTrap(forestSpot(0.3, 0.6)));
  // Статуи, отшельники и скакуны каждого острова.
  const statues: Record<number, StatueKind[]> = { 1: ['archer'], 2: ['scythe'], 3: ['builder'], 5: ['knight'] };
  for (const k of statues[index] ?? []) w.addNow(new Statue(forestSpot(0.3, 0.7), k));
  for (const [kind, h] of Object.entries(HERMITS)) if (h.island === index) w.addNow(new HermitHut(forestSpot(0.35, 0.75), kind as HermitKind));
  const mounts: Record<number, MountId[]> = { 1: ['griffin'], 2: ['stag'], 3: ['warhorse', 'draft'], 4: ['bear', 'lizard'], 5: ['unicorn'] };
  for (const id of mounts[index] ?? []) {
    const x = forestSpot(0.3, 0.72, 4 * M);
    clearTreesAround(x, 3 * M);
    w.addNow(new MountSpot(x, id));
  }
  // Кабан (зимой) — логово в лесу.
  w.addNow(new Boar(forestSpot(0.45, 0.8)));
  // Знамёна атаки, осадные мастерские, знамя бомбы.
  for (const side of [-1, 1] as const) {
    w.addNow(new SquadBanner(side));
    w.addNow(new SiegeWorkshop(side));
  }
  w.addNow(new BombBanner(cliffSide));
  // Гнёзда пещеры у утёса (опасны, только пока идёт бомба).
  for (let i = 0; i < 5; i++) w.addNow(new Nest(cliffSide * (L - (22 + i * 9) * M)));

  // ——— Трава на равнинах ———
  const t = w.terrain;
  for (let i = 0; i < t.cells; i++) {
    const x = t.cellX(i);
    if (!t.forest[i] && !t.blocked[i] && Math.abs(x) > 6 * M) t.grass[i] = rng.range(0.6, 1);
  }
  t.dailyGrowth('spring', 0, seed);
  t.dailyGrowth('summer', 1, seed);

  // ——— Монеты по пути к костру (новое правление) ———
  if (opts.newReign) {
    for (let i = 0; i < 6; i++) {
      const c = new Coin((-30 + i * 4 + rng.range(-1, 1)) * M, 0, 0, 0);
      c.settled = true;
      c.age = -9999;
      w.addNow(c);
    }
  }

  installIslandSystems(w, index);
  w.layout = { walls: wallSpots, towers: towerSpots, clearings, beachSide, centralDock, farDock };
  void tc;
  return w;
}

/** Системы острова — общие для нового и загруженного острова. */
export function installIslandSystems(w: World, index: number): void {
  installTownSystem(w);
  installCampSystem(w);
  installDefenseSystem(w);
  installWildlife(w);
  installTerrainGrowth(w);
  installCrownPickup(w);
  installBells(w);
  installAbilities(w);
  installExtras(w, index);
  installCritters(w);
  const director = new Director(w);
  w.systems.push(director);
  w.director = director;
}

/** Пустой мир острова с теми же размерами (для загрузки сохранения). */
export function emptyIsland(campaignSeed: number, index: number, beachSide: -1 | 1, meta: CampaignMeta): World {
  const cfg = ISLANDS[index - 1];
  const L = cfg.half * M;
  const seed = (campaignSeed * 7919 + index * 104729) >>> 0;
  const w = new World({ index, seed, left: -L, right: L, beachSide, tech: 0 });
  w.meta = meta;
  attachTerrain(w);
  w.cache.townX = 0;
  return w;
}

/** Реакции острова на события: телепорты на руинах, дома горожан, собака. */
function installExtras(w: World, index: number): void {
  w.on('portalDestroyed', (p: Portal) => {
    if (p.kind !== 'cliff') w.add(new Teleport(p.x));
  });
  w.on('campGone', (c: Structure) => w.add(new CitizenHouse(c.x)));
  w.on('dogFreed', (_t: Structure, m: Monarch) => w.add(new Dog(m.x - m.facing * 20, m.id)));
  w.time.onDawn.push((day) => {
    for (const s of w.all<Structure>('structure')) (s as unknown as { dawn?: (d: number) => void }).dawn?.(day);
    w.hornCall = null;
  });
  void index;
}
