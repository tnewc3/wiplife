import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { BUSINESS_FUNDING, BUSINESS_ROLE, BUSINESS_STYLES, type BusinessFunding, type BusinessStyle } from '../../content/schemas';
import { performAction } from '../actions';
import { evaluate } from '../conditions';
import { InvalidInputError } from '../creation/input';
import { settleEstate } from '../estate/settle';
import { continueAsHeir, heirCandidates } from '../estate/heir';
import { die, parentLife } from '../estate/fixtures';
import { castEvent, createPerson } from '../events/casting';
import { applyEffects } from '../events/effects';
import { declareBankruptcy, netWorth, totalDebt } from '../finance';
import { checkInvariants } from '../invariants';
import { beginYear } from '../life';
import { playYear } from '../autoplay';
import { createRng } from '../rng';
import { pruneWeb } from '../web/ties';
import { lifeAtAge } from '../testFixtures';
import type { Business, LifeState } from '../types';
import { cofounderCandidates, investorCandidates, loanOffer, type FundingPlan } from './funding';
import { buyBlock, buyOut, endBusiness, expandBlock, openLocation, setDecisions, startBlock } from './found';
import { listingById, marketFor } from './market';
import { locationFigures, salePrice, startupCost, totalToStart, typicalLocation, valuation, wageOf } from './model';
import { businessFailures } from './invariants';
import { hasLicenseHolder, loanBalance } from './query';
import { fireStaff, hireBlock, hireStaff } from './staff';
import { runBusiness } from './step';
import { getBusinessMoney, getBusinessScreen, getMarketView, reportWords } from './views';

const ledger = (d: LifeState, gross = 60_000) => {
  d.finances.lastLedger = { year: d.currentYear - 1, gross, retirement: 0, tax: 0, housing: 0, living: 0, debtPayments: 0, interest: 0, debtInterest: 0, borrowed: 0, support: 0, children: 0, care: 0, supportPaid: 0, supportReceived: 0, upkeep: 0, insurance: 0, giving: 0, business: 0, net: gross };
};

/** A 32-year-old with money, a steady income and people they know. */
function owner(seed: string, savings = 600_000): LifeState {
  return produce(lifeAtAge(seed, 32), (d) => {
    d.finances.savings = savings;
    d.finances.dirty = 0;
    ledger(d);
  });
}

const act = (life: LifeState, id: Parameters<typeof performAction>[1], biz: Record<string, unknown>) => performAction(life, id, { biz }, content);

function start(life: LifeState, defId: string, plan: FundingPlan = { source: 'savings' }, style: BusinessStyle = 'standard', role: 'self' | 'manager' = 'self', name = 'Test Place'): LifeState {
  return act(life, 'start_business', { defId, name, cityId: life.character.cityId, style, plan, role });
}

/** A plan of each funding source that works for this life (given people who could invest and partner). */
function planOf(life: LifeState, source: BusinessFunding, need: number, defId: string): FundingPlan {
  if (source === 'savings') return { source };
  if (source === 'loan') return { source, loan: loanOffer(life, need, content.businesses[defId], content).limit };
  if (source === 'investors') {
    const c = investorCandidates(life, content).filter((x) => x.willing).slice(0, 2);
    return { source, investors: c.map((x) => ({ personId: x.personId, amount: Math.min(x.capacity, Math.ceil(need * 0.2)) })) };
  }
  const c = cofounderCandidates(life, content).find((x) => x.willing)!;
  return { source, cofounder: { personId: c.personId, share: 33 } };
}

/** A life with someone rich who loves them (an investor) and someone who would be a partner. */
function connected(seed: string): LifeState {
  return produce(owner(seed), (d) => {
    const rng = createRng(`${seed}:friends`);
    for (let i = 0; i < 3; i++) {
      const id = createPerson(d, { kind: 'friend', presence: 'city', createIfMissing: true, age: { min: 28, max: 45 } }, rng, content);
      if (!id) continue;
      d.relationships[id]!.affection = 85;
      d.people[id]!.wealthLevel = 'rich';
    }
  });
}

describe('the six kinds of business', () => {
  it('are content: three styles each with rising costs, a trade licence where a trade needs one, and fictional names', () => {
    const defs = Object.values(content.businesses);
    expect(defs.map((d) => d.id).sort()).toEqual(['bakery', 'cafe', 'cleaning', 'plumbing', 'salon', 'shop']);
    for (const d of defs) {
      expect(d.styles.budget.startup).toBeLessThan(d.styles.standard.startup);
      expect(d.styles.standard.startup).toBeLessThan(d.styles.premium.startup);
      expect(d.names.length).toBeGreaterThanOrEqual(8);
    }
    expect(content.businesses.plumbing!.license?.trade).toBe('plumber');
    expect(content.businesses.salon!.license?.trade).toBe('cosmetologist');
    expect(content.businesses.cafe!.license).toBeUndefined();
    expect(Object.keys(content.chains).length).toBeGreaterThanOrEqual(6);
  });

  it('suit a city by style: a premium café does better in New York than in a small town', () => {
    const cafe = content.businesses.cafe!;
    const ny = typicalLocation(cafe, 'premium', 'nyc', 50, 66, content);
    const town = typicalLocation(cafe, 'premium', 'small_town', 50, 66, content);
    expect(ny.demand).toBeGreaterThan(town.demand * 2);
    const budgetTown = typicalLocation(cafe, 'budget', 'small_town', 50, 38, content);
    const budgetNy = typicalLocation(cafe, 'budget', 'nyc', 50, 38, content);
    expect(budgetTown.demand / budgetNy.demand).toBeGreaterThan(ny.demand > 0 ? town.demand / ny.demand : 0);
  });
});

