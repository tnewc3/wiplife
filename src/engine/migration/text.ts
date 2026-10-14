/**
 * Values emigration events can use in their text (W6): {appCountry} and {appCity} (where an application is for),
 * {appFee} (its fee, in your money), {waitYears}, {originCity} and {originCountry} (where you came from), {permitEnd}
 * (the last year of your permit), {yearsHere} (whole years since you arrived), {sentHome} (money sent home so far),
 * {removedFrom} (the country that removed you), {localLanguage} (the main language where you live) and
 * {citizenOf} (the country you are a citizen of besides the one you live in, else the one you were born into).
 */
import type { ContentBundle } from '../../content/schemas';
import { countryIdOfCity, formatMoney, moneyDisplayOf } from '../country';
import type { LifeState } from '../types';

export const MIGRATION_TEXT_VALUES = ['newCity', 'appCountry', 'appCity', 'appFee', 'decisionYear', 'waitYears', 'originCity', 'originCountry', 'permitEnd', 'yearsHere', 'sentHome', 'removedFrom', 'localLanguage', 'citizenOf'] as const;

export function migrationTextValues(state: LifeState, content: ContentBundle): Record<(typeof MIGRATION_TEXT_VALUES)[number], string> {
  const m = state.migration;
  const app = m.application;
  const r = state.travel.residence;
  // (Money is formatted only when there is something to say: this runs for every card and line of text.)
  const display = app || m.remit.sent > 0 ? moneyDisplayOf(state, content) : null;
  const here = countryIdOfCity(state.character.cityId, content);
  const originCity = r?.settled ? r.homeCityId : state.character.birthCityId;
  const removed = Object.entries(m.removed).sort((a, b) => b[1] - a[1])[0]?.[0];
  const language = content.countries[here]?.languages.official[0];
  const other = state.character.citizenships.find((c) => c !== here) ?? state.character.citizenships[0]!;
  return {
    newCity: content.cities[state.character.cityId]?.name ?? '',
    appCountry: app ? (content.countries[app.countryId]?.name ?? '') : '',
    appCity: app?.cityId ? (content.cities[app.cityId]?.name ?? '') : '',
    appFee: app && display ? formatMoney(app.fee, display) : '',
    decisionYear: String(app?.decisionYear ?? state.currentYear),
    waitYears: String(app ? Math.max(1, app.decisionYear - app.sinceYear) : 1),
    originCity: content.cities[originCity]?.name ?? '',
    originCountry: content.countries[countryIdOfCity(originCity, content)]?.name ?? '',
    permitEnd: String(r?.endYear ?? state.currentYear),
    yearsHere: String(m.arrivedYear === null ? 0 : state.currentYear - m.arrivedYear),
    sentHome: m.remit.sent > 0 && display ? formatMoney(m.remit.sent, display) : '',
    removedFrom: removed ? (content.countries[removed as keyof typeof content.countries]?.name ?? '') : '',
    localLanguage: language ? (content.languages[language]?.name ?? '') : '',
    citizenOf: content.countries[other]?.name ?? '',
  };
}
