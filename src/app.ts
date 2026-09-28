// Приложение: экран, ввод, звук, отрисовка и кампания. Состояния:
// титульный экран, игра, пауза с картой, выбор острова, плавание,
// потеря короны (наследник), победа.

import { Screen } from './engine/screen';
import { Input } from './engine/input';
import { Loop } from './engine/loop';
import { Audio } from './engine/audio';
import { Renderer } from './render/renderer';
import { Ambience } from './render/ambience';
import { computeAtmosphere, nightFactor } from './render/atmosphere';
import type { Light } from './render/lighting';
import type { World } from './game/world';
import type { Monarch } from './game/entities/monarch';
import { Camera } from './game/camera';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';
import { drawMap } from './ui/map';
import { drawPanel } from './ui/panel';
import { drawLogo } from './ui/logo';
import { Plaques } from './ui/plaque';
import { DayCycle } from './game/time';
import { Campaign, randomRuler } from './game/campaign';
import type { CentralDock } from './game/structures/boat';
import { CrownOffer } from './game/structures/special';
import { Coin, DroppedCrown } from './game/entities/pickups';
import { drawText, textWidth } from './engine/font';
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
  private ambience!: Ambience;
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
  /** Начало правления: пока монарх стоит на месте, «вниз» меняет его облик. */
  private reroll: { x: number } | null = null;
  private readonly hooked = new WeakSet<World>();
  private readonly plaques = new Plaques();
  settings: Settings = { master: 0.8, music: 0.6, difficulty: 'normal' };

  constructor(canvas: HTMLCanvasElement) {
    this.params = new URLSearchParams(location.search);
    this.screen = new Screen(canvas);
    this.input = new Input(this.screen);
    this.renderer = new Renderer(this.screen, 1, 'spring');
    this.ambience = new Ambience(this.renderer);
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
    if (day) {
      this.world.time.restore({ day: Number(day), phase: this.world.time.phase });
      this.hud.showDay(this.world.time.day);
    }
    const coins = this.params.get('coins');
    if (coins) this.monarchs[0].coins = Number(coins);
    this.cameras[0].snap(this.monarchs[0].x);
    this.reroll = setup ? null : { x: this.monarchs[0].x };
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
    this.renderer.ground.terrain = world.terrain;
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
    // При возвращении на остров мир тот же — подписываемся только один раз.
    if (!this.hooked.has(world)) {
      this.hooked.add(world);
      world.time.onDawn.push((d) => {
        if (this.world !== world) return;
        this.hud.showDay(d);
        if (DayCycle.isBloodMoonDay(d - 1) && this.monarchs.some((m) => m.hasCrown)) this.moment('', 'КРОВАВАЯ ЛУНА ПОЗАДИ', 'Королевство выстояло');
        else if (d > 1 && world.time.dayInSeason === 1) {
          const seasons: Record<string, [string, string]> = {
            spring: ['ВЕСНА', 'Трава отрастает — кони пасутся, поля зеленеют'],
            summer: ['ЛЕТО', 'Долгие дни и тёплые ночи'],
            autumn: ['ОСЕНЬ', 'Дожди и листопад — готовьтесь к зиме'],
            winter: ['ЗИМА', 'Поля и пастбища под снегом — берегите монеты'],
          };
          const [t, sub] = seasons[world.time.season];
          world.banner(t, sub, 6);
        }
        this.autosave();
      });
      world.on('moment', (key: string, title: string, sub: string) => this.moment(key, title, sub));
      world.on('tcUpgraded', (level: number) => {
        const m: Record<number, [string, string]> = {
          1: ['КОРОЛЕВСТВО ОСНОВАНО', 'Костёр горит — королевство живёт'],
          4: ['ГОРОД', 'Королевство растёт'],
          5: ['КАМЕННЫЙ ФОРТ', 'Камень крепче дерева'],
          6: ['ЗАМОК', 'Королевство стало твердыней'],
          7: ['ЖЕЛЕЗНАЯ КРЕПОСТЬ', 'Кузнецы куют мечи рыцарям'],
        };
        if (m[level]) this.moment(`tc${level}`, m[level][0], m[level][1]);
      });
      world.on('portalDestroyed', () => this.moment('', 'ПОРТАЛ РАЗРУШЕН', 'Жадность отступает'));
      world.on('caveCleared', () => this.moment('', 'ПЕЩЕРА ВЗОРВАНА', 'Остров свободен от Жадности'));
      world.on('crownTaken', (ownerId: number) => this.onCrownTaken(ownerId));
      world.on('emptyDrop', (m: Monarch) => this.rerollRuler(m));
      world.on('sail', (m: Monarch, dock: CentralDock) => this.openChoose(m, dock));
    }
    // Первое прибытие на новый остров — памятный момент, иначе — просто надпись.
    if (world.island.index > 1 && !this.campaign.meta.moments.includes(`isl${world.island.index}`) && this.state !== 'title') this.moment(`isl${world.island.index}`, `ОСТРОВ ${toRoman(world.island.index)}`, 'Новая земля');
    else world.banner(`ОСТРОВ ${toRoman(world.island.index)}`, undefined, 4);
  }

  /** Памятный момент: табличка с салютом и фанфары. Ключ — для разовых (пустой — всегда). */
  private moment(key: string, title: string, sub: string): void {
    if (this.state === 'title' || this.params.has('setup')) return;
    const meta = this.campaign.meta;
    if (key) {
      if (meta.moments.includes(key)) return;
      meta.moments.push(key);
    }
    this.plaques.show(title, sub);
    this.audio.play('fanfare', 0, 0.8);
  }

  private rerollRuler(m: Monarch): void {
    if (!this.reroll || m.player !== 0 || !m.hasCrown || this.state !== 'playing') return;
    const r = this.campaign.rerollRuler();
    m.rider = r.look;
    m.riderKey = r.key;
    this.world.sound('upgrade', m.x, 0.6);
  }

  /** Автосохранение: только настоящей партии и только пока корона не «в игре». */
  private autosave(): void {
    if (this.params.has('nosave')) return;
    if (this.state === 'title' || this.state === 'help' || this.state === 'gameover' || this.state === 'victory') return;
    if (this.world.all('item').some((e) => e instanceof DroppedCrown && !e.dead)) return;
    saveCampaign(this.campaign, this.world, this.monarchs);
  }

  /** Сохранять вручную можно днём, когда Жадности рядом нет (ночь не «пропустить» выходом). */
  private canSaveNow(): boolean {
    const w = this.world;
    return w.time.isDay && !w.director?.eclipse && !w.all('greed').some((g) => !g.dead);
  }

  private onCrownTaken(ownerId: number): void {
    // В кооперативе проигрыш, только если без короны оба.
    if (this.monarchs.some((m) => m.hasCrown)) {
      this.world.add(new CrownOffer(ownerId));
      this.world.banner('КОРОНА УТРАЧЕНА', 'Товарищ может выковать новую за 8 монет');
      return;
    }
    this.world.crownLost = true;
    this.setState('gameover');
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
      { label: 'Как играть', action: () => this.showText(HELP) },
      { label: () => (document.fullscreenElement ? 'Выйти из полного экрана' : 'Во весь экран'), action: () => this.toggleFullscreen() },
      { label: 'Об игре', action: () => this.showText(ABOUT) },
    ]);
    if (!hasSave()) this.menu.index = 1;
  }

  private textLines: string[] = [];

  private showText(lines: string[]): void {
    this.textLines = lines;
    this.setState('help');
  }

  private toggleFullscreen(): void {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.();
    } catch {
      // Встроенная страница может запрещать полноэкранный режим — не страшно.
    }
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
      {
        label: () => (this.canSaveNow() ? 'Сохранить и выйти' : hasSave() ? 'В меню (сохранено на рассвете)' : 'В меню (ночью не сохранить)'),
        action: () => {
          if (this.canSaveNow()) this.autosave();
          this.openTitle();
        },
      },
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
      // Кнопка паузы в правом верхнем углу (зона побольше кружка — пальцем легко попасть).
      if (primary.startX > w - 34 && primary.startY < 32) {
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
        if (p0.pressed('confirm') || p0.pressed('back') || p0.pressed('pause') || this.input.taps.length) {
          // Назад к тому же титулу: мир и меню не пересоздаются, логотип не мигает заново.
          this.setState('title');
          this.stateTime = 5;
        }
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
          const b = this.cancelRect();
          if (tap.x >= b.x && tap.x <= b.x + b.w && tap.y >= b.y && tap.y <= b.y + b.h) {
            this.sail = null;
            this.setState('playing');
            break;
          }
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
          this.reroll = { x: a.monarchs[0].x };
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
    if (this.state === 'victory') this.plaques.celebrate(dt, this.screen.w, this.screen.h);
    this.plaques.update(dt, this.screen.w, this.screen.h);
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
    if (this.reroll && Math.abs(focus.x - this.reroll.x) > 6) this.reroll = null;
    // На титуле всадник-бот держится левее, чтобы его не закрывала доска меню.
    this.cameras[0].follow(focus, dt, this.screen.w, w.island.left, w.island.right, this.state === 'title' || this.state === 'help' ? this.screen.w * 0.3 : 0);
    if (this.monarchs[1]) this.cameras[1].follow(this.monarchs[1], dt, this.screen.w, w.island.left, w.island.right);
    this.renderer.setSeason(w.time.season);
    this.updateWeather(dt);
    this.hud.update(dt, focus);
    // Атмосфера: лёд зимой, лучи в ясную погоду, живая природа.
    const winter = w.time.season === 'winter';
    const r = this.renderer;
    r.frozen = Math.max(0, Math.min(1, r.frozen + (winter ? dt : -dt) * 0.2));
    const clear = r.weather.kind === 'rain' ? 1 - r.weather.intensity : 1;
    r.rays = w.time.isDay && !winter ? clear : Math.max(0, r.rays - dt);
    r.lilies = w.time.season === 'spring' || w.time.season === 'summer';
    r.shore = { x: w.island.beachSide * (w.island.right - 2 * M), side: w.island.beachSide };
    this.ambience.update(dt, { season: w.time.season, night: nightFactor(w.time.phase), day: w.time.isDay, rain: r.weather.kind === 'rain' ? r.weather.intensity : 0, frozen: r.frozen > 0.5 });
  }

  private weatherTimer = 30;
  private thunderAt = -1;

  private updateWeather(dt: number): void {
    const w = this.world;
    const wx = this.renderer.weather;
    w.weatherWet = wx.kind === 'rain' && wx.intensity > 0.3;
    // Гроза: в сильный дождь — молния и гром с задержкой.
    if (wx.kind === 'rain' && wx.intensity > 0.6 && Math.random() < dt * 0.06) {
      this.renderer.lightning();
      this.thunderAt = this.time + 0.4 + Math.random() * 1.8;
    }
    if (this.thunderAt > 0 && this.time >= this.thunderAt) {
      this.thunderAt = -1;
      this.audio.play('thunder', 0, 0.9);
    }
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
      // Тучи сгущаются раньше, чем разойдётся дождь: при первых каплях солнца уже не видно.
      overcast: this.renderer.weather.kind === 'rain' ? Math.min(1, this.renderer.weather.intensity * 1.7) : 0,
      snow: t.season === 'winter' ? 1 : 0,
      day: t.day,
    });
  }

  private renderView(camX: number, focus: Monarch | null, hud: boolean): void {
    const w = this.world;
    const r = this.renderer;
    r.camX = camX;
    const lights: Light[] = [];
    w.collectLights(lights);
    r.lights = lights;
    // На паузе и в заставках игровой интерфейс не просвечивает сквозь затемнение.
    const showHud = hud && this.state === 'playing';
    const showLabels = this.state === 'playing' || this.state === 'title';
    r.render(this.atmosphere(), w.time.phase, this.time, {
      sky: (ctx) => this.ambience.drawSky(ctx),
      water: (ctx) => this.ambience.drawWater(ctx),
      world: (ctx) => w.draw(ctx, r),
      emissive: (ctx) => w.drawEmissive(ctx, r),
      hud: (ctx) => {
        if (showLabels) w.drawLabels(ctx, r);
        if (showHud) this.hud.draw(ctx, r, w, this.monarchs, focus);
        if (showHud && this.touchDevice()) this.drawTouchHints(ctx);
        if (showHud) this.plaques.draw(ctx, r.w, r.h, w.time.isDay && w.time.phase > 0.04 && w.time.phase < 0.6);
        if (showHud && this.reroll && focus === this.monarchs[0]) {
          const touch = this.touchDevice();
          const hint = touch ? 'ТАП ПО МОНАРХУ — ДРУГОЙ ПРАВИТЕЛЬ' : 'S ИЛИ ВНИЗ — ДРУГОЙ ПРАВИТЕЛЬ';
          drawText(ctx, hint, Math.floor(r.w / 2), r.h - (touch ? 66 : 12), { align: 'center', color: '#f4ecd8', alpha: 0.85, outline: '#14100c' });
        }
      },
    });
  }

  /** Кооператив: экран делится по горизонтали, у каждого своя камера. */
  private renderCoop(): void {
    const ctx = this.screen.ctx;
    const { w, h } = this.screen;
    const half = Math.floor(h / 2);
    // В каждой половине — полоса кадра с землёй, отражением и частью неба.
    const band = Math.max(0, Math.min(h - half, this.renderer.groundY + 30 - half));
    this.renderView(this.cameras[1].x, this.monarchs[1], true);
    const [tmp, tctx] = this.coopBuffer(w, h);
    tctx.drawImage(this.screen.buffer, 0, band, w, half, 0, 0, w, half);
    this.renderView(this.cameras[0].x, this.monarchs[0], true);
    ctx.drawImage(this.screen.buffer, 0, band, w, half, 0, 0, w, half);
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

  private coarse: boolean | null = null;
  /** Сенсорный экран: было касание или основной указатель — палец. */
  private touchDevice(): boolean {
    if (this.coarse === null) this.coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    return this.input.touchSeen || this.coarse;
  }

  private drawTouchHints(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this.screen;
    // Кнопка паузы: тёмный кружок с белым значком.
    const bx = w - 16;
    const by = 15;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#0c0a10';
    for (let y = -9; y <= 9; y++) {
      const hw = Math.floor(Math.sqrt(90 - y * y));
      ctx.fillRect(bx - hw, by + y, hw * 2 + 1, 1);
    }
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#f4ecd8';
    ctx.fillRect(bx - 3, by - 4, 2, 9);
    ctx.fillRect(bx + 2, by - 4, 2, 9);
    ctx.globalAlpha = 1;
    // Первое утро — подсказка жестов (на телефоне видна сразу, до первого касания).
    if (this.world.time.day === 1 && this.world.time.phase < 0.3) {
      const y0 = h - 50;
      ctx.fillStyle = 'rgba(8,8,16,0.45)';
      ctx.fillRect(0, y0 - 4, w, 26);
      drawText(ctx, 'ТЯНИТЕ ПАЛЬЦЕМ — ИДТИ, К КРАЮ — ГАЛОП', Math.floor(w / 2), y0, { align: 'center', color: '#f4ecd8' });
      drawText(ctx, 'СВАЙП ВНИЗ И ДЕРЖАТЬ — ПЛАТИТЬ', Math.floor(w / 2), y0 + 11, { align: 'center', color: '#f4ecd8' });
    }
  }

  /** Кнопка «Отмена» на экране выбора острова (для касаний). */
  private cancelRect(): { x: number; y: number; w: number; h: number } {
    const { w, h } = this.screen;
    return { x: Math.floor(w / 2) - 34, y: h - 26, w: 68, h: 17 };
  }

  /** Подсказка «нажмите» для клавиатуры или касания. */
  private pressHint(): string {
    return this.touchDevice() ? 'КОСНИТЕСЬ ЭКРАНА' : 'НАЖМИТЕ ENTER';
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
        const logoY = Math.floor(h * 0.07);
        const lh = drawLogo(ctx, cx, logoY, a, this.time);
        const subY = logoY + lh + 3;
        drawText(ctx, 'МОНЕТА ЗА МОНЕТОЙ', cx, subY, { align: 'center', color: '#e8d8b0', alpha: a, outline: '#1a1208' });
        // Меню помещается между подзаголовком и подсказкой внизу при любой высоте экрана.
        const n = this.menu.items.length;
        const minY = subY + 20;
        const maxBottom = h - 22;
        const lineH = clamp(Math.floor((maxBottom - minY) / n), 11, 15);
        const menuY = Math.max(minY, Math.min(Math.floor(h * 0.42), maxBottom - n * lineH));
        this.menu.draw(ctx, cx, menuY, lineH);
        drawText(ctx, this.touchDevice() ? 'КОСНИТЕСЬ ПУНКТА МЕНЮ' : 'СТРЕЛКИ/WASD — ВЫБОР, ENTER — ОК', cx, h - 16, { align: 'center', color: '#e0d4b8', alpha: 0.9, outline: '#14100c' });
        break;
      }
      case 'help': {
        this.dim(ctx, 0.45);
        const lines = this.textLines;
        const tw = Math.max(...lines.map((l) => textWidth(l))) + 28;
        const lh = 11;
        const top = Math.max(6, Math.floor(h / 2 - (lines.length * lh) / 2) - 6);
        drawPanel(ctx, cx - tw / 2, top, tw, lines.length * lh + 12, 0.82);
        lines.forEach((line, i) => drawText(ctx, line === 'НАЖМИТЕ ENTER' ? this.pressHint() : line, cx, top + 7 + i * lh, { align: 'center', color: i === 0 ? '#f2c84a' : i === lines.length - 1 ? '#c8bca0' : '#e8dcc0' }));
        break;
      }
      case 'paused':
        this.dim(ctx, 0.55);
        drawText(ctx, 'ПАУЗА', cx, 8, { align: 'center', scale: 2, color: '#f4ecd8' });
        drawMap(ctx, w, Math.floor(h * 0.6), this.world, this.campaign, this.monarchs.map((m) => m.x));
        this.menu.draw(ctx, cx, Math.floor(h * 0.66), 13, 0.7);
        break;
      case 'choose':
        this.dim(ctx, 0.6);
        drawText(ctx, 'КУДА ПЛЫТЬ?', cx, 14, { align: 'center', scale: 2 });
        drawMap(ctx, w, Math.floor(h * 0.7), this.world, this.campaign, this.monarchs.map((m) => m.x), this.chooseIndex);
        if (this.touchDevice()) {
          drawText(ctx, 'КОСНИТЕСЬ ОСТРОВА, ЕЩЁ РАЗ — ОТПЛЫТЬ', cx, h - 40, { align: 'center', color: '#e0d4b8', outline: '#14100c' });
          const b = this.cancelRect();
          drawPanel(ctx, b.x, b.y, b.w, b.h, 0.75);
          drawText(ctx, 'ОТМЕНА', cx, b.y + 5, { align: 'center', color: '#f4ecd8' });
        } else {
          drawText(ctx, '< > — ВЫБОР, ENTER — ОТПЛЫТЬ, ESC — ОТМЕНА', cx, h - 16, { align: 'center', color: '#e0d4b8', outline: '#14100c' });
        }
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
        drawText(ctx, 'Всё, открытое за самоцветы, и разрушенные порталы сохранятся.', cx, Math.floor(h * 0.36) + 36, { align: 'center', color: '#b8ac90', alpha: a / 0.7 });
        if (this.stateTime > 2) drawText(ctx, this.pressHint(), cx, Math.floor(h * 0.36) + 56, { align: 'center', color: '#f2c84a', outline: '#1a1208' });
        break;
      }
      case 'victory': {
        // Победа — тёплый рассветный свет, а не сумрак: золотое сияние сверху.
        const a = Math.min(1, this.stateTime * 0.5);
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, `rgba(255,214,140,${(0.34 * a).toFixed(3)})`);
        g.addColorStop(0.6, `rgba(255,170,110,${(0.12 * a).toFixed(3)})`);
        g.addColorStop(1, `rgba(20,10,20,${(0.35 * a).toFixed(3)})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        this.plaques.drawSparks(ctx, this.world.time.isDay && this.world.time.phase > 0.04 && this.world.time.phase < 0.6);
        // Праздничная доска с золотой рамкой.
        const pw = Math.min(w - 20, 300);
        const py = Math.floor(h * 0.4);
        const ph = 78;
        const px = Math.round(cx - pw / 2);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#2a1608';
        ctx.fillRect(px - 1, py - 1, pw + 2, ph + 2);
        ctx.fillStyle = '#c89a3a';
        ctx.fillRect(px, py, pw, ph);
        ctx.fillStyle = '#f2d06a';
        ctx.fillRect(px, py, pw, 1);
        ctx.fillRect(px, py, 1, ph);
        ctx.fillStyle = '#4a2c16';
        ctx.fillRect(px + 2, py + 2, pw - 4, ph - 4);
        ctx.fillStyle = '#5c381e';
        for (let y = py + 4; y < py + ph - 3; y += 4) ctx.fillRect(px + 3, y, pw - 6, 1);
        ctx.fillStyle = '#ffe070';
        for (const [x0, y0] of [[px + 3, py + 3], [px + pw - 4, py + 3], [px + 3, py + ph - 4], [px + pw - 4, py + ph - 4]]) ctx.fillRect(x0, y0, 1, 1);
        ctx.globalAlpha = 1;
        drawText(ctx, 'ПОБЕДА', cx, py + 7, { align: 'center', scale: 3, color: '#ffe070', shadow: '#1a0c04', alpha: a });
        drawText(ctx, 'Все пять пещер Жадности разрушены.', cx, py + 36, { align: 'center', color: '#f4ecd8', shadow: '#1a0c04', alpha: a });
        drawText(ctx, `Правлений: ${this.campaign.reign}. Дней последнего правления: ${toRoman(this.world.time.day)}.`, cx, py + 48, { align: 'center', color: '#e8d8b0', shadow: '#1a0c04', alpha: a });
        if (this.stateTime > 3) drawText(ctx, this.pressHint(), cx, py + 63, { align: 'center', color: '#ffe070', shadow: '#1a0c04' });
        break;
      }
      default:
        break;
    }
    void M;
  }
}

const DIFF_NAMES: Record<Difficulty, string> = { peaceful: 'мирная', easy: 'лёгкая', normal: 'обычная', hard: 'трудная', cursed: 'проклятая' };

const ABOUT = [
  'ОБ ИГРЕ',
  'КОРОЛЕВСТВО — ПИКСЕЛЬНАЯ МИКРОСТРАТЕГИЯ',
  'ПО МОТИВАМ KINGDOM TWO CROWNS.',
  'НЕОФИЦИАЛЬНЫЙ ФАНАТСКИЙ ПРОЕКТ, НЕ СВЯЗАН',
  'С RAW FURY И АВТОРАМИ ОРИГИНАЛА.',
  '',
  'ВСЯ ГРАФИКА, ЗВУК И МУЗЫКА СОЗДАНЫ КОДОМ',
  'С НУЛЯ — БЕЗ ФАЙЛОВ ИЗ ОРИГИНАЛЬНОЙ ИГРЫ.',
  'ДЕРЕВЬЯ, ОБЛАКА, ЗАМКИ И ЛЮДИ РИСУЮТСЯ',
  'ПРОЦЕДУРНО ПРИ ЗАПУСКЕ.',
  '',
  'СДЕЛАНО С ПОМОЩЬЮ CLAUDE (ANTHROPIC)',
  'КАК ИССЛЕДОВАНИЕ ВОЗМОЖНОСТЕЙ ИИ.',
  '',
  'НАЖМИТЕ ENTER',
];

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
