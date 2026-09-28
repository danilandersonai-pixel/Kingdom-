// Особые объекты острова: шахты (технологии), статуи, скакуны, собака,
// знамя атаки отрядов, осадные мастерские и катапульты, телепорты,
// дом горожан, логово кабана.

import { Structure, type Currency } from './structure';
import type { Monarch } from '../entities/monarch';
import type { Renderer } from '../../render/renderer';
import type { Light } from '../../render/lighting';
import { blit, hex } from '../../engine/sprite';
import { mineSprite, statueSprite, bannerSprite, workshopSprite, catapultSprite, teleportSprite, citizenHouseSprite, dogTrapSprite, scaffoldSprite, type StatueKind } from '../../art/buildings';
import { mountFrames } from '../../art/horse';
import { PRICES, WORK, M, SIEGE, WALL_TIERS } from '../config';
import { MOUNTS, type MountId } from '../mounts';
import { outerWall, townX } from '../kingdom';
import { Person } from '../entities/person';
import type { Portal } from './portal';
import type { Greed } from '../entities/greed';
import { Arrow } from '../entities/projectile';
import { fxRng } from '../../engine/rng';
import { HUMAN_VARIANTS } from '../../art/humans';

function tcLevel(s: Structure): number {
  return s.world.all<Structure>('structure').find((e) => e.type === 'townCenter')?.level ?? 0;
}

// ——— Шахты: камень (о. 2) и железо (о. 4) ———
export class Mine extends Structure {
  readonly type = 'mill' as const;
  kind: 'stone' | 'iron';
  built = false;

  constructor(x: number, kind: 'stone' | 'iron') {
    super();
    this.x = x;
    this.kind = kind;
    this.z = 4;
    this.payWidth = 20;
    this.payPriority = 2;
  }

  get isMine(): boolean {
    return true;
  }

  get drawRadius(): number {
    return 30;
  }

  override slotY(): number {
    return 64;
  }

  override price(_m: Monarch): number {
    if (this.built || this.building) return 0;
    if (this.kind === 'iron' && this.world.meta.tech < 1) return 0;
    return this.kind === 'stone' ? PRICES.stoneMine : PRICES.ironMine;
  }

  override onPaid(_m: Monarch): void {
    this.startBuild(1, this.kind === 'stone' ? 20 : 30);
  }

  override update(dt: number): void {
    // Шахта достраивается сама, как городской центр.
    if (this.building) this.addWork(dt);
    if (this.built && fxRng.chance(dt * 0.6)) this.world.sound('hammer', this.x, 0.2);
  }

  override finishBuild(): void {
    this.built = true;
    const w = this.world;
    const tech = this.kind === 'stone' ? 1 : 2;
    if (w.meta.tech < tech) w.meta.tech = tech;
    w.banner(this.kind === 'stone' ? 'ЭПОХА КАМНЯ' : 'ЭПОХА ЖЕЛЕЗА', this.kind === 'stone' ? 'Каменные стены и башни доступны на всех островах' : 'Железные стены и крепость доступны на всех островах', 6);
    w.sound('bell', this.x, 1);
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    blit(ctx, mineSprite(this.kind, this.built), r.sx(this.x), r.sy(0));
    if (this.scaffold) blit(ctx, scaffoldSprite(40, 30), r.sx(this.x), r.sy(0), false, 0.8);
  }

  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), kind: this.kind, built: this.built };
  }
}

// ——— Статуи ———
const STATUE: Record<StatueKind, { gems: number; coins: number; blessing: string; title: string; desc: string }> = {
  archer: { gems: 3, coins: 10, blessing: 'archery', title: 'СТАТУЯ СТРЕЛЬБЫ', desc: 'Лучники бьют точнее и сильнее' },
  scythe: { gems: 1, coins: 7, blessing: 'scythe', title: 'СТАТУЯ КОСЫ', desc: 'У каждой фермы на 2 поля больше' },
  builder: { gems: 3, coins: 9, blessing: 'building', title: 'СТАТУЯ СТРОИТЕЛЬСТВА', desc: 'Стены прочнее на 80 %' },
  knight: { gems: 2, coins: 8, blessing: 'knights', title: 'СТАТУЯ РЫЦАРЕЙ', desc: 'Рыцари делают выпад через стену' },
  farmer: { gems: 1, coins: 7, blessing: 'scythe', title: 'СТАТУЯ КОСЫ', desc: 'У каждой фермы на 2 поля больше' },
};

