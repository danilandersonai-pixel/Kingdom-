// Лодка и пристани: ремонт обломков по деталям, спуск на воду, колокол
// (команда поднимается на борт), отплытие. Дальняя пристань — место прибытия
// и маяка (без маяка лодка разбивается).

import { Structure } from './structure';
import type { Monarch } from '../entities/monarch';
import type { Renderer } from '../../render/renderer';
import type { Light } from '../../render/lighting';
import { blit, hex } from '../../engine/sprite';
import { boatSprite, dockSprite, lighthouseSprite } from '../../art/buildings';
import { PRICES, BOAT_PARTS, WORK, M, ISLANDS } from '../config';
import type { Person } from '../entities/person';
import type { Portal } from './portal';
import { drawText } from '../../engine/font';

export type BoatStage = 'wreck' | 'repair' | 'repaired' | 'launching' | 'launched' | 'crewed';

export class CentralDock extends Structure {
  readonly type = 'dock' as const;
  stage: BoatStage = 'wreck';
  parts: number;
  ordered = 0;
  private partWork = 0;
  crew: number[] = [];
  /** Сколько мест на борту: отряды, строители, лучники башен лодки. */
  static readonly SQUADS = 3;
  static readonly BUILDERS = 3;
  static readonly TOWER_ARCHERS = 4;

  constructor(x: number, islandIndex: number) {
    super();
    this.x = x;
    this.z = 6;
    this.payWidth = 26;
    this.payPriority = 2;
    this.parts = ISLANDS[islandIndex - 1].freeParts;
  }

  get drawRadius(): number {
    return 60;
  }

  get progress(): number {
    return this.parts / BOAT_PARTS;
  }

  override slotY(): number {
    return this.stage === 'wreck' ? 20 : 58;
  }

  override price(_m: Monarch): number {
    switch (this.stage) {
      case 'wreck':
        return PRICES.boatStart;
      case 'repair':
        return this.parts + this.ordered < BOAT_PARTS ? PRICES.boatPart : 0;
      case 'repaired':
        return PRICES.boatLaunch;
      case 'launched':
        return PRICES.boatBell;
      case 'crewed':
        return PRICES.boatSail;
      default:
        return 0;
    }
  }

  override onPaid(m: Monarch): void {
    const w = this.world;
    switch (this.stage) {
      case 'wreck':
        this.stage = this.parts >= BOAT_PARTS ? 'repaired' : 'repair';
        w.banner('РЕМОНТ ЛОДКИ', `Готово деталей: ${this.parts} из ${BOAT_PARTS}`);
        break;
      case 'repair':
        this.ordered++;
        w.jobs.add('boat', this, 3, w.clock);
        this.building = true;
        break;
      case 'repaired':
        this.stage = 'launching';
        this.startBuild(0, 6);
        w.jobs.add('build', this, 3, w.clock);
        break;
      case 'launched':
        this.ringBell();
        break;
      case 'crewed':
        w.emit('sail', m, this);
        break;
    }
  }

  override addWork(amount: number): boolean {
    if (this.stage === 'launching') return super.addWork(amount);
    if (this.stage !== 'repair' || this.ordered <= 0) {
      this.building = false;
      return true;
    }
    this.partWork += amount;
    if (this.partWork >= WORK.boatPart) {
      this.partWork = 0;
      this.ordered--;
      this.parts++;
      this.world.sound('hammer', this.x, 0.5);
      if (this.parts >= BOAT_PARTS) {
        this.stage = 'repaired';
        this.building = false;
        this.world.jobs.removeFor(this);
        this.world.banner('ЛОДКА ПОЧИНЕНА', 'Заплатите, чтобы спустить её на воду');
        return true;
      }
      if (this.ordered <= 0) {
        this.building = false;
        this.world.jobs.removeFor(this, 'boat');
        return true;
      }
    }
    return false;
  }

  override finishBuild(): void {
    this.stage = 'launched';
    this.world.jobs.removeFor(this);
    this.world.sound('splash', this.x, 1);
    this.world.fx.ripple(this.x, 12);
    this.world.banner('ЛОДКА НА ВОДЕ', 'Колокол позовёт команду');
    this.world.emit('moment', 'boat', 'ЛОДКА НА ВОДЕ', 'Колокол позовёт команду');
  }

