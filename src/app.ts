// Приложение: связывает экран, ввод, звук, отрисовку и мир острова,
// переключает состояния (титульный экран, игра, пауза, поражение).

import { Screen } from './engine/screen';
import { Input } from './engine/input';
import { Loop } from './engine/loop';
import { Renderer } from './render/renderer';
import { computeAtmosphere } from './render/atmosphere';
import type { Light } from './render/lighting';
import type { World } from './game/world';
import { Monarch } from './game/entities/monarch';
import { Camera } from './game/camera';
import { Hud } from './ui/hud';
import { generateIsland } from './game/island';
import { M } from './game/config';
import { Coin } from './game/entities/pickups';
import { drawText } from './engine/font';
import { debugSetup } from './game/debug';

export type AppState = 'title' | 'playing' | 'paused' | 'gameover' | 'sailing' | 'victory';

export class App {
  readonly screen: Screen;
  readonly input: Input;
  readonly renderer: Renderer;
  readonly loop: Loop;
  readonly hud = new Hud();
  readonly camera = new Camera();
  world!: World;
  monarchs: Monarch[] = [];
  state: AppState = 'playing';
  time = 0;
  params: URLSearchParams;
  seed = 1234;

  constructor(canvas: HTMLCanvasElement) {
    this.params = new URLSearchParams(location.search);
    this.screen = new Screen(canvas);
    this.input = new Input(this.screen);
    this.renderer = new Renderer(this.screen, 1, 'spring');
    this.loop = new Loop(
      (dt) => this.update(dt),
      () => this.render(),
    );
    const speed = Number(this.params.get('speed') ?? 1);
    if (speed > 0) this.loop.timeScale = speed;
    this.seed = Number(this.params.get('seed') ?? 1234);
    this.newReign(Number(this.params.get('island') ?? 1));
  }

  newReign(islandIndex: number): void {
    const world = generateIsland(this.seed, islandIndex, { newReign: true });
    this.attachWorld(world);
    const m = new Monarch(0, -34 * M);
    m.facing = 1;
    m.input = this.input.players[0];
    world.addNow(m);
    this.monarchs = [m];
    this.camera.snap(m.x);
    const phase = this.params.get('phase');
    if (phase) world.time.phase = Number(phase);
    const day = this.params.get('day');
    if (day) world.time.day = Number(day);
    const setup = this.params.get('setup');
    if (setup) debugSetup(world, setup, m);
    const coins = this.params.get('coins');
    if (coins) m.coins = Number(coins);
    this.camera.snap(m.x);
    this.hud.showDay(world.time.day);
    world.time.onDawn.push((d) => this.hud.showDay(d));
    world.on('crownTaken', () => {
      world.crownLost = true;
      this.state = 'gameover';
    });
  }

  private attachWorld(world: World): void {
    this.world = world;
    this.renderer.setIsland(world.island.seed, world.time.season);
    const r = this.renderer;
    world.fx = {
      particles: r.particles,
      shake: (a) => (r.shake = Math.max(r.shake, a)),
      ripple: (x, rad = 4) => r.ripples.push({ x, r: rad, life: 1 }),
    };
  }

  start(): void {
    this.loop.start();
  }

