// Дичь: кролики живут в высокой траве за стенами (1 монета),
// олени выходят из леса (3 выстрела, 3 монеты). Убегают от людей.

import { Entity } from '../entity';
import type { Renderer } from '../../render/renderer';
import { groundShadow } from '../../render/shadow';
import { blit } from '../../engine/sprite';
import { animalFrames, type AnimalKind } from '../../art/animals';
import { M, PEOPLE } from '../config';
import { Coin } from './pickups';
import { fxRng } from '../../engine/rng';
import type { Person } from './person';
import type { Monarch } from './monarch';

export class Animal extends Entity {
  readonly tag = 'animal' as const;
  kind: AnimalKind;
  hp: number;
  home: number;
  private fleeTimer = 0;
  private moveTarget: number | null = null;
  private idleTimer = fxRng.range(1, 4);
  private grazing = false;
  /** Очарован оленем-скакуном: идёт за монархом. */
  charmedBy = 0;

  constructor(x: number, kind: AnimalKind) {
    super();
    this.x = x;
    this.home = x;
    this.kind = kind;
    this.hp = kind === 'deer' || kind === 'stag' ? PEOPLE.deerHp : 1;
    this.z = 18;
    this.facing = fxRng.chance(0.5) ? 1 : -1;
  }

  get huntable(): boolean {
    return this.kind === 'rabbit' || this.kind === 'deer' || this.kind === 'stag';
  }

  get height(): number {
    return this.kind === 'rabbit' ? 5 : 14;
  }

  get drawRadius(): number {
    return 16;
  }

  hurt(dmg: number, _owner: number): void {
    if (this.dead) return;
    this.hp -= this.world.meta.blessings.has('archery') && this.kind !== 'rabbit' ? dmg * 1.5 : dmg;
    this.charmedBy = 0;
    const w = this.world;
    w.fx.particles.burst(this.x, 4, 4, { color: '#8a2a2a', speed: 20, life: 0.4, gravity: 100 });
    if (this.hp <= 0) {
      this.dead = true;
      const coins = this.kind === 'rabbit' ? PEOPLE.rabbitCoins : PEOPLE.deerCoins;
      for (let i = 0; i < coins; i++) {
        const c = new Coin(this.x, 4, fxRng.range(-15, 15), fxRng.range(30, 60));
        c.noPickup = 0.4;
        w.add(c);
      }
    } else {
      this.fleeTimer = 3;
    }
  }

  override update(dt: number): void {
    const w = this.world;
    const speed = this.kind === 'rabbit' ? 30 : 24;
    const runSpeed = this.kind === 'rabbit' ? 60 : 75;
    if (this.charmedBy) {
      const m = w.all<Monarch>('monarch').find((e) => e.id === this.charmedBy);
      if (!m) this.charmedBy = 0;
      else {
        const tx = m.x - m.facing * 26;
        if (Math.abs(tx - this.x) > 6) {
          this.facing = tx > this.x ? 1 : -1;
          this.x += this.facing * Math.min(Math.abs(tx - this.x), Math.max(speed, Math.abs(m.velocity) * 1.05) * dt);
          this.grazing = false;
        }
        return;
      }
    }
    // Кто-то рядом — убегаем.
    let threat: Entity | null = null;
    for (const p of w.all<Person>('person')) {
      if (p.role === 'vagrant') continue;
      if (Math.abs(p.x - this.x) < 3.2 * M) {
        threat = p;
        break;
      }
    }
    if (!threat) for (const m of w.all<Monarch>('monarch')) if (Math.abs(m.x - this.x) < 4 * M) threat = m;
    if (threat) {
      this.fleeTimer = 2;
      this.facing = this.x >= threat.x ? 1 : -1;
    }
    if (this.fleeTimer > 0) {
      this.fleeTimer -= dt;
      this.grazing = false;
      this.x += this.facing * runSpeed * dt;
      this.vx = this.facing * runSpeed;
      this.clampToIsland();
      return;
    }
    this.vx = 0;
    if (this.moveTarget !== null) {
      const dx = this.moveTarget - this.x;
      if (Math.abs(dx) < 2) this.moveTarget = null;
      else {
        this.facing = dx > 0 ? 1 : -1;
        this.x += Math.sign(dx) * speed * dt;
        this.vx = this.facing * speed;
      }
      return;
    }
    this.idleTimer -= dt;
    if (this.idleTimer <= 0) {
      this.idleTimer = fxRng.range(2, 6);
      this.grazing = fxRng.chance(0.5);
      if (!this.grazing) this.moveTarget = this.home + fxRng.range(-5 * M, 5 * M);
    }
  }

  private clampToIsland(): void {
    const isl = this.world.island;
    if (this.x < isl.left + 30 || this.x > isl.right - 30) {
      this.dead = true;
    }
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const moving = this.vx !== 0;
    const anim = moving ? 'move' : this.grazing ? 'graze' : 'idle';
    const frames = animalFrames(this.kind, anim);
    const fps = moving ? (this.kind === 'rabbit' ? 10 : 9) : 2;
    const f = frames[Math.floor(this.anim * fps) % frames.length];
    groundShadow(ctx, r.sx(this.x), r.sy(0), this.kind === 'rabbit' ? 5 : 11);
    blit(ctx, f, r.sx(this.x), r.sy(0), this.facing < 0);
  }
}
