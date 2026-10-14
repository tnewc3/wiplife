/**
 * The legal routes (W6): what each asks, what it costs, how long it takes and the odds. Entry routes are work
 * sponsorship, study that leads to work, family (a spouse, partner or parent who is a citizen of the country) and
 * investment; after them come permanent residence and citizenship, and for someone without papers the uncertain
 * ways to status. Every number is in balance/immigration.yaml; this file only reads it.
 */
import type { ContentBundle, CountryId, RegularizationBasis, RouteId, Tier } from '../../content/schemas';
import { activeJob, levelPay, meetsJobRequirements, yearsInTrack } from '../career';
import { citiesOfCountry, countryIdOfCity } from '../country';
import { finishedHighSchool, validTarget } from '../education';
import { spend, earn } from '../finance';
import { isIncarcerated, onProbation } from '../legal';
import { languageSkill } from '../languages';
import { countedRecord } from '../record';
import type { Id, LifeState } from '../types';
import type { Application } from './types';
import { isCitizenOf, livingCountry, onTemporaryStay } from './query';

export interface EntryInput {
  route: RouteId;
  countryId: CountryId;
  cityId: Id;
  majorId?: Id;
  tier?: Tier;
}

/** Your best skill (0–100) in any official language of a country. */
export function countryLanguageSkill(state: LifeState, countryId: CountryId, content: ContentBundle): number {
  const official = content.countries[countryId]?.languages.official ?? [];
  return Math.max(0, ...official.map((id) => languageSkill(state.character.languages, id)));
}

/** A conviction (not a warning) within this many years. */
function convictedWithin(state: LifeState, years: number, content: ContentBundle, prisonOnly: boolean): boolean {
  return countedRecord(state, content).some((r) => (prisonOnly ? r.outcome === 'jail' : r.outcome !== 'warning') && state.currentYear - r.year <= years);
}

export const denialKey = (kind: string, what: string, countryId: CountryId): string => `${kind}:${what}:${countryId}`;
const deniedThisYear = (state: LifeState, key: string): boolean => state.migration.denied[key] === state.currentYear;

/** Countries where you cannot apply: citizens do not need to, and a removal bars you for years. */
export function barredFrom(state: LifeState, countryId: CountryId, content: ContentBundle): 'citizen' | 'removed' | null {
  if (isCitizenOf(state.character.citizenships, countryId)) return 'citizen';
  const removed = state.migration.removed[countryId];
  if (removed !== undefined && state.currentYear - removed < content.balance.immigration.banYears) return 'removed';
  return null;
}

/** A relative who is a citizen of the country and lives there, and could sponsor you. */
export function sponsorFor(state: LifeState, countryId: CountryId, content: ContentBundle): Id | null {
  const kinds = content.balance.immigration.eligibility.family.kinds;
  const options = Object.values(state.relationships)
    .filter((r) => r.status === 'active' && kinds.includes(r.kind))
    .filter((r) => {
      const p = state.people[r.personId];
      return !!p && p.alive && p.citizenships.includes(countryId) && countryIdOfCity(p.cityId, content) === countryId && state.currentYear - p.birthYear >= content.balance.relationships.adultAge;
    })
    .sort((a, b) => b.affection - a.affection || (a.personId < b.personId ? -1 : 1));
  return options[0]?.personId ?? null;
}

/** The job in the country that would sponsor you: your own track if it can be sponsored, else the best-paid one you qualify for. */
export function sponsoredJob(state: LifeState, countryId: CountryId, content: ContentBundle): Id | null {
  const e = content.balance.immigration.eligibility.work_sponsor;
  const city = citiesOfCountry(countryId, content)[0];
  if (!city) return null;
  const view: LifeState = { ...state, character: { ...state.character, cityId: city } };
  const fits = (id: Id): boolean => {
    const def = activeJob(content, id);
    return !!def && e.categories.includes(def.category) && meetsJobRequirements(view, def, content);
  };
  const own = [state.career.job?.jobId, ...[...state.career.history].reverse().map((h) => h.jobId)].filter((id): id is Id => !!id).find(fits);
  if (own) return own;
  const options = Object.keys(content.jobs).sort().filter(fits);
  if (options.length === 0) return null;
  return options.map((id) => ({ id, pay: levelPay(view, content.jobs[id]!, 1, content) })).sort((a, b) => b.pay - a.pay || (a.id < b.id ? -1 : 1))[0]!.id;
}

