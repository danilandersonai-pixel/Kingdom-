// Сборка кадра: небо → слои леса → мир (земля, постройки, персонажи)
// → затемнение и свет → светящиеся объекты → отражение в воде → погода → интерфейс.

import type { Screen } from '../engine/screen';
import { makeCanvas } from '../engine/sprite';
import { Background } from './background';
import { Ground, GROUND_H } from './ground';
import { Lighting, type Light } from './lighting';
import { Particles } from './particles';
import { Weather } from './weather';
import { drawWater, type Ripple } from './water';
import type { Atmosphere, Season } from './atmosphere';
import { nightFactor } from './atmosphere';
import { fxRng } from '../engine/rng';

export interface FrameCallbacks {
  /** Объекты мира — рисуются в слой мира и затемняются ночью. */
  world(ctx: CanvasRenderingContext2D): void;
  /** Светящиеся объекты (огонь, глаза) — поверх затемнения. */
  emissive?(ctx: CanvasRenderingContext2D): void;
  /** Интерфейс — поверх всего, после воды. */
  hud?(ctx: CanvasRenderingContext2D): void;
}

export class Renderer {
  readonly screen: Screen;
  bg: Background;
  ground: Ground;
  readonly lighting: Lighting;
  readonly particles = new Particles();
  readonly weather = new Weather();
  readonly ripples: Ripple[] = [];
  lights: Light[] = [];
  /** Атмосфера последнего кадра (для объектов, которые рисуют воду сами). */
  atmos: Atmosphere | null = null;

  camX = 0;
  shake = 0;
  private shakeX = 0;
  private lastCamX = 0;

  private world!: HTMLCanvasElement;
  worldCtx!: CanvasRenderingContext2D;
  private sceneCopy!: HTMLCanvasElement;
  private sceneCtx!: CanvasRenderingContext2D;

  groundY = 189;
  waterTop = 200;
  horizonY = 175;

  constructor(screen: Screen, seed: number, season: Season) {
    this.screen = screen;
    this.bg = new Background(seed, season);
    this.ground = new Ground(season, seed);
    this.lighting = new Lighting(screen.w, screen.h);
    this.layout();
    screen.onResize(() => this.layout());
  }

  setIsland(seed: number, season: Season): void {
    this.bg = new Background(seed, season);
    this.ground = new Ground(season, seed);
  }

  setSeason(season: Season): void {
    this.bg.setSeason(season);
    this.ground.setSeason(season);
  }

  private layout(): void {
    const { w, h } = this.screen;
    this.groundY = Math.round(h * 0.7);
    this.waterTop = this.groundY + GROUND_H;
    this.horizonY = this.groundY - 12;
    [this.world, this.worldCtx] = makeCanvas(w, h);
    [this.sceneCopy, this.sceneCtx] = makeCanvas(w, this.waterTop);
    this.lighting.resize(w, h);
  }

  get w(): number {
    return this.screen.w;
  }
  get h(): number {
    return this.screen.h;
  }

  /** Мировая X → экранная X (с учётом тряски камеры). */
  sx(x: number): number {
    return Math.round(x - (this.camX + this.shakeX) + this.screen.w / 2);
  }
  /** Высота над землёй → экранная Y. */
  sy(y: number): number {
    return Math.round(this.groundY - y);
  }
  /** Левая граница видимой области в мировых координатах. */
  get viewLeft(): number {
    return this.camX + this.shakeX - this.screen.w / 2;
  }
  get viewRight(): number {
    return this.camX + this.shakeX + this.screen.w / 2;
  }
  visible(x: number, margin = 64): boolean {
    return x > this.viewLeft - margin && x < this.viewRight + margin;
  }

  update(dt: number): void {
    this.particles.update(dt);
    this.bg.update(dt);
    const camDx = (this.camX - this.lastCamX) / Math.max(dt, 1e-4);
    this.lastCamX = this.camX;
    this.weather.update(dt, this.w, this.h, this.waterTop, camDx, this.ripples, this.camX);
    for (const r of this.ripples) r.life -= dt * 1.6;
    for (let i = this.ripples.length - 1; i >= 0; i--) if (this.ripples[i].life <= 0) this.ripples.splice(i, 1);
    if (this.ripples.length > 120) this.ripples.splice(0, this.ripples.length - 120);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 10);
      this.shakeX = (fxRng.next() - 0.5) * this.shake * 2;
    } else {
      this.shakeX = 0;
    }
  }

  render(a: Atmosphere, phase: number, time: number, cb: FrameCallbacks): void {
    const ctx = this.screen.ctx;
    const { w, h } = this.screen;
    const camX = this.camX + this.shakeX;
    this.atmos = a;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;

    this.bg.drawSky(ctx, a, camX, w, this.horizonY, time);
    this.bg.drawLayers(ctx, a, camX, w, this.groundY);

    const wctx = this.worldCtx;
    wctx.globalCompositeOperation = 'source-over';
    wctx.globalAlpha = 1;
    wctx.clearRect(0, 0, w, h);
    this.ground.draw(wctx, camX, w, this.groundY);
    cb.world(wctx);
    this.particles.draw(wctx, camX, w, this.groundY, false);
    this.lighting.apply(wctx, this.lights, a, camX, this.groundY, w, h, time);
    ctx.drawImage(this.world, 0, 0);

    cb.emissive?.(ctx);
    this.particles.draw(ctx, camX, w, this.groundY, true);
    this.lighting.halos(ctx, this.lights, a, camX, this.groundY, w, time);

    this.sceneCtx.clearRect(0, 0, w, this.waterTop);
    this.sceneCtx.drawImage(this.screen.buffer, 0, 0, w, this.waterTop, 0, 0, w, this.waterTop);
    drawWater(ctx, this.sceneCopy, this.waterTop, w, h, time, a, camX, this.ripples);

    this.weather.draw(ctx, nightFactor(phase));
    cb.hud?.(ctx);
  }
}
