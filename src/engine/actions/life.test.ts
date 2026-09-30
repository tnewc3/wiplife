import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { InvalidInputError } from '../creation/input';
import { totalDebt } from '../finance';
import { moveInCost, purchaseQuote } from '../housing';
import { beginYear, PhaseError } from '../life';
import { getHomeView, getMoneyView, getWorkView } from '../selectors';
import { runEconomy } from '../systems/economy';
import { lifeAtAge } from '../testFixtures';
import { checkInvariants } from '../invariants';
import type { LifeState } from '../types';
import { isLifeActionAvailable, performAction } from './index';

const eco = content.balance.economy;

/** A 25-year-old living with family in Houston with `savings`. */
function atHome(savings: number, setup: (d: LifeState) => void = () => {}): LifeState {
  return produce(lifeAtAge('life-actions', 25), (d) => {
    d.character.cityId = 'houston';
    d.character.birthCityId = 'houston';
    d.housing = { kind: 'with_parents', cityId: 'houston', annualCost: 0, since: d.birthYear };
    for (const p of Object.values(d.people)) p.cityId = 'houston';
    for (const rel of Object.values(d.relationships)) if (rel.kind === 'parent') rel.status = 'active';
    d.finances.savings = savings;
    setup(d);
  });
}

const act = (life: LifeState, id: string, params?: unknown) => performAction(life, id, params, content);

describe('money actions', () => {
  it('change lifestyle from the independence age, and record the input', () => {
    const life = atHome(0);
    const frugal = act(life, 'set_lifestyle', { lifestyle: 'frugal' });
    expect(frugal.finances.lifestyle).toBe('frugal');
    expect(frugal.phase).toBe('yearStart');
    expect(frugal.inputLog.at(-1)).toEqual({ year: life.currentYear, kind: 'action', payload: { actionId: 'set_lifestyle', params: { lifestyle: 'frugal' } } });
    expect(() => act(life, 'set_lifestyle', { lifestyle: 'extravagant' })).toThrow(InvalidInputError);
    expect(() => act(life, 'set_lifestyle', { lifestyle: 'comfortable' })).toThrow(InvalidInputError);
    expect(() => act(lifeAtAge('young', 12), 'set_lifestyle', { lifestyle: 'lavish' })).toThrow(InvalidInputError);
  });

  it('start gig work from the minimum age, and it pays through the ledger', () => {
    expect(getWorkView(lifeAtAge('gig-young', eco.gig.minAge - 1), content).canGig).toBe(false);
    expect(() => act(lifeAtAge('gig-young', eco.gig.minAge - 1), 'start_gig')).toThrow(InvalidInputError);
    const teen = lifeAtAge('gig-teen', eco.gig.minAge);
    const working = act(teen, 'start_gig');
    expect(working.career.gig).toBe(true);
    expect(getWorkView(working, content).expectedGigPay).toBeGreaterThan(0);
    const paid = produce(working, (d) => runEconomy(d, content));
    expect(paid.finances.lastLedger!.gross).toBeGreaterThan(0);
    expect(paid.finances.savings).toBeGreaterThan(teen.finances.savings);
    expect(act(working, 'stop_gig').career.gig).toBe(false);
  });

  it('pay a debt from savings, and take a debt plan when behind', () => {
    const life = atHome(3_000, (d) => {
      d.finances.debts.push({ id: 'd1', kind: 'personal', balance: 5_000, annualRate: 0.12, minPayment: 1_387, missed: 1 });
    });
    expect(getMoneyView(life, content).debts[0]!.canPay).toBe(3_000);
    const paid = act(life, 'pay_debt', { debtId: 'd1' });
    expect([paid.finances.savings, totalDebt(paid)]).toEqual([0, 2_000]);
    expect(() => act(life, 'pay_debt', { debtId: 'nope' })).toThrow(InvalidInputError);
    expect(getMoneyView(life, content).debtPlan).toBe(true);
    const plan = act(life, 'debt_plan');
    expect(plan.finances.debts).toEqual([expect.objectContaining({ kind: 'personal', annualRate: eco.debtPlan.rate, missed: 0 })]);
  });

  it('are refused in the middle of a year', () => {
    const begun = beginYear(atHome(0), content);
    if (begun.phase === 'yearStart') return;
    expect(() => act(begun, 'set_lifestyle', { lifestyle: 'frugal' })).toThrow(PhaseError);
  });
});