/** Work experience in jobs that can be sponsored, in years. */
function sponsorableYears(state: LifeState, content: ContentBundle): number {
  const e = content.balance.immigration.eligibility.work_sponsor;
  const ids = new Set([...state.career.history.map((h) => h.jobId), ...(state.career.job ? [state.career.job.jobId] : [])]);
  return [...ids].filter((id) => e.categories.includes(content.jobs[id]?.category ?? '')).reduce((n, id) => n + yearsInTrack(state, id), 0);
}

function bestEducationBonus(state: LifeState, content: ContentBundle): number {
  const table = content.balance.immigration.odds.education;
  return Math.max(0, ...state.education.credentials.map((c) => table[c.type] ?? 0));
}

/** Shared odds factors: language, schooling, smarts, experience and a conviction. */
function bonuses(state: LifeState, countryId: CountryId, minLanguage: number, content: ContentBundle, work: boolean): number {
  const o = content.balance.immigration.odds;
  const language = Math.min(o.languageCap, o.languagePerPoint * Math.max(0, countryLanguageSkill(state, countryId, content) - minLanguage));
  const experience = work ? Math.min(o.experienceCap, o.experiencePerYear * sponsorableYears(state, content)) : 0;
  const record = convictedWithin(state, content.balance.immigration.eligibility.recordYears, content, false) ? o.record : 0;
  return language + bestEducationBonus(state, content) + o.smartsPerPoint * (state.character.stats.smarts - 50) + experience + record;
}

const clampOdds = (odds: number, content: ContentBundle): number => Math.max(content.balance.immigration.odds.min, Math.min(content.balance.immigration.odds.max, odds));

/** Your chance of approval for an entry route. */
export function entryOdds(state: LifeState, input: EntryInput, content: ContentBundle): number {
  const rules = content.balance.immigration.countries[input.countryId];
  const e = content.balance.immigration.eligibility;
  const base = rules[input.route].odds;
  const min = input.route === 'work_sponsor' ? e.work_sponsor.language : input.route === 'study_work' ? e.study_work.language : 0;
  if (input.route === 'family' || input.route === 'investment') {
    const record = convictedWithin(state, e.recordYears, content, false) ? content.balance.immigration.odds.record : 0;
    return clampOdds(base + record, content);
  }
  return clampOdds(base + bonuses(state, input.countryId, min, content, input.route === 'work_sponsor'), content);
}

/** What an entry application costs now (the fee) and holds (an investment's sum, returned if refused). */
export function entryCost(input: EntryInput, content: ContentBundle): { fee: number; held: number } {
  const rules = content.balance.immigration.countries[input.countryId];
  return { fee: rules[input.route].fee, held: input.route === 'investment' ? rules.investment.amount : 0 };
}

/** Why you cannot apply for this route now, or null. */
export function entryBlock(state: LifeState, input: EntryInput, content: ContentBundle): string | null {
  const b = content.balance.immigration;
  const e = b.eligibility;
  const rules = b.countries[input.countryId];
  const route = rules?.[input.route];
  if (!rules || !route || !route.available) return 'unavailable';
  if (state.character.age < b.minAge) return 'age';
  if (isIncarcerated(state) || onProbation(state)) return 'law';
  if (state.migration.application) return 'pending';
  if (onTemporaryStay(state)) return 'stay';
  const barred = barredFrom(state, input.countryId, content);
  if (barred) return barred;
  if (livingCountry(state, content) === input.countryId) return 'here';
  if (!citiesOfCountry(input.countryId, content).includes(input.cityId)) return 'city';
  if (deniedThisYear(state, denialKey('entry', input.route, input.countryId))) return 'denied';
  if (convictedWithin(state, e.recordYears, content, true)) return 'record';
  const { fee, held } = entryCost(input, content);
  if (state.finances.savings < fee + held) return 'money';
  const age = state.character.age;
  switch (input.route) {
    case 'work_sponsor': {
      const w = e.work_sponsor;
      if (age < w.minAge || age > w.maxAge) return 'age';
      if (state.education.current !== null) return 'school';
      const trained = state.education.credentials.some((c) => w.credentials.includes(c.type)) || sponsorableYears(state, content) >= w.experienceYears;
      if (!trained) return 'skills';
      if (countryLanguageSkill(state, input.countryId, content) < w.language) return 'language';
      if (sponsoredJob(state, input.countryId, content) === null) return 'job';
      return null;
    }
    case 'study_work': {
      const s = e.study_work;
      if (age < s.minAge || age > s.maxAge) return 'age';
      if (state.education.current !== null || state.education.admission !== null) return 'school';
      if (!finishedHighSchool(state)) return 'schooling';
      if (countryLanguageSkill(state, input.countryId, content) < s.language) return 'language';
      if (!input.majorId || !input.tier || !validTarget({ program: 'college', tier: input.tier, majorId: input.majorId }, content)) return 'program';
      return null;
    }
    case 'family': {
      if (age < e.family.minAge) return 'age';
      const sponsor = sponsorFor(state, input.countryId, content);
      if (sponsor === null) return 'sponsor';
      return state.people[sponsor]!.cityId === input.cityId ? null : 'city';
    }
    case 'investment':
      return age < e.investment.minAge ? 'age' : null;
  }
}

