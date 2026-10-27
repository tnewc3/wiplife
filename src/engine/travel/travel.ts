import { onTemporaryStay } from '../migration/query';
import { lapseMoved } from '../belonging/leave';
import { hasBusinessJob } from './query';
/** W5 orchestrates finance, education, careers, people and language; those systems remain authoritative. */
import type { ContentBundle } from '../../content/schemas';
import { TRIP_ACTIVITIES, TRIP_BUDGETS, TRIP_STYLES, type Souvenir, type TripActivity, type TripStyle } from '../../content/schemas';
import { endJob, meetsJobRequirements, rollOpenings, staffWorkplace } from '../career';
import { countryIdOfCity, countryOfCity, moneyDisplayOf, formatMoney, scaledAmount } from '../country';
import { createPerson } from '../events/casting';
import { pickUnused } from '../creation/family';
import { fittingResults } from '../actions/result';
import { earn, spend, wholeDollars } from '../finance';
import { addValuable } from '../possessions/valuables';
import { valuablesOf } from '../possessions/query';
import { livesWithYou, relocateChildren } from '../family/household';
import { refreshHousingCost } from '../housing';
import { effectiveLanguages, gainLanguage, meetsLanguageJob } from '../languages';
import { onProbation } from '../legal';
import { clampInt, weightedPick } from '../random';
import { currentPartner, isPartnerKind } from '../relationships';
import { chance, pick } from '../rng';
import { applyStatEffects } from '../systems/economy';
import { writeFromGroup } from '../systems/history';
import type { LifeState } from '../types';
import type { TripBudget, Residence, TravelContext } from './types';

