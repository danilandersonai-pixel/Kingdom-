// Базовая постройка и интерфейс «оплачиваемого» объекта: над ним
// появляются слоты-монетки, монарх бросает в них монеты.

import { Entity } from '../entity';
import type { Monarch } from '../entities/monarch';

export type Currency = 'coin' | 'gem';

export interface Payable {
  readonly x: number;
  /** Полуширина зоны, где монарх может платить. */
  payWidth: number;
  /** Сколько монет уже в слотах. */
  paid: number;
  /** Цена следующего действия; 0 — сейчас платить нельзя. */
  price(m: Monarch): number;
  currency(): Currency;
  /** Высота слотов над землёй. */
  slotY(): number;
  onPaid(m: Monarch): void;
  /** Больше — важнее при выборе цели оплаты. */
  payPriority: number;
}

export type StructureType =
  | 'townCenter'
  | 'wall'
  | 'tower'
  | 'shop'
  | 'farm'
  | 'camp'
  | 'chest'
  | 'portal'
  | 'nest'
  | 'cliffPortal'
  | 'dock'
  | 'statue'
  | 'hermitHut'
  | 'tree'
  | 'merchant'
  | 'stable'
  | 'bakery'
  | 'ballista'
  | 'catapult'
  | 'bombShop'
  | 'banner'
  | 'rock'
  | 'mill'
  | 'dogHouse'
  | 'lighthouse'
  | 'hornWall';

export abstract class Structure extends Entity implements Payable {
  readonly tag = 'structure' as const;
  abstract readonly type: StructureType;
  level = 0;
  hp = 0;
  maxHp = 0;
  payWidth = 14;
  /** Полуширина «тела» постройки на земле: подвижные постройки её обходят. */
  solid = 0;
  paid = 0;
  payPriority = 1;
  /** Идёт строительство (строители стучат молотками). */
  building = false;
  buildProgress = 0;
  buildTime = 0;
  /** Сколько «работы» строителей нужно на стройку. */
  targetLevel = 0;
  /** Пометка для отрисовки лесов. */
  scaffold = false;

  price(_m: Monarch): number {
    return 0;
  }
  currency(): Currency {
    return 'coin';
  }
  slotY(): number {
    return 30;
  }
  onPaid(_m: Monarch): void {}

  /** Начать стройку до уровня `to` за `work` единиц работы. */
  startBuild(to: number, work: number): void {
    this.building = true;
    this.scaffold = true;
    this.buildProgress = 0;
    this.buildTime = work;
    this.targetLevel = to;
  }

  /** Строитель вносит работу; true — стройка закончена. */
  addWork(amount: number): boolean {
    if (!this.building) return false;
    this.buildProgress += amount;
    if (this.buildProgress >= this.buildTime) {
      this.building = false;
      this.scaffold = false;
      this.finishBuild();
      return true;
    }
    return false;
  }

  finishBuild(): void {
    this.level = this.targetLevel;
  }

  /** Урон от Жадности; возвращает true, если постройка разрушена. */
  damage(_amount: number, _fromX: number): boolean {
    return false;
  }

  serialize(): Record<string, unknown> {
    return { type: this.type, x: this.x, level: this.level, hp: this.hp, building: this.building, buildProgress: this.buildProgress, buildTime: this.buildTime, targetLevel: this.targetLevel };
  }
}
