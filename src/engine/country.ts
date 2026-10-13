/**
 * Countries (W4a, docs/expansion.md): the one place the engine asks which country a life is lived in and what that
 * country's rules are. The country follows the city (`city.countryId`), so a life has no country of its own to keep in
 * sync. Money is kept in one base currency and shown in the country's currency (`formatMoney`).
 *
 * Systems take their country-specific numbers from here: education, economy and the ledger, retirement, health costs,
 * the law, careers and creation read the country definition (src/content/countries) through these functions rather than
 * assuming the United States.
 */
import type { CountryDef, CountryId, ContentBundle, JobCategory, LegalAges } from '../content/schemas';
import type { Id, LifeState } from './types';

/** The country the game assumes when a city has gone missing from the content (every shipped city names one). */
export const DEFAULT_COUNTRY: CountryId = 'us';

/** The country a city is in. */
export function countryIdOfCity(cityId: Id, content: ContentBundle): CountryId {
  return content.cities[cityId]?.countryId ?? DEFAULT_COUNTRY;
}

/** The country's definition for a city. */
export function countryOfCity(cityId: Id, content: ContentBundle): CountryDef {
  return content.countries[countryIdOfCity(cityId, content)] ?? content.countries[DEFAULT_COUNTRY]!;
}

/** The country you live in now. */
export function countryOf(state: LifeState, content: ContentBundle): CountryDef {
  return countryOfCity(state.character.cityId, content);
}

/** The country you were born in. */
export function birthCountryOf(state: LifeState, content: ContentBundle): CountryDef {
  return countryOfCity(state.character.birthCityId, content);
}

/** The ids of the active cities of a country, in order. */
export function citiesOfCountry(countryId: CountryId, content: ContentBundle): Id[] {
  return Object.keys(content.cities)
    .filter((id) => content.cities[id]!.countryId === countryId && !content.cities[id]!.retired)
    .sort();
}

/**
 * The cities in the same country as `cityId` (including it), in order: where you can move, open a second shop or
 * buy a vacation home until emigration exists (W6).
 */
export function sameCountryCities(cityId: Id, content: ContentBundle): Id[] {
  return citiesOfCountry(countryIdOfCity(cityId, content), content);
}

/** Two cities are in the same country (moving between countries is emigration, W6). */
export function sameCountry(a: Id, b: Id, content: ContentBundle): boolean {
  return countryIdOfCity(a, content) === countryIdOfCity(b, content);
}

/** The countries that have at least one active city, in the order of the country files. */
export function activeCountries(content: ContentBundle): CountryDef[] {
  return Object.keys(content.countries)
    .sort()
    .map((id) => content.countries[id]!)
    .filter((c) => !c.retired && citiesOfCountry(c.id, content).length > 0);
}

/** A legal age in a city: the city's own, else the country's. */
export function legalAge(kind: keyof LegalAges, cityId: Id, content: ContentBundle): number {
  return content.cities[cityId]?.legalAges?.[kind] ?? countryOfCity(cityId, content).legalAges[kind];
}

/** A legal age where you live now. */
export function legalAgeOf(state: LifeState, kind: keyof LegalAges, content: ContentBundle): number {
  return legalAge(kind, state.character.cityId, content);
}

/** You are old enough, where you live, to drink, gamble, drive, hold a permit or marry. */
export function atLegalAge(state: LifeState, kind: keyof LegalAges, content: ContentBundle): boolean {
  return state.character.age >= legalAgeOf(state, kind, content);
}

/** A price or fee written at US prices (balance, event effects), at the price level of the country you live in, in whole base units. */
export function scaledAmount(state: LifeState, amount: number, content: ContentBundle): number {
  return Math.round(amount * countryOf(state, content).priceLevel);
}

/** Pay for a job where you live: the country's pay for its category and for the job itself, around the city's multiplier. */
export function jobPayFactor(state: LifeState, jobId: Id, category: JobCategory, content: ContentBundle): number {
  const jobs = countryOf(state, content).jobs;
  return jobs.salaryByCategory[category] * (jobs.salaryByJob[jobId] ?? 1);
}

/** What a medical bill of this kind costs you yourself in this country (the rest is the health system's). */
export function healthShare(state: LifeState, kind: keyof CountryDef['healthcare']['shares'], content: ContentBundle): number {
  return countryOf(state, content).healthcare.shares[kind];
}

/** The rate and symbol that show base-currency amounts in a country's currency. */
export interface MoneyDisplay {
  code: string;
  symbol: string;
  /** Units of this currency per base-currency unit. */
  rate: number;
  locale: string;
  /** "dollar" and "dollars", for text. */
  name: string;
  plural: string;
}

/** How to show a country's money. */
export function moneyDisplay(country: CountryDef, content: ContentBundle): MoneyDisplay {
  const c = country.currency;
  return { code: c.code, symbol: c.symbol, rate: content.balance.countries.exchangeRates[c.code] ?? 1, locale: c.locale, name: c.name, plural: c.plural };
}

