// Системы острова: эффекты улучшений городского центра, лагеря бродяг,
// расстановка защитников на закате, дичь, рост травы, монарх и корона.

import type { World } from './world';
import { M, TIME } from './config';
import type { Structure } from './structures/structure';
import { Shop, SHOP_OFFSETS, type TownCenter } from './structures/town';
import type { Wall, Tower } from './structures/defense';
import type { Camp } from './structures/nature';
import { Person } from './entities/person';
import { Animal } from './entities/animal';
import type { Monarch } from './entities/monarch';
import { DroppedCrown } from './entities/pickups';
import { wallsOnSide, kingdomEdge, townX, outerWall } from './kingdom';
import { fxRng } from '../engine/rng';
import { HUMAN_VARIANTS } from '../art/humans';
import { Banker, GemKeeper } from './structures/economy';
import type { CentralDock } from './structures/boat';

/** Эффекты тиров городского центра. */
export function installTownSystem(w: World): void {
  w.on('tcUpgraded', (level: number, tc: TownCenter) => {
    const tx = tc.x;
    const hasShop = (kind: string) => w.all<Structure>('structure').some((s) => s.type === 'shop' && (s as Shop).kind === kind);
    if (level >= 1) {
      if (!hasShop('hammer')) w.add(new Shop(tx + SHOP_OFFSETS.hammer, 'hammer'));
      if (!hasShop('bow')) w.add(new Shop(tx + SHOP_OFFSETS.bow, 'bow'));
    }
    if (level >= 3) {
      grantInnerWalls(w, 1);
      if (!hasShop('scythe')) w.add(new Shop(tx + SHOP_OFFSETS.scythe, 'scythe'));
    }
    if (level >= 5) {
      grantInnerWalls(w, 3);
      grantInnerTowers(w, 2);
    }
    if (level >= 4 && !w.all('npc').some((e) => e instanceof Banker)) {
      w.add(new Banker(tx - 2 * M));
      w.banner('БАНКИР', 'Бросайте монеты рядом с ним — вклад растёт на 7 % в день');
    }
    if (level >= 5 && !hasShop('pike')) {
      const pike = new Shop(tx + 9 * M, 'pike');
      // Лавке пик нужна каменная (или железная) стена в секторе.
      pike.condition = () => w.all<Wall>('structure').some((s) => s.type === 'wall' && s.blocks && s.level >= 3);
      w.add(pike);
    }
    if (level >= 6 && !w.all<Structure>('structure').some((s) => (s as GemKeeper).isGemKeeper)) {
      const dock = w.all<Structure>('structure').find((s) => s.type === 'dock') as CentralDock | undefined;
      if (dock) w.add(new GemKeeper(dock.x - w.island.beachSide * 3 * M));
    }
    if (level >= 7 && !hasShop('sword')) {
      const forge = new Shop(tx - 9 * M, 'sword');
      forge.condition = () => w.meta.tech >= 2;
      w.add(forge);
    }
    if (level >= 6 && !hasShop('shield')) {
      for (const side of [-1, 1] as const) {
        const s = new Shop(tx + side * 3.4 * M, 'shield', 2);
        s.side = side;
        w.add(s);
      }
    }
    if (level >= 7) grantInnerWalls(w, 5);
  });
}

function grantInnerWalls(w: World, level: number): void {
  for (const side of [-1, 1] as const) {
    const walls = wallsOnSide(w, side);
    const inner = walls[0] as Wall | undefined;
    if (inner) {
      inner.grant(level);
      inner.inner = true;
    }
  }
}

function grantInnerTowers(w: World, level: number): void {
  for (const side of [-1, 1] as const) {
    const towers = w
      .all<Structure>('structure')
      .filter((s) => s.type === 'tower' && Math.sign(s.x - townX(w)) === side)
      .sort((a, b) => Math.abs(a.x) - Math.abs(b.x)) as Tower[];
    const t = towers[0];
    if (t && t.level < level) {
      t.level = level;
      t.building = false;
      t.scaffold = false;
    }
  }
}

/** Лагеря: по бродяге на рассвете (не больше 2), исчезают без леса. */
export function installCampSystem(w: World): void {
  const spawnAtCamps = () => {
    for (const c of w.all<Camp>('structure')) {
      if (c.type !== 'camp' || c.dead) continue;
      if (c.vagrants.length < 2) {
        const p = new Person(c.x + fxRng.range(-10, 10), 'vagrant', w.rng.int(0, HUMAN_VARIANTS - 1));
        p.homeCamp = c.id;
        w.add(p);
        c.vagrants.push(p.id);
      }
    }
  };
  w.time.onDawn.push(spawnAtCamps);
  w.on('treeCut', () => {
    for (const c of w.all<Camp>('structure')) {
      if (c.type !== 'camp' || c.dead) continue;
      if (!c.stillForest()) {
        c.dead = true;
        w.fx.particles.burst(c.x, 6, 12, { color: '#7a6a5a', speed: 30, life: 0.8, gravity: 80 });
        for (const p of w.all<Person>('person')) if (p.homeCamp === c.id) p.homeCamp = 0;
        w.emit('campGone', c);
      }
    }
  });
}

