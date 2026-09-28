// Отшельники: хижина в лесу (открывается самоцветами), отшельник бредёт
// к городу, за 1 монету садится к монарху на коня и превращает подходящую
// постройку в особую: баллисту, пекарню, башню рыцарей, стену с рогом, конюшню.

import { Structure, type Currency } from './structure';
import type { Monarch } from '../entities/monarch';
import type { Renderer } from '../../render/renderer';
import { blit } from '../../engine/sprite';
import { hutSprite, ballistaSprite, bakerySprite, hornSprite, HUT_CHIMNEY } from '../../art/buildings';
import { fxRng } from '../../engine/rng';
import { humanFrames } from '../../art/humans';
import { PRICES, M, SIEGE, TOWER_TIERS } from '../config';
import { townX } from '../kingdom';
import type { Tower, Wall } from './defense';
import { Shop } from './town';
import { Arrow } from '../entities/projectile';
import type { Greed } from '../entities/greed';
import type { Person } from '../entities/person';
import type { World } from '../world';
import type { Camp } from './nature';

export type HermitKind = 'ballista' | 'stable' | 'bakery' | 'knight' | 'horn';

export const HERMITS: Record<HermitKind, { gems: number; island: number; name: string; desc: string }> = {
  ballista: { gems: 3, island: 1, name: 'Отшельник баллисты', desc: 'Превращает высокую башню в баллисту' },
  stable: { gems: 1, island: 2, name: 'Отшельник конюшни', desc: 'Превращает мельницу в конюшню' },
  bakery: { gems: 4, island: 3, name: 'Отшельник-пекарь', desc: 'Превращает высокую башню в пекарню' },
  knight: { gems: 2, island: 4, name: 'Отшельник рыцарей', desc: 'Строит башню рыцарей' },
  horn: { gems: 3, island: 5, name: 'Отшельник рога', desc: 'Вешает рог на каменную стену' },
};

/** Дымок из трубы лесной хижины. */
export function chimneySmoke(w: World, x: number, dt: number): void {
  if (!fxRng.chance(dt * 1.6)) return;
  const [cx, cy] = HUT_CHIMNEY;
  w.fx.particles.spawn({ x: x - 21 + cx + fxRng.range(-1, 1), y: cy, vx: fxRng.range(-2, 2) + 2, vy: fxRng.range(5, 9), life: 3.2, max: 3.2, color: 'rgba(170,165,160,0.4)', size: 2, drag: 0.2, wobble: 5 });
}

export class HermitHut extends Structure {
  readonly type = 'hermitHut' as const;
  kind: HermitKind;
  released = false;
  constructor(x: number, kind: HermitKind) {
    super();
    this.x = x;
    this.kind = kind;
    this.z = 5;
    this.payWidth = 14;
    this.payPriority = 2;
  }
  get key(): string {
    return `hermit:${this.kind}`;
  }
  override currency(): Currency {
    return 'gem';
  }
  override slotY(): number {
    return 28;
  }
  override price(_m: Monarch): number {
    if (this.released) return 0;
    return HERMITS[this.kind].gems;
  }
  override onPaid(_m: Monarch): void {
    this.world.meta.gemUnlocks.add(this.key);
    this.release();
  }
  release(): void {
    this.released = true;
    this.world.add(new Hermit(this.x + 10, this.kind));
    this.world.banner(HERMITS[this.kind].name.toUpperCase(), HERMITS[this.kind].desc);
  }
  override update(dt: number): void {
    // Разблокированный самоцветами отшельник выходит сам (у наследника тоже).
    if (!this.released && this.world.meta.gemUnlocks.has(this.key)) this.release();
    // Пока отшельник дома — из трубы вьётся дымок.
    if (!this.released) chimneySmoke(this.world, this.x, dt);
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    blit(ctx, hutSprite(), r.sx(this.x), r.sy(0));
  }
  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), kind: this.kind, released: this.released };
  }
}

/** Отшельник: платите 1 монету — он едет с монархом. */
export class Hermit extends Structure {
  readonly type = 'hermitHut' as const;
  kind: HermitKind;
  state: 'walking' | 'waiting' | 'riding' | 'settled' = 'walking';
  rider = 0;
  private walking = false;

  constructor(x: number, kind: HermitKind) {
    super();
    this.x = x;
    this.kind = kind;
    this.z = 23;
    this.payWidth = 12;
    this.payPriority = 3;
  }

  get isHermit(): boolean {
    return true;
  }

  override slotY(): number {
    return 24;
  }

