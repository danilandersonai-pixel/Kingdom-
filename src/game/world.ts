// Мир острова: список сущностей, время суток, запросы «кто рядом»,
// границы королевства, системы (волны Жадности, задачи строителей).

import { Rng } from '../engine/rng';
import type { Sfx, SoundName } from '../engine/sfx';
import { silentSfx } from '../engine/sfx';
import type { Renderer } from '../render/renderer';
import type { Light } from '../render/lighting';
import { Particles } from '../render/particles';
import { DayCycle } from './time';
import type { Entity, EntityTag } from './entity';
import type { Terrain } from './terrain';
import { JobBoard } from './jobs';
import type { Difficulty } from './config';
import type { Director } from './director';
import type { IslandLayout } from './island';

export interface IslandInfo {
  index: number;
  seed: number;
  left: number;
  right: number;
  /** Сторона с пляжем и пристанью (-1 слева, 1 справа). */
  beachSide: -1 | 1;
  /** Технологии: 0 — дерево, 1 — камень, 2 — железо. */
  tech: number;
}

/** Глобальное состояние кампании, видимое на любом острове. */
export interface CampaignMeta {
  /** 0 — дерево, 1 — камень, 2 — железо. */
  tech: number;
  /** Активные благословения статуй. */
  blessings: Set<string>;
  /** Разблокированное самоцветами навсегда (статуи, отшельники, скакуны). */
  gemUnlocks: Set<string>;
  difficulty: Difficulty;
  /** Сколько порталов разрушено за всю кампанию (для ответных волн). */
  portalsDestroyed: number;
  /** Вклад у банкира (общий для кампании). */
  bank: number;
  /** Самоцветы у Хранителя. */
  gemKeeper: number;
}

export function defaultMeta(): CampaignMeta {
  return { tech: 0, blessings: new Set(), gemUnlocks: new Set(), difficulty: 'normal', portalsDestroyed: 0, bank: 0, gemKeeper: 0 };
}

export interface Fx {
  particles: Particles;
  shake(amount: number): void;
  ripple(x: number, r?: number): void;
}

export interface Banner {
  text: string;
  sub?: string;
  time: number;
  duration: number;
}

