// Регрессии: ошибки, найденные код-ревью (сохранения, тупики, волны, ссылки на подданных).
import { describe, it, expect, beforeEach } from 'vitest';
import { generateIsland } from '../src/game/island';
import { Campaign } from '../src/game/campaign';
import { saveCampaign, loadCampaign, clearSave } from '../src/game/save';
import { Monarch } from '../src/game/entities/monarch';
import { Person } from '../src/game/entities/person';
import { Greed } from '../src/game/entities/greed';
import { DroppedCrown } from '../src/game/entities/pickups';
import type { Structure } from '../src/game/structures/structure';
import type { CentralDock } from '../src/game/structures/boat';
import type { Farm } from '../src/game/structures/farm';
import type { Wall, Tower } from '../src/game/structures/defense';
import type { Portal } from '../src/game/structures/portal';
import type { Chest } from '../src/game/structures/nature';
import type { TownCenter } from '../src/game/structures/town';
import { Teleport, Catapult } from '../src/game/structures/special';
import { applyHermitUpgrade } from '../src/game/structures/hermits';
import { Director } from '../src/game/director';
import { BOAT_PARTS, M } from '../src/game/config';
import type { World } from '../src/game/world';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

function step(w: World, seconds: number, dt = 1 / 30) {
  for (let i = 0; i < seconds / dt; i++) w.update(dt);
}
const find = <T extends Structure>(w: World, type: string) => w.all<Structure>('structure').find((s) => s.type === type) as T;
const noDirector = (w: World) => {
  w.systems = w.systems.filter((s) => !(s instanceof Director));
  w.director = null;
};
const sailBack = (c: Campaign, w1: World, m: Monarch) => {
  const dock = find<CentralDock>(w1, 'dock');
  dock.stage = 'launched';
  dock.ringBell();
  const b = c.sail(w1, [m], dock, 2);
  const d2 = find<CentralDock>(b.world, 'dock');
  d2.parts = BOAT_PARTS;
  d2.stage = 'launched';
  d2.ringBell();
  return c.sail(b.world, [m], d2, 1);
};

beforeEach(() => {
  store.clear();
  clearSave();
});

describe('волны и порталы', () => {
  it('гнёзда пещеры не выпускают ночные волны', () => {
    const w = generateIsland(5, 1, {});
    const d = w.director!;
    w.time.restore({ day: 1, phase: 0.5 });
    d.pickActive();
    d.nightWave();
    const nests = new Set(w.all<Structure>('structure').filter((s) => s.type === 'nest').map((s) => s.id));
    expect(nests.size).toBe(5);
    const q = (d as any).queue as Array<{ portalId: number }>;
    expect(q.some((s) => nests.has(s.portalId))).toBe(false);
    expect(q.length).toBeLessThanOrEqual(4);
  });

  it('после взрыва пещеры разрушение портала не вызывает затмения', () => {
    const w = generateIsland(5, 1, {});
    w.time.restore({ day: 10, phase: 0.2 });
    w.caveCleared = true;
    const portal = w.all<Portal>('structure').find((s) => s.type === 'portal' && (s as Portal).kind === 'small')!;
    portal.damage(9999, portal.x - 10);
    expect(w.director!.eclipse).toBe(false);
    expect(w.time.frozen).toBe(false);
  });

  it('затмение не кончается, пока последняя партия ответной волны только появилась', () => {
    const w = generateIsland(5, 1, {});
    w.time.restore({ day: 10, phase: 0.75 });
    const portal = w.all<Portal>('structure').find((s) => s.type === 'portal' && (s as Portal).kind === 'small')!;
    portal.damage(9999, portal.x - 10);
    const d = w.director as any;
    for (const s of d.queue) if (s.counter) s.at = d.clock + 1;
    step(w, 2);
    const alive = w.all<Greed>('greed').filter((g) => !g.dead && g.stayDay && !g.defender).length;
    expect(alive).toBeGreaterThan(0);
    expect(d.eclipse).toBe(true);
  });

  it('в затмение солнце не жжёт Жадность', () => {
    const w = generateIsland(5, 1, {});
    w.time.restore({ day: 10, phase: 0.2 });
    const portal = w.all<Portal>('structure').find((s) => s.type === 'portal' && (s as Portal).kind === 'small')!;
    portal.damage(9999, portal.x - 10);
    expect(w.time.frozen).toBe(true);
    expect(w.time.sunUp).toBe(false);
  });

  it('гигант Кровавой луны уходит после взрыва пещеры', () => {
    const w = generateIsland(5, 1, {});
    noDirector(w);
    w.time.restore({ day: 20, phase: 0.2 });
    const g = w.addNow(new Greed(-600, 'breeder', 40, 0, 0));
    g.stayDay = true;
    w.caveCleared = true;
    g.retreating = true;
    const x0 = g.x;
    step(w, 10);
    expect(g.dead || Math.abs(g.x) > Math.abs(x0)).toBe(true);
  });

  it('защитники разрушенного портала уходят', () => {
    const w = generateIsland(5, 1, {});
    noDirector(w);
    w.time.restore({ day: 2, phase: 0.2 });
    const portal = w.all<Portal>('structure').find((s) => s.type === 'portal' && (s as Portal).kind === 'small')!;
    const g = w.addNow(new Greed(portal.x + 20, 'greedling', 1, 0, portal.id));
    g.stayDay = true;
    g.defender = true;
    portal.destroyed = true;
    step(w, 0.5);
    expect(g.retreating || g.dead).toBe(true);
  });
});

