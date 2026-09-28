// Интерфейс в духе оригинала — почти невидимый: кошелёк с монетами
// появляется сверху, когда монеты меняются; над постройками — слоты оплаты;
// на рассвете — номер дня римскими цифрами.

import type { Renderer } from '../render/renderer';
import type { World } from '../game/world';
import type { Monarch } from '../game/entities/monarch';
import { blit } from '../engine/sprite';
import { hudCoin, hudGem, coinSprites, gemSprite } from '../art/items';
import { drawText } from '../engine/font';
import { PURSE } from '../game/config';
import { clamp, toRoman } from '../engine/math';

export class Hud {
  private purseAlpha = 0;
  dayBanner = { day: 0, t: 99 };

  showDay(day: number): void {
    this.dayBanner = { day, t: 0 };
  }

  update(dt: number, m: Monarch | null): void {
    this.dayBanner.t += dt;
    const want = m && (m.purseFlash > 0 || (m.input?.dropping ?? false) || m.hoverTarget) ? 1 : 0;
    this.purseAlpha = clamp(this.purseAlpha + (want ? dt * 5 : -dt * 1.5), 0, 1);
  }

  draw(ctx: CanvasRenderingContext2D, r: Renderer, w: World, monarchs: Monarch[], focus: Monarch | null): void {
    for (const m of monarchs) this.drawSlots(ctx, r, m);
    if (focus) this.drawPurse(ctx, r, focus);
    this.drawDay(ctx, r, w.time.isBloodMoon);
    this.drawBanners(ctx, r, w);
  }

  private drawSlots(ctx: CanvasRenderingContext2D, r: Renderer, m: Monarch): void {
    const t = m.hoverTarget ?? m.payTarget;
    if (!t) return;
    const price = t.price(m);
    if (price <= 0) return;
    const perRow = 8;
    const rows = Math.ceil(price / perRow);
    const gem = t.currency() === 'gem';
    const sx = r.sx(t.x);
    const baseY = r.sy(t.slotY());
    const paying = m.payTarget === t;
    for (let i = 0; i < price; i++) {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, price - row * perRow);
      const col = i % perRow;
      const x = sx - Math.floor((inRow * 7) / 2) + col * 7 + 3;
      const y = baseY - (rows - 1 - row) * 7;
      const filled = i < t.paid;
      if (filled) {
        blit(ctx, gem ? gemSprite() : coinSprites()[0], x, y + 2);
      } else {
        // Пустой слот — кружок-контур.
        ctx.globalAlpha = paying ? 0.95 : 0.7;
        ctx.fillStyle = gem ? '#8ee8f4' : '#f2e2a8';
        ctx.fillRect(x - 1, y - 3, 3, 1);
        ctx.fillRect(x - 1, y + 1, 3, 1);
        ctx.fillRect(x - 2, y - 2, 1, 3);
        ctx.fillRect(x + 2, y - 2, 1, 3);
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawPurse(ctx: CanvasRenderingContext2D, r: Renderer, m: Monarch): void {
    if (this.purseAlpha <= 0.01) return;
    const a = this.purseAlpha;
    const cap = PURSE.full;
    const perRow = 10;
    const rows = Math.ceil(cap / perRow);
    const cw = 8;
    const panelW = perRow * cw + 10;
    const panelH = rows * 6 + 12 + 9;
    const x0 = Math.floor(r.w / 2 - panelW / 2);
    const y0 = 6;
    ctx.globalAlpha = a * 0.55;
    ctx.fillStyle = '#1a120c';
    ctx.fillRect(x0, y0, panelW, panelH);
    ctx.globalAlpha = a * 0.8;
    ctx.fillStyle = '#6a4a2a';
    ctx.fillRect(x0, y0, panelW, 1);
    ctx.fillRect(x0, y0 + panelH - 1, panelW, 1);
    ctx.fillRect(x0, y0, 1, panelH);
    ctx.fillRect(x0 + panelW - 1, y0, 1, panelH);
    ctx.globalAlpha = a;
    const coin = hudCoin();
    // Самоцветы занимают по 3 места в начале кошелька, дальше монеты.
    const gemSlots = m.gems * PURSE.gemSlots;
    for (let i = 0; i < cap; i++) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const x = x0 + 9 + col * cw;
      const y = y0 + 12 + row * 6;
      if (i < gemSlots) {
        if (i % PURSE.gemSlots === 1) blit(ctx, hudGem(), x, y + 1);
      } else if (i < gemSlots + m.coins) blit(ctx, coin, x, y);
      else {
        ctx.globalAlpha = a * 0.25;
        ctx.fillStyle = '#c8a860';
        ctx.fillRect(x - 1, y - 4, 3, 3);
        ctx.globalAlpha = a;
      }
    }
    // Переполнение: монеты горкой сверху.
    const over = m.purseSlots - PURSE.full;
    if (over > 0) {
      for (let i = 0; i < over; i++) blit(ctx, coin, x0 + panelW / 2 - over * 4 + i * 8, y0 + 5);
    }
    ctx.globalAlpha = 1;
  }

  private drawDay(ctx: CanvasRenderingContext2D, r: Renderer, blood = false): void {
    const t = this.dayBanner.t;
    const dur = 7;
    if (t > dur || this.dayBanner.day <= 0) return;
    // Крупное тёмное римское число высоко в небе (в день Кровавой луны — красноватое).
    const a = t < 1.2 ? t / 1.2 : t > dur - 2 ? (dur - t) / 2 : 1;
    const text = toRoman(this.dayBanner.day);
    const scale = text.length > 5 ? 3 : 4;
    drawText(ctx, text, Math.floor(r.w / 2), Math.floor(r.h * 0.1), { align: 'center', scale, color: blood ? '#5a0e10' : '#16120e', alpha: a * 0.85, shadow: null });
  }

  private drawBanners(ctx: CanvasRenderingContext2D, r: Renderer, w: World): void {
    let y = Math.floor(r.h * 0.3);
    for (const b of w.banners) {
      const t = b.time;
      const a = t < 0.6 ? t / 0.6 : t > b.duration - 1 ? Math.max(0, b.duration - t) : 1;
      drawText(ctx, b.text, Math.floor(r.w / 2), y, { align: 'center', scale: 2, color: '#f4ecd8', alpha: a });
      y += 18;
      if (b.sub) {
        drawText(ctx, b.sub, Math.floor(r.w / 2), y, { align: 'center', scale: 1, color: '#d8ccb0', alpha: a });
        y += 12;
      }
    }
  }
}
