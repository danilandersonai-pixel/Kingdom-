// Экономика: торговец с ослом (острова 1–2), банкир (тир ГЦ 4)
// и Хранитель самоцветов (тир ГЦ 6) у центральной пристани.

import { Structure } from './structure';
import { Entity } from '../entity';
import type { Monarch } from '../entities/monarch';
import type { Renderer } from '../../render/renderer';
import { blit, makeCanvas, type Sprite } from '../../engine/sprite';
import { humanFrames } from '../../art/humans';
import { mountFrames } from '../../art/horse';
import { hutSprite } from '../../art/buildings';
import { chimneySmoke } from './hermits';
import { PRICES, M, TITHE, PURSE } from '../config';
import { Coin } from '../entities/pickups';
import { townX } from '../kingdom';
import { fxRng } from '../../engine/rng';
import { rect, px, ellipse } from '../../art/px';
import { HORSE } from '../../art/horse';

const DONKEY = { ...HORSE, body: '#8a8078', mane: '#4a4440', socks: undefined, blaze: false, saddle: '#6a5a3a', saddleTrim: '#8a7a5a', scale: 0.82 };

/** Хижина торговца в лесу. */
export class MerchantHut extends Structure {
  readonly type = 'merchant' as const;
  constructor(x: number) {
    super();
    this.x = x;
    this.z = 5;
  }
  get drawRadius(): number {
    return 24;
  }
  override update(dt: number): void {
    chimneySmoke(this.world, this.x, dt);
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    blit(ctx, hutSprite(), r.sx(this.x), r.sy(0));
  }
}

type MerchantState = 'toTown' | 'atTown' | 'toHut' | 'loading';

/** Торговец: приходит к костру с мешками, отдаёт 8 монет, берёт 1 и уходит за новой партией. */
export class Merchant extends Structure {
  readonly type = 'merchant' as const;
  hutId: number;
  state: MerchantState = 'toTown';
  loaded = true;
  /** День, когда можно отдать партию (на следующее утро после прихода). */
  giveDay: number;
  private giving = 0;
  private giveTimer = 0;
  private walking = false;

  constructor(x: number, hutId: number, day: number) {
    super();
    this.x = x;
    this.hutId = hutId;
    this.giveDay = day + 1;
    this.z = 21;
    this.payWidth = 14;
    this.payPriority = 2;
  }

  get drawRadius(): number {
    return 24;
  }

  private hut(): MerchantHut | null {
    const h = this.world.all<Structure>('structure').find((s) => s.id === this.hutId && !s.dead) as MerchantHut | undefined;
    return h ?? null;
  }

  override slotY(): number {
    return 28;
  }

  override price(_m: Monarch): number {
    if (this.state !== 'atTown' || this.loaded || this.giving > 0) return 0;
    if (!this.world.time.isDay || this.world.time.phase > 0.58) return 0;
    return PRICES.merchantFee;
  }

  override onPaid(_m: Monarch): void {
    this.state = 'toHut';
    this.world.sound('coin', this.x, 0.6);
  }

  override update(dt: number): void {
    const w = this.world;
    const hut = this.hut();
    if (!hut) {
      // Хижину снесли вместе с лесом — торговец уходит навсегда.
      this.dead = true;
      return;
    }
    const tx = townX(w) + 3 * M;
    this.walking = false;
    const walk = (to: number) => {
      const dx = to - this.x;
      if (Math.abs(dx) < 2) return true;
      this.facing = dx > 0 ? 1 : -1;
      this.x += Math.sign(dx) * Math.min(Math.abs(dx), 18 * dt);
      this.walking = true;
      return false;
    };
    switch (this.state) {
      case 'toTown':
        if (walk(tx)) this.state = 'atTown';
        break;
      case 'atTown':
        if (this.loaded && w.time.day >= this.giveDay && w.time.isDay) this.tryGive(dt);
        break;
      case 'toHut':
        if (walk(hut.x)) {
          this.state = 'loading';
        }
        break;
      case 'loading':
        break;
    }
  }

  /** Утро: торговец снова идёт к костру с полным ослом. */
  dawn(day: number): void {
    if (this.state === 'loading') {
      this.state = 'toTown';
      this.loaded = true;
      this.giveDay = day;
    }
  }

