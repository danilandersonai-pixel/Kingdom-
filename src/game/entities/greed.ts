// Жадность: гридлинги (с масками — прочнее), летуны, гиганты-плодители
// и похитители короны. Крадут монеты, инструменты и корону, ломают стены,
// на рассвете отступают к порталам и горят на открытом солнце.

import { Entity } from '../entity';
import type { Renderer } from '../../render/renderer';
import { groundShadow } from '../../render/shadow';
import { blit, flipOf, rimOf, type Sprite } from '../../engine/sprite';
import { greedFrames, maskSprite, GREED_SIZE, type GreedKind, type GreedAnim } from '../../art/greed';
import { GREED, M } from '../config';
import { Coin, DroppedTool, DroppedCrown } from './pickups';
import type { Monarch } from './monarch';
import type { Person } from './person';
import type { Portal } from '../structures/portal';
import { townX, wallBetween, type WallLike } from '../kingdom';
import type { Structure } from '../structures/structure';
import { fxRng } from '../../engine/rng';
import { crownSprite, coinSprites, rackItemSprite } from '../../art/items';

export type { GreedKind };

type Loot =
  | { kind: 'coin' }
  | { kind: 'gem' }
  | { kind: 'tool'; item: DroppedTool['item'] }
  | { kind: 'crown'; crown: DroppedCrown };

export class Greed extends Entity {
  readonly tag = 'greed' as const;
  kind: GreedKind;
  hp: number;
  maxHp: number;
  variant: number;
  armored: boolean;
  homePortal: number;
  loot: Loot | null = null;
  retreating = false;
  /** Не уходит на рассвете (Кровавая луна, летуны). */
  stayDay = false;
  private hitCd = fxRng.range(0, 0.6);
  private sunTimer = 0;
  private flash = 0;
  stun = 0;
  captives: number[] = [];
  private secondHunt = 0;
  private summonTimer = 4;
  summoned = 0;
  summonedBy = 0;
  private diving = false;
  private jump = 0;
  /** Защитник портала: не идёт в королевство, а бьётся рядом. */
  defender = false;
  private dir: 1 | -1 = 1;

  constructor(x: number, kind: GreedKind, hp: number, variant: number, homePortal: number, armored = false) {
    super();
    this.x = x;
    this.kind = kind;
    this.hp = hp;
    this.maxHp = hp;
    this.variant = variant;
    this.homePortal = homePortal;
    this.armored = armored;
    this.z = 26 + (variant % 7) * 0.05;
    if (kind === 'floater') {
      this.y = GREED.floaterAltitude;
      this.stayDay = true;
    }
  }

  get drawRadius(): number {
    return GREED_SIZE[this.kind][0];
  }

  get hitHeight(): number {
    return GREED_SIZE[this.kind][1] - 4;
  }

  get masked(): boolean {
    return this.kind === 'greedling' && this.maxHp > 1;
  }

  get speed(): number {
    switch (this.kind) {
      case 'floater':
        return GREED.floaterSpeed;
      case 'breeder':
        return GREED.breederSpeed;
      case 'stealer':
        return GREED.stealerSpeed;
      default:
        return this.loot || this.retreating ? GREED.lootSpeed : GREED.greedlingSpeed;
    }
  }

  takeDamage(amount: number, fromX: number): void {
    if (this.dead) return;
    const w = this.world;
    const before = this.hp;
    this.hp -= amount;
    this.flash = 0.12;
    w.sound('greedHit', this.x, 0.5);
    // Маска трескается и слетает, когда остаётся 1 HP.
    if (this.masked && before > 1 && this.hp <= 1 && this.hp > 0) {
      this.dropMask(fromX);
    }
    if (this.hp <= 0) this.die(fromX);
    else if (this.kind === 'greedling') this.x += Math.sign(this.x - fromX) * 3;
  }

  private dropMask(fromX: number): void {
    const w = this.world;
    w.fx.particles.spawn({ x: this.x, y: 8, vx: Math.sign(this.x - fromX) * 20, vy: 40, gravity: 160, life: 1.5, max: 1.5, color: '#f0ebe0', size: 2, settle: true });
  }

