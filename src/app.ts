// Приложение: экран, ввод, звук, отрисовка и кампания. Состояния:
// титульный экран, игра, пауза с картой, выбор острова, плавание,
// потеря короны (наследник), победа.

import { Screen } from './engine/screen';
import { Input } from './engine/input';
import { Loop } from './engine/loop';
import { Audio } from './engine/audio';
import { Renderer } from './render/renderer';
import { computeAtmosphere, nightFactor } from './render/atmosphere';
import type { Light } from './render/lighting';
import type { World } from './game/world';
import type { Monarch } from './game/entities/monarch';
import { Camera } from './game/camera';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';
import { drawMap } from './ui/map';
import { Campaign, randomRuler } from './game/campaign';
import type { CentralDock } from './game/structures/boat';
import { Coin } from './game/entities/pickups';
import { drawText } from './engine/font';
import { debugSetup } from './game/debug';
import { makeBot } from './game/bot';
import { toRoman, clamp } from './engine/math';
import { loadJson, saveJson } from './engine/storage';
import { M, type Difficulty } from './game/config';
import { saveCampaign, loadCampaign, hasSave, clearSave } from './game/save';

export type AppState = 'title' | 'playing' | 'paused' | 'gameover' | 'choose' | 'sailing' | 'victory' | 'help';

interface Settings {
  master: number;
  music: number;
  difficulty: Difficulty;
}

export class App {
  readonly screen: Screen;
  readonly input: Input;
  readonly renderer: Renderer;
  readonly loop: Loop;
  readonly audio = new Audio();
  readonly hud = new Hud();
  cameras: [Camera, Camera] = [new Camera(), new Camera()];
  campaign!: Campaign;
  world!: World;
  monarchs: Monarch[] = [];
  state: AppState = 'title';
  time = 0;
  params: URLSearchParams;
  private stateTime = 0;
  private menu!: Menu;
  private sail: { dock: CentralDock; dest: number; t: number; monarch: Monarch } | null = null;
  private chooseIndex = 2;
  settings: Settings = { master: 0.8, music: 0.6, difficulty: 'normal' };

