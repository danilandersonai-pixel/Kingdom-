// Порталы Жадности: малые (разрушаются отрядами), портал у дальней
// пристани (прочнее, бьёт щупальцами) и утёсный портал — вход в пещеру.

import { Structure } from './structure';
import type { Renderer } from '../../render/renderer';
import type { Light } from '../../render/lighting';
import { blit, hex } from '../../engine/sprite';
import { portalSprite, cliffSprite } from '../../art/portal';
import { GREED, M } from '../config';
import { fxRng } from '../../engine/rng';

export type PortalKind = 'small' | 'dock' | 'cliff';

export class Portal extends Structure {
  readonly type = 'portal' as const;
  kind: PortalKind;
  destroyed = false;
  /** Активен ли портал этой ночью (решается в полдень). */
  active = true;
  /** Недавно атакован — выпускает защитников. */
  underAttack = 0;
  private defenderTimer = 0;
  private tentacleTimer = 0;
  tentacle = 0;
  /** Сторона острова, где стоит портал. */
  side: -1 | 1;

  constructor(x: number, kind: PortalKind, side: -1 | 1) {
    super();
    this.x = x;
    this.kind = kind;
    this.side = side;
    this.maxHp = kind === 'dock' ? GREED.dockPortalHp : kind === 'small' ? GREED.smallPortalHp : 99999;
    this.hp = this.maxHp;
    this.z = 4;
  }

  get drawRadius(): number {
    // Утёс уходит далеко наружу от пещеры — не отсекать его раньше времени.
    return this.kind === 'cliff' ? 300 : 45;
  }

  get alive(): boolean {
    return !this.destroyed;
  }

  override damage(amount: number, _fromX: number): boolean {
    if (this.destroyed || this.kind === 'cliff') return false;
    this.hp -= amount;
    this.underAttack = 4;
    const w = this.world;
    w.fx.particles.burst(this.x, 18, 3, { color: '#8a4ab8', speed: 30, life: 0.6, emissive: true });
    if (fxRng.chance(0.3)) w.sound('portalHit', this.x, 0.5);
    if (this.hp <= 0) {
      this.hp = 0;
      this.destroyed = true;
      w.sound('portalBreak', this.x, 1);
      w.fx.shake(8);
      w.fx.particles.burst(this.x, 18, 60, { color: '#b070e0', speed: 90, life: 1.6, emissive: true, gravity: 30, spread: Math.PI * 2 });
      w.emit('portalDestroyed', this);
      return true;
    }
    return false;
  }

  override update(dt: number): void {
    if (this.destroyed) return;
    const w = this.world;
    if (this.underAttack > 0) {
      this.underAttack -= dt;
      this.defenderTimer -= dt;
      if (this.defenderTimer <= 0) {
        this.defenderTimer = GREED.defenderEvery;
        w.emit('portalDefender', this);
      }
    }
    // Щупальца портала у пристани.
    if (this.kind === 'dock') {
      this.tentacleTimer -= dt;
      if (this.tentacle > 0) this.tentacle -= dt;
      if (this.tentacleTimer <= 0) {
        this.tentacleTimer = 2.5;
        this.tentacle = 0.4;
        w.emit('portalTentacle', this, 3 * M);
      }
    }
    if (fxRng.chance(dt * 4)) {
      w.fx.particles.spawn({ x: this.x + fxRng.range(-8, 8), y: fxRng.range(8, 30), vx: fxRng.range(-4, 4), vy: fxRng.range(4, 14), life: 1.4, max: 1.4, color: fxRng.chance(0.5) ? '#9a5ad0' : '#5a2a88', emissive: true });
    }
  }

  lights(out: Light[]): void {
    if (!this.destroyed) out.push({ x: this.x, y: 20, radius: 50, color: hex('#8a4ac8'), intensity: 0.5 });
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const sx = r.sx(this.x);
    const gy = r.sy(0);
    // Утёс привязан к зеву пещеры — портал стоит прямо в нём.
    if (this.kind === 'cliff') blit(ctx, cliffSprite(this.side), sx, gy);
    const big = this.kind !== 'small';
    const f = portalSprite(this.world.clock, this.destroyed, big);
    blit(ctx, f, sx, gy);
    if (this.kind === 'dock' && this.tentacle > 0 && !this.destroyed) {
      ctx.fillStyle = '#1b1123';
      const reach = (1 - Math.abs(this.tentacle - 0.2) / 0.2) * 3 * M;
      ctx.fillRect(sx - reach, gy - 4, reach * 2, 2);
    }
  }

  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), kind: this.kind, destroyed: this.destroyed, side: this.side };
  }
}
