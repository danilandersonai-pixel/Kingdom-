// Предметы на земле: монеты, самоцветы, выбитые инструменты и корона.
// Монеты подпрыгивают, блестят, их подбирают монарх, жители и Жадность.

import { Entity } from '../entity';
import type { Renderer } from '../../render/renderer';
import { blit } from '../../engine/sprite';
import { coinSprites, gemSprite, crownSprite, rackItemSprite, type RackItem } from '../../art/items';
import { fxRng } from '../../engine/rng';
import { TIME } from '../config';

export type ItemKind = 'coin' | 'gem';

export class Coin extends Entity {
  readonly tag = 'coin' as const;
  kind: ItemKind;
  /** Кто уже бежит за этой монетой (id жителя или Жадности). */
  claimedBy = 0;
  /** Нельзя подобрать, пока летит (сек). */
  noPickup = 0;
  /** Монарх, бросивший монету, не подберёт её обратно столько секунд. */
  ownerLock = 0;
  owner = 0;
  /** Кому летит монета (id монарха), если её подбросили ему. */
  homing = 0;
  settled = false;
  private spin = fxRng.next() * 6;
  age = 0;
  /** Монета упала в воду и тонет. */
  sinking = 0;

  constructor(x: number, y: number, vx: number, vy: number, kind: ItemKind = 'coin') {
    super();
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.z = 40;
  }

  get drawRadius(): number {
    return 6;
  }

  update(dt: number): void {
    this.age += dt;
    if (this.noPickup > 0) this.noPickup -= dt;
    if (this.ownerLock > 0) this.ownerLock -= dt;
    const w = this.world;
    // Лежащая монета исчезает через полдня.
    if (this.settled && this.age > TIME.coinLifetime && !this.claimedBy) {
      this.dead = true;
      w.fx.particles.burst(this.x, 2, 3, { color: '#fff0a0', speed: 10, life: 0.5, emissive: true });
      return;
    }
    if (this.homing) {
      const m = w.all('monarch').find((e) => e.id === this.homing);
      if (m && !m.dead) {
        const dx = m.x - this.x;
        this.vx += Math.sign(dx) * 220 * dt;
        this.vx *= Math.exp(-3 * dt);
      }
    }
    if (!this.settled) {
      this.vy -= 260 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.y <= 0 && this.sinking) {
        // Монета укатилась в реку — потеряна.
        this.dead = true;
        w.fx.ripple(this.x, 3);
        w.sound('splash', this.x, 0.35);
        return;
      }
      if (this.y <= 0) {
        this.y = 0;
        if (Math.abs(this.vy) > 30) {
          this.vy = -this.vy * 0.38;
          this.vx *= 0.6;
          w.sound('coinDrop', this.x, 0.35);
        } else {
          this.vy = 0;
          this.vx = 0;
          this.settled = true;
        }
      }
      const isl = w.island;
      if (this.x < isl.left - 10 || this.x > isl.right + 10) {
        this.dead = true;
        w.fx.ripple(this.x, 3);
        w.sound('splash', this.x, 0.4);
      }
    }
    this.spin += dt * (this.settled ? 2 : 14);
    // Блеск лежащей монеты.
    if (this.settled && fxRng.chance(dt * 0.35)) {
      w.fx.particles.spawn({ x: this.x + fxRng.range(-2, 2), y: 3 + fxRng.range(0, 2), vy: 4, life: 0.5, max: 0.5, color: this.kind === 'gem' ? '#c8ffff' : '#fff6c0', emissive: true });
    }
  }

  kick(vx: number, vy: number): void {
    this.settled = false;
    this.vx = vx;
    this.vy = vy;
  }

  draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const sx = r.sx(this.x);
    const sy = r.sy(this.y);
    if (this.kind === 'gem') {
      blit(ctx, gemSprite(), sx, sy);
      return;
    }
    const frames = coinSprites();
    const f = this.settled ? (Math.sin(this.spin) > 0.97 ? 1 : 0) : Math.floor(this.spin) % frames.length;
    blit(ctx, frames[f], sx, sy);
  }
}

/** Выбитый у жителя инструмент — лежит, пока его не подберут. */
export class DroppedTool extends Entity {
  readonly tag = 'item' as const;
  item: RackItem;
  claimedBy = 0;
  settled = false;
  age = 0;

  constructor(x: number, item: RackItem, vx = 0, vy = 40) {
    super();
    this.x = x;
    this.item = item;
    this.vx = vx;
    this.vy = vy;
    this.y = 6;
    this.z = 39;
  }

  update(dt: number): void {
    this.age += dt;
    if (this.settled) return;
    this.vy -= 240 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      this.y = 0;
      this.vy = 0;
      this.vx = 0;
      this.settled = true;
    }
  }

  draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const s = rackItemSprite(this.item);
    ctx.save();
    const sx = r.sx(this.x);
    const sy = r.sy(this.y);
    // Лежит на боку.
    ctx.translate(sx, sy - 1);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(s.img, -s.h + 1, -Math.floor(s.w / 2));
    ctx.restore();
  }
}

/** Корона, сбитая с монарха. */
export class DroppedCrown extends Entity {
  readonly tag = 'item' as const;
  carriedBy = 0;
  owner: number;

  constructor(x: number, owner: number) {
    super();
    this.x = x;
    this.y = 8;
    this.vy = 60;
    this.vx = (fxRng.next() - 0.5) * 30;
    this.owner = owner;
    this.z = 45;
  }

  update(dt: number): void {
    if (this.carriedBy) return;
    this.vy -= 240 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      this.y = 0;
      this.vy = 0;
      this.vx = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    if (this.carriedBy) return;
    blit(ctx, crownSprite(), r.sx(this.x), r.sy(this.y));
  }
}
