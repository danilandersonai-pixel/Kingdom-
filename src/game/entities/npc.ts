// Особые существа: собака (лает на Жадность, воет перед Кровавой луной),
// кабан (зимой, выбивает все монеты), призрак прежнего правителя (подсказки).

import { Entity } from '../entity';
import type { Renderer } from '../../render/renderer';
import { groundShadow } from '../../render/shadow';
import { blit } from '../../engine/sprite';
import { animalFrames } from '../../art/animals';
import { humanFrames } from '../../art/humans';
import { mountFrames, type RiderLook } from '../../art/horse';
import { coinSprites } from '../../art/items';
import { M, PEOPLE } from '../config';
import type { Monarch } from './monarch';
import type { Greed } from './greed';
import type { Person } from './person';
import type { Structure } from '../structures/structure';
import { Coin } from './pickups';
import { fxRng } from '../../engine/rng';
import { drawText } from '../../engine/font';
import { townX, wallBetween } from '../kingdom';

export class Dog extends Entity {
  readonly tag = 'npc' as const;
  owner: number;
  private barkCd = 0;
  private howled = -1;
  private running = false;

  constructor(x: number, owner: number) {
    super();
    this.x = x;
    this.owner = owner;
    this.z = 29;
  }

  get drawRadius(): number {
    return 12;
  }

  override update(dt: number): void {
    const w = this.world;
    const m = w.all<Monarch>('monarch').find((e) => e.id === this.owner) ?? w.all<Monarch>('monarch')[0];
    this.barkCd -= dt;
    this.running = false;
    if (m) {
      const tx = m.x - m.facing * 22;
      const dx = tx - this.x;
      if (Math.abs(dx) > 5) {
        this.facing = dx > 0 ? 1 : -1;
        const sp = Math.max(40, Math.abs(m.velocity) * 1.1);
        this.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt);
        this.running = true;
      }
    }
    // Лай на приближающуюся Жадность.
    const g = w.nearest(w.all<Greed>('greed'), this.x, 25 * M);
    if (g && this.barkCd <= 0) {
      this.barkCd = 1.2;
      this.facing = g.x > this.x ? 1 : -1;
      w.sound('bark', this.x, 0.8);
      w.fx.particles.spawn({ x: this.x + this.facing * 8, y: 12, vy: 10, life: 0.6, max: 0.6, color: '#f4ecd8', size: 2 });
    }
    // Вой в сумерках перед Кровавой луной.
    if (w.time.isBloodMoon && w.time.phase > 0.6 && this.howled !== w.time.day) {
      this.howled = w.time.day;
      w.sound('bark', this.x, 1);
      w.banner('СОБАКА ВОЕТ', 'Этой ночью будет Кровавая луна', 4);
    }
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const frames = animalFrames('dog', this.running ? 'move' : 'idle');
    groundShadow(ctx, r.sx(this.x), r.sy(0), 7);
    blit(ctx, frames[Math.floor(this.anim * (this.running ? 12 : 3)) % frames.length], r.sx(this.x), r.sy(0), this.facing < 0);
  }
}

/** Кабан: только зимой, один за зиму. Бросается на монарха. */
export class Boar extends Entity {
  readonly tag = 'animal' as const;
  den: number;
  hp = 12;
  state: 'den' | 'charge' | 'stunned' | 'return' = 'den';
  private timer = 0;
  kind = 'boar';
  private readonly trampled = new Set<number>();

  constructor(x: number) {
    super();
    this.x = x;
    this.den = x;
    this.z = 25;
  }

  get huntable(): boolean {
    return this.state !== 'den';
  }
  get height(): number {
    return 10;
  }
  get drawRadius(): number {
    return 16;
  }

