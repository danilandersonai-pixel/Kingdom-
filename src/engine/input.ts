// Ввод: клавиатура, геймпад и касания сводятся к простым действиям
// для каждого игрока. Логика игры видит только эти действия.

import type { Screen } from './screen';

export type Action =
  | 'left'
  | 'right'
  | 'run'
  | 'drop'
  | 'up'
  | 'down'
  | 'pause'
  | 'confirm'
  | 'back';

const ACTIONS: Action[] = ['left', 'right', 'run', 'drop', 'up', 'down', 'pause', 'confirm', 'back'];

export class PlayerInput {
  private held = new Set<Action>();
  private prev = new Set<Action>();
  private pressedNow = new Set<Action>();
  private releasedNow = new Set<Action>();
  /** Направление движения: -1, 0 или 1. */
  axis = 0;
  /** Бег (галоп). */
  running = false;
  /** Удерживается «бросить монету / платить». */
  dropping = false;
  /** Какой источник последним управлял игроком — для подсказок. */
  lastDevice: 'keyboard' | 'gamepad' | 'touch' = 'keyboard';

  isDown(a: Action): boolean {
    return this.held.has(a);
  }
  pressed(a: Action): boolean {
    return this.pressedNow.has(a);
  }
  released(a: Action): boolean {
    return this.releasedNow.has(a);
  }

  /** Вызывается раз в шаг логики с «сырым» состоянием и счётчиками нажатий. */
  commit(raw: Set<Action>, taps: Set<Action>): void {
    this.prev = this.held;
    this.held = new Set(raw);
    this.pressedNow.clear();
    this.releasedNow.clear();
    for (const a of ACTIONS) {
      const now = this.held.has(a);
      const before = this.prev.has(a);
      if ((now && !before) || taps.has(a)) this.pressedNow.add(a);
      if (!now && before) this.releasedNow.add(a);
    }
    const l = this.held.has('left');
    const r = this.held.has('right');
    this.axis = l === r ? 0 : l ? -1 : 1;
    this.dropping = this.held.has('drop');
  }
}

interface KeyBinding {
  code: string;
  action: Action;
  player: 0 | 1 | -1; // -1 — оба игрока в одиночной игре (игрок 0)
}

// Одиночная игра: работают все раскладки. Кооператив: WASD — первый игрок, стрелки — второй.
const KEYS: KeyBinding[] = [
  { code: 'KeyA', action: 'left', player: 0 },
  { code: 'KeyD', action: 'right', player: 0 },
  { code: 'KeyW', action: 'up', player: 0 },
  { code: 'KeyS', action: 'drop', player: 0 },
  { code: 'KeyS', action: 'down', player: 0 },
  { code: 'ShiftLeft', action: 'run', player: 0 },
  { code: 'Space', action: 'drop', player: 0 },
  { code: 'Space', action: 'confirm', player: 0 },
  { code: 'ArrowLeft', action: 'left', player: 1 },
  { code: 'ArrowRight', action: 'right', player: 1 },
  { code: 'ArrowUp', action: 'up', player: 1 },
  { code: 'ArrowDown', action: 'drop', player: 1 },
  { code: 'ArrowDown', action: 'down', player: 1 },
  { code: 'ShiftRight', action: 'run', player: 1 },
  { code: 'ControlRight', action: 'run', player: 1 },
  { code: 'Enter', action: 'confirm', player: -1 },
  { code: 'NumpadEnter', action: 'confirm', player: -1 },
  { code: 'Escape', action: 'pause', player: -1 },
  { code: 'KeyP', action: 'pause', player: -1 },
  { code: 'Escape', action: 'back', player: -1 },
  { code: 'Backspace', action: 'back', player: -1 },
];

const DOUBLE_TAP_MS = 280;

export interface PointerInfo {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
  /** Касание распознано как свайп вниз — держим оплату. */
  dropGesture: boolean;
  /** Свайп вверх — способность скакуна. */
  upGesture: boolean;
  /** Жест только что распознан (для одноразовых действий). */
  gestureNew: boolean;
  /** Касание — «держать для движения». */
  moveDir: number;
  runGesture: boolean;
  consumed: boolean;
}

export interface TapEvent {
  x: number;
  y: number;
}

export class Input {
  readonly players: [PlayerInput, PlayerInput] = [new PlayerInput(), new PlayerInput()];
  coop = false;
  /** Включено ли игровое сенсорное управление (в меню касания — это нажатия кнопок). */
  touchGameplay = false;

  private keysDown = new Set<string>();
  private keyTaps = new Set<string>();
  private lastDirTap: Record<string, number> = {};
  private dirRun: [boolean, boolean] = [false, false];

  readonly pointers = new Map<number, PointerInfo>();
  private tapQueue: TapEvent[] = [];
  /** Нажатия (тапы) за последний шаг — для кнопок меню. */
  taps: TapEvent[] = [];
  /** Было ли хоть одно касание экрана — тогда показываем сенсорные подсказки. */
  touchSeen = false;
  private lastTouchTap = { time: 0, side: 0 };

  private padPrev: boolean[][] = [[], [], [], []];
  /** Колбэк первой пользовательской активности (нужен для запуска звука). */
  onFirstGesture: (() => void) | null = null;

