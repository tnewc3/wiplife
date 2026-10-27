/**
 * The retirement benefit (docs/design.md, section J), like Social Security in the United States (each country's own rules are in countries/*.yaml pension):
 * every year of earned income is recorded, and from the retirement age the
 * ledger pays a yearly benefit based on how many years you earned and your
 * average yearly earnings. Numbers come from the country you live in
 * (src/content/countries/*.yaml pension).
 *
 * The record counts whatever the ledger calls earned income (yearIncome in
 * ./systems/career.ts): gig pay and salaries (and pay from a job lost as the year began), so
 * every income source feeds the same calculation.
 */
import type { ContentBundle, CountryDef } from '../content/schemas';
import { countryIdOfCity, pensionOf } from './country';
import { wholeDollars } from './finance';
import type { LifeState } from './types';

/** Adds a year's earned income to the record (and to the country it was earned in), if it is enough to count. */
export function recordEarnings(state: LifeState, earned: number, content: ContentBundle): void {
  const { creditIncome, earningsCap } = pensionOf(state, content);
  if (earned < creditIncome) return;
  const counted = wholeDollars(Math.min(earned, earningsCap));
  const e = state.finances.earnings;
  e.years += 1;
  e.total = wholeDollars(e.total + counted);
  // Batch 10: each country keeps the years earned within it.
  const row = (e.byCountry[countryIdOfCity(state.character.cityId, content)] ??= { years: 0, total: 0 });
  row.years += 1;
  row.total = wholeDollars(row.total + counted);
}

/** Average yearly earnings over the years that count (0 with none). */
export function averageEarnings(state: LifeState): number {
  const { years, total } = state.finances.earnings;
  return years > 0 ? Math.round(total / years) : 0;
}

/** One country's share of a retirement record (Batch 10): what its own years earn under its own rules. */
export interface PensionShare {
  countryId: string;
  /** Years of earned income credited in this country. */
  years: number;
  /** Average yearly earnings over those years. */
  average: number;
  /** The age its benefit starts. */
  age: number;
  /** The yearly benefit its years earn (0 when it pays nothing: too few years even with the others' counted). */
  yearly: number;
  /** Paid out now: you have reached its age. */
  receiving: boolean;
}

function formulaBenefit(pension: CountryDef['pension'], years: number, average: number): number {
  let full = 0;
  pension.formula.forEach((slice, i) => {
    const top = pension.formula[i + 1]?.from ?? Infinity;
    const counted = Math.min(average, top) - slice.from;
    if (counted > 0) full += counted * slice.rate;
  });
  return wholeDollars(full * Math.min(1, years / pension.fullYears));
}

/**
 * The retirement record by country (Batch 10 portability model; numbers in balance/countries.yaml pensionPortability). Each country
 * pays for its own credited years by its own formula from its own pension age. Years elsewhere count toward its minimum years
 * when `totalize` is on, never toward the amount. Someone living in another country gets `abroadShare` of what it pays.
 */
export function pensionShares(state: LifeState, content: ContentBundle): PensionShare[] {
  const rules = content.balance.countries.pensionPortability;
  const { years: totalYears, byCountry } = state.finances.earnings;
  const home = countryIdOfCity(state.character.cityId, content);
  return Object.keys(byCountry).sort().flatMap((countryId) => {
    const row = byCountry[countryId]!;
    const country = content.countries[countryId];
    if (!country || row.years <= 0) return [];
    const pension = country.pension;
    const average = Math.round(row.total / row.years);
    const eligible = row.years >= rules.minOwnYears && (row.years >= pension.minYears || (rules.totalize && totalYears >= pension.minYears));
    const yearly = eligible ? wholeDollars(formulaBenefit(pension, row.years, average) * (countryId === home ? 1 : rules.abroadShare)) : 0;
    return [{ countryId, years: row.years, average, age: pension.age, yearly, receiving: yearly > 0 && state.character.age >= pension.age }];
  });
}

/** The yearly benefit your whole record earns once every country's age is reached. Doesn't check your age (see retirementBenefit). */
export function benefitFromRecord(state: LifeState, content: ContentBundle): number {
  return wholeDollars(pensionShares(state, content).reduce((sum, share) => sum + share.yearly, 0));
}

/** This year's benefit: what each country pays whose pension age you have reached. */
export function retirementBenefit(state: LifeState, content: ContentBundle): number {
  return wholeDollars(pensionShares(state, content).reduce((sum, share) => sum + (share.receiving ? share.yearly : 0), 0));
}
