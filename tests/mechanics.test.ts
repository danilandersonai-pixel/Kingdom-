// Ключевые правила оригинала, проверенные на маленьком тестовом острове.
import { describe, it, expect } from 'vitest';
import { generateIsland } from '../src/game/island';
import { Monarch } from '../src/game/entities/monarch';
import { Person } from '../src/game/entities/person';
import { Greed } from '../src/game/entities/greed';
import { Coin } from '../src/game/entities/pickups';
import type { Structure } from '../src/game/structures/structure';
import type { TownCenter } from '../src/game/structures/town';
import type { Wall } from '../src/game/structures/defense';
import { Director } from '../src/game/director';
import { DayCycle } from '../src/game/time';
import { Banker } from '../src/game/structures/economy';
import { PURSE, TC_TIERS, WALL_TIERS, M } from '../src/game/config';

function world() {
  const w = generateIsland(5, 1, {});
  // Без ночных волн, чтобы тесты были предсказуемыми.
  w.director = null;
  w.systems = w.systems.filter((s) => !(s instanceof Director));
  w.time.restore({ day: 1, phase: 0.1 });
  return w;
}

function step(w: ReturnType<typeof world>, seconds: number) {
  for (let i = 0; i < seconds * 60; i++) w.update(1 / 60);
}

const tc = (w: ReturnType<typeof world>) => w.all<Structure>('structure').find((s) => s.type === 'townCenter') as TownCenter;

describe('оплата', () => {
  it('удержание кнопки у костра вносит 3 монеты и зажигает его', () => {
    const w = world();
    const m = w.addNow(new Monarch(0, 0));
    m.coins = 10;
    m.autopilot = () => ({ drop: true });
    step(w, 1.2);
    expect(m.coins).toBe(10 - TC_TIERS[1].cost);
    expect(tc(w).building).toBe(true);
    step(w, 12);
    expect(tc(w).level).toBe(1);
  });

  it('если отпустить кнопку раньше, монеты выпадают из слотов на землю', () => {
    const w = world();
    const m = w.addNow(new Monarch(0, 0));
    m.coins = 10;
    let hold = true;
    m.autopilot = () => ({ drop: hold });
    step(w, 0.3);
    const paid = tc(w).paid;
    expect(paid).toBeGreaterThan(0);
    expect(paid).toBeLessThan(3);
    hold = false;
    step(w, 1.5);
    expect(tc(w).paid).toBe(0);
    const onGround = w.all<Coin>('coin').filter((c) => Math.abs(c.x) < 30).length;
    expect(onGround).toBe(paid);
  });
});

describe('кошелёк', () => {
  it('держит 40 монет, при переполнении до 50 часть соскальзывает', () => {
    const w = world();
    const m = w.addNow(new Monarch(0, -600));
    m.coins = PURSE.full;
    for (let i = 0; i < 10; i++) {
      const c = new Coin(-600, 0, 0, 0);
      c.settled = true;
      w.addNow(c);
    }
    step(w, 0.5);
    expect(m.coins).toBeGreaterThanOrEqual(PURSE.full);
    expect(m.coins).toBeLessThanOrEqual(PURSE.overflow);
  });

  it('самоцвет занимает три места', () => {
    const w = world();
    const m = w.addNow(new Monarch(0, -600));
    m.coins = 10;
    m.gems = 2;
    expect(m.purseSlots).toBe(10 + 2 * PURSE.gemSlots);
  });
});

describe('подданные', () => {
  it('бродяга подбирает брошенную монету и становится крестьянином', () => {
    const w = world();
    const v = w.addNow(new Person(-900, 'vagrant', 0));
    const c = new Coin(-880, 5, 0, 0);
    w.addNow(c);
    step(w, 3);
    expect(v.role).toBe('villager');
    expect(v.coins).toBe(1);
  });

  it('удар Жадности выбивает инструмент, а у крестьянина — монету', () => {
    const w = world();
    const a = w.addNow(new Person(-900, 'archer', 0));
    const res = a.hitByGreed(-910);
    expect(res.kind).toBe('tool');
    expect(a.role).toBe('villager');
    const res2 = a.hitByGreed(-910);
    expect(res2.kind).toBe('coin');
    expect(a.role).toBe('vagrant');
    // Бродяг Жадность не трогает.
    expect(a.hitByGreed(-910).kind).toBe('none');
  });

  it('монарх теряет по монете за удар, без монет — корону', () => {
    const w = world();
    const m = w.addNow(new Monarch(0, 300));
    m.coins = 2;
    expect(m.hit(290)).toBe('coins');
    expect(m.hit(290)).toBe('coins');
    expect(m.coins).toBe(0);
    expect(m.hit(290)).toBe('crown');
    expect(m.hasCrown).toBe(false);
  });
});

describe('стены', () => {
  it('гридлинг ломает стену 1 уроном за удар, строитель чинит', () => {
    const w = world();
    const wall = w.all<Wall>('structure').find((s) => s.type === 'wall')!;
    wall.grant(1);
    expect(wall.hp).toBe(WALL_TIERS[1].hp);
    wall.damage(1, wall.x - 20);
    expect(wall.hp).toBe(WALL_TIERS[1].hp - 1);
    const b = w.addNow(new Person(wall.x, 'builder', 0));
    step(w, 4);
    expect(wall.hp).toBe(WALL_TIERS[1].hp);
    void b;
  });

  it('гридлинг останавливается у стены и не проходит сквозь неё', () => {
    const w = world();
    const wall = w.all<Wall>('structure').filter((s) => s.type === 'wall').sort((a, b) => a.x - b.x)[0];
    wall.grant(2);
    const g = w.addNow(new Greed(wall.x - 60, 'greedling', 1, 0, 0));
    w.time.restore({ day: 1, phase: 0.8 });
    step(w, 3);
    expect(g.x).toBeLessThan(wall.x);
    expect(wall.hp).toBeLessThan(WALL_TIERS[2].hp);
  });
});

describe('время и волны', () => {
  it('Кровавая луна — на 15-й день каждого сезона, с 193-го ещё и на 8-й', () => {
    expect(DayCycle.isBloodMoonDay(15)).toBe(true);
    expect(DayCycle.isBloodMoonDay(31)).toBe(true);
    expect(DayCycle.isBloodMoonDay(8)).toBe(false);
    expect(DayCycle.isBloodMoonDay(200)).toBe(true);
  });

  it('гридлингов с портала: 1 + день/6', () => {
    expect(Director.greedlingsPerPortal(1)).toBe(1);
    expect(Director.greedlingsPerPortal(12)).toBe(3);
  });

  it('банкир: 7 % в день, свыше 100 — фиксированно 8', () => {
    expect(Banker.interest(2)).toBe(0);
    expect(Banker.interest(50)).toBe(4);
    expect(Banker.interest(150)).toBe(8);
  });
});

void M;
