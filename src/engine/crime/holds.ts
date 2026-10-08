/**
 * The `crime` condition (E6a): your crew, rank, standing, the heat on you,
 * an open investigation, the rival crew and who is talking to the police.
 * Every field given must hold.
 */
import type { Compare, ContentBundle, CrimeCondition } from '../../content/schemas';
import type { LifeState } from '../types';
import { crewsIn } from './crew';
import { crimeYears, inCrew, isFormer, lastCrewId } from './query';

function within(value: number, c: Compare): boolean {
  if (c.gt !== undefined && !(value > c.gt)) return false;
  if (c.gte !== undefined && !(value >= c.gte)) return false;
  if (c.lt !== undefined && !(value < c.lt)) return false;
  if (c.lte !== undefined && !(value <= c.lte)) return false;
  if (c.eq !== undefined && value !== c.eq) return false;
  return true;
}

/** Jobs done this year. */
export function jobsThisYear(state: LifeState): number {
  return state.crime.jobs.year === state.currentYear ? state.crime.jobs.count : 0;
}

export function crimeHolds(c: CrimeCondition, state: LifeState, topRank: number, content?: ContentBundle): boolean {
  const k = state.crime;
  if (c.member !== undefined && inCrew(state) !== c.member) return false;
  if (c.former !== undefined && isFormer(state) !== c.former) return false;
  if (c.rank && !within(k.rank, c.rank)) return false;
  if (c.leader !== undefined && (inCrew(state) && k.rank >= topRank) !== c.leader) return false;
  if (c.standing && !within(k.standing, c.standing)) return false;
  if (c.heat && !within(k.heat, c.heat)) return false;
  if (c.investigated !== undefined && (k.investigation !== undefined) !== c.investigated) return false;
  if (c.rivalry && !within(k.rivalry, c.rivalry)) return false;
  if (c.rival !== undefined && (k.crew?.rival !== undefined) !== c.rival) return false;
  if (c.informant !== undefined && (k.crew?.informant !== undefined) !== c.informant) return false;
  if (c.jobs && !within(jobsThisYear(state), c.jobs)) return false;
  if (c.years && !within(crimeYears(state), c.years)) return false;
  if (c.crew !== undefined) {
    const id = lastCrewId(state);
    if (id === undefined || !c.crew.includes(id)) return false;
  }
  if (c.arrests && !within(k.totals.arrests, c.arrests)) return false;
  if (c.away !== undefined && (k.crew?.away !== undefined) !== c.away) return false;
  if (c.awayYears && !within(k.crew?.away ? k.awayYears : 0, c.awayYears)) return false;
  if (c.suspicion && !within(k.crew?.away?.suspicion ?? 0, c.suspicion)) return false;
  if (c.returned !== undefined && (k.crew?.returned === state.currentYear) !== c.returned) return false;
  if (c.local !== undefined && (content !== undefined && crewsIn(content, state.character.cityId).length > 0) !== c.local) return false;
  return true;
}
