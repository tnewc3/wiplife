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
    if ('any' in c) c.any.forEach(visit);
  };
  visit(def.requires);
  const destination = content.destinations[asked.destinationId ?? ''] ?? (asked.style === 'cruise' ? destinations(content).find((d) => d.kind === 'cruise')! : destinations(content).find((d) => d.cityId && countryIdOfCity(d.cityId, content) !== countryIdOfCity(state.character.cityId, content))!);
  const kind = asked.kind ?? (asked.family ? 'work' : 'trip');
  const home = state.character.cityId;
  state.travel.active = { kind, ...(asked.style ? { style: asked.style } : {}), ...(asked.activity ? { activity: asked.activity } : {}), ...(asked.souvenir ? { souvenir: 'keepsake' as const } : {}), destinationId: destination.id, companions: cast.companion ? [cast.companion] : [], encounterId: cast.npc ?? null, romanceId: cast.date ?? null };
  state.travel.residence = { country: destination.country, destinationId: destination.id, type: kind === 'trip' ? 'visitor' : kind === 'study' ? 'student' : 'temporary_worker', route: kind === 'trip' ? 'vacation' : kind === 'study' ? 'year' : 'working_holiday', startYear: state.currentYear, endYear: state.currentYear + (kind === 'trip' ? 0 : kind === 'study' ? 1 : content.balance.travel.work.years), homeCityId: home, homeHousing: { ...state.housing }, ...(asked.family ? { family: { partnerId: cast.mate ?? null, childIds: cast.kid ? [cast.kid] : [] } } : {}) };
  if (kind !== 'trip' && destination.cityId) { state.character.cityId = destination.cityId; state.housing = { kind: 'renting', cityId: destination.cityId, since: state.currentYear, annualCost: 0 }; }
  // Batch 10: a family on the stay: your partner lives with you there, and your child is one who lives with you.
  if (asked.family && cast.kid) {
    const kid = state.people[cast.kid]!;
    kid.birthYear = state.currentYear - 8;
    kid.child = { origin: 'birth', custody: 'you', custodyDecided: true, health: 70, happiness: 70, fitness: 50, stress: 30, geneticRisk: 20, talent: null, gpa: 0, latent: JSON.parse(JSON.stringify(state.character.latent)) as typeof state.character.latent };
    state.relationships[cast.kid]!.kind = 'child';
  }
  if (asked.family && cast.mate) state.housing.partnerId = cast.mate;
  if (destination.cityId) for (const id of [cast.npc, cast.date, ...(asked.family ? [cast.mate, cast.kid] : [])]) if (id) state.people[id]!.cityId = destination.cityId;
}