  /** Сенсорное управление по спецификации: тянуть монарха, край — галоп, свайпы. */
  private updateTouch(m: Monarch): void {
    const inp = this.input;
    if (!inp.touchSeen) {
      m.touch = null;
      return;
    }
    if (!m.touch) m.touch = { targetX: null, run: false, drop: false, dropPressed: false, ability: false };
    const t = m.touch;
    const w = this.screen.w;
    let primary = null;
    for (const p of inp.pointers.values()) {
      if (p.consumed) continue;
      primary = p;
      break;
    }
    t.drop = false;
    if (primary) {
      if (primary.dropGesture) {
        t.drop = true;
        if (primary.gestureNew) t.dropPressed = true;
        t.targetX = null;
      } else if (primary.upGesture) {
        if (primary.gestureNew) t.ability = true;
        t.targetX = null;
      } else {
        const worldX = this.renderer.viewLeft + primary.x;
        t.targetX = worldX;
        t.run = primary.x < w * 0.12 || primary.x > w * 0.88;
      }
      primary.gestureNew = false;
    } else {
      t.targetX = null;
      t.run = false;
    }
    // Тапы: по монарху — уронить монету, по монете — подобрать издалека.
    for (const tap of inp.taps) {
      const wx = this.renderer.viewLeft + tap.x;
      if (Math.abs(wx - m.x) < 16 && tap.y > this.renderer.groundY - 40 && tap.y < this.renderer.groundY + 4) {
        t.dropPressed = true;
        t.drop = true;
        continue;
      }
      const coin = this.world.nearest(this.world.all<Coin>('coin'), wx, 8, (c) => !c.homing && c.y < 20);
      if (coin && Math.abs(tap.y - (this.renderer.groundY - coin.y)) < 14) {
        coin.homing = m.id;
        coin.kick((m.x - coin.x) * 1.2, 60);
        coin.noPickup = 0;
      }
    }
  }

  private update(dt: number): void {
    this.time += dt;
    this.input.poll();
    const p0 = this.input.players[0];
    if (this.state === 'playing') {
      if (p0.pressed('pause')) {
        this.state = 'paused';
        return;
      }
      const focus = this.monarchs[0];
      this.updateTouch(focus);
      this.world.listenerX = this.camera.x;
      this.world.listenerW = this.screen.w;
      this.world.update(dt);
      this.camera.follow(focus, dt, this.screen.w, this.world.island.left, this.world.island.right);
      this.renderer.camX = this.camera.x;
      this.renderer.setSeason(this.world.time.season);
      this.hud.update(dt, focus);
    } else if (this.state === 'paused') {
      if (p0.pressed('pause') || p0.pressed('confirm') || this.input.taps.length) this.state = 'playing';
    } else if (this.state === 'gameover') {
      this.world.update(dt);
      if (p0.pressed('confirm') || this.input.taps.length) {
        this.state = 'playing';
        this.newReign(1);
      }
    }
    this.renderer.update(dt);
  }

  private render(): void {
    const w = this.world;
    const t = w.time;
    const blood = t.isBloodMoon ? 1 : 0;
    const eclipse = w.director?.eclipse ? 1 : 0;
    const a = computeAtmosphere({ phase: eclipse ? 0.8 : t.phase, season: t.season, blood, overcast: this.renderer.weather.kind === 'rain' ? this.renderer.weather.intensity : 0, snow: t.season === 'winter' ? 1 : 0 });
    const lights: Light[] = [];
    w.collectLights(lights);
    this.renderer.lights = lights;
    this.renderer.render(a, t.phase, this.time, {
      world: (ctx) => w.draw(ctx, this.renderer),
      emissive: (ctx) => w.drawEmissive(ctx, this.renderer),
      hud: (ctx) => {
        this.hud.draw(ctx, this.renderer, w, this.monarchs, this.monarchs[0] ?? null);
        if (this.state === 'paused') this.drawOverlay(ctx, 'ПАУЗА', 'Нажмите Esc, чтобы продолжить');
        if (this.state === 'gameover') this.drawOverlay(ctx, 'КОРОНА УТРАЧЕНА', 'Нажмите Enter — правление продолжит наследник');
      },
    });
    this.screen.present();
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, title: string, sub: string): void {
    const { w, h } = this.screen;
    ctx.fillStyle = 'rgba(8,8,16,0.55)';
    ctx.fillRect(0, 0, w, h);
    drawText(ctx, title, Math.floor(w / 2), Math.floor(h * 0.38), { align: 'center', scale: 2 });
    drawText(ctx, sub, Math.floor(w / 2), Math.floor(h * 0.38) + 22, { align: 'center', color: '#d8ccb0' });
  }
}
