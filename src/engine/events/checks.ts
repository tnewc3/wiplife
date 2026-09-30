/**
 * Chance checks: a choice rolls against weighted stats. The chance is
 * base + Σ weight × (value − 50) + luck nudge, in percent, clamped to the
 * range in balance/events.yaml (5–95%).
 */
import type { Check, ContentBundle } from '../../content/schemas';
import { HIDDEN_KEYS, STAT_KEYS } from '../../content/schemas';
import type { LifeState } from '../types';

function score(state: LifeState, key: Check['stats'][number]['key']): number {
  const c = state.character;
  if ((STAT_KEYS as readonly string[]).includes(key)) return c.stats[key as keyof typeof c.stats];
  if ((HIDDEN_KEYS as readonly string[]).includes(key)) return c.hidden[key as (typeof HIDDEN_KEYS)[number]];
  return c.personality[key as keyof typeof c.personality];
}

/** Success chance from 0 to 1. */
export function successChance(state: LifeState, check: Check, content: ContentBundle): number {
  const { min, max, luckWeight } = content.balance.events.checks;
  let percent = check.base;
  for (const { key, weight } of check.stats) percent += weight * (score(state, key) - 50);
  percent += luckWeight * (state.character.hidden.luck - 50);
  return Math.min(max, Math.max(min, percent)) / 100;
}
