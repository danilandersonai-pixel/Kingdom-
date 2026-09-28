// Стены и башни лучников: уровни, прочность, стройка, ремонт, разрушение.

import { Structure } from './structure';
import type { Monarch } from '../entities/monarch';
import type { Renderer } from '../../render/renderer';
import type { Light } from '../../render/lighting';
import { blit, hex } from '../../engine/sprite';
import { wallSprite, towerSprite, scaffoldSprite, TOWER_PLATFORM } from '../../art/buildings';
import { WALL_TIERS, TOWER_TIERS, TC_CAPS } from '../config';
import { fxRng } from '../../engine/rng';
import type { WallLike } from '../kingdom';
import { passengerKind, towerSpecialPrice, wallHornPrice, applyHermitUpgrade } from './hermits';

function tcLevel(s: Structure): number {
  const tc = s.world.all<Structure>('structure').find((e) => e.type === 'townCenter');
  return tc ? tc.level : 0;
}

/** Стройка закончена: облачко пыли и искорки. */
function completionPuff(s: Structure): void {
  const p = s.world.fx.particles;
  p.burst(s.x, 3, 12, { color: '#b8a88a', speed: 28, spread: Math.PI, life: 0.9, drag: 2.2, size: 2 });
  p.burst(s.x, 14, 6, { color: '#fff4c8', speed: 24, spread: Math.PI * 2, life: 0.6, emissive: true });
}

export class Wall extends Structure implements WallLike {
  readonly type = 'wall' as const;
  /** Уровень построен, но стена разрушена — нужна отстройка. */
  destroyed = false;
  rebuilding = false;
  /** Стена, поставленная самим городским центром. */
  inner = false;
  private hitFlash = 0;
  /** Постройка отшельника рога на этой стене. */
  horn = false;

  constructor(x: number, level = 0) {
    super();
    this.x = x;
    this.level = level;
    this.payWidth = 12;
    this.z = 34;
    this.payPriority = 2;
    if (level > 0) this.hp = this.maxHpNow;
  }

  get blocks(): boolean {
    return this.level >= 1 && !this.destroyed && this.hp > 0;
  }

  get maxHpNow(): number {
    const base = WALL_TIERS[this.level]?.hp ?? 0;
    return this.world?.meta.blessings.has('building') ? Math.round(base * 1.8) : base;
  }

  get drawRadius(): number {
    return 14;
  }

  override slotY(): number {
    return [10, 20, 28, 34, 40, 46][this.level] + 6;
  }

  override price(m: Monarch): number {
    if (this.building) return 0;
    if (this.destroyed) return WALL_TIERS[this.level].rebuild;
    const horn = wallHornPrice(this, passengerKind(this.world, m));
    if (horn) return horn;
    const next = this.level + 1;
    if (next >= WALL_TIERS.length) return 0;
    if (next > TC_CAPS[tcLevel(this)].wall) return 0;
    if (WALL_TIERS[next].tech > this.world.meta.tech) return 0;
    if (this.world.terrain.isForest(this.x)) return 0;
    return WALL_TIERS[next].cost;
  }

  override onPaid(m: Monarch): void {
    const hk = passengerKind(this.world, m);
    if (!this.destroyed && wallHornPrice(this, hk)) {
      applyHermitUpgrade(this.world, this, hk!, m);
      return;
    }
    if (this.destroyed) {
      this.rebuilding = true;
      this.startBuild(this.level, Math.max(4, WALL_TIERS[this.level].work * 0.6));
    } else {
      this.startBuild(this.level + 1, WALL_TIERS[this.level + 1].work);
    }
    this.world.jobs.add('build', this, 2, this.world.clock);
  }

  override finishBuild(): void {
    completionPuff(this);
    if (this.rebuilding) {
      this.rebuilding = false;
      this.destroyed = false;
    } else {
      this.level = this.targetLevel;
      if (this.level === 1) this.world.terrain.block(this.x - 6, this.x + 6, true);
    }
    this.hp = this.maxHpNow;
    this.world.jobs.removeFor(this, 'build');
    this.world.sound('build', this.x, 0.8);
  }

  /** Мгновенно поднять стену до уровня (бесплатные стены городского центра). */
  grant(level: number): void {
    if (this.level >= level && !this.destroyed) return;
    if (this.level === 0) this.world.terrain.block(this.x - 6, this.x + 6, true);
    this.level = Math.max(this.level, level);
    this.destroyed = false;
    this.building = false;
    this.scaffold = false;
    this.hp = this.maxHpNow;
    this.world.jobs.removeFor(this);
  }

  override damage(amount: number, fromX: number): boolean {
    if (!this.blocks) return false;
    this.hp -= amount;
    this.hitFlash = 0.15;
    const w = this.world;
    const side = Math.sign(fromX - this.x) || 1;
    w.fx.particles.burst(this.x + side * 4, 6 + fxRng.range(0, 10), 3, {
      color: this.level >= 3 ? '#9a9aa0' : '#8a6040',
      speed: 30,
      gravity: 160,
      life: 0.6,
      spread: 1.6,
    });
    w.sound('wallHit', this.x, 0.6);
    if (this.hp <= 0) {
      this.hp = 0;
      this.destroyed = true;
      this.building = false;
      this.scaffold = false;
      w.jobs.removeFor(this);
      w.sound('wallBreak', this.x, 1);
      w.fx.shake(4);
      w.fx.particles.burst(this.x, 10, 18, { color: this.level >= 3 ? '#8a8a90' : '#6a4a30', speed: 60, gravity: 180, life: 1, spread: 2.4 });
      return true;
    }
    if (!w.jobs.jobs.some((j) => j.target === this)) w.jobs.add('repair', this, 2, w.clock);
    return false;
  }

