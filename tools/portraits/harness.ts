/**
 * A headless browser with the portrait renderer loaded, for tools that need to see portraits (the collared-shirt review
 * sheet, render timing). It bundles src/portraits with esbuild, serves public/portraits and the bundle from a local port,
 * and hands back a function that renders appearance settings to PNG bytes.
 */
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES: Record<string, string> = { '.json': 'application/json', '.png': 'image/png', '.js': 'text/javascript', '.html': 'text/html' };

export interface Harness {
  /** Renders each appearance (portrait settings) at `size` pixels and returns the PNG bytes in order. */
  render(appearances: object[], size: number): Promise<Uint8Array[]>;
  /** Milliseconds per portrait for a full-size render of each appearance, a fresh renderer each time. */
  time(appearance: object, size: number, repeats: number): Promise<number[]>;
  close(): Promise<void>;
}

/** `assets` serves the portrait art from another folder (the pristine package, to draw "before"); the default is public/portraits. */
export async function openHarness(assets?: string): Promise<Harness> {
  const bundle = await build({
    stdin: { contents: "import { loadCatalog, PortraitRenderer } from './src/portraits/index'; (window as any).P = { loadCatalog, PortraitRenderer };", resolveDir: root, loader: 'ts' },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
  });
  const script = bundle.outputFiles[0]!.text;
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void (async () => {
      try {
        if (url.pathname === '/bundle.js') return void res.writeHead(200, { 'content-type': TYPES['.js']! }).end(script);
        if (url.pathname === '/') return void res.writeHead(200, { 'content-type': TYPES['.html']! }).end('<!doctype html><meta charset="utf-8"><body></body>');
        const base = assets && url.pathname.startsWith('/portraits/') ? path.resolve(assets) : path.join(root, 'public');
        const file = assets && url.pathname.startsWith('/portraits/') ? path.join(base, url.pathname.slice('/portraits/'.length)) : path.join(base, url.pathname);
        if (!file.startsWith(base)) throw new Error('outside');
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(body);
      } catch {
        res.writeHead(404).end();
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.addScriptTag({ url: '/bundle.js' });
  await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the bundle puts its API on window
    const P = (window as any).P;
    const catalog = await P.loadCatalog('/portraits/');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the page's own global
    (window as any).renderer = new P.PortraitRenderer(catalog, { assetBaseUrl: '/portraits/' });
  });
  return {
    async render(appearances, size) {
      const urls = await page.evaluate(
        async ({ list, px }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the page's own global
          const r = (window as any).renderer;
          const out: string[] = [];
          for (const a of list) out.push((await r.render(a, { size: px })).canvas.toDataURL('image/png'));
          return out;
        },
        { list: appearances, px: size },
      );
      return urls.map((u) => Uint8Array.from(Buffer.from(u.split(',')[1]!, 'base64')));
    },
    async time(appearance, size, repeats) {
      return page.evaluate(
        async ({ a, px, n }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the page's own global
          const P = (window as any).P;
          const times: number[] = [];
          for (let i = 0; i < n; i++) {
            const catalog = await P.loadCatalog('/portraits/');
            const r = new P.PortraitRenderer(catalog, { assetBaseUrl: '/portraits/' });
            const t0 = performance.now();
            await r.render(a, { size: px });
            times.push(performance.now() - t0);
          }
          return times;
        },
        { a: appearance, px: size, n: repeats },
      );
    },
    async close() {
      await browser.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