  constructor(private readonly screen: Screen) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.pointers.clear();
    });
    const c = screen.display;
    c.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    c.addEventListener('pointermove', (e) => this.onPointerMove(e));
    c.addEventListener('pointerup', (e) => this.onPointerUp(e));
    c.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS Safari: запрещаем прокрутку и масштабирование жестами.
    document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  private gesture(): void {
    if (this.onFirstGesture) {
      const fn = this.onFirstGesture;
      this.onFirstGesture = null;
      fn();
    }
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const code = e.code;
    const known = KEYS.some((k) => k.code === code);
    if (known) e.preventDefault();
    if (down) {
      this.gesture();
      if (!this.keysDown.has(code)) {
        this.keyTaps.add(code);
        // Двойное нажатие направления = галоп.
        const now = performance.now();
        const binding = KEYS.find((k) => k.code === code && (k.action === 'left' || k.action === 'right'));
        if (binding) {
          const p = binding.player === 1 && this.coop ? 1 : 0;
          const last = this.lastDirTap[code] ?? 0;
          this.dirRun[p] = now - last < DOUBLE_TAP_MS;
          this.lastDirTap[code] = now;
        }
      }
      this.keysDown.add(code);
      this.players[0].lastDevice = 'keyboard';
    } else {
      this.keysDown.delete(code);
    }
  }

  private onPointerDown(e: PointerEvent): void {
    this.gesture();
    if (e.pointerType === 'touch') this.touchSeen = true;
    const v = this.screen.toVirtual(e.clientX, e.clientY);
    const now = performance.now();
    const side = v.x < this.screen.w / 2 ? -1 : 1;
    const info: PointerInfo = {
      id: e.pointerId,
      x: v.x,
      y: v.y,
      startX: v.x,
      startY: v.y,
      startTime: now,
      dropGesture: false,
      upGesture: false,
      gestureNew: false,
      moveDir: side,
      runGesture: now - this.lastTouchTap.time < 330 && this.lastTouchTap.side === side,
      consumed: false,
    };
    this.lastTouchTap = { time: now, side };
    this.pointers.set(e.pointerId, info);
    try {
      this.screen.display.setPointerCapture(e.pointerId);
    } catch {
      /* не критично */
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const v = this.screen.toVirtual(e.clientX, e.clientY);
    p.x = v.x;
    p.y = v.y;
    const dy = p.y - p.startY;
    const dx = p.x - p.startX;
    // Свайп вниз — «бросать монеты», пока палец на экране; вверх — способность.
    const quick = performance.now() - p.startTime < 400;
    if (!p.dropGesture && !p.upGesture && quick && dy > 10 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      p.dropGesture = true;
      p.gestureNew = true;
    }
    if (!p.dropGesture && !p.upGesture && quick && dy < -10 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      p.upGesture = true;
      p.gestureNew = true;
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dt = performance.now() - p.startTime;
    const moved = Math.hypot(p.x - p.startX, p.y - p.startY);
    if (dt < 300 && moved < 8 && !p.dropGesture && !p.upGesture) this.tapQueue.push({ x: p.x, y: p.y });
    this.pointers.delete(e.pointerId);
  }

  /** Отметить касание как использованное интерфейсом (кнопкой меню). */
  consumePointer(id: number): void {
    const p = this.pointers.get(id);
    if (p) p.consumed = true;
  }

  /** Вызывается раз в шаг логики. */
  poll(): void {
    this.taps = this.tapQueue;
    this.tapQueue = [];

    const raw: [Set<Action>, Set<Action>] = [new Set(), new Set()];
    const taps: [Set<Action>, Set<Action>] = [new Set(), new Set()];

    for (const k of KEYS) {
      const target = k.player === -1 ? 0 : this.coop ? k.player : 0;
      if (this.keysDown.has(k.code)) raw[target].add(k.action);
      if (this.keyTaps.has(k.code)) taps[target].add(k.action);
      // Меню и пауза в кооперативе доступны обоим игрокам.
      if (k.player === -1 && this.coop) {
        if (this.keysDown.has(k.code)) raw[1].add(k.action);
        if (this.keyTaps.has(k.code)) taps[1].add(k.action);
      }
    }
    this.keyTaps.clear();

    for (let p = 0; p < 2; p++) {
      if (raw[p].has('left') || raw[p].has('right')) {
        if (this.dirRun[p]) raw[p].add('run');
      } else {
        this.dirRun[p] = false;
      }
    }

    this.pollGamepads(raw, taps);

    if (this.pointers.size) this.players[0].lastDevice = this.touchSeen ? 'touch' : this.players[0].lastDevice;

    this.players[0].commit(raw[0], taps[0]);
    this.players[1].commit(raw[1], taps[1]);
    this.players[0].running = this.players[0].isDown('run');
    this.players[1].running = this.players[1].isDown('run');
  }

  private pollGamepads(raw: [Set<Action>, Set<Action>], taps: [Set<Action>, Set<Action>]): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let slot = 0;
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad || !pad.connected) continue;
      const player = this.coop ? Math.min(slot, 1) : 0;
      slot++;
      const b = (n: number) => !!pad.buttons[n]?.pressed;
      const ax = pad.axes[0] ?? 0;
      const state: Partial<Record<Action, boolean>> = {
        left: ax < -0.35 || b(14),
        right: ax > 0.35 || b(15),
        up: (pad.axes[1] ?? 0) < -0.5 || b(12),
        down: (pad.axes[1] ?? 0) > 0.5 || b(13),
        drop: (pad.axes[1] ?? 0) > 0.5 || b(13) || b(0),
        run: b(1) || b(7) || b(6) || b(5),
        pause: b(9),
        confirm: b(0),
        back: b(1),
      };
      const prev = this.padPrev[i] ?? [];
      const now: boolean[] = [];
      ACTIONS.forEach((a, idx) => {
        const on = !!state[a];
        now[idx] = on;
        if (on) {
          raw[player].add(a);
          this.players[player].lastDevice = 'gamepad';
        }
        if (on && !prev[idx]) taps[player].add(a);
      });
      this.padPrev[i] = now;
    }
  }
}
