/**
 * Citizenship (W6): who is a citizen of what. A character or person holds a list of countries. A child gets the
 * citizenship of the country of birth where that country gives it to anyone born there (or to children of its
 * citizens and permanent residents), and each parent's citizenship where that country passes it down by descent.
 * Rules are per country in balance/immigration.yaml; no random draws, so replays do not shift.
 */
import type { ContentBundle, CountryId } from '../../content/schemas';
import { countryIdOfCity } from '../country';
import type { Id, LifeState } from '../types';

/** What a parent brings: their citizenships, and the country they hold permanent residence in (or a better status), if any. */
export interface ParentStanding {
  citizenships: readonly CountryId[];
  settledIn?: CountryId | null;
}

/** The citizenships a child born in `cityId` to these parents holds. Never empty. */
export function birthCitizenships(cityId: Id, parents: readonly ParentStanding[], content: ContentBundle): CountryId[] {
  const born = countryIdOfCity(cityId, content);
  const rules = content.balance.immigration.countries;
  const out: CountryId[] = [];
  const add = (c: CountryId) => { if (!out.includes(c)) out.push(c); };
  const here = rules[born];
  const parentRooted = parents.some((p) => p.citizenships.includes(born) || p.settledIn === born);
  if (here.birthright === 'anyone' || parentRooted) add(born);
  for (const p of parents) for (const c of p.citizenships) if (rules[c].descent) add(c);
  // A child of people with no country that passes citizenship down is still a citizen of somewhere: the one they are born into.
  if (out.length === 0) add(born);
  return out;
}

/** A person we meet in a city: a citizen of that country. */
export function citizenshipsFromCity(cityId: Id, content: ContentBundle): CountryId[] {
  return [countryIdOfCity(cityId, content)];
}

/** What you bring to a child as a parent: your citizenships, and the country you hold permanent residence in. */
export function parentStanding(state: LifeState, content: ContentBundle): ParentStanding {
  const r = state.travel.residence;
  const living = countryIdOfCity(state.character.cityId, content);
  return { citizenships: state.character.citizenships, settledIn: r?.type === 'permanent_resident' ? living : null };
}

/** Adds a citizenship (dual citizenship), or replaces the others where the country does not allow it. */
export function addCitizenship(state: LifeState, countryId: CountryId, content: ContentBundle): void {
  if (!state.character.citizenships.includes(countryId)) state.character.citizenships.push(countryId);
  if (!content.balance.immigration.countries[countryId].dual) state.character.citizenships = [countryId];
}