  constructor(canvas: HTMLCanvasElement) {
    this.params = new URLSearchParams(location.search);
    this.screen = new Screen(canvas);
    this.input = new Input(this.screen);
    this.renderer = new Renderer(this.screen, 1, 'spring');
    this.loop = new Loop(
      (dt) => this.update(dt),
      () => this.render(),
    );
    const s = loadJson<Settings>('settings');
    if (s) this.settings = { ...this.settings, ...s };
    this.applyAudioSettings();
    const speed = Number(this.params.get('speed') ?? 1);
    if (speed > 0) this.loop.timeScale = speed;
    this.input.onFirstGesture = () => this.audio.start();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.openPause();
    });
    if (this.params.has('play') || this.params.has('setup') || this.params.has('island')) {
      this.newCampaign(Number(this.params.get('seed') ?? 1234));
      const isl = Number(this.params.get('island') ?? 1);
      if (isl > 1) this.jumpToIsland(isl);
    } else {
      this.openTitle();
    }
  }

  // ——— Кампания ———

  private applyAudioSettings(): void {
    this.audio.settings.master = this.settings.master;
    this.audio.settings.music = this.settings.music;
    this.audio.applySettings();
  }

  newCampaign(seed = Math.floor(Math.random() * 1e9)): void {
    clearSave();
    this.campaign = new Campaign(seed);
    this.campaign.meta.difficulty = this.settings.difficulty;
    this.wireCampaign();
    const a = this.campaign.startReign();
    this.enterWorld(a.world, a.monarchs);
    const setup = this.params.get('setup');
    if (setup) debugSetup(this.world, setup, this.monarchs[0]);
    const phase = this.params.get('phase');
    if (phase) this.world.time.restore({ day: this.world.time.day, phase: Number(phase) });
    const day = this.params.get('day');
    if (day) this.world.time.restore({ day: Number(day), phase: this.world.time.phase });
    const coins = this.params.get('coins');
    if (coins) this.monarchs[0].coins = Number(coins);
    this.cameras[0].snap(this.monarchs[0].x);
    this.setState('playing');
  }

  continueCampaign(): boolean {
    const loaded = loadCampaign();
    if (!loaded) return false;
    this.campaign = loaded.campaign;
    this.wireCampaign();
    this.enterWorld(loaded.world, loaded.monarchs);
    this.setState('playing');
    return true;
  }

  private jumpToIsland(dest: number): void {
    // Отладка: сразу на нужный остров.
    const dock = this.world.all<CentralDock>('structure').find((s) => s.type === 'dock')!;
    const a = this.campaign.sail(this.world, this.monarchs, dock, dest);
    this.enterWorld(a.world, a.monarchs);
    const setup = this.params.get('setup');
    if (setup) debugSetup(this.world, setup, this.monarchs[0]);
  }

  private wireCampaign(): void {
    this.campaign.onVictory = () => this.setState('victory');
  }

  private enterWorld(world: World, monarchs: Monarch[]): void {
    this.world = world;
    this.monarchs = monarchs;
    monarchs.forEach((m, i) => {
      m.input = this.input.players[i];
    });
    this.renderer.setIsland(world.island.seed, world.time.season);
    const r = this.renderer;
    world.fx = {
      particles: r.particles,
      shake: (a) => (r.shake = Math.max(r.shake, a)),
      ripple: (x, rad = 4) => r.ripples.push({ x, r: rad, life: 1 }),
    };
    world.sfx = this.audio;
    r.particles.list.length = 0;
    this.cameras[0].snap(monarchs[0].x);
    if (monarchs[1]) this.cameras[1].snap(monarchs[1].x);
    this.hud.showDay(world.time.day);
    world.time.onDawn.push((d) => {
      this.hud.showDay(d);
      this.autosave();
    });
    world.on('crownTaken', () => this.onCrownTaken());
    world.on('crownKnocked', () => this.checkCrowns());
    world.on('sail', (m: Monarch, dock: CentralDock) => this.openChoose(m, dock));
    world.banner(`ОСТРОВ ${toRoman(world.island.index)}`, undefined, 4);
  }

  private autosave(): void {
    if (this.params.has('nosave')) return;
    saveCampaign(this.campaign, this.world, this.monarchs);
  }

  private onCrownTaken(): void {
    // В кооперативе проигрыш, только если без короны оба.
    if (this.monarchs.some((m) => m.hasCrown)) return;
    this.world.crownLost = true;
    this.setState('gameover');
  }

  private checkCrowns(): void {
    void 0;
  }

  // ——— Состояния и меню ———

  private setState(s: AppState): void {
    this.state = s;
    this.stateTime = 0;
    this.input.touchGameplay = s === 'playing';
  }

  private openTitle(): void {
    this.setState('title');
    // Живой фон: остров, где правит бот.
    const c = new Campaign(777);
    const a = c.startReign();
    for (const g of a.world.all('npc')) g.dead = true;
    a.monarchs[0].autopilot = makeBot();
    a.monarchs[0].coins = 20;
    this.campaign = c;
    this.enterWorld(a.world, a.monarchs);
    this.world.banners = [];
    this.world.sfx = { play() {} };
    this.menu = new Menu([
      { label: 'Продолжить', action: () => this.continueCampaign(), disabled: () => !hasSave() },
      { label: 'Новая кампания', action: () => this.newCampaign() },
      { label: () => `Сложность: ${DIFF_NAMES[this.settings.difficulty]}`, action: () => this.cycleDifficulty(1), left: () => this.cycleDifficulty(-1), right: () => this.cycleDifficulty(1) },
      { label: () => `Громкость: ${Math.round(this.settings.master * 10)}`, action: () => this.volume(0.1), left: () => this.volume(-0.1), right: () => this.volume(0.1) },
      { label: 'Как играть', action: () => this.setState('help') },
    ]);
    if (!hasSave()) this.menu.index = 1;
  }

  private cycleDifficulty(d: number): void {
    const list: Difficulty[] = ['peaceful', 'easy', 'normal', 'hard', 'cursed'];
    const i = (list.indexOf(this.settings.difficulty) + d + list.length) % list.length;
    this.settings.difficulty = list[i];
    saveJson('settings', this.settings);
  }

  private volume(d: number): void {
    this.settings.master = clamp(Math.round((this.settings.master + d) * 10) / 10, 0, 1);
    this.applyAudioSettings();
    saveJson('settings', this.settings);
  }

  private openPause(): void {
    this.setState('paused');
    this.menu = new Menu([
      { label: 'Продолжить', action: () => this.setState('playing') },
      { label: () => `Громкость: ${Math.round(this.settings.master * 10)}`, action: () => this.volume(0.1), left: () => this.volume(-0.1), right: () => this.volume(0.1) },
      { label: () => `Музыка: ${Math.round(this.settings.music * 10)}`, action: () => this.musicVol(0.1), left: () => this.musicVol(-0.1), right: () => this.musicVol(0.1) },
      { label: () => (this.monarchs.length > 1 ? 'Второй игрок: уйти' : 'Второй игрок: присоединиться'), action: () => this.toggleCoop() },
      { label: 'Сохранить и выйти', action: () => {
        this.autosave();
        this.openTitle();
      } },
    ]);
  }

  private musicVol(d: number): void {
    this.settings.music = clamp(Math.round((this.settings.music + d) * 10) / 10, 0, 1);
    this.applyAudioSettings();
    saveJson('settings', this.settings);
  }

  private openChoose(m: Monarch, dock: CentralDock): void {
    const c = this.campaign;
    this.chooseIndex = Math.min(5, c.current + 1);
    if (this.chooseIndex === c.current) this.chooseIndex = Math.max(1, c.current - 1);
    this.sail = { dock, dest: this.chooseIndex, t: 0, monarch: m };
    this.setState('choose');
  }

  private toggleCoop(): void {
    if (this.monarchs.length > 1) {
      const m2 = this.monarchs.pop()!;
      m2.dead = true;
      this.input.coop = false;
      return;
    }
    const m1 = this.monarchs[0];
    const m2 = new (m1.constructor as typeof Monarch)(1, m1.x - 20, randomRuler(this.campaign.seed + 4242).look);
    m2.riderKey = 'p2';
    m2.input = this.input.players[1];
    this.world.addNow(m2);
    this.monarchs.push(m2);
    this.cameras[1].snap(m2.x);
    this.input.coop = true;
    this.setState('playing');
  }

  start(): void {
    this.loop.start();
  }

  // ——— Сенсорное управление ———

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
      // Кнопка паузы в правом верхнем углу.
      if (primary.startX > w - 26 && primary.startY < 24) {
        inp.consumePointer(primary.id);
        this.openPause();
        return;
      }
      if (primary.dropGesture) {
        t.drop = true;
        if (primary.gestureNew) t.dropPressed = true;
        t.targetX = null;
      } else if (primary.upGesture) {
        if (primary.gestureNew) t.ability = true;
        t.targetX = null;
      } else {
        t.targetX = this.renderer.viewLeft + primary.x;
        t.run = primary.x < w * 0.12 || primary.x > w * 0.88;
      }
      primary.gestureNew = false;
    } else {
      t.targetX = null;
      t.run = false;
    }
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
        coin.ownerLock = 0;
      }
    }
  }

  // ——— Обновление ———

  private update(dt: number): void {
    this.time += dt;
    this.stateTime += dt;
    this.input.poll();
    const p0 = this.input.players[0];
    const w = this.world;
    switch (this.state) {
      case 'title':
        this.menu.update(this.input);
        this.stepWorld(dt, false);
        break;
      case 'help':
        if (p0.pressed('confirm') || p0.pressed('back') || p0.pressed('pause') || this.input.taps.length) this.openTitle();
        this.stepWorld(dt, false);
        break;
      case 'playing':
        if (p0.pressed('pause')) {
          this.openPause();
          return;
        }
        // Второй игрок присоединяется нажатием Enter на цифровой клавиатуре или кнопкой геймпада.
        this.updateTouch(this.monarchs[0]);
        this.stepWorld(dt, true);
        break;
      case 'paused':
        this.menu.update(this.input);
        if (p0.pressed('pause') || p0.pressed('back')) this.setState('playing');
        break;
      case 'choose': {
        const c = this.campaign;
        const max = Math.min(5, c.reached + 1);
        const pick = (d: number) => {
          let i = this.chooseIndex;
          for (let k = 0; k < 5; k++) {
            i = i + d;
            if (i < 1) i = max;
            if (i > max) i = 1;
            if (i !== c.current) break;
          }
          this.chooseIndex = i;
        };
        if (p0.pressed('left')) pick(-1);
        if (p0.pressed('right')) pick(1);
        for (const tap of this.input.taps) {
          const W = this.screen.w;
          const px = Math.round(W * 0.08);
          const i = Math.floor(((tap.x - px) / (W - px * 2)) * 5) + 1;
          if (i >= 1 && i <= max && i !== c.current) {
            if (i === this.chooseIndex) this.startSail();
            else this.chooseIndex = i;
          }
        }
        if (p0.pressed('confirm') || (p0.pressed('drop') && this.stateTime > 0.4)) this.startSail();
        if (p0.pressed('back') || p0.pressed('pause')) {
          // Передумали — деньги вернуть нельзя, лодка ждёт.
          this.sail = null;
          this.setState('playing');
        }
        break;
      }
      case 'sailing': {
        const s = this.sail!;
        s.t += dt;
        if (s.t < 2.6) this.stepWorld(dt, false);
        if (s.t >= 2.6 && !s.dock.dead && s.t - dt < 2.6) {
          const a = this.campaign.sail(w, this.monarchs, s.dock, s.dest);
          this.enterWorld(a.world, a.monarchs);
        }
        if (s.t > 2.6) this.stepWorld(dt, false);
        if (s.t > 6) {
          this.sail = null;
          this.setState('playing');
        }
        break;
      }
      case 'gameover':
        this.stepWorld(dt, false);
        if (this.stateTime > 2 && (p0.pressed('confirm') || p0.pressed('drop') || this.input.taps.length)) {
          const a = this.campaign.heir();
          this.enterWorld(a.world, a.monarchs);
          this.setState('playing');
        }
        break;
      case 'victory':
        this.stepWorld(dt, false);
        if (this.stateTime > 3 && (p0.pressed('confirm') || this.input.taps.length)) {
          clearSave();
          this.openTitle();
        }
        break;
    }
    this.renderer.update(dt);
    const t = this.world.time;
    this.audio.update(dt, {
      night: nightFactor(t.phase),
      winter: t.season === 'winter',
      rain: this.renderer.weather.kind === 'rain' ? this.renderer.weather.intensity : 0,
      blood: t.isBloodMoon && t.phase > 0.55,
      day: t.isDay,
      danger: this.world.all('greed').length,
    });
  }

  private startSail(): void {
    if (!this.sail) return;
    this.sail.dest = this.chooseIndex;
    this.sail.t = 0;
    this.setState('sailing');
    this.world.sound('horn', this.sail.dock.x, 1);
  }

  private stepWorld(dt: number, control: boolean): void {
    const w = this.world;
    const focus = this.monarchs[0];
    for (const m of this.monarchs) if (!control && !m.autopilot) m.input = null;
    if (control) this.monarchs.forEach((m, i) => (m.input = this.input.players[i]));
    w.listenerX = this.cameras[0].x;
    w.listenerW = this.screen.w;
    w.update(dt);
    this.cameras[0].follow(focus, dt, this.screen.w, w.island.left, w.island.right);
    if (this.monarchs[1]) this.cameras[1].follow(this.monarchs[1], dt, this.screen.w, w.island.left, w.island.right);
    this.renderer.setSeason(w.time.season);
    this.updateWeather(dt);
    this.hud.update(dt, focus);
  }

  private weatherTimer = 30;
  private updateWeather(dt: number): void {
    const w = this.world;
    const wx = this.renderer.weather;
    if (w.time.season === 'winter') {
      if (wx.kind !== 'snow') wx.set('snow', 0.6);
      return;
    }
    this.weatherTimer -= dt;
    if (this.weatherTimer > 0) return;
    this.weatherTimer = 60 + Math.random() * 120;
    const rainy = w.time.season === 'autumn' ? 0.45 : w.time.season === 'spring' ? 0.3 : 0.15;
    wx.set(Math.random() < rainy ? 'rain' : 'clear', 0.5 + Math.random() * 0.5);
  }

  // ——— Отрисовка ———

  private render(): void {
    const coop = this.monarchs.length > 1 && (this.state === 'playing' || this.state === 'paused');
    if (coop) this.renderCoop();
    else this.renderView(this.cameras[0].x, this.monarchs[0] ?? null, true);
    this.drawOverlays();
    this.screen.present();
  }

  private atmosphere() {
    const w = this.world;
    const t = w.time;
    const eclipse = w.director?.eclipse ? 1 : 0;
    return computeAtmosphere({
      phase: eclipse ? 0.8 : t.phase,
      season: t.season,
      blood: t.isBloodMoon ? 1 : 0,
      overcast: this.renderer.weather.kind === 'rain' ? this.renderer.weather.intensity : 0,
      snow: t.season === 'winter' ? 1 : 0,
    });
  }

  private renderView(camX: number, focus: Monarch | null, hud: boolean): void {
    const w = this.world;
    const r = this.renderer;
    r.camX = camX;
    const lights: Light[] = [];
    w.collectLights(lights);
    r.lights = lights;
    const showHud = hud && this.state !== 'title' && this.state !== 'help';
    r.render(this.atmosphere(), w.time.phase, this.time, {
      world: (ctx) => w.draw(ctx, r),
      emissive: (ctx) => w.drawEmissive(ctx, r),
      hud: (ctx) => {
        if (showHud) this.hud.draw(ctx, r, w, this.monarchs, focus);
        if (showHud && this.input.touchSeen && this.state === 'playing') this.drawTouchHints(ctx);
      },
    });
  }

  /** Кооператив: экран делится по горизонтали, у каждого своя камера. */
  private renderCoop(): void {
    const ctx = this.screen.ctx;
    const { w, h } = this.screen;
    const half = Math.floor(h / 2);
    this.renderView(this.cameras[1].x, this.monarchs[1], true);
    const [tmp, tctx] = this.coopBuffer(w, h);
    tctx.drawImage(this.screen.buffer, 0, Math.round(h * 0.18), w, half, 0, 0, w, half);
    this.renderView(this.cameras[0].x, this.monarchs[0], true);
    ctx.drawImage(this.screen.buffer, 0, Math.round(h * 0.18), w, half, 0, 0, w, half);
    ctx.drawImage(tmp, 0, 0, w, half, 0, half, w, half);
    // Разделитель: вид меняется с эпохой.
    const tech = this.world.meta.tech;
    ctx.fillStyle = tech >= 2 ? '#4a4e56' : tech >= 1 ? '#8a8a90' : '#6a4a2a';
    ctx.fillRect(0, half - 2, w, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, half + 2, w, 1);
  }

  private coopCanvas: HTMLCanvasElement | null = null;
  private coopCtx: CanvasRenderingContext2D | null = null;
  private coopBuffer(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    if (!this.coopCanvas || this.coopCanvas.width !== w || this.coopCanvas.height !== h) {
      this.coopCanvas = document.createElement('canvas');
      this.coopCanvas.width = w;
      this.coopCanvas.height = h;
      this.coopCtx = this.coopCanvas.getContext('2d')!;
    }
    return [this.coopCanvas, this.coopCtx!];
  }

  private drawTouchHints(ctx: CanvasRenderingContext2D): void {
    const { w } = this.screen;
    // Кнопка паузы.
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#f4ecd8';
    ctx.fillRect(w - 16, 8, 2, 8);
    ctx.fillRect(w - 12, 8, 2, 8);
    ctx.globalAlpha = 1;
    // Первые секунды — подсказка жестов.
    if (this.world.time.day === 1 && this.world.time.phase < 0.12) {
      drawText(ctx, 'ТЯНИТЕ ПАЛЬЦЕМ — ИДТИ, К КРАЮ — ГАЛОП', Math.floor(w / 2), this.screen.h - 34, { align: 'center', color: '#f4ecd8', alpha: 0.8 });
      drawText(ctx, 'СВАЙП ВНИЗ И ДЕРЖАТЬ — ПЛАТИТЬ', Math.floor(w / 2), this.screen.h - 22, { align: 'center', color: '#f4ecd8', alpha: 0.8 });
    }
  }

  private dim(ctx: CanvasRenderingContext2D, a: number): void {
    ctx.fillStyle = `rgba(6,6,14,${a})`;
    ctx.fillRect(0, 0, this.screen.w, this.screen.h);
  }

  private drawOverlays(): void {
    const ctx = this.screen.ctx;
    const { w, h } = this.screen;
    const cx = Math.floor(w / 2);
    switch (this.state) {
      case 'title': {
        const a = Math.min(1, this.stateTime * 0.8);
        this.dim(ctx, 0.25 * a);
        drawText(ctx, 'КОРОЛЕВСТВО', cx, Math.floor(h * 0.14), { align: 'center', scale: 3, color: '#f4e4b8', alpha: a, outline: '#2a1a10' });
        drawText(ctx, 'ДВЕ КОРОНЫ И ЖАДНОСТЬ', cx, Math.floor(h * 0.14) + 26, { align: 'center', color: '#e8d8b0', alpha: a });
        this.menu.draw(ctx, cx, Math.floor(h * 0.42), 15);
        drawText(ctx, 'СТРЕЛКИ/WASD — ВЫБОР, ENTER — ОК', cx, h - 12, { align: 'center', color: '#c8bca0', alpha: 0.6 });
        break;
      }
      case 'help':
        this.dim(ctx, 0.7);
        HELP.forEach((line, i) => drawText(ctx, line, cx, 16 + i * 11, { align: 'center', color: i === 0 ? '#f2c84a' : '#e8dcc0' }));
        break;
      case 'paused':
        this.dim(ctx, 0.62);
        drawText(ctx, 'ПАУЗА', cx, 12, { align: 'center', scale: 2 });
        drawMap(ctx, w, Math.floor(h * 0.62), this.world, this.campaign, this.monarchs.map((m) => m.x));
        this.menu.draw(ctx, cx, Math.floor(h * 0.62), 13);
        break;
      case 'choose':
        this.dim(ctx, 0.6);
        drawText(ctx, 'КУДА ПЛЫТЬ?', cx, 14, { align: 'center', scale: 2 });
        drawMap(ctx, w, Math.floor(h * 0.7), this.world, this.campaign, this.monarchs.map((m) => m.x), this.chooseIndex);
        drawText(ctx, `ОСТРОВ ${toRoman(this.chooseIndex)}`, cx, Math.floor(h * 0.72), { align: 'center', scale: 2, color: '#f2c84a' });
        drawText(ctx, '< > — ВЫБОР, ENTER — ОТПЛЫТЬ, ESC — ОТМЕНА', cx, h - 14, { align: 'center', color: '#c8bca0' });
        break;
      case 'sailing': {
        const t = this.sail?.t ?? 0;
        const a = t < 2.6 ? clamp((t - 1) / 1.6, 0, 1) : clamp(1 - (t - 4) / 1.5, 0, 1);
        this.dim(ctx, a);
        if (a > 0.5) drawText(ctx, `ОСТРОВ ${toRoman(this.sail?.dest ?? 1)}`, cx, Math.floor(h * 0.42), { align: 'center', scale: 3, color: '#f4e4b8', alpha: (a - 0.5) * 2 });
        break;
      }
      case 'gameover': {
        const a = Math.min(0.7, this.stateTime * 0.4);
        this.dim(ctx, a);
        drawText(ctx, 'КОРОНА УТРАЧЕНА', cx, Math.floor(h * 0.36), { align: 'center', scale: 2, alpha: a / 0.7 });
        drawText(ctx, 'Правление продолжит наследник.', cx, Math.floor(h * 0.36) + 24, { align: 'center', color: '#d8ccb0', alpha: a / 0.7 });
        drawText(ctx, 'Открытое самоцветами и разрушенные порталы останутся.', cx, Math.floor(h * 0.36) + 36, { align: 'center', color: '#a89c80', alpha: a / 0.7 });
        if (this.stateTime > 2) drawText(ctx, 'НАЖМИТЕ ENTER', cx, Math.floor(h * 0.36) + 56, { align: 'center', color: '#f2c84a' });
        break;
      }
      case 'victory': {
        const a = Math.min(0.6, this.stateTime * 0.3);
        this.dim(ctx, a);
        drawText(ctx, 'ПОБЕДА', cx, Math.floor(h * 0.3), { align: 'center', scale: 3, color: '#f2c84a' });
        drawText(ctx, 'Все пять пещер Жадности разрушены.', cx, Math.floor(h * 0.3) + 30, { align: 'center' });
        drawText(ctx, `Правлений: ${this.campaign.reign}. Дней последнего правления: ${this.world.time.day}.`, cx, Math.floor(h * 0.3) + 42, { align: 'center', color: '#d8ccb0' });
        break;
      }
      default:
        break;
    }
    void M;
  }
}

