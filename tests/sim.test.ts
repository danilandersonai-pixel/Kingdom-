// Прогон острова без браузера: бот играет несколько дней, мир не должен падать.
import { describe, it, expect } from 'vitest';
import { generateIsland } from '../src/game/island';
import { Monarch } from '../src/game/entities/monarch';
import { makeBot } from '../src/game/bot';
import { M } from '../src/game/config';

function run(days: number, seed: number) {
  const w = generateIsland(seed, 1, { newReign: true });
  const m = new Monarch(0, -34 * M);
  m.autopilot = makeBot();
  w.addNow(m);
  let lost = false;
  w.on('crownTaken', () => (lost = true));
  const dt = 1 / 30;
  const steps = Math.round((days * 240) / dt);
  for (let i = 0; i < steps && !lost; i++) w.update(dt);
  const roles: Record<string, number> = {};
  for (const p of w.all<any>('person')) roles[p.role] = (roles[p.role] || 0) + 1;
  const tc = w.all<any>('structure').find((s) => s.type === 'townCenter');
  const walls = w.all<any>('structure').filter((s) => s.type === 'wall' && s.level > 0).length;
  return { w, m, roles, tc: tc.level, walls, lost, day: w.time.day };
}

describe('симуляция острова', () => {
  it('бот строит королевство за 6 дней без ошибок', () => {
    const r = run(6, 1234);
    console.log('итог:', JSON.stringify({ day: r.day, tc: r.tc, walls: r.walls, roles: r.roles, coins: r.m.coins, lost: r.lost }));
    expect(r.tc).toBeGreaterThanOrEqual(1);
    expect((r.roles.archer ?? 0) + (r.roles.builder ?? 0)).toBeGreaterThan(0);
  }, 120000);
});
