import { describe, expect, it } from 'vitest';
import { chance, cloneRng, createRng, isRngState, nextFloat, nextInt, nextUint32, pick, type RngState } from './rng';

/** The published sfc32 reference implementation, used as an oracle. */
function referenceSfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
}

function draw(state: RngState, n: number): number[] {
  return Array.from({ length: n }, () => nextUint32(state));
}

describe('sfc32 generator', () => {
  it('matches the reference sfc32 implementation for raw states', () => {
    const words: [number, number, number, number][] = [
      [0, 0, 0, 1],
      [0x9e3779b9, 0x243f6a88, 0xb7e15162, 42],
      [0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff],
    ];
    for (const [a, b, c, d] of words) {
      const ref = referenceSfc32(a, b, c, d);
      const state: RngState = { a, b, c, d };
      for (let i = 0; i < 1000; i++) expect(nextUint32(state)).toBe(ref());
    }
  });

  it('produces the same sequence for the same seed', () => {
    expect(draw(createRng('wiplife'), 500)).toEqual(draw(createRng('wiplife'), 500));
  });

  it('produces different sequences for different seeds, even similar ones', () => {
    const a = draw(createRng('seed-1'), 20);
    const b = draw(createRng('seed-2'), 20);
    const same = a.filter((x, i) => x === b[i]).length;
    expect(same).toBe(0);
  });

  it('is stable across releases (golden values)', () => {
    // If this fails, every saved life would replay differently. Only change it
    // together with a save migration.
    expect(draw(createRng('golden'), 5)).toMatchInlineSnapshot(`
      [
        2459897739,
        2291529163,
        2283349543,
        3976320428,
        1584326547,
      ]
    `);
    expect(draw(createRng(''), 3)).toMatchInlineSnapshot(`
      [
        2420727049,
        3315390910,
        31621017,
      ]
    `);
  });

  it('resumes identically from a serialized state', () => {
    const uninterrupted = createRng('resume-test');
    const expected = draw(uninterrupted, 2000);

    const first = createRng('resume-test');
    const head = draw(first, 1234);
    const saved = JSON.stringify(first);
    const restored: unknown = JSON.parse(saved);
    expect(isRngState(restored)).toBe(true);
    const tail = draw(restored as RngState, 2000 - 1234);

    expect([...head, ...tail]).toEqual(expected);
  });

  it('keeps state as plain unsigned 32-bit integers', () => {
    const state = createRng('plain');
    for (let i = 0; i < 1000; i++) {
      nextUint32(state);
      expect(isRngState(state)).toBe(true);
    }
    expect(Object.keys(state).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('cloneRng forks an independent copy', () => {
    const original = createRng('fork');
    const copy = cloneRng(original);
    expect(draw(copy, 10)).toEqual(draw(original, 10));
    nextUint32(copy);
    expect(copy).not.toEqual(original);
  });

  it('rejects malformed states', () => {
    expect(isRngState(null)).toBe(false);
    expect(isRngState({ a: 1, b: 2, c: 3 })).toBe(false);
    expect(isRngState({ a: 1, b: 2, c: 3, d: -1 })).toBe(false);
    expect(isRngState({ a: 1, b: 2, c: 3.5, d: 4 })).toBe(false);
    expect(isRngState({ a: 1, b: 2, c: 2 ** 32, d: 4 })).toBe(false);
  });
});

describe('draw helpers', () => {
  it('nextFloat stays in [0, 1) and averages near 0.5', () => {
    const state = createRng('floats');
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const x = nextFloat(state);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / n).toBeGreaterThan(0.48);
    expect(sum / n).toBeLessThan(0.52);
  });

  it('nextInt covers the inclusive range evenly', () => {
    const state = createRng('ints');
    const counts = new Map<number, number>();
    const n = 60000;
    for (let i = 0; i < n; i++) {
      const x = nextInt(state, -2, 3);
      counts.set(x, (counts.get(x) ?? 0) + 1);
    }
    expect([...counts.keys()].sort((p, q) => p - q)).toEqual([-2, -1, 0, 1, 2, 3]);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan((n / 6) * 0.95);
      expect(count).toBeLessThan((n / 6) * 1.05);
    }
  });

  it('nextInt handles single-value ranges and rejects bad ranges', () => {
    const state = createRng('edge');
    expect(nextInt(state, 7, 7)).toBe(7);
    expect(() => nextInt(state, 5, 4)).toThrow(RangeError);
    expect(() => nextInt(state, 0, 1.5)).toThrow(RangeError);
  });

  it('chance respects its bounds', () => {
    const state = createRng('chance');
    for (let i = 0; i < 1000; i++) {
      expect(chance(state, 0)).toBe(false);
      expect(chance(state, 1)).toBe(true);
    }
  });

  it('pick returns an element and rejects empty arrays', () => {
    const state = createRng('pick');
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 100; i++) expect(items).toContain(pick(state, items));
    expect(() => pick(state, [])).toThrow(RangeError);
  });
});