export class World {
  readonly entities: Entity[] = [];
  private readonly tags = new Map<EntityTag, Entity[]>();
  private pending: Entity[] = [];
  readonly time = new DayCycle();
  rng: Rng;
  island: IslandInfo;
  fx: Fx;
  sfx: Sfx = silentSfx;
  /** Позиция «ушей» (камеры) для стерео и громкости. */
  listenerX = 0;
  listenerW = 480;
  banners: Banner[] = [];
  /** Произвольные системы, обновляемые каждый шаг. */
  systems: Array<{ update(dt: number): void }> = [];
  /** Флаг: игра окончена (корона потеряна). */
  crownLost = false;
  crownLostBy: number | null = null;
  /** Время с начала острова. */
  clock = 0;
  terrain!: Terrain;
  meta: CampaignMeta = defaultMeta();
  readonly jobs = new JobBoard();
  /** Кэш часто используемых значений. */
  cache = { townX: 0 };
  director: Director | null = null;
  /** Пещера острова взорвана — Жадность больше не появляется. */
  caveCleared = false;
  /** Самоцветы, унесённые Жадностью (вернёт взрыв пещеры). */
  stolenGems = 0;
  /** Рог созвал защитников к стене этой стороны (до утра). */
  hornCall: -1 | 1 | null = null;
  layout: IslandLayout | null = null;
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  on(event: string, fn: (...args: any[]) => void): void {
    let l = this.listeners.get(event);
    if (!l) this.listeners.set(event, (l = []));
    l.push(fn);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const fn of this.listeners.get(event) ?? []) fn(...args);
  }

  /** Запрос с ответом: первый обработчик, вернувший не undefined. */
  private queries = new Map<string, (...args: any[]) => unknown>();
  answer(name: string, fn: (...args: any[]) => unknown): void {
    this.queries.set(name, fn);
  }
  emitQuery(name: string, ...args: unknown[]): unknown {
    return this.queries.get(name)?.(...args);
  }

  constructor(island: IslandInfo) {
    this.island = island;
    this.rng = new Rng(island.seed);
    this.fx = { particles: new Particles(), shake() {}, ripple() {} };
  }

  add<T extends Entity>(e: T): T {
    e.world = this;
    this.pending.push(e);
    return e;
  }

  private flushPending(): void {
    if (!this.pending.length) return;
    const list = this.pending;
    this.pending = [];
    for (const e of list) {
      this.entities.push(e);
      let arr = this.tags.get(e.tag);
      if (!arr) this.tags.set(e.tag, (arr = []));
      arr.push(e);
      e.onAdd();
    }
  }

  /** Немедленно добавить (для генерации острова). */
  addNow<T extends Entity>(e: T): T {
    this.add(e);
    this.flushPending();
    return e;
  }

  /** Немедленно убрать сущность из мира (для переноса на другой остров). */
  detach(e: Entity): void {
    const i = this.entities.indexOf(e);
    if (i >= 0) this.entities.splice(i, 1);
    const arr = this.tags.get(e.tag);
    if (arr) {
      const j = arr.indexOf(e);
      if (j >= 0) arr.splice(j, 1);
    }
    this.pending = this.pending.filter((p) => p !== e);
  }

  all<T extends Entity = Entity>(tag: EntityTag): T[] {
    return (this.tags.get(tag) ?? []) as T[];
  }

  update(dt: number): void {
    this.clock += dt;
    this.time.update(dt);
    this.flushPending();
    const list = this.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      e.anim += dt;
      e.update(dt);
    }
    for (const s of this.systems) s.update(dt);
    this.fx.particles.update(dt);
    for (const b of this.banners) b.time += dt;
    this.banners = this.banners.filter((b) => b.time < b.duration);
    this.cleanup();
    this.flushPending();
  }

  private cleanup(): void {
    let removed = false;
    for (const e of this.entities) if (e.dead) removed = true;
    if (!removed) return;
    for (const e of this.entities) if (e.dead) e.onRemove();
    const keep = (e: Entity) => !e.dead;
    const filtered = this.entities.filter(keep);
    this.entities.length = 0;
    this.entities.push(...filtered);
    for (const [tag, arr] of this.tags) this.tags.set(tag, arr.filter(keep));
  }

  draw(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const visible: Entity[] = [];
    const left = r.viewLeft;
    const right = r.viewRight;
    for (const e of this.entities) {
      if (e.dead) continue;
      const rad = e.drawRadius;
      if (e.x + rad < left || e.x - rad > right) continue;
      visible.push(e);
    }
    visible.sort((a, b) => a.z - b.z || a.x - b.x);
    for (const e of visible) e.draw(ctx, r);
  }

  drawEmissive(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const left = r.viewLeft - 60;
    const right = r.viewRight + 60;
    for (const e of this.entities) {
      if (e.dead || !e.drawEmissive) continue;
      if (e.x < left || e.x > right) continue;
      e.drawEmissive(ctx, r);
    }
  }

  collectLights(out: Light[]): void {
    for (const e of this.entities) if (!e.dead && e.lights) e.lights(out);
  }

  /** Звук с учётом положения на экране. */
  sound(name: SoundName, x: number, vol = 1): void {
    const dx = x - this.listenerX;
    const half = this.listenerW / 2;
    const dist = Math.abs(dx);
    const fall = dist < half ? 1 : Math.max(0, 1 - (dist - half) / (half * 1.6));
    if (fall <= 0.02) return;
    this.sfx.play(name, Math.max(-1, Math.min(1, dx / half)), vol * fall);
  }

  banner(text: string, sub?: string, duration = 4.5): void {
    this.banners.push({ text, sub, time: 0, duration });
  }

  /** Ближайшая сущность из списка по условию. */
  nearest<T extends Entity>(list: readonly T[], x: number, maxDist: number, filter?: (e: T) => boolean): T | null {
    let best: T | null = null;
    let bd = maxDist;
    for (const e of list) {
      if (e.dead) continue;
      const d = Math.abs(e.x - x);
      if (d <= bd && (!filter || filter(e))) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  get isNight(): boolean {
    return this.time.isNight;
  }
}