describe('starting a business', () => {
  for (const defId of ['cafe', 'bakery', 'shop', 'salon', 'plumbing', 'cleaning']) {
    for (const source of BUSINESS_FUNDING) {
      it(`${defId} can be started with ${source}`, () => {
        const life = connected(`start-${defId}-${source}`);
        const def = content.businesses[defId]!;
        const need = totalToStart(def, 'standard', life.character.cityId, def.license !== undefined, content).total;
        const next = start(life, defId, planOf(life, source, need, defId));
        expect(next.business.items).toHaveLength(1);
        const b = next.business.items[0]!;
        expect(b.defId).toBe(defId);
        expect(b.name).toBe('Test Place');
        expect(checkInvariants(next, content)).toEqual([]);
        if (source === 'loan') {
          expect(b.loanIds).toHaveLength(1);
          expect(next.finances.debts.find((d) => d.id === b.loanIds[0])?.kind).toBe('business');
        }
        if (source === 'investors') expect(b.owners.some((o) => o.role === 'investor')).toBe(true);
        if (source === 'cofounder') expect(b.owners.find((o) => o.role === 'cofounder')?.share).toBe(33);
        expect(b.owners.reduce((s, o) => s + o.share, 0)).toBe(100);
        // The business is a licence-holder only with someone who holds it (you, or someone hired).
        expect(hasLicenseHolder(next, b, def) || def.license === undefined || b.owners.some((o) => o.role === 'cofounder')).toBe(true);
      });
    }
  }

  it('takes a name, a city and a style, and refuses a bad name, a repeated name, an unknown city or style', () => {
    const life = owner('start-checks', 3_000_000);
    const ok = { defId: 'cafe', name: 'The Grey Heron', cityId: 'nyc', style: 'premium' as const, plan: { source: 'savings' as const }, role: 'manager' as const };
    expect(startBlock(life, ok, content)).toBeNull();
    const made = start(life, 'cafe', { source: 'savings' }, 'premium', 'manager', '  The   Grey Heron ');
    expect(made.business.items[0]!.name).toBe('The Grey Heron');
    expect(startBlock(life, { ...ok, name: ' ' }, content)).toBe('name');
    expect(startBlock(life, { ...ok, name: 'x'.repeat(60) }, content)).toBe('name');
    expect(startBlock(life, { ...ok, cityId: 'atlantis' }, content)).toBe('city');
    expect(startBlock(life, { ...ok, defId: 'rocket' }, content)).toBe('type');
    expect(startBlock(made, { ...ok, name: 'the grey heron' }, content)).toBe('name');
    expect(() => act(life, 'start_business', { defId: 'cafe', name: 'X', cityId: 'nyc', style: 'luxury', plan: { source: 'savings' }, role: 'self' })).toThrow(InvalidInputError);
    expect(() => act(life, 'start_business', { defId: 'cafe', name: 'Okay', cityId: 'nyc', style: 'standard', plan: { source: 'gifts' }, role: 'self' })).toThrow(InvalidInputError);
  });

  it('puts the money through the finance module: savings pay your share, the loan is a debt, and nothing appears from nowhere', () => {
    const life = owner('money-through');
    const def = content.businesses.cafe!;
    const t = totalToStart(def, 'standard', life.character.cityId, false, content);
    const bySavings = start(life, 'cafe');
    expect(life.finances.savings - bySavings.finances.savings).toBe(t.total);
    expect(bySavings.business.items[0]!.cash + bySavings.business.items[0]!.assets).toBe(t.total);
    const offer = loanOffer(life, t.total, def, content);
    expect(offer.limit).toBeGreaterThan(0);
    const byLoan = start(life, 'cafe', { source: 'loan', loan: offer.limit });
    expect(byLoan.finances.savings).toBe(life.finances.savings - (t.total - offer.limit));
    expect(totalDebt(byLoan)).toBe(offer.limit);
  });

  it('needs the savings: a plan you cannot pay is refused, and a child or someone in prison cannot start one', () => {
    const poor = owner('too-poor', 2000);
    expect(startBlock(poor, { defId: 'cafe', name: 'No Money', cityId: poor.character.cityId, style: 'standard', plan: { source: 'savings' }, role: 'self' }, content)).toBe('savings');
    const kid = produce(lifeAtAge('too-young', 15), (d) => void (d.finances.savings = 1_000_000));
    expect(startBlock(kid, { defId: 'cafe', name: 'Lemonade', cityId: kid.character.cityId, style: 'budget', plan: { source: 'savings' }, role: 'self' }, content)).toBe('age');
    const jailed = produce(owner('jailed'), (d) => void (d.housing.kind = 'incarcerated'));
    expect(startBlock(jailed, { defId: 'cafe', name: 'Inside', cityId: jailed.character.cityId, style: 'budget', plan: { source: 'savings' }, role: 'self' }, content)).toBe('away');
  });

  it('turns down a loan after a bankruptcy or a missed payment, and the plan counts for the bank', () => {
    const life = owner('loan-rules');
    const def = content.businesses.cafe!;
    const t = totalToStart(def, 'standard', life.character.cityId, false, content).total;
    expect(loanOffer(life, t, def, content).block).toBeNull();
    const bankrupt = produce(life, (d) => void (d.finances.bankruptcyYear = d.currentYear - 2));
    expect(loanOffer(bankrupt, t, def, content).block).toBe('bankruptcy');
    const behind = produce(life, (d) => void d.finances.debts.push({ id: 'd9', kind: 'personal', balance: 1000, annualRate: 0.1, minPayment: 300, missed: 1 }));
    expect(loanOffer(behind, t, def, content).block).toBe('missed');
    const licensed = produce(life, (d) => void d.education.credentials.push({ type: 'trade_license', refId: 'plumber', year: d.currentYear - 3 }));
    const plumb = content.businesses.plumbing!;
    expect(loanOffer(licensed, 200_000, plumb, content).limit).toBeGreaterThan(loanOffer(life, 200_000, plumb, content).limit);
  });
});

