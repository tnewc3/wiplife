/**
 * The retirement benefit (docs/design.md, section J), like Social Security:
 * every year of earned income is recorded, and from the retirement age the
 * ledger pays a yearly benefit based on how many years you earned and your
 * average yearly earnings. Numbers come from src/content/balance/economy.yaml
 * (retirement).
 *
 * The record counts whatever the ledger calls earned income (yearIncome in
 * ./systems/career.ts): gig pay and salaries (and pay from a job lost as the year began), so
 * every income source feeds the same calculation.
 */
import type { ContentBundle } from '../content/schemas';
import { wholeDollars } from './finance';
import type { LifeState } from './types';

/** Adds a year's earned income to the record, if it is enough to count. */
export function recordEarnings(state: LifeState, earned: number, content: ContentBundle): void {
  const { creditIncome, earningsCap } = content.balance.economy.retirement;
  if (earned < creditIncome) return;
  const e = state.finances.earnings;
  e.years += 1;
  e.total = wholeDollars(e.total + Math.min(earned, earningsCap));
}

/** Average yearly earnings over the years that count (0 with none). */
export function averageEarnings(state: LifeState): number {
  const { years, total } = state.finances.earnings;
  return years > 0 ? Math.round(total / years) : 0;
}

/**
 * The yearly benefit your record earns: the formula's slices of your
 * average earnings, times years ÷ fullYears (at most 1). Zero before
 * minYears. Doesn't check your age (see retirementBenefit).
 */
export function benefitFromRecord(state: LifeState, content: ContentBundle): number {
  const { minYears, fullYears, formula } = content.balance.economy.retirement;
  const { years } = state.finances.earnings;
  if (years < minYears) return 0;
  const average = averageEarnings(state);
  let full = 0;
  formula.forEach((slice, i) => {
    const top = formula[i + 1]?.from ?? Infinity;
    const counted = Math.min(average, top) - slice.from;
    if (counted > 0) full += counted * slice.rate;
  });
  return wholeDollars(full * Math.min(1, years / fullYears));
}

/** This year's benefit: the record's benefit once you reach the retirement age. */
export function retirementBenefit(state: LifeState, content: ContentBundle): number {
  return state.character.age >= content.balance.economy.retirement.age ? benefitFromRecord(state, content) : 0;
}
