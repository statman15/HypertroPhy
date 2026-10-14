// "Does the app start?" gate: serves a web build, drives it in headless Chrome, fails on any JS or load error.
// Usage: node smoke.mjs [dir]   (dir defaults to "."; CI could pass www). Chrome: $CHROME_PATH or a standard install.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import puppeteer from 'puppeteer-core';

const root = join(process.cwd(), process.argv[2] || '.');
const types = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.svg': 'image/svg+xml' };
const chrome = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => p && existsSync(p));
if (!chrome) { console.error('FAIL: no Chrome found. Set CHROME_PATH.'); process.exit(1); }

const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = normalize(join(root, path.endsWith('/') ? path + 'index.html' : path));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  let body;
  try { body = await readFile(file); } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }).end(body);
}).listen(0);
await new Promise(r => server.once('listening', r));
const origin = `http://localhost:${server.address().port}`;

const errors = [];
const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
let step = 'launch';
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(5000);
  await page.setRequestInterception(true);
  page.on('request', r => /cdn\.jsdelivr\.net|api\.github\.com/.test(r.url()) ? r.abort() : r.continue());
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`console.error: ${m.text()}`));
  page.on('requestfailed', r => r.url().startsWith(origin) && errors.push(`failed request: ${r.url()}`));
  page.on('response', r => r.url().startsWith(origin) && r.status() >= 400 && !r.url().endsWith('/favicon.ico') && errors.push(`HTTP ${r.status()}: ${r.url()}`));
  await page.evaluateOnNewDocument(() => { window.confirm = () => true; });

  const run = async (name, fn) => { step = name; await fn(); };
  const click = sel => page.waitForSelector(sel, { visible: true }).then(() => page.click(sel));
  const text = (sel, s) => page.waitForFunction((sel, s) => document.querySelector(sel)?.textContent.includes(s), {}, sel, s);

  await run('load app', async () => { await page.goto(origin + '/'); await text('#workout', 'Start Empty Workout'); });

  await run('tabs', async () => {
    for (const tab of ['workout', 'history', 'exercises', 'coach', 'settings']) {
      await click(`[data-go=${tab}]`);
      await page.waitForFunction(t => { const s = document.querySelector(`[data-tab=${t}]`); return !s.hidden && s.textContent.trim(); }, {}, tab);
    }
  });

  await run('exercise detail', async () => {
    await click('[data-go=exercises]');
    await page.type('#q', 'squat');
    await click('#list .row');
    await page.waitForFunction(() => document.querySelector('#sheet').open);
    await page.evaluate(() => document.querySelector('#sheet').close());
  });

  await run('science sheet', async () => {
    await click('[data-go=settings]');
    await click('[data-science]');
    await text('#sheetBody', 'The science behind your AI workouts');
    const n = await page.$$eval('#sheetBody .sources li', l => l.length);
    if (n < 10) throw new Error(`only ${n} sources`);
    await page.evaluate(() => document.querySelector('#sheet').close());
  });

  await run('workout logger', async () => {
    await click('[data-go=workout]');
    await click('[data-act=empty]');
    await click('[data-act=add]');
    await page.waitForSelector('#q', { visible: true });
    await page.$eval('#q', el => { el.value = ''; });
    await page.type('#q', 'barbell squat');
    await click('[data-id="Barbell_Squat"]');
    await page.waitForSelector('input[data-f=w]');
    await page.type('input[data-f=w]', '135');
    await page.type('input[data-f=r]', '5');
    await click('[data-act=check]');
    await page.waitForFunction(() => !document.querySelector('#rest').hidden);
  });

  await run('watch state', async () => {
    const err = await page.evaluate(async () => {
      try {
        const { watchState } = await import('/watch.js'), { watchCtx } = await import('/workout.js');
        return watchState(JSON.parse(localStorage.active), [], 'lb', watchCtx) ? '' : 'watchState returned nothing';
      } catch (e) { return e.stack || String(e); }
    });
    if (err) errors.push(`watchState: ${err}`);
    await click('[data-act=discard]');
    await text('#workout', 'Start Empty Workout');
  });
} catch (e) {
  errors.push(`step "${step}" failed: ${e.message}`);
} finally {
  await browser.close();
  server.close();
}

if (errors.length) { console.error(`FAIL (${errors.length}):\n  ${[...new Set(errors)].join('\n  ')}`); process.exit(1); }
console.log('PASS smoke: app loads, 5 tabs render, exercise sheet, workout logger + rest bar, watch state, no console errors');