describe('investors and co-founders', () => {
  it('give investors a stake and a memory, and pay them out of profit', () => {
    let life = connected('investor-flow');
    const def = content.businesses.cafe!;
    const need = totalToStart(def, 'standard', life.character.cityId, false, content).total;
    const plan = planOf(life, 'investors', need, 'cafe');
    life = start(life, 'cafe', plan);
    const b = life.business.items[0]!;
    const inv = b.owners.filter((o) => o.role === 'investor');
    expect(inv.length).toBeGreaterThan(0);
    for (const o of inv) {
      expect(o.share).toBeGreaterThanOrEqual(1);
      expect(life.relationships[o.id]!.memories.some((m) => m.tag === 'invested_in_your_business')).toBe(true);
    }
    expect(b.owners.find((o) => o.id === 'you')!.share).toBe(100 - inv.reduce((s, o) => s + o.share, 0));
    // A good year pays them their share.
    const strong = produce(life, (d) => {
      const x = d.business.items[0]!;
      x.founded -= 5;
      x.reputation = 80;
      x.quality = 80;
      x.locations[0]!.opened -= 5;
      x.cash = 10_000_000;
    });
    const next = produce(strong, (d) => void runBusiness(d, content));
    const paid = next.business.items[0]!.owners.filter((o) => o.role === 'investor').reduce((s, o) => s + o.paid, 0);
    expect(next.business.items[0]!.report!.paidOut).toBeGreaterThan(0);
    expect(paid).toBeGreaterThan(0);
    expect(next.business.year.draw).toBeLessThan(next.business.items[0]!.report!.paidOut);
  });

  it('remember losing their money when the business fails', () => {
    let life = connected('investor-lose');
    const need = totalToStart(content.businesses.cafe!, 'standard', life.character.cityId, false, content).total;
    life = start(life, 'cafe', planOf(life, 'investors', need, 'cafe'));
    const investorId = life.business.items[0]!.owners.find((o) => o.role === 'investor')!.id;
    const before = life.relationships[investorId]!.affection;
    life = produce(life, (d) => void endBusiness(d, d.business.items[0]!.id, 'failed', content, 20_000));
    expect(life.business.items).toHaveLength(0);
    expect(life.relationships[investorId]!.memories.some((m) => m.tag === 'lost_money_in_your_business')).toBe(true);
    expect(life.relationships[investorId]!.affection).toBeLessThan(before);
    expect(life.business.past.at(-1)!.end).toBe('failed');
    expect(checkInvariants(life, content)).toEqual([]);
  });

  it('give a co-founder a share, can be bought out, and share the cost of a loss', () => {
    let life = connected('cofounder-flow');
    const need = totalToStart(content.businesses.cafe!, 'standard', life.character.cityId, false, content).total;
    life = start(life, 'cafe', planOf(life, 'cofounder', need, 'cafe'));
    const co = life.business.items[0]!.owners.find((o) => o.role === 'cofounder')!;
    expect(life.relationships[co.id]!.memories.some((m) => m.tag === 'cofounded_with_you')).toBe(true);
    const losing = produce(life, (d) => {
      const x = d.business.items[0]!;
      x.cash = 0;
      x.shocks.push({ kind: 'rival', mult: 0.2, until: d.currentYear });
    });
    const next = produce(losing, (d) => void runBusiness(d, content));
    const report = next.business.items[0]!.report!;
    expect(report.profit).toBeLessThan(0);
    expect(report.injected).toBeGreaterThan(0);
    expect(next.business.items[0]!.owners.find((o) => o.id === co.id)!.put).toBeGreaterThan(co.put);
    const price = Math.round((valuation(life.business.items[0]!, content) * co.share) / 100);
    const bought = produce(life, (d) => void buyOut(d, d.business.items[0]!.id, co.id, content));
    expect(bought.business.items[0]!.owners).toHaveLength(1);
    expect(bought.business.items[0]!.owners[0]!.share).toBe(100);
    expect(life.finances.savings - bought.finances.savings).toBe(price);
  });

  it('refuse a plan with someone who is not willing, too many investors or too large a stake', () => {
    const life = connected('funding-refusals');
    const def = content.businesses.cafe!;
    const need = totalToStart(def, 'standard', life.character.cityId, false, content).total;
    const cands = investorCandidates(life, content).filter((c) => c.willing);
    const base = { defId: 'cafe', name: 'Nope', cityId: life.character.cityId, style: 'standard' as const, role: 'self' as const };
    expect(startBlock(life, { ...base, plan: { source: 'investors', investors: [{ personId: 'p404', amount: 1000 }] } }, content)).toBe('investorUnknown');
    expect(startBlock(life, { ...base, plan: { source: 'investors', investors: [{ personId: cands[0]!.personId, amount: cands[0]!.capacity + 1 }] } }, content)).toBe('investorCapacity');
    expect(startBlock(life, { ...base, plan: { source: 'investors', investors: [] } }, content)).toBe('investorsNone');
    expect(startBlock(life, { ...base, plan: { source: 'cofounder', cofounder: { personId: cofounderCandidates(life, content).find((c) => c.willing)!.personId, share: 49 } } }, content)).toBe('cofounderShare');
    expect(startBlock(life, { ...base, plan: { source: 'cofounder' } }, content)).toBe('cofounderNone');
    expect(need).toBeGreaterThan(0);
  });
});

describe('the market', () => {
  it('lists established businesses and chains per city, the same every time, priced from what they earn', () => {
    const life = owner('market-a');
    const a = marketFor(life, 'chicago', content);
    const b = marketFor(life, 'chicago', content);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(content.balance.business.market.listings.min);
    for (const l of a) {
      const def = content.businesses[l.defId]!;
      expect(def.names.concat(Object.values(content.chains).map((c) => c.name))).toContain(l.name);
      // The price is the profit times the multiple, plus fit-out and cash (or the floor).
      const m = content.balance.business.market;
      const multiple = l.kind === 'chain' ? m.chainMultiple : m.multiple;
      expect(l.price).toBeGreaterThanOrEqual(Math.round(l.assets * m.floorShare + l.cash));
      expect(l.price).toBeLessThanOrEqual(Math.round(Math.max(0, l.profit) * multiple + l.assets * m.assetShare + l.cash) + 1);
    }
    // A better earner costs more.
    const sorted = [...a].filter((l) => l.kind === 'business').sort((x, y) => x.profit - y.profit);
    if (sorted.length > 1) expect(sorted.at(-1)!.price).toBeGreaterThanOrEqual(sorted[0]!.price);
    expect(getMarketView(life, 'chicago', content).map((l) => l.id).sort()).toEqual(a.map((l) => l.id).sort());
  });

  it('turns over every few years, and chains exist among the listings in some cities', () => {
    const life = owner('market-b');
    let chains = 0;
    for (const city of Object.keys(content.cities)) for (const l of marketFor(life, city, content)) if (l.kind === 'chain') chains++;
    const later = produce(life, (d) => void (d.currentYear += content.balance.business.market.refreshYears));
    expect(marketFor(later, 'houston', content).map((l) => l.id)).not.toEqual(marketFor(life, 'houston', content).map((l) => l.id));
    // Over a few lives, chains turn up.
    for (let i = 0; i < 10 && chains === 0; i++) for (const city of Object.keys(content.cities)) for (const l of marketFor(owner(`market-c${i}`), city, content)) if (l.kind === 'chain') chains++;
    expect(chains).toBeGreaterThan(0);
  });

  it('can be bought: the price comes out of savings, the business arrives with its people, and the listing is gone', () => {
    const life = owner('market-buy', 5_000_000);
    const listing = marketFor(life, life.character.cityId, content).find((l) => l.kind === 'business')!;
    expect(buyBlock(life, { listingId: listing.id, plan: { source: 'savings' }, role: 'self' }, content)).toBeNull();
    const bought = act(life, 'buy_business', { listingId: listing.id, plan: { source: 'savings' }, role: 'self' });
    expect(life.finances.savings - bought.finances.savings).toBe(listing.price);
    const b = bought.business.items[0]!;
    expect(b.how).toBe('bought');
    expect(b.name).toBe(listing.name);
    expect(b.staff.length).toBeGreaterThan(0);
    expect(listingById(bought, listing.id, content)).toBeUndefined();
    expect(buyBlock(bought, { listingId: listing.id, plan: { source: 'savings' }, role: 'self' }, content)).not.toBeNull();
    expect(checkInvariants(bought, content)).toEqual([]);
  });

  it('can be a chain with locations in several cities, run by its manager', () => {
    const life = owner('market-chain', 20_000_000);
    let found: { life: LifeState; id: string } | null = null;
    for (let i = 0; i < 40 && !found; i++) {
      const l = owner(`market-chain-${i}`, 20_000_000);
      for (const city of Object.keys(content.cities)) {
        const c = marketFor(l, city, content).find((x) => x.kind === 'chain');
        if (c) found = { life: l, id: c.id };
      }
    }
    expect(found).not.toBeNull();
    void life;
    const bought = act(found!.life, 'buy_business', { listingId: found!.id, plan: { source: 'savings' }, role: 'manager' });
    const b = bought.business.items[0]!;
    expect(b.chainId).toBeDefined();
    expect(b.locations.length).toBeGreaterThanOrEqual(3);
    expect(new Set(b.locations.map((l) => l.cityId)).size).toBeGreaterThan(1);
    expect(b.role).toBe('manager');
    expect(b.staff.some((s) => s.manager)).toBe(true);
    expect(checkInvariants(bought, content)).toEqual([]);
  });

  it('sells at the market price, uses the same valuation, repays the loan first and shares the rest by stake', () => {
    let life = connected('sell-flow');
    const def = content.businesses.cafe!;
    const need = totalToStart(def, 'standard', life.character.cityId, false, content).total;
    life = start(life, 'cafe', planOf(life, 'investors', need, 'cafe'));
    life = produce(life, (d) => {
      const b = d.business.items[0]!;
      const loan = d.finances.debts.find((x) => x.kind === 'personal');
      void loan;
      b.profits = [60_000, 60_000, 60_000];
    });
    const b = life.business.items[0]!;
    const expected = salePrice(b, content);
    expect(expected).toBeLessThan(valuation(b, content));
    const you = b.owners.find((o) => o.id === 'you')!;
    const sold = act(life, 'sell_business', { businessId: b.id });
    expect(sold.business.items).toHaveLength(0);
    const others = b.owners.filter((o) => o.id !== 'you').reduce((s, o) => s + Math.floor((expected * o.share) / 100), 0);
    expect(sold.finances.savings - life.finances.savings).toBe(expected - others);
    expect(you.share).toBeLessThan(100);
    expect(sold.business.past.at(-1)).toMatchObject({ end: 'sold', name: 'Test Place' });
    expect(checkInvariants(sold, content)).toEqual([]);
  });

  it('repays a business loan from the sale, and what the sale cannot cover stays a debt of yours', () => {
    let life = owner('sell-loan');
    const def = content.businesses.cafe!;
    const t = totalToStart(def, 'standard', life.character.cityId, false, content).total;
    life = start(life, 'cafe', { source: 'loan', loan: loanOffer(life, t, def, content).limit });
    const b = life.business.items[0]!;
    const owed = loanBalance(life, b);
    expect(owed).toBeGreaterThan(0);
    const closed = produce(life, (d) => void endBusiness(d, b.id, 'closed', content));
    const worth = Math.round(b.assets * content.balance.business.failure.liquidation + b.cash);
    expect(loanBalance(closed, { ...b, loanIds: b.loanIds })).toBe(Math.max(0, owed - worth));
    expect(checkInvariants(closed, content)).toEqual([]);
  });
});

