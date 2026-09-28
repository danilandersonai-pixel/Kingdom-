// Простой бот-монарх: собирает монеты, зажигает костёр, нанимает бродяг,
// покупает инструменты, строит стены и башни, улучшает город.
// Нужен для автотестов и «живого» фона титульного экрана.

import type { Monarch, Control } from './entities/monarch';
import type { Structure, Payable } from './structures/structure';
import type { Person } from './entities/person';
import type { Coin } from './entities/pickups';
import type { Shop } from './structures/town';
import type { Greed } from './entities/greed';
import type { Chest } from './structures/nature';
import { townX, kingdomEdge } from './kingdom';
import { M } from './config';

interface BotState {
  goal: string;
  target: number | null;
  dropping: boolean;
  lastPress: number;
  think: number;
}

export function makeBot(): (m: Monarch, dt: number) => Partial<Control> {
  const st: BotState = { goal: 'idle', target: null, dropping: false, lastPress: 0, think: 0 };
  return (m, dt) => {
    const w = m.world;
    st.think -= dt;
    st.lastPress += dt;
    if (st.think <= 0 || st.target === null) {
      st.think = 0.5;
      decide(m, st);
    }
    const out: Partial<Control> = { axis: 0, run: false, drop: false, dropPressed: false };
    if (st.target !== null) {
      const dx = st.target - m.x;
      if (Math.abs(dx) > 6) {
        out.axis = Math.sign(dx);
        out.run = Math.abs(dx) > 120 && m.stamina > 0.3;
        return out;
      }
    }
    if (st.goal === 'pay') {
      if (!m.payTarget && !m.hoverTarget) {
        st.target = null;
        st.think = 0;
        return out;
      }
      out.drop = true;
    } else if (st.goal === 'recruit') {
      if (st.lastPress > 1.5) {
        out.drop = true;
        out.dropPressed = true;
        st.lastPress = 0;
        st.target = null;
      }
    }
    void w;
    return out;
  };
}

function decide(m: Monarch, st: BotState): void {
  const w = m.world;
  const tx = townX(w);
  const structs = w.all<Structure>('structure');
  const tc = structs.find((s) => s.type === 'townCenter')!;
  const night = !w.time.isDay || w.time.phase > 0.58;
  const nearestCoin = w.nearest(w.all<Coin>('coin'), m.x, 60 * M, (c) => c.settled && !c.homing && !c.claimedBy && c.age > 1 && c.ownerLock <= 0);
  const safe = (x: number) => x > kingdomEdge(w, -1) - 30 * M && x < kingdomEdge(w, 1) + 30 * M;

  // Жадность рядом — уходим от неё (конь быстрее гридлинга).
  const greed = w.nearest(w.all<Greed>('greed'), m.x, 9 * M);
  if (greed) {
    st.goal = 'flee';
    st.target = m.x + Math.sign(m.x - greed.x || 1) * 14 * M;
    return;
  }
  if (night) {
    st.goal = 'home';
    st.target = tx + (m.player ? 20 : -20);
    return;
  }
  const reserve = w.time.phase > 0.45 ? 3 : 0;
  if (nearestCoin && safe(nearestCoin.x) && m.coins < 38) {
    st.goal = 'collect';
    st.target = nearestCoin.x;
    return;
  }
  const chest = structs
    .filter((s) => s.type === 'chest' && !(s as Chest).opened && !(s as Chest).gems)
    .sort((a, b) => Math.abs(a.x - m.x) - Math.abs(b.x - m.x))[0] as Chest | undefined;
  if (chest && w.time.phase < 0.4 && (m.coins < 6 || Math.abs(chest.x - m.x) < 40 * M)) {
    st.goal = 'chest';
    st.target = chest.x;
    return;
  }
  const payables: Array<{ s: Structure; want: number }> = [];
  const price = (s: Payable) => s.price(m);
  if (tc.level < 1 || (price(tc) > 0 && m.coins >= price(tc) + 3)) payables.push({ s: tc, want: 100 });
  const vagrants = w.all<Person>('person').filter((p) => p.role === 'vagrant' && safe(p.x));
  const villagers = w.all<Person>('person').filter((p) => p.role !== 'vagrant');
  for (const s of structs) {
    const p = s.price(m);
    if (p <= 0 || p > m.coins - reserve) continue;
    if (s.type === 'shop') {
      const shop = s as Shop;
      const idle = villagers.filter((v) => v.role === 'villager').length;
      const have = villagers.filter((v) => v.role === (shop.kind === 'bow' ? 'archer' : shop.kind === 'hammer' ? 'builder' : 'farmer')).length;
      if (shop.stock < Math.min(2, idle)) payables.push({ s, want: (shop.kind === 'bow' ? 70 : shop.kind === 'hammer' ? 55 : 30) - have * 8 });
    } else if (s.type === 'wall' && Math.abs(s.x - tx) < 45 * M && s.level < 2) payables.push({ s, want: 50 - Math.abs(s.x - tx) / M });
    else if (s.type === 'tower' && Math.abs(s.x - tx) < 35 * M && s.level < 1 && m.coins > 10) payables.push({ s, want: 30 });
  }
  if (vagrants.length && m.coins >= 2 + reserve && villagers.length < 16) {
    const v = w.nearest(vagrants, m.x, 90 * M)!;
    if (v) payables.push({ s: { x: v.x } as Structure, want: 45 });
  }
  if (!payables.length) {
    st.goal = 'idle';
    st.target = tx + Math.sin(w.clock * 0.05) * 20 * M;
    return;
  }
  payables.sort((a, b) => b.want - a.want - (Math.abs(a.s.x - m.x) - Math.abs(b.s.x - m.x)) / (30 * M));
  const pick = payables[0];
  if ('price' in pick.s && typeof pick.s.price === 'function') {
    st.goal = 'pay';
    st.target = pick.s.x;
  } else {
    st.goal = 'recruit';
    st.target = pick.s.x + (pick.s.x > m.x ? -10 : 10);
  }
}
