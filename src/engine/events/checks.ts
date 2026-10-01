/**
 * Chance checks: a choice rolls against weighted stats. The chance is
 * base + Σ weight × (value − 50) + luck nudge, in percent, clamped to the
 * range in balance/events.yaml (5–95%).
 */
import type { Check, CheckStat, ContentBundle, EffectStatKey } from '../../content/schemas';
import { HIDDEN_KEYS, STAT_KEYS } from '../../content/schemas';
import type { Id, LifeState } from '../types';

/** Your value for a stat, personality trait or readable hidden value. */
export function scoreOf(state: LifeState, key: EffectStatKey): number {
  const c = state.character;
  if ((STAT_KEYS as readonly string[]).includes(key)) return c.stats[key as keyof typeof c.stats];
  if ((HIDDEN_KEYS as readonly string[]).includes(key)) return c.hidden[key as (typeof HIDDEN_KEYS)[number]];
  return c.personality[key as keyof typeof c.personality];
}

/** A check stat's value: your own, or how a cast person feels about you (50 when nobody is cast). */
function statValue(state: LifeState, stat: CheckStat, cast: Record<string, Id>): number {
  if ('role' in stat) {
    const rel = state.relationships[cast[stat.role] ?? ''];
    return rel ? rel[stat.key] : 50;
  }
  return scoreOf(state, stat.key);
}

/** Success chance from 0 to 1. `cast` gives the people a check may read (affection or trust). */
export function successChance(state: LifeState, check: Check, content: ContentBundle, cast: Record<string, Id> = {}): number {
  const { min, max, luckWeight } = content.balance.events.checks;
  let percent = check.base;
  for (const stat of check.stats) percent += stat.weight * (statValue(state, stat, cast) - 50);
  percent += luckWeight * (state.character.hidden.luck - 50);
  return Math.min(max, Math.max(min, percent)) / 100;
}
