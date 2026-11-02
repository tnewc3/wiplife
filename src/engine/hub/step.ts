/**
 * The hub's year (C2, year pipeline step, before the fame step): skills grow
 * for the work you did and fade for what you left; the roles you have add up
 * to a load; load above what you can carry costs Stress and burnout, takes
 * from performance in every role, and way over, something gives; the band
 * plays and its members improve; performance enhancers are taken and tested.
 */
import type { ContentBundle } from '../../content/schemas';
import { curveAt } from '../curve';
import { bandYearGrowth } from './band';
import { enhancersYear } from './enhancers';
import { commitOf, loadNow, playsSport } from './load';
import { fadeSkills, useSkill } from './skills';
import { hasTalentFor, pathDef } from '../fame/query';
import { clampInt } from '../random';
import { chance, pick } from '../rng';
import { writeFromGroup } from '../systems/history';
import type { LifeState, RoleId } from '../types';

const HISTORY = { grades: 'gaveGrades', job: 'gaveJob', bench: 'gaveBench', band: 'gaveBand' } as const;

/** A year of use for the skills of the work you did: a sport you played on a team, a craft you worked. */
function useWorkSkills(state: LifeState, content: ContentBundle): void {
  const f = state.fame;
  if (!f.active) return;
  const share = 0.5;
  for (const pathId of [f.main, f.second]) {
    const path = pathId === null ? undefined : f.paths[pathId];
    const def = pathDef(content, pathId);
    if (!path || !def) continue;
    const sport = def.sport !== undefined;
    // A sport: you played this year. Anything else: you put something out or went on the road in the last year or two.
    const worked = sport ? pathId === f.main && playsSport(state) : path.last >= state.currentYear - 1;
    if (!worked) continue;
    const commit = commitOf(state, sport ? 'sports' : 'fame');
    for (const sk of def.skills ?? []) {
      if (sk.instrument === true && f.instrument === null) continue;
      useSkill(state, pathId!, sk.id, share, commit, hasTalentFor(state, def), content);
    }
  }
}

/** Something gives: one of the roles you have takes the hit. */
function giveWay(state: LifeState, roles: readonly RoleId[], content: ContentBundle): void {
  const g = content.balance.careers.hub.gives;
  const options = roles.filter((r) => r === 'school' || r === 'job' || r === 'gig' || r === 'sports' || r === 'band');
  if (options.length === 0) return;
  const role = pick(state.rng, options);
  let what: 'grades' | 'job' | 'bench' | 'band';
  if (role === 'school') {
    const e = state.education.current;
    if (e) e.boost = Math.round((e.boost - g.grades) * 100) / 100;
    what = 'grades';
  } else if (role === 'job' || role === 'gig') {
    what = 'job';
  } else if (role === 'sports') {
    state.sports.form -= g.bench / content.balance.sports.performance.form;
    what = 'bench';
  } else {
    const band = state.fame.band;
    if (band) band.chemistry = clampInt(band.chemistry - g.band, 0, 100);
    what = 'band';
  }
  state.hub.gave = { year: state.currentYear, what };
  writeFromGroup(state, content.text.hub.history[HISTORY[what]], ['career', 'hub'], { values: {} }, content);
}

export function runHub(state: LifeState, content: ContentBundle): void {
  const hub = state.hub;
  const h = content.balance.careers.hub;
  if (state.housing.kind === 'incarcerated') {
    // Nothing takes your time in prison; burnout eases.
    hub.load = 0;
    hub.shares = {};
    hub.burnout = clampInt(hub.burnout - h.burnout.recover, 0, 100);
    fadeSkills(state, content);
    return;
  }
  useWorkSkills(state, content);
  bandYearGrowth(state, content);
  fadeSkills(state, content);

  const load = loadNow(state, content);
  hub.load = Math.round(load.total * 10) / 10;
  hub.shares = load.shares;
  hub.peakLoad = Math.max(hub.peakLoad, hub.load);
  const stats = state.character.stats;
  if (load.over > 0) {
    hub.overYears += 1;
    hub.burnout = clampInt(Math.round(hub.burnout + load.over * h.over.burnout), 0, 100);
    stats.stress = clampInt(Math.round(stats.stress + load.over * h.over.stress), 0, 100);
    if (state.fame.active) state.fame.burnout = clampInt(Math.round(state.fame.burnout + load.over * h.over.burnout * 0.5), 0, 100);
    if (load.over >= h.over.giveAt && chance(state.rng, curveAt(h.over.give, load.over))) giveWay(state, Object.keys(load.shares) as RoleId[], content);
  } else {
    const light = load.total < load.comfortable * 0.6 ? h.burnout.light : 0;
    hub.burnout = clampInt(hub.burnout - h.burnout.recover - light, 0, 100);
  }
  if (hub.burnout > h.burnout.above) stats.happiness = clampInt(Math.round(stats.happiness - (hub.burnout - h.burnout.above) * h.burnout.happiness), 0, 100);

  // A fiery or flaky bandmate costs chemistry.
  const band = state.fame.band;
  if (band) for (const m of band.members) if (m.temper === 'fiery' || m.temper === 'flaky') band.chemistry = clampInt(band.chemistry - 1, 0, 100);

  // A year that didn't happen yet has no pool or rehearsals.
  if (hub.pool && hub.pool.year < state.currentYear) hub.pool = null;
  enhancersYear(state, content);
}
