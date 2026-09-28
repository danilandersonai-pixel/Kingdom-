// Сборка кадра: небо → слои леса → мир (земля, постройки, персонажи)
// → затемнение и свет → светящиеся объекты → отражение в воде → погода → интерфейс.

import type { Screen } from '../engine/screen';
import { makeCanvas, rgb } from '../engine/sprite';
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
  /** Небо: после светил, до слоёв леса (птицы). */
  sky?(ctx: CanvasRenderingContext2D): void;
  /** Поверх воды, до погоды (рыба). */
  water?(ctx: CanvasRenderingContext2D): void;
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
  /** Лёд на реке (0..1): зимой река замерзает. */
  frozen = 0;
  /** Солнечные лучи сквозь лес (0..1). */
  rays = 0;
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

  /** Косые солнечные лучи сквозь кроны — утром и вечером. */
  private drawRays(ctx: CanvasRenderingContext2D, a: Atmosphere, camX: number, time: number): void {
    const { w } = this.screen;
    const low = 1 - Math.min(1, a.sunH * 1.6);
    const k = this.rays * (0.35 + low * 0.65);
    if (k < 0.02) return;
    ctx.globalCompositeOperation = 'lighter';
    const col = a.sunColor;
    const cell = 150;
    const left = camX * 0.6 - w / 2;
    for (let c = Math.floor(left / cell) - 1; c <= Math.floor((left + w) / cell) + 1; c++) {
      const hv = Math.abs(Math.sin(c * 12.9898) * 43758.5453) % 1;
      if (hv < 0.45) continue;
      const x = c * cell + hv * cell - left;
      const width = 10 + hv * 22;
      const alpha = k * 0.06 * (0.6 + 0.4 * Math.sin(time * 0.3 + c));
      const top = this.horizonY - 150;
      const g = ctx.createLinearGradient(0, top, 0, this.groundY);
      g.addColorStop(0, rgb(col, 0));
      g.addColorStop(0.5, rgb(col, alpha));
      g.addColorStop(1, rgb(col, alpha * 0.4));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + width, top);
      ctx.lineTo(x + width + 70, this.groundY);
      ctx.lineTo(x + 70, this.groundY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
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
    cb.sky?.(ctx);
    this.bg.drawLayers(ctx, a, camX, w, this.groundY);
    if (this.rays > 0.01 && a.sunH > 0.05) this.drawRays(ctx, a, camX, time);

    const wctx = this.worldCtx;
    wctx.globalCompositeOperation = 'source-over';
    wctx.globalAlpha = 1;
    wctx.clearRect(0, 0, w, h);
    this.ground.draw(wctx, camX, w, this.groundY, time);
    cb.world(wctx);
    this.particles.draw(wctx, camX, w, this.groundY, false);
    this.lighting.apply(wctx, this.lights, a, camX, this.groundY, w, h, time);
    ctx.drawImage(this.world, 0, 0);

    cb.emissive?.(ctx);
    this.particles.draw(ctx, camX, w, this.groundY, true);
    this.lighting.halos(ctx, this.lights, a, camX, this.groundY, w, time);

    this.sceneCtx.clearRect(0, 0, w, this.waterTop);
    this.sceneCtx.drawImage(this.screen.buffer, 0, 0, w, this.waterTop, 0, 0, w, this.waterTop);
    drawWater(ctx, this.sceneCopy, this.waterTop, w, h, time, a, camX, this.ripples, this.frozen);
    this.ground.drawReeds(ctx, camX, w, this.waterTop, time);
    cb.water?.(ctx);

    this.weather.draw(ctx, nightFactor(phase));
    cb.hud?.(ctx);
  }
}