  /** Строитель чинит стену. */
  repair(amount: number): boolean {
    if (this.destroyed || this.building) return true;
    this.hp = Math.min(this.maxHpNow, this.hp + amount);
    if (this.hp >= this.maxHpNow) {
      this.world.jobs.removeFor(this, 'repair');
      return true;
    }
    return false;
  }

  override update(dt: number): void {
    if (this.hitFlash > 0) this.hitFlash -= dt;
    // Статуя строительства повышает прочность — держим hp в новых пределах.
    if (this.blocks && this.hp > this.maxHpNow) this.hp = this.maxHpNow;
    if (this.blocks && this.hp < this.maxHpNow && !this.world.jobs.jobs.some((j) => j.target === this)) {
      this.world.jobs.add('repair', this, 2, this.world.clock);
    }
  }

  lights(out: Light[]): void {
    if (this.blocks && this.level >= 2) out.push({ x: this.x, y: 16, radius: 34, color: hex('#ffb060'), intensity: 0.55, flicker: 0.8 });
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const sx = r.sx(this.x);
    const gy = r.sy(0);
    if (this.destroyed) {
      blit(ctx, wallSprite(0, 0), sx, gy);
      // Обломки.
      ctx.fillStyle = this.level >= 3 ? '#6a6a72' : '#5a3e28';
      ctx.fillRect(sx - 6, gy - 3, 3, 2);
      ctx.fillRect(sx + 2, gy - 2, 4, 2);
      ctx.fillRect(sx - 1, gy - 5, 2, 2);
    } else if (this.level > 0) {
      const dmg = 1 - this.hp / Math.max(1, this.maxHpNow);
      blit(ctx, wallSprite(this.level, dmg), sx, gy);
      if (this.hitFlash > 0) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#ffffff';
        const s = wallSprite(this.level, dmg);
        ctx.fillRect(sx - s.ax, gy - s.h, s.w, s.h);
        ctx.globalAlpha = 1;
      }
    } else {
      blit(ctx, wallSprite(0, 0), sx, gy);
    }
    if (this.scaffold) {
      const h = [10, 16, 24, 30, 36, 42][Math.min(5, this.targetLevel)];
      blit(ctx, scaffoldSprite(18, h), sx, gy, false, 0.9);
    }
  }

  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), destroyed: this.destroyed, rebuilding: this.rebuilding, inner: this.inner, horn: this.horn };
  }
}

export type TowerSpecial = null | 'ballista' | 'bakery' | 'knight';

export class Tower extends Structure {
  readonly type = 'tower' as const;
  /** id лучников, закреплённых за башней. */
  archers: number[] = [];
  special: TowerSpecial = null;

  constructor(x: number, level = 0) {
    super();
    this.x = x;
    this.level = level;
    this.payWidth = 12;
    this.z = 12;
    this.payPriority = 2;
  }

  get drawRadius(): number {
    return 16;
  }

  get slots(): number {
    return this.special === 'ballista' || this.special === 'bakery' ? 0 : TOWER_TIERS[this.level].archers;
  }

  get platform(): number {
    return TOWER_PLATFORM[Math.min(this.level, 6)];
  }

  get rangeBonus(): number {
    return TOWER_TIERS[this.level].range;
  }

  override slotY(): number {
    return this.platform + 14;
  }

  override price(m: Monarch): number {
    const sp = towerSpecialPrice(this, passengerKind(this.world, m));
    if (sp) return sp;
    if (this.building || this.special) return 0;
    const next = this.level + 1;
    if (next >= TOWER_TIERS.length) return 0;
    if (next > TC_CAPS[tcLevel(this)].tower) return 0;
    if (TOWER_TIERS[next].tech > this.world.meta.tech) return 0;
    if (this.world.terrain.isForest(this.x)) return 0;
    return TOWER_TIERS[next].cost;
  }

  override onPaid(m: Monarch): void {
    const hk = passengerKind(this.world, m);
    if (towerSpecialPrice(this, hk)) {
      applyHermitUpgrade(this.world, this, hk!, m);
      return;
    }
    this.startBuild(this.level + 1, TOWER_TIERS[this.level + 1].work);
    this.world.jobs.add('build', this, 2, this.world.clock);
  }

  override finishBuild(): void {
    completionPuff(this);
    this.level = this.targetLevel;
    if (this.level === 1) this.world.terrain.block(this.x - 7, this.x + 7, true);
    this.world.jobs.removeFor(this, 'build');
    this.world.sound('build', this.x, 0.8);
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const sx = r.sx(this.x);
    const gy = r.sy(0);
    blit(ctx, towerSprite(this.level), sx, gy);
    if (this.scaffold) {
      const h = TOWER_PLATFORM[Math.min(this.targetLevel, 6)] + 6;
      blit(ctx, scaffoldSprite(20, h), sx, gy, false, 0.9);
    }
  }

  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), special: this.special };
  }
}
