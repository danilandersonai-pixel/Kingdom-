// Кампания «Европа»: 5 островов, переправа с командой, возвращение
// на пройденные острова (распад стен), наследник после потери короны.
// Сохраняется навсегда: открытое самоцветами, разрушенные порталы,
// взорванные пещеры, вклад у банкира, самоцветы у Хранителя.

import { World, defaultMeta, type CampaignMeta } from './world';
import { generateIsland } from './island';
import { Monarch } from './entities/monarch';
import { Person } from './entities/person';
import { Dog, Ghost } from './entities/npc';
import type { Structure } from './structures/structure';
import type { Portal } from './structures/portal';
import type { CentralDock, FarDock } from './structures/boat';
import type { Wall } from './structures/defense';
import type { Hermit } from './structures/hermits';
import { M } from './config';
import { KING, QUEEN, type RiderLook } from '../art/horse';
import { Rng } from '../engine/rng';
import { wallsOnSide } from './kingdom';

export interface Ruler {
  look: RiderLook;
  key: string;
}

const CAPES = ['#a82a2a', '#2a5aa0', '#3a7a3a', '#6a3a8a', '#b8862a', '#2a7a7a', '#8a2a5a'];
const TUNICS = ['#3a4a8a', '#5a3a7a', '#6a2a2a', '#2a5a4a', '#4a4a4a', '#7a5a2a'];
const SKINS = ['#e8b48a', '#f0c4a0', '#d8a078', '#b87a50', '#8a5a3a'];
const HAIRS = ['#6a3e22', '#c8a050', '#2a2a2a', '#a06a3a', '#d8d0c0'];

/** Случайная внешность монарха (пол, кожа, цвет плаща). */
export function randomRuler(seed: number): Ruler {
  const r = new Rng(seed * 2654435761);
  const queen = r.chance(0.5);
  const base = queen ? QUEEN : KING;
  const look: RiderLook = {
    ...base,
    beard: !queen && r.chance(0.7),
    skin: r.pick(SKINS),
    hair: r.pick(HAIRS),
    cape: r.pick(CAPES),
    tunic: r.pick(TUNICS),
  };
  return { look, key: `r${seed}` };
}

export interface ArrivalInfo {
  world: World;
  monarchs: Monarch[];
  firstVisit: boolean;
}

export class Campaign {
  seed: number;
  meta: CampaignMeta = defaultMeta();
  islands = new Map<number, { world: World; leftDay: number }>();
  current = 1;
  /** Самый дальний остров, до которого доплыли. */
  reached = 1;
  reign = 1;
  destroyedPortals = new Set<string>();
  caves = new Set<number>();
  ruler: Ruler;
  prevRuler: Ruler | null = null;
  totalDays = 0;
  onVictory: (() => void) | null = null;

  constructor(seed: number) {
    this.seed = seed;
    this.ruler = randomRuler(seed + 1);
  }

  /** Подписки на события мира, важные для всей кампании. */
  hook(w: World, index: number): void {
    w.meta = this.meta;
    w.on('portalDestroyed', (p: Portal & { key?: string }) => {
      if (p.key) this.destroyedPortals.add(p.key);
    });
    w.on('caveCleared', () => {
      this.caves.add(index);
      if (this.caves.size >= 5) this.onVictory?.();
    });
    if (this.caves.has(index)) w.caveCleared = true;
  }

  /** Новое правление: остров 1, монарх въезжает к костру. */
  startReign(): ArrivalInfo {
    this.islands.clear();
    this.current = 1;
    const w = generateIsland(this.seed, 1, { meta: this.meta, newReign: true, destroyedPortals: this.destroyedPortals });
    this.hook(w, 1);
    this.islands.set(1, { world: w, leftDay: 0 });
    const m = new Monarch(0, -34 * M, this.ruler.look);
    m.riderKey = this.ruler.key;
    m.facing = 1;
    w.addNow(m);
    if (this.reign === 1 || this.prevRuler) {
      const ghost = new Ghost(-24 * M, (this.prevRuler ?? randomRuler(this.seed + 999)).look);
      w.addNow(ghost);
    }
    return { world: w, monarchs: [m], firstVisit: true };
  }

  private rulerRolls = 0;

  /** Другой облик правителя: пока монарх не тронулся с места, «вниз» перебирает претендентов. */
  rerollRuler(): Ruler {
    this.rulerRolls++;
    this.ruler = randomRuler(this.seed + this.reign * 7 + this.rulerRolls * 131);
    return this.ruler;
  }

