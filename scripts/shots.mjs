// Скриншоты игры в headless Chromium для визуальной проверки.
// Использование: node scripts/shots.mjs "name1=?query1" "name2=?query2" ...
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const width = Number(process.env.W || 1440);
const height = Number(process.env.H || 810);
const wait = Number(process.env.WAIT || 1500);

mkdirSync('shots', { recursive: true });
const server = await createServer({ server: { port: 5199, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
for (const a of args.length ? args : ['default=?']) {
  const [name, query] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, '?'];
  await page.goto(`http://127.0.0.1:5199/${query}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `shots/${name}.png` });
  console.log('saved', name);
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
await server.close();
