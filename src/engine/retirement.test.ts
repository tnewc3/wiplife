import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { ContentBundle } from '../content/schemas';
import { checkInvariants } from './invariants';
import { averageEarnings, benefitFromRecord, recordEarnings, retirementBenefit } from './retirement';
import { runEconomy, taxOn } from './systems/economy';
import { lifeAtAge } from './testFixtures';
import type { LifeState } from './types';

const r = content.balance.economy.retirement;
/** Content whose gig pay never swings. */
const steady: ContentBundle = produce(content, (c) => {
  c.balance.economy.gig.swing = { min: 1, max: 1 };
});

const withRecord = (age: number, years: number, total: number): LifeState =>
  produce(lifeAtAge('retirement', age), (d) => {
    d.finances.earnings = { years, total };
  });

/** The formula applied by hand to an average. */
function formula(average: number): number {
  let sum = 0;
  r.formula.forEach((slice, i) => {
    const top = r.formula[i + 1]?.from ?? Infinity;
    sum += Math.max(0, Math.min(average, top) - slice.from) * slice.rate;
  });
  return sum;
}

describe('the earnings record', () => {
  it('counts a year only when earned income reaches the credit amount, capped per year', () => {
    const life = produce(lifeAtAge('record', 40), (d) => {
      recordEarnings(d, r.creditIncome - 1, content);
      recordEarnings(d, 30_000, content);
      recordEarnings(d, r.earningsCap * 3, content);
    });
    expect(life.finances.earnings).toEqual({ years: 2, total: 30_000 + r.earningsCap });
    expect(averageEarnings(life)).toBe(Math.round((30_000 + r.earningsCap) / 2));
  });
});

describe('the retirement benefit', () => {
  it('needs the minimum years of work', () => {
    expect(benefitFromRecord(withRecord(70, r.minYears - 1, 300_000), content)).toBe(0);
    expect(benefitFromRecord(withRecord(70, r.minYears, 300_000), content)).toBeGreaterThan(0);
  });

  it('follows the formula on average earnings, scaled by years ÷ full years', () => {
    const full = withRecord(70, r.fullYears, 40_000 * r.fullYears);
    expect(benefitFromRecord(full, content)).toBe(Math.round(formula(40_000)));
    const longer = withRecord(80, r.fullYears + 10, 40_000 * (r.fullYears + 10));
    expect(benefitFromRecord(longer, content)).toBe(Math.round(formula(40_000)));
    const partial = withRecord(70, 20, 40_000 * 20);
    expect(benefitFromRecord(partial, content)).toBe(Math.round((formula(40_000) * 20) / r.fullYears));
    // Higher earnings pay more, but less than proportionally.
    const high = benefitFromRecord(withRecord(70, r.fullYears, 120_000 * r.fullYears), content);
    expect(high).toBeGreaterThan(benefitFromRecord(full, content));
    expect(high).toBeLessThan(3 * benefitFromRecord(full, content));
  });

  it('is paid from the retirement age', () => {
    expect(retirementBenefit(withRecord(r.age - 1, 40, 40_000 * 40), content)).toBe(0);
    expect(retirementBenefit(withRecord(r.age, 40, 40_000 * 40), content)).toBe(Math.round(formula(40_000)));
  });
});

describe('the ledger and retirement', () => {
  const ledger = (life: LifeState, bundle: ContentBundle = content) => produce(life, (d) => runEconomy(d, bundle));

  it('pays the benefit as its own line, untaxed, and records the year’s earnings', () => {
    const retiree = produce(withRecord(r.age, 40, 30_000 * 40), (d) => {
      d.finances.savings = 0;
      d.career.gig = true;
    });
    const after = ledger(retiree, steady);
    const l = after.finances.lastLedger!;
    expect(l.retirement).toBe(Math.round(formula(30_000)));
    expect(l.tax).toBe(taxOn(l.gross, content));
    expect(l.net).toBe(l.gross + l.retirement + l.interest - l.tax - l.housing - l.living - l.debtPayments);
    expect(after.finances.earnings.years).toBe(l.gross >= r.creditIncome ? 41 : 40);
    expect(checkInvariants({ ...after, scheduled: [] }, content)).toEqual([]);
  });

  it('counts every kind of earned income: gig pay now, and a salary (Stage 8) the same way', () => {
    const gig = ledger(produce(lifeAtAge('earn-gig', 30), (d) => void (d.career.gig = true)), steady);
    expect(gig.finances.earnings.years).toBe(1);
    expect(gig.finances.earnings.total).toBe(gig.finances.lastLedger!.gross);
    const salaried = ledger(
      produce(lifeAtAge('earn-job', 30), (d) => {
        d.career.job = { jobId: 'any', level: 1, yearsAtLevel: 0, performance: 50, salary: 55_000 };
      }),
    );
    expect(salaried.finances.lastLedger!.gross).toBe(55_000);
    expect(salaried.finances.earnings).toEqual({ years: 1, total: 55_000 });
  });

  it('pays nothing before the retirement age', () => {
    const young = ledger(withRecord(40, 20, 30_000 * 20));
    expect(young.finances.lastLedger!.retirement).toBe(0);
  });
});
