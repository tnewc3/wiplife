import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { Effect, EventDef } from '../content/schemas';
import { evaluate } from './conditions';
import { applyEffects } from './events/effects';
import {
  addDebt,
  amortizedPayment,
  borrow,
  canStartDebtPlan,
  clearPaidDebts,
  declareBankruptcy,
  forgiveDebts,
  netWorth,
  payDebt,
  sendToCollections,
  spend,
  startDebtPlan,
  totalDebt,
} from './finance';
import { createRng } from './rng';
import { lifeAtAge } from './testFixtures';
import type { LifeState } from './types';

const eco = content.balance.economy;
const adult = (setup: (d: LifeState) => void = () => {}) => produce(lifeAtAge('finance', 30), setup);

describe('the debt system', () => {
  it('computes a whole-dollar payment that pays a loan off in its term', () => {
    expect(amortizedPayment(10_000, 0, 4)).toBe(2_500);
    const payment = amortizedPayment(100_000, 0.065, 30);
    expect(Number.isInteger(payment)).toBe(true);
    let balance = 100_000;
    for (let year = 0; year < 30 && balance > 0; year++) balance = Math.round(balance * 1.065) - Math.min(payment, Math.round(balance * 1.065));
    expect(balance).toBe(0);
    expect(amortizedPayment(0, 0.1, 5)).toBe(0);
  });

  it('adds debts with their kind’s rate, a minimum payment and unique ids', () => {
    const life = adult((d) => {
      addDebt(d, 'student', 30_000, content);
      addDebt(d, 'medical', 100, content);
    });
    const [student, medical] = life.finances.debts;
    expect(student).toMatchObject({ id: 'd1', kind: 'student', balance: 30_000, annualRate: eco.interest.debts.student, missed: 0 });
    expect(student!.minPayment).toBe(amortizedPayment(30_000, eco.interest.debts.student, eco.debts.termYears.student));
    // Never below the smallest minimum payment (the balance itself is due when smaller).
    expect(medical).toMatchObject({ id: 'd2', minPayment: eco.debts.minPayment });
    expect(totalDebt(life)).toBe(30_100);
  });

  it('spends from savings, and an adult borrows the rest; a child never goes into debt', () => {
    const grown = adult((d) => {
      d.finances.savings = 500;
      expect(spend(d, 2_000, content)).toBe(1_500);
    });
    expect(grown.finances.savings).toBe(0);
    expect(grown.finances.debts).toEqual([expect.objectContaining({ kind: 'personal', balance: 1_500 })]);

    const child = produce(lifeAtAge('finance-child', 12), (d) => {
      d.finances.savings = 500;
      expect(spend(d, 2_000, content)).toBe(0);
    });
    expect(child.finances.savings).toBe(0);
    expect(child.finances.debts).toEqual([]);
  });

  it('merges shortfalls into one ordinary personal loan', () => {
    const life = adult((d) => {
      borrow(d, 1_000, content);
      borrow(d, 2_500, content);
    });
    expect(life.finances.debts).toHaveLength(1);
    expect(life.finances.debts[0]!.balance).toBe(3_500);
  });

  it('pays off a debt from savings, and a paid-off mortgage leaves the home yours', () => {
    const life = adult((d) => {
      d.finances.savings = 50_000;
      d.housing = { kind: 'owned', cityId: d.character.cityId, annualCost: 0, homeValue: 200_000, since: d.currentYear };
      d.housing.mortgageDebtId = addDebt(d, 'mortgage', 40_000, content).id;
      expect(payDebt(d, d.housing.mortgageDebtId, 1_000_000, content)).toBe(40_000);
    });
    expect(life.finances.savings).toBe(10_000);
    expect(life.finances.debts).toEqual([]);
    expect(life.housing.mortgageDebtId).toBeUndefined();
    expect(life.history.at(-1)!.tags).toContain('mortgagePaidOff');
    expect(netWorth(life)).toBe(210_000);
  });

  it('forgives a share of chosen debts, and clears what is paid', () => {
    const life = adult((d) => {
      addDebt(d, 'student', 10_000, content);
      addDebt(d, 'collections', 4_000, content).missed = 3;
      forgiveDebts(d, 0.5, content, ['collections']);
      forgiveDebts(d, 1, content, ['student']);
      clearPaidDebts(d, content);
    });
    expect(life.finances.debts).toEqual([expect.objectContaining({ kind: 'collections', balance: 2_000, missed: 0 })]);
  });

  it('bankruptcy clears personal, medical and collections debt, but not student loans or a mortgage', () => {
    const life = adult((d) => {
      for (const kind of ['student', 'personal', 'medical', 'collections'] as const) addDebt(d, kind, 1_000, content);
      declareBankruptcy(d);
    });
    expect(life.finances.debts.map((d) => d.kind)).toEqual(['student']);
    expect(life.finances.bankruptcyYear).toBe(life.currentYear);
  });

  it('a debt plan rolls behind debts into one cheaper loan, and waits before another', () => {
    const behind = adult((d) => {
      addDebt(d, 'personal', 6_000, content).missed = 1;
      addDebt(d, 'medical', 4_000, content);
      addDebt(d, 'student', 9_000, content);
    });
    expect(canStartDebtPlan(behind, content)).toBe(true);
    const planned = produce(behind, (d) => startDebtPlan(d, content));
    const plan = planned.finances.debts.find((d) => d.kind === 'personal')!;
    expect(plan).toMatchObject({ balance: 10_000 + Math.round(10_000 * eco.debtPlan.fee), annualRate: eco.debtPlan.rate, missed: 0 });
    expect(planned.finances.debts.map((d) => d.kind).sort()).toEqual(['personal', 'student']);
    expect(canStartDebtPlan(produce(planned, (d) => void (d.finances.debts[0]!.missed = 2)), content)).toBe(false);
  });

  it('sends a debt to collections with a fee, joining any collections debt', () => {
    const life = adult((d) => {
      const first = addDebt(d, 'personal', 1_000, content);
      first.missed = 2;
      sendToCollections(d, first, content);
      const second = addDebt(d, 'medical', 2_000, content);
      second.missed = 3;
      sendToCollections(d, second, content);
    });
    expect(life.finances.debts).toEqual([
      expect.objectContaining({ kind: 'collections', balance: 3_000 + Math.round(3_000 * eco.missed.collectionsFee), missed: 3 }),
    ]);
  });
});