  override price(m: Monarch): number {
    if (this.state === 'riding' || this.state === 'settled' || m.passenger) return 0;
    return PRICES.hermitRide;
  }

  override onPaid(m: Monarch): void {
    this.state = 'riding';
    this.rider = m.id;
    m.passenger = this.id;
  }

  override update(dt: number): void {
    const w = this.world;
    this.walking = false;
    if (this.state === 'riding') {
      const m = w.all<Monarch>('monarch').find((e) => e.id === this.rider);
      if (!m) {
        this.state = 'waiting';
        return;
      }
      this.x = m.x - m.facing * 6;
      this.facing = m.facing;
      return;
    }
    if (this.state === 'walking') {
      const tx = townX(w) + (this.id % 2 ? -3 : 3) * M;
      const dx = tx - this.x;
      if (Math.abs(dx) < 3) this.state = 'waiting';
      else {
        this.facing = dx > 0 ? 1 : -1;
        this.x += Math.sign(dx) * 0.8 * M * dt;
        this.walking = true;
      }
    }
  }

  /** Отшельник поселился в новой постройке. */
  settle(): void {
    const w = this.world;
    const m = w.all<Monarch>('monarch').find((e) => e.id === this.rider);
    if (m) m.passenger = 0;
    this.state = 'settled';
    this.dead = true;
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const frames = humanFrames('hermit', 0, this.walking ? 'walk' : 'idle');
    const f = frames[Math.floor(this.anim * (this.walking ? 5 : 2)) % frames.length];
    const y = this.state === 'riding' ? 13 : 0;
    blit(ctx, f, r.sx(this.x), r.sy(y), this.facing < 0);
  }

  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), kind: this.kind, state: this.state === 'riding' ? 'waiting' : this.state };
  }
}

/** Какой отшельник едет с монархом. */
export function passengerKind(w: World, m: Monarch): HermitKind | null {
  if (!m.passenger) return null;
  const h = w.all<Structure>('structure').find((s) => s.id === m.passenger && (s as Hermit).isHermit) as Hermit | undefined;
  return h ? h.kind : null;
}

/** Цена особого апгрейда башни с отшельником. */
export function towerSpecialPrice(t: Tower, kind: HermitKind | null): number {
  if (!kind || t.special || t.building) return 0;
  const archers = TOWER_TIERS[t.level].archers;
  if (kind === 'ballista' && archers >= 3) return t.level >= 6 ? PRICES.ballista4 : PRICES.ballista3;
  if (kind === 'bakery' && t.level >= 4) return PRICES.bakery;
  if (kind === 'knight' && archers === 3) return PRICES.knightTower;
  return 0;
}

export function wallHornPrice(wl: Wall, kind: HermitKind | null): number {
  if (kind !== 'horn' || wl.horn || wl.building || !wl.blocks) return 0;
  if (wl.level === 4) return PRICES.hornWall4;
  if (wl.level === 5) return PRICES.hornWall5;
  return 0;
}

/** Превращение башни или стены: вызывается после оплаты. */
export function applyHermitUpgrade(w: World, target: Tower | Wall, kind: HermitKind, m: Monarch): void {
  const hermit = w.all<Structure>('structure').find((s) => s.id === m.passenger) as Hermit | undefined;
  if (target.type === 'tower') {
    const t = target as Tower;
    t.special = kind === 'ballista' ? 'ballista' : kind === 'bakery' ? 'bakery' : 'knight';
    // Лучники освобождаются для охоты.
    for (const p of w.all<Person>('person')) if (t.archers.includes(p.id)) p.towerId = 0;
    t.archers = kind === 'knight' ? t.archers : [];
    if (kind === 'ballista') w.add(new Ballista(t));
    if (kind === 'bakery') {
      const shop = new Shop(t.x, 'bread', 7);
      w.add(shop);
      w.add(new Bakery(t, shop.id));
    }
    if (kind === 'knight') {
      const s = new Shop(t.x + 10, 'shield', 1);
      s.side = t.x < townX(w) ? -1 : 1;
      w.add(s);
    }
    w.banner(kind === 'ballista' ? 'БАЛЛИСТА' : kind === 'bakery' ? 'ПЕКАРНЯ' : 'БАШНЯ РЫЦАРЕЙ', HERMITS[kind].desc);
  } else {
    const wl = target as Wall;
    wl.horn = true;
    w.add(new HornPost(wl));
    w.banner('РОГ НА СТЕНЕ', 'Монета у рога созовёт защитников');
  }
  hermit?.settle();
}

