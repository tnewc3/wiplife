/**
 * Performance enhancers (C2, sports). Taking them adds form to your season
 * and costs health. Leagues test: at the pro and college level a season may
 * bring a test, and a positive one suspends you and costs fame, fan mood and
 * reputation. Numbers: balance/skills.yaml enhancers.
 */
import type { ContentBundle } from '../../content/schemas';
import { writeFromGroup } from '../systems/history';
import { clampInt } from '../random';
import { chance } from '../rng';
import { mySport } from '../sports/query';
import type { LifeState } from '../types';
import { playsSport } from './load';

export type EnhancerBlock = 'age' | 'sport' | 'on' | 'off' | 'prison';

/** Why you can't start (or stop) them now, or null. */
export function enhancerBlock(state: LifeState, start: boolean, content: ContentBundle): EnhancerBlock | null {
  const e = state.hub.enhancers;
  if (state.housing.kind === 'incarcerated') return 'prison';
  if (!start) return e.on ? null : 'off';
  if (e.on) return 'on';
  if (state.character.age < content.balance.skills.enhancers.minAge) return 'age';
  if (!playsSport(state) || mySport(state, content) === undefined) return 'sport';
  return null;
}

const sportName = (state: LifeState, content: ContentBundle): string => mySport(state, content)?.noun ?? '';

export function startEnhancers(state: LifeState, content: ContentBundle): boolean {
  if (enhancerBlock(state, true, content) !== null) return false;
  state.hub.enhancers = { ...state.hub.enhancers, on: true, since: state.currentYear, years: 0 };
  writeFromGroup(state, content.text.hub.history.enhancersStarted, ['sports', 'enhancers'], { values: { sport: sportName(state, content) } }, content);
  return true;
}

export function stopEnhancers(state: LifeState, content: ContentBundle): boolean {
  if (enhancerBlock(state, false, content) !== null) return false;
  state.hub.enhancers.on = false;
  writeFromGroup(state, content.text.hub.history.enhancersStopped, ['sports', 'enhancers'], { values: {} }, content);
  return true;
}

/** The year of taking them: form and health, then maybe a test. Run by the hub step. */
export function enhancersYear(state: LifeState, content: ContentBundle): void {
  const e = state.hub.enhancers;
  if (!e.on) return;
  const B = content.balance.skills.enhancers;
  // A career that has ended ends this too.
  if (!playsSport(state)) {
    e.on = false;
    return;
  }
  e.years += 1;
  const s = state.sports;
  const rating = content.balance.sports.performance.form;
  s.form += B.form / rating;
  const stats = state.character.stats;
  stats.health = clampInt(Math.round(stats.health - B.health), 0, 100);
  const level = s.pro ? 'pro' : (s.team?.level ?? 'youth');
  if (!chance(state.rng, B.test[level])) return;
  e.tests += 1;
  if (!chance(state.rng, B.detect)) return;
  e.positives += 1;
  e.on = false;
  s.suspended = state.currentYear;
  s.totals.suspensions += 1;
  s.form = 0;
  const f = state.fame;
  const main = f.main === null ? undefined : f.paths[f.main];
  if (main) main.fame = clampInt(main.fame - B.caught.fame, 0, 100);
  f.mood = clampInt(f.mood - B.caught.mood, 0, 100);
  state.character.hidden.reputation = clampInt(state.character.hidden.reputation - B.caught.reputation, 0, 100);
  writeFromGroup(state, content.text.hub.history.enhancersCaught, ['sports', 'enhancers'], { values: {} }, content);
}
