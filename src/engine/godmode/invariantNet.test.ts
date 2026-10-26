/** God mode (G1): the invariants are the safety net behind the rules, and only failures an edit adds are blamed on it. */
import { describe, expect, it, vi } from 'vitest';
import { content } from '../../content';
import type * as Invariants from '../invariants';
import type { LifeState } from '../types';
import { editable } from './fixtures';

// An invariant the rules know nothing about, standing in for one that only the full check sees: it fails any life whose
// looks are exactly 13, and (for the "already broken" case) any life at all while `alwaysBroken` is set.
let alwaysBroken = false;
vi.mock('../invariants', async (original) => {
  const real = await original<typeof Invariants>();
  return {
    ...real,
    checkInvariants: (state: LifeState, c: typeof content) => [
      ...real.checkInvariants(state, c),
      ...(state.character.stats.looks === 13 ? ['looks must not be 13 (test invariant)'] : []),
      ...(alwaysBroken ? ['the life was already broken (test invariant)'] : []),
    ],
  };
});

const { performEdit, checkEdit } = await import('./index');

describe('the invariant net', () => {
  it('refuses an edit that breaks an invariant the rules do not know, with the invariant’s message', () => {
    const life = editable();
    expect(() => performEdit(life, { target: 'self', looks: 13 }, content)).toThrowError(/Edit refused: invariant/);
    try {
      performEdit(life, { target: 'self', looks: 13 }, content);
    } catch (e) {
      expect((e as { refusals: unknown[] }).refusals).toEqual([{ code: 'invariant', area: 'target', facts: { message: 'looks must not be 13 (test invariant)' } }]);
    }
    // checkEdit is rules only: it does not run the invariants.
    expect(checkEdit(life, { target: 'self', looks: 13 }, content)).toEqual({ ok: true });
    expect(life.character.stats.looks).not.toBe(13);
  });

  it('does not blame an edit for a failure the life already had', () => {
    const life = editable();
    alwaysBroken = true;
    try {
      const next = performEdit(life, { target: 'self', looks: 14 }, content);
      expect(next.character.stats.looks).toBe(14);
      // …but it is blamed for one it adds.
      expect(() => performEdit(life, { target: 'self', looks: 13 }, content)).toThrowError(/invariant/);
    } finally {
      alwaysBroken = false;
    }
  });
});