describe('money, debt and housing effects', () => {
  const def = { id: 'test', rarity: 'common' } as EventDef;
  const apply = (life: LifeState, effects: Effect[]) =>
    produce(life, (d) => applyEffects(d, effects, { def, cast: {}, rng: createRng('fx'), content }));

  it('money: gains add to savings; a cost beyond savings becomes debt for an adult', () => {
    const life = adult((d) => void (d.finances.savings = 100));
    expect(apply(life, [{ type: 'money', delta: 250 }]).finances.savings).toBe(350);
    const cost = apply(life, [{ type: 'money', delta: -600 }]);
    expect(cost.finances.savings).toBe(0);
    expect(totalDebt(cost)).toBe(500);
  });

  it('debt: add, forgive, bankruptcy and plan, and never for a child', () => {
    const life = adult();
    const added = apply(life, [{ type: 'debt', action: 'add', kind: 'medical', amount: 4_500 }]);
    expect(added.finances.debts).toEqual([expect.objectContaining({ kind: 'medical', balance: 4_500 })]);
    expect(totalDebt(apply(added, [{ type: 'debt', action: 'forgive', share: 0.5 }]))).toBe(2_250);
    expect(apply(added, [{ type: 'debt', action: 'bankruptcy' }]).finances.debts).toEqual([]);
    const child = lifeAtAge('fx-child', 12);
    expect(apply(child, [{ type: 'debt', action: 'add', kind: 'medical', amount: 4_500 }]).finances.debts).toEqual([]);
  });

  it('housing: renting, a roommate, moving home and losing a home, only when it fits', () => {
    const atHome = adult((d) => {
      d.housing = { kind: 'with_parents', cityId: d.character.cityId, annualCost: 0, since: d.birthYear };
    });
    const renting = apply(atHome, [{ type: 'housing', action: 'rent' }, { type: 'housing', action: 'roommate' }]);
    expect(renting.housing).toMatchObject({ kind: 'renting', roommate: true, since: renting.currentYear });
    expect(renting.housing.annualCost).toBe(Math.round(content.cities[renting.character.cityId]!.baseRent * content.balance.economy.housing.roommateShare));
    expect(apply(renting, [{ type: 'housing', action: 'live_alone' }]).housing.roommate).toBeUndefined();
    const homeless = apply(renting, [{ type: 'housing', action: 'homeless' }]);
    expect(homeless.housing.kind).toBe('homeless');
    expect(apply(homeless, [{ type: 'housing', action: 'move_home' }]).housing.kind).toBe('with_parents');
    // A roommate only in a rental; a child never moves.
    expect(apply(atHome, [{ type: 'housing', action: 'roommate' }]).housing.roommate).toBeUndefined();
    expect(apply(lifeAtAge('fx-child', 12), [{ type: 'housing', action: 'rent' }]).housing.kind).toBe('with_parents');
  });
});

describe('money and home conditions', () => {
  const life = adult((d) => {
    d.housing = { kind: 'renting', cityId: 'nyc', annualCost: 0, since: d.currentYear - 1, roommate: true };
    d.character.cityId = 'nyc';
    d.character.birthCityId = 'houston';
    d.career.gig = true;
    d.finances.lifestyle = 'frugal';
    d.finances.lastLedger = { year: d.currentYear, gross: 20_000, tax: 600, housing: 0, living: 0, debtPayments: 0, interest: 0, debtInterest: 0, borrowed: 0, support: 0, net: 19_400 };
    addDebt(d, 'collections', 5_000, content).missed = 2;
    d.finances.bankruptcyYear = d.currentYear - 3;
  });
  const holds = (c: Parameters<typeof evaluate>[0]) => evaluate(c, life);

  it('read debt, missed payments, collections, lifestyle, gig work, bankruptcy and income', () => {
    expect(holds({ finances: { debt: { gte: 5_000 }, missed: { eq: 2 }, collections: true } })).toBe(true);
    expect(holds({ finances: { kinds: ['student'] } })).toBe(false);
    expect(holds({ finances: { lifestyle: ['frugal'], gig: true, income: { gte: 20_000 } } })).toBe(true);
    expect(holds({ finances: { bankruptWithin: 3 } })).toBe(true);
    expect(holds({ finances: { bankruptWithin: 2 } })).toBe(false);
    expect(holds({ finances: { planWithin: 5 } })).toBe(false);
  });

  it('read the kind of home, years there, a roommate and whether you moved away', () => {
    expect(holds({ home: { kind: ['renting'], years: { lte: 1 }, roommate: true, relocated: true } })).toBe(true);
    expect(holds({ home: { kind: ['owned'] } })).toBe(false);
    expect(holds({ home: { relocated: false } })).toBe(false);
  });
});