  private tryGive(dt: number): void {
    const w = this.world;
    if (this.giving <= 0) {
      const m = w.all<Monarch>('monarch').find((mm) => mm.hasCrown && Math.abs(mm.x - this.x) < TITHE.range && Math.abs(mm.velocity) <= mm.walkSpeed * TITHE.speedFrac);
      if (!m) return;
      this.giving = PRICES.merchantGives;
      this.giveTimer = 0;
    }
    this.giveTimer -= dt;
    if (this.giveTimer > 0) return;
    const m = w.all<Monarch>('monarch').find((mm) => mm.hasCrown && Math.abs(mm.x - this.x) < TITHE.range * 1.5);
    if (!m || m.purseSlots >= PURSE.overflow) return;
    this.giveTimer = 0.18;
    this.giving--;
    const c = new Coin(this.x, 14, (m.x - this.x) * 1.4, 70);
    c.homing = m.id;
    w.add(c);
    if (this.giving <= 0) this.loaded = false;
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const sx = r.sx(this.x);
    const gy = r.sy(0);
    const anim = this.walking ? 'walk' : 'idle';
    const donkey = mountFrames('donkey', anim, DONKEY, null);
    const df = donkey[Math.floor(this.anim * (this.walking ? 7 : 2)) % donkey.length];
    const dx = this.x - this.facing * 16;
    blit(ctx, df, r.sx(dx), gy, this.facing < 0);
    if (this.loaded) {
      rect(ctx, r.sx(dx) - 5, gy - 18, 5, 5, '#8a6a3a');
      rect(ctx, r.sx(dx) + 1, gy - 18, 5, 5, '#7a5a30');
      px(ctx, r.sx(dx) - 3, gy - 17, '#f2c84a');
    }
    const frames = humanFrames('merchant', 0, anim);
    blit(ctx, frames[Math.floor(this.anim * (this.walking ? 8 : 3)) % frames.length], sx, gy, this.facing < 0);
  }

  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), hutId: this.hutId, state: this.state, loaded: this.loaded, giveDay: this.giveDay };
  }
}

// ——— Банкир ———

const pileCache = new Map<number, Sprite>();
function goldPile(n: number): Sprite {
  const k = Math.min(8, Math.ceil(Math.log2(n + 1)));
  let s = pileCache.get(k);
  if (s) return s;
  const [c, ctx] = makeCanvas(24, 12);
  ellipse(ctx, 12, 12, 3 + k * 1.2, 2 + k * 1.1, '#c8962a');
  ellipse(ctx, 12, 11, 2 + k, 1.5 + k * 0.9, '#f2c84a');
  for (let i = 0; i < k * 2; i++) px(ctx, 12 + ((i * 7) % (k * 2 + 1)) - k, 11 - ((i * 3) % (k + 1)), '#fff4c0');
  s = { img: c, w: 24, h: 12, ax: 12, ay: 12 };
  pileCache.set(k, s);
  return s;
}

export class Banker extends Entity {
  readonly tag = 'npc' as const;
  carrying = 0;
  state: 'idle' | 'collect' | 'deposit' | 'hide' | 'withdraw' = 'idle';
  private coinId = 0;
  private stillTimer = 0;
  private withdrawLeft = 0;
  private throwTimer = 0;
  private walking = false;

  constructor(x: number) {
    super();
    this.x = x;
    this.z = 21;
  }

  get drawRadius(): number {
    return 20;
  }

  /** Проценты за ночь. */
  static interest(bank: number): number {
    if (bank < 3) return 0;
    if (bank > 100) return 8;
    return Math.ceil(bank * 0.07);
  }

