// Интерфейс в духе оригинала — почти невидимый: кошелёк с монетами
// появляется сверху, когда монеты меняются; над постройками — слоты оплаты;
// на рассвете — номер дня римскими цифрами.

import type { Renderer } from '../render/renderer';
import type { World } from '../game/world';
import type { Monarch } from '../game/entities/monarch';
import { blit } from '../engine/sprite';
import { hudGem, coinSprites, gemSprite, pouchSprites, pouchRimY } from '../art/items';
import { drawText } from '../engine/font';
import { PURSE } from '../game/config';
import { clamp, toRoman } from '../engine/math';

/** Места монет в горке: ряды сужаются кверху, лёгкий разброс, разные кадры
 *  блеска — монеты лежат лицом или чуть повёрнутыми, не ребром. */
const PILE_FRAMES = [0, 0, 1, 5, 0, 2, 5, 4];
const pileCache = new Map<number, Array<[number, number, number]>>();
function pilePositions(n: number): Array<[number, number, number]> {
  let out = pileCache.get(n);
  if (out) return out;
  out = [];
  let row = 0;
  while (out.length < n) {
    const cap = Math.max(3, 11 - row);
    // Ряд заполняется от середины к краям.
    const order = Array.from({ length: cap }, (_, k) => k).sort((a, b) => Math.abs(a - (cap - 1) / 2) - Math.abs(b - (cap - 1) / 2));
    for (const k of order) {
      if (out.length >= n) break;
      const h = Math.sin((out.length + 1) * 12.9898) * 43758.5453;
      const jit = h - Math.floor(h);
      const x = (k - (cap - 1) / 2) * 4 + (row % 2) * 0.5 + (jit - 0.5) * 1.6;
      const y = -row * 2.6 - (jit > 0.75 ? 1 : 0);
      out.push([Math.round(x), Math.round(y), PILE_FRAMES[Math.floor(jit * PILE_FRAMES.length) % PILE_FRAMES.length]]);
    }
    row++;
  }
  pileCache.set(n, out);
  return out;
}

export class Hud {
  private purseAlpha = 0;
  dayBanner = { day: 0, t: 99 };

  showDay(day: number): void {
    this.dayBanner = { day, t: 0 };
  }

  update(dt: number, m: Monarch | null): void {
    this.dayBanner.t += dt;
    const want = m && (m.purseFlash > 0 || (m.input?.dropping ?? false) || m.payTarget) ? 1 : 0;
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
    const bag = pouchSprites();
    const cx = Math.floor(r.w / 2);
    const top = 3;
    ctx.globalAlpha = a;
    blit(ctx, bag.back, cx, top);
    // Монеты насыпаны горкой внутри: нижний ряд уходит за передний край,
    // по бокам горка приподнята — дно у мешка круглое.
    const frames = coinSprites();
    const gem = hudGem();
    const base = top + Math.round(pouchRimY(0)) + 1;
    const lift = (x: number) => Math.round(pouchRimY(x) - pouchRimY(0));
    const pile = pilePositions(PURSE.full);
    const gemSlots = m.gems * PURSE.gemSlots;
    const coins = Math.min(m.coins, Math.max(0, PURSE.full - gemSlots));
    for (let i = 0; i < coins; i++) {
      const [x, y, v] = pile[i];
      blit(ctx, frames[v], cx + x, base + y + lift(x));
    }
    // Самоцветы лежат поверх монет.
    for (let i = 0; i < m.gems; i++) {
      const [x, y] = pile[Math.min(pile.length - 1, coins + i * PURSE.gemSlots + 1)];
      blit(ctx, gem, cx + x, base + y + lift(x) - 1);
    }
    // Переполнение: монеты горкой над горлышком — вот-вот посыплются.
    const over = m.purseSlots - PURSE.full;
    for (let i = 0; i < over; i++) {
      const row = Math.floor(i / 5);
      const jx = ((i * 37) % 5) - 2;
      blit(ctx, frames[PILE_FRAMES[(i * 5) % PILE_FRAMES.length]], cx - 9 + (i % 5) * 4 + (row % 2) * 2 + Math.round(jx * 0.4), base - 12 - row * 3);
    }
    blit(ctx, bag.front, cx, top);
    ctx.globalAlpha = 1;
  }

  private drawDay(ctx: CanvasRenderingContext2D, r: Renderer, blood = false): void {
    const t = this.dayBanner.t;
    const dur = 7;
    if (t > dur || this.dayBanner.day <= 0) return;
    // Римское число дня над королевством (в день Кровавой луны — красное).
    const a = t < 1.2 ? t / 1.2 : t > dur - 2 ? (dur - t) / 2 : 1;
    const text = toRoman(this.dayBanner.day);
    const scale = text.length > 6 ? 2 : 3;
    const y = Math.floor(r.h * 0.23);
    drawText(ctx, 'ДЕНЬ', Math.floor(r.w / 2), y - 11, { align: 'center', color: blood ? '#f0a090' : '#e8dcc0', alpha: a * 0.9, outline: '#1a1410' });
    drawText(ctx, text, Math.floor(r.w / 2), y, { align: 'center', scale, color: blood ? '#e84a36' : '#f4ecd8', alpha: a, outline: '#1a1410' });
  }

  private drawBanners(ctx: CanvasRenderingContext2D, r: Renderer, w: World): void {
    // Ниже цифры дня, даже на низком экране телефона.
    let y = Math.max(Math.floor(r.h * 0.34), Math.floor(r.h * 0.23) + 26);
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
