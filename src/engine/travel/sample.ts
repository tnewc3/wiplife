/** Throwaway W5 context for the existing event sandbox, never a saved trip. */
import type { Condition, ContentBundle, EventDef } from '../../content/schemas';
import { countryIdOfCity } from '../country';
import type { LifeState } from '../types';
import { destinations } from './travel';
export function giveSampleTravel(state: LifeState, def: EventDef, cast: Record<string, string>, content: ContentBundle): void {
  if (def.category !== 'travel') return;
  let asked: Extract<Condition, { travel: unknown }>['travel'] = {};
  const visit = (c: Condition | undefined): void => {
    if (!c) return;
    if ('all' in c) c.all.forEach(visit);
    if ('travel' in c) asked = { ...asked, ...c.travel };
  };
  visit(def.requires);
  const destination = content.destinations[asked.destinationId ?? ''] ?? destinations(content).find((d) => d.cityId && countryIdOfCity(d.cityId, content) !== countryIdOfCity(state.character.cityId, content))!;
  const kind = asked.kind ?? 'trip';
  const home = state.character.cityId;
  state.travel.active = { kind, destinationId: destination.id, companions: cast.companion ? [cast.companion] : [], encounterId: cast.npc ?? null, romanceId: cast.date ?? null };
  state.travel.residence = { country: destination.country, destinationId: destination.id, type: kind === 'trip' ? 'visitor' : kind === 'study' ? 'student' : 'temporary_worker', route: kind === 'trip' ? 'vacation' : kind === 'study' ? 'year' : 'working_holiday', startYear: state.currentYear, endYear: state.currentYear + (kind === 'trip' ? 0 : kind === 'study' ? 1 : content.balance.travel.work.years), homeCityId: home, homeHousing: { ...state.housing } };
  if (kind !== 'trip' && destination.cityId) { state.character.cityId = destination.cityId; state.housing = { kind: 'renting', cityId: destination.cityId, since: state.currentYear, annualCost: 0 }; }
  if (destination.cityId) for (const id of [cast.npc, cast.date]) if (id) state.people[id]!.cityId = destination.cityId;
}
