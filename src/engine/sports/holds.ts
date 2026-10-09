/**
 * The `sports` condition (E6c): your sport, level, position, team and deal,
 * the season and playoff run under way, injuries, the draft, and what has
 * happened this year. Every field given must hold.
 */
import type { Compare, ContentBundle, SportsCondition } from '../../content/schemas';
import type { LifeState } from '../types';
import { injuryNow, levelNow, mySport, sportPath, thisSeason } from './query';
import { nextSeries } from './playoffs';

function within(value: number, c: Compare): boolean {
  if (c.gt !== undefined && !(value > c.gt)) return false;
  if (c.gte !== undefined && !(value >= c.gte)) return false;
  if (c.lt !== undefined && !(value < c.lt)) return false;
  if (c.lte !== undefined && !(value <= c.lte)) return false;
  if (c.eq !== undefined && value !== c.eq) return false;
  return true;
}

export function sportsHolds(c: SportsCondition, state: LifeState, content?: ContentBundle): boolean {
  const s = state.sports;
  const f = state.fame;
  const year = state.currentYear;
  const def = content ? mySport(state, content) : undefined;
  const playing = f.active && s.sport !== null && f.main === s.sport && s.retired === undefined;
  if (c.active !== undefined && playing !== c.active) return false;
  if (c.sport && (s.sport === null || !c.sport.includes(s.sport))) return false;
  if (c.level) {
    const level = content ? levelNow(state, content) : null;
    if (level === null || !c.level.includes(level)) return false;
  }
  if (c.position && (s.position === null || !c.position.includes(s.position))) return false;
  if (c.contract !== undefined && (s.contract !== null) !== c.contract) return false;
  if (c.contractYear !== undefined && (s.contract !== null && s.contract.until === year) !== c.contractYear) return false;
  if (c.freeAgent !== undefined && (playing && s.pro && s.contract === null) !== c.freeAgent) return false;
  if (c.run !== undefined && (s.run !== null && s.run.alive) !== c.run) return false;
  if (c.round && !within(nextSeries(state), c.round)) return false;
  if (c.result) {
    const season = thisSeason(state);
    if (!season || !c.result.includes(season.result)) return false;
  }
  if (c.injured !== undefined) {
    const sport = def ?? (content ? sportPath(content, s.sport) : undefined);
    if (((sport ? injuryNow(state, sport.sport) : null) !== null) !== c.injured) return false;
  }
  if (c.pain !== undefined && s.pain !== c.pain) return false;
  if (c.drafted !== undefined && (s.draft !== null && s.draft.year === year && s.draft.pick > 0) !== c.drafted) return false;
  if (c.undrafted !== undefined && (s.draft !== null && s.draft.year === year && s.draft.pick === 0) !== c.undrafted) return false;
  if (c.offered !== undefined && (s.draft !== null && s.draft.teamId !== null) !== c.offered) return false;
  if (c.pick && !within(s.draft && s.draft.year === year ? s.draft.pick : 0, c.pick)) return false;
  if (c.traded !== undefined && (s.traded === year) !== c.traded) return false;
  if (c.released !== undefined && (s.released === year) !== c.released) return false;
  if (c.agedOut !== undefined && (s.agedOut === year) !== c.agedOut) return false;
  if (c.suspended !== undefined && (s.suspended === year || s.suspended === year + 1) !== c.suspended) return false;
  if (c.rating && !within(thisSeason(state)?.rating ?? s.seasons.at(-1)?.rating ?? 0, c.rating)) return false;
  if (c.titles && !within(s.totals.titles, c.titles)) return false;
  if (c.seasons && !within(s.totals.seasons, c.seasons)) return false;
  if (c.allStars && !within(s.totals.allStars, c.allStars)) return false;
  if (c.retired !== undefined && (s.retired !== undefined) !== c.retired) return false;
  if (c.amateur !== undefined) {
    const level = content ? levelNow(state, content) : null;
    if ((level !== null && level !== 'pro') !== c.amateur) return false;
  }
  return true;
}
