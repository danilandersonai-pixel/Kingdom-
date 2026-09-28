// Бомба и пещера: на Железной крепости у стены со стороны утёса появляется
// знамя бомбы (18 монет). 5 монет — строители толкают бомбу к утёсу, монарх
// ведёт колонну мимо гнёзд Жадности; ещё 5 — поджечь. Взрыв зачищает остров.

import { Structure } from './structure';
import type { Monarch } from '../entities/monarch';
import type { Renderer } from '../../render/renderer';
import type { Light } from '../../render/lighting';
import { blit, hex } from '../../engine/sprite';
import { bannerSprite, bombSprite, nestSprite } from '../../art/buildings';
import { PRICES, M, GREED } from '../config';
import { outerWall, townX } from '../kingdom';
import { Greed } from '../entities/greed';
import type { Portal } from './portal';
import type { Person } from '../entities/person';
import { fxRng } from '../../engine/rng';
import { Coin } from '../entities/pickups';

function cliff(s: Structure): Portal | undefined {
  return s.world.all<Structure>('structure').find((e) => e.type === 'portal' && (e as Portal).kind === 'cliff') as Portal | undefined;
}

/** Знамя бомбы у крайней стены со стороны утёса. */
export class BombBanner extends Structure {
  readonly type = 'bombShop' as const;
  side: -1 | 1;
  bought = false;
  constructor(side: -1 | 1) {
    super();
    this.side = side;
    this.z = 9;
    this.payWidth = 14;
    this.payPriority = 3;
  }
  override slotY(): number {
    return 30;
  }
  get tcLevel(): number {
    return this.world.all<Structure>('structure').find((s) => s.type === 'townCenter')?.level ?? 0;
  }
  override price(_m: Monarch): number {
    if (this.bought || this.tcLevel < 7 || this.world.caveCleared) return 0;
    return PRICES.bomb;
  }
  override onPaid(_m: Monarch): void {
    this.bought = true;
    this.world.add(new Bomb(this.x - this.side * 10));
    this.world.banner('БОМБА ГОТОВА', 'Ещё 5 монет — и строители повезут её к утёсу');
  }
  override update(): void {
    const ow = outerWall(this.world, this.side);
    this.x = (ow ? ow.x : townX(this.world) + this.side * 12 * M) - this.side * 2 * M;
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    if (this.tcLevel < 7 || this.world.caveCleared) return;
    blit(ctx, bannerSprite('#2a2a32'), r.sx(this.x), r.sy(0), this.side < 0);
  }
}

