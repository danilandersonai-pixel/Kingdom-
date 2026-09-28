// Городской центр (7 тиров, строится сам, перезарядка между улучшениями)
// и лавки инструментов со стойками, откуда жители забирают инструменты.

import { Structure } from './structure';
import type { Entity } from '../entity';
import type { Monarch } from '../entities/monarch';
import type { Renderer } from '../../render/renderer';
import type { Light } from '../../render/lighting';
import { blit, hex } from '../../engine/sprite';
import { shopSprite, scaffoldSprite, type ShopKind } from '../../art/buildings';
import { townCenterSprite, tcDetails, tcFrame, TC_SIZES } from '../../art/town';
import { nightFactor } from '../../render/atmosphere';
import { rackItemSprite, type RackItem } from '../../art/items';
import { TC_TIERS, TIME, PRICES, M } from '../config';
import { fxRng } from '../../engine/rng';

export class TownCenter extends Structure {
  readonly type = 'townCenter' as const;
  cooldown = 0;
  banner = '#a82a2a';
  private fireT = 0;

  constructor(x: number, level = 0) {
    super();
    this.x = x;
    this.level = level;
    this.payWidth = 16;
    this.z = 8;
    this.payPriority = 3;
  }

  get drawRadius(): number {
    return 50;
  }

  get lit(): boolean {
    return this.level >= 1;
  }

  override slotY(): number {
    const [, h] = TC_SIZES[Math.min(this.level, 7)];
    return Math.max(24, h + 8);
  }

  override price(_m: Monarch): number {
    if (this.building || this.cooldown > 0) return 0;
    const next = this.level + 1;
    if (next >= TC_TIERS.length) return 0;
    if (TC_TIERS[next].tech > this.world.meta.tech) return 0;
    return TC_TIERS[next].cost;
  }

  override onPaid(_m: Monarch): void {
    this.startBuild(this.level + 1, TC_TIERS[this.level + 1].work);
    this.world.sound('upgrade', this.x, 0.7);
  }

  override finishBuild(): void {
    this.level = this.targetLevel;
    this.cooldown = this.level === 1 ? 20 : TIME.tcCooldown;
    this.world.sound('bell', this.x, 1);
    this.world.emit('tcUpgraded', this.level, this);
    if (this.level === 1) this.world.banner('КОРОЛЕВСТВО ОСНОВАНО', 'Костёр горит — королевство живёт');
    else this.world.banner(TC_TIERS[this.level].name.toUpperCase(), 'Городской центр улучшен');
  }

  override update(dt: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;
    // Городской центр строится сам — строители не нужны.
    if (this.building) {
      this.addWork(dt);
      if (fxRng.chance(dt * 3)) this.world.fx.particles.burst(this.x + fxRng.range(-12, 12), fxRng.range(4, 20), 2, { color: '#c8a878', speed: 20, gravity: 120, life: 0.5 });
      if (fxRng.chance(dt * 1.5)) this.world.sound('hammer', this.x, 0.35);
    }
    if (this.lit) {
      this.fireT += dt;
      const p = this.world.fx.particles;
      if (fxRng.chance(dt * 14)) {
        p.spawn({ x: this.x + fxRng.range(-3, 3), y: 4, vx: fxRng.range(-4, 4), vy: fxRng.range(14, 30), life: 1.2, max: 1.2, color: fxRng.chance(0.5) ? '#ffcf5a' : '#ff8a3a', emissive: true, wobble: 25 });
      }
      if (fxRng.chance(dt * 3)) {
        p.spawn({ x: this.x + fxRng.range(-2, 2), y: 10, vx: fxRng.range(-3, 3) - 2, vy: 10, life: 2.5, max: 2.5, color: 'rgba(120,110,100,0.5)', size: 2, drag: 0.3, wobble: 6 });
      }
      if (fxRng.chance(dt * 0.5)) this.world.sound('fire', this.x, 0.25);
      // Дым из труб.
      const lvl = Math.min(this.level, 7);
      if (lvl >= 2 && fxRng.chance(dt * 2.2)) {
        const s = tcFrame(lvl);
        for (const [x, y] of tcDetails(lvl).chimneys) {
          p.spawn({ x: this.x - s.ax + x + fxRng.range(-1, 1), y: s.h - y, vx: fxRng.range(-2, 2) + 3, vy: fxRng.range(6, 10), life: 3.5, max: 3.5, color: 'rgba(170,165,160,0.45)', size: 2, drag: 0.2, wobble: 5 });
        }
      }
    }
  }

