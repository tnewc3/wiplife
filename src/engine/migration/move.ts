/**
 * Moving between countries (W6): arriving on a legal route, moving without papers, going home, being removed, and
 * the permit changes that follow (a lapsed permit, a study permit that becomes a work permit, permanent residence).
 * One place changes the residence record, so every route ends in the same state.
 */
import type { ContentBundle, CountryId } from '../../content/schemas';
import { admit, leaveSchool } from '../education';
import { endJob, afterMove, startJob, meetsJobRequirements } from '../career';
import { citiesOfCountry, countryIdOfCity } from '../country';
import { spend } from '../finance';
import { canMoveInTogether, moveInCost, moveInTogether, moveTo, ownsHome, sellHome } from '../housing';
import { isIncarcerated, onProbation } from '../legal';
import { clampInt } from '../random';
import { writeFromGroup } from '../systems/history';
import type { Id, LifeState } from '../types';
import type { Residence } from '../travel/types';
import { addCitizenship } from './citizenship';
import { bump } from './routes';
import { livingCountry, onTemporaryStay } from './query';
import type { Application } from './types';

/** The destination record for a city (every playable city has one, W5). */
export function destinationOf(cityId: Id, content: ContentBundle): string {
  return Object.values(content.destinations).find((d) => d.cityId === cityId && !d.retired)?.id ?? '';
}

/** A business, crew, public career or pro team ties you to where you are (as for W5's stays). */
export function commitmentBlock(state: LifeState): boolean {
  return state.business.items.length > 0 || !!state.crime.crew || state.fame.active || !!state.sports.pro;
}

/** Why you cannot move across a border now, or null. */
export function moveBlock(state: LifeState, toCity: Id, content: ContentBundle): string | null {
  if (state.character.age < content.balance.immigration.minAge) return 'age';
  if (isIncarcerated(state) || onProbation(state)) return 'law';
  if (onTemporaryStay(state) || state.travel.active) return 'stay';
  if (state.later.terminal || state.housing.assisted) return 'care';
  if (commitmentBlock(state)) return 'commitment';
  if (state.finances.savings < moveInCost(state, toCity, content)) return 'money';
  return null;
}

function stats(state: LifeState, happiness: number, stress: number): void {
  const s = state.character.stats;
  s.happiness = clampInt(s.happiness + happiness, 0, 100);
  s.stress = clampInt(s.stress + stress, 0, 100);
}

function values(state: LifeState, content: ContentBundle, extra: Record<string, string> = {}): Record<string, string> {
  const r = state.travel.residence;
  return {
    newCity: content.cities[state.character.cityId]?.name ?? '',
    oldCity: content.cities[r?.homeCityId ?? state.character.birthCityId]?.name ?? '',
    newCountry: content.countries[livingCountry(state, content)]?.name ?? '',
    ...extra,
  };
}

/** Sells a home you own, moves you (and your partner and children who live with you) into a rental in the new city, and ends the job you leave. */
function relocate(state: LifeState, cityId: Id, content: ContentBundle): void {
  const from = state.character.cityId;
  spend(state, moveInCost(state, cityId, content), content);
  if (ownsHome(state)) sellHome(state, content);
  moveTo(state, 'renting', cityId, content);
  afterMove(state, from, content);
  state.career.gig = false;
}

function setResidence(state: LifeState, r: Omit<Residence, 'startYear' | 'endYear' | 'settled' | 'destinationId'> & { endYear?: number }, content: ContentBundle): void {
  const { endYear, ...rest } = r;
  state.travel.residence = { ...rest, destinationId: destinationOf(state.character.cityId, content), startYear: state.currentYear, endYear: endYear ?? state.currentYear, settled: true };
}

/** What an approved entry application turns into. */
function permitFor(route: NonNullable<Application['route']>, countryId: CountryId, content: ContentBundle): { type: Residence['type']; years: number } {
  const rules = content.balance.immigration.countries[countryId];
  if (route === 'work_sponsor') return { type: 'temporary_worker', years: rules.work_sponsor.stayYears };
  if (route === 'study_work') return { type: 'student', years: 8 };
  return { type: 'permanent_resident', years: 0 };
}