  die(fromX: number): void {
    if (this.dead) return;
    this.dead = true;
    const w = this.world;
    w.sound('greedDie', this.x, 0.6);
    const h = this.hitHeight;
    w.fx.particles.burst(this.x, this.y + h / 2, this.kind === 'breeder' ? 30 : 10, { color: '#2a1838', speed: 30, life: 0.9, drag: 1.5, size: 2, spread: Math.PI * 2 });
    w.fx.particles.burst(this.x, this.y + h / 2, 4, { color: '#8a5ab0', speed: 20, life: 0.6, emissive: true });
    if (this.kind === 'greedling' || this.kind === 'stealer') {
      w.fx.particles.spawn({ x: this.x, y: this.y + h - 2, vx: Math.sign(this.x - fromX) * 15, vy: 50, gravity: 170, life: 2.5, max: 2.5, color: '#f0ebe0', size: 2, settle: true });
    }
    this.dropLoot();
    for (const p of w.all<Person>('person')) {
      if (this.captives.includes(p.id)) {
        p.capturedBy = 0;
        p.vy = 10;
      }
    }
    this.captives = [];
  }

  private dropLoot(): void {
    const w = this.world;
    const l = this.loot;
    this.loot = null;
    if (!l) return;
    if (l.kind === 'coin' || l.kind === 'gem') {
      const c = new Coin(this.x, this.y + 8, fxRng.range(-20, 20), 50, l.kind);
      c.noPickup = 0.3;
      w.add(c);
    } else if (l.kind === 'tool') {
      w.add(new DroppedTool(this.x, l.item, fxRng.range(-15, 15), 40));
    } else if (l.kind === 'crown') {
      l.crown.carriedBy = 0;
      l.crown.x = this.x;
      l.crown.y = this.y + 8;
      l.crown.vy = 50;
    }
  }