describe('home actions', () => {
  it('move out: pays moving and a deposit once, and rent from next year', () => {
    const cost = moveInCost(atHome(0), 'houston', content);
    expect(isLifeActionAvailable(atHome(cost - 1), 'rent_home', {}, content)).toBe(false);
    const moved = act(atHome(cost + 100), 'rent_home');
    expect(moved.housing).toMatchObject({ kind: 'renting', cityId: 'houston', annualCost: content.cities.houston!.baseRent, since: moved.currentYear });
    expect(moved.finances.savings).toBe(100);
    expect(moved.history.at(-1)!.tags).toContain('movedOut');
    expect(checkInvariants(moved, content)).toEqual([]);
  });

  it('relocating changes costs from the next year on, with no double charge', () => {
    const start = atHome(50_000, (d) => {
      d.housing = { kind: 'renting', cityId: 'houston', annualCost: content.cities.houston!.baseRent, since: d.currentYear - 3 };
    });
    const cost = moveInCost(start, 'nyc', content);
    expect(cost).toBe(eco.housing.relocationCost + Math.round(content.cities.nyc!.baseRent * eco.housing.deposit));
    const moved = act(start, 'relocate', { cityId: 'nyc' });
    expect(moved.character.cityId).toBe('nyc');
    expect(moved.character.birthCityId).toBe('houston');
    expect(moved.housing.cityId).toBe('nyc');
    expect(moved.finances.savings).toBe(50_000 - cost);
    expect(moved.history.at(-1)!.text).toContain('New York');

    // The next year's ledger charges New York rent and costs, once.
    const next = beginYear(moved, content);
    const l = next.finances.lastLedger!;
    expect(l.year).toBe(moved.currentYear + 1);
    expect(l.housing).toBe(content.cities.nyc!.baseRent);
    expect(l.living).toBe(Math.round(eco.livingCost * content.cities.nyc!.costOfLiving));
    expect(next.finances.savings).toBe(Math.max(0, moved.finances.savings + l.net));
    expect(() => act(start, 'relocate', { cityId: 'houston' })).toThrow(InvalidInputError);
    expect(() => act(start, 'relocate', { cityId: 'atlantis' })).toThrow(InvalidInputError);
  });

  it('buying needs a down payment, and the mortgage is paid through the debt system', () => {
    const base = atHome(0, (d) => {
      d.finances.lastLedger = { year: d.currentYear, gross: 120_000, tax: 0, housing: 0, living: 0, debtPayments: 0, interest: 0, debtInterest: 0, borrowed: 0, support: 0, net: 120_000 };
    });
    const quote = purchaseQuote(base, content);
    expect(quote.cashNeeded).toBe(Math.round(quote.price * eco.ownership.downPayment) + Math.round(quote.price * eco.ownership.closingCosts));
    expect(quote.blocked).toBe('savings');
    expect(() => act(base, 'buy_home')).toThrow(InvalidInputError);

    const ready = produce(base, (d) => void (d.finances.savings = quote.cashNeeded));
    const bought = act(ready, 'buy_home');
    const mortgage = bought.finances.debts.find((d) => d.kind === 'mortgage')!;
    expect(bought.housing).toMatchObject({ kind: 'owned', homeValue: quote.price, mortgageDebtId: mortgage.id });
    expect(mortgage.balance).toBe(quote.price - Math.round(quote.price * eco.ownership.downPayment));
    expect(bought.finances.savings).toBe(0);
    expect(checkInvariants(bought, content)).toEqual([]);

    // The next ledger pays the mortgage as a debt, not as housing.
    const next = produce(bought, (d) => {
      d.finances.savings = 100_000;
      runEconomy(d, content);
    });
    expect(next.finances.lastLedger!.housing).toBe(Math.round(next.housing.homeValue! * eco.ownership.upkeep));
    expect(next.finances.lastLedger!.debtPayments).toBe(mortgage.minPayment);

    // A bank won't lend without the income, nor soon after bankruptcy.
    const poor = produce(ready, (d) => {
      d.finances.lastLedger = { ...d.finances.lastLedger!, gross: 1_000, net: 1_000 };
    });
    expect(purchaseQuote(poor, content).blocked).toBe('income');
    expect(purchaseQuote(produce(ready, (d) => void (d.finances.bankruptcyYear = d.currentYear - 1)), content).blocked).toBe('bankruptcy');

    // Selling pays off the mortgage and moves you into a rental.
    const sold = act(bought, 'sell_home');
    expect(sold.housing.kind).toBe('renting');
    expect(sold.finances.debts.some((d) => d.kind === 'mortgage')).toBe(false);
    expect(checkInvariants(sold, content)).toEqual([]);
  });

  it('moving back home goes to your parent’s city, free', () => {
    const away = atHome(0, (d) => {
      d.housing = { kind: 'homeless', cityId: 'nyc', annualCost: 0, since: d.currentYear };
      d.character.cityId = 'nyc';
    });
    expect(getHomeView(away, content).moveHome).not.toBeNull();
    const home = act(away, 'move_home');
    expect(home.housing).toMatchObject({ kind: 'with_parents', cityId: 'houston' });
    expect(home.character.cityId).toBe('houston');
    // No parent who would take you in: not an option.
    const alone = produce(away, (d) => {
      for (const rel of Object.values(d.relationships)) if (rel.kind === 'parent' || rel.kind === 'stepparent') rel.status = 'estranged';
    });
    expect(getHomeView(alone, content).moveHome).toBeNull();
    expect(() => act(alone, 'move_home')).toThrow(InvalidInputError);
  });

  it('a roommate halves the rent, near enough', () => {
    const renting = atHome(0, (d) => {
      d.housing = { kind: 'renting', cityId: 'houston', annualCost: 0, since: d.currentYear };
    });
    const shared = act(renting, 'find_roommate');
    expect(shared.housing.annualCost).toBe(Math.round(content.cities.houston!.baseRent * eco.housing.roommateShare));
    expect(getHomeView(shared, content).roommateAction).toBe('leave');
    expect(act(shared, 'live_alone').housing.roommate).toBeUndefined();
  });

  it('a child has no home actions', () => {
    const child = lifeAtAge('home-child', 12);
    const view = getHomeView(child, content);
    expect([view.rent, view.moveHome, view.buy, view.roommateAction, view.cities]).toEqual([null, null, null, null, []]);
  });
});
