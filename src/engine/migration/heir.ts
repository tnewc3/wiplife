/** Heirs (W6): citizenship passes by birthplace and parentage (children get it at birth, see ./citizenship.ts); a child who is not a citizen of the country they grew up in keeps the standing of the household they were raised in. */
import type { ContentBundle } from '../../content/schemas';
import { countryIdOfCity } from '../country';
import type { LifeState } from '../types';
import { destinationOf } from './move';

export function inheritStanding(heir: LifeState, dead: LifeState, content: ContentBundle): void {
  const here = countryIdOfCity(heir.character.cityId, content);
  if (heir.character.citizenships.includes(here)) return;
  const parent = dead.travel.residence;
  const undocumented = parent?.type === 'undocumented';
  heir.travel.residence = {
    country: content.countries[here]!.name,
    destinationId: destinationOf(heir.character.cityId, content),
    type: undocumented ? 'undocumented' : 'permanent_resident',
    route: undocumented ? 'overstay' : 'family',
    startYear: heir.birthYear, endYear: heir.birthYear,
    homeCityId: parent?.homeCityId ?? heir.character.birthCityId,
    settled: true,
  };
  heir.migration.arrivedYear = heir.birthYear;
  if (undocumented) heir.migration.undocumented = { sinceYear: heir.birthYear, origin: 'overstay', closeCalls: 0 };
}
