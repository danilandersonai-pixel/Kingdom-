// «Режиссёр» Жадности: какие порталы активны (решается в полдень),
// сколько и кого выпустить ночью, Кровавые луны, затишье после них,
// защитники портала при атаке и ответные волны с затмением.

import type { World } from './world';
import { Greed, type GreedKind } from './entities/greed';
import { Portal } from './structures/portal';
import type { Structure } from './structures/structure';
import { DayCycle } from './time';
import { DIFFICULTY, GREED, M } from './config';
import type { Person } from './entities/person';
import { townX } from './kingdom';
import { fxRng } from '../engine/rng';

interface Spawn {
  at: number;
  portalId: number;
  kind: GreedKind;
  hp: number;
  armored: boolean;
  stayDay: boolean;
  counter: boolean;
}

export class Director {
  private queue: Spawn[] = [];
  private clock = 0;
  /** Идёт ответная волна (затмение). */
  eclipse = false;
  private counterIds = new Set<number>();

  constructor(private readonly w: World) {
    w.time.onNoon.push(() => this.pickActive());
    w.time.onNight.push(() => this.nightWave());
    // После взрыва пещеры Жадность на острове больше не появляется — ни защитники, ни щупальца, ни месть.
    w.on('portalDefender', (p: Portal) => {
      if (!w.caveCleared) this.spawnNow(p, 'greedling', 1, false, true, true);
    });
    w.on('portalTentacle', (p: Portal, range: number) => {
      if (!w.caveCleared) this.tentacle(p, range);
    });
    w.on('portalDestroyed', (p: Portal) => this.counterattack(p));
    this.pickActive();
  }

  private get mult(): number {
    return DIFFICULTY[this.w.meta.difficulty];
  }

  private portals(): Portal[] {
    return this.w.all<Structure>('structure').filter((s) => s.type === 'portal' && !(s as Portal).destroyed) as Portal[];
  }

  /** В полдень решается, какие малые порталы откроются этой ночью. */
  pickActive(): void {
    const d = this.w.time.day;
    const p = Math.min(1, 0.4 + 0.02 * d);
    for (const portal of this.portals()) {
      portal.active = portal.kind !== 'small' || this.w.rng.chance(p);
    }
  }

  /** Сколько гридлингов с одного портала. */
  static greedlingsPerPortal(day: number): number {
    return 1 + Math.floor(day / 6);
  }

  private maskHp(day: number): number {
    const frac = Math.max(0, Math.min(0.6, 0.02 * (day - 8)));
    if (!this.w.rng.chance(frac)) return 1;
    return 1 + 1 + Math.floor(this.w.rng.next() * Math.min(3, day / 30));
  }

  nightWave(): void {
    const w = this.w;
    const t = w.time;
    if (this.mult <= 0 || w.caveCleared) return;
    if (t.isCalmNight) {
      w.banner('ТИХАЯ НОЧЬ', 'Жадность истощена Кровавой луной', 4);
      return;
    }
    const d = t.day;
    const blood = t.isBloodMoon;
    const moonIdx = DayCycle.bloodMoonIndex(d);
    const portals = this.portals().filter((p) => blood || p.active);
    if (!portals.length) return;
    const nightStart = this.clock;
    const spread = 18;
    // Гридлинги с каждого активного портала.
    for (const p of portals) {
      let g = Math.round(Director.greedlingsPerPortal(d) * this.mult * (blood ? 3 : 1));
      if (w.island.index > 1) g += Math.floor((w.island.index - 1) / 2);
      for (let i = 0; i < g; i++) {
        const hp = this.maskHp(d);
        this.queue.push({ at: nightStart + fxRng.range(0, spread), portalId: p.id, kind: 'greedling', hp, armored: hp >= 4, stayDay: false, counter: false });
      }
    }
    // Летуны: с 3-й Кровавой луны.
    const floaters = d >= 47 ? Math.max(0, Math.floor((d - 32) / 16)) + (blood ? 1 : 0) : 0;
    for (let i = 0; i < Math.round(floaters * this.mult); i++) {
      const p = portals[i % portals.length];
      this.queue.push({ at: nightStart + fxRng.range(5, spread), portalId: p.id, kind: 'floater', hp: GREED.floaterHp, armored: false, stayDay: true, counter: false });
    }
    // Гиганты: в Кровавую луну со 2-й луны, в обычные ночи — с 40-го дня.
    let breeders = d >= 40 ? 1 + Math.floor((d - 40) / 25) : 0;
    if (blood && moonIdx >= 2) breeders += 1;
    if (breeders > 0) {
      for (const side of [-1, 1] as const) {
        const sidePortals = portals.filter((p) => Math.sign(p.x - townX(w)) === side);
        if (!sidePortals.length) continue;
        for (let i = 0; i < Math.round(breeders * this.mult); i++) {
          const armored = d > 120 && fxRng.chance(0.4);
          this.queue.push({ at: nightStart + fxRng.range(2, 10), portalId: sidePortals[i % sidePortals.length].id, kind: 'breeder', hp: armored ? GREED.armoredBreederHp : GREED.breederHp, armored, stayDay: blood, counter: false });
        }
      }
    }
    // Похитители короны.
    const stealers = (blood && d >= 129) || d >= 193 ? 1 + Math.floor(Math.max(0, d - 129) / 64) : 0;
    if (stealers > 0) {
      for (const side of [-1, 1] as const) {
        const sp = portals.filter((p) => Math.sign(p.x - townX(w)) === side);
        if (!sp.length) continue;
        for (let i = 0; i < stealers; i++) {
          this.queue.push({ at: nightStart + fxRng.range(8, spread + 6), portalId: sp[0].id, kind: 'stealer', hp: GREED.stealerHp, armored: false, stayDay: false, counter: false });
        }
      }
    }
    if (blood) w.sound('bloodMoon', townX(w), 1);
  }

