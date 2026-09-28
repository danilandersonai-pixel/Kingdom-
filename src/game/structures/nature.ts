// Природа острова: деревья (вырубка расширяет равнину), лагеря бродяг,
// сундуки с монетами и самоцветами, ягодные кусты, камни.

import { Structure } from './structure';
import type { Monarch } from '../entities/monarch';
import type { Renderer } from '../../render/renderer';
import type { Light } from '../../render/lighting';
import { blit, hex, makeCanvas, type Sprite } from '../../engine/sprite';
import type { TreeKind } from '../../render/treegen';
import { treeSprite, bushSprite } from '../../art/flora';
import { fxRng } from '../../engine/rng';
import { campSprite, chestSprite, stumpSprite, rockSprite, beachSprite } from '../../art/buildings';
import { rgb, mix, hex as hexColor } from '../../engine/sprite';
import { PRICES, WORK, M, PEOPLE } from '../config';
import { Coin } from '../entities/pickups';
import type { Season } from '../../render/atmosphere';
import { ellipse, px } from '../../art/px';

export class Tree extends Structure {
  readonly type = 'tree' as const;
  kind: TreeKind;
  variant: number;
  height: number;
  marked = false;
  falling = 0;
  /** Кто повалил дерево — ему достаются монеты. */
  feller = 0;

  constructor(x: number, kind: TreeKind, variant: number, height: number) {
    super();
    this.x = x;
    this.kind = kind;
    this.variant = variant;
    this.height = height;
    this.payWidth = 8;
    this.z = 2;
    this.payPriority = 0;
  }

  onAdd(): void {
    this.world.terrain.addTree(this.x, 1);
  }

  get drawRadius(): number {
    return 60;
  }

  /** Крайнее дерево лесного участка — его можно срубить. */
  get isEdge(): boolean {
    let left = false;
    let right = false;
    for (const s of this.world.all<Structure>('structure')) {
      if (s === this || s.type !== 'tree' || s.dead) continue;
      const d = s.x - this.x;
      if (d < 0 && d > -3.5 * M) left = true;
      if (d > 0 && d < 3.5 * M) right = true;
      if (left && right) return false;
    }
    return true;
  }

  override slotY(): number {
    return 22;
  }

  override price(_m: Monarch): number {
    if (this.marked || this.falling) return 0;
    if (!this.isEdge) return 0;
    return PRICES.chop;
  }

  override onPaid(_m: Monarch): void {
    this.marked = true;
    this.startBuild(0, WORK.tree);
    this.world.jobs.add('chop', this, 2, this.world.clock);
    this.world.sound('chop', this.x, 0.4);
  }

  override finishBuild(): void {
    this.falling = 0.001;
    this.world.jobs.removeFor(this);
    this.world.sound('treeFall', this.x, 0.9);
  }

  /** Монеты за рубку (1 наверняка и 50 % на вторую). */
  rollCoins(): number {
    return 1 + (this.world.rng.chance(0.5) ? 1 : 0);
  }

  override update(dt: number): void {
    if (this.falling > 0) {
      this.falling += dt;
      if (this.falling > 1.1) {
        this.dead = true;
        this.world.terrain.addTree(this.x, -1);
        this.world.addNow(new Stump(this.x));
        this.world.fx.particles.burst(this.x + 20, 4, 14, { color: '#6a8a4a', speed: 40, gravity: 90, life: 0.9, spread: 2 });
        this.world.fx.shake(2);
        this.world.emit('treeCut', this);
      }
    } else if (this.building && fxRng.chance(dt * 1.2)) {
      this.world.fx.particles.burst(this.x, 6, 2, { color: '#c8a878', speed: 20, gravity: 120, life: 0.4 });
    }
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const s = treeSprite(this.kind, this.variant, this.height, this.world.time.season);
    const sx = r.sx(this.x);
    const gy = r.sy(0);
    if (this.falling > 0) {
      const t = Math.min(1, this.falling / 1.1);
      const ang = t * t * (Math.PI / 2) * 0.95;
      ctx.save();
      ctx.translate(sx, gy);
      ctx.rotate(ang);
      ctx.globalAlpha = 1 - Math.max(0, t - 0.8) * 5;
      ctx.drawImage(s.img, -s.ax, -s.h);
      ctx.restore();
      return;
    }
    blit(ctx, s, sx, gy);
    if (this.marked) {
      // Вырезанный «крест» на стволе.
      ctx.fillStyle = '#e8d8b0';
      const y = gy - 12;
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(sx - 2 + i, y + i, 1, 1);
        ctx.fillRect(sx + 1 - i, y + i, 1, 1);
      }
    }
  }

  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), kind: this.kind, variant: this.variant, height: this.height, marked: this.marked };
  }
}

export class Stump extends Structure {
  readonly type = 'rock' as const;
  constructor(x: number) {
    super();
    this.x = x;
    this.z = 3;
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    blit(ctx, stumpSprite(), r.sx(this.x), r.sy(0));
  }
  get drawRadius(): number {
    return 6;
  }
}

