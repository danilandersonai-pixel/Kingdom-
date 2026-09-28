// Простое меню: пункты управляются клавишами (вверх/вниз, Enter) и касаниями.

import { drawText, textWidth } from '../engine/font';
import type { Input } from '../engine/input';
import { drawPanel } from './panel';

export interface MenuItem {
  label: string | (() => string);
  action: () => void;
  /** Стрелки влево/вправо (например, громкость). */
  left?: () => void;
  right?: () => void;
  disabled?: () => boolean;
}

export class Menu {
  index = 0;
  items: MenuItem[];
  private rects: Array<{ x: number; y: number; w: number; h: number }> = [];

  constructor(items: MenuItem[]) {
    this.items = items;
  }

  label(i: number): string {
    const l = this.items[i].label;
    return typeof l === 'function' ? l() : l;
  }

  update(input: Input): void {
    const p0 = input.players[0];
    const p1 = input.players[1];
    const pressed = (a: 'up' | 'down' | 'left' | 'right' | 'confirm' | 'drop') => p0.pressed(a) || p1.pressed(a);
    const move = (d: number) => {
      for (let k = 0; k < this.items.length; k++) {
        this.index = (this.index + d + this.items.length) % this.items.length;
        if (!this.items[this.index].disabled?.()) break;
      }
    };
    if (pressed('up')) move(-1);
    if (pressed('down')) move(1);
    const it = this.items[this.index];
    if (pressed('left')) it.left?.();
    if (pressed('right')) it.right?.();
    if (pressed('confirm') && !it.disabled?.()) it.action();
    for (const tap of input.taps) {
      this.rects.forEach((r, i) => {
        if (tap.x >= r.x && tap.x <= r.x + r.w && tap.y >= r.y && tap.y <= r.y + r.h) {
          const item = this.items[i];
          if (item.disabled?.()) return;
          this.index = i;
          // Тап по левой/правой части пункта с настройкой меняет значение.
          if (item.left && tap.x < r.x + r.w * 0.25) item.left();
          else if (item.right && tap.x > r.x + r.w * 0.75) item.right();
          else item.action();
        }
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D, cx: number, y0: number, lineH = 16, panelAlpha = 0.62): void {
    this.rects = [];
    // Все пункты одной ширины — по самому длинному; под ними доска.
    const labels = this.items.map((_, i) => this.label(i));
    const w = Math.max(130, ...labels.map((t) => textWidth(t) + 30));
    const left = Math.round(cx - w / 2);
    if (panelAlpha > 0) drawPanel(ctx, left - 6, y0 - 9, w + 12, this.items.length * lineH + 11, panelAlpha);
    this.items.forEach((it, i) => {
      const text = labels[i];
      const sel = i === this.index;
      const dis = it.disabled?.() ?? false;
      const y = y0 + i * lineH;
      this.rects.push({ x: left, y: y - 4, w, h: lineH });
      if (sel) {
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#f2c84a';
        ctx.fillRect(left, y - 3, w, lineH - 3);
        ctx.globalAlpha = 1;
        drawText(ctx, '>', left + 4, y, { color: '#f2c84a' });
        drawText(ctx, '<', left + w - 8, y, { color: '#f2c84a' });
      }
      // Недоступный пункт — приглушён, но читается.
      drawText(ctx, text, cx, y, { align: 'center', color: dis ? '#8a8272' : sel ? '#fff4d8' : '#e0d4b8', shadow: dis ? null : undefined });
    });
  }
}
