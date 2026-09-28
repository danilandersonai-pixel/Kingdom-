// Отладочные сцены для быстрой проверки: ?setup=defense и т. п.

import type { World } from './world';
import type { Structure } from './structures/structure';
import type { TownCenter } from './structures/town';
import type { Wall, Tower } from './structures/defense';
import { Person, type Role } from './entities/person';
import { wallsOnSide } from './kingdom';
import type { Monarch } from './entities/monarch';

function tc(w: World): TownCenter {
  return w.all<Structure>('structure').find((s) => s.type === 'townCenter') as TownCenter;
}

function upgradeTown(w: World, level: number): void {
  const t = tc(w);
  for (let l = t.level + 1; l <= level; l++) {
    t.level = l;
    w.emit('tcUpgraded', l, t);
  }
  t.cooldown = 0;
}

function spawn(w: World, role: Role, n: number, x: number): void {
  for (let i = 0; i < n; i++) {
    const p = new Person(x + (i - n / 2) * 8, role, i);
    p.coins = role === 'squire' ? 5 : role === 'knight' ? 11 : 1;
    p.side = i % 2 === 0 ? -1 : 1;
    p.rank = Math.floor(i / 2);
    w.addNow(p);
  }
}

export function debugSetup(w: World, name: string, m: Monarch): void {
  if (name === 'defense' || name === 'army' || name === 'stone') {
    upgradeTown(w, name === 'stone' ? 5 : 3);
    if (name === 'stone') w.meta.tech = 1;
    for (const side of [-1, 1] as const) {
      const walls = wallsOnSide(w, side) as unknown as Wall[];
      walls[0]?.grant(name === 'stone' ? 3 : 2);
      walls[1]?.grant(name === 'stone' ? 3 : 1);
    }
    for (const s of w.all<Structure>('structure')) {
      if (s.type === 'tower' && Math.abs(s.x) < 400) (s as Tower).level = 1;
    }
    spawn(w, 'archer', name === 'army' ? 10 : 6, 0);
    spawn(w, 'builder', 2, 20);
    if (name === 'army') {
      spawn(w, 'knight', 2, -20);
      spawn(w, 'pikeman', 2, 30);
    }
    m.x = 0;
    m.coins = 25;
  }
  if (name === 'rich') {
    m.coins = 40;
    m.x = 0;
  }
}