describe('лодка и команда', () => {
  it('разбитая при возвращении лодка чинится заново, а не застревает', () => {
    const c = new Campaign(42);
    const a = c.startReign();
    const w1 = a.world;
    const m = a.monarchs[0];
    const dock1 = find<CentralDock>(w1, 'dock');
    dock1.parts = BOAT_PARTS;
    const back = sailBack(c, w1, m);
    expect(back.world).toBe(w1);
    expect(dock1.stage).toBe('wreck');
    expect(dock1.parts).toBeLessThan(BOAT_PARTS);
    dock1.onPaid(m);
    expect(dock1.stage).toBe('repair');
    expect(dock1.price(m)).toBeGreaterThan(0);
  });

  it('команда на борту сохраняется и ждёт на пристани', () => {
    const c = new Campaign(42);
    const a = c.startReign();
    const w = a.world;
    const dock = find<CentralDock>(w, 'dock');
    for (let i = 0; i < 3; i++) w.addNow(new Person(dock.x - 30, 'builder', i));
    dock.stage = 'launched';
    dock.ringBell();
    step(w, 20);
    saveCampaign(c, w, a.monarchs);
    const L = loadCampaign()!;
    expect(L.world.all<Person>('person').filter((p) => p.role === 'builder').length).toBe(3);
    expect(find<CentralDock>(L.world, 'dock').stage).toBe('launched');
  });

  it('башня и заказ забывают уплывших подданных', () => {
    const c = new Campaign(42);
    const a = c.startReign();
    const w1 = a.world;
    const m = a.monarchs[0];
    noDirector(w1);
    const tower = w1.all<Tower>('structure').find((s) => s.type === 'tower')!;
    tower.level = 1;
    const archer = w1.addNow(new Person(tower.x, 'archer', 0));
    const wall = w1.all<Wall>('structure').find((s) => s.type === 'wall')!;
    w1.addNow(new Person(wall.x, 'builder', 0));
    w1.addNow(new Person(wall.x, 'builder', 1));
    w1.time.restore({ day: 1, phase: 0.1 });
    wall.onPaid(m);
    wall.buildTime = 9999;
    step(w1, 3);
    expect(tower.archers).toContain(archer.id);
    const job = w1.jobs.jobs.find((j) => j.target === wall)!;
    expect(job.workers.size).toBe(2);
    sailBack(c, w1, m);
    noDirector(w1);
    wall.buildTime = 6;
    const b3 = w1.addNow(new Person(wall.x, 'builder', 2));
    w1.time.restore({ day: w1.time.day, phase: 0.1 });
    step(w1, 20);
    expect(tower.archers).not.toContain(archer.id);
    expect(wall.building).toBe(false);
    void b3;
  });

  it('башня рыцарей не держит слоты лучников, которых в ней нет', () => {
    const w = generateIsland(5, 1, {});
    noDirector(w);
    const tower = w.all<Tower>('structure').find((s) => s.type === 'tower')!;
    tower.level = 4;
    for (let i = 0; i < 3; i++) w.addNow(new Person(tower.x, 'archer', i));
    w.time.restore({ day: 1, phase: 0.1 });
    step(w, 3);
    const m = w.addNow(new Monarch(0, tower.x));
    applyHermitUpgrade(w, tower, 'knight', m);
    step(w, 3);
    const inside = w.all<Person>('person').filter((p) => p.towerId === tower.id).length;
    expect(tower.archers.length).toBe(inside);
  });
});