export class Rock extends Structure {
  readonly type = 'rock' as const;
  variant: number;
  constructor(x: number, variant: number) {
    super();
    this.x = x;
    this.variant = variant;
    this.z = 3;
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    blit(ctx, rockSprite(this.variant), r.sx(this.x), r.sy(0));
  }
  get drawRadius(): number {
    return 10;
  }
  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), variant: this.variant };
  }
}

/** Лагерь бродяг: живёт, пока по обе стороны есть деревья. */
export class Camp extends Structure {
  readonly type = 'camp' as const;
  vagrants: number[] = [];
  private fireT = fxRng.next() * 10;

  constructor(x: number) {
    super();
    this.x = x;
    this.z = 6;
  }

  get drawRadius(): number {
    return 26;
  }

  /** Есть ли деревья с обеих сторон в пределах 12 м. */
  stillForest(): boolean {
    let left = false;
    let right = false;
    for (const s of this.world.all<Structure>('structure')) {
      if (s.type !== 'tree' || s.dead) continue;
      const d = s.x - this.x;
      if (d < 0 && d > -12 * M) left = true;
      if (d > 0 && d < 12 * M) right = true;
    }
    return left && right;
  }

  override update(dt: number): void {
    this.fireT += dt;
    this.vagrants = this.vagrants.filter((id) => this.world.all('person').some((p) => p.id === id && !p.dead && (p as unknown as { role: string }).role === 'vagrant'));
    if (fxRng.chance(dt * 6)) {
      this.world.fx.particles.spawn({ x: this.x + 9 + fxRng.range(-1, 1), y: 3, vx: fxRng.range(-3, 3), vy: fxRng.range(10, 20), life: 1, max: 1, color: fxRng.chance(0.5) ? '#ffcf5a' : '#ff8a3a', emissive: true, wobble: 16 });
    }
  }

  lights(out: Light[]): void {
    out.push({ x: this.x + 9, y: 4, radius: 46, color: hex('#ff9a40'), intensity: 0.8, flicker: 1 });
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    blit(ctx, campSprite(), r.sx(this.x), r.sy(0));
  }

  drawEmissive(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const sx = r.sx(this.x + 9);
    const gy = r.sy(0);
    const h = 3 + Math.round(Math.sin(this.fireT * 12) + Math.sin(this.fireT * 7));
    ctx.fillStyle = '#ff8a3a';
    ctx.fillRect(sx - 2, gy - h - 1, 4, h);
    ctx.fillStyle = '#ffe080';
    ctx.fillRect(sx - 1, gy - h, 2, Math.max(1, h - 1));
  }

  override serialize(): Record<string, unknown> {
    return { ...super.serialize() };
  }
}

/** Сундук: открывается сам, когда монарх проезжает мимо. */
export class Chest extends Structure {
  readonly type = 'chest' as const;
  gems: boolean;
  amount: number;
  opened = false;

  constructor(x: number, gems: boolean, amount: number) {
    super();
    this.x = x;
    this.gems = gems;
    this.amount = amount;
    this.z = 7;
  }

  get drawRadius(): number {
    return 8;
  }

  override update(): void {
    if (this.opened) return;
    for (const m of this.world.all<Monarch>('monarch')) {
      if (Math.abs(m.x - this.x) < 9) {
        this.open();
        break;
      }
    }
  }

  /** Ключ сундука в кампании: открытые сундуки с самоцветами не наполняются снова. */
  key = '';

  open(): void {
    this.opened = true;
    const w = this.world;
    w.emit('chestOpened', this);
    w.sound('chest', this.x, 1);
    for (let i = 0; i < this.amount; i++) {
      const c = new Coin(this.x, 6, fxRng.range(-40, 40), fxRng.range(60, 120), this.gems ? 'gem' : 'coin');
      c.noPickup = 0.5;
      w.add(c);
    }
    w.fx.particles.burst(this.x, 6, 12, { color: this.gems ? '#8ae8f8' : '#fff0a0', speed: 40, life: 0.8, emissive: true, gravity: 40 });
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    blit(ctx, chestSprite(this.opened, this.gems), r.sx(this.x), r.sy(0));
  }

  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), gems: this.gems, amount: this.amount, opened: this.opened };
  }
}

/** Ягодный куст: 1 монета — фермер собирает 3–4 монеты. Ягоды бывают осенью и зимой. */
export class BerryBush extends Structure {
  readonly type = 'rock' as const;
  berries = true;
  ordered = false;
  regrow = 0;

  constructor(x: number) {
    super();
    this.x = x;
    this.z = 5;
    this.payWidth = 10;
    this.payPriority = 1;
  }

  get isBerryBush(): boolean {
    return true;
  }

  get season(): Season {
    return this.world.time.season;
  }

