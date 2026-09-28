// Логотип «КОРОЛЕВСТВО»: золотые буквы полосами оттенков, тёмная обводка,
// тень, корона с самоцветами над названием и пробегающий по буквам блик.

import { makeCanvas } from '../engine/sprite';
import { drawText, textWidth } from '../engine/font';

let cached: HTMLCanvasElement | null = null;
let maskCache: HTMLCanvasElement | null = null;
let shine: [HTMLCanvasElement, CanvasRenderingContext2D] | null = null;

const GOLD = ['#fff6c8', '#ffe070', '#f2c84a', '#dca030', '#b87a22'];

function build(): void {
  const title = 'КОРОЛЕВСТВО';
  const scale = 3;
  const tw = textWidth(title, scale);
  const pad = 4;
  const crownH = 16;
  const W = tw + pad * 2;
  const H = 7 * scale + pad * 2 + crownH;
  // Маска букв.
  const [mask, mctx] = makeCanvas(W, H);
  drawText(mctx, title, pad, pad + crownH, { scale, color: '#ffffff', shadow: null });
  // Золото полосами сверху вниз.
  const top = pad + crownH;
  const hgt = 7 * scale;
  const [bands, bctx] = makeCanvas(W, H);
  GOLD.forEach((c, i) => {
    bctx.fillStyle = c;
    bctx.fillRect(0, top + Math.floor((hgt * i) / GOLD.length), W, Math.ceil(hgt / GOLD.length) + 1);
  });
  const [gold, gctx] = makeCanvas(W, H);
  gctx.drawImage(mask, 0, 0);
  gctx.globalCompositeOperation = 'source-in';
  gctx.drawImage(bands, 0, 0);
  gctx.globalCompositeOperation = 'source-over';
  // Итог: тень, обводка, золото.
  const [out, octx] = makeCanvas(W, H + 2);
  const [dark, dctx] = makeCanvas(W, H);
  dctx.drawImage(mask, 0, 0);
  dctx.globalCompositeOperation = 'source-in';
  dctx.fillStyle = '#2a1608';
  dctx.fillRect(0, 0, W, H);
  octx.globalAlpha = 0.45;
  octx.drawImage(dark, 1, 3);
  octx.globalAlpha = 1;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) octx.drawImage(dark, dx, dy);
  octx.drawImage(gold, 0, 0);
  // Корона над серединой.
  const cx = Math.floor(W / 2);
  const cy = pad - 1;
  const px = (x: number, y: number, c: string) => {
    octx.fillStyle = c;
    octx.fillRect(cx + x, cy + y, 1, 1);
  };
  for (let x = -7; x <= 7; x++) {
    for (let y = 5; y <= 8; y++) px(x, y, y === 5 ? '#fff0a0' : y === 8 ? '#b87a22' : '#f2c84a');
    px(x, 9, '#2a1608');
  }
  for (const [x, h] of [[-7, 3], [-3, 4], [0, 6], [3, 4], [7, 3]] as Array<[number, number]>) {
    for (let y = 5 - h; y < 5; y++) px(x, y, '#f2c84a');
    px(x, 5 - h - 1, '#fff6c8');
    if (x !== 0) {
      px(x + Math.sign(-x), 4, '#f2c84a');
    }
  }
  px(0, -2, '#ffffff');
  px(-4, 6, '#d02a3a');
  px(0, 6, '#3a7ad8');
  px(4, 6, '#2aa85a');
  px(-1, 6, '#d02a3a');
  cached = out;
  maskCache = mask;
}

/** Нарисовать логотип с центром по x, верх — y. */
export function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number, time: number): number {
  if (!cached) build();
  const img = cached!;
  const left = Math.round(x - img.width / 2);
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, left, y);
  // Блик: косая светлая полоса пробегает по буквам раз в несколько секунд.
  const cycle = 5.5;
  const t = (time % cycle) / 1.2;
  if (t < 1 && maskCache) {
    if (!shine) shine = makeCanvas(img.width, img.height);
    const [tmp, tctx] = shine;
    tctx.globalCompositeOperation = 'source-over';
    tctx.clearRect(0, 0, img.width, img.height);
    tctx.drawImage(maskCache, 0, 0);
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = 'rgba(255,255,240,0.85)';
    const sx = -20 + t * (img.width + 40);
    tctx.beginPath();
    tctx.moveTo(sx, 0);
    tctx.lineTo(sx + 5, 0);
    tctx.lineTo(sx - 5, img.height);
    tctx.lineTo(sx - 10, img.height);
    tctx.closePath();
    tctx.fill();
    ctx.drawImage(tmp, left, y);
  }
  ctx.globalAlpha = 1;
  return img.height;
}
