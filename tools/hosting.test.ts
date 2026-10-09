import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** The rules of public/_headers (the Cloudflare Pages format): a path line, then indented headers. */
function rules(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of readFileSync(path.resolve('public/_headers'), 'utf8').split('\n')) {
    if (line.trim() === '' || line.startsWith('#')) continue;
    if (/^\s/.test(line)) {
      if (current === null) throw new Error(`header before any path: ${line}`);
      out.get(current)!.push(line.trim());
    } else {
      current = line.trim();
      out.set(current, []);
    }
  }
  return out;
}

describe('hosting (Cloudflare Pages)', () => {
  it('never caches the service worker, its helper, the page shell or the manifest, so an update is always found', () => {
    const r = rules();
    for (const file of ['/sw.js', '/workbox-*.js', '/index.html', '/manifest.webmanifest']) {
      expect(r.get(file), file).toEqual(['Cache-Control: no-cache']);
    }
  });

  it('caches hashed assets for good, and caches nothing else on a long lifetime', () => {
    const r = rules();
    expect(r.get('/assets/*')).toEqual(['Cache-Control: public, max-age=31536000, immutable']);
    for (const [file, headers] of r) if (file !== '/assets/*') expect(headers.join(), file).not.toMatch(/max-age=[1-9]/);
  });

  it('uses one Node version for Cloudflare and for CI', () => {
    const read = (f: string) => readFileSync(path.resolve(f), 'utf8').trim();
    expect(read('.node-version')).toBe('24');
    expect(read('.node-version')).toBe(read('.nvmrc'));
  });

  it('has no Netlify configuration or CI steps left', () => {
    for (const f of ['netlify.toml', '.github/workflows/ci.yml', '.github/workflows/nightly.yml']) {
      let text: string;
      try {
        text = readFileSync(path.resolve(f), 'utf8');
      } catch {
        continue;
      }
      expect(text.toLowerCase(), f).not.toContain('netlify');
    }
  });
});
