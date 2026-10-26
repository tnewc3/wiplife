import { describe, expect, it } from 'vitest';
import compiled from '../../src/content/compiled/content.json';
import type { ContentBundle } from '../../src/content/schemas';
import { fuzz } from './fuzz';

describe('the edit fuzz', () => {
  it('finds nothing wrong in a few lives, and does try valid and invalid edits', () => {
    const report = fuzz(compiled as ContentBundle, { lives: 4, seedPrefix: 'unit-fuzz', maxAge: 30, edits: 30 });
    expect(report.problems).toEqual([]);
    expect(report.lives).toBeGreaterThan(0);
    expect(report.accepted).toBeGreaterThan(0);
    expect(report.refused).toBeGreaterThan(0);
  }, 180_000);
});