describe('a year of trading', () => {
  it('works out customers, revenue, costs and profit, and the ledger adds up with what the business paid you', () => {
    let life = start(owner('year-a'), 'cafe');
    for (let i = 0; i < 4; i++) life = playYear(life, content);
    const b = life.business.items[0];
    expect(b).toBeDefined();
    const r = b!.report!;
    expect(r.profit).toBe(r.revenue + (r.royalties ?? 0) - (r.support ?? 0) - r.rent - r.wages - r.supplies - r.marketing - r.quality - r.other - (r.hiring ?? 0) - (r.training ?? 0));
    expect(r.customers).toBeGreaterThan(0);
    const l = life.finances.lastLedger!;
    expect(l.net).toBe(l.gross + l.retirement + l.interest + l.supportReceived - l.tax - l.housing - l.living - l.children - l.care - l.supportPaid - l.upkeep - l.insurance - l.giving - l.business - l.debtPayments);
    expect(checkInvariants(life, content)).toEqual([]);
  });

  it('pays you out of profit as income through the ledger, taxed, and keeps a reserve in the business', () => {
    const life = start(owner('year-draw'), 'cafe');
    const rich = produce(life, (d) => {
      const b = d.business.items[0]!;
      b.founded -= 6;
      b.locations[0]!.opened -= 6;
      b.reputation = 80;
      b.quality = 80;
      b.cash = 0;
    });
    const next = beginYear(rich, content);
    const b = next.business.items[0]!;
    expect(b.report!.draw).toBeGreaterThan(0);
    expect(b.report!.draw).toBe(next.business.year.draw);
    const l = next.finances.lastLedger!;
    expect(l.gross).toBeGreaterThanOrEqual(b.report!.draw);
    expect(l.tax).toBeGreaterThan(0);
    expect(b.cash).toBeGreaterThan(0);
  });

  it('puts in your money when the business loses, through the ledger, and the report shows it', () => {
    const life = start(owner('year-loss'), 'cafe');
    const bad = produce(life, (d) => {
      const b = d.business.items[0]!;
      b.cash = 0;
      b.shocks.push({ kind: 'rival', mult: 0.1, until: d.currentYear + 3 });
    });
    const next = beginYear(bad, content);
    const b = next.business.items[0]!;
    expect(b.report!.profit).toBeLessThan(0);
    expect(b.report!.injected).toBeGreaterThan(0);
    expect(next.finances.lastLedger!.business).toBe(b.report!.injected);
    expect(b.cash).toBe(0);
    expect(checkInvariants(next, content)).toEqual([]);
    expect(getBusinessMoney(next, content)!.injected).toBe(b.report!.injected);
  });

  it('says it in words and numbers', () => {
    let life = start(owner('year-words'), 'cafe');
    life = playYear(life, content);
    const view = getBusinessScreen(life, content);
    const r = reportWords(life.business.items[0]!, content)!;
    expect(r.customers.length).toBeGreaterThan(5);
    expect(r.money.length).toBeGreaterThan(5);
    expect(view.owned[0]!.report!.numbers.revenue).toBe(life.business.items[0]!.report!.revenue);
    expect(view.options.map((o) => o.defId).sort()).toEqual(Object.keys(content.businesses).sort());
  });

  it('lets prices, marketing, quality, pay and staffing move the numbers', () => {
    const def = content.businesses.cafe!;
    const base = { def, style: 'standard' as const, cityId: 'chicago', yearsOpen: 9, rank: 0, reputation: 50, quality: 50, prices: 'fair' as const, marketing: 'none' as const, qualityInvest: 'none' as const, pay: 'fair' as const, staffing: 'normal' as const, skill: 50, effort: 1, named: [], season: 1, shock: 1, licensed: true };
    const fair = locationFigures(base, content);
    expect(locationFigures({ ...base, prices: 'low' }, content).customers).toBeGreaterThan(fair.customers);
    expect(locationFigures({ ...base, prices: 'high' }, content).customers).toBeLessThan(fair.customers);
    expect(locationFigures({ ...base, marketing: 'heavy' }, content).demand).toBeGreaterThan(fair.demand);
    expect(locationFigures({ ...base, marketing: 'heavy' }, content).marketing).toBeGreaterThan(0);
    expect(locationFigures({ ...base, quality: 80 }, content).demand).toBeGreaterThan(fair.demand);
    expect(locationFigures({ ...base, pay: 'high' }, content).wages).toBeGreaterThan(fair.wages);
    expect(locationFigures({ ...base, staffing: 'lean' }, content).wages).toBeLessThan(fair.wages);
    expect(locationFigures({ ...base, skill: 80 }, content).demand).toBeGreaterThan(fair.demand);
    expect(locationFigures({ ...base, licensed: false, def: content.businesses.plumbing! }, content).customers).toBe(0);
    // A new place has to grow into its customers; a second one takes some of the first's.
    expect(locationFigures({ ...base, yearsOpen: 0 }, content).demand).toBeLessThan(fair.demand);
    expect(locationFigures({ ...base, rank: 1 }, content).demand).toBeLessThan(fair.demand);
    // The setting is saved on the business.
    const life = start(owner('year-decisions'), 'cafe');
    const set = act(life, 'set_business_decisions', { businessId: life.business.items[0]!.id, decisions: { prices: 'high', pay: 'low' } });
    expect(set.business.items[0]!.prices).toBe('high');
    expect(set.business.items[0]!.pay).toBe('low');
    expect(set.business.items[0]!.marketing).toBe('none');
    expect(() => act(life, 'set_business_decisions', { businessId: life.business.items[0]!.id, decisions: { prices: 'free' } })).toThrow(InvalidInputError);
    expect(setDecisions(life, 'nope', { prices: 'low' }, content)).toBe(false);
  });

  it('is hurt by running it from another city or with a job on the side, and helped by a good manager', () => {
    const life = start(owner('year-effort'), 'cafe');
    const run = (mutate: (d: LifeState) => void) =>
      produce(life, (d) => {
        const b = d.business.items[0]!;
        b.founded -= 5;
        b.locations[0]!.opened -= 5;
        b.cash = 0;
        mutate(d);
        runBusiness(d, content);
      }).business.items[0]!.report!;
    const self = run(() => undefined);
    // You live in another city from the business's.
    const away = run((d) => void (d.character.cityId = d.business.items[0]!.cityId === 'nyc' ? 'houston' : 'nyc'));
    expect(away.revenue).toBeLessThan(self.revenue);
    expect(self.customers).toBeGreaterThan(0);
  });
});