  /** Колокол: на борт идут до 3 отрядов, до 3 строителей и 4 лучника. */
  ringBell(): void {
    const w = this.world;
    w.sound('bell', this.x, 1);
    const people = w.all<Person>('person');
    const crew: Person[] = [];
    const commanders = people.filter((p) => p.isSoldier).slice(0, CentralDock.SQUADS);
    for (const c of commanders) {
      crew.push(c);
      for (const id of c.squad) {
        const a = people.find((p) => p.id === id);
        if (a) crew.push(a);
      }
    }
    crew.push(...people.filter((p) => p.role === 'builder').slice(0, CentralDock.BUILDERS));
    crew.push(...people.filter((p) => p.role === 'archer' && !p.leaderId && !crew.includes(p)).slice(0, CentralDock.TOWER_ARCHERS));
    this.crew = crew.map((p) => p.id);
    for (const p of crew) p.boarding = this.id;
    this.stage = 'crewed';
    w.emit('bellRung', this);
  }

  override update(): void {
    if (this.stage === 'repair' && this.ordered > 0 && !this.world.jobs.jobs.some((j) => j.target === this)) {
      this.world.jobs.add('boat', this, 3, this.world.clock);
    }
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const sx = r.sx(this.x);
    const gy = r.sy(0);
    blit(ctx, dockSprite(), sx + 18, gy + 4);
    let stage = 0;
    if (this.stage === 'repair') stage = this.progress < 0.55 ? 1 : this.progress < 0.85 ? 2 : 3;
    else if (this.stage !== 'wreck') stage = 3;
    const afloat = this.stage === 'launched' || this.stage === 'crewed';
    const bob = afloat ? Math.round(Math.sin(this.world.clock * 1.4) * 1) : 0;
    blit(ctx, boatSprite(stage), sx, gy + (afloat ? 13 + bob : 2));
  }

  override drawLabels(ctx: CanvasRenderingContext2D, r: Renderer): void {
    if (this.stage !== 'repair') return;
    const pct = Math.floor(this.progress * 100);
    drawText(ctx, `${pct}%`, r.sx(this.x), r.sy(0) - 70, { align: 'center', color: '#f4ecd8', alpha: 0.7 });
  }

  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), stage: this.stage, parts: this.parts, ordered: this.ordered };
  }
}

/** Дальняя пристань: сюда прибывает лодка; в конце — место под маяк. */
export class FarDock extends Structure {
  readonly type = 'lighthouse' as const;
  hasLighthouse = false;

  constructor(x: number) {
    super();
    this.x = x;
    this.z = 5;
    this.payWidth = 20;
    this.payPriority = 2;
  }

  get drawRadius(): number {
    return 60;
  }

  override slotY(): number {
    return 30;
  }

  override price(_m: Monarch): number {
    if (this.hasLighthouse || this.building) return 0;
    const dockPortal = this.world.all<Structure>('structure').find((s) => s.type === 'portal' && (s as Portal).kind === 'dock') as Portal | undefined;
    if (dockPortal && !dockPortal.destroyed) return 0;
    return PRICES.lighthouse;
  }

  override onPaid(_m: Monarch): void {
    this.startBuild(1, WORK.lighthouse);
    this.world.jobs.add('build', this, 2, this.world.clock);
  }

  override finishBuild(): void {
    this.hasLighthouse = true;
    this.world.jobs.removeFor(this);
    this.world.banner('МАЯК ЗАЖЖЁН', 'Лодка больше не разобьётся у этого острова');
    this.world.emit('lighthouse', this);
  }

  lights(out: Light[]): void {
    if (this.hasLighthouse) out.push({ x: this.x + this.world.island.beachSide * 2 * M, y: 64, radius: 80, color: hex('#fff0b0'), intensity: 1 });
  }

  override draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const side = this.world.island.beachSide;
    const sx = r.sx(this.x);
    const gy = r.sy(0);
    blit(ctx, dockSprite(), sx, gy + 4);
    if (this.hasLighthouse) blit(ctx, lighthouseSprite(), r.sx(this.x + side * 2 * M), gy);
    else if (this.scaffold) blit(ctx, lighthouseSprite(), r.sx(this.x + side * 2 * M), gy, false, 0.4);
  }

  override serialize(): Record<string, unknown> {
    return { ...super.serialize(), hasLighthouse: this.hasLighthouse };
  }
}