export interface TripInput {
  destinationId: string; budget: TripBudget; companions: string[];
  /** Batch 10: how the trip is taken (a vacation when left out), what you do, and what you bring back. */
  style?: TripStyle; activity?: TripActivity; souvenir?: Souvenir;
}
/** Batch 10: a family on a temporary stay when `family` is set (your partner and the children who live with you). */
export interface StayInput { destinationId: string; route: Residence['route']; family?: boolean }
export const tripStyleOf = (input: Pick<TripInput, 'style'>): TripStyle => input.style ?? 'vacation';
export const tripSouvenirOf = (input: Pick<TripInput, 'souvenir'>): Souvenir => input.souvenir ?? 'none';
export function destinations(content: ContentBundle) {
  return Object.values(content.destinations).filter((d) => !d.retired).sort((a, b) => a.name.localeCompare(b.name));
}
export function travelCompanions(state: LifeState) {
  return Object.values(state.relationships).filter((r) => r.status === 'active' && state.people[r.personId]?.alive && state.people[r.personId]!.cityId === state.character.cityId && ['partner', 'fiance', 'spouse', 'friend', 'parent', 'sibling', 'child', 'stepparent', 'stepchild', 'grandchild'].includes(r.kind)).map((r) => r.personId).sort();
}
/** Batch 10: your spouse, while a honeymoon is still due: married in the last few years (the wedding leaves a memory) and none taken yet. */
export function honeymoonSpouse(state: LifeState, content: ContentBundle): string | null {
  const within = content.balance.travel.styles.honeymoon.withinYears;
  for (const id of travelCompanions(state)) {
    const rel = state.relationships[id]!;
    if (rel.kind !== 'spouse' || rel.memories.some((m) => m.tag === 'honeymoon_together')) continue;
    if (rel.memories.some((m) => m.tag === 'married_you' && state.currentYear - m.year <= within)) return id;
  }
  return null;
}
/** Friends you can take on a group trip. */
export function groupFriends(state: LifeState): string[] {
  return travelCompanions(state).filter((id) => state.relationships[id]!.kind === 'friend');
}
export function tripCost(input: TripInput, content: ContentBundle): number {
  const d = content.destinations[input.destinationId];
  if (!d) return 0;
  const t = content.balance.travel;
  const style = tripStyleOf(input);
  const party = 1 + input.companions.length * t.companionCostShare;
  // A business trip is paid by the employer; what you do there and what you bring back is yours.
  const booking = style === 'business' ? 0 : t.budgets[input.budget].cost * d.costLevel * t.styles[style].costFactor * party;
  const activity = input.activity ? t.activities[input.activity].extra * d.costLevel * party : 0;
  const souvenir = tripSouvenirOf(input) === 'none' ? 0 : t.souvenirs[tripSouvenirOf(input) as Exclude<Souvenir, 'none'>].cost * d.costLevel;
  return wholeDollars(booking + activity + souvenir);
}
/** What the employer pays you for a business trip's days away, at where you live. */
export function perDiem(state: LifeState, content: ContentBundle): number {
  return wholeDollars(scaledAmount(state, content.balance.travel.styles.business.perDiem, content));
}
function travelBlockedNow(state: LifeState, content: ContentBundle): boolean {
  return state.character.age < content.balance.travel.minAge || state.housing.kind === 'incarcerated' || onProbation(state) || onTemporaryStay(state) || Boolean(state.later.terminal) || Boolean(state.housing.assisted);
}
export function canTravel(state: LifeState, content: ContentBundle): boolean {
  return !travelBlockedNow(state, content) && state.travel.tripYear !== state.currentYear;
}
/** Batch 10: why a trip cannot be taken in this style (null when it can): the style's own rules, the activity and the souvenir. */
export function tripBlock(state: LifeState, input: TripInput, content: ContentBundle): string | null {
  const d = content.destinations[input.destinationId];
  const t = content.balance.travel;
  const style = tripStyleOf(input);
  if (!d || d.retired || d.cityId === state.character.cityId) return 'destination';
  if (!TRIP_STYLES.includes(style) || !TRIP_BUDGETS.includes(input.budget)) return 'input';
  if ((d.kind === 'cruise') !== (style === 'cruise')) return 'destination';
  if (travelBlockedNow(state, content)) return 'unavailable';
  if (style === 'business' ? state.travel.businessYear === state.currentYear : state.travel.tripYear === state.currentYear) return 'year';
  if (input.companions.length > t.maxCompanions || new Set(input.companions).size !== input.companions.length || !input.companions.every((id) => travelCompanions(state).includes(id))) return 'companions';
  if (style === 'honeymoon') {
    const spouse = honeymoonSpouse(state, content);
    if (spouse === null || input.companions.length !== 1 || input.companions[0] !== spouse) return 'honeymoon';
  } else if (style === 'group') {
    const friends = groupFriends(state);
    if (input.companions.length < t.styles.group.minFriends || !input.companions.every((id) => friends.includes(id))) return 'group';
  } else if (style === 'business') {
    if (!hasBusinessJob(state, content) || input.companions.length > 0 || content.events[content.registries.travel.style.business![0]!] === undefined) return 'business';
  }
  if (input.activity !== undefined && (!TRIP_ACTIVITIES.includes(input.activity) || state.character.age < t.activities[input.activity].minAge)) return 'activity';
  const souvenir = tripSouvenirOf(input);
  if (souvenir === 'valuable' && (!d.souvenir || !content.valuables[d.souvenir] || valuablesOf(state).length >= content.balance.possessions.limits.valuables)) return 'souvenir';
  if (state.finances.savings < tripCost(input, content)) return 'money';
  return null;
}
export function canPlanTrip(state: LifeState, input: TripInput, content: ContentBundle): boolean {
  return tripBlock(state, input, content) === null;
}
/** Stays are solo unless a family comes along (Batch 10): then your partner and the children who live with you come too. */
export function stayFamily(state: LifeState, content: ContentBundle): { partnerId: string | null; childIds: string[] } {
  const partnerId = state.housing.partnerId;
  const partner = partnerId !== undefined && state.people[partnerId]?.alive && isPartnerKind(state.relationships[partnerId]?.kind ?? 'ex') && state.people[partnerId]!.cityId === state.character.cityId ? partnerId : null;
  const childIds = Object.values(state.people).filter((p) => p.alive && livesWithYou(state, p.id) && state.currentYear - p.birthYear < content.balance.relationships.adultAge).map((p) => p.id).sort();
  return { partnerId: partner, childIds };
}
export function stayCost(state: LifeState, input: StayInput, content: ContentBundle): number {
  const study = input.route === 'semester' || input.route === 'year';
  const base = study ? content.balance.travel.exchange.cost : content.balance.travel.work.cost;
  const family = input.family ? stayFamily(state, content) : null;
  const members = family ? (family.partnerId ? 1 : 0) + family.childIds.length : 0;
  return wholeDollars(base * (1 + members * content.balance.travel.family.costShare));
}
/** Stays are solo; a dependent's housing cannot silently move or leave them unattended, unless the family comes along. */
export function stayBlock(state: LifeState, input: StayInput, content: ContentBundle): string | null {
  const d = content.destinations[input.destinationId];
  // W6: someone who moved to a country for good (and is not its citizen) cannot also start a temporary stay somewhere else: their permit would be lost.
  if (!canTravel(state, content) || state.travel.residence !== null) return 'unavailable';
  if (!d?.cityId || d.retired || countryIdOfCity(d.cityId, content) === countryIdOfCity(state.character.cityId, content)) return 'destination';
  if (!['renting', 'with_parents'].includes(state.housing.kind)) return 'household';
  const family = stayFamily(state, content);
  const minors = family.childIds.length;
  if (state.housing.guardianId || Object.values(state.people).some((p) => p.alive && p.life?.care === 'home')) return 'household';
  if (input.family) {
    // Batch 10: a partner and the children who live with you come along (the partner stays behind only if they are not with you).
    if (state.housing.kind === 'with_parents') return 'household';
    if (minors > content.balance.travel.family.maxChildren) return 'household';
    if (family.partnerId === null && minors === 0) return 'family';
  } else if (minors > 0) return 'household';
  if (state.business.items.length || state.crime.crew || state.fame.active || state.sports.pro) return 'commitment';
  if (input.route === 'semester' || input.route === 'year') {
    if (state.education.current?.program !== 'college' || state.career.job !== null) return 'college';
    if (state.finances.savings < stayCost(state, input, content)) return 'money';
    return null;
  }
  if (state.education.current !== null) return 'school';
  if (input.route === 'working_holiday') {
    if (state.character.age > content.balance.travel.work.holidayMaxAge || state.career.job !== null || state.career.retired) return 'holiday';
  } else if (input.route === 'transfer') {
    const job = state.career.job && content.jobs[state.career.job.jobId];
    if (!job || !meetsLanguageJob(effectiveLanguages(state, content), job, d.cityId, content)) return 'job';
  } else return 'route';
  return state.finances.savings < stayCost(state, input, content) ? 'money' : null;
}
function rememberDestination(state: LifeState, destinationId: string): void {
  const t = state.travel.totals;
  t.destinations[destinationId] = (t.destinations[destinationId] ?? 0) + 1;
}
/**
 * Generate using the destination's existing name/language pools. Vacation-only encounters are fellow travelers, with a modeled home.
 * Batch 10: where the destination names a fitting name pool (`locals`), the person met there is someone from that place: names from
 * the pool, its language as a first language and English as a second.
 */