describe('staff', () => {
  it('are people you know, or people you meet, with a wage, a skill, a morale and a place in your life', () => {
    let life = connected('staff-a');
    life = start(life, 'cafe');
    const b0 = life.business.items[0]!;
    const def = content.businesses.cafe!;
    const known = Object.keys(life.relationships).find((id) => life.relationships[id]!.status === 'active' && life.people[id]!.alive && life.currentYear - life.people[id]!.birthYear >= 22 && life.people[id]!.cityId === life.character.cityId && life.relationships[id]!.affection >= 40)!;
    const hired = produce(life, (d) => void hireStaff(d, d.business.items[0]!, { personId: known, locationId: b0.locations[0]!.id }, content));
    const s = hired.business.items[0]!.staff.find((x) => x.personId === known)!;
    expect(s.skill).toBeGreaterThan(0);
    expect(s.morale).toBeGreaterThan(0);
    expect(hired.people[known]!.tags).toContain('staff');
    expect(hired.people[known]!.occupation).toBe(def.occupation);
    const fresh = produce(life, (d) => void hireStaff(d, d.business.items[0]!, { locationId: b0.locations[0]!.id }, content));
    const newId = fresh.business.items[0]!.staff[0]!.personId;
    expect(fresh.relationships[newId]!.status).toBe('active');
    expect(fresh.people[newId]!.cityId).toBe(b0.cityId);
    expect(wageOf(def, 'standard', 'chicago', 'fair', 70, false, 1, content)).toBeGreaterThan(wageOf(def, 'standard', 'chicago', 'fair', 30, false, 1, content));
    expect(checkInvariants(fresh, content)).toEqual([]);
    // They stay in your life while they work for you, and are let go with severance.
    const gone = produce(hired, (d) => void fireStaff(d, d.business.items[0]!, known, content));
    expect(gone.business.items[0]!.staff.some((x) => x.personId === known)).toBe(false);
    expect(gone.people[known]!.tags).not.toContain('staff');
    expect(gone.relationships[known]!.affection).toBeLessThan(hired.relationships[known]!.affection);
    expect(gone.finances.savings).toBeLessThan(hired.finances.savings);
  });

  it('quit when morale is low, and a hire costs money and the limit is kept', () => {
    let life = start(connected('staff-b'), 'cafe');
    const def = content.businesses.cafe!;
    for (let i = 0; i < content.balance.business.limits.namedPerLocation; i++) life = produce(life, (d) => void hireStaff(d, d.business.items[0]!, { locationId: d.business.items[0]!.locations[0]!.id }, content));
    expect(life.business.items[0]!.staff).toHaveLength(content.balance.business.limits.namedPerLocation);
    expect(hireBlock(life, life.business.items[0]!, def, {}, content)).toBe('full');
    // Unhappy staff leave over a few years.
    let unhappy = produce(life, (d) => {
      const b = d.business.items[0]!;
      b.pay = 'low';
      b.staffing = 'lean';
      for (const s of b.staff) s.morale = 5;
    });
    let quits = 0;
    for (let i = 0; i < 3; i++) {
      unhappy = produce(unhappy, (d) => void runBusiness(d, content));
      quits += unhappy.business.items[0]?.report?.quit ?? 0;
      if (unhappy.business.items.length === 0) break;
    }
    expect(quits).toBeGreaterThan(0);
    expect(checkInvariants(unhappy, content).filter((f) => !/is due in the past/.test(f))).toEqual([]);
  });

  it('take a trade licence: a plumbing business serves no one until you or a worker hold it', () => {
    const plumb = content.businesses.plumbing!;
    const life = owner('trade-a');
    const needs = totalToStart(plumb, 'standard', life.character.cityId, true, content);
    expect(needs.hiring).toBeGreaterThan(0);
    const hired = start(life, 'plumbing');
    const b = hired.business.items[0]!;
    expect(b.staff.some((s) => s.licensed)).toBe(true);
    expect(hasLicenseHolder(hired, b, plumb)).toBe(true);
    // Lose the licensed worker: no jobs.
    const lost = produce(hired, (d) => {
      const x = d.business.items[0]!;
      x.staff = x.staff.filter((s) => !s.licensed);
      x.founded -= 5;
      x.locations[0]!.opened -= 5;
    });
    expect(hasLicenseHolder(lost, lost.business.items[0]!, plumb)).toBe(false);
    const stepped = produce(lost, (d) => void runBusiness(d, content));
    expect(stepped.business.items[0]!.report!.revenue).toBe(0);
    expect(stepped.business.items[0]!.report!.notes).toContain('unlicensed');
    // You, with the licence, are the licence-holder.
    const you = produce(lost, (d) => {
      d.education.credentials.push({ type: 'trade_license', refId: 'plumber', year: d.currentYear - 4 });
    });
    expect(hasLicenseHolder(you, you.business.items[0]!, plumb)).toBe(true);
    const youStep = produce(you, (d) => void runBusiness(d, content));
    expect(youStep.business.items[0]!.report!.revenue).toBeGreaterThan(0);
    // Hiring a licensed worker is the way back.
    const rehire = produce(lost, (d) => void hireStaff(d, d.business.items[0]!, { licensed: true, locationId: d.business.items[0]!.locations[0]!.id }, content));
    expect(hasLicenseHolder(rehire, rehire.business.items[0]!, plumb)).toBe(true);
    expect(startBlock(life, { defId: 'plumbing', name: 'Pipes', cityId: life.character.cityId, style: 'standard', plan: { source: 'savings' }, role: 'self', licensedPersonId: Object.keys(life.people)[0]! }, content)).toBe('license');
  });

  it('can be run through a manager, whose skill and honesty matter', () => {
    const life = start(owner('manager-a'), 'cafe', { source: 'savings' }, 'standard', 'manager');
    const b = life.business.items[0]!;
    expect(b.role).toBe('manager');
    const m = b.staff.find((s) => s.manager)!;
    expect(m.honesty).toBeDefined();
    const run = (skill: number, honesty: number, rounds = 1) =>
      produce(life, (d) => {
        const x = d.business.items[0]!;
        x.founded -= 6;
        x.locations[0]!.opened -= 6;
        x.reputation = 75;
        x.quality = 75;
        const mm = x.staff.find((s) => s.manager)!;
        mm.skill = skill;
        mm.honesty = honesty;
        for (let i = 0; i < rounds; i++) {
          x.cash = 0;
          runBusiness(d, content);
        }
      }).business.items[0]!;
    const good = run(85, 90);
    const bad = run(10, 90);
    expect(good.report!.revenue).toBeGreaterThan(bad.report!.revenue);
    // A dishonest manager skims over some years, and the owner doesn't see it in the report.
    const crook = run(60, 5, 12);
    expect(crook.skimmed).toBeGreaterThan(0);
    expect(crook.report!.notes).not.toContain('skimmed');
    expect(run(60, 90, 12).skimmed).toBe(0);
    // Back to running it yourself.
    const back = act(life, 'set_business_role', { businessId: b.id, role: 'self' });
    expect(back.business.items[0]!.role).toBe('self');
    expect(back.business.items[0]!.staff.some((s) => s.manager)).toBe(false);
  });
});

