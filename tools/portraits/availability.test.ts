import { describe, expect, it } from 'vitest';
import { buildTables } from './availability';
import { readFileSync } from 'node:fs';

const file = (name: string) => readFileSync(new URL(name.replace('./', '../../src/portraits/'), import.meta.url), 'utf8');

describe('generated portrait option tables', () => {
  it('match the manifest (run `npx tsx tools/portraits/availability.ts` after the art changes)', async () => {
    const { options, availability } = await buildTables();
    expect(file('./options.ts')).toBe(options);
    expect(file('./availability.ts')).toBe(availability);
  });
});