function encounter(state: LifeState, destinationId: string, romantic: boolean, content: ContentBundle): string | null {
  const home = state.character.cityId;
  const d = content.destinations[destinationId]!;
  const cities = Object.keys(content.cities).filter((id) => id !== home && !content.cities[id]!.retired).sort();
  state.character.cityId = d.cityId ?? pick(state.rng, cities);
  const id = createPerson(state, { kind: 'acquaintance', presence: 'anywhere', age: { min: content.balance.travel.minAge, max: content.balance.events.newPerson.maxAge }, ...(romantic ? { romantic: true } : {}) }, state.rng, content);
  state.character.cityId = home;
  if (id) {
    const person = state.people[id]!;
    person.tags.push('met_abroad');
    if (d.locals) localize(state, id, d, content);
    state.travel.totals.encounters++;
  }
  return id;
}
/** A person met at a destination with a fitting name pool takes names, heritage and languages from that place. */
function localize(state: LifeState, id: string, d: ContentBundle['destinations'][string], content: ContentBundle): void {
  const person = state.people[id]!;
  const pool = content.names[d.locals!.pool]?.heritages[d.locals!.heritage];
  if (!pool) return;
  const category = person.identity.genderCategory;
  const used = new Set([state.character.name.first, ...Object.values(state.people).filter((p) => p.id !== id).map((p) => p.name.first)]);
  person.name = { first: pickUnused(state.rng, pool.first[category], used), last: pick(state.rng, pool.last) };
  person.heritage = d.locals!.heritage;
  const native = content.balance.languages.nativeSkill;
  person.languages = [{ id: d.languageId, skill: native, native: true, lastUsed: state.currentYear }];
  if (d.languageId !== 'en') person.languages.push({ id: 'en', skill: content.balance.languages.levels.conversational + 20, native: false, lastUsed: state.currentYear });
  person.languages.sort((a, b) => a.id.localeCompare(b.id));
}
function context(state: LifeState, kind: TravelContext['kind'], destinationId: string, companions: string[], content: ContentBundle, extra: Pick<TravelContext, 'style' | 'activity' | 'souvenir'> = {}): TravelContext {
  const encounterId = encounter(state, destinationId, false, content);
  const romanceId = kind === 'trip' && companions.length === 0 && extra.style !== 'business' && currentPartner(state) === null ? encounter(state, destinationId, true, content) : null;
  return { kind, ...extra, destinationId, companions, encounterId, romanceId };
}
export function travelCast(state: LifeState): Record<string, string> {
  const t = state.travel.active;
  const family = state.travel.residence?.family;
  return t ? { ...(t.encounterId ? { npc: t.encounterId } : {}), ...(t.romanceId ? { date: t.romanceId } : {}), ...(t.companions[0] ? { companion: t.companions[0] } : {}), ...(family?.partnerId ? { mate: family.partnerId } : {}), ...(family?.childIds[0] ? { kid: family.childIds[0] } : {}) } : {};
}
/** Queues one story: the options that fit, by weight, as a card after the others. */
function pushStory(state: LifeState, options: ReturnType<typeof fittingResults>, base: string, n: number): boolean {
  if (options.length === 0) return false;
  const def = weightedPick(state.rng, options);
  const log = state.eventLog[def.id];
  state.eventLog[def.id] = { count: (log?.count ?? 0) + 1, lastYear: state.currentYear };
  state.pending.push({ instanceId: `${base}-story${n}`, eventId: def.id, cast: travelCast(state) });
  return true;
}
/**
 * The cards a trip leaves: a cast-free receipt first (with the money), then up to two stories. Batch 10 tells the trip's kind first,
 * then what you did there, then what you brought back; a plain trip tells one of the general stories, as before.
 */
