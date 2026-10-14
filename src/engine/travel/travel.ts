import { onTemporaryStay } from '../migration/query';
import { lapseMoved } from '../belonging/leave';
/** W5 orchestrates finance, education, careers, people and language; those systems remain authoritative. */
import type { ContentBundle } from '../../content/schemas';
import { TRIP_BUDGETS } from '../../content/schemas';
import { endJob, rollOpenings, staffWorkplace } from '../career';
import { countryIdOfCity, countryOfCity, moneyDisplayOf, formatMoney } from '../country';
import { createPerson } from '../events/casting';
import { fittingResults, queueResult } from '../actions/result';
import { spend, wholeDollars } from '../finance';
import { livesWithYou } from '../family/household';
import { refreshHousingCost } from '../housing';
import { gainLanguage, meetsLanguageJob } from '../languages';
import { onProbation } from '../legal';
import { clampInt } from '../random';
import { currentPartner, isPartnerKind } from '../relationships';
import { pick } from '../rng';
import { applyStatEffects } from '../systems/economy';
import { writeFromGroup } from '../systems/history';
import type { LifeState } from '../types';
import type { TripBudget, Residence, TravelContext } from './types';

export interface TripInput { destinationId: string; budget: TripBudget; companions: string[] }
export interface StayInput { destinationId: string; route: Residence['route'] }
export function destinations(content: ContentBundle) {
  return Object.values(content.destinations).filter((d) => !d.retired).sort((a, b) => a.name.localeCompare(b.name));
}
export function travelCompanions(state: LifeState) {
  return Object.values(state.relationships).filter((r) => r.status === 'active' && state.people[r.personId]?.alive && state.people[r.personId]!.cityId === state.character.cityId && ['partner', 'fiance', 'spouse', 'friend', 'parent', 'sibling', 'child', 'stepparent', 'stepchild', 'grandchild'].includes(r.kind)).map((r) => r.personId).sort();
}
export function tripCost(input: TripInput, content: ContentBundle): number {
  const d = content.destinations[input.destinationId];
  if (!d) return 0;
  return wholeDollars(content.balance.travel.budgets[input.budget].cost * d.costLevel * (1 + input.companions.length * content.balance.travel.companionCostShare));
}
export function canTravel(state: LifeState, content: ContentBundle): boolean {
  return state.character.age >= content.balance.travel.minAge && state.housing.kind !== 'incarcerated' && !onProbation(state) && !onTemporaryStay(state) && state.travel.tripYear !== state.currentYear && !state.later.terminal && !state.housing.assisted;
}
export function canPlanTrip(state: LifeState, input: TripInput, content: ContentBundle): boolean {
  const d = content.destinations[input.destinationId];
  return canTravel(state, content) && !!d && !d.retired && d.cityId !== state.character.cityId && TRIP_BUDGETS.includes(input.budget) && input.companions.length <= content.balance.travel.maxCompanions && new Set(input.companions).size === input.companions.length && input.companions.every((id) => travelCompanions(state).includes(id)) && state.finances.savings >= tripCost(input, content);
}
/** Stays are solo; a dependent's housing cannot silently move or leave them unattended. */
export function stayBlock(state: LifeState, input: StayInput, content: ContentBundle): string | null {
  const d = content.destinations[input.destinationId];
  if (!canTravel(state, content)) return 'unavailable';
  if (!d?.cityId || d.retired || countryIdOfCity(d.cityId, content) === countryIdOfCity(state.character.cityId, content)) return 'destination';
  if (!['renting', 'with_parents'].includes(state.housing.kind) || state.housing.guardianId || Object.values(state.people).some((p) => p.alive && (livesWithYou(state, p.id) && state.currentYear - p.birthYear < content.balance.relationships.adultAge || p.life?.care === 'home'))) return 'household';
  if (state.business.items.length || state.crime.crew || state.fame.active || state.sports.pro) return 'commitment';
  if (input.route === 'semester' || input.route === 'year') {
    if (state.education.current?.program !== 'college' || state.career.job !== null) return 'college';
    if (state.finances.savings < content.balance.travel.exchange.cost) return 'money';
    return null;
  }
  if (state.education.current !== null) return 'school';
  if (input.route === 'working_holiday') {
    if (state.character.age > content.balance.travel.work.holidayMaxAge || state.career.job !== null || state.career.retired) return 'holiday';
  } else if (input.route === 'transfer') {
    const job = state.career.job && content.jobs[state.career.job.jobId];
    if (!job || !meetsLanguageJob(state.character.languages, job, d.cityId, content)) return 'job';
  } else return 'route';
  return state.finances.savings < content.balance.travel.work.cost ? 'money' : null;
}
function rememberDestination(state: LifeState, destinationId: string): void {
  const t = state.travel.totals;
  t.destinations[destinationId] = (t.destinations[destinationId] ?? 0) + 1;
}
/** Generate using the destination's existing name/language pools. Vacation-only encounters are fellow travelers, with a modeled home. */
function encounter(state: LifeState, destinationId: string, romantic: boolean, content: ContentBundle): string | null {
  const home = state.character.cityId;
  const d = content.destinations[destinationId]!;
  const cities = Object.keys(content.cities).filter((id) => id !== home && !content.cities[id]!.retired).sort();
  state.character.cityId = d.cityId ?? pick(state.rng, cities);
  const id = createPerson(state, { kind: 'acquaintance', presence: 'anywhere', age: { min: content.balance.travel.minAge, max: content.balance.events.newPerson.maxAge }, ...(romantic ? { romantic: true } : {}) }, state.rng, content);
  state.character.cityId = home;
  if (id) { state.people[id]!.tags.push('met_abroad'); state.travel.totals.encounters++; }
  return id;
}
function context(state: LifeState, kind: TravelContext['kind'], destinationId: string, companions: string[], content: ContentBundle): TravelContext {
  const encounterId = encounter(state, destinationId, false, content);
  const romanceId = kind === 'trip' && companions.length === 0 && currentPartner(state) === null ? encounter(state, destinationId, true, content) : null;
  return { kind, destinationId, companions, encounterId, romanceId };
}
export function travelCast(state: LifeState): Record<string, string> {
  const t = state.travel.active;
  return t ? { ...(t.encounterId ? { npc: t.encounterId } : {}), ...(t.romanceId ? { date: t.romanceId } : {}), ...(t.companions[0] ? { companion: t.companions[0] } : {}) } : {};
}
function result(state: LifeState, ids: string[], cost: number, content: ContentBundle): void {
  const cast = travelCast(state);
  const options = fittingResults(state, ids, cast, content);
  // Availability and content validation guarantee a cast-free receipt in every group.
  queueResult(state, options.filter(([d]) => d.id !== ids[0]), cast);
  const story = { ...state.pending[0]!, instanceId: state.pending[0]!.instanceId + '-story' };
  queueResult(state, fittingResults(state, [ids[0]!], {}, content), {});
  state.pending.push(story);
  state.pending[0]!.money = { change: -cost, balance: state.finances.savings, debtChange: 0 };
}
export function planTrip(state: LifeState, input: TripInput, content: ContentBundle): void {
  const cost = tripCost(input, content);
  spend(state, cost, content);
  state.travel.tripYear = state.currentYear;
  state.travel.totals.trips++; state.travel.totals.spent += cost;
  rememberDestination(state, input.destinationId);
  const effects = content.balance.travel.budgets[input.budget].effects;
  const before = { ...state.character.stats };
  applyStatEffects(state, { happiness: { perYear: effects.happiness, limit: 100 }, stress: { perYear: effects.stress, limit: 0 } });
  state.travel.totals.happiness += state.character.stats.happiness - before.happiness;
  state.travel.totals.stress += state.character.stats.stress - before.stress;
  for (const id of input.companions) state.relationships[id]!.affection = clampInt(state.relationships[id]!.affection + content.balance.travel.companionAffection, 0, 100);
  state.travel.totals.immersion += gainLanguage(state.character.languages, content.destinations[input.destinationId]!.languageId, content.balance.travel.tripImmersion, state.currentYear);
  state.travel.active = context(state, 'trip', input.destinationId, input.companions, content);
  // W6: someone who moved for good keeps their own record while away; the trip is still within the year.
  if (state.travel.residence === null) state.travel.residence = { country: content.destinations[input.destinationId]!.country, destinationId: input.destinationId, type: 'visitor', route: 'vacation', startYear: state.currentYear, endYear: state.currentYear, homeCityId: state.character.cityId, homeHousing: { ...state.housing } };
  visitHome(state, input.destinationId, content);
  writeFromGroup(state, { importance: 2, variants: content.text.travel.vacation }, ['travel', 'trip'], { values: travelValues(state, content) }, content);
  result(state, content.registries.travel.trips, cost, content);
}
/** W6: a trip to the country you came from refreshes your ties with the people who live in that city. */
function visitHome(state: LifeState, destinationId: string, content: ContentBundle): void {
  const d = content.destinations[destinationId]!;
  if (!state.travel.residence?.settled || !d.cityId || !state.character.citizenships.includes(countryIdOfCity(d.cityId, content))) return;
  let seen = false;
  for (const r of Object.values(state.relationships)) {
    if (r.status !== 'active' || state.people[r.personId]?.cityId !== d.cityId || !state.people[r.personId]!.alive) continue;
    r.affection = clampInt(r.affection + content.balance.immigration.visits.affection, 0, 100);
    seen = true;
  }
  if (seen) state.migration.counts.visits = (state.migration.counts.visits ?? 0) + 1;
}
/** Detach coworkers rather than teleporting them; the existing workplace system supplies the host office. */
function changeOffice(state: LifeState, content: ContentBundle): void {
  for (const r of Object.values(state.relationships)) if (['boss', 'coworker'].includes(r.kind) && r.status !== 'ended') { r.kind = 'acquaintance'; r.kindSince = state.currentYear; }
  if (state.career.job) staffWorkplace(state, content, true);
  rollOpenings(state, content);
}
export function beginStay(state: LifeState, input: StayInput, content: ContentBundle): void {
  const d = content.destinations[input.destinationId]!;
  const study = input.route === 'semester' || input.route === 'year';
  const cost = study ? content.balance.travel.exchange.cost : content.balance.travel.work.cost;
  const residence: Residence = { country: d.country, destinationId: d.id, type: study ? 'student' : 'temporary_worker', route: input.route, startYear: state.currentYear, endYear: state.currentYear + (study ? 1 : content.balance.travel.work.years), homeCityId: state.character.cityId, homeHousing: { ...state.housing } };
  spend(state, cost, content);
  state.travel.residence = residence;
  state.travel.tripYear = state.currentYear;
  state.travel.totals.spent += cost;
  state.travel.totals[study ? 'study' : 'work']++;
  rememberDestination(state, d.id);
  state.character.cityId = d.cityId!;
  state.housing = { kind: 'renting', cityId: d.cityId!, annualCost: 0, since: state.currentYear };
  refreshHousingCost(state, content);
  if (input.route === 'working_holiday') state.career.gig = true;
  lapseMoved(state, content);
  changeOffice(state, content);
  state.travel.active = context(state, study ? 'study' : 'work', d.id, [], content);
  writeFromGroup(state, { importance: 2, variants: content.text.travel.departed }, ['travel', study ? 'study' : 'work'], { values: travelValues(state, content) }, content);
  result(state, content.registries.travel[study ? 'study' : 'work'], cost, content);
}
export function closeTravelAction(state: LifeState): void {
  if (state.travel.residence?.type === 'visitor') state.travel.residence = null;
  const id = state.travel.active?.romanceId;
  if (id && isPartnerKind(state.relationships[id]!.kind)) state.travel.totals.romances++;
  state.travel.active = null;
}
export function travelValues(state: LifeState, content: ContentBundle): Record<string, string> {
  const r = state.travel.residence; const t = state.travel.active;
  const d = content.destinations[t?.destinationId ?? r?.destinationId ?? ''];
  return { destination: d?.name ?? '', destinationCountry: d?.country ?? '', endYear: String(r?.endYear ?? state.currentYear), homeCity: content.cities[r?.homeCityId ?? state.character.cityId]?.name ?? '', travelCost: formatMoney(state.travel.totals.spent, moneyDisplayOf(state, content)) };
}
/** After the host year's school, immersion, pay and relationships, return before next year's home events. */
export function runTravel(state: LifeState, content: ContentBundle): void {
  const r = state.travel.residence;
  // W6: someone who moved for good has no return planned; the migration step handles their permit.
  if (!r || r.type === 'visitor' || r.settled) return;
  for (const [id, rel] of Object.entries(state.relationships)) {
    if (rel.status !== 'active' || !state.people[id]?.alive || state.people[id]!.cityId !== r.homeCityId) continue;
    const before = rel.affection;
    rel.affection = clampInt(before - content.balance.travel.distanceAffection, 0, 100);
    state.travel.totals.distanceLost += before - rel.affection;
  }
  if (state.currentYear < r.endYear && (r.type !== 'student' || state.education.current?.program === 'college') && state.housing.kind !== 'incarcerated') return;
  const d = content.destinations[r.destinationId]!;
  const extra = r.type === 'student' ? content.balance.travel.exchange[r.route === 'semester' ? 'semesterGain' : 'yearGain'] : 0;
  state.travel.totals.immersion += gainLanguage(state.character.languages, d.languageId, extra, state.currentYear);
  writeFromGroup(state, { importance: 2, variants: content.text.travel.returned }, ['travel', 'returned'], { values: travelValues(state, content) }, content);
  // Work on the host permit ends at home; transfers retain the job and get home-office colleagues.
  if (r.route === 'working_holiday') {
    if (state.career.job) endJob(state, 'moved', content);
    state.career.gig = false;
  }
  const jailed = state.housing.kind === 'incarcerated';
  for (const p of Object.values(state.people)) if (p.alive && (p.life?.care === 'home' || livesWithYou(state, p.id))) p.cityId = r.homeCityId;
  state.character.cityId = r.homeCityId;
  if (jailed) state.housing.cityId = r.homeCityId;
  else {
    state.housing = { ...r.homeHousing! };
    const partner = state.housing.partnerId;
    if (partner && (!state.people[partner]?.alive || state.people[partner]!.cityId !== r.homeCityId || !isPartnerKind(state.relationships[partner]!.kind))) delete state.housing.partnerId;
    refreshHousingCost(state, content);
  }
  state.travel.residence = null; state.travel.totals.returns++;
  lapseMoved(state, content);
  changeOffice(state, content);
}
/** Exchanges remain enrolled with their home institution: no second degree or host tuition system. */
export function educationCountry(state: LifeState, content: ContentBundle) {
  return countryOfCity(state.travel.residence?.type === 'student' ? state.travel.residence.homeCityId : state.character.cityId, content);
}
