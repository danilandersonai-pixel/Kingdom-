// Коллаж из нескольких скриншотов (для быстрого визуального обзора).
// node scripts/collage.mjs out.png cols a.png b.png ...
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const [out, colsArg, ...files] = process.argv.slice(2);
const cols = Number(colsArg);
const imgs = files.map((f) => 'data:image/png;base64,' + readFileSync(f).toString('base64'));
const cellW = 720;
const cellH = 405;
const rows = Math.ceil(imgs.length / cols);
const html = `<html><body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:4px">${imgs
  .map((s, i) => `<div style="position:relative"><img src="${s}" style="width:${cellW}px;height:${cellH}px;image-rendering:pixelated;display:block"><span style="position:absolute;left:6px;top:4px;color:#ff0;font:16px monospace;text-shadow:1px 1px #000">${files[i].split('/').pop()}</span></div>`)
  .join('')}</body></html>`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: cols * (cellW + 4), height: rows * (cellH + 4) } });
await page.setContent(html);
await page.waitForTimeout(300);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