function result(state: LifeState, receiptId: string, pools: readonly (readonly string[])[], money: number, content: ContentBundle): void {
  const year = state.currentYear;
  const base = `a${year}-${state.inputLog.length}`;
  const receipt = fittingResults(state, [receiptId], {}, content);
  // Availability and content validation guarantee a cast-free receipt in every group.
  const def = receipt[0]![0];
  state.eventLog[def.id] = { count: (state.eventLog[def.id]?.count ?? 0) + 1, lastYear: year };
  state.pending = [{ instanceId: base, eventId: def.id, cast: {} }];
  state.phase = 'action';
  state.pending[0]!.money = { change: money, balance: state.finances.savings, debtChange: 0 };
  const cast = travelCast(state);
  let told = 0;
  for (const pool of pools) {
    if (told >= 2) break;
    // A story about people only fits when everyone it names is there (a family story needs the child, not just a partner).
    const fits = fittingResults(state, pool, cast, content).filter(([def]) => Object.entries(def.cast ?? {}).every(([role, spec]) => cast[role] !== undefined || spec.optional === true));
    if (pushStory(state, fits, base, told + 1)) told++;
  }
}
export function planTrip(state: LifeState, input: TripInput, content: ContentBundle): void {
  const t = content.balance.travel;
  const d = content.destinations[input.destinationId]!;
  const style = tripStyleOf(input);
  const souvenir = tripSouvenirOf(input);
  const cost = tripCost(input, content);
  spend(state, cost, content);
  if (style === 'business') state.travel.businessYear = state.currentYear;
  else state.travel.tripYear = state.currentYear;
  state.travel.totals.trips++; state.travel.totals.spent += cost;
  state.travel.totals.styles[style] = (state.travel.totals.styles[style] ?? 0) + 1;
  if (input.activity) state.travel.totals.activities[input.activity] = (state.travel.totals.activities[input.activity] ?? 0) + 1;
  if (souvenir !== 'none') state.travel.totals.souvenirs[souvenir] = (state.travel.totals.souvenirs[souvenir] ?? 0) + 1;
  rememberDestination(state, input.destinationId);
  const before = { ...state.character.stats };
  const effects = style === 'business' ? t.styles.business.effects : t.budgets[input.budget].effects;
  applyStatEffects(state, { happiness: { perYear: effects.happiness, limit: 100 }, stress: { perYear: effects.stress, limit: 0 } });
  if (style !== 'vacation' && style !== 'business') {
    const extra = t.styles[style].effects;
    applyStatEffects(state, { happiness: { perYear: extra.happiness, limit: 100 }, stress: { perYear: extra.stress, limit: 0 } });
  }
  if (input.activity) {
    const a = t.activities[input.activity];
    for (const [key, delta] of Object.entries(a.stats) as ['happiness' | 'smarts' | 'health' | 'looks' | 'stress', number][]) state.character.stats[key] = clampInt(state.character.stats[key] + delta, 0, 100);
  }
  if (souvenir !== 'none') {
    const s = t.souvenirs[souvenir];
    state.character.stats.happiness = clampInt(state.character.stats.happiness + s.happiness, 0, 100);
    if (souvenir === 'valuable') addValuable(state, d.souvenir!, wholeDollars(s.cost * d.costLevel), content);
  }
  state.travel.totals.happiness += state.character.stats.happiness - before.happiness;
  state.travel.totals.stress += state.character.stats.stress - before.stress;
  for (const id of input.companions) {
    const rel = state.relationships[id]!;
    const gain = style === 'honeymoon' ? t.styles.honeymoon.affection : style === 'group' ? t.styles.group.friendAffection : t.companionAffection;
    rel.affection = clampInt(rel.affection + gain, 0, 100);
    if (style === 'honeymoon') { rel.trust = clampInt(rel.trust + t.styles.honeymoon.trust, 0, 100); rel.memories.push({ tag: 'honeymoon_together', year: state.currentYear }); }
  }
  state.travel.totals.immersion += gainLanguage(state.character.languages, d.languageId, t.tripImmersion + (input.activity ? t.activities[input.activity].languageGain : 0), state.currentYear);
  if (input.activity === 'immersion') state.languages.totals.trip += t.activities.immersion.languageGain;
  // A business trip pays the day allowance (the employer paid the booking), and the work counts at the job.
  let money = -cost;
  if (style === 'business') {
    const pay = perDiem(state, content);
    earn(state, pay);
    state.travel.totals.perDiem += pay;
    money += pay;
    const job = state.career.job;
    if (job) job.performance = clampInt(job.performance + t.styles.business.performance, 0, 100);
  }
  state.travel.active = context(state, 'trip', input.destinationId, input.companions, content, { style, ...(input.activity ? { activity: input.activity } : {}), ...(souvenir !== 'none' ? { souvenir } : {}) });
  // W6: someone who moved for good keeps their own record while away; the trip is still within the year.
  if (state.travel.residence === null) state.travel.residence = { country: d.country, destinationId: d.id, type: 'visitor', route: 'vacation', startYear: state.currentYear, endYear: state.currentYear, homeCityId: state.character.cityId, homeHousing: { ...state.housing } };
  visitHome(state, input.destinationId, content);
  writeFromGroup(state, { importance: 2, variants: content.text.travel.vacation }, ['travel', 'trip'], { values: travelValues(state, content) }, content);
  const reg = content.registries.travel;
  const generic = reg.trips.slice(1);
  const pools: (readonly string[])[] = [];
  if (style !== 'vacation') pools.push(style === 'business' ? reg.style.business!.slice(1) : reg.style[style]!);
  if (input.activity) pools.push(reg.activity[input.activity]!);
  if (souvenir !== 'none') pools.push(reg.souvenir);
  // A plain trip tells a general story; a planned one sometimes does too.
  if (pools.length === 0 || chance(state.rng, t.genericStoryChance)) pools.push(generic);
  result(state, style === 'business' ? reg.style.business![0]! : reg.trips[0]!, pools, money, content);
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
  const cost = stayCost(state, input, content);
  const family = input.family ? stayFamily(state, content) : null;
  const residence: Residence = { country: d.country, destinationId: d.id, type: study ? 'student' : 'temporary_worker', route: input.route, startYear: state.currentYear, endYear: state.currentYear + (study ? 1 : content.balance.travel.work.years), homeCityId: state.character.cityId, homeHousing: { ...state.housing }, ...(family ? { family } : {}) };
  spend(state, cost, content);
  state.travel.residence = residence;
  state.travel.tripYear = state.currentYear;
  state.travel.totals.spent += cost;
  state.travel.totals[study ? 'study' : 'work']++;
  rememberDestination(state, d.id);
  state.character.cityId = d.cityId!;
  state.housing = { kind: 'renting', cityId: d.cityId!, annualCost: 0, since: state.currentYear };
  // Batch 10: the family comes along: your partner lives with you there, and your children go to school in the host city (their schooling follows the country you live in).
  if (family) {
    if (family.partnerId) { state.housing.partnerId = family.partnerId; state.people[family.partnerId]!.cityId = d.cityId!; }
    relocateChildren(state);
    state.travel.totals.familyStays++;
    state.travel.totals.familyMembers += (family.partnerId ? 1 : 0) + family.childIds.length;
  }
  refreshHousingCost(state, content);
  if (input.route === 'working_holiday') state.career.gig = true;
  lapseMoved(state, content);
  changeOffice(state, content);
  state.travel.active = context(state, study ? 'study' : 'work', d.id, [], content);
  writeFromGroup(state, { importance: 2, variants: content.text.travel.departed }, ['travel', study ? 'study' : 'work'], { values: travelValues(state, content) }, content);
  const reg = content.registries.travel;
  const list = reg[study ? 'study' : 'work'];
  result(state, list[0]!, family ? [reg.family, list.slice(1)] : [list.slice(1)], -cost, content);
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
  return { destination: d?.name ?? '', souvenir: content.valuables[d?.souvenir ?? '']?.name ?? '', destinationCountry: d?.country ?? '', endYear: String(r?.endYear ?? state.currentYear), homeCity: content.cities[r?.homeCityId ?? state.character.cityId]?.name ?? '', travelCost: formatMoney(state.travel.totals.spent, moneyDisplayOf(state, content)) };
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
  endStay(state, content);
}

