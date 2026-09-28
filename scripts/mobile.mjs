// Проверка сенсорного управления: экран телефона, жесты пальцем.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

mkdirSync('shots', { recursive: true });
const server = await createServer({ server: { port: 5197, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
await page.goto('http://127.0.0.1:5197/?play=1&nosave=1&coins=10');
await page.waitForFunction(() => window.__ready === true);
await page.waitForTimeout(600);

const touch = (type, id, x, y) =>
  page.evaluate(
    ([type, id, x, y]) => {
      const c = document.getElementById('game');
      c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true }));
    },
    [type, id, x, y],
  );
const state = () => page.evaluate(() => {
  const a = window.__app;
  const m = a.monarchs[0];
  const tc = a.world.all('structure').find((s) => s.type === 'townCenter');
  return { x: Math.round(m.x), coins: m.coins, gallop: m.galloping, tc: tc.level, building: tc.building, fps: a.loop.fps };
});

// 1. Тянем палец вправо (к середине-правой части экрана) — монарх идёт.
await touch('pointerdown', 1, 600, 200);
await touch('pointermove', 1, 620, 200);
await page.waitForTimeout(2500);
console.log('идёт:', JSON.stringify(await state()));
// 2. Палец у правого края — галоп.
await touch('pointermove', 1, 830, 200);
await page.waitForTimeout(3000);
console.log('галоп:', JSON.stringify(await state()));
await touch('pointerup', 1, 830, 200);
await page.waitForTimeout(300);
// Подъедем к костру: он в x=0.
const st = await state();
if (st.x < 0) {
  await touch('pointerdown', 2, 700, 200);
  await touch('pointermove', 2, 710, 200);
  for (let i = 0; i < 40; i++) {
    const s = await state();
    if (s.x > -6) break;
    await page.waitForTimeout(250);
  }
  await touch('pointerup', 2, 710, 200);
}
await page.waitForTimeout(400);
// 3. Свайп вниз и удержание — оплата костра.
await touch('pointerdown', 3, 420, 150);
await touch('pointermove', 3, 420, 175);
await touch('pointermove', 3, 420, 200);
await page.waitForTimeout(1600);
await touch('pointerup', 3, 420, 200);
await page.waitForTimeout(500);
console.log('оплата:', JSON.stringify(await state()));
await page.screenshot({ path: 'shots/mobile.png' });
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
await server.close();
