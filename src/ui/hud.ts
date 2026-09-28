// Интерфейс в духе оригинала — почти невидимый: кошелёк с монетами
// появляется сверху, когда монеты меняются; над постройками — слоты оплаты;
// на рассвете — номер дня римскими цифрами.

import type { Renderer } from '../render/renderer';
import type { World } from '../game/world';
import type { Monarch } from '../game/entities/monarch';
import { blit } from '../engine/sprite';
import { hudGem, coinSprites, gemSprite, pouchSprites, pouchRimY, pileCoinSprites } from '../art/items';
import { drawText, textWidth } from '../engine/font';
import { PURSE } from '../game/config';
import { clamp, toRoman } from '../engine/math';

/** Места монет в горке: ряды сужаются кверху, лёгкий разброс, разные блики.
 *  Монеты лежат плашмя — ряды плотные, горка невысокая. */
const pileCache = new Map<number, Array<[number, number, number]>>();
function pilePositions(n: number): Array<[number, number, number]> {
  let out = pileCache.get(n);
  if (out) return out;
  out = [];
  let row = 0;
  while (out.length < n) {
    const cap = Math.max(3, 10 - row);
    // Ряд заполняется от середины к краям.
    const order = Array.from({ length: cap }, (_, k) => k).sort((a, b) => Math.abs(a - (cap - 1) / 2) - Math.abs(b - (cap - 1) / 2));
    for (const k of order) {
      if (out.length >= n) break;
      const h = Math.sin((out.length + 1) * 12.9898) * 43758.5453;
      const jit = h - Math.floor(h);
      const x = (k - (cap - 1) / 2) * 4 + (row % 2) * 0.5 + (jit - 0.5) * 1.4;
      const y = -row * 2 - (jit > 0.8 ? 1 : 0);
      out.push([Math.round(x), Math.round(y), Math.floor(jit * 3) % 3]);
    }
    row++;
  }
  pileCache.set(n, out);
  return out;
}

/** Сколько секунд висит число дня. */
const DAY_BANNER = 7;

export class Hud {
  private purseAlpha = 0;
  dayBanner = { day: 0, t: 99 };

  showDay(day: number): void {
    this.dayBanner = { day, t: 0 };
  }

  /** Пока висит памятная табличка, число дня ждёт своей очереди (или гаснет). */
  yieldTo(plaque: boolean): void {
    if (!plaque) return;
    const t = this.dayBanner.t;
    if (t < 1.2) this.dayBanner.t = 0;
    else if (t < DAY_BANNER - 1) this.dayBanner.t = DAY_BANNER - 1;
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
    // Не ниже макушки всадника с короной — слоты не налезают на монарха.
    const baseY = r.sy(Math.max(t.slotY(), 38));
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
        // Пустой слот — кружок-контур с тёмной каймой: виден и на светлом небе, и в листве.
        const ring = (dx: number, dy: number) => {
          ctx.fillRect(x - 1 + dx, y - 3 + dy, 3, 1);
          ctx.fillRect(x - 1 + dx, y + 1 + dy, 3, 1);
          ctx.fillRect(x - 2 + dx, y - 2 + dy, 1, 3);
          ctx.fillRect(x + 2 + dx, y - 2 + dy, 1, 3);
        };
        ctx.globalAlpha = paying ? 0.7 : 0.5;
        ctx.fillStyle = '#1a1208';
        ring(0, 1);
        ring(1, 0);
        ctx.fillRect(x - 1, y - 2, 3, 3);
        ctx.globalAlpha = paying ? 1 : 0.85;
        ctx.fillStyle = gem ? '#8ee8f4' : '#f2e2a8';
        ring(0, 0);
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawPurse(ctx: CanvasRenderingContext2D, r: Renderer, m: Monarch): void {
    if (this.purseAlpha <= 0.01) return;
    const a = this.purseAlpha;
    const bag = pouchSprites();
    const cx = Math.floor(r.w / 2);
    // Кошелёк выезжает сверху и уезжает обратно целиком, не тая: нижняя треть
    // хода уходит на то, чтобы он скрылся за краем, — бледной «шапки» у края нет.
    const p = Math.max(0, (a - 0.3) / 0.7);
    if (p <= 0) return;
    const ease = 1 - Math.pow(1 - p, 3);
    const top = 3 - Math.round((1 - ease) * (bag.back.h + 8));
    blit(ctx, bag.back, cx, top);
    // Монеты насыпаны горкой внутри: нижний ряд уходит за передний край,
    // по бокам горка приподнята — дно у мешка круглое.
    const frames = pileCoinSprites();
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
      blit(ctx, frames[i % frames.length], cx - 9 + (i % 5) * 4 + (row % 2) * 2 + Math.round(jx * 0.4), base - 10 - row * 2);
    }
    blit(ctx, bag.front, cx, top);
  }

  private drawDay(ctx: CanvasRenderingContext2D, r: Renderer, blood = false): void {
    const t = this.dayBanner.t;
    const dur = DAY_BANNER;
    if (t > dur || this.dayBanner.day <= 0) return;
    // Римское число дня над королевством (в день Кровавой луны — красное).
    const a = t < 1.2 ? t / 1.2 : t > dur - 2 ? (dur - t) / 2 : 1;
    const text = toRoman(this.dayBanner.day);
    const scale = text.length > 6 ? 2 : 3;
    const y = Math.floor(r.h * 0.23);
    drawText(ctx, 'ДЕНЬ', Math.floor(r.w / 2), y - 11, { align: 'center', color: blood ? '#f0a090' : '#e8dcc0', alpha: a * 0.9, outline: '#1a1410' });
    // Римские цифры — с разрядкой, чтобы засечки соседних I не сливались в решётку.
    const gap = scale;
    const widths = [...text].map((ch) => textWidth(ch, scale));
    let x = Math.floor(r.w / 2 - (widths.reduce((s2, v) => s2 + v, 0) + (scale + gap) * (text.length - 1)) / 2);
    [...text].forEach((ch, i) => {
      drawText(ctx, ch, x, y, { scale, color: blood ? '#e84a36' : '#f4ecd8', alpha: a, outline: '#1a1410' });
      x += widths[i] + scale + gap;
    });
  }

  private drawBanners(ctx: CanvasRenderingContext2D, r: Renderer, w: World): void {
    // Ниже цифры дня, даже на низком экране телефона.
    let y = Math.max(Math.floor(r.h * 0.34), Math.floor(r.h * 0.23) + 26);
    for (const b of w.banners) {
      const t = b.time;
      const a = t < 0.6 ? t / 0.6 : t > b.duration - 1 ? Math.max(0, b.duration - t) : 1;
      drawText(ctx, b.text, Math.floor(r.w / 2), y, { align: 'center', scale: 2, color: '#f4ecd8', alpha: a, outline: '#1a1410' });
      y += 18;
      if (b.sub) {
        drawText(ctx, b.sub, Math.floor(r.w / 2), y, { align: 'center', scale: 1, color: '#e0d4b8', alpha: a, outline: '#1a1410' });
        y += 12;
      }
    }
  }
}