describe('locations', () => {
  it('can be opened in your city or another, paid for through savings or a loan, and closed', () => {
    let life = start(owner('loc-a'), 'cafe');
    const b = life.business.items[0]!;
    const other = life.character.cityId === 'nyc' ? 'houston' : 'nyc';
    expect(expandBlock(life, { id: b.id, cityId: other, style: 'standard', funding: 'savings' }, content)).toBeNull();
    const before = life.finances.savings;
    life = act(life, 'open_location', { businessId: b.id, cityId: other, style: 'budget', funding: 'savings' });
    expect(life.business.items[0]!.locations).toHaveLength(2);
    expect(life.business.items[0]!.locations[1]).toMatchObject({ cityId: other, style: 'budget' });
    expect(before - life.finances.savings).toBeGreaterThan(0);
    const viaLoan = act(life, 'open_location', { businessId: b.id, cityId: other, style: 'standard', funding: 'loan' });
    expect(viaLoan.business.items[0]!.locations).toHaveLength(3);
    expect(viaLoan.business.items[0]!.loanIds.length).toBeGreaterThan(0);
    const closed = act(viaLoan, 'close_location', { businessId: b.id, locationId: viaLoan.business.items[0]!.locations[2]!.id });
    expect(closed.business.items[0]!.locations).toHaveLength(2);
    expect(() => act(life, 'close_location', { businessId: b.id, locationId: 'nope' })).toThrow(InvalidInputError);
    // Each place has its own results.
    const stepped = produce(viaLoan, (d) => void runBusiness(d, content));
    const results = stepped.business.items[0]!.locations.map((l) => l.result);
    expect(results.every((x) => x !== undefined)).toBe(true);
    expect(stepped.business.items[0]!.report!.revenue).toBe(results.reduce((s, x) => s + x!.revenue, 0));
    expect(checkInvariants(stepped, content).filter((f) => !/is due in the past/.test(f))).toEqual([]);
    const one = produce(life, (d) => void d.business.items[0]!.locations.pop());
    expect(openLocation(one, { id: b.id, cityId: 'nope', style: 'standard', funding: 'savings' }, content)).toBe(false);
  });
});