  /** Потеря короны: правление переходит к наследнику. */
  heir(): ArrivalInfo {
    this.prevRuler = this.ruler;
    this.reign++;
    this.ruler = randomRuler(this.seed + this.reign * 7);
    // Всё купленное за монеты снова заблокировано, благословения сняты.
    this.meta.tech = 0;
    this.meta.blessings.clear();
    this.reached = Math.max(1, this.reached);
    return this.startReign();
  }

  /** Отплыть на остров dest с монархами и командой. */
  sail(from: World, monarchs: Monarch[], dock: CentralDock, dest: number): ArrivalInfo {
    // Команда с лодки.
    const crew = from.all<Person>('person').filter((p) => dock.crew.includes(p.id) && !p.dead);
    const dogs = from.all<Dog>('npc').filter((d) => d instanceof Dog);
    const hermits = from.all<Structure>('structure').filter((s) => (s as Hermit).isHermit && (s as Hermit).state === 'riding') as Hermit[];
    for (const e of [...crew, ...dogs, ...hermits, ...monarchs]) from.detach(e);
    dock.stage = 'launched';
    dock.crew = [];
    this.islands.set(this.current, { world: from, leftDay: from.time.day });

    let entry = this.islands.get(dest);
    const firstVisit = !entry;
    let w: World;
    if (entry) {
      w = entry.world;
      this.applyDecay(w, from.time.day - entry.leftDay);
    } else {
      w = generateIsland(this.seed, dest, { meta: this.meta, destroyedPortals: this.destroyedPortals });
      this.hook(w, dest);
      entry = { world: w, leftDay: from.time.day };
      this.islands.set(dest, entry);
    }
    w.time.restore(from.time.serialize());
    this.current = dest;
    this.reached = Math.max(this.reached, dest);

    const far = w.all<Structure>('structure').find((s) => s.type === 'lighthouse') as FarDock | undefined;
    const arriveX = far ? far.x - w.island.beachSide * 6 * M : 0;
    // Без маяка лодка разбивается — на центральной пристани снова обломки.
    const cdock = w.all<Structure>('structure').find((s) => s.type === 'dock') as CentralDock | undefined;
    if (cdock) {
      if (far?.hasLighthouse) cdock.stage = 'launched';
      else if (firstVisit || cdock.stage === 'launched' || cdock.stage === 'crewed') {
        cdock.stage = 'wreck';
      }
    }
    monarchs.forEach((m, i) => {
      m.x = arriveX - w.island.beachSide * i * 20;
      m.facing = (-w.island.beachSide) as 1 | -1;
      m.payTarget = null;
      w.addNow(m);
    });
    crew.forEach((p, i) => {
      p.x = arriveX - w.island.beachSide * (30 + i * 6);
      p.boarding = 0;
      p.aboard = false;
      p.towerId = 0;
      p.attackTarget = 0;
      p.escort = 0;
      p.fieldFarm = 0;
      p.job = null;
      w.addNow(p);
    });
    for (const d of dogs) {
      d.x = arriveX;
      w.addNow(d);
    }
    for (const h of hermits) {
      h.x = arriveX;
      w.addNow(h);
    }
    w.cache.townX = 0;
    return { world: w, monarchs, firstVisit };
  }

  /** Распад: пока монарха нет, стены рушатся по одной в день — от внешних к внутренним. */
  applyDecay(w: World, days: number): void {
    if (days <= 0) return;
    let left = days;
    for (let round = 0; round < 20 && left > 0; round++) {
      for (const side of [-1, 1] as const) {
        const walls = (wallsOnSide(w, side) as unknown as Wall[]).filter((wl) => wl.blocks);
        const outer = walls[walls.length - 1];
        if (outer && left > 0) {
          outer.destroyed = true;
          outer.hp = 0;
          left--;
        }
      }
      if (!w.all<Wall>('structure').some((s) => s.type === 'wall' && s.blocks)) break;
    }
    for (const g of [...w.all('greed')]) w.detach(g);
  }

  serializeMeta(): object {
    return {
      seed: this.seed,
      current: this.current,
      reached: this.reached,
      reign: this.reign,
      destroyedPortals: [...this.destroyedPortals],
      caves: [...this.caves],
      meta: { ...this.meta, blessings: [...this.meta.blessings], gemUnlocks: [...this.meta.gemUnlocks] },
      ruler: this.ruler.key,
    };
  }
}

void KING;
