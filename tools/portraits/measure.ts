/**
 * `npx vite build && npx tsx tools/portraits/measure.ts`: measures portraits in a real browser against the production build
 * (dist/), served with gzip like the host does. Reports (1) how long the first portrait of a new life takes on a cold start
 * (empty caches) under network throttling, (2) frame times while scrolling a 30-person People list after the first visit,
 * with and without 4x CPU throttling, and (3) how many bytes a first portrait costs.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import compiled from '../../src/content/compiled/content.json' with { type: 'json' };
import type { ContentBundle } from '../../src/content/schemas';
import { makeEnvelope } from '../../src/persistence/envelope';
import { runSimulation } from '../simulate/run';

const content = compiled as unknown as ContentBundle;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = path.join(root, 'dist');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let file = path.join(dist, decodeURIComponent(url.pathname));
    try {
      if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
      let body: Buffer = await readFile(file).catch(() => readFile(path.join(dist, 'index.html')));
      const type = TYPES[path.extname(file)] ?? 'text/html';
      const headers: Record<string, string | number> = { 'content-type': type };
      if (/json|javascript|css|html|svg/.test(type) && req.headers['accept-encoding']?.includes('gzip')) {
        body = gzipSync(body);
        headers['content-encoding'] = 'gzip';
      }
      res.writeHead(200, headers).end(body);
    } catch {
      res.writeHead(404).end();
    }
  })();
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

async function newPage(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp };
}

async function passGate(page: Page) {
  await page.goto(base);
  await page.getByRole('button', { name: 'I’m 18 or older' }).click();
}

const browser = await chromium.launch();
const out: Record<string, unknown> = {};

// 1. Cold start: a new random life, first portrait on Home.
const profiles: Record<string, { latency: number; down: number; up: number }> = {
  'unthrottled': { latency: 0, down: -1, up: -1 },
  '4G (9 Mbps down, 170 ms RTT)': { latency: 170, down: (9 * 1024 * 1024) / 8, up: (3 * 1024 * 1024) / 8 },
  'slow 4G (1.6 Mbps down, 150 ms RTT)': { latency: 150, down: (1.6 * 1024 * 1024) / 8, up: (750 * 1024) / 8 },
};
const cold: Record<string, unknown> = {};
for (const [name, net] of Object.entries(profiles)) {
  const times: number[] = [];
  let bytes = 0;
  let requests = 0;
  for (let run = 0; run < 3; run++) {
    const { context, page, cdp } = await newPage(browser);
    await passGate(page);
    await page.getByRole('button', { name: 'New Life' }).click();
    await page.waitForTimeout(300);
    // The catalog loads while the title screen is up; throttle from here so it is not counted against the first portrait alone.
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: net.latency, downloadThroughput: net.down, uploadThroughput: net.up });
    let got = 0;
    let n = 0;
    cdp.on('Network.loadingFinished', (e: { encodedDataLength: number }) => { got += e.encodedDataLength; n++; });
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Start a random life' }).click();
    await page.locator('[data-testid="character-portrait"] img').first().waitFor({ state: 'visible', timeout: 120_000 });
    times.push(Date.now() - t0);
    bytes = got;
    requests = n;
    await context.close();
  }
  cold[name] = { msRuns: times, medianMs: [...times].sort((a, b) => a - b)[1], bytesTransferred: bytes, requests };
}
out.coldStartFirstPortrait = cold;

// 2. A 30-person People list after the first visit.
let big: ReturnType<typeof JSON.parse> | null = null;
for (let i = 0; i < 40 && !big; i++) {
  runSimulation(content, {
    lives: 1,
    seedPrefix: `measure-${i}`,
    player: 'careful',
    onYear: (life) => {
      if (!big && life.phase !== 'dead' && Object.keys(life.people).length >= 30) big = JSON.parse(JSON.stringify(life));
    },
  });
}
if (big) {
  const peopleCount = Object.keys((big as { people: object }).people).length;
  const envelope = makeEnvelope(big, content.contentVersion);
  const scrolls: Record<string, unknown> = {};
  for (const [label, rate] of [['no CPU throttle', 1], ['4x CPU throttle (a mid-range phone, roughly)', 4]] as const) {
    const { context, page, cdp } = await newPage(browser);
    await passGate(page);
    await page.evaluate(async (env) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('wiplife');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('lives', 'readwrite');
          tx.objectStore('lives').put({ id: 'active', envelope: env });
          tx.oncomplete = () => resolve();
        };
      });
    }, envelope as never);
    await page.reload();
    await page.getByRole('button', { name: 'Continue' }).click();
    const nav = page.getByRole('navigation', { name: 'Game sections' });
    await nav.getByRole('button', { name: 'People', exact: true }).click();
    // First visit: scroll through so every portrait is drawn and stored.
    const scroller = await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY !== 'visible');
      return el ? true : false;
    });
    const scrollAll = async () => page.evaluate(async () => {
      const el = [...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 50 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY)).sort((a, b) => b.scrollHeight - a.scrollHeight)[0] ?? document.scrollingElement!;
      el.scrollTop = 0;
      const frames: number[] = [];
      let last = performance.now();
      const total = el.scrollHeight - el.clientHeight;
      const start = last;
      await new Promise<void>((resolve) => {
        const step = (now: number) => {
          frames.push(now - last);
          last = now;
          const t = Math.min(1, (now - start) / 2500);
          el.scrollTop = total * t;
          if (t < 1) requestAnimationFrame(step); else resolve();
        };
        requestAnimationFrame(step);
      });
      return frames;
    });
    void scroller;
    await scrollAll();
    await page.waitForTimeout(3000);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
    // Second visit: reload so the thumbnails come from IndexedDB, then scroll again and measure.
    await page.reload();
    await page.getByRole('button', { name: 'Continue' }).click();
    await nav.getByRole('button', { name: 'People', exact: true }).click();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await scrollAll(); // warm the in-memory part
    await page.waitForTimeout(1500);
    const frames = await scrollAll();
    const sorted = [...frames].sort((a, b) => a - b);
    scrolls[label] = {
      frames: frames.length,
      medianMs: Math.round(sorted[Math.floor(sorted.length / 2)]! * 10) / 10,
      p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)]! * 10) / 10,
      worstMs: Math.round(sorted.at(-1)! * 10) / 10,
      framesOver33ms: frames.filter((f) => f > 33.4).length,
    };
    await context.close();
  }
  out.peopleList = { people: peopleCount, scrolls };
} else out.peopleList = 'no life with 30 people found';

await browser.close();
server.close();
console.log(JSON.stringify(out, null, 2));
