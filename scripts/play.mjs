// Сценарий игры в headless Chromium: нажатия клавиш, скриншоты, состояние.
// Использование: node scripts/play.mjs <сценарий.json> или встроенный сценарий по имени.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync, readFileSync } from 'node:fs';

const arg = process.argv[2] || 'basic';
const query = process.argv[3] || '';
const width = Number(process.env.W || 1440);
const height = Number(process.env.H || 810);

const SCENARIOS = {
  basic: [
    ['shot', 'start'],
    ['hold', 'KeyD', 2600],
    ['shot', 'arrive'],
    ['hold', 'KeyS', 1400],
    ['wait', 800],
    ['shot', 'paid'],
    ['wait', 11000],
    ['shot', 'built'],
    ['state'],
  ],
};

let steps;
try {
  steps = JSON.parse(readFileSync(arg, 'utf8'));
} catch {
  steps = SCENARIOS[arg];
}
if (!steps) throw new Error('unknown scenario ' + arg);

mkdirSync('shots', { recursive: true });
const server = await createServer({ server: { port: 5198, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text());
  if (m.type() === 'log') console.log('[page]', m.text());
});
await page.goto(`http://127.0.0.1:5198/?${query}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
await page.waitForTimeout(500);
const prefix = process.env.PREFIX || arg.split('/').pop().replace(/\.json$/, '').replace(/[^a-z0-9]/gi, '');
for (const s of steps) {
  const [op, a, b] = s;
  if (op === 'shot') {
    await page.screenshot({ path: `shots/${prefix}-${a}.png` });
    console.log('shot', a);
  } else if (op === 'hold') {
    await page.keyboard.down(a);
    await page.waitForTimeout(b);
    await page.keyboard.up(a);
  } else if (op === 'combo') {
    for (const k of a) await page.keyboard.down(k);
    await page.waitForTimeout(b);
    for (const k of a.slice().reverse()) await page.keyboard.up(k);
  } else if (op === 'press') {
    await page.keyboard.press(a);
  } else if (op === 'wait') {
    await page.waitForTimeout(a);
  } else if (op === 'eval') {
    const r = await page.evaluate(a);
    console.log('eval:', JSON.stringify(r));
  } else if (op === 'state') {
    const st = await page.evaluate(() => {
      const app = window.__app;
      const w = app.world;
      const m = app.monarchs[0];
      const count = (tag) => w.all(tag).length;
      const people = {};
      for (const p of w.all('person')) people[p.role] = (people[p.role] || 0) + 1;
      const structs = {};
      for (const s of w.all('structure')) structs[s.type] = (structs[s.type] || 0) + 1;
      const tc = w.all('structure').find((s) => s.type === 'townCenter');
      return { day: w.time.day, phase: +w.time.phase.toFixed(3), monarch: { x: Math.round(m.x), coins: m.coins, gems: m.gems, crown: m.hasCrown, stamina: +m.stamina.toFixed(2) }, tc: tc && { level: tc.level, building: tc.building }, people, structs, coins: count('coin'), greed: count('greed'), animals: count('animal'), jobs: w.jobs.jobs.length };
    });
    console.log('state:', JSON.stringify(st));
  }
}
if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 20).join('\n'));
await browser.close();
await server.close();
