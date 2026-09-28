// Долгий прогон: бот правит островом много дней, считаем статистику.
import { it, expect } from 'vitest';
import { Campaign } from '../src/game/campaign';
import { makeBot } from '../src/game/bot';

it('20 дней на острове 1 без падений', () => {
  const c = new Campaign(2024);
  const a = c.startReign();
  const w = a.world;
  const m = a.monarchs[0];
  m.autopilot = makeBot();
  let lost = 0;
  w.on('crownTaken', () => lost++);
  const dt = 1 / 30;
  let maxGreed = 0;
  let maxEntities = 0;
  const t0 = performance.now();
  for (let i = 0; i < 20 * 240 * 30 && !lost; i++) {
    w.update(dt);
    if (i % 300 === 0) {
      maxGreed = Math.max(maxGreed, w.all('greed').length);
      maxEntities = Math.max(maxEntities, w.entities.length);
    }
  }
  const ms = performance.now() - t0;
  const roles: Record<string, number> = {};
  for (const p of w.all<any>('person')) roles[p.role] = (roles[p.role] || 0) + 1;
  const tc = w.all<any>('structure').find((s) => s.type === 'townCenter');
  const walls = w.all<any>('structure').filter((s) => s.type === 'wall' && s.level > 0).map((s) => s.level + (s.destroyed ? 'x' : ''));
  console.log(JSON.stringify({ day: w.time.day, lost, tc: tc.level, walls, roles, coins: m.coins, maxGreed, maxEntities, sec: Math.round(ms / 1000) }));
  expect(w.time.day).toBeGreaterThan(5);
}, 600000);
