// Экран: игра рисуется в маленький буфер низкого разрешения
// (около 270 пикселей в высоту), который затем растягивается
// на весь экран целым коэффициентом — так пиксели остаются чёткими.

export const TARGET_H = 270;

export class Screen {
  readonly display: HTMLCanvasElement;
  readonly buffer: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private readonly dctx: CanvasRenderingContext2D;

  w = 480;
  h = 270;
  /** Целый масштаб: сколько физических пикселей в одном игровом. */
  scale = 4;
  dpr = 1;
  /** Смещение картинки на дисплее (в физических пикселях) — для портретной ориентации. */
  offX = 0;
  offY = 0;
  portrait = false;
  private listeners: Array<() => void> = [];

  constructor(display: HTMLCanvasElement) {
    this.display = display;
    const dctx = display.getContext('2d', { alpha: false });
    if (!dctx) throw new Error('Canvas 2D недоступен');
    this.dctx = dctx;
    this.buffer = document.createElement('canvas');
    const ctx = this.buffer.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D недоступен');
    this.ctx = ctx;
    this.resize();
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
    window.visualViewport?.addEventListener('resize', onResize);
  }

  onResize(fn: () => void): void {
    this.listeners.push(fn);
  }

  /** Положение холста на странице (CSS-пиксели) — для касаний. */
  rectLeft = 0;
  rectTop = 0;

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    // Размер берём у самого холста: страница может иметь отступы безопасных зон.
    const rect = this.display.getBoundingClientRect();
    const cssW = Math.max(1, rect.width || window.innerWidth);
    const cssH = Math.max(1, rect.height || window.innerHeight);
    this.rectLeft = rect.left;
    this.rectTop = rect.top;
    const physW = Math.round(cssW * dpr);
    const physH = Math.round(cssH * dpr);
    this.dpr = dpr;
    this.portrait = physH > physW * 1.05;

    let k: number;
    let w: number;
    let h: number;
    if (!this.portrait) {
      k = Math.max(1, Math.round(physH / TARGET_H));
      h = Math.ceil(physH / k);
      w = Math.ceil(physW / k);
      // На очень широких экранах немного увеличиваем пиксели.
      while (w > 820 && k < 64) {
        k++;
        h = Math.ceil(physH / k);
        w = Math.ceil(physW / k);
      }
      this.offX = 0;
      this.offY = 0;
    } else {
      // В портретной ориентации показываем горизонтальную полосу по центру.
      k = Math.max(1, Math.round(physW / 400));
      w = Math.ceil(physW / k);
      h = Math.round(w * 0.62);
      this.offX = 0;
      this.offY = Math.max(0, Math.floor((physH - h * k) / 2));
    }

    this.scale = k;
    this.w = w;
    this.h = h;
    this.display.width = physW;
    this.display.height = physH;
    this.buffer.width = w;
    this.buffer.height = h;
    this.ctx.imageSmoothingEnabled = false;
    this.dctx.imageSmoothingEnabled = false;
    for (const fn of this.listeners) fn();
  }

  present(): void {
    const d = this.dctx;
    if (this.portrait) {
      d.fillStyle = '#05060b';
      d.fillRect(0, 0, this.display.width, this.display.height);
    }
    d.imageSmoothingEnabled = false;
    d.drawImage(this.buffer, this.offX, this.offY, this.w * this.scale, this.h * this.scale);
    if (this.portrait) {
      // Подсказка: игра рассчитана на горизонтальный экран.
      const size = Math.round(14 * this.dpr);
      d.font = `${size}px system-ui, sans-serif`;
      d.textAlign = 'center';
      d.fillStyle = '#e8dcc0';
      const y = this.offY + this.h * this.scale + size * 2.2;
      d.fillText('Поверните телефон горизонтально', this.display.width / 2, Math.min(this.display.height - size, y));
    }
  }

  /** Перевод координат указателя (CSS-пиксели) в игровые пиксели. */
  toVirtual(clientX: number, clientY: number): { x: number; y: number } {
    return {
      x: ((clientX - this.rectLeft) * this.dpr - this.offX) / this.scale,
      y: ((clientY - this.rectTop) * this.dpr - this.offY) / this.scale,
    };
  }

  get displayContext(): CanvasRenderingContext2D {
    return this.dctx;
  }
}