export class Statue extends Structure {
  readonly type = 'statue' as const;
  kind: StatueKind;

  constructor(x: number, kind: StatueKind) {
    super();
    this.x = x;
    this.kind = kind;
    this.z = 5;
    this.payWidth = 12;
    this.payPriority = 2;
  }

  get key(): string {
    return `statue:${this.kind}`;
  }
  get unlocked(): boolean {
    return this.world.meta.gemUnlocks.has(this.key);
  }
  get active(): boolean {
    return this.world.meta.blessings.has(STATUE[this.kind].blessing);
  }
  override currency(): Currency {
    return this.unlocked ? 'coin' : 'gem';
  }
  override slotY(): number {
    return 38;
  }
  override price(_m: Monarch): number {
    if (this.active) return 0;
    return this.unlocked ? STATUE[this.kind].coins : STATUE[this.kind].gems;
  }
  override onPaid(_m: Monarch): void {
    const w = this.world;
    const d = STATUE[this.kind];
    if (!this.unlocked) {
      w.meta.gemUnlocks.add(this.key);
      w.banner(d.title, 'Открыта навсегда. Монеты дадут благословение');
    } else {
      w.meta.blessings.add(d.blessing);
      w.banner(d.title, d.desc, 5);
      w.fx.particles.burst(this.x, 20, 30, { color: '#fff0a0', speed: 50, life: 1.2, emissive: true, spread: Math.PI * 2 });
    }
  }
  lights(out: Light[]): void {
    if (this.active) out.push({ x: this.x, y: 20, radius: 40, color: hex('#fff0a0'), intensity: 0.7 });
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    blit(ctx, statueSprite(this.kind, this.active), r.sx(this.x), r.sy(0));
  }
  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), kind: this.kind };
  }
}

// ——— Скакуны ———
export class MountSpot extends Structure {
  readonly type = 'stable' as const;
  mount: MountId;
  /** Скакун, оставленный монархом (серый конь и т. п.). */
  leftBehind = false;

  constructor(x: number, mount: MountId) {
    super();
    this.x = x;
    this.mount = mount;
    this.z = 19;
    this.payWidth = 16;
    this.payPriority = 2;
    this.facing = -1;
  }

  get key(): string {
    return `mount:${this.mount}`;
  }
  get unlocked(): boolean {
    return this.mount === 'horse' || this.leftBehind || this.world.meta.gemUnlocks.has(this.key);
  }
  get drawRadius(): number {
    return 26;
  }
  override currency(): Currency {
    return this.unlocked ? 'coin' : 'gem';
  }
  override slotY(): number {
    return 34;
  }
  override price(m: Monarch): number {
    if (m.mount.id === this.mount) return 0;
    const d = MOUNTS[this.mount];
    if (!this.unlocked) return d.gems;
    return this.leftBehind ? 1 : Math.max(1, d.coins);
  }
  override onPaid(m: Monarch): void {
    const w = this.world;
    if (!this.unlocked) {
      w.meta.gemUnlocks.add(this.key);
      w.banner(MOUNTS[this.mount].name.toUpperCase(), 'Открыт навсегда. Монеты — чтобы оседлать');
      return;
    }
    // Меняемся: прежний скакун остаётся здесь.
    const prev = m.mount.id;
    m.setMount(this.mount);
    m.stamina = 1;
    this.mount = prev;
    this.leftBehind = true;
    w.banner(MOUNTS[m.mount.id].name.toUpperCase(), MOUNTS[m.mount.id].desc);
    w.sound('neigh', this.x, 1);
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const d = MOUNTS[this.mount];
    const frames = mountFrames(`spot:${this.mount}`, this.world.terrain.canGraze(this.x, this.world.time.season) ? 'eat' : 'idle', d.look, null);
    blit(ctx, frames[Math.floor(this.anim * 2.5) % frames.length], r.sx(this.x), r.sy(0), this.facing < 0);
  }
  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), mount: this.mount, leftBehind: this.leftBehind };
  }
}

