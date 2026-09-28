// Природа острова: деревья (вырубка расширяет равнину), лагеря бродяг,
// сундуки с монетами и самоцветами, ягодные кусты, камни.

import { Structure } from './structure';
import type { Monarch } from '../entities/monarch';
import type { Renderer } from '../../render/renderer';
import type { Light } from '../../render/lighting';
import { blit, hex, makeCanvas, type Sprite } from '../../engine/sprite';
import { makeTree, masksToColor, makeBush, type TreeKind } from '../../render/treegen';
import { Rng, fxRng } from '../../engine/rng';
import { campSprite, chestSprite, stumpSprite, rockSprite, beachSprite } from '../../art/buildings';
import { rgb, mix, hex as hexColor } from '../../engine/sprite';
import { PRICES, WORK, M, PEOPLE } from '../config';
import { Coin } from '../entities/pickups';
import type { Season } from '../../render/atmosphere';
import { ellipse, px } from '../../art/px';

// ——— Палитры деревьев по сезонам ———
const TREE_COLORS: Record<Season, { leaf: string; leafShade: string; leafLight: string }> = {
  spring: { leaf: '#3f7038', leafShade: '#2a4e2a', leafLight: '#6a9e48' },
  summer: { leaf: '#3a6230', leafShade: '#274424', leafLight: '#5e8a3e' },
  autumn: { leaf: '#b0602a', leafShade: '#7a3a1c', leafLight: '#e0a040' },
  winter: { leaf: '#3a5a48', leafShade: '#28402f', leafLight: '#e8eef4' },
};

const treeSpriteCache = new Map<string, Sprite>();

function treeSprite(kind: TreeKind, variant: number, height: number, season: Season): Sprite {
  const key = `${kind}:${variant}:${height}:${season}`;
  let s = treeSpriteCache.get(key);
  if (s) return s;
  const rng = new Rng(variant * 7919 + height * 31 + kind.length);
  const winter = season === 'winter';
  const m = makeTree(kind, rng, height, winter, winter && kind !== 'pine');
  const c = TREE_COLORS[season];
  const pineWinter = kind === 'pine' && winter;
  const img = masksToColor(
    m,
    {
      trunk: '#4a3526',
      trunkShade: '#2e2018',
      trunkLight: '#6a5038',
      leaf: pineWinter ? '#2f5040' : kind === 'pine' ? '#2e5433' : c.leaf,
      leafShade: pineWinter ? '#223a2e' : kind === 'pine' ? '#1f3a24' : c.leafShade,
      leafLight: pineWinter ? '#e8eef4' : kind === 'pine' ? '#4e7a45' : c.leafLight,
      snow: '#f0f4f8',
    },
    kind === 'birch',
  );
  s = { img, w: m.w, h: m.h, ax: m.ax, ay: m.h };
  treeSpriteCache.set(key, s);
  return s;
}

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
    return 20;
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

  open(): void {
    this.opened = true;
    const w = this.world;
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
  private sprite: Sprite | null = null;

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
    if (!this.sprite) {
      const m = makeBush(new Rng(Math.floor(this.x)), 14, 8, false);
      const img = masksToColor(m, { trunk: '#4a3526', trunkShade: '#2e2018', trunkLight: '#6a5038', leaf: '#3a5a36', leafShade: '#28402a', leafLight: '#5a7a4a', snow: '#f0f4f8' });
      this.sprite = { img, w: m.w, h: m.h, ax: m.ax, ay: m.h };
    }
    const sx = r.sx(this.x);
    const gy = r.sy(0);
    blit(ctx, this.sprite, sx, gy);
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
    // Вода вместо полосы земли за краем острова.
    const water = a ? mix(a.waterDeep, a.skyHorizon, 0.25) : hexColor('#3a6a80');
    ctx.fillStyle = rgb(water);
    if (this.side > 0) ctx.fillRect(edgeX, gy - 4, r.w - edgeX + 4, 20);
    else ctx.fillRect(-4, gy - 4, edgeX + 4, 20);
    ctx.fillStyle = rgb(mix(water, hexColor('#ffffff'), 0.35));
    const t = this.world.clock;
    for (let i = 0; i < 8; i++) {
      const wx = this.side > 0 ? edgeX + 10 + i * 30 + Math.sin(t + i) * 4 : edgeX - 10 - i * 30 - Math.sin(t + i) * 4;
      ctx.fillRect(Math.round(wx), gy - 3 + (i % 3), 6, 1);
    }
    const b = beachSprite(this.side);
    ctx.drawImage(b.img, this.side > 0 ? edgeX - b.w : edgeX, gy - 4);
  }
}