describe('сохранения', () => {
  it('упавшая корона не теряется при загрузке', () => {
    const c = new Campaign(5);
    const a = c.startReign();
    const w = a.world;
    const m = a.monarchs[0];
    m.x = 0;
    m.loseCrown(-20);
    step(w, 0.1);
    expect(w.all('item').some((e) => e instanceof DroppedCrown)).toBe(true);
    saveCampaign(c, w, [m]);
    const L = loadCampaign()!;
    expect(L.monarchs[0].hasCrown).toBe(true);
  });

  it('недостроенная мельница и отстройка стены достраиваются правильно', () => {
    const c = new Campaign(5);
    const a = c.startReign();
    const w = a.world;
    const m = a.monarchs[0];
    find<TownCenter>(w, 'townCenter').level = 3;
    const farm = find<Farm>(w, 'farm');
    farm.onPaid(m);
    farm.addWork(999);
    expect(farm.stage).toBe('well');
    farm.onPaid(m);
    const wall = w.all<Wall>('structure').find((s) => s.type === 'wall')!;
    wall.grant(2);
    wall.damage(999, wall.x - 10);
    wall.onPaid(m);
    saveCampaign(c, w, [m]);
    const lw = loadCampaign()!.world;
    noDirector(lw);
    const lf = lw.all<Farm>('structure').find((s) => s.type === 'farm' && s.x === farm.x)!;
    const lwall = lw.all<Wall>('structure').find((s) => s.type === 'wall' && s.x === wall.x)!;
    lw.addNow(new Person(lf.x + 10, 'builder', 0));
    lw.addNow(new Person(lwall.x, 'builder', 1));
    lw.time.restore({ day: lw.time.day, phase: 0.1 });
    step(lw, 60);
    expect(lf.stage).not.toBe('site');
    expect(lf.building).toBe(false);
    expect(lwall.destroyed).toBe(false);
    expect(lwall.blocks).toBe(true);
  });

  it('открытые сундуки с самоцветами не наполняются для наследника', () => {
    const c = new Campaign(3);
    const a = c.startReign();
    const b = c.sail(a.world, a.monarchs, find<CentralDock>(a.world, 'dock'), 2);
    const gemChests = b.world.all<Chest>('structure').filter((s) => s.type === 'chest' && (s as Chest).gems);
    expect(gemChests.length).toBeGreaterThan(0);
    for (const ch of gemChests) ch.open();
    const h = c.heir();
    const b2 = c.sail(h.world, h.monarchs, find<CentralDock>(h.world, 'dock'), 2);
    const again = b2.world.all<Chest>('structure').filter((s) => s.type === 'chest' && (s as Chest).gems && !(s as Chest).opened);
    expect(again.length).toBe(0);
  });
});

describe('экономика и подданные', () => {
  it('проценты по вкладу начисляются на рассвете', () => {
    const w = generateIsland(5, 1, {});
    noDirector(w);
    w.meta.bank = 50;
    w.time.restore({ day: 3, phase: 0.98 });
    step(w, 15);
    expect(w.time.day).toBe(4);
    expect(w.meta.bank).toBe(54);
  });

  it('телепорт работает в обе стороны', () => {
    const w = generateIsland(5, 1, {});
    noDirector(w);
    const t = w.addNow(new Teleport(-1500));
    t.finishBuild();
    step(w, 0.1);
    const m = w.addNow(new Monarch(0, t.pairX));
    m.coins = 10;
    const target = m.findPayTarget() as Structure;
    expect(target).toBeTruthy();
    target.onPaid(m);
    expect(Math.abs(m.x - t.x)).toBeLessThan(20);
  });

  it('кабан за один рывок бьёт подданного один раз', () => {
    const w = generateIsland(5, 1, {});
    noDirector(w);
    w.time.restore({ day: 50, phase: 0.2 });
    const boar = w.all<any>('animal').find((a) => a.kind === 'boar');
    w.addNow(new Monarch(0, boar.den + 10 * M)).coins = 3;
    const archer = w.addNow(new Person(boar.den + 5 * M, 'archer', 0));
    archer.stunned = 999;
    step(w, 3);
    expect(archer.role).toBe('villager');
  });

  it('катапульта не забирает строителей со стройки днём', () => {
    const w = generateIsland(5, 1, {});
    noDirector(w);
    w.time.restore({ day: 3, phase: 0.1 });
    const cat = w.addNow(new Catapult(1, 12 * M));
    cat.level = 1;
    step(w, 0.1);
    const wall = w.all<Wall>('structure').find((s) => s.type === 'wall' && s.x < 0)!;
    wall.startBuild(1, 6);
    w.jobs.add('build', wall, 2, w.clock + 1);
    for (let i = 0; i < 2; i++) w.addNow(new Person(wall.x + 20, 'builder', i));
    step(w, 60);
    expect(wall.building).toBe(false);
  });

  it('лагерь бродяг не стоит на месте стены или башни', () => {
    let bad = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const isl of [1, 3]) {
        const w = generateIsland(seed, isl, {});
        const camps = w.all<Structure>('structure').filter((s) => s.type === 'camp');
        const forts = w.all<Structure>('structure').filter((s) => s.type === 'wall' || s.type === 'tower');
        if (camps.some((c) => forts.some((f) => Math.abs(f.x - c.x) < 30))) bad++;
      }
    }
    expect(bad).toBe(0);
  });

  it('на каждом острове 1 есть место под ферму', () => {
    let none = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const w = generateIsland(seed, 1, {});
      if (!w.all<Structure>('structure').some((s) => s.type === 'farm')) none++;
    }
    expect(none).toBe(0);
  });
});
