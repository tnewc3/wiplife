/**
 * Chance checks: a choice rolls against weighted stats. The chance is
 * base + Σ weight × (value − 50) + luck nudge, in percent, clamped to the
 * range in balance/events.yaml (5–95%).
 */
import type { Check, CheckStat, ContentBundle, EffectStatKey } from '../../content/schemas';
import { HIDDEN_KEYS, STAT_KEYS } from '../../content/schemas';
import { custodyCase } from '../family/custody';
import { tryChance } from '../family/carrying';
import { runStrength } from '../sports/playoffs';
import { fitFor } from '../sports/query';
import type { Id, LifeState } from '../types';

/** Your value for a stat, personality trait or readable hidden value. */
export function scoreOf(state: LifeState, key: EffectStatKey): number {
  const c = state.character;
  if ((STAT_KEYS as readonly string[]).includes(key)) return c.stats[key as keyof typeof c.stats];
  if ((HIDDEN_KEYS as readonly string[]).includes(key)) return c.hidden[key as (typeof HIDDEN_KEYS)[number]];
  return c.personality[key as keyof typeof c.personality];
}

/** A check stat's value: your own, how a cast person feels about you (50 when nobody is cast), or your job performance (50 without a job). */
function statValue(state: LifeState, stat: CheckStat, cast: Record<string, Id>, content: ContentBundle): number {
  if ('family' in stat) {
    const id = cast[stat.role] ?? '';
    return stat.family === 'custody' ? custodyCase(state, id, content) : Math.round(100 * tryChance(state, id, stat.family === 'fertilityPlanned', content));
  }
  if ('job' in stat) return state.career.job?.performance ?? 50;
  // E6a: your standing in the crew, your rank (1 to 5, 3 is 50) or the heat on you; 50 for each without a crew.
  if ('crime' in stat) {
    const k = state.crime;
    if (stat.crime === 'heat') return k.heat;
    if (k.crew === null) return 50;
    return stat.crime === 'standing' ? k.standing : 50 + (k.rank - 3) * 20;
  }
  // E6b: your craft, the quality of your latest work, your fame, public image, fan mood, or your place on the ladder (0–100).
  if ('fame' in stat) {
    const f = state.fame;
    const main = f.main === null ? undefined : f.paths[f.main];
    switch (stat.fame) {
      case 'craft':
        return main?.craft ?? 0;
      case 'quality':
        return f.projects.at(-1)?.quality ?? 50;
      case 'fame':
        return main?.fame ?? 0;
      case 'image':
        return f.image;
      case 'mood':
        return f.mood;
      case 'rung': {
        const ladder = f.main === null ? undefined : content?.famePaths[f.main]?.rungs.length;
        return main && ladder && ladder > 1 ? Math.round(((main.rung - 1) / (ladder - 1)) * 100) : 0;
      }
    }
  }
  // E6c: this year's rating, your team's strength against the opposition, your form and how well you fit your position (0–100).
  if ('sports' in stat) {
    const sp = state.sports;
    switch (stat.sports) {
      case 'rating':
        return sp.seasons.at(-1)?.rating ?? 50;
      case 'team':
        return runStrength(state);
      case 'form':
        return Math.max(0, Math.min(100, 50 + sp.form * 5));
      case 'fit': {
        const def = content && sp.sport ? content.famePaths[sp.sport]?.sport : undefined;
        const position = def?.positions.find((p) => p.id === sp.position);
        return position ? Math.round(100 * fitFor(state, position)) : 50;
      }
    }
  }
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
  for (const stat of check.stats) percent += stat.weight * (statValue(state, stat, cast, content) - 50);
  percent += luckWeight * (state.character.hidden.luck - 50);
  return Math.min(max, Math.max(min, percent)) / 100;
}