  lights(out: Light[]): void {
    if (this.lit) out.push({ x: this.x, y: 6, radius: 96 + this.level * 6, color: hex('#ffa850'), intensity: 1, flicker: 1 });
    // Факелы у ворот.
    const lvl = Math.min(this.level, 7);
    if (lvl >= 4) {
      const s = tcFrame(lvl);
      for (const [x, y] of tcDetails(lvl).torches) out.push({ x: this.x - s.ax + x, y: s.h - y, radius: 34, color: hex('#ffb060'), intensity: 0.7, flicker: 1 });
    }
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const sx = r.sx(this.x);
    const gy = r.sy(0);
    const lvl = Math.min(this.level, 7);
    if (lvl > 0) {
      const s = townCenterSprite(lvl, this.banner);
      blit(ctx, s, sx, gy);
      // Флаги на ветру.
      const t = this.world.clock;
      for (const [fx0, fy0] of tcDetails(lvl).flags) {
        const x0 = sx - s.ax + fx0 + 1;
        const y0 = gy - s.h + fy0;
        for (let i = 0; i < 7; i++) {
          const wave = Math.round(Math.sin(t * 5 - i * 0.9) * (i / 7) * 1.6);
          const len = i < 6 ? 4 : 3;
          ctx.fillStyle = i === 0 ? '#6a1616' : this.banner;
          ctx.fillRect(x0 + i, y0 + wave, 1, len);
          if (i === 3) {
            ctx.fillStyle = '#f2c84a';
            ctx.fillRect(x0 + i, y0 + wave + 1, 1, 1);
          }
        }
      }
    }
    if (this.scaffold) {
      const [w, h] = TC_SIZES[Math.min(this.targetLevel, 7)];
      blit(ctx, scaffoldSprite(w + 4, h + 2), sx, gy, false, 0.85);
    }
    // Кострище перед городским центром.
    blit(ctx, townCenterSprite(0), sx, gy);
  }

  drawEmissive(ctx: CanvasRenderingContext2D, r: Renderer): void {
    if (!this.lit) return;
    const sx = r.sx(this.x);
    const gy = r.sy(0);
    // Ночью светятся окна и горят факелы.
    const lvl = Math.min(this.level, 7);
    const night = nightFactor(this.world.time.phase);
    if (lvl >= 2 && night > 0.05) {
      const s = townCenterSprite(lvl, this.banner);
      const d = tcDetails(lvl);
      const ox = sx - s.ax;
      const oy = gy - s.h;
      d.windows.forEach(([x, y, w, h], i) => {
        const flick = 0.8 + 0.2 * Math.sin(this.fireT * 3 + i * 1.7);
        ctx.globalAlpha = Math.min(1, night * 1.2) * flick;
        ctx.fillStyle = '#ffc860';
        ctx.fillRect(ox + x, oy + y, w, h);
        ctx.fillStyle = '#fff0b0';
        ctx.fillRect(ox + x, oy + y + h - 1, w, 1);
      });
      ctx.globalAlpha = 1;
      for (const [x, y] of d.torches) {
        const f = Math.sin(this.fireT * 17 + x) > 0 ? 1 : 0;
        ctx.fillStyle = '#5a3a22';
        ctx.fillRect(ox + x, oy + y, 1, 3);
        ctx.fillStyle = '#ff8a3a';
        ctx.fillRect(ox + x - 1 + f, oy + y - 3, 2, 3);
        ctx.fillStyle = '#ffe080';
        ctx.fillRect(ox + x, oy + y - 2, 1, 1);
      }
    }
    const t = this.fireT;
    const h1 = 5 + Math.round(Math.sin(t * 13) * 1.5 + Math.sin(t * 7.7) * 1);
    ctx.fillStyle = '#ff7a2a';
    ctx.fillRect(sx - 3, gy - h1 - 1, 6, h1);
    ctx.fillStyle = '#ffb040';
    ctx.fillRect(sx - 2, gy - h1 + 1, 4, h1 - 2);
    ctx.fillStyle = '#fff0a0';
    ctx.fillRect(sx - 1, gy - Math.max(2, h1 - 3), 2, Math.max(1, h1 - 3));
    if (Math.sin(t * 9) > 0.3) {
      ctx.fillStyle = '#ffcf5a';
      ctx.fillRect(sx + (Math.sin(t * 5) > 0 ? 2 : -3), gy - h1 - 3, 1, 2);
    }
  }

  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), cooldown: this.cooldown };
  }
}

