import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import type { ContentBundle } from '../../content/schemas';
import { addDebt, amortizedPayment, netWorth, totalDebt } from '../finance';
import { checkInvariants } from '../invariants';
import { createRng } from '../rng';
import { lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { expectedGigPay } from './career';
import { applyStatEffects, runEconomy, taxOn } from './economy';

/** Content whose gig pay never swings, so a year's pay is exact. */
const steady: ContentBundle = produce(content, (c) => {
  c.balance.economy.gig.swing = { min: 1, max: 1 };
});
const eco = content.balance.economy;

/** An adult (30) at the start of a year, in Chicago, with no debt; the economy step then runs as the pipeline would. */
function adult(setup: (d: LifeState) => void = () => {}, age = 30): LifeState {
  return produce(lifeAtAge('economy', age), (d) => {
    d.character.cityId = 'chicago';
    d.character.birthCityId = 'chicago';
    d.housing = { kind: 'renting', cityId: 'chicago', annualCost: 0, since: d.currentYear - 2 };
    d.character.familyWealth = 'middle';
    for (const p of Object.values(d.people)) p.cityId = 'chicago';
    d.finances.lifestyle = 'comfortable';
    setup(d);
  });
}

const ledger = (life: LifeState, bundle: ContentBundle = content) => produce(life, (d) => runEconomy(d, bundle));
const chicago = content.cities.chicago!;
/** Invariants once the pacing step (not run here) has taken this year's queued trigger events. */
const problems = (life: LifeState) => checkInvariants({ ...life, scheduled: life.scheduled.filter((s) => s.dueYear > life.currentYear) }, content);

describe('tax', () => {
  it('applies each bracket to its slice of income, in whole dollars', () => {
    expect(taxOn(0, content)).toBe(0);
    expect(taxOn(14_000, content)).toBe(0);
    expect(taxOn(24_000, content)).toBe(1_000);
    // 31,000 × 10% + 5,000 × 20%
    expect(taxOn(50_000, content)).toBe(4_100);
    expect(taxOn(300_000, content)).toBe(3_100 + 11_000 + 42_000 + 17_500);
    expect(Number.isInteger(taxOn(33_333, content))).toBe(true);
  });
});

describe('the yearly ledger', () => {
  it('adds up every line exactly: income, tax, housing, living, interest, savings', () => {
    const life = adult((d) => {
      d.finances.savings = 10_000;
      d.career.gig = true;
    });
    const after = ledger(life, steady);
    const gross = expectedGigPay(life, steady);
    const l = after.finances.lastLedger!;
    expect(l.year).toBe(life.currentYear);
    expect(l.gross).toBe(gross);
    expect(l.tax).toBe(taxOn(gross, content));
    expect(l.housing).toBe(chicago.baseRent);
    expect(l.living).toBe(Math.round(eco.livingCost * chicago.costOfLiving));
    expect(l.interest).toBe(Math.round(10_000 * eco.interest.savings));
    expect(l.debtPayments).toBe(0);
    expect(l.net).toBe(l.gross + l.interest - l.tax - l.housing - l.living - l.debtPayments);
    // Savings change by exactly net, plus anything borrowed to keep them at zero.
    expect(after.finances.savings).toBe(10_000 + l.net + l.borrowed);
    expect(totalDebt(after)).toBe(l.borrowed);
    expect(problems(after)).toEqual([]);
  });

  it('turns a shortfall into personal debt: savings never go below zero', () => {
    const life = adult((d) => {
      d.finances.savings = 1_000;
    });
    const after = ledger(life);
    const l = after.finances.lastLedger!;
    expect(l.gross).toBe(0);
    expect(after.finances.savings).toBe(0);
    expect(l.borrowed).toBe(-(1_000 + l.net));
    expect(after.finances.debts).toEqual([
      expect.objectContaining({ kind: 'personal', balance: l.borrowed, annualRate: eco.interest.debts.personal, missed: 0 }),
    ]);
    // The next shortfall joins the same personal debt.
    const again = ledger(after);
    expect(again.finances.debts.filter((d) => d.kind === 'personal')).toHaveLength(1);
    expect(problems(again)).toEqual([]);
  });

  it('applies interest to savings and to every debt', () => {
    const life = adult((d) => {
      d.finances.savings = 1_000_000;
      addDebt(d, 'student', 20_000, content);
    });
    const after = ledger(life);
    const l = after.finances.lastLedger!;
    expect(l.interest).toBe(20_000);
    expect(l.debtInterest).toBe(Math.round(20_000 * eco.interest.debts.student));
    const payment = amortizedPayment(20_000, eco.interest.debts.student, eco.debts.termYears.student);
    expect(after.finances.debts[0]!.balance).toBe(20_000 + l.debtInterest - payment);
    expect(l.debtPayments).toBe(payment);
    expect(after.finances.debts[0]!.missed).toBe(0);
  });

  it('pays debt minimums from what is left, and misses them when money runs out', () => {
    const life = adult((d) => {
      d.finances.savings = 0;
      addDebt(d, 'medical', 3_000, content);
    });
    const after = ledger(life);
    expect(after.finances.debts.find((d) => d.kind === 'medical')!.missed).toBe(1);
    expect(after.finances.lastLedger!.debtPayments).toBe(0);
    // A missed payment queues a missed_payment event for this year.
    const queued = after.scheduled.filter((s) => s.dueYear === after.currentYear).map((s) => s.eventId);
    expect(queued.some((id) => content.registries.triggers.triggers.missed_payment.events.includes(id))).toBe(true);
  });

  it('sends a debt missed often enough to collections, then garnishes income', () => {
    const behind = adult((d) => {
      addDebt(d, 'medical', 3_000, content).missed = eco.missed.collectionsAfter - 1;
    });
    const sent = ledger(behind);
    expect(sent.finances.debts.map((d) => d.kind)).toContain('collections');
    const collections = sent.finances.debts.find((d) => d.kind === 'collections')!;
    expect(collections.missed).toBeGreaterThan(0);
    expect(sent.history.some((e) => e.tags.includes('collections'))).toBe(true);
    const queued = sent.scheduled.filter((s) => s.dueYear === sent.currentYear).map((s) => s.eventId);
    expect(queued.some((id) => content.registries.triggers.triggers.collections.events.includes(id))).toBe(true);

    // With income, a share of it is garnished before anything else.
    const working = produce(sent, (d) => {
      d.career.gig = true;
      d.scheduled = [];
      d.eventLog = {};
    });
    const garnished = ledger(working, steady);
    const gross = garnished.finances.lastLedger!.gross;
    expect(garnished.finances.lastLedger!.debtPayments).toBeGreaterThanOrEqual(Math.min(Math.round(gross * eco.missed.garnishShare), collections.balance));
  });

  it('lets your family cover what you cannot pay while you live with them', () => {
    const life = adult((d) => {
      d.housing = { kind: 'with_parents', cityId: 'chicago', annualCost: 0, since: d.birthYear };
      d.character.familyWealth = 'poor';
    }, 25);
    expect(life.housing.kind).toBe('with_parents');
    const after = ledger(life);
    const l = after.finances.lastLedger!;
    expect(l.support).toBeGreaterThan(0);
    expect(l.borrowed).toBe(0);
    expect(after.finances.debts).toEqual([]);
  });

  it('charges nothing for a child and never gives a child debt', () => {
    const child = produce(lifeAtAge('economy-child', 10), (d) => {
      d.finances.savings = 50;
    });
    const after = ledger(child);
    const l = after.finances.lastLedger!;
    expect([l.housing, l.living, l.tax, l.gross, l.borrowed]).toEqual([0, 0, 0, 0, 0]);
    expect(after.finances.debts).toEqual([]);
    expect(after.finances.savings).toBe(51);
  });

  it('evicts a renter behind on rent year after year', () => {
    let life = adult();
    for (let i = 0; i < eco.missed.evictionAfter; i++) {
      life = produce(ledger(life), (d) => {
        d.currentYear += 1;
        d.character.age += 1;
        d.inputLog.push({ year: d.currentYear - 1, kind: 'ageUp', payload: {} });
        d.scheduled = [];
      });
    }
    expect(life.housing.kind).toBe('homeless');
    expect(life.history.some((e) => e.tags.includes('evicted'))).toBe(true);
  });

  it('forecloses on a home whose mortgage is missed too often, and pays the mortgage from the sale', () => {
    const life = adult((d) => {
      d.housing = { kind: 'owned', cityId: 'chicago', annualCost: 0, homeValue: 300_000, since: d.currentYear - 5 };
      const mortgage = addDebt(d, 'mortgage', 200_000, content);
      mortgage.missed = eco.missed.foreclosureAfter - 1;
      d.housing.mortgageDebtId = mortgage.id;
    });
    const after = ledger(life);
    expect(after.housing.kind).toBe('renting');
    expect(after.finances.debts.some((d) => d.kind === 'mortgage')).toBe(false);
    expect(after.history.some((e) => e.tags.includes('foreclosed'))).toBe(true);
    expect(problems(after)).toEqual([]);
  });

  it('moves an adult with nobody left to live with into a rental', () => {
    const life = adult((d) => {
      d.housing = { kind: 'with_parents', cityId: 'chicago', annualCost: 0, since: d.birthYear };
      for (const rel of Object.values(d.relationships)) if (rel.kind === 'parent') rel.status = 'estranged';
    });
    const after = ledger(life);
    expect(after.housing.kind).toBe('renting');
    expect(after.history.some((e) => e.tags.includes('familyHomeGone'))).toBe(true);
  });

  it('never goes past safe integer limits', () => {
    const rich = adult((d) => {
      d.finances.savings = Number.MAX_SAFE_INTEGER - 5;
    });
    const after = ledger(rich);
    expect(Number.isSafeInteger(after.finances.savings)).toBe(true);
    expect(Number.isSafeInteger(netWorth(after))).toBe(true);
  });
});

describe('lifestyle and hardship', () => {
  it('pull stats toward their limit, never past it', () => {
    const life = adult((d) => {
      d.character.stats.happiness = 79;
    });
    const after = produce(life, (d) => applyStatEffects(d, { happiness: { perYear: 5, limit: 80 }, stress: { perYear: -3, limit: 50 } }));
    expect(after.character.stats.happiness).toBe(80);
    // Stress was already below the floor: untouched.
    expect(after.character.stats.stress).toBe(life.character.stats.stress);
  });

  it('a lavish life costs more than a frugal one', () => {
    const lavish = ledger(adult((d) => void (d.finances.lifestyle = 'lavish')));
    const frugal = ledger(adult((d) => void (d.finances.lifestyle = 'frugal')));
    expect(lavish.finances.lastLedger!.living).toBeGreaterThan(frugal.finances.lastLedger!.living);
  });

  it('is deterministic for the same life', () => {
    const life = adult((d) => {
      d.career.gig = true;
      d.rng = createRng('same');
    });
    expect(ledger(life)).toEqual(ledger(life));
  });
});