  override update(dt: number): void {
    const w = this.world;
    const home = townX(w) - 2.5 * M;
    this.walking = false;
    const walk = (to: number) => {
      const dx = to - this.x;
      if (Math.abs(dx) < 2) return true;
      this.facing = dx > 0 ? 1 : -1;
      this.x += Math.sign(dx) * Math.min(Math.abs(dx), 24 * dt);
      this.walking = true;
      return false;
    };
    if (!w.time.isDay || w.time.phase > 0.6) {
      if (this.carrying) {
        w.meta.bank += this.carrying;
        this.carrying = 0;
      }
      this.state = 'hide';
      walk(townX(w));
      return;
    }
    if (this.state === 'hide') this.state = 'idle';

    // Монеты, брошенные монархом рядом, — в банк.
    if (this.state === 'idle' || this.state === 'collect') {
      let coin = this.coinId ? w.all<Coin>('coin').find((c) => c.id === this.coinId && !c.dead) : null;
      if (!coin) {
        coin = w.nearest(w.all<Coin>('coin'), this.x, 3.5 * M, (c) => c.kind === 'coin' && c.owner !== 0 && c.ownerLock > 0 && (!c.claimedBy || c.claimedBy === this.id));
        if (coin) {
          coin.claimedBy = this.id;
          this.coinId = coin.id;
          this.state = 'collect';
        }
      }
      if (coin) {
        if (walk(coin.x) || Math.abs(coin.x - this.x) < 3) {
          if (coin.y < 6) {
            coin.dead = true;
            this.carrying++;
            this.coinId = 0;
            w.sound('coin', this.x, 0.4);
          }
        }
        if (this.carrying >= 10) this.state = 'deposit';
        return;
      }
      if (this.carrying > 0) this.state = 'deposit';
      else this.state = 'idle';
    }
    if (this.state === 'deposit') {
      if (walk(townX(w))) {
        w.meta.bank += this.carrying;
        this.carrying = 0;
        this.state = 'idle';
      }
      return;
    }
    if (this.state === 'withdraw') {
      const m = w.all<Monarch>('monarch').find((mm) => mm.hasCrown && Math.abs(mm.x - this.x) < 2.5 * M);
      if (!m || Math.abs(m.velocity) > 1 || this.withdrawLeft <= 0 || w.meta.bank <= 0) {
        this.state = 'idle';
        this.stillTimer = -2;
        return;
      }
      this.throwTimer -= dt;
      if (this.throwTimer <= 0) {
        this.throwTimer = 0.25;
        if (m.purseSlots >= PURSE.full) {
          this.withdrawLeft = 0;
          return;
        }
        w.meta.bank--;
        this.withdrawLeft--;
        const c = new Coin(this.x, 14, (m.x - this.x) * 1.4, 60);
        c.homing = m.id;
        w.add(c);
      }
      return;
    }
    // Идём на своё место; монарх стоит рядом — начинаем выдачу.
    if (!walk(home)) return;
    const m = w.all<Monarch>('monarch').find((mm) => mm.hasCrown && Math.abs(mm.x - this.x) < 2 * M);
    if (m && Math.abs(m.velocity) < 1 && !m.input?.dropping && w.meta.bank > 0) {
      this.stillTimer += dt;
      if (this.stillTimer > 1.5) {
        this.state = 'withdraw';
        this.withdrawLeft = Math.min(PURSE.full - m.purseSlots, Math.max(1, Math.floor(w.meta.bank / 3)));
        this.stillTimer = 0;
      }
    } else if (this.stillTimer > 0) this.stillTimer = 0;
    else this.stillTimer = Math.min(0, this.stillTimer + dt);
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const w = this.world;
    // Вклад виден кучей золота у городского центра.
    if (w.meta.bank > 0) blit(ctx, goldPile(w.meta.bank), r.sx(townX(w) - 1.2 * M), r.sy(0));
    if (this.state === 'hide' && Math.abs(this.x - townX(w)) < 3) return;
    const frames = humanFrames('banker', 0, this.walking ? 'walk' : this.state === 'withdraw' ? 'act' : 'idle');
    blit(ctx, frames[Math.floor(this.anim * 8) % frames.length], r.sx(this.x), r.sy(0), this.facing < 0);
  }
}

// ——— Хранитель самоцветов ———

let keeperSprite: Sprite | null = null;
function keeperChest(): Sprite {
  if (keeperSprite) return keeperSprite;
  const [c, ctx] = makeCanvas(16, 12);
  rect(ctx, 1, 3, 14, 9, '#7a7a84');
  rect(ctx, 1, 3, 14, 2, '#9a9aa4');
  for (let x = 2; x < 15; x += 4) rect(ctx, x, 6, 1, 6, '#5e5e66');
  rect(ctx, 7, 6, 2, 3, '#5ae0f0');
  keeperSprite = { img: c, w: 16, h: 12, ax: 8, ay: 12 };
  return keeperSprite;
}

export class GemKeeper extends Structure {
  readonly type = 'chest' as const;
  constructor(x: number) {
    super();
    this.x = x;
    this.z = 7;
    this.payWidth = 12;
    this.payPriority = 2;
  }
  get isGemKeeper(): boolean {
    return true;
  }
  override slotY(): number {
    return 18;
  }
  override price(m: Monarch): number {
    if (this.world.meta.gemKeeper <= 0) return 0;
    if (m.purseSlots + PURSE.gemSlots > PURSE.full) return 0;
    return PRICES.gemKeeperTake;
  }
  override onPaid(m: Monarch): void {
    this.world.meta.gemKeeper--;
    m.gems++;
    m.purseFlash = 2.5;
    this.world.sound('gem', this.x, 0.8);
  }
  override update(): void {
    // Брошенные рядом самоцветы — на хранение.
    const w = this.world;
    for (const c of w.all<Coin>('coin')) {
      if (c.kind !== 'gem' || c.dead || c.y > 6) continue;
      if (Math.abs(c.x - this.x) < 2 * M && c.owner) {
        c.dead = true;
        w.meta.gemKeeper++;
        w.sound('gem', this.x, 0.6);
      }
    }
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    blit(ctx, keeperChest(), r.sx(this.x), r.sy(0));
  }
}

void fxRng;
