// Базовая сущность мира. Всё, что живёт на острове — монарх, монеты,
// жители, Жадность, постройки, стрелы — наследуется отсюда.

import type { Renderer } from '../render/renderer';
import type { Light } from '../render/lighting';
import type { World } from './world';

export type EntityTag = 'monarch' | 'coin' | 'item' | 'person' | 'greed' | 'animal' | 'structure' | 'projectile' | 'fx' | 'npc';

let nextId = 1;

export abstract class Entity {
  readonly id = nextId++;
  x = 0;
  /** Высота над землёй. */
  y = 0;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;
  dead = false;
  /** Порядок отрисовки: больше — ближе к зрителю. */
  z = 20;
  /** Таймер анимации. */
  anim = 0;
  abstract readonly tag: EntityTag;
  world!: World;

  onAdd(): void {}
  onRemove(): void {}
  update(_dt: number): void {}
  draw(_ctx: CanvasRenderingContext2D, _r: Renderer): void {}
  /** Светящиеся части — рисуются поверх ночного затемнения. */
  drawEmissive?(ctx: CanvasRenderingContext2D, r: Renderer): void;
  /** Надписи и подсказки — поверх воды, чтобы не отражались в реке. */
  drawLabels?(ctx: CanvasRenderingContext2D, r: Renderer): void;
  /** Источники света. */
  lights?(out: Light[]): void;
  /** Ширина для отсечения при отрисовке. */
  get drawRadius(): number {
    return 40;
  }
}

export function resetEntityIds(v = 1): void {
  nextId = v;
}