/** На закате: лучники и прочие распределяются по сторонам поровну. */
export function installDefenseSystem(w: World): void {
  const assign = () => {
    const tc = townX(w);
    const free = w.all<Person>('person').filter((p) => p.role === 'archer' && !p.towerId && !p.leaderId);
    for (const p of free) p.side = p.x < tc ? -1 : 1;
    const left = free.filter((p) => p.side < 0);
    const right = free.filter((p) => p.side > 0);
    // Выравниваем стороны.
    while (Math.abs(left.length - right.length) > 1) {
      if (left.length > right.length) {
        const p = left.sort((a, b) => b.x - a.x).shift()!;
        p.side = 1;
        right.push(p);
      } else {
        const p = right.sort((a, b) => a.x - b.x).shift()!;
        p.side = -1;
        left.push(p);
      }
    }
    left.forEach((p, i) => (p.rank = i));
    right.forEach((p, i) => (p.rank = i));
    // Строители, пикинёры — тоже по сторонам.
    for (const role of ['builder', 'pikeman'] as const) {
      const list = w.all<Person>('person').filter((p) => p.role === role);
      list.forEach((p, i) => {
        p.side = i % 2 === 0 ? -1 : 1;
        p.rank = Math.floor(i / 2);
      });
    }
  };
  w.time.onSunset.push(assign);
  w.on('roleChanged', (p: Person) => {
    if (p.role === 'archer' || p.role === 'builder' || p.role === 'pikeman') {
      p.side = p.x < townX(w) ? -1 : 1;
      p.rank = w.all<Person>('person').filter((q) => q.role === p.role && q.side === p.side).length;
    }
  });
}

/** Дичь: кролики из высокой травы за крайней стеной, олени из леса. Зимой не появляются. */
export function installWildlife(w: World): void {
  let timer = 3;
  w.systems.push({
    update(dt: number) {
      timer -= dt;
      if (timer > 0) return;
      timer = 6;
      const season = w.time.season;
      if (season === 'winter') return;
      const animals = w.all<Animal>('animal');
      const rabbits = animals.filter((a) => a.kind === 'rabbit').length;
      const deer = animals.filter((a) => a.kind === 'deer' || a.kind === 'stag').length;
      const t = w.terrain;
      const leftEdge = kingdomEdge(w, -1);
      const rightEdge = kingdomEdge(w, 1);
      if (rabbits < 12) {
        const bushes: number[] = [];
        for (let i = 0; i < t.cells; i++) {
          if (!t.bush[i]) continue;
          const x = t.cellX(i);
          if (x > leftEdge - 3 * M && x < rightEdge + 3 * M) continue;
          const near = animals.filter((a) => a.kind === 'rabbit' && Math.abs(a.x - x) < 4 * M).length;
          if (near < 3) bushes.push(x);
        }
        if (bushes.length) {
          const x = bushes[Math.floor(fxRng.next() * bushes.length)];
          w.add(new Animal(x + fxRng.range(-6, 6), 'rabbit'));
        }
      }
      if (deer < 4 && fxRng.chance(0.25)) {
        const side = fxRng.sign() as -1 | 1;
        const edge = side < 0 ? leftEdge : rightEdge;
        // Ищем опушку за королевством.
        for (let tries = 0; tries < 12; tries++) {
          const x = edge + side * fxRng.range(15 * M, 60 * M);
          if (x < w.island.left + 40 || x > w.island.right - 40) continue;
          if (t.isForest(x)) {
            w.add(new Animal(x, fxRng.chance(0.3) ? 'stag' : 'deer'));
            break;
          }
        }
      }
    },
  });
}

/** Трава растёт по утрам. */
export function installTerrainGrowth(w: World): void {
  w.time.onDawn.push((day) => w.terrain.dailyGrowth(w.time.season, day, w.island.seed));
}

/** Монарх может подобрать свою корону, пока её не утащили. */
export function installCrownPickup(w: World): void {
  w.systems.push({
    update() {
      for (const it of w.all<DroppedCrown>('item')) {
        if (!(it instanceof DroppedCrown) || it.carriedBy || it.dead || it.y > 4) continue;
        for (const m of w.all<Monarch>('monarch')) {
          if (!m.hasCrown && m.id === it.owner && Math.abs(m.x - it.x) < 8) {
            it.dead = true;
            m.regainCrown();
          }
        }
      }
    },
  });
}

/** Утренний колокол, вечерние сигналы. */
export function installBells(w: World): void {
  w.time.onDawn.push(() => w.sound('bell', townX(w), 0.9));
  w.time.onSunset.push(() => {
    if (w.time.isBloodMoon) {
      w.banner('КРОВАВАЯ ЛУНА', 'Этой ночью Жадность придёт толпой', 5);
    }
  });
  void TIME;
  void outerWall;
}