// ——— Собака под упавшим деревом (о. 2) ———
export class DogTrap extends Structure {
  readonly type = 'dogHouse' as const;
  freed = false;
  constructor(x: number) {
    super();
    this.x = x;
    this.z = 8;
    this.payWidth = 16;
    this.payPriority = 2;
  }
  get drawRadius(): number {
    return 24;
  }
  override slotY(): number {
    return 18;
  }
  override price(m: Monarch): number {
    return this.freed || (m.coins <= 0 && m.gems <= 0) ? 0 : 1;
  }
  override currency(): Currency {
    return 'coin';
  }
  override onPaid(m: Monarch): void {
    this.freed = true;
    this.world.emit('dogFreed', this, m);
    this.world.sound('bark', this.x, 1);
    this.world.fx.particles.burst(this.x, 6, 14, { color: '#7a5638', speed: 50, gravity: 150, life: 0.8, spread: 2.5 });
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    if (this.freed) return;
    const sx = r.sx(this.x);
    const gy = r.sy(0);
    blit(ctx, dogTrapSprite(), sx, gy);
    // Мордочка собаки из-под ствола.
    ctx.fillStyle = '#b08a5a';
    ctx.fillRect(sx - 4, gy - 4, 4, 3);
    ctx.fillStyle = '#1a1010';
    ctx.fillRect(sx - 4, gy - 3, 1, 1);
  }
  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), freed: this.freed };
  }
}

// ——— Знамя атаки отрядов (у крайней стены, снаружи) ———
export class SquadBanner extends Structure {
  readonly type = 'banner' as const;
  side: -1 | 1;
  color = '#a82a2a';
  constructor(side: -1 | 1) {
    super();
    this.side = side;
    this.x = 0;
    this.z = 9;
    this.payWidth = 12;
    this.payPriority = 2;
  }
  private commanders(): Person[] {
    return this.world.all<Person>('person').filter((p) => p.isSoldier && p.side === this.side && !p.attackTarget && !p.boarding);
  }
  private targetPortal(): Portal | null {
    const w = this.world;
    const tx = townX(w);
    const list = w.all<Structure>('structure').filter((s) => s.type === 'portal' && !(s as Portal).destroyed && (s as Portal).kind !== 'cliff' && Math.sign(s.x - tx) === this.side) as Portal[];
    list.sort((a, b) => Math.abs(a.x - tx) - Math.abs(b.x - tx));
    return list[0] ?? null;
  }
  get visible(): boolean {
    return this.commanders().length > 0 || this.world.all<Person>('person').some((p) => p.isSoldier && p.side === this.side);
  }
  override slotY(): number {
    return 30;
  }
  override price(_m: Monarch): number {
    if (!this.commanders().length || !this.targetPortal()) return 0;
    return PRICES.squadAttack;
  }
  override onPaid(_m: Monarch): void {
    const c = this.commanders()[0];
    const p = this.targetPortal();
    if (!c || !p) return;
    c.attackTarget = p.id;
    this.world.sound('horn', this.x, 1);
    this.world.banner('В АТАКУ!', 'Отряд идёт на портал');
  }
  override update(): void {
    const w = this.world;
    const ow = outerWall(w, this.side);
    this.x = (ow ? ow.x : townX(w) + this.side * 10 * M) + this.side * 2.2 * M;
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    if (!this.visible) return;
    blit(ctx, bannerSprite(this.color), r.sx(this.x), r.sy(0), this.side < 0);
  }
}

// ——— Осадная мастерская и катапульта ———
export class SiegeWorkshop extends Structure {
  readonly type = 'catapult' as const;
  side: -1 | 1;
  constructor(side: -1 | 1) {
    super();
    this.side = side;
    this.z = 9;
    this.payWidth = 14;
    this.payPriority = 2;
  }
  get isWorkshop(): boolean {
    return true;
  }
  /** Мастерская работает, когда крайнюю стену стороны прикрывает камень. */
  get enabled(): boolean {
    const ow = outerWall(this.world, this.side);
    return tcLevel(this) >= 5 && !!ow && ow.level >= 3;
  }
  override slotY(): number {
    return 26;
  }
  override price(_m: Monarch): number {
    if (!this.enabled) return 0;
    const cats = this.world.all<Structure>('structure').filter((s) => s instanceof Catapult && (s as Catapult).side === this.side).length;
    return cats >= 2 ? 0 : PRICES.catapult;
  }
  override onPaid(_m: Monarch): void {
    const c = new Catapult(this.side, this.x - this.side * (8 + fxRng.range(0, 10)));
    c.startBuild(1, WORK.catapult);
    this.world.add(c);
    this.world.jobs.add('build', c, 2, this.world.clock);
  }
  override update(): void {
    const ow = outerWall(this.world, this.side);
    if (ow) this.x = ow.x - this.side * 3.5 * M;
    // Не ставить мастерскую на остов лодки у причала — отодвинуть к городу.
    const dock = this.world.all<Structure>('structure').find((s) => s.type === 'dock');
    if (dock && Math.abs(this.x - dock.x) < 44) this.x = dock.x - this.side * 44;
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    if (!this.enabled) return;
    blit(ctx, workshopSprite(), r.sx(this.x), r.sy(0));
  }
}