  private nearestPortal(): Portal | null {
    const w = this.world;
    let best: Portal | null = null;
    let bd = Infinity;
    for (const s of w.all<Structure>('structure')) {
      if (s.type !== 'portal') continue;
      const p = s as Portal;
      if (p.destroyed) continue;
      // Предпочитаем «свой» портал и порталы по ту же сторону от города.
      const d = Math.abs(p.x - this.x) + (p.id === this.homePortal ? -200 : 0) + (Math.sign(p.x - townX(w)) === Math.sign(this.x - townX(w)) ? 0 : 3000);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private wallAhead(dir: number, reach: number): WallLike | null {
    let best: WallLike | null = null;
    let bd = reach;
    for (const s of this.world.all<Structure>('structure')) {
      if (s.type !== 'wall') continue;
      const wl = s as unknown as WallLike;
      if (!wl.blocks) continue;
      const d = (s.x - this.x) * dir;
      if (d >= -2 && d < bd) {
        bd = d;
        best = wl;
      }
    }
    return best;
  }

  override update(dt: number): void {
    const w = this.world;
    if (this.flash > 0) this.flash -= dt;
    this.hitCd -= dt;
    if (this.stun > 0) {
      this.stun -= dt;
      return;
    }
    if (w.time.sunUp && !this.stayDay && !this.defender) this.retreating = true;
    // Защитники уходят, когда их портал разрушен или днём его больше не атакуют.
    if (this.defender && !this.retreating && this.kind === 'greedling') {
      const home = w.all<Portal>('structure').find((s) => s.id === this.homePortal);
      if (!home || home.dead || (home.type === 'portal' && (home.destroyed || (w.time.sunUp && home.underAttack <= 0)))) this.retreating = true;
    }

    // Горят на открытом солнце после рассвета.
    if (w.time.sunUp && this.kind === 'greedling' && !this.summonedBy && w.terrain.isOpen(this.x)) {
      this.sunTimer += dt;
      if (this.sunTimer >= GREED.sunDamageEvery) {
        this.sunTimer = 0;
        this.takeDamage(1, this.x);
        w.fx.particles.burst(this.x, 6, 4, { color: '#ff9a40', speed: 15, life: 0.5, emissive: true });
        if (this.dead) return;
      }
    }

    switch (this.kind) {
      case 'greedling':
        this.greedlingAI(dt);
        break;
      case 'floater':
        this.floaterAI(dt);
        break;
      case 'breeder':
        this.breederAI(dt);
        break;
      case 'stealer':
        this.stealerAI(dt);
        break;
    }
    const isl = w.island;
    this.x = Math.max(isl.left + 4, Math.min(isl.right - 4, this.x));
  }

  /** Уйти в портал: всё унесённое пропадает. */
  private goHome(dt: number): void {
    const portal = this.nearestPortal();
    if (!portal) {
      this.dead = true;
      return;
    }
    const dx = portal.x - this.x;
    this.facing = dx > 0 ? 1 : -1;
    this.vx = this.facing * this.speed;
    if (Math.abs(dx) < 5) {
      this.dead = true;
      const w = this.world;
      if (this.loot?.kind === 'crown') {
        this.loot.crown.dead = true;
        w.emit('crownTaken', this.loot.crown.owner);
      }
      // Украденные самоцветы копятся в пещере — взрыв её «выплюнет».
      if (this.loot?.kind === 'gem') w.stolenGems++;
      for (const p of w.all<Person>('person')) {
        if (this.captives.includes(p.id)) p.dead = true;
      }
      this.loot = null;
      return;
    }
    this.x += Math.sign(dx) * Math.min(Math.abs(dx), this.speed * dt);
  }

  private tryGrab(): boolean {
    const w = this.world;
    // Упавшая корона — самое ценное.
    for (const it of w.all<Entity>('item')) {
      if (it.dead) continue;
      if (it instanceof DroppedCrown && !it.carriedBy && Math.abs(it.x - this.x) < 10 && it.y < 12 && !wallBetween(w, this.x, it.x)) {
        it.carriedBy = this.id;
        this.loot = { kind: 'crown', crown: it };
        w.sound('greedScream', this.x, 1);
        w.emit('crownGrabbed', it.owner);
        return true;
      }
    }
    for (const c of w.all<Coin>('coin')) {
      if (c.dead || c.homing) continue;
      if (Math.abs(c.x - this.x) < 8 && c.y < 10 && !wallBetween(w, this.x, c.x)) {
        c.dead = true;
        this.loot = { kind: c.kind };
        return true;
      }
    }
    for (const it of w.all<Entity>('item')) {
      if (it.dead || !(it instanceof DroppedTool)) continue;
      if (Math.abs(it.x - this.x) < 8 && !wallBetween(w, this.x, it.x)) {
        it.dead = true;
        this.loot = { kind: 'tool', item: it.item };
        return true;
      }
    }
    return false;
  }

  private greedlingAI(dt: number): void {
    const w = this.world;
    if (this.loot || this.retreating) {
      this.goHome(dt);
      return;
    }
    if (this.tryGrab()) return;
    const tc = townX(w);
    // Защитники портала держатся рядом с ним.
    const home = this.defender ? w.all<Portal>('structure').find((s) => s.id === this.homePortal) : null;
    const goal = home ? home.x : tc;
    this.dir = goal >= this.x ? 1 : -1;
    // Цели рядом: монарх, подданные.
    if (this.hitCd <= 0) {
      for (const m of w.all<Monarch>('monarch')) {
        if (!m.hasCrown || Math.abs(m.x - this.x) > 12 || wallBetween(w, this.x, m.x)) continue;
        this.facing = m.x > this.x ? 1 : -1;
        this.hitCd = GREED.hitInterval;
        m.hit(this.x);
        return;
      }
      let victim: Person | null = null;
      let vd = 13;
      for (const p of w.all<Person>('person')) {
        if (p.dead || p.role === 'vagrant' || p.capturedBy || p.y > 10) continue;
        const d = Math.abs(p.x - this.x);
        if (d < vd && !wallBetween(w, this.x, p.x)) {
          vd = d;
          victim = p;
        }
      }
      if (victim) {
        this.facing = victim.x > this.x ? 1 : -1;
        this.hitCd = GREED.hitInterval;
        const res = victim.hitByGreed(this.x);
        if (res.kind === 'tool') {
          res.item.dead = true;
          this.loot = { kind: 'tool', item: res.item.item };
        } else if (res.kind === 'coin') {
          res.item.dead = true;
          this.loot = { kind: 'coin' };
        }
        return;
      }
    }
    // Стена на пути — ломаем.
    const wall = this.wallAhead(this.dir, 7);
    if (wall) {
      this.vx = 0;
      this.facing = this.dir;
      if (this.hitCd <= 0) {
        this.hitCd = GREED.hitInterval;
        this.jump = 0.3;
        wall.damage(this.armored ? GREED.armoredWallDamage : GREED.wallDamage, this.x);
      }
      return;
    }
    if (Math.abs(goal - this.x) < 6) {
      // Дошли до цели — бродим, ищем добычу.
      this.vx = 0;
      if (fxRng.chance(dt)) this.x += fxRng.range(-10, 10);
      return;
    }
    this.facing = this.dir;
    this.vx = this.dir * this.speed;
    this.x += this.vx * dt;
  }

  private floaterAI(dt: number): void {
    const w = this.world;
    const cruise = GREED.floaterAltitude;
    // С одним пленником летун ещё немного ищет второго (уносит до двух).
    if (this.captives.length === 1 && this.secondHunt > 0) this.secondHunt -= dt;
    if (this.captives.length >= 2 || (this.captives.length && this.secondHunt <= 0 && !this.diving) || this.retreating) {
      this.y += (cruise - this.y) * Math.min(1, dt * 2);
      this.goHome(dt);
      return;
    }
    // Цель: сначала лучники в башнях, потом любой подданный.
    let target: Person | null = null;
    let td = 12 * M;
    for (const p of w.all<Person>('person')) {
      if (p.dead || p.capturedBy || p.role === 'vagrant') continue;
      const d = Math.abs(p.x - this.x) - (p.y > 5 ? 200 : 0);
      if (d < td) {
        td = d;
        target = p;
      }
    }
    if (target) {
      const dx = target.x - this.x;
      this.facing = dx > 0 ? 1 : -1;
      this.x += Math.sign(dx) * Math.min(Math.abs(dx), this.speed * 1.6 * dt);
      if (Math.abs(dx) < 6) {
        this.diving = true;
        this.y += (target.y + 12 - this.y) * Math.min(1, dt * 3);
        if (Math.abs(this.y - (target.y + 12)) < 3) {
          target.hitByGreed(this.x);
          if (!target.dead && target.role !== 'vagrant') {
            target.capturedBy = this.id;
            this.captives.push(target.id);
            if (this.captives.length === 1) this.secondHunt = 6;
          }
          this.diving = false;
        }
      } else {
        this.y += (cruise - this.y) * Math.min(1, dt);
      }
      return;
    }
    this.y += (cruise - this.y) * Math.min(1, dt);
    const tc = townX(w);
    this.facing = tc > this.x ? 1 : -1;
    if (Math.abs(tc - this.x) > 10) this.x += this.facing * this.speed * dt;
  }

  private breederAI(dt: number): void {
    const w = this.world;
    if (this.retreating && (!this.stayDay || w.caveCleared)) {
      this.goHome(dt);
      return;
    }
    // Призыв гридлингов.
    this.summonTimer -= dt;
    if (this.summonTimer <= 0) {
      this.summonTimer = GREED.breederSummonEvery;
      const alive = w.all<Greed>('greed').filter((g) => g.summonedBy === this.id).length;
      if (alive < GREED.breederMaxSummons) {
        const g = new Greed(this.x + this.facing * 8, 'greedling', 1, fxRng.int(0, 5), this.homePortal);
        g.summonedBy = this.id;
        w.add(g);
        w.fx.particles.burst(this.x, 20, 8, { color: '#3a2050', speed: 30, life: 0.6 });
      }
    }
    const tc = townX(w);
    this.dir = tc >= this.x ? 1 : -1;
    this.facing = this.dir;
    if (this.hitCd <= 0) {
      // Удар по площади: сбивает с ног и обезоруживает.
      let hitSomeone = false;
      for (const p of w.all<Person>('person')) {
        if (p.dead || p.role === 'vagrant' || p.y > 20) continue;
        if (Math.abs(p.x - this.x) < GREED.breederArea && !wallBetween(w, this.x, p.x)) {
          p.stunned = 1.5;
          p.hitByGreed(this.x);
          hitSomeone = true;
        }
      }
      for (const m of w.all<Monarch>('monarch')) {
        if (m.hasCrown && Math.abs(m.x - this.x) < GREED.breederArea * 0.7 && !wallBetween(w, this.x, m.x)) {
          m.hit(this.x);
          hitSomeone = true;
        }
      }
      const wall = this.wallAhead(this.dir, 14);
      if (wall) {
        wall.damage(GREED.breederWallDamage, this.x);
        hitSomeone = true;
      }
      if (hitSomeone) {
        this.hitCd = GREED.breederHitEvery;
        this.jump = 0.5;
        w.fx.shake(3);
        w.sound('wallHit', this.x, 1);
        return;
      }
    }
    if (this.wallAhead(this.dir, 14)) return;
    if (Math.abs(tc - this.x) > 8) this.x += this.dir * this.speed * dt;
  }

  private stealerAI(dt: number): void {
    const w = this.world;
    if (this.loot || this.retreating) {
      this.goHome(dt);
      return;
    }
    if (this.tryGrab()) return;
    let target: Monarch | null = null;
    let td = Infinity;
    for (const m of w.all<Monarch>('monarch')) {
      if (!m.hasCrown) continue;
      const d = Math.abs(m.x - this.x);
      if (d < td) {
        td = d;
        target = m;
      }
    }
    if (!target) {
      this.retreating = true;
      return;
    }
    const dx = target.x - this.x;
    this.facing = dx > 0 ? 1 : -1;
    // Перепрыгивает стены.
    if (this.wallAhead(this.facing, 10)) this.jump = Math.max(this.jump, 0.6);
    this.x += Math.sign(dx) * Math.min(Math.abs(dx), this.speed * dt);
    if (Math.abs(dx) < 10) {
      target.loseCrown(this.x);
    }
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    let anim: GreedAnim = 'run';
    if (this.kind === 'floater') anim = this.captives.length ? 'carry' : 'fly';
    else if (this.loot) anim = 'carry';
    else if (this.jump > 0 || this.hitCd > GREED.hitInterval - 0.3) anim = 'attack';
    const frames = greedFrames(this.kind, anim, this.variant, this.masked ? false : this.kind === 'greedling' && this.variant % 4 === 3);
    const fps = this.kind === 'breeder' ? 4 : this.kind === 'floater' ? 8 : 10;
    const f = frames[Math.floor(this.anim * fps) % frames.length];
    let jy = 0;
    if (this.jump > 0) {
      this.jump -= 1 / 60;
      jy = this.kind === 'stealer' ? Math.sin((this.jump / 0.6) * Math.PI) * 40 : Math.sin((this.jump / 0.3) * Math.PI) * 2;
    }
    const sx = r.sx(this.x);
    const sy = r.sy(this.y + jy);
    const sw = this.kind === 'breeder' ? 22 : this.kind === 'floater' ? 12 : 7;
    groundShadow(ctx, sx, r.sy(0), sw, this.kind === 'floater' || this.y + jy > 6 ? 0.12 : 0.26);
    blit(ctx, f, sx, sy, this.facing < 0);
    this.drawn = { f: this.facing < 0 ? flipOf(f) : f, sx, sy };
    if (this.masked && this.maxHp >= 3) {
      // Узорная маска у прочных гридлингов.
      const m = maskSprite(this.variant + 1);
      blit(ctx, m, sx + this.facing * 2, sy - 5, this.facing < 0);
    }
    if (this.flash > 0) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx - 4, sy - this.hitHeight, 8, this.hitHeight);
      ctx.globalAlpha = 1;
    }
    // Несомая добыча над головой.
    if (this.loot) {
      const ly = sy - this.hitHeight - 3;
      if (this.loot.kind === 'crown') blit(ctx, crownSprite(), sx, ly);
      else if (this.loot.kind === 'tool') blit(ctx, rackItemSprite(this.loot.item), sx, ly + 2);
      else blit(ctx, coinSprites()[0], sx, ly);
    }
  }