export class Bomb extends Structure {
  readonly type = 'bombShop' as const;
  stage: 'ready' | 'march' | 'armed' | 'boom' = 'ready';
  fuse = 0;
  constructor(x: number) {
    super();
    this.x = x;
    this.z = 24;
    this.payWidth = 16;
    this.payPriority = 3;
  }
  get isBomb(): boolean {
    return true;
  }
  override slotY(): number {
    return 26;
  }
  override price(_m: Monarch): number {
    if (this.stage === 'ready') return PRICES.bombGo;
    if (this.stage === 'march') {
      const c = cliff(this);
      if (c && Math.abs(c.x - this.x) < 5 * M) return PRICES.bombLight;
    }
    return 0;
  }
  override onPaid(m: Monarch): void {
    const w = this.world;
    if (this.stage === 'ready') {
      this.stage = 'march';
      w.jobs.add('push', this, 3, w.clock);
      // Два командира с отрядами идут за монархом.
      const soldiers = w.all<Person>('person').filter((p) => p.isSoldier).slice(0, 2);
      for (const s of soldiers) s.escort = m.id;
      w.banner('В ПЕЩЕРУ!', 'Ведите бомбу к утёсу — строители толкают её за вами');
      w.emit('bombMarch', this);
      return;
    }
    this.stage = 'armed';
    this.fuse = 6;
    w.jobs.removeFor(this);
    w.banner('ФИТИЛЬ ГОРИТ!', 'Бегите!');
    w.sound('fire', this.x, 1);
  }
  /** Строители толкают бомбу, если монарх впереди (ближе к утёсу). */
  push(dt: number): void {
    if (this.stage !== 'march') return;
    const w = this.world;
    const c = cliff(this);
    if (!c) return;
    const dir = Math.sign(c.x - this.x);
    const leader = w.all<Monarch>('monarch').some((m) => (m.x - this.x) * dir > 4);
    if (!leader) return;
    if (Math.abs(c.x - this.x) > 4 * M) this.x += dir * 0.8 * M * dt * 0.5;
  }
  override update(dt: number): void {
    if (this.stage === 'armed') {
      this.fuse -= dt;
      if (fxRng.chance(dt * 20)) this.world.fx.particles.spawn({ x: this.x + 4, y: 20, vx: fxRng.range(-10, 10), vy: 20, life: 0.4, max: 0.4, color: '#ffcf5a', emissive: true });
      if (this.fuse <= 0) this.explode();
    }
  }
  private explode(): void {
    const w = this.world;
    this.stage = 'boom';
    this.dead = true;
    w.fx.shake(14);
    w.sound('bomb', this.x, 1);
    w.fx.particles.burst(this.x, 20, 120, { color: '#ff8a3a', speed: 140, life: 1.6, emissive: true, gravity: 60, spread: Math.PI * 2, size: 2 });
    w.fx.particles.burst(this.x, 20, 60, { color: '#3a3238', speed: 90, life: 2.4, drag: 0.8, size: 3, spread: Math.PI * 2 });
    // Все подданные рядом со взрывом получают удар.
    for (const p of w.all<Person>('person')) if (Math.abs(p.x - this.x) < 6 * M) p.hitByGreed(this.x);
    w.caveCleared = true;
    for (const g of w.all<Greed>('greed')) g.retreating = true;
    for (const s of w.all<Structure>('structure')) if (s instanceof Nest) s.dead = true;
    // Пещера «выплёвывает» украденные самоцветы.
    for (let i = 0; i < w.stolenGems; i++) {
      const c = new Coin(this.x, 20, fxRng.range(-60, 60), fxRng.range(60, 120), 'gem');
      w.add(c);
    }
    w.stolenGems = 0;
    w.banner('ПЕЩЕРА РАЗРУШЕНА', 'Жадность больше не вернётся на этот остров', 7);
    w.emit('caveCleared');
  }
  lights(out: Light[]): void {
    if (this.stage === 'armed') out.push({ x: this.x + 4, y: 20, radius: 30, color: hex('#ffb040'), intensity: 1, flicker: 1 });
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    blit(ctx, bombSprite(), r.sx(this.x), r.sy(0));
  }
}

/** Гнездо в пещере: выпускает пачку Жадности, пока рядом бомба. */
export class Nest extends Structure {
  readonly type = 'portal' as const;
  readonly kind = 'nest';
  destroyed = false;
  private timer = 2;
  constructor(x: number) {
    super();
    this.x = x;
    this.z = 4;
    this.hp = GREED.nestHp;
    this.maxHp = GREED.nestHp;
  }
  override damage(amount: number): boolean {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.dead = true;
      this.world.fx.particles.burst(this.x, 10, 30, { color: '#6a3a98', speed: 60, life: 1, emissive: true, spread: Math.PI * 2 });
      return true;
    }
    return false;
  }
  override update(dt: number): void {
    const w = this.world;
    const bomb = w.all<Structure>('structure').find((s) => (s as Bomb).isBomb && (s as Bomb).stage === 'march');
    if (!bomb || Math.abs(bomb.x - this.x) > 30 * M) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = GREED.nestEvery;
    for (let i = 0; i < GREED.nestBatch; i++) {
      const g = new Greed(this.x + fxRng.range(-6, 6), 'greedling', 1 + fxRng.int(0, 2), fxRng.int(0, 5), 0);
      g.stayDay = true;
      g.defender = true;
      g.homePortal = this.id;
      w.add(g);
    }
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    blit(ctx, nestSprite(), r.sx(this.x), r.sy(0));
  }
}
