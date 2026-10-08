/**
 * Crime careers (E6a): small read-only helpers every part of the engine
 * shares: whether you are in a crew, its definition and the words for your
 * rank, the people in it, and the bands heat, standing and rivalry fall in.
 * Numbers: balance/crime.yaml.
 */
import type { ContentBundle, CrewDef } from '../../content/schemas';
import type { CrimeCrew, CrimeState, Id, LifeState } from '../types';

export const emptyCrime = (): CrimeState => ({
  crew: null,
  rank: 0,
  peak: 0,
  rankSince: 0,
  standing: 0,
  lowYears: 0,
  awayYears: 0,
  heat: 0,
  rivalry: 0,
  jobs: { year: 0, count: 0, last: 0 },
  past: [],
  laundered: { year: 0, byFront: {} },
  totals: { jobs: 0, earned: 0, cleaned: 0, fees: 0, lost: 0, spent: 0, arrests: 0, years: 0 },
});

/** In a crew now. */
export function inCrew(state: LifeState): boolean {
  return state.crime.crew !== null;
}

/** Was in a crew once and isn't now. */
export function isFormer(state: LifeState): boolean {
  return state.crime.crew === null && state.crime.past.length > 0;
}

/** In a crew, but living in another city from it. */
export function isAway(state: LifeState): boolean {
  return state.crime.crew !== null && state.crime.crew.cityId !== state.character.cityId;
}

/** Runs the crew you are in (the top rank). */
export function isLeader(state: LifeState, content: ContentBundle): boolean {
  return state.crime.crew !== null && state.crime.rank >= content.balance.crime.ranks.length;
}

/** The definition of a crew by id, or undefined. */
export function crewDef(content: ContentBundle, id: Id | undefined): CrewDef | undefined {
  return id === undefined ? undefined : content.crews[id];
}

export function crewName(content: ContentBundle, id: Id | undefined): string {
  return crewDef(content, id)?.name ?? '';
}

/** The title of a rank (1 to 5) in a crew. */
export function rankTitle(content: ContentBundle, crewId: Id | undefined, rank: number): string {
  return crewDef(content, crewId)?.ranks[rank - 1] ?? '';
}

/** Which of a list of bands (the first number each band starts at) a value falls in: 0 for the lowest. */
export function bandOf(value: number, bands: readonly number[]): number {
  let band = 0;
  for (const start of bands) if (value >= start) band++;
  return band;
}

/** People of the crew you know who are still alive and in your life. */
export function liveMembers(state: LifeState, crew: CrimeCrew | null = state.crime.crew): Id[] {
  if (!crew) return [];
  return crew.members.filter((id) => {
    const person = state.people[id];
    const rel = state.relationships[id];
    return person !== undefined && person.alive && rel !== undefined && rel.status !== 'ended';
  });
}

/** Everyone in the crew you know, for casting: the members and, while you don't run it, whoever does. */
export function crewPeople(state: LifeState, which: 'yours' | 'boss' | 'informant' | 'rival'): Id[] {
  const crew = state.crime.crew;
  if (!crew) return [];
  const ok = (id: Id | undefined): id is Id => {
    if (id === undefined) return false;
    const rel = state.relationships[id];
    return state.people[id]?.alive === true && rel !== undefined && rel.status !== 'ended';
  };
  if (which === 'boss') return ok(crew.leader) ? [crew.leader] : [];
  if (which === 'informant') return ok(crew.informant) ? [crew.informant] : [];
  if (which === 'rival') return crew.rivalMembers.filter(ok);
  return liveMembers(state, crew);
}

/** Years in a crew, or for a former member the years since the last one. */
export function crimeYears(state: LifeState): number {
  const c = state.crime;
  if (c.crew) return state.currentYear - c.crew.since;
  const last = c.past.at(-1);
  return last ? state.currentYear - last.toYear : 0;
}

/** The crew a former member left last. */
export function lastCrewId(state: LifeState): Id | undefined {
  return state.crime.crew?.defId ?? state.crime.past.at(-1)?.crewId;
}