/** Moves you on the approval you hold. The caller checked moveBlock. */
export function emigrate(state: LifeState, content: ContentBundle): void {
  const app = state.migration.application!;
  const route = app.route!;
  const cityId = app.cityId!;
  const from = state.character.cityId;
  const origin = countryIdOfCity(from, content);
  relocate(state, cityId, content);
  const permit = permitFor(route, app.countryId, content);
  setResidence(state, { country: content.countries[app.countryId]!.name, type: permit.type, route, homeCityId: from, endYear: state.currentYear + permit.years }, content);
  state.migration.arrivedYear = state.currentYear;
  state.migration.application = null;
  bump(state, `arrived:${route}:${app.countryId}`);
  bump(state, `arrivedFrom:${origin}`);
  // The language may have faded since the offer: a job you no longer qualify for is not taken.
  if (route === 'work_sponsor' && app.jobId && meetsJobRequirements(state, content.jobs[app.jobId]!, content)) {
    // Moving for the sponsored job means leaving school if you have since enrolled (a job is not held in school).
    if (state.education.current) leaveSchool(state, 'droppedOut', content);
    startJob(state, app.jobId, content);
  }
  if (route === 'study_work' && app.majorId && app.tier) admit(state, { program: 'college', tier: app.tier, majorId: app.majorId }, content);
  if (route === 'family' && app.sponsorId && canMoveInTogether(state, app.sponsorId, content)) moveInTogether(state, app.sponsorId, content);
  stats(state, content.balance.immigration.settle.arrival.happiness, content.balance.immigration.settle.arrival.stress);
  writeFromGroup(state, { importance: 3, variants: content.text.immigration.arrived }, ['migration', 'arrived'], { values: values(state, content) }, content);
}

/**
 * A club in another country takes you: the move is made (the caller moved you), and the club arranges a work permit that runs a
 * little past the end of the deal. A citizen of the country holds no permit. Someone who already holds a permit there has it
 * extended, never shortened.
 */
export function settleForClub(state: LifeState, from: Id, untilYear: number, content: ContentBundle): void {
  const countryId = countryIdOfCity(state.character.cityId, content);
  if (state.character.citizenships.includes(countryId)) {
    // Home again (or a second citizenship): no permit to hold.
    if (state.travel.residence?.settled) {
      state.travel.residence = null;
      state.migration.arrivedYear = null;
      state.migration.undocumented = null;
      state.migration.application = null;
    }
    return;
  }
  const end = untilYear + content.balance.sports.world.abroad.permitYears;
  const r = state.travel.residence;
  if (r?.settled && r.country === content.countries[countryId]?.name && r.type !== 'undocumented') {
    if (r.type === 'temporary_worker' || r.type === 'student') state.travel.residence = { ...r, endYear: Math.max(r.endYear, end) };
    return;
  }
  state.migration.application = null;
  state.migration.undocumented = null;
  setResidence(state, { country: content.countries[countryId]?.name ?? '', type: 'temporary_worker', route: 'work_sponsor', homeCityId: from, endYear: end }, content);
  state.migration.arrivedYear = state.currentYear;
  bump(state, `arrived:work_sponsor:${countryId}`);
  bump(state, `arrivedFrom:${countryIdOfCity(from, content)}`);
  const s = content.balance.sports.world.abroad;
  stats(state, 0, s.stress);
}

/** Moves you without permission. The caller checked moveBlock and the cost; the sum is paid either way. Returns false if you were turned back. */
export function enterWithoutPapers(state: LifeState, cityId: Id, turnedBack: boolean, content: ContentBundle): boolean {
  const u = content.balance.immigration.undocumented;
  spend(state, u.entry.cost, content);
  const countryId = countryIdOfCity(cityId, content);
  bump(state, `entry:irregular:${countryId}`);
  if (turnedBack) {
    stats(state, -u.entry.hardship, u.entry.hardship);
    bump(state, `turnedBack:${countryId}`);
    writeFromGroup(state, { importance: 2, variants: content.text.immigration.turnedBack }, ['migration', 'turnedBack'], { values: { newCountry: content.countries[countryId]!.name } }, content);
    return false;
  }
  const from = state.character.cityId;
  relocate(state, cityId, content);
  setResidence(state, { country: content.countries[countryId]!.name, type: 'undocumented', route: 'irregular', homeCityId: from }, content);
  state.migration.arrivedYear = state.currentYear;
  state.migration.undocumented = { sinceYear: state.currentYear, origin: 'irregular', closeCalls: 0 };
  state.career.gig = true;
  bump(state, `arrived:irregular:${countryId}`);
  stats(state, content.balance.immigration.settle.arrival.happiness, content.balance.immigration.settle.arrival.stress);
  writeFromGroup(state, { importance: 3, variants: content.text.immigration.entry }, ['migration', 'entry'], { values: values(state, content) }, content);
  return true;
}

/** Your permit ends and you stay: regular work, loans and licenses close, informal work opens. */
export function becomeUndocumented(state: LifeState, content: ContentBundle): void {
  const r = state.travel.residence;
  if (!r || r.type === 'undocumented') return;
  if (state.career.job) endJob(state, 'moved', content);
  if (state.education.current) leaveSchool(state, 'droppedOut', content);
  state.travel.residence = { ...r, type: 'undocumented', route: 'overstay', startYear: state.currentYear, endYear: state.currentYear };
  state.migration.undocumented = { sinceYear: state.currentYear, origin: 'overstay', closeCalls: 0 };
  state.career.gig = true;
  bump(state, `overstay:${countryIdOfCity(state.character.cityId, content)}`);
  writeFromGroup(state, { importance: 3, variants: content.text.immigration.overstay }, ['migration', 'overstay'], { values: values(state, content) }, content);
}