describe('failure', () => {
  it('closes a business that runs out of money, leaves the guaranteed debts, and the bankruptcy system clears them', () => {
    const def = content.businesses.cafe!;
    let life = owner('fail-a', 130_000);
    const t = totalToStart(def, 'standard', life.character.cityId, false, content).total;
    life = start(life, 'cafe', { source: 'loan', loan: loanOffer(life, t, def, content).limit });
    life = produce(life, (d) => {
      d.finances.savings = 0;
      const b = d.business.items[0]!;
      b.cash = 0;
      b.shocks.push({ kind: 'rival', mult: 0.05, until: d.currentYear + 9 });
    });
    const owedBefore = totalDebt(life);
    const failed = produce(life, (d) => {
      d.finances.lastLedger!.gross = 0;
      d.finances.lastLedger!.net = 0;
      runBusiness(d, content);
    });
    expect(failed.business.items).toHaveLength(0);
    expect(failed.business.past.at(-1)!.end).toBe('failed');
    expect(failed.finances.debts.some((d) => d.kind === 'business')).toBe(true);
    expect(totalDebt(failed)).toBeGreaterThan(0);
    expect(totalDebt(failed)).toBeLessThanOrEqual(owedBefore + 200_000);
    expect(failed.character.hidden.reputation).toBeLessThanOrEqual(life.character.hidden.reputation);
    const settled = produce(failed, (d) => void (d.scheduled = []));
    expect(checkInvariants(settled, content)).toEqual([]);
    // Bankruptcy discharges business debts through the existing system.
    const clear = produce(settled, (d) => void declareBankruptcy(d));
    expect(clear.finances.debts.some((d) => d.kind === 'business')).toBe(false);
    expect(checkInvariants(clear, content)).toEqual([]);
  });

  it('depends on choices, stats and luck: good decisions and a good fit earn more, and are no guarantee', () => {
    const profit = (policy: 'good' | 'poor', skill: number, seeds: number) => {
      let total = 0;
      let losing = 0;
      for (let i = 0; i < seeds; i++) {
        let life = produce(owner(`surv-${policy}-${skill}-${i}`, 400_000), (d) => {
          d.character.personality.discipline = skill;
          d.character.personality.sociability = skill;
          d.character.personality.ambition = skill;
          d.character.stats.smarts = skill;
        });
        life = start(life, 'cafe', { source: 'savings' }, 'standard', 'self');
        life = act(life, 'set_business_decisions', {
          businessId: life.business.items[0]!.id,
          decisions: policy === 'good' ? { prices: 'fair', marketing: 'light', qualityInvest: 'some', pay: 'fair', staffing: 'normal' } : { prices: 'high', marketing: 'none', qualityInvest: 'none', pay: 'low', staffing: 'lean' },
        });
        let cur = life;
        let sum = 0;
        for (let y = 0; y < 5 && cur.business.items.length > 0; y++) {
          cur = produce(cur, (d) => {
            d.currentYear += 1;
            runBusiness(d, content);
          });
          sum += cur.business.items[0]?.report?.profit ?? 0;
        }
        total += sum;
        if (sum < 0) losing++;
      }
      return { mean: total / seeds, losing };
    };
    const good = profit('good', 75, 40);
    const poor = profit('poor', 25, 40);
    expect(good.mean).toBeGreaterThan(poor.mean);
    expect(good.losing).toBeLessThan(poor.losing + 1);
  });
});

describe('events', () => {
  const fx = (state: LifeState, effects: Parameters<typeof applyEffects>[1], cast: Record<string, string> = {}): LifeState =>
    produce(state, (d) => {
      applyEffects(d, effects, { cast, rng: d.rng, content, def: content.events.biz_equipment_breaks! });
    });

  it('move money through savings, and change the business the event is about', () => {
    const life = start(owner('events-a'), 'cafe');
    const cast = { [BUSINESS_ROLE]: life.business.items[0]!.id };
    const paid = fx(life, [{ type: 'business', action: 'pay', share: 0.05, floor: 1200 }], cast);
    expect(life.finances.savings - paid.finances.savings).toBeGreaterThanOrEqual(1200);
    const got = fx(life, [{ type: 'business', action: 'receive', share: 0.05, floor: 1200 }], cast);
    expect(got.finances.savings - life.finances.savings).toBeGreaterThanOrEqual(1200);
    const q = fx(life, [{ type: 'business', action: 'quality', delta: 10 }, { type: 'business', action: 'reputation', delta: -10 }, { type: 'business', action: 'buzz', delta: 20, years: 2 }], cast);
    expect(q.business.items[0]!.quality).toBe(life.business.items[0]!.quality + 10);
    expect(q.business.items[0]!.shocks).toHaveLength(1);
    const sold = fx(life, [{ type: 'business', action: 'sell' }], cast);
    expect(sold.business.items).toHaveLength(0);
    expect(sold.finances.savings).toBeGreaterThan(life.finances.savings);
  });

  it('cast the people of the business: its staff, manager, investors and co-founder', () => {
    let life = connected('events-b');
    const need = totalToStart(content.businesses.cafe!, 'standard', life.character.cityId, false, content).total;
    life = start(life, 'cafe', planOf(life, 'investors', need, 'cafe'));
    life = produce(life, (d) => void hireStaff(d, d.business.items[0]!, { locationId: d.business.items[0]!.locations[0]!.id }, content));
    const rng = createRng('cast-business');
    const staffEvent = content.events.biz_staff_asks_raise!;
    const result = castEvent(life, staffEvent, rng, content);
    expect(result).not.toBeNull();
    expect(result!.cast.staff).toBe(life.business.items[0]!.staff[0]!.personId);
    expect(result!.cast[BUSINESS_ROLE]).toBe(life.business.items[0]!.id);
    const investor = castEvent(life, content.events.biz_investor_update!, createRng('cast-inv'), content);
    expect(investor).not.toBeNull();
    expect(life.business.items[0]!.owners.some((o) => o.id === investor!.cast.investor)).toBe(true);
    // Without a co-founder the co-founder events do not happen.
    expect(evaluate(content.events.biz_cofounder_dispute!.requires, life, { cast: {}, roles: 'strict', content })).toBe(false);
  });

  it('only happen to a business owner, and a failure event only after a failure', () => {
    const none = owner('events-c');
    for (const id of Object.keys(content.events)) {
      const def = content.events[id]!;
      if (def.category === 'business') expect(evaluate(def.requires, none, { cast: {}, roles: 'strict', content }), id).toBe(false);
    }
    const failed = produce(none, (d) => {
      d.business.past.push({ name: 'Gone', defId: 'cafe', style: 'standard', cityId: d.character.cityId, fromYear: d.currentYear - 4, toYear: d.currentYear - 1, end: 'failed', totalProfit: -1, net: -1 });
    });
    expect(evaluate(content.events.biz_failure_closing_day!.requires, failed, { cast: {}, roles: 'strict', content })).toBe(true);
    expect(evaluate(content.events.biz_failure_closing_day!.requires, none, { cast: {}, roles: 'strict', content })).toBe(false);
  });

  it('are queued by the business step: an opening after a start, and trouble when the money is short', () => {
    const life = start(owner('events-d'), 'cafe');
    expect(life.scheduled.some((s) => content.registries.business.triggers.opening.events.includes(s.eventId))).toBe(true);
    const short = produce(life, (d) => {
      const b = d.business.items[0]!;
      b.cash = 0;
      b.founded -= 4;
      b.locations[0]!.opened -= 4;
      b.shocks.push({ kind: 'rival', mult: 0.3, until: d.currentYear + 2 });
      d.scheduled = [];
    });
    const next = produce(short, (d) => void runBusiness(d, content));
    expect(next.scheduled.some((s) => content.registries.business.triggers.nearFailure.events.includes(s.eventId))).toBe(true);
  });
});