export class Catapult extends Structure {
  readonly type = 'catapult' as const;
  side: -1 | 1;
  reload = 0;
  private throwAnim = 0;

  constructor(side: -1 | 1, x: number) {
    super();
    this.side = side;
    this.x = x;
    this.z = 11;
    this.facing = side;
  }

  override finishBuild(): void {
    this.level = 1;
    this.world.jobs.removeFor(this, 'build');
    this.world.jobs.add('operate', this, 2, this.world.clock);
  }

  /** Строитель обслуживает и заряжает катапульту (скорость считает update по числу работников). */
  operate(_dt: number, _p: Person): void {}

  override update(dt: number): void {
    if (this.level < 1) return;
    if (this.throwAnim > 0) this.throwAnim -= dt;
    const job = this.world.jobs.jobs.find((j) => j.target === this);
    if (!job) this.world.jobs.add('operate', this, 2, this.world.clock);
    const crew = job ? job.workers.size : 0;
    if (crew === 0) return;
    if (this.reload > 0) {
      this.reload -= dt * (crew >= 2 ? SIEGE.catapultReload1 / SIEGE.catapultReload2 : 1);
      return;
    }
    // Цель — толпа Жадности за стеной в пределах 12–35 м.
    let target: Greed | null = null;
    let best = Infinity;
    for (const g of this.world.all<Greed>('greed')) {
      const d = (g.x - this.x) * this.side;
      if (d < SIEGE.catapultMin || d > SIEGE.catapultMax || g.kind === 'floater') continue;
      if (d < best) {
        best = d;
        target = g;
      }
    }
    if (!target) return;
    this.reload = SIEGE.catapultReload1;
    this.throwAnim = 0.4;
    const a = new Arrow(this.x, 14, target.x + target.vx * 1.5, 0, SIEGE.catapultDamage, this.id, 'boulder');
    a.radius = SIEGE.catapultRadius;
    this.world.add(a);
    this.world.sound('swing', this.x, 0.8);
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    blit(ctx, catapultSprite(), r.sx(this.x), r.sy(0), this.side < 0);
    if (this.scaffold) blit(ctx, scaffoldSprite(20, 16), r.sx(this.x), r.sy(0), false, 0.8);
  }
}

// ——— Телепорт на руинах портала ———
/** Городской конец телепорта: оплата переносит к руинам портала. */
export class TeleportEnd extends Structure {
  readonly type = 'banner' as const;
  constructor(readonly teleport: Teleport) {
    super();
    this.x = teleport.pairX;
    this.z = 5;
    this.payWidth = 12;
    this.payPriority = 2;
  }
  override slotY(): number {
    return 34;
  }
  override price(m: Monarch): number {
    return this.teleport.dead || !this.teleport.built ? 0 : this.teleport.price(m);
  }
  override onPaid(m: Monarch): void {
    this.teleport.onPaid(m);
  }
  override update(): void {
    if (this.teleport.dead) this.dead = true;
    this.x = this.teleport.pairX;
  }
  override draw(): void {}
}

export class Teleport extends Structure {
  readonly type = 'portal' as const;
  readonly kind = 'teleport';
  destroyed = true;
  built = false;
  /** Второй конец — у городского центра. */
  pairX = 0;
  constructor(x: number) {
    super();
    this.x = x;
    this.z = 5;
    this.payWidth = 12;
    this.payPriority = 2;
  }
  override slotY(): number {
    return 34;
  }
  override price(_m: Monarch): number {
    if (this.building) return 0;
    return this.built ? PRICES.teleportUse : PRICES.teleportBuild;
  }
  override onPaid(m: Monarch): void {
    if (!this.built) {
      this.startBuild(1, WORK.teleport);
      this.world.jobs.add('build', this, 2, this.world.clock);
      return;
    }
    // Перемещение к другому концу.
    const to = Math.abs(m.x - this.x) < Math.abs(m.x - this.pairX) ? this.pairX : this.x;
    this.world.fx.particles.burst(m.x, 16, 20, { color: '#8ae8f8', speed: 40, life: 0.8, emissive: true, spread: Math.PI * 2 });
    m.x = to + (to === this.x ? -this.world.island.beachSide * 0 : 0) + 14;
    this.world.fx.particles.burst(m.x, 16, 20, { color: '#8ae8f8', speed: 40, life: 0.8, emissive: true, spread: Math.PI * 2 });
    this.world.sound('portalHit', m.x, 0.8);
    this.world.emit('teleported', m);
  }
  override finishBuild(): void {
    this.built = true;
    this.pairX = townX(this.world) + 5 * M;
    this.world.jobs.removeFor(this);
    this.addEnd();
  }

