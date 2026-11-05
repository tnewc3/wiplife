import { describe, expect, it } from 'vitest';
import { freshnessOf } from './freshness';

describe('freshnessOf (U3)', () => {
  it('is all pips when fresh and none at the limit', () => {
    expect(freshnessOf(0, 10)).toMatchObject({ lit: 4, word: 'Fresh' });
    expect(freshnessOf(10, 10)).toMatchObject({ lit: 0, word: 'Worn out' });
  });
  it('follows the diminishing-returns curve: fewer pips with each repeat, and one left while anything is', () => {
    const lit = [0, 1, 2, 3, 6, 9].map((n) => freshnessOf(n, 10, 0.6).lit);
    expect(lit).toEqual([...lit].sort((a, b) => b - a));
    expect(lit[0]).toBe(4);
    expect(lit[1]).toBe(2);
    expect(freshnessOf(9, 10).lit).toBe(1);
  });
});
