import { it } from 'vitest';
import { generateIsland } from '../src/game/island';
import { Monarch } from '../src/game/entities/monarch';
import { makeBot } from '../src/game/bot';
import { M } from '../src/game/config';

it('трассировка бота', () => {
  const w = generateIsland(1234, 1, { newReign: true });
  const m = new Monarch(0, -34 * M);
  m.autopilot = makeBot();
  w.addNow(m);
  const dt = 1 / 30;
  let t = 0;
  let lost = false;
  w.on('crownTaken', () => (lost = true));
  w.on('purchase', (_m: unknown, s: { type?: string; x: number }) => console.log(`t=${t.toFixed(0)} купил ${s.type} x=${Math.round(s.x)}`));
  w.on('recruited', () => console.log(`t=${t.toFixed(0)} нанят`));
  w.on('coinDropped', () => console.log(`t=${t.toFixed(0)} уронил монету x=${Math.round(m.x)}`));
  for (let i = 0; i < 240 * 2.2 * 30 && !lost; i++) {
    w.update(dt);
    t += dt;
    if (i % (30 * 15) === 0) {
      const v = w.all<any>('person').filter((p) => p.role === 'vagrant').map((p) => Math.round(p.x));
      console.log(`t=${t.toFixed(0)} ph=${w.time.phase.toFixed(2)} x=${Math.round(m.x)} coins=${m.coins} greed=${w.all('greed').length} vagrants=${v.slice(0, 5)} coinsOnGround=${w.all('coin').length}`);
    }
  }
  console.log('lost', lost, 'day', w.time.day);
}, 60000);