  /** Последний нарисованный кадр — для кромки лунного света поверх темноты. */
  private drawn: { f: Sprite; sx: number; sy: number } | null = null;

  override drawEmissive(ctx: CanvasRenderingContext2D, r: Renderer): void {
    // Кадр берём только из этого же прохода отрисовки: если фигура была
    // отсечена, по старым координатам ничего не рисуем.
    const drawn = this.drawn;
    this.drawn = null;
    // Глаза в темноте — чтобы Жадность было видно ночью.
    const night = this.world.time.isNight || this.world.time.phase > 0.62;
    if (!night) return;
    // Кромка лунного света по силуэту: в Кровавую луну — багровая.
    if (drawn) {
      const blood = this.world.time.isBloodMoon;
      ctx.globalAlpha = blood ? 0.7 : 0.45;
      blit(ctx, rimOf(drawn.f, blood ? '#ff5236' : '#8e9cd0'), drawn.sx, drawn.sy);
      ctx.globalAlpha = 1;
    }
    const sx = r.sx(this.x) + this.facing * (this.kind === 'breeder' ? 4 : 2);
    const h = this.kind === 'breeder' ? 22 : this.kind === 'floater' ? 0 : 6;
    const sy = r.sy(this.y + h);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#e8e2d8';
    ctx.fillRect(sx - 1, sy - 1, 3, 2);
    ctx.globalAlpha = 1;
  }
}