const SHOP_ITEM: Record<ShopKind, RackItem> = { bow: 'bow', hammer: 'hammer', scythe: 'scythe', shield: 'shield', bomb: 'bomb', pike: 'pike', sword: 'sword', bread: 'bread' };
const SHOP_PRICE: Record<ShopKind, number> = { bow: PRICES.bow, hammer: PRICES.hammer, scythe: PRICES.scythe, shield: PRICES.shield, bomb: PRICES.bomb, pike: PRICES.pike, sword: PRICES.sword, bread: PRICES.bread };

export class Shop extends Structure {
  readonly type = 'shop' as const;
  kind: ShopKind;
  stock = 0;
  /** Сколько жителей уже идут за инструментом. */
  reserved = 0;
  max = 4;
  /** Сторона, за которую отвечает стойка (для щитов). */
  side: -1 | 0 | 1 = 0;
  /** Дополнительное условие доступности (например, каменная стена в секторе). */
  condition: (() => boolean) | null = null;

  constructor(x: number, kind: ShopKind, max = 4) {
    super();
    this.x = x;
    this.kind = kind;
    this.max = max;
    this.payWidth = 12;
    this.z = 10;
    this.payPriority = 2;
  }

  get drawRadius(): number {
    return 14;
  }

  get item(): RackItem {
    return SHOP_ITEM[this.kind];
  }

  get available(): number {
    return this.stock - this.reserved;
  }

  override slotY(): number {
    return 28;
  }

  override price(_m: Monarch): number {
    if (this.stock >= this.max) return 0;
    if (this.condition && !this.condition()) return 0;
    return SHOP_PRICE[this.kind];
  }

  override onPaid(_m: Monarch): void {
    this.stock++;
    this.world.sound('purchase', this.x, 0.6);
  }

  /** Житель забирает инструмент со стойки. */
  take(): boolean {
    if (this.stock <= 0) return false;
    this.stock--;
    this.reserved = Math.max(0, this.reserved - 1);
    return true;
  }

  override update(): void {
    // Бронь пересчитывается честно: сколько жителей сейчас реально идут сюда.
    let n = 0;
    for (const p of this.world.all<Entity & { toolTarget: { kind: string; id: number } | null }>('person')) {
      if (p.toolTarget && p.toolTarget.kind === 'shop' && p.toolTarget.id === this.id) n++;
    }
    this.reserved = n;
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const sx = r.sx(this.x);
    const gy = r.sy(0);
    blit(ctx, shopSprite(this.kind), sx, gy);
    const it = rackItemSprite(this.item);
    for (let i = 0; i < this.stock; i++) {
      const ix = sx - 7 + i * 5;
      blit(ctx, it, ix, gy - 22 + 11 + 11);
    }
  }

  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), kind: this.kind, stock: this.stock, max: this.max, side: this.side };
  }
}

export const SHOP_OFFSETS = {
  hammer: -6 * M,
  bow: 6 * M,
  scythe: -11 * M,
};