/** Starts an entry application: the fee (and an investment's sum) leaves your money now. Call after entryBlock is null. */
export function startEntry(state: LifeState, input: EntryInput, content: ContentBundle): void {
  const rules = content.balance.immigration.countries[input.countryId];
  const { fee, held } = entryCost(input, content);
  spend(state, fee + held, content);
  const app: Application = {
    kind: 'entry', route: input.route, countryId: input.countryId, cityId: input.cityId,
    sinceYear: state.currentYear, decisionYear: state.currentYear + rules[input.route].wait, status: 'pending',
    fee, odds: entryOdds(state, input, content),
  };
  if (held) app.invested = held;
  if (input.route === 'work_sponsor') app.jobId = sponsoredJob(state, input.countryId, content)!;
  if (input.route === 'study_work') { app.majorId = input.majorId!; app.tier = input.tier!; }
  if (input.route === 'family') app.sponsorId = sponsorFor(state, input.countryId, content)!;
  state.migration.application = app;
  bump(state, `applied:${input.route}:${input.countryId}`);
}

export function bump(state: LifeState, key: string, by = 1): void {
  state.migration.counts[key] = (state.migration.counts[key] ?? 0) + by;
}

/** A refused application returns what it held. */
export function refundHeld(state: LifeState, app: Application): void {
  if (app.invested) earn(state, app.invested);
}

// ---- Permanent residence ----

const spouseCitizen = (state: LifeState, countryId: CountryId, content: ContentBundle): boolean =>
  Object.values(state.relationships).some((r) => r.kind === 'spouse' && r.status === 'active' && !!state.people[r.personId]?.alive && state.people[r.personId]!.citizenships.includes(countryId) && countryIdOfCity(state.people[r.personId]!.cityId, content) === countryId);

export { spouseCitizen };

export function permanentBlock(state: LifeState, content: ContentBundle): string | null {
  const r = state.travel.residence;
  const b = content.balance.immigration;
  if (!r || !r.settled || (r.type !== 'student' && r.type !== 'temporary_worker')) return 'status';
  const countryId = livingCountry(state, content);
  const rules = b.countries[countryId];
  if (!rules.permanent.available) return 'unavailable';
  if (state.migration.application) return 'pending';
  if (deniedThisYear(state, denialKey('permanent', 'permanent', countryId))) return 'denied';
  const years = state.currentYear - (state.migration.arrivedYear ?? state.currentYear);
  const married = spouseCitizen(state, countryId, content);
  if (!married) {
    if (r.type === 'student') return 'student';
    if (years < rules.permanent.afterYears) return 'years';
    if (state.career.job === null) return 'job';
  }
  if (convictedWithin(state, 5, content, true)) return 'record';
  if (countryLanguageSkill(state, countryId, content) < b.eligibility.work_sponsor.language && !married) return 'language';
  if (state.finances.savings < rules.permanent.fee) return 'money';
  return null;
}

export function permanentOdds(state: LifeState, content: ContentBundle): number {
  const countryId = livingCountry(state, content);
  const rules = content.balance.immigration.countries[countryId];
  const married = spouseCitizen(state, countryId, content) ? 0.1 : 0;
  return clampOdds(rules.permanent.odds + married + bonuses(state, countryId, content.balance.immigration.eligibility.work_sponsor.language, content, false), content);
}

export function startPermanent(state: LifeState, content: ContentBundle): void {
  const countryId = livingCountry(state, content);
  const t = content.balance.immigration.countries[countryId].permanent;
  spend(state, t.fee, content);
  state.migration.application = { kind: 'permanent', countryId, sinceYear: state.currentYear, decisionYear: state.currentYear + t.wait, status: 'pending', fee: t.fee, odds: permanentOdds(state, content) };
  bump(state, `applied:permanent:${countryId}`);
}

// ---- Naturalization ----

/** Years of residence the country asks for; fewer if you are married to a citizen. */
export function naturalizationYears(state: LifeState, content: ContentBundle): number {
  const countryId = livingCountry(state, content);
  const n = content.balance.immigration.countries[countryId].naturalization;
  return spouseCitizen(state, countryId, content) ? n.marriedYears : n.years;
}