  /** Второй конец у города: там тоже можно заплатить и перенестись обратно. */
  addEnd(): void {
    if (!this.world.all<Structure>('structure').some((s) => s instanceof TeleportEnd && s.teleport === this)) this.world.add(new TeleportEnd(this));
  }
  lights(out: Light[]): void {
    if (this.built) {
      out.push({ x: this.x, y: 14, radius: 36, color: hex('#8ae8f8'), intensity: 0.8 });
      out.push({ x: this.pairX, y: 14, radius: 36, color: hex('#8ae8f8'), intensity: 0.8 });
    }
  }
  get drawRadius(): number {
    return 2000;
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    blit(ctx, teleportSprite(this.built), r.sx(this.x), r.sy(0));
    if (this.built) blit(ctx, teleportSprite(true), r.sx(this.pairX), r.sy(0));
  }
  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), built: this.built, pairX: this.pairX };
  }
}

// ——— Дом горожан на месте исчезнувшего лагеря ———
export class CitizenHouse extends Structure {
  readonly type = 'hermitHut' as const;
  built = false;
  citizens = 0;
  constructor(x: number) {
    super();
    this.x = x;
    this.z = 6;
    this.payWidth = 14;
    this.payPriority = 1;
  }
  get isCitizenHouse(): boolean {
    return true;
  }
  override slotY(): number {
    return 30;
  }
  override price(_m: Monarch): number {
    if (this.building) return 0;
    if (!this.built) return PRICES.citizenHouse;
    return this.citizens < 3 ? PRICES.citizen : 0;
  }
  override onPaid(_m: Monarch): void {
    if (!this.built) {
      this.startBuild(1, WORK.citizenHouse);
      this.world.jobs.add('build', this, 2, this.world.clock);
      return;
    }
    this.citizens++;
    const p = new Person(this.x, 'villager', this.world.rng.int(0, HUMAN_VARIANTS - 1));
    p.coins = 1;
    this.world.add(p);
    this.world.sound('recruit', this.x, 0.8);
  }
  override finishBuild(): void {
    this.built = true;
    this.world.jobs.removeFor(this);
  }
  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    if (this.built) blit(ctx, citizenHouseSprite(), r.sx(this.x), r.sy(0));
    else {
      ctx.fillStyle = '#5a4a3a';
      ctx.fillRect(r.sx(this.x) - 8, r.sy(0) - 2, 16, 2);
      if (this.scaffold) blit(ctx, scaffoldSprite(26, 22), r.sx(this.x), r.sy(0), false, 0.8);
    }
  }
  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), built: this.built, citizens: this.citizens };
  }
}

void WALL_TIERS;

// ——— Кооператив: новая корона товарищу за 8 монет ———
export class CrownOffer extends Structure {
  readonly type = 'banner' as const;
  ownerId: number;
  constructor(ownerId: number) {
    super();
    this.ownerId = ownerId;
    this.z = 50;
    this.payWidth = 16;
    this.payPriority = 5;
  }
  private owner(): Monarch | undefined {
    return this.world.all<Monarch>('monarch').find((m) => m.id === this.ownerId);
  }
  override slotY(): number {
    return 40;
  }
  override price(m: Monarch): number {
    const o = this.owner();
    if (!o || o.hasCrown || m.id === this.ownerId) return 0;
    return PRICES.coopCrown;
  }
  override onPaid(_m: Monarch): void {
    const o = this.owner();
    if (o) o.regainCrown();
    this.world.banner('НОВАЯ КОРОНА', 'Товарищ снова правит');
    this.dead = true;
  }
  override update(): void {
    const o = this.owner();
    if (!o || o.hasCrown) {
      this.dead = true;
      return;
    }
    this.x = o.x;
  }
}
