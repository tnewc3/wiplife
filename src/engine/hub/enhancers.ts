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
import { addDependence, addTolerance } from '../drugs/habit';
import { ensureHabit } from '../drugs/query';
import { say } from '../drugs/text';
import type { LifeState } from '../types';
import { playsSport } from './load';

export type EnhancerBlock = 'age' | 'sport' | 'on' | 'off' | 'prison' | 'supply';

/** Why you can't start (or stop) them now, or null. */
export function enhancerBlock(state: LifeState, start: boolean, content: ContentBundle): EnhancerBlock | null {
  const e = state.hub.enhancers;
  if (state.housing.kind === 'incarcerated') return 'prison';
  if (!start) return e.on ? null : 'off';
  if (e.on) return 'on';
  if (state.character.age < content.balance.skills.enhancers.minAge) return 'age';
  if (!playsSport(state) || mySport(state, content) === undefined) return 'sport';
  // D1: they are a drug (a course you have to get, from the drugs system); with none in hand there is nothing to take.
  if ((state.drugs.stock[content.balance.drugs.enhancers.drug]?.units ?? 0) < content.balance.drugs.enhancers.units) return 'supply';
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
  // D1: a season takes a course from your stock. Without one the edge goes.
  const drug = content.balance.drugs.enhancers;
  const def = content.drugs[drug.drug];
  const stock = state.drugs.stock[drug.drug];
  if (!def || !stock || stock.units < drug.units) {
    e.on = false;
    say(state, 'enhancersOut', {}, content);
    return;
  }
  stock.units -= drug.units;
  if (stock.units <= 0) delete state.drugs.stock[drug.drug];
  const habit = ensureHabit(state, drug.drug);
  habit.total += drug.units;
  habit.last = state.currentYear;
  habit.year = state.currentYear;
  habit.uses += drug.units;
  addDependence(state, drug.drug, def.strength, content);
  addTolerance(state, drug.drug, def.tolerance);
  state.drugs.totals.uses += drug.units;
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