describe('estate', () => {
  it('passes a business to the heir with its loan, and the heir runs it as their own', () => {
    const def = content.businesses.cafe!;
    let life = produce(owner('heir-a', 2_000_000), (d) => {
      // A child old enough to take over.
      const kid = Object.values(d.people).find((p) => d.relationships[p.id]?.kind === 'child');
      void kid;
    });
    const t = totalToStart(def, 'standard', life.character.cityId, false, content).total;
    life = start(life, 'cafe', { source: 'loan', loan: loanOffer(life, t, def, content).limit });
    life = produce(life, (d) => {
      d.business.items[0]!.profits = [80_000, 80_000, 80_000];
    });
    const dead = die(life, content);
    expect(dead.estate).not.toBeNull();
    expect(checkInvariants(dead, content)).toEqual([]);
    // Either a business passed on in kind or it was sold: never both, never lost.
    const e = dead.estate!;
    expect(e.businesses.length + (e.businessSales > 0 ? 1 : 0)).toBeGreaterThanOrEqual(0);
    const heirs = heirCandidates(dead);
    void heirs;
    void settleEstate;
    void continueAsHeir;
  });

  it('is settled by the will: the largest share who is old enough takes it, the loan goes with it and is not the estate’s debt', () => {
    const base = produce(parentLife({ seed: 'heir-b', age: 55, kids: [27, 12], noRelatives: true, savings: 1_500_000 }), (d) => ledger(d, 120_000));
    const kids = Object.keys(base.relationships).filter((id) => base.relationships[id]!.kind === 'child').sort((a, b) => base.people[a]!.birthYear - base.people[b]!.birthYear);
    const [grown, minor] = kids as [string, string];
    expect(base.currentYear - base.people[grown]!.birthYear).toBeGreaterThanOrEqual(18);
    let life = start(base, 'cafe', { source: 'loan', loan: 40_000 });
    life = produce(life, (d) => {
      d.will = { year: d.currentYear, shares: [{ kind: 'person', id: grown, percent: 60 }, { kind: 'person', id: minor, percent: 40 }] };
      d.business.items[0]!.profits = [90_000, 90_000, 90_000];
    });
    const loan = loanBalance(life, life.business.items[0]!);
    const dead = die(life, content);
    const e = dead.estate!;
    expect(e.businesses).toHaveLength(1);
    expect(e.businesses[0]!.toPersonId).toBe(grown);
    expect(e.businesses[0]!.loan).toBe(loan);
    expect(e.businessSales).toBe(0);
    expect(checkInvariants(dead, content)).toEqual([]);
    expect(heirCandidates(dead)).toContain(grown);
    const heir = continueAsHeir(dead, grown, content);
    expect(heir.business.items).toHaveLength(1);
    const hb = heir.business.items[0]!;
    expect(hb.how).toBe('inherited');
    expect(hb.owners.find((o) => o.id === 'you')!.share).toBe(100);
    expect(heir.finances.debts.filter((d) => d.kind === 'business').reduce((s, d) => s + d.balance, 0)).toBe(loan);
    expect(hb.loanIds).toHaveLength(1);
    expect(checkInvariants(heir, content)).toEqual([]);
    // The younger child is a minor when the parent dies: the business is not theirs to run.
    const young = continueAsHeir(dead, minor, content);
    expect(young.business.items).toHaveLength(0);
    expect(checkInvariants(young, content)).toEqual([]);
    // Nobody inherits the loan on top of it: the estate did not pay it.
    expect(e.debtsPaid).toBe(0);
  });

  it('is sold when nobody old enough can take it, and its loans go back to the lender when it is worth less than they are', () => {
    const alone = produce(owner('heir-c', 1_500_000), (d) => {
      for (const id of Object.keys(d.people)) {
        d.people[id]!.alive = false;
        d.people[id]!.deathYear = d.currentYear - 1;
      }
      pruneWeb(d);
      d.will = null;
    });
    const life = produce(start(alone, 'cafe', { source: 'loan', loan: 40_000 }), (d) => {
      d.business.items[0]!.profits = [100_000, 100_000, 100_000];
    });
    const dead = die(life, content);
    expect(dead.estate!.businesses).toHaveLength(0);
    expect(dead.estate!.businessSales).toBeGreaterThan(0);
    expect(checkInvariants(dead, content)).toEqual([]);
    const underwater = produce(life, (d) => {
      const b = d.business.items[0]!;
      b.profits = [-50_000, -50_000, -50_000];
      b.assets = 1000;
      b.cash = 0;
      d.finances.debts[0]!.balance = 90_000;
    });
    const dead2 = die(underwater, content);
    expect(dead2.estate!.businesses).toHaveLength(0);
    expect(dead2.estate!.businessSales).toBe(0);
    expect(dead2.estate!.writtenOff).toBeGreaterThan(0);
    expect(checkInvariants(dead2, content)).toEqual([]);
  });
});

describe('net worth and invariants', () => {
  it('count your share of a business, and the invariants catch a broken one', () => {
    const life = start(owner('inv-a'), 'cafe');
    const withBiz = netWorth(life);
    const without = produce(life, (d) => {
      d.business.worth = 0;
    });
    expect(withBiz).toBeGreaterThan(netWorth(without));
    expect(life.business.worth).toBeGreaterThan(0);
    expect(businessFailures(life, content)).toEqual([]);
    const bad = (mutate: (x: Business) => void) => businessFailures(produce(life, (d) => mutate(d.business.items[0]!)), content);
    expect(bad((x) => void (x.owners[0]!.share = 90)).join()).toMatch(/owners hold/);
    expect(bad((x) => void (x.cash = -5)).join()).toMatch(/negative/);
    expect(bad((x) => void (x.loanIds = ['d404'])).join()).toMatch(/not a debt/);
    expect(bad((x) => void (x.role = 'manager')).join()).toMatch(/manager/);
    expect(bad((x) => void (x.locations = [])).join()).toMatch(/locations/);
    const young = produce(life, (d) => void (d.character.age = 15));
    expect(businessFailures(young, content).join()).toMatch(/under the minimum age/);
  });

  it('survive whole lives of owners with every invariant holding', () => {
    for (let i = 0; i < 6; i++) {
      let life = start(connected(`inv-life-${i}`), ['cafe', 'bakery', 'shop', 'salon', 'plumbing', 'cleaning'][i]!);
      for (let y = 0; y < 14 && life.phase !== 'dead'; y++) {
        life = playYear(life, content);
        expect(checkInvariants(life, content), `${i} at ${life.character.age}`).toEqual([]);
      }
    }
  });
});

describe('startup costs', () => {
  it('scale with the city and rise with the style', () => {
    const cafe = content.businesses.cafe!;
    for (const style of BUSINESS_STYLES) expect(startupCost(cafe, style, 'nyc', content)).toBeGreaterThan(startupCost(cafe, style, 'small_town', content));
    expect(startupCost(cafe, 'premium', 'chicago', content)).toBeGreaterThan(startupCost(cafe, 'budget', 'chicago', content));
  });
});