/** How to show the money of the country you live in. */
export function moneyDisplayOf(state: LifeState, content: ContentBundle): MoneyDisplay {
  return moneyDisplay(countryOf(state, content), content);
}

/** The base-currency amount in local units, rounded to whole units (the amount a player reads). */
export function toLocal(amount: number, display: MoneyDisplay): number {
  return Math.round(amount * display.rate);
}

/** "$12,300" or "−£500": a base-currency amount in the display currency. */
export function formatMoney(amount: number, display: MoneyDisplay): string {
  const text = `${display.symbol}${Math.abs(toLocal(amount, display)).toLocaleString(display.locale)}`;
  return amount < 0 && toLocal(amount, display) !== 0 ? `−${text}` : text;
}

/** An amount written at US prices in content, as the player reads it where they live: scaled to the price level, then shown in local currency. */
export function priceText(state: LifeState, amount: number, content: ContentBundle): string {
  return formatMoney(scaledAmount(state, amount, content), moneyDisplayOf(state, content));
}

/** The retirement benefit rules where you live (countries/*.yaml pension). */
export function pensionOf(state: LifeState, content: ContentBundle): CountryDef['pension'] {
  return countryOf(state, content).pension;
}

/** The age the retirement benefit starts where you live. */
export function pensionAge(state: LifeState, content: ContentBundle): number {
  return pensionOf(state, content).age;
}

/** How often a random life starts in each country that has a city (balance/countries.yaml startWeights); a country with no weight or no city never starts one. */
export function startWeights(content: ContentBundle): Record<string, number> {
  const out: Record<string, number> = {};
  for (const country of activeCountries(content)) out[country.id] = content.balance.countries.startWeights[country.id] ?? 0;
  return Object.values(out).some((w) => w > 0) ? out : { [DEFAULT_COUNTRY]: 1 };
}

/** The multiplier on a care cost written at US prices: your city's cost of living × the share of care you pay yourself in this country. */
export function careScale(state: LifeState, content: ContentBundle): number {
  return (content.cities[state.character.cityId]?.costOfLiving ?? 1) * healthShare(state, 'care', content);
}

/** The multiplier on a medical cost of this kind written at US prices: your city's cost of living × the share you pay yourself. */
export function medicalScale(state: LifeState, kind: keyof CountryDef['healthcare']['shares'], content: ContentBundle): number {
  return (content.cities[state.character.cityId]?.costOfLiving ?? 1) * healthShare(state, kind, content);
}

/**
 * The multiplier on a medical cost written at US prices that is not scaled by city (a condition's treatment and
 * yearly costs): the country's price level × the share of that kind of bill you pay yourself.
 */
export function medicalPrice(state: LifeState, kind: keyof CountryDef['healthcare']['shares'], content: ContentBundle): number {
  return countryOf(state, content).priceLevel * healthShare(state, kind, content);
}

/**
 * The words of the country you live in that text may use: {country} ("Canada"), {countryAdj} ("Canadian"),
 * {currency} (the plural, "dollars"), {elementarySchool}, {middleSchool}, {highSchool}, {college} ("university"),
 * {principal}, {entranceExam}, {leavingExam}, {pension} (the retirement benefit's name), {gradeWord}, and what school and
 * college award: {diploma}, {equivalency}, {associateDegree}, {bachelorDegree}.
 */
export const COUNTRY_TEXT_VALUES = ['country', 'countryAdj', 'currency', 'elementarySchool', 'middleSchool', 'highSchool', 'college', 'principal', 'entranceExam', 'leavingExam', 'pension', 'gradeWord', 'diploma', 'equivalency', 'associateDegree', 'bachelorDegree'] as const;

/** A word as it reads inside a sentence: "Associate degree" becomes "associate degree", "GED" and "A-levels" stay as they are. */
function sentenceWord(word: string): string {
  return /^[A-Z][a-z]/.test(word) ? word.charAt(0).toLowerCase() + word.slice(1) : word;
}

export function countryTextValues(state: LifeState, content: ContentBundle): Record<(typeof COUNTRY_TEXT_VALUES)[number], string> {
  const country = countryOf(state, content);
  const w = country.words;
  return {
    country: country.name,
    countryAdj: country.adjective,
    currency: country.currency.plural,
    elementarySchool: w.elementary,
    middleSchool: w.middle,
    highSchool: w.high,
    college: w.college,
    principal: w.principal,
    entranceExam: w.exams.entrance,
    leavingExam: w.exams.leaving,
    pension: country.pension.name,
    gradeWord: w.gradeWord,
    diploma: sentenceWord(w.credentials.hs_diploma),
    equivalency: sentenceWord(w.credentials.ged),
    associateDegree: sentenceWord(w.credentials.associate),
    bachelorDegree: sentenceWord(w.credentials.bachelor),
  };
}