  hurt(dmg: number): void {
    if (this.dead) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dead = true;
      const w = this.world;
      w.banner('КАБАН ПОВЕРЖЕН', 'Фонтан монет!');
      for (let i = 0; i < PEOPLE.boarCoins; i++) {
        const c = new Coin(this.x, 8, fxRng.range(-60, 60), fxRng.range(80, 160));
        c.noPickup = 0.5;
        w.add(c);
      }
    }
  }

  override update(dt: number): void {
    const w = this.world;
    if (w.time.season !== 'winter') {
      this.state = 'den';
      this.x = this.den;
      return;
    }
    const m = w.nearest(w.all<Monarch>('monarch'), this.x, 14 * M, (e) => e.hasCrown);
    switch (this.state) {
      case 'den':
        if (m) {
          this.state = 'charge';
          this.trampled.clear();
          w.sound('greedScream', this.x, 0.8);
        }
        break;
      case 'charge': {
        const target = m ?? w.all<Monarch>('monarch')[0];
        if (!target) break;
        const dx = target.x - this.x;
        this.facing = dx > 0 ? 1 : -1;
        const wall = wallBetween(w, this.x, this.x + this.facing * 8);
        if (wall) {
          wall.damage(5, this.x);
          this.state = 'stunned';
          this.timer = 3;
          break;
        }
        this.x += this.facing * 4.5 * M * dt;
        // Подданные на пути обезоружены — каждый один раз за рывок.
        for (const p of w.all<Person>('person')) {
          if (Math.abs(p.x - this.x) >= 6 || p.role === 'vagrant' || this.trampled.has(p.id)) continue;
          this.trampled.add(p.id);
          p.hitByGreed(this.x);
        }
        if (Math.abs(dx) < 10) {
          // Удар выбивает все монеты, пустой кошелёк — корону.
          if (target.coins > 0) {
            const n = target.coins;
            for (let i = 0; i < n; i++) target.hit(this.x);
          } else target.hit(this.x);
          this.state = 'return';
        }
        if (Math.abs(this.x - this.den) > 40 * M) this.state = 'return';
        break;
      }
      case 'stunned':
        this.timer -= dt;
        if (this.timer <= 0) this.state = 'return';
        break;
      case 'return': {
        const dx = this.den - this.x;
        this.facing = dx > 0 ? 1 : -1;
        this.x += Math.sign(dx) * Math.min(Math.abs(dx), 2 * M * dt);
        if (Math.abs(dx) < 3) {
          this.state = 'den';
          this.timer = 0;
        }
        break;
      }
    }
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    if (this.world.time.season !== 'winter') return;
    const sx = r.sx(this.x);
    const gy = r.sy(0);
    const moving = this.state === 'charge' || this.state === 'return';
    const leg = moving ? (Math.floor(this.anim * 14) % 2) * 2 - 1 : 0;
    const f = this.facing;
    ctx.fillStyle = '#3a2a22';
    ctx.fillRect(sx - 9, gy - 10, 18, 7);
    ctx.fillRect(sx + f * 7 - (f > 0 ? 0 : 5), gy - 9, 5, 5);
    ctx.fillStyle = '#2a1e18';
    ctx.fillRect(sx - 7 + leg, gy - 3, 2, 3);
    ctx.fillRect(sx + 5 - leg, gy - 3, 2, 3);
    ctx.fillStyle = '#e8e0d0';
    ctx.fillRect(sx + f * 11 - (f > 0 ? 0 : 1), gy - 6, 1, 2);
    ctx.fillStyle = '#1a1010';
    ctx.fillRect(sx + f * 9, gy - 8, 1, 1);
    ctx.fillStyle = '#5a4030';
    for (let i = -8; i < 8; i += 2) ctx.fillRect(sx + i, gy - 11, 1, 1);
    if (this.state === 'stunned') drawText(ctx, '*', sx, gy - 18, { align: 'center', color: '#f2e2a8' });
  }
}

/** Призрак прежнего правителя: ведёт к костру и показывает, куда платить. */
export class Ghost extends Entity {
  readonly tag = 'npc' as const;
  step = 0;
  look: RiderLook;
  private hintTarget: number | null = null;
  private fade = 0;
  private sayTimer = 0;
  private said = '';
  done = false;

  constructor(x: number, look: RiderLook) {
    super();
    this.x = x;
    this.look = look;
    this.z = 31;
  }

  get drawRadius(): number {
    return 30;
  }

