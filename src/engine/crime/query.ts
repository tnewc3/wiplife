/**
 * Crime careers (E6a): small read-only helpers every part of the engine
 * shares: whether you are in a crew, its definition and the words for your
 * rank, the people in it, and the bands heat, standing and rivalry fall in.
 * Numbers: balance/crime.yaml.
 */
import type { ContentBundle, CrewDef, OrgKind, OrgKindDef } from '../../content/schemas';
import type { CrimeCrew, CrimeState, Id, LifeState, OrgWorld } from '../types';

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

export const emptyOrgs = (): OrgWorld => ({
  cities: {},
  hoods: {},
  next: 1,
  totals: { income: 0, supplied: 0, fights: 0, wars: 0, killed: 0, informants: 0, promoted: 0, cut: 0 },
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
  return state.crime.crew !== null && state.crime.rank >= topRank(content, state.crime.crew.defId);
}

/** O1: the top rank of an organization (4 in a street gang, 5 in the others); it runs the organization. */
export function topRank(content: ContentBundle, id: Id | undefined): number {
  return crewDef(content, id)?.ranks.length ?? content.balance.crime.ranks.length;
}

/** O1: the kind of organization a crew is. */
export function crewKind(content: ContentBundle, id: Id | undefined): OrgKind | undefined {
  return crewDef(content, id)?.kind;
}

export function kindDef(content: ContentBundle, kind: OrgKind | undefined): OrgKindDef | undefined {
  return kind === undefined ? undefined : content.orgKinds[kind];
}

/** O1: which of balance/crime.yaml's five rank tiers a rank in an organization pays and asks like (1 to 5). */
export function tierOf(content: ContentBundle, crewId: Id | undefined, rank: number): number {
  const tiers = kindDef(content, crewKind(content, crewId))?.tiers;
  const r = Math.max(1, rank);
  return tiers?.[r - 1] ?? Math.min(r, content.balance.crime.ranks.length);
}

/** O1: the rank that is earned by an initiation (the one you are offered by passing it). */
export function initiationRank(content: ContentBundle, crewId: Id | undefined): number {
  return kindDef(content, crewKind(content, crewId))?.initiation.rank ?? 0;
}

/** The definition of a crew by id, or undefined. */
export function crewDef(content: ContentBundle, id: Id | undefined): CrewDef | undefined {
  return id === undefined ? undefined : content.crews[id];
}

export function crewName(content: ContentBundle, id: Id | undefined): string {
  return crewDef(content, id)?.name ?? '';
}

/** The title of a rank (1 up to the top) in a crew. */
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
