/**
 * W6: keeping the permit record true after a move that no migration action made (a minor going to live with a guardian
 * who lives in another country). Kept apart from the rest so housing and the estate step can use it without a cycle.
 */
import type { ContentBundle } from '../../content/schemas';
import { countryIdOfCity } from '../country';
import type { LifeState } from '../types';

export function endSettledStanding(state: LifeState): void {
  if (state.travel.residence?.settled) state.travel.residence = null;
  state.migration.arrivedYear = null;
  state.migration.undocumented = null;
  state.migration.application = null;
}

/** A citizen of where they now live holds no permit; a dependent who is not holds the standing of the household they live in. */
export function reconcileStanding(state: LifeState, content: ContentBundle): void {
  const here = countryIdOfCity(state.character.cityId, content);
  const r = state.travel.residence;
  if (state.character.citizenships.includes(here)) {
    if (r?.settled) endSettledStanding(state);
    return;
  }
  const name = content.countries[here]?.name ?? '';
  if (r && !r.settled) return;
  if (r?.country === name) return;
  const destinationId = Object.values(content.destinations).find((d) => d.cityId === state.character.cityId && !d.retired)?.id ?? '';
  state.travel.residence = { country: name, destinationId, type: 'permanent_resident', route: 'family', startYear: state.currentYear, endYear: state.currentYear, homeCityId: state.character.birthCityId, settled: true };
  state.migration.arrivedYear = state.currentYear;
  state.migration.undocumented = null;
}