  private say(text: string): void {
    if (this.said === text) return;
    this.said = text;
    this.sayTimer = 5;
  }

  override update(dt: number): void {
    const w = this.world;
    const m = w.all<Monarch>('monarch')[0];
    if (!m) return;
    this.sayTimer -= dt;
    if (this.done) {
      this.fade += dt * 0.4;
      if (this.fade >= 1) this.dead = true;
      return;
    }
    const tc = w.all<Structure>('structure').find((s) => s.type === 'townCenter');
    const tx = townX(w);
    // Шаги обучения: костёр → найм → инструмент → стена.
    if (this.step === 0) {
      this.hintTarget = tx;
      this.say('Следуй за мной');
      if (tc && tc.level >= 1) this.step = 1;
    } else if (this.step === 1) {
      const vag = w.nearest(w.all<Person>('person'), m.x, 60 * M, (p) => p.role === 'vagrant');
      this.hintTarget = vag ? vag.x : tx;
      this.say('Брось монету бродяге');
      if (w.all<Person>('person').some((p) => p.role !== 'vagrant')) this.step = 2;
    } else if (this.step === 2) {
      const shop = w.all<Structure>('structure').find((s) => s.type === 'shop');
      this.hintTarget = shop ? shop.x : tx;
      this.say('Купи инструмент');
      if (w.all<Person>('person').some((p) => p.role === 'archer' || p.role === 'builder')) this.step = 3;
    } else if (this.step === 3) {
      const wall = w.all<Structure>('structure').filter((s) => s.type === 'wall').sort((a, b) => Math.abs(a.x - tx) - Math.abs(b.x - tx))[0];
      this.hintTarget = wall ? wall.x : tx;
      this.say('Построй стену');
      if (w.all<Structure>('structure').some((s) => s.type === 'wall' && (s.level > 0 || s.building))) {
        this.step = 4;
        this.say('Строй, расширяйся, защищай');
        this.done = true;
      }
    }
    if (w.time.day > 3) this.done = true;
    // Призрак держится чуть впереди монарха по пути к цели.
    const goal = this.hintTarget ?? tx;
    const want = Math.abs(goal - m.x) > 60 ? m.x + Math.sign(goal - m.x) * 50 : goal + 14;
    const dx = want - this.x;
    this.facing = dx > 0 ? 1 : dx < 0 ? -1 : this.facing;
    this.x += Math.sign(dx) * Math.min(Math.abs(dx), 70 * dt);
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const a = (1 - this.fade) * (0.55 + Math.sin(this.anim * 3) * 0.1);
    const ghostLook: RiderLook = { ...this.look, tunic: '#bfe0f0', cape: '#a0d0e8', capeTrim: '#e8f8ff', skin: '#d8f0ff', hair: '#b0d8f0', boots: '#a0c8e0' };
    const frames = mountFrames('ghost', 'walk', { body: '#b8dcef', mane: '#90c0e0', hoof: '#a0c8e0', saddle: '#c8e8f8', saddleTrim: '#e8f8ff' }, ghostLook);
    ctx.globalAlpha = a;
    blit(ctx, frames[Math.floor(this.anim * 6) % frames.length], r.sx(this.x), r.sy(2 + Math.sin(this.anim * 2) * 1.5), this.facing < 0);
    ctx.globalAlpha = 1;
    void humanFrames;
  }

  override drawLabels(ctx: CanvasRenderingContext2D, r: Renderer): void {
    if (this.done && this.fade > 0.6) return;
    // Монетка-подсказка над целью.
    if (this.hintTarget !== null && !this.done) {
      const bob = Math.sin(this.anim * 4) * 2;
      ctx.globalAlpha = 0.85;
      blit(ctx, coinSprites()[Math.floor(this.anim * 8) % 6], r.sx(this.hintTarget), r.sy(40 + bob));
      ctx.globalAlpha = 1;
    }
    if (this.sayTimer > 0) {
      const a = Math.min(1, this.sayTimer);
      drawText(ctx, this.said, r.sx(this.x), r.sy(52), { align: 'center', color: '#dff4ff', alpha: a * (1 - this.fade) });
    }
  }
}