/**
 * A temporary stay ends (W5): the planned return, or a forced one (an eviction abroad that sends you home to family).
 * You go back to the housing you left, with the language gains, and work on the host permit ends.
 */
export function endStay(state: LifeState, content: ContentBundle): void {
  const r = state.travel.residence;
  if (!r || r.type === 'visitor' || r.settled) return;
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
  // Batch 10: a partner who came along goes home with you if they are still your partner; an ex stays where they are.
  const came = r.family?.partnerId;
  if (came && state.people[came]?.alive && isPartnerKind(state.relationships[came]?.kind ?? 'ex')) state.people[came]!.cityId = r.homeCityId;
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
  // A job taken up during the stay may not be one this country lets you keep (found by the Batch 10 10,000-life run: a job got in Houston during a
  // transfer stay from Montreal needed French at home).
  const held = state.career.job && content.jobs[state.career.job.jobId];
  if (held && !meetsJobRequirements(state, held, content)) endJob(state, 'moved', content);
  changeOffice(state, content);
}
/** Exchanges remain enrolled with their home institution: no second degree or host tuition system. */
export function educationCountry(state: LifeState, content: ContentBundle) {
  return countryOfCity(state.travel.residence?.type === 'student' ? state.travel.residence.homeCityId : state.character.cityId, content);
}
