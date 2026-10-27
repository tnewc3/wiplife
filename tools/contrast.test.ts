import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** Reads the custom properties of one theme block from tokens.css. */
function tokens(selector: string): Record<string, string> {
  const css = readFileSync(new URL('../src/ui/theme/tokens.css', import.meta.url), 'utf8');
  const start = css.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--wl-([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/g)) out[m[1]!] = m[2]!;
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const BANNERS = ['family', 'love', 'friends', 'people', 'work', 'school', 'money', 'health', 'mind', 'crime', 'fame', 'sports', 'home', 'travel', 'pets', 'wonder', 'grief', 'life'];

describe.each([
  ['dark', ":root,\n:root[data-theme='dark']"],
  ['light', ":root[data-theme='light']"],
])('%s theme meets WCAG AA', (_name, selector) => {
  const t = tokens(selector);
  const pair = (fg: string, bg: string, min: number) => expect(contrast(t[fg]!, t[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);

  it('has readable text on every surface', () => {
    for (const bg of ['bg', 'surface', 'surface-2']) {
      pair('text', bg, 4.5);
      pair('muted', bg, 4.5);
      pair('link', bg, 4.5);
      pair('positive', bg, 4.5);
      pair('negative', bg, 4.5);
      pair('warning', bg, 4.5);
    }
  });

  it('has readable text on the buttons', () => {
    pair('accent-contrast', 'accent', 4.5);
    pair('age-contrast', 'age', 4.5);
    pair('danger-contrast', 'danger', 4.5);
  });

  it('has bars and borders that can be seen', () => {
    pair('bar-fill', 'bar-track', 3);
    pair('positive', 'bar-track', 3);
    pair('negative', 'bar-track', 3);
    pair('warning', 'bar-track', 3);
    pair('border', 'bg', 1.2);
  });

  it('has readable ink on every category banner, and banners that stand out from the card', () => {
    for (const id of BANNERS) {
      expect(t[`cat-${id}`], `cat-${id} is defined`).toBeDefined();
      pair('cat-ink', `cat-${id}`, 4.5);
      pair(`cat-${id}`, 'surface', 3);
    }
  });
});
