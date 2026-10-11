/**
 * Values (W2): a small set of things a character cares about (community,
 * compassion, tradition, independence, civic duty), 0 to 100. They start from
 * temperament and faith, drift with the groups you belong to and what you
 * choose, and settle back toward your temperament when nothing holds them
 * there. Events and people's reactions read them (the `value` condition).
 * Numbers: balance/belonging.yaml (values).
 */
import { VALUE_IDS, type ContentBundle, type ValueId } from '../../content/schemas';
import { clampInt, wholeChange } from '../random';
import type { LifeState, Personality } from '../types';
import { instanceOf } from './query';

export type ValueSet = Record<ValueId, number>;

/** Where your values start: your temperament, and a faith's pull. */
export function startValues(personality: Personality, faith: { id: string | null; strength: number }, content: ContentBundle): { values: ValueSet; temperament: ValueSet } {
  const b = content.balance.belonging.values;
  const values = {} as ValueSet;
  const temperament = {} as ValueSet;
  for (const key of VALUE_IDS) {
    let level = b.base[key];
    for (const [trait, weight] of Object.entries(b.weights[key] ?? {})) level += weight * ((personality[trait as keyof Personality] ?? 50) - 50);
    temperament[key] = clampInt(Math.round(level), 5, 95);
    const pull = faith.id === null ? 0 : b.faithPull[key] * (faith.strength - 40);
    values[key] = clampInt(Math.round(level + pull), 5, 95);
  }
  return { values, temperament };
}

/** A value moves; a share of the move sticks to your temperament, so a choice leaves something lasting. */
export function nudgeValue(state: LifeState, key: ValueId, delta: number, content: ContentBundle): void {
  const b = state.belonging;
  b.values[key] = clampInt(b.values[key] + delta, 0, 100);
  b.temperament[key] = clampInt(b.temperament[key] + Math.round(delta * content.balance.belonging.values.sticks), 0, 100);
}

/** One year: each group you belong to nudges what it stands for; values settle back toward your temperament. */
export function driftValues(state: LifeState, content: ContentBundle): void {
  const b = state.belonging;
  const bal = content.balance.belonging.values;
  const push = {} as Record<ValueId, number>;
  for (const key of VALUE_IDS) push[key] = 0;
  for (const m of b.memberships) {
    const g = instanceOf(state, m.groupId);
    const def = g && content.groups[g.defId];
    if (!def) continue;
    const share = m.commitment === 'committed' ? 1 : bal.casualShare;
    for (const key of VALUE_IDS) push[key] += (def.values[key] ?? 0) * share;
  }
  for (const key of VALUE_IDS) {
    const settle = bal.regress * (b.temperament[key] - b.values[key]);
    b.values[key] = clampInt(b.values[key] + wholeChange(state.rng, push[key] + settle), 0, 100);
  }
}