/** Баллиста в башне: стреляет болтами, пробивающими цепочку врагов. Нужен строитель. */
export class Ballista extends Structure {
  readonly type = 'ballista' as const;
  towerId: number;
  reload = 0;
  constructor(t: Tower) {
    super();
    this.towerId = t.id;
    this.x = t.x;
    this.z = 13;
  }
  get tower(): Tower | undefined {
    return this.world.all<Structure>('structure').find((s) => s.id === this.towerId) as Tower | undefined;
  }
  operate(): void {}
  override update(dt: number): void {
    const t = this.tower;
    if (!t) {
      this.dead = true;
      return;
    }
    const w = this.world;
    const job = w.jobs.jobs.find((j) => j.target === this);
    if (!job) w.jobs.add('operate', this, 1, w.clock);
    if (!job || job.workers.size === 0) return;
    if (this.reload > 0) {
      this.reload -= dt;
      return;
    }
    let target: Greed | null = null;
    let best = SIEGE.ballistaRange;
    for (const g of w.all<Greed>('greed')) {
      const d = Math.abs(g.x - this.x);
      if (d < best) {
        best = d;
        target = g;
      }
    }
    if (!target) return;
    this.reload = SIEGE.ballistaReload;
    const b = new Arrow(this.x, t.platform + 6, target.x, target.y + target.hitHeight / 2, SIEGE.ballistaDamage, this.id, 'bolt');
    b.pierce = SIEGE.ballistaPierce;
    w.add(b);
    w.sound('bow', this.x, 1);
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const t = this.tower;
    if (!t) return;
    blit(ctx, ballistaSprite(), r.sx(this.x), r.sy(0));
  }
}

/** Пекарня: хлеб приманивает бродяг из дальних лагерей — они становятся крестьянами. */
export class Bakery extends Structure {
  readonly type = 'bakery' as const;
  towerId: number;
  shopId: number;
  constructor(t: Tower, shopId: number) {
    super();
    this.towerId = t.id;
    this.shopId = shopId;
    this.x = t.x;
    this.z = 13;
  }
  override update(): void {
    const w = this.world;
    const shop = w.all<Structure>('structure').find((s) => s.id === this.shopId) as Shop | undefined;
    if (!shop) return;
    // Каждая буханка зовёт одного бродягу.
    const called = w.all<Person>('person').filter((p) => p.role === 'vagrant' && p.lured === this.id).length;
    if (shop.stock > called) {
      const camps = w.all<Camp>('structure').filter((c) => c.type === 'camp' && !c.dead);
      camps.sort((a, b) => Math.abs(b.x - this.x) - Math.abs(a.x - this.x));
      for (const c of camps) {
        const v = w.all<Person>('person').find((p) => p.role === 'vagrant' && p.homeCamp === c.id && !p.lured);
        if (v) {
          v.lured = this.id;
          break;
        }
      }
    }
  }
  /** Бродяга дошёл до пекарни и съел хлеб. */
  feed(p: Person): boolean {
    const shop = this.world.all<Structure>('structure').find((s) => s.id === this.shopId) as Shop | undefined;
    if (!shop || !shop.take()) return false;
    p.lured = 0;
    p.coins = 1;
    p.setRole('villager');
    p.coins = 1;
    this.world.sound('recruit', this.x, 0.8);
    return true;
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    blit(ctx, bakerySprite(), r.sx(this.x), r.sy(0));
  }
}

/** Рог на стене: 1 монета — защитники с другой стороны идут сюда до утра. */
export class HornPost extends Structure {
  readonly type = 'hornWall' as const;
  wallId: number;
  constructor(wl: Wall) {
    super();
    this.wallId = wl.id;
    this.x = wl.x;
    this.z = 36;
    this.payWidth = 10;
    this.payPriority = 3;
  }
  override slotY(): number {
    return 52;
  }
  override price(_m: Monarch): number {
    return PRICES.hornCall;
  }
  override onPaid(_m: Monarch): void {
    const w = this.world;
    const side: -1 | 1 = this.x < townX(w) ? -1 : 1;
    w.hornCall = w.hornCall === side ? null : side;
    w.sound('horn', this.x, 1);
    w.banner(w.hornCall ? 'РОГ ТРУБИТ' : 'ОТБОЙ', w.hornCall ? 'Защитники идут к этой стене до утра' : 'Защитники возвращаются');
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    blit(ctx, hornSprite(), r.sx(this.x), r.sy(40));
  }
}
