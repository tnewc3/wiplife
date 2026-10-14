/**
 * Where you stand in the country you live in (W6): citizen, permanent resident, on a temporary permit or without
 * papers, derived from your citizenships and the residence record (src/engine/travel). Other systems ask here whether
 * work, credit and licenses are open to you.
 */
import type { CountryId, ContentBundle, StatusKind } from '../../content/schemas';
import { countryIdOfCity } from '../country';
import type { Id, LifeState, Person } from '../types';

/** The country you live in now. */
export function livingCountry(state: LifeState, content: ContentBundle): CountryId {
  return countryIdOfCity(state.character.cityId, content);
}

export function isCitizenOf(citizenships: readonly CountryId[], countryId: CountryId): boolean {
  return citizenships.includes(countryId);
}

/** You hold the citizenship of the country you live in. */
export function isCitizen(state: LifeState, content: ContentBundle): boolean {
  return isCitizenOf(state.character.citizenships, livingCountry(state, content));
}

/** Citizen, permanent resident, temporary permit or no papers, where you live now. */
export function statusKind(state: LifeState, content: ContentBundle): StatusKind {
  if (isCitizen(state, content)) return 'citizen';
  const r = state.travel.residence;
  if (r?.type === 'undocumented') return 'undocumented';
  if (r?.type === 'permanent_resident') return 'permanent';
  return 'temporary';
}

/** You live in a country as someone who moved there for good and is not (yet) a citizen. */
export function isSettled(state: LifeState, content: ContentBundle): boolean {
  return state.travel.residence?.settled === true && !isCitizen(state, content);
}

/** You are without papers: regular jobs, loans and licenses are closed to you (informal work is not). */
export function isUndocumented(state: LifeState): boolean {
  return state.travel.residence?.type === 'undocumented';
}

/** A temporary W5 stay (a trip, an exchange, a working holiday) rather than a life lived in a new country. */
export function onTemporaryStay(state: LifeState): boolean {
  const r = state.travel.residence;
  return r !== null && r.settled !== true;
}

/** Regular employment is closed to you. */
export function workBlocked(state: LifeState): boolean {
  return isUndocumented(state);
}

/** Loans, mortgages, student loans and business loans are closed to you. */
export function creditBlocked(state: LifeState): boolean {
  return isUndocumented(state);
}

/** Whole years since you arrived in the country you live in (null if you have lived here all along). */
export function yearsInCountry(state: LifeState): number | null {
  return state.migration.arrivedYear === null ? null : state.currentYear - state.migration.arrivedYear;
}

/** Living people you know who live in another country than you. */
export function relativesAbroad(state: LifeState, content: ContentBundle): Id[] {
  const here = livingCountry(state, content);
  return Object.values(state.relationships)
    .filter((r) => r.status === 'active' && ['parent', 'sibling', 'child', 'spouse', 'partner', 'fiance', 'grandparent', 'relative', 'stepparent'].includes(r.kind))
    .map((r) => state.people[r.personId])
    .filter((p): p is Person => !!p && p.alive && countryIdOfCity(p.cityId, content) !== here)
    .map((p) => p.id)
    .sort();
}

/** A person's citizenship is that of the country of the city they live in unless they are one of the people we follow abroad. */
export function personIsCitizen(person: Person, countryId: CountryId): boolean {
  return person.citizenships.includes(countryId);
}
