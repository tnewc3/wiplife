/**
 * The `sports` condition (E6c): your sport, level, position, team and deal,
 * the season and playoff run under way, injuries, the draft, and what has
 * happened this year. Every field given must hold.
 */
import type { Compare, ContentBundle, SportsCondition } from '../../content/schemas';
import type { LifeState } from '../types';
import { injuryNow, levelNow, mySport, sportPath, thisSeason } from './query';
import { nextSeries } from './playoffs';
import { liveOffers } from './scholarship';
import { divisionOf, rivalOf, teamById } from './league';
import { tournamentYear } from './world';

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
  if (c.drafted !== undefined && (s.draft !== null && s.draft.year === year && s.draft.pick > 0 && s.draft.academy !== true) !== c.drafted) return false;
  if (c.undrafted !== undefined && (s.draft !== null && s.draft.year === year && s.draft.pick === 0) !== c.undrafted) return false;
  if (c.offered !== undefined && (s.draft !== null && s.draft.teamId !== null && s.draft.academy !== true) !== c.offered) return false;
  if (c.pick && !within(s.draft && s.draft.year === year && s.draft.academy !== true ? s.draft.pick : 0, c.pick)) return false;
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
  // Batch 5.
  if (c.tryout !== undefined && (s.tryout !== null) !== c.tryout) return false;
  if (c.tried) {
    const last = s.tried.at(-1);
    const result = last && last.year >= year - 1 ? (last.made ? 'made' : last.landed !== null ? 'fallback' : 'cut') : null;
    if (result === null || !c.tried.includes(result)) return false;
  }
  if (c.offers && !c.offers.some((tier) => liveOffers(state).some((o) => o.tier === tier))) return false;
  if (c.scholarship !== undefined && (s.scholarship !== null) !== c.scholarship) return false;
  if (c.warned !== undefined && ((s.scholarship?.warned ?? 0) > 0) !== c.warned) return false;
  if (c.role && !c.role.includes(s.role)) return false;
  if (c.captain !== undefined && s.captain !== c.captain) return false;
  if (c.number !== undefined && (s.number !== null) !== c.number) return false;
  if (c.teamless !== undefined && (playing && (s.teamless || (s.pro && s.contract === null))) !== c.teamless) return false;
  if (c.passed !== undefined && (s.passed > 0 && !s.pro) !== c.passed) return false;
  if (c.prospect !== undefined) {
    const level = content ? levelNow(state, content) : null;
    if ((playing && !s.pro && level === 'college' && def !== undefined && state.character.age >= def.sport.draft.age - 1) !== c.prospect) return false;
  }
  if (c.combine && !within(s.combine, c.combine)) return false;
  if (c.club !== undefined && (s.club !== null) !== c.club) return false;
  // Batch 6.
  if (c.loan !== undefined && (s.loan !== null) !== c.loan) return false;
  if (c.loanOffered !== undefined && (s.loanOffer !== null) !== c.loanOffered) return false;
  if (c.academy !== undefined && (s.academy !== null) !== c.academy) return false;
  if (c.academyAbroad !== undefined && (s.academy?.abroad === true) !== c.academyAbroad) return false;
  if (c.graduated !== undefined && (s.draft !== null && s.draft.academy === true && s.draft.pick > 0) !== c.graduated) return false;
  if (c.academyOut !== undefined && (s.academyOut === year) !== c.academyOut) return false;
  if (c.window !== undefined && ((s.transfer?.offers.length ?? 0) > 0) !== c.window) return false;
  if (c.division) {
    const t = content && def && s.team?.id ? teamById(state, def.id, s.team.id, content) : undefined;
    if (!t || !c.division.includes(divisionOf(state, t))) return false;
  }
  if (c.moved && (s.moved === null || s.moved.year !== year || !c.moved.includes(s.moved.dir))) return false;
  if (c.calledUp !== undefined && (s.calledUp === year) !== c.calledUp) return false;
  if (c.tournament !== undefined && (def !== undefined && tournamentYear(state, def)) !== c.tournament) return false;
  if (c.derby !== undefined) {
    const t = content && def && s.team?.id ? teamById(state, def.id, s.team.id, content) : undefined;
    if ((t !== undefined && content !== undefined && def !== undefined && rivalOf(state, def.id, t, content) !== undefined) !== c.derby) return false;
  }
  if (c.away && (s.team?.away === undefined || !c.away.includes(s.team.away))) return false;
  if (c.abroad !== undefined && (s.abroadYear === year) !== c.abroad) return false;
  if (c.caps && !within(s.totals.caps, c.caps)) return false;
  if (c.clause !== undefined && (s.contract?.release !== undefined) !== c.clause) return false;
  if (c.trial) {
    const key = s.tryout?.key;
    const kind = key === undefined ? null : key.startsWith('academy:') ? 'abroad' : key === 'youth:academy' ? 'academy' : null;
    if (kind === null || !c.trial.includes(kind)) return false;
  }
  return true;
}