/** Going home: only to a country whose citizen you are. Clears the permit record; a pending application lapses. */
export function returnBlock(state: LifeState, cityId: Id, content: ContentBundle): string | null {
  const countryId = countryIdOfCity(cityId, content);
  if (!state.character.citizenships.includes(countryId)) return 'citizen';
  if (livingCountry(state, content) === countryId) return 'here';
  if (!citiesOfCountry(countryId, content).includes(cityId)) return 'city';
  return moveBlock(state, cityId, content);
}

export function returnHome(state: LifeState, cityId: Id, content: ContentBundle): void {
  const r = state.travel.residence;
  const was = r?.type ?? 'citizen';
  const countryId = countryIdOfCity(cityId, content);
  relocate(state, cityId, content);
  state.travel.residence = null;
  state.migration.arrivedYear = null;
  state.migration.undocumented = null;
  state.migration.application = null;
  bump(state, `returned:${was}:${countryId}`);
  writeFromGroup(state, { importance: 3, variants: content.text.immigration.returned }, ['migration', 'returned'], { values: values(state, content) }, content);
}

/** You are removed: to a country whose citizen you are, with the household members who are not citizens of this one; a ban follows. */
export function removeFromCountry(state: LifeState, content: ContentBundle): void {
  const here = livingCountry(state, content);
  const r = state.travel.residence;
  const options = state.character.citizenships.filter((c) => c !== here);
  const target = options[0];
  if (!target) return;
  const city = r && countryIdOfCity(r.homeCityId, content) === target ? r.homeCityId : citiesOfCountry(target, content)[0]!;
  // Family who are citizens here stay: a partner, and children whose other parent is that partner.
  const partnerId = state.housing.partnerId;
  const partnerStays = !!partnerId && !!state.people[partnerId]?.citizenships.includes(here);
  if (partnerStays) {
    delete state.housing.partnerId;
    for (const p of Object.values(state.people)) {
      if (p.child && p.alive && p.cityId === state.character.cityId && p.child.custody === 'you' && p.child.otherParentId === partnerId && p.citizenships.includes(here)) p.child.custody = 'other';
    }
  }
  state.migration.removed[here] = state.currentYear;
  bump(state, `deported:${here}`);
  if (state.migration.undocumented) bump(state, `deportedUndocumented:${here}`);
  if (state.career.job) endJob(state, 'moved', content);
  if (ownsHome(state)) sellHome(state, content);
  // Removed from prison: the sentence is no longer served here (the legal state must say so as the housing does).
  if (state.housing.kind === 'incarcerated') delete state.legal.incarceratedUntil;
  moveTo(state, 'renting', city, content);
  afterMove(state, state.character.cityId, content);
  state.career.gig = false;
  state.travel.residence = null;
  state.migration.arrivedYear = null;
  state.migration.undocumented = null;
  state.migration.application = null;
  state.migration.ruleChangeUntil = null;
  stats(state, -8, 14);
  writeFromGroup(state, { importance: 3, variants: content.text.immigration.deported }, ['migration', 'deported'], { values: { newCity: content.cities[city]?.name ?? '', oldCountry: content.countries[here]?.name ?? '' } }, content);
}

/** Permanent residence is granted. */
export function grantPermanent(state: LifeState, content: ContentBundle): void {
  const r = state.travel.residence;
  if (!r) return;
  state.travel.residence = { ...r, type: 'permanent_resident', startYear: state.currentYear, endYear: state.currentYear };
  bump(state, `permanent:${livingCountry(state, content)}`);
  writeFromGroup(state, { importance: 3, variants: content.text.immigration.permanent }, ['migration', 'permanent'], { values: values(state, content) }, content);
}

/** Status is granted to someone without papers. */
export function grantRegularization(state: LifeState, content: ContentBundle): void {
  const r = state.travel.residence;
  if (!r) return;
  state.travel.residence = { ...r, type: 'permanent_resident', route: 'regularized', startYear: state.currentYear, endYear: state.currentYear };
  state.migration.undocumented = null;
  bump(state, `regularized:${livingCountry(state, content)}`);
  writeFromGroup(state, { importance: 3, variants: content.text.immigration.regularized }, ['migration', 'regularized'], { values: values(state, content) }, content);
}

/** The citizenship test is passed: you become a citizen, and the permit record ends (dual citizenship stays where the country allows it). */
export function grantCitizenship(state: LifeState, content: ContentBundle): void {
  const here = livingCountry(state, content);
  addCitizenship(state, here, content);
  state.travel.residence = null;
  const years = state.currentYear - (state.migration.arrivedYear ?? state.currentYear);
  bump(state, `citizen:${here}`);
  bump(state, `citizenYears:${here}`, years);
  writeFromGroup(state, { importance: 3, variants: content.text.immigration.citizen }, ['migration', 'citizen'], { values: values(state, content) }, content);
}