export function naturalizationBlock(state: LifeState, content: ContentBundle): string | null {
  const r = state.travel.residence;
  if (!r || !r.settled || r.type !== 'permanent_resident') return 'status';
  const countryId = livingCountry(state, content);
  const n = content.balance.immigration.countries[countryId].naturalization;
  if (!n.available) return 'unavailable';
  if (state.migration.application) return 'pending';
  if (deniedThisYear(state, denialKey('naturalization', 'citizenship', countryId))) return 'denied';
  if (state.currentYear - (state.migration.arrivedYear ?? state.currentYear) < naturalizationYears(state, content)) return 'years';
  if (countryLanguageSkill(state, countryId, content) < n.language) return 'language';
  if (convictedWithin(state, n.cleanYears, content, false)) return 'record';
  if (state.finances.savings < n.fee) return 'money';
  return null;
}

/** The chance of passing the citizenship test: the country's base, your smarts and language, preparing, and earlier failures. */
export function testOdds(state: LifeState, prepared: boolean, content: ContentBundle): number {
  const countryId = livingCountry(state, content);
  const o = content.balance.immigration.odds;
  const n = content.balance.immigration.countries[countryId].naturalization;
  const language = Math.min(o.languageCap, o.languagePerPoint * Math.max(0, countryLanguageSkill(state, countryId, content) - n.language));
  const married = spouseCitizen(state, countryId, content) ? o.married : 0;
  return clampOdds(n.odds + language + o.smartsPerPoint * (state.character.stats.smarts - 50) + (prepared ? o.prepare : 0) + married, content);
}

export function startNaturalization(state: LifeState, content: ContentBundle): void {
  const countryId = livingCountry(state, content);
  const n = content.balance.immigration.countries[countryId].naturalization;
  spend(state, n.fee, content);
  state.migration.testFails = 0;
  state.migration.application = { kind: 'naturalization', countryId, sinceYear: state.currentYear, decisionYear: state.currentYear + n.wait, status: 'pending', fee: n.fee, odds: testOdds(state, false, content) };
  bump(state, `applied:naturalization:${countryId}`);
}

// ---- Status for someone without papers ----

export function regularizationBlock(state: LifeState, basis: RegularizationBasis, content: ContentBundle): string | null {
  const r = state.travel.residence;
  if (!r || r.type !== 'undocumented') return 'status';
  const countryId = livingCountry(state, content);
  const rules = content.balance.immigration.countries[countryId].undocumented;
  if (state.migration.application) return 'pending';
  if (isIncarcerated(state)) return 'law';
  if (deniedThisYear(state, denialKey('regularization', basis, countryId))) return 'denied';
  const years = state.currentYear - (state.migration.arrivedYear ?? state.currentYear);
  const fee = basis === 'marriage' ? rules.marriage.fee : basis === 'long_residence' ? rules.longResidence.fee : content.balance.immigration.undocumented.ruleChange.fee;
  if (state.finances.savings < fee) return 'money';
  if (basis === 'marriage') return rules.marriage.available && spouseCitizen(state, countryId, content) ? null : 'spouse';
  if (basis === 'long_residence') return rules.longResidence.available && years >= rules.longResidence.years ? null : 'years';
  const w = content.balance.immigration.undocumented.ruleChange;
  return state.migration.ruleChangeUntil !== null && state.migration.ruleChangeUntil >= state.currentYear && years >= w.minYears ? null : 'window';
}

export function regularizationTerms(state: LifeState, basis: RegularizationBasis, content: ContentBundle): { fee: number; wait: number; odds: number } {
  const countryId = livingCountry(state, content);
  const rules = content.balance.immigration.countries[countryId].undocumented;
  const w = content.balance.immigration.undocumented.ruleChange;
  const t = basis === 'marriage' ? rules.marriage : basis === 'long_residence' ? rules.longResidence : { fee: w.fee, wait: 1, odds: w.odds };
  const record = convictedWithin(state, content.balance.immigration.eligibility.recordYears, content, false) ? content.balance.immigration.odds.record : 0;
  return { fee: t.fee, wait: t.wait, odds: clampOdds(t.odds + record, content) };
}

export function startRegularization(state: LifeState, basis: RegularizationBasis, content: ContentBundle): void {
  const countryId = livingCountry(state, content);
  const t = regularizationTerms(state, basis, content);
  spend(state, t.fee, content);
  state.migration.application = { kind: 'regularization', basis, countryId, sinceYear: state.currentYear, decisionYear: state.currentYear + t.wait, status: 'pending', fee: t.fee, odds: t.odds };
  state.migration.exposure += content.balance.immigration.undocumented.deportation.applying;
  bump(state, `applied:regularization:${countryId}`);
}
