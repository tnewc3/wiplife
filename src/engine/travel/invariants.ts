import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';
import { countryIdOfCity } from '../country';
export function travelFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (s: string) => failures.push(`travel: ${s}`);
  const t = state.travel; const r = t.residence;
  if (t.tripYear !== null && (t.tripYear > state.currentYear || t.tripYear < state.birthYear)) fail('trip year outside life');
  for (const [id, count] of Object.entries(t.totals.destinations)) if (!content.destinations[id] || !Number.isInteger(count) || count < 0) fail('invalid destination count');
  for (const [key, value] of Object.entries(t.totals)) if (typeof value === 'number' && (!Number.isSafeInteger(value) || !['happiness', 'stress'].includes(key) && value < 0)) fail(`invalid total ${key}`);
  if (t.totals.returns > t.totals.study + t.totals.work) fail('more returns than stays');
  if (Object.values(t.totals.destinations).reduce((n, c) => n + c, 0) !== t.totals.trips + t.totals.study + t.totals.work) fail('destination totals do not match travel');
  if (t.active) {
    const a = t.active;
    if (state.phase !== 'action') fail('trip context outside action');
    if (!content.destinations[a.destinationId]) fail('unknown active destination');
    if (new Set(a.companions).size !== a.companions.length || a.companions.length > content.balance.travel.maxCompanions) fail('invalid companions');
    for (const id of [...a.companions, ...[a.encounterId, a.romanceId].filter((p): p is string => p !== null)]) if (!state.people[id] || !state.relationships[id]) fail('missing travel contact');
    if (a.romanceId && (!state.people[a.romanceId] || state.character.age < content.balance.relationships.adultAge || state.currentYear - state.people[a.romanceId]!.birthYear < content.balance.relationships.adultAge)) fail('romance under 18');
  }
  if (r) {
    const d = content.destinations[r.destinationId];
    if (!d || d.country !== r.country) fail('residence destination/country mismatch');
    if (!content.cities[r.homeCityId] || r.homeHousing.cityId !== r.homeCityId) fail('invalid return home');
    if (r.startYear > state.currentYear || r.startYear < state.birthYear || r.endYear < r.startYear) fail('residence dates out of order');
    if (r.type === 'visitor') {
      if (r.route !== 'vacation' || r.endYear !== r.startYear || state.phase !== 'action' || t.active?.kind !== 'trip' || state.character.cityId !== r.homeCityId) fail('visitor outside within-year trip');
    } else {
      const length = r.type === 'student' ? 1 : content.balance.travel.work.years;
      if (r.endYear !== r.startYear + length) fail('stay length does not match permission');
      if (!['renting', 'with_parents'].includes(r.homeHousing.kind)) fail('unsupported return housing');
      if (!d?.cityId || state.character.cityId !== d.cityId || countryIdOfCity(d.cityId, content) === countryIdOfCity(r.homeCityId, content)) fail('temporary stay is not in host country');
      if (r.type === 'student' && !['semester', 'year'].includes(r.route)) fail('student route mismatch');
      if (r.type === 'temporary_worker' && !['working_holiday', 'transfer'].includes(r.route)) fail('worker route mismatch');
      if (state.currentYear > r.endYear) fail('overdue return');
    }
  }
  return failures;
}