  private spawnNow(p: Portal, kind: GreedKind, hp: number, armored: boolean, stayDay: boolean, defender = false): Greed {
    const w = this.w;
    const g = new Greed(p.x + fxRng.range(-4, 4), kind, hp, fxRng.int(0, 5), p.id, armored);
    g.stayDay = stayDay;
    g.defender = defender;
    g.facing = townX(w) > p.x ? 1 : -1;
    w.add(g);
    w.fx.particles.burst(p.x, 16, 6, { color: '#6a3a98', speed: 30, life: 0.6, emissive: true });
    return g;
  }

  private tentacle(p: Portal, range: number): void {
    for (const person of this.w.all<Person>('person')) {
      if (person.dead || person.role === 'vagrant') continue;
      if (Math.abs(person.x - p.x) < range) {
        person.stunned = 1;
        person.hitByGreed(p.x);
      }
    }
  }

  /** Разрушен портал — ответная волна, небо темнеет (затмение). */
  private counterattack(p: Portal): void {
    const w = this.w;
    w.meta.portalsDestroyed++;
    const k = w.meta.portalsDestroyed;
    if (w.caveCleared) return;
    const others = this.portals();
    const src = others.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    if (!src) return;
    const n = Math.round((3 + 4 * (k - 1)) * Math.max(0.5, this.mult));
    for (let i = 0; i < n; i++) this.queue.push({ at: this.clock + fxRng.range(0, 8), portalId: src.id, kind: 'greedling', hp: this.maskHp(w.time.day), armored: false, stayDay: true, counter: true });
    if (k >= 3) {
      for (let i = 0; i < Math.floor(k / 3); i++) this.queue.push({ at: this.clock + 4, portalId: src.id, kind: 'breeder', hp: GREED.breederHp, armored: false, stayDay: true, counter: true });
    }
    this.eclipse = true;
    w.time.frozen = true;
    w.banner('ЗАТМЕНИЕ', 'Жадность мстит за портал', 5);
  }

  update(dt: number): void {
    this.clock += dt;
    const w = this.w;
    let counterSpawned = false;
    if (this.queue.length) {
      const ready = this.queue.filter((s) => s.at <= this.clock);
      if (ready.length) {
        this.queue = this.queue.filter((s) => s.at > this.clock);
        for (const s of ready) {
          const p = w.all<Structure>('structure').find((e) => e.id === s.portalId) as Portal | undefined;
          if (!p || p.destroyed) continue;
          const g = this.spawnNow(p, s.kind, s.hp, s.armored, s.stayDay);
          if (s.counter) {
            this.counterIds.add(g.id);
            counterSpawned = true;
          }
        }
      }
    }
    // Только что выпущенные ещё не в списке мира — конец затмения проверим в следующем кадре.
    if (this.eclipse && !counterSpawned) {
      const alive = w.all<Greed>('greed').some((g) => this.counterIds.has(g.id) && !g.dead);
      const pending = this.queue.some((s) => s.counter);
      if (!alive && !pending) {
        this.eclipse = false;
        this.counterIds.clear();
        w.time.frozen = false;
        w.banner('СВЕТ ВЕРНУЛСЯ', undefined, 3);
      }
    }
  }

  serialize(): object {
    return { eclipse: this.eclipse };
  }
}

void M;
