/**
 * Leaving your sport (E6c): you retire, age out of a level, are shut out of
 * the game or lose it to an injury. Fame stays as royalties and endorsements
 * (E6b's retirement). Retiring early can lead to coaching (a job track),
 * broadcasting (a crossover into a media path, if you are famous enough) or a
 * normal career. A long career can leave worn joints. Numbers:
 * balance/sports.yaml.
 */
import type { ContentBundle, SportRetireRoute } from '../../content/schemas';
import { meetsJobRequirements, startJob } from '../career';
import { crossBlock, crossOver, retire } from '../fame/ladder';
import { addCondition, conditionOf } from '../health';
import { chance, type RngState } from '../rng';
import type { LifeState } from '../types';
import { sportsHistory } from './text';
import { mySport } from './query';

export type RetireWhy = 'retired' | 'aged' | 'injury' | 'stalled';

/** Coaching is a job like any other: its requirements (a name in the game, or a degree) still apply. */
function canCoach(state: LifeState, content: ContentBundle): boolean {
  const def = content.jobs['coach'];
  return def !== undefined && meetsJobRequirements(state, def, content);
}

/** Whether this route is open to you now (broadcasting asks for enough fame to cross over). */
export function routeBlock(state: LifeState, route: SportRetireRoute, content: ContentBundle): string | null {
  if (route === 'coaching') return canCoach(state, content) ? null : 'job';
  if (route === 'broadcast') {
    const media = content.balance.sports.retire.broadcastPath;
    return crossBlock(state, media, content) === null ? null : 'fame';
  }
  return null;
}

/**
 * A career that just ended on its own (aged out, shut out, an injury) leaves
 * the way open: this takes a route afterwards, in the same year. Coaching is a
 * job; broadcasting brings the career back to life in a media path if you are
 * famous enough.
 */
export function takeRoute(state: LifeState, route: SportRetireRoute, content: ContentBundle): boolean {
  const s = state.sports;
  const r = s.retired;
  const def = mySport(state, content);
  if (!r || r.year !== state.currentYear || r.route !== null || !def) return false;
  if (route === 'coaching') {
    if (!canCoach(state, content) || state.career.job) return false;
    startJob(state, 'coach', content);
    s.retired = { year: r.year, route };
    return true;
  }
  if (route === 'broadcast') {
    const f = state.fame;
    const media = content.balance.sports.retire.broadcastPath;
    // The career is picked up again for the crossover, then moves on to the media path.
    f.active = true;
    delete f.retired;
    if (crossBlock(state, media, content) === null && crossOver(state, media, content)) {
      f.main = media;
      f.second = null;
      delete f.fadedFrom;
      f.plan = null;
      if (f.contract && f.contract.path !== media) f.contract = null;
      s.retired = { year: r.year, route };
      return true;
    }
    retire(state, content);
    return false;
  }
  s.retired = { year: r.year, route };
  return true;
}

/** You leave your sport. Returns whether you did. */
export function retireSports(state: LifeState, route: SportRetireRoute | null, why: RetireWhy, content: ContentBundle, rng: RngState): boolean {
  const s = state.sports;
  const def = mySport(state, content);
  if (!def || !state.fame.active || state.fame.main !== def.id) return false;
  const b = content.balance.sports;
  s.team = null;
  s.contract = null;
  s.run = null;
  s.draft = null;
  s.pain = false;
  s.ask = null;
  s.playOut = false;
  s.retired = { year: state.currentYear, route };
  sportsHistory(state, why === 'aged' ? 'aged' : 'retired', content);

  // Worn joints, after a long pro career.
  const worn = Math.min(b.injury.worn.max, s.totals.proSeasons * b.injury.worn.perSeason);
  if (worn > 0 && !conditionOf(state, 'worn_joints') && chance(rng, worn)) addCondition(state, 'worn_joints', b.injury.wornSeverity, content);

  const media = b.retire.broadcastPath;
  if (route === 'broadcast' && crossBlock(state, media, content) === null && crossOver(state, media, content)) {
    // The sport is behind you; the media path is now your career.
    const f = state.fame;
    f.main = media;
    f.second = null;
    delete f.fadedFrom;
    f.plan = null;
    if (f.contract && f.contract.path !== media) f.contract = null;
    return true;
  }
  retire(state, content);
  if (route === 'coaching' && canCoach(state, content) && !state.career.job) startJob(state, 'coach', content);
  return true;
}