  get ripe(): boolean {
    return this.berries && (this.season === 'autumn' || this.season === 'winter');
  }

  override slotY(): number {
    return 16;
  }

  override price(_m: Monarch): number {
    if (!this.ripe || this.ordered) return 0;
    const hasFarmer = this.world.all('person').some((p) => (p as unknown as { role: string }).role === 'farmer');
    return hasFarmer ? PRICES.berries : 0;
  }

  override onPaid(_m: Monarch): void {
    this.ordered = true;
  }

  /** Фермер собрал ягоды. */
  harvest(): number {
    this.berries = false;
    this.ordered = false;
    this.regrow = 1;
    return 3 + (this.world.rng.chance(0.5) ? 1 : 0);
  }

  override update(dt: number): void {
    if (!this.berries) {
      this.regrow += dt;
      if (this.regrow > 240) {
        this.berries = true;
        this.regrow = 0;
      }
    }
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const sprite = bushSprite(Math.floor(this.x), 14, 8, this.season === 'winter' ? 'winter' : 'summer');
    const sx = r.sx(this.x);
    const gy = r.sy(0);
    blit(ctx, sprite, sx, gy);
    if (this.ripe) {
      for (let i = 0; i < 6; i++) px(ctx, sx - 6 + ((i * 5) % 13), gy - 3 - ((i * 3) % 6), '#c02a4a');
    }
    if (this.season === 'winter') {
      ctx.fillStyle = '#eef3f8';
      ctx.fillRect(sx - 6, gy - 9, 12, 1);
    }
  }
}

/** Небольшой куст-декорация. */
export function bushDecor(seed: number): Sprite {
  const [c, ctx] = makeCanvas(12, 6);
  ellipse(ctx, 6, 5, 5, 3, '#2e4a2a');
  ellipse(ctx, 5, 4, 3, 2, '#3e5e36');
  void seed;
  return { img: c, w: 12, h: 6, ax: 6, ay: 6 };
}

void PEOPLE;

/** Край острова со стороны моря: песчаный пляж и открытая вода за ним. */
export class IslandEdge extends Structure {
  readonly type = 'rock' as const;
  side: -1 | 1;
  constructor(x: number, side: -1 | 1) {
    super();
    this.x = x;
    this.side = side;
    this.z = 1;
  }
  get drawRadius(): number {
    return 400;
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const a = r.atmos;
    const edgeX = r.sx(this.x);
    const gy = r.sy(0);
    // На пляже и за краем острова травы и почвы нет — стираем их со слоя мира (виден фон).
    const bw = 110;
    const cx0 = this.side > 0 ? edgeX - bw * 0.7 : -4;
    const cx1 = this.side > 0 ? r.w + 4 : edgeX + bw * 0.7;
    ctx.clearRect(Math.round(cx0), gy - 18, Math.round(cx1 - cx0), 30);
    // Море вместо полосы земли за краем острова: светлая гладь у поверхности, глубже темнее.
    const surf = a ? mix(a.waterDeep, a.skyHorizon, 0.45) : hexColor('#5a8aa0');
    const deep = a ? mix(a.waterDeep, a.skyHorizon, 0.12) : hexColor('#3a6a80');
    const x0 = this.side > 0 ? edgeX - 6 : -4;
    const x1 = this.side > 0 ? r.w + 4 : edgeX + 6;
    for (let y = 0; y < 20; y++) {
      ctx.fillStyle = rgb(mix(surf, deep, Math.min(1, y / 12)));
      ctx.fillRect(x0, gy - 4 + y, x1 - x0, 1);
    }
    // Гребни волн бегут к берегу.
    const t = this.world.clock;
    const crest = rgb(mix(surf, hexColor('#ffffff'), 0.45));
    ctx.fillStyle = crest;
    for (let i = 0; i < 14; i++) {
      const phase = (t * 0.25 + i * 0.37) % 1;
      const dist = 16 + i * 22 - phase * 22;
      const wx = edgeX + this.side * dist;
      const len = 3 + (i % 3) * 2;
      ctx.fillRect(Math.round(this.side > 0 ? wx : wx - len), gy - 3 + (i % 4), len, 1);
    }
    const b = beachSprite(this.side);
    const bx = this.side > 0 ? edgeX - b.w : edgeX;
    ctx.drawImage(b.img, bx, gy - 8);
    // Пена накатывает на мокрый песок и отступает.
    const reach = Math.sin(t * 0.9) * 5 + 5;
    const foamX = this.side > 0 ? edgeX - 8 - reach : edgeX + 8 + reach;
    ctx.fillStyle = 'rgba(240,248,250,0.8)';
    ctx.fillRect(Math.round(foamX) - (this.side > 0 ? 0 : 10), gy + 5, 10, 1);
    ctx.fillStyle = 'rgba(240,248,250,0.45)';
    ctx.fillRect(Math.round(foamX) - (this.side > 0 ? 3 : 7), gy + 6, 10, 1);
  }
}
