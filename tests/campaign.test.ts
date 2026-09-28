// Кампания: плавание между островами, наследник и сохранение/загрузка.
import { describe, it, expect, beforeEach } from 'vitest';
import { Campaign } from '../src/game/campaign';
import { saveCampaign, loadCampaign, clearSave } from '../src/game/save';
import type { CentralDock } from '../src/game/structures/boat';
import { Person } from '../src/game/entities/person';
import type { Structure } from '../src/game/structures/structure';

// Простейшая замена localStorage для Node.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

function step(w: any, seconds: number) {
  const dt = 1 / 30;
  for (let i = 0; i < seconds * 30; i++) w.update(dt);
}

describe('кампания', () => {
  beforeEach(() => {
    store.clear();
    clearSave();
  });

  it('плывёт на остров 2 с командой и возвращается', () => {
    const c = new Campaign(42);
    const a = c.startReign();
    const w1 = a.world;
    const m = a.monarchs[0];
    for (let i = 0; i < 3; i++) w1.addNow(new Person(0, 'builder', i));
    const dock = w1.all<Structure>('structure').find((s) => s.type === 'dock') as CentralDock;
    dock.stage = 'launched';
    dock.ringBell();
    expect(dock.crew.length).toBe(3);
    step(w1, 20);
    const b = c.sail(w1, [m], dock, 2);
    expect(b.world.island.index).toBe(2);
    expect(b.firstVisit).toBe(true);
    expect(b.world.all('person').filter((p: any) => p.role === 'builder').length).toBe(3);
    step(b.world, 30);
    const d2 = b.world.all<Structure>('structure').find((s) => s.type === 'dock') as CentralDock;
    d2.stage = 'launched';
    d2.ringBell();
    const back = c.sail(b.world, [m], d2, 1);
    expect(back.world).toBe(w1);
    expect(back.firstVisit).toBe(false);
    step(back.world, 10);
  });

  it('наследник начинает с острова 1 и хранит открытия', () => {
    const c = new Campaign(7);
    c.startReign();
    c.meta.gemUnlocks.add('mount:griffin');
    c.meta.tech = 2;
    c.meta.bank = 50;
    c.destroyedPortals.add('1:small:0');
    const h = c.heir();
    expect(h.world.island.index).toBe(1);
    expect(c.meta.tech).toBe(0);
    expect(c.meta.gemUnlocks.has('mount:griffin')).toBe(true);
    expect(c.meta.bank).toBe(50);
    const portals = h.world.all<any>('structure').filter((s) => s.type === 'portal' && s.key === '1:small:0');
    expect(portals[0]?.destroyed).toBe(true);
    expect(c.reign).toBe(2);
  });

  it('сохраняет и загружает кампанию', () => {
    const c = new Campaign(99);
    const a = c.startReign();
    const w = a.world;
    const m = a.monarchs[0];
    m.coins = 17;
    const tc = w.all<any>('structure').find((s) => s.type === 'townCenter');
    tc.level = 3;
    w.emit('tcUpgraded', 3, tc);
    for (let i = 0; i < 4; i++) w.addNow(new Person(i * 10, 'archer', i));
    step(w, 60);
    c.meta.bank = 33;
    saveCampaign(c, w, [m]);
    const loaded = loadCampaign();
    expect(loaded).not.toBeNull();
    const lw = loaded!.world;
    expect(loaded!.monarchs[0].coins).toBe(17);
    expect(loaded!.campaign.meta.bank).toBe(33);
    const ltc = lw.all<any>('structure').find((s) => s.type === 'townCenter');
    expect(ltc.level).toBe(3);
    expect(lw.all<any>('person').filter((p) => p.role === 'archer').length).toBe(4);
    expect(lw.all<any>('structure').filter((s) => s.type === 'shop').length).toBeGreaterThanOrEqual(3);
    step(lw, 30);
  });

  it('выбранный облик правителя переживает сохранение', () => {
    const c = new Campaign(5);
    const a = c.startReign();
    const first = c.ruler.key;
    const r = c.rerollRuler();
    expect(r.key).not.toBe(first);
    const m = a.monarchs[0];
    m.rider = r.look;
    m.riderKey = r.key;
    saveCampaign(c, a.world, [m]);
    const loaded = loadCampaign()!;
    expect(loaded.campaign.ruler.key).toBe(r.key);
    expect(loaded.monarchs[0].riderKey).toBe(r.key);
    expect(loaded.monarchs[0].rider).toEqual(r.look);
  });
});
