// Снаряды: стрелы лучников (баллистическая дуга), болты баллисты, валуны катапульты.

import { Entity } from '../entity';
import type { Renderer } from '../../render/renderer';
import type { Greed } from './greed';
import type { Animal } from './animal';
import type { Structure } from '../structures/structure';
import { fxRng } from '../../engine/rng';

const G = 220;

export class Arrow extends Entity {
  readonly tag = 'projectile' as const;
  damage: number;
  owner: number;
  stuck = 0;
  private life = 4;
  kind: 'arrow' | 'bolt' | 'boulder' = 'arrow';
  pierce = 1;
  radius = 0;
  private hitIds = new Set<number>();

  constructor(x: number, y: number, tx: number, ty: number, damage: number, owner: number, kind: 'arrow' | 'bolt' | 'boulder' = 'arrow') {
    super();
    this.x = x;
    this.y = y;
    this.damage = damage;
    this.owner = owner;
    this.kind = kind;
    this.z = 45;
    const dx = tx - x;
    const dist = Math.abs(dx);
    // Время полёта зависит от расстояния; подбираем vy, чтобы попасть в (tx, ty).
    const speed = kind === 'bolt' ? 260 : kind === 'boulder' ? 90 : 150;
    const t = Math.max(0.25, dist / speed);
    this.vx = dx / t;
    this.vy = (ty - y + 0.5 * G * t * t) / t;
    if (kind === 'bolt') {
      this.vy = (ty - y) / t + 0.5 * G * 0.15 * t;
    }
  }

  get drawRadius(): number {
    return 8;
  }

  override update(dt: number): void {
    if (this.stuck > 0) {
      this.stuck -= dt;
      if (this.stuck <= 0) this.dead = true;
      return;
    }
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }
    const g = this.kind === 'bolt' ? G * 0.15 : G;
    this.vy -= g * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const w = this.world;
    if (this.kind === 'boulder') {
      if (this.y <= 0) this.explode();
      return;
    }
    // Попадание по Жадности.
    for (const e of w.all<Greed>('greed')) {
      if (e.dead || this.hitIds.has(e.id)) continue;
      if (Math.abs(e.x - this.x) < 4 + (e.kind === 'breeder' ? 8 : 0) && this.y >= e.y - 2 && this.y <= e.y + e.hitHeight + 2) {
        e.takeDamage(this.damage, this.x - this.vx * 0.05);
        this.hitIds.add(e.id);
        w.sound('arrowHit', this.x, 0.35);
        if (--this.pierce <= 0) {
          this.dead = true;
          return;
        }
      }
    }
    // Дичь.
    for (const a of w.all<Animal>('animal')) {
      if (a.dead || !a.huntable) continue;
      if (Math.abs(a.x - this.x) < 5 && this.y <= a.height + 1 && this.y >= -1) {
        a.hurt(this.damage, this.owner);
        this.dead = true;
        return;
      }
    }
    // Порталы (для отрядов).
    if (this.y < 40) {
      for (const s of w.all<Structure>('structure')) {
        if (s.type !== 'portal') continue;
        const p = s as Structure & { destroyed: boolean; kind: string };
        if (p.destroyed || p.kind === 'cliff') continue;
        if (Math.abs(s.x - this.x) < 8 && this.y > 4) {
          const attacked = w.all<{ attackTarget: number } & Entity>('person').some((q) => q.attackTarget === s.id);
          if (attacked) s.damage(this.damage, this.x);
          this.stuck = 0.01;
          return;
        }
      }
    }
    if (this.y <= 0) {
      this.y = 0;
      this.stuck = 2.5;
    }
  }

  private explode(): void {
    const w = this.world;
    this.dead = true;
    w.fx.shake(3);
    w.fx.particles.burst(this.x, 2, 16, { color: '#7a6a5a', speed: 60, gravity: 200, life: 0.8, spread: 2.5 });
    w.sound('bomb', this.x, 0.7);
    for (const e of w.all<Greed>('greed')) {
      if (!e.dead && Math.abs(e.x - this.x) < this.radius) e.takeDamage(this.damage, this.x);
    }
    void fxRng;
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const sx = r.sx(this.x);
    const sy = r.sy(this.y);
    if (this.kind === 'boulder') {
      ctx.fillStyle = '#6a5a4a';
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
      return;
    }
    const ang = this.stuck > 0 ? Math.atan2(-0.8, Math.sign(this.vx) || 1) : Math.atan2(-this.vy, this.vx);
    const len = this.kind === 'bolt' ? 7 : 5;
    const cx = Math.cos(ang);
    const cy = Math.sin(ang);
    ctx.fillStyle = this.kind === 'bolt' ? '#8a8e94' : '#d8c8a0';
    for (let i = 0; i < len; i++) ctx.fillRect(Math.round(sx - cx * i), Math.round(sy - cy * i), 1, 1);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(Math.round(sx + cx), Math.round(sy + cy), 1, 1);
  }
}