const DIFF_NAMES: Record<Difficulty, string> = { peaceful: 'мирная', easy: 'лёгкая', normal: 'обычная', hard: 'трудная', cursed: 'проклятая' };

const HELP = [
  'КАК ИГРАТЬ',
  'A/D ИЛИ СТРЕЛКИ — ЕХАТЬ. SHIFT — ГАЛОП (КОНЬ УСТАЁТ).',
  'S ИЛИ СТРЕЛКА ВНИЗ: НАЖАТЬ — УРОНИТЬ МОНЕТУ,',
  'ДЕРЖАТЬ У ПОСТРОЙКИ — ЗАПЛАТИТЬ В СЛОТЫ.',
  'БРОСЬТЕ МОНЕТУ БРОДЯГЕ — ОН СТАНЕТ ПОДДАННЫМ.',
  'ПОКУПАЙТЕ ЛУКИ И МОЛОТЫ, СТРОЙТЕ СТЕНЫ И БАШНИ.',
  'НОЧЬЮ ПРИХОДИТ ЖАДНОСТЬ: КРАДЁТ МОНЕТЫ И КОРОНУ.',
  'БЕЗ МОНЕТ УДАР СБИВАЕТ КОРОНУ — БЕРЕГИТЕСЬ!',
  'ПОЧИНИТЕ ЛОДКУ И ПЛЫВИТЕ НА ДРУГИЕ ОСТРОВА.',
  'ЦЕЛЬ — ВЗОРВАТЬ ПЕЩЕРЫ ЖАДНОСТИ НА ВСЕХ 5 ОСТРОВАХ.',
  'ТЕЛЕФОН: ТЯНИТЕ ПАЛЬЦЕМ, СВАЙП ВНИЗ — ПЛАТИТЬ,',
  'СВАЙП ВВЕРХ — СПОСОБНОСТЬ СКАКУНА.',
  'КООПЕРАТИВ: ПАУЗА — «ВТОРОЙ ИГРОК». WASD И СТРЕЛКИ.',
  '',
  'НАЖМИТЕ ENTER',
];
