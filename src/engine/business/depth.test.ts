/**
 * Business depth (B2): products and stock, the world (economy, suppliers, trends), the competition value, headcount and
 * the crew, transfers and location managers, training and turnover, limits, franchising, and the upgrade of a W3 save.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import type { BusinessStyle } from '../../content/schemas';
import { performAction } from '../actions';
import { InvalidInputError } from '../creation/input';
import { continueAsHeir, heirCandidates } from '../estate/heir';
import { die, parentLife } from '../estate/fixtures';
import { castEvent, uncast } from '../events/casting';
import { applyBusinessEffect } from './effects';
import { createPerson } from '../events/casting';
import { checkInvariants } from '../invariants';
import { createRng, nextUint32 } from '../rng';
import { lifeAtAge } from '../testFixtures';
import type { Business, LifeState } from '../types';
import { namedAt } from './crew';
import { franchiseConditions, franchiseEligible } from './franchise';
import { openLocation } from './found';
import { crewRoles, needs, presetHeads, staffedRatio } from './headcount';
import { businessFailures } from './invariants';
import { businessHolds } from './query';
import { parityFigures } from './parity';
import { competitionFx } from './trade';
import { hireStaff, promoteFromCrew, transferBlock, transferStaff, willingness } from './staff';
import { runBusiness } from './step';
import { economyPhase, supplierIndex, trendIndex } from './world';
import { getBusinessScreen } from './views';
import { staffNeed } from './model';

const ledger = (d: LifeState, gross = 60_000) => {
  d.finances.lastLedger = { year: d.currentYear - 1, gross, retirement: 0, tax: 0, housing: 0, living: 0, debtPayments: 0, interest: 0, debtInterest: 0, borrowed: 0, support: 0, children: 0, care: 0, supportPaid: 0, supportReceived: 0, upkeep: 0, insurance: 0, giving: 0, business: 0, net: gross };
};

function owner(seed: string, savings = 2_000_000): LifeState {
  return produce(lifeAtAge(seed, 32), (d) => {
    d.finances.savings = savings;
    d.finances.dirty = 0;
    ledger(d);
  });
}

const act = (life: LifeState, id: Parameters<typeof performAction>[1], biz: Record<string, unknown>) => performAction(life, id, { biz }, content);

function start(life: LifeState, defId: string, style: BusinessStyle = 'standard', role: 'self' | 'manager' = 'self'): LifeState {
  return act(life, 'start_business', { defId, name: 'Test Place', cityId: life.character.cityId, style, plan: { source: 'savings' }, role });
}

/** Runs the business step and clears the follow-ups it queued (a played year would have handled them). */
const step = (life: LifeState, mutate: (d: LifeState) => void = () => undefined): LifeState =>
  produce(life, (d) => {
    mutate(d);
    runBusiness(d, content);
    d.scheduled = [];
  });

/** Gives the life people to hire, in its city. */
function withPeople(life: LifeState, n = 6): LifeState {
  return produce(life, (d) => {
    const rng = createRng(`${d.seed}:people`);
    for (let i = 0; i < n; i++) {
      const id = createPerson(d, { kind: 'friend', presence: 'city', createIfMissing: true, age: { min: 25, max: 45 } }, rng, content);
      if (id) d.relationships[id]!.affection = 80;
    }
  });
}

const other = (life: LifeState): string => (life.character.cityId === 'nyc' ? 'houston' : 'nyc');

describe('the baseline (W3\'s totals)', () => {
  const cities = ['nyc', 'houston', 'small_town', 'london', 'mexico_city', 'toronto'];
  for (const defId of ['cafe', 'bakery', 'shop', 'salon', 'plumbing', 'cleaning']) {
    for (const style of ['budget', 'standard', 'premium'] as const) {
      it(`${defId}, ${style}: the default lines at fair prices and normal orders make W3's revenue and supplies in every city`, () => {
        for (const city of cities) {
          const p = parityFigures(content.businesses[defId]!, style, city, content);
          expect(p.revenue).toBeGreaterThan(1 - content.balance.business.products.parity);
          expect(p.revenue).toBeLessThan(1 + content.balance.business.products.parity);
          expect(p.supplies).toBeGreaterThan(1 - content.balance.business.products.parity);
          expect(p.supplies).toBeLessThan(1 + content.balance.business.products.parity);
          expect(Math.abs(p.customers - 1)).toBeLessThan(content.balance.business.products.parity);
        }
      });
    }
  }

  it('the staffing presets staff a location the way W3 did (the workers and the share of the need they meet)', () => {
    for (const def of Object.values(content.businesses)) {
      for (const style of ['budget', 'standard', 'premium'] as const) {
        for (const level of ['lean', 'normal', 'full'] as const) {
          const heads = presetHeads(def, style, level, content);
          const total = Object.values(heads).reduce((a, n) => a + n, 0);
          // Roles keep a minimum of nothing, so the preset is the old head count exactly.
          expect(total).toBe(staffNeed(def, style, level, content));
        }
        const normal = needs(def, style, content);
        expect(Object.values(normal).reduce((a, n) => a + n, 0)).toBe(staffNeed(def, style, 'normal', content));
      }
    }
  });

  it('the lean and generous presets meet about the share of the need that W3\'s head count did, and so serve about as many customers', () => {
    for (const def of Object.values(content.businesses)) {
      for (const style of ['budget', 'standard', 'premium'] as const) {
        const need = needs(def, style, content);
        for (const level of ['lean', 'full'] as const) {
          const heads = presetHeads(def, style, level, content);
          const slots = crewRoles(def).map((r) => ({ roleId: r.id, weight: r.weight, need: need[r.id] ?? 0, count: heads[r.id] ?? 0, skillSum: (heads[r.id] ?? 0) * 50 }));
          const staffed = staffedRatio(slots, def, style, content);
          const w3 = staffNeed(def, style, level, content) / def.styles[style].staff;
          expect(Math.abs(staffed - Math.min(1.25, w3))).toBeLessThan(0.2);
        }
      }
    }
  });

  it('every kind has product lines, roles that add up, and a shop that can choose its lines within the limit', () => {
    for (const def of Object.values(content.businesses)) {
      expect(def.products.length).toBeGreaterThanOrEqual(4);
      expect(crewRoles(def).reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 3);
      if (def.lineMode === 'services') for (const p of def.products) expect(p.pool).toBeDefined();
    }
    expect(content.businesses.shop!.lineMode).toBe('choose');
    expect(content.balance.business.products.maxLines).toEqual({ budget: 3, standard: 4, premium: 6 });
  });
});

describe('products and stock', () => {
  const base = () => start(owner('b2-stock'), 'bakery');
  const year = (life: LifeState, years = 2, mutate: (d: LifeState, i: number) => void = () => undefined) => {
    let next = life;
    for (let i = 0; i < years; i++) {
      next = produce(next, (d) => {
        mutate(d, i);
        runBusiness(d, content);
        d.scheduled = [];
        d.currentYear += 1;
      });
    }
    return next.business.items[0]!;
  };
  // A quiet, steady shop: no luck, so only the order level differs between runs.
  const calm = (d: LifeState) => {
    d.character.hidden.luck = 50;
    for (const b of d.business.items) b.cash = 5_000_000;
  };

  it('reports units sold, lost and wasted for every line, and the cost of goods, waste and sales lost', () => {
    const b = year(base(), 1, calm);
    const lines = b.report!.lines!;
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines.every((l) => l.sold >= 0 && l.lost >= 0 && l.spoiled >= 0 && l.revenue >= 0)).toBe(true);
    expect(b.report!.goodsCost).toBeGreaterThan(0);
    expect(b.report!.supplies).toBe(b.report!.goodsCost! + b.report!.waste! + (b.report!.supplies - b.report!.goodsCost! - b.report!.waste!));
    expect(b.report!.revenue).toBe(lines.reduce((s, l) => s + l.revenue, 0));
  });

  it('a lean order runs out more often and a heavy one wastes more', () => {
    // Over several years (a year's luck can hide either one): the totals of what was lost to empty shelves and what was thrown away.
    const run = (level: 'lean' | 'normal' | 'heavy') => {
      let life = base();
      let lost = 0;
      let waste = 0;
      for (let i = 0; i < 6; i++) {
        life = produce(life, (d) => {
          calm(d);
          for (const p of content.businesses.bakery!.products) d.business.items[0]!.orders[p.id] = level;
          runBusiness(d, content);
          d.scheduled = [];
          d.currentYear += 1;
        });
        lost += life.business.items[0]!.report!.lostSales!;
        waste += life.business.items[0]!.report!.waste!;
      }
      return { lost, waste };
    };
    const lean = run('lean');
    const normal = run('normal');
    const heavy = run('heavy');
    expect(lean.lost).toBeGreaterThan(normal.lost);
    expect(normal.lost).toBeGreaterThanOrEqual(heavy.lost);
    expect(heavy.waste).toBeGreaterThan(normal.waste);
    expect(normal.waste).toBeGreaterThan(lean.waste);
  });

  it('perishables spoil and durables carry over and cost to hold', () => {
    const shop = start(owner('b2-durable'), 'shop');
    const b = year(shop, 2, (d) => {
      calm(d);
      const biz = d.business.items[0]!;
      for (const p of content.businesses.shop!.products) biz.orders[p.id] = 'heavy';
    });
    const durable = b.locations[0]!.stock.clothes ?? 0;
    expect(durable).toBeGreaterThan(0);
    const bakery = year(base(), 2, (d) => {
      calm(d);
      for (const p of content.businesses.bakery!.products) d.business.items[0]!.orders[p.id] = 'heavy';
    });
    expect(bakery.locations[0]!.stock.bread ?? 0).toBe(0);
    expect(bakery.report!.lines!.find((l) => l.productId === 'bread')!.spoiled).toBeGreaterThan(0);
  });

  it('forecasts next year from what customers wanted, not from what was sold (no stockout spiral)', () => {
    const b1 = year(base(), 1, (d) => {
      calm(d);
      for (const p of content.businesses.bakery!.products) d.business.items[0]!.orders[p.id] = 'lean';
    });
    const loc = b1.locations[0]!;
    const sold = b1.report!.lines!.find((l) => l.productId === 'bread')!;
    expect(sold.lost).toBeGreaterThan(0);
    // The forecast holds the demand, which is more than the sales.
    expect(loc.forecast.bread!).toBeGreaterThanOrEqual(sold.demand);
  });

  it('a stockout costs reputation, capped for the year', () => {
    const lean = year(base(), 1, (d) => {
      calm(d);
      const b = d.business.items[0]!;
      b.reputation = 60;
      for (const p of content.businesses.bakery!.products) b.orders[p.id] = 'lean';
      for (const loc of b.locations) loc.forecast = Object.fromEntries(Object.keys(loc.forecast).map((k) => [k, 10]));
      // A forecast far below demand: the shelves empty.
      b.locations[0]!.forecast = { bread: 10, rolls: 10, cakes: 10, pastries: 10, custom_orders: 10 };
    });
    expect(lean.report!.notes).toContain('ranOut');
    expect(lean.report!.lostSales!).toBeGreaterThan(0);
  });

  it('a shop switches lines on and off within its limit, with a small restock fee; a menu line cannot be switched off', () => {
    const life = start(owner('b2-shop'), 'shop', 'budget');
    const id = life.business.items[0]!.id;
    expect(life.business.items[0]!.lines.filter((l) => l.on)).toHaveLength(3);
    expect(() => act(life, 'set_line', { businessId: id, productId: 'toys', on: true })).toThrow(InvalidInputError);
    const off = act(life, 'set_line', { businessId: id, productId: 'groceries', on: false });
    const swapped = act(off, 'set_line', { businessId: id, productId: 'toys', on: true });
    expect(swapped.business.items[0]!.lines.find((l) => l.productId === 'toys')!.on).toBe(true);
    expect(swapped.finances.savings).toBeLessThan(off.finances.savings);
    const cafe = start(owner('b2-menu'), 'cafe');
    expect(() => act(cafe, 'set_line', { businessId: cafe.business.items[0]!.id, productId: 'coffee', on: false })).toThrow(InvalidInputError);
  });

  it('sets a price level and an order level by validated actions', () => {
    const life = base();
    const id = life.business.items[0]!.id;
    const priced = act(life, 'set_line', { businessId: id, productId: 'bread', price: 'high' });
    expect(priced.business.items[0]!.lines.find((l) => l.productId === 'bread')!.price).toBe('high');
    const ordered = act(priced, 'set_order', { businessId: id, stockId: 'bread', level: 'heavy' });
    expect(ordered.business.items[0]!.orders.bread).toBe('heavy');
    expect(() => act(life, 'set_order', { businessId: id, stockId: 'nope', level: 'heavy' })).toThrow(InvalidInputError);
    expect(() => act(life, 'set_line', { businessId: id, productId: 'bread', price: 'free' })).toThrow(InvalidInputError);
    // The one-tap price still sets every line.
    const all = act(life, 'set_business_decisions', { businessId: id, decisions: { prices: 'low' } });
    expect(all.business.items[0]!.lines.every((l) => l.price === 'low')).toBe(true);
  });

  it('services draw on supply pools, ordered like a line', () => {
    const life = start(owner('b2-salon'), 'salon');
    const b = life.business.items[0]!;
    const pool = content.businesses.salon!.pools[0]!.id;
    const ordered = act(life, 'set_order', { businessId: b.id, stockId: pool, level: 'heavy' });
    expect(ordered.business.items[0]!.orders[pool]).toBe('heavy');
    const after = year(life, 1, calm);
    expect(Object.keys(after.locations[0]!.stock)).toContain(pool);
  });

  it('stock is inventory, not an expense: a heavy order does not make the year look like a loss, and the stock counts in value', () => {
    const heavy = year(base(), 2, (d) => {
      calm(d);
      for (const p of content.businesses.bakery!.products) d.business.items[0]!.orders[p.id] = 'heavy';
    });
    const normal = year(base(), 2, calm);
    expect(Math.abs(heavy.report!.profit - normal.report!.profit)).toBeLessThan(Math.abs(normal.report!.profit) * 0.6 + 20_000);
    const shop = start(owner('b2-inv'), 'shop');
    const held = year(shop, 2, (d) => {
      calm(d);
      for (const p of content.businesses.shop!.products) d.business.items[0]!.orders[p.id] = 'heavy';
    });
    expect(held.stockValue).toBeGreaterThan(0);
    expect(Number.isInteger(held.stockValue)).toBe(true);
  });
});

describe('the world: the economy, suppliers and trends', () => {
  it('are pure functions of the seed and the year', () => {
    const years = Array.from({ length: 30 }, (_, i) => 2030 + i);
    const a = years.map((y) => economyPhase('seed-a', y, content));
    const b = years.map((y) => economyPhase('seed-a', y, content));
    expect(a).toEqual(b);
    expect(years.map((y) => economyPhase('seed-b', y, content))).not.toEqual(a);
    expect(new Set(a).size).toBeGreaterThan(1);
    expect(supplierIndex('seed-a', 'coffee', 2040, content)).toBe(supplierIndex('seed-a', 'coffee', 2040, content));
    // Asked in a different order, the same.
    const late = supplierIndex('seed-a', 'coffee', 2051, content);
    supplierIndex('seed-a', 'coffee', 2033, content);
    expect(supplierIndex('seed-a', 'coffee', 2051, content)).toBe(late);
    const bal = content.balance.business;
    for (const y of years) {
      const idx = supplierIndex('seed-a', 'dairy', y, content);
      expect(idx).toBeGreaterThanOrEqual(bal.suppliers.min);
      expect(idx).toBeLessThanOrEqual(bal.suppliers.max);
      expect(trendIndex('seed-a', 'drinks', y, content)).toBeGreaterThanOrEqual(bal.trends.min);
    }
  });

  it('a life with no business draws nothing from its random numbers', () => {
    const life = lifeAtAge('b2-norng', 40);
    const after = produce(life, (d) => {
      runBusiness(d, content);
      economyPhase(d.seed, d.currentYear, content);
      supplierIndex(d.seed, 'coffee', d.currentYear, content);
    });
    expect(after.rng).toEqual(life.rng);
    expect(nextUint32({ ...life.rng })).toBe(nextUint32({ ...after.rng }));
  });

  it('the economy moves demand by each line\'s sensitivity: a boom year sells more than a recession year, treats more than repairs', () => {
    const phases = Array.from({ length: 400 }, (_, i) => economyPhase('wide', 2000 + i, content));
    const boom = 2000 + phases.indexOf('boom');
    const rec = 2000 + phases.indexOf('recession');
    expect(boom).toBeGreaterThanOrEqual(2000);
    expect(rec).toBeGreaterThanOrEqual(2000);
    const run = (year: number) =>
      produce(start(owner('wide'), 'cafe'), (d) => {
        d.seed = 'wide';
        d.currentYear = year;
        d.character.hidden.luck = 50;
        runBusiness(d, content);
      }).business.items[0]!.report!;
    const b = run(boom);
    const r = run(rec);
    expect(b.economy).toBe('boom');
    expect(r.economy).toBe('recession');
    expect(b.revenue).toBeGreaterThan(r.revenue);
  });

  it('the bank lends less in a recession', () => {
    const phases = Array.from({ length: 400 }, (_, i) => economyPhase('wide', 2000 + i, content));
    const loanIn = (year: number) => {
      const life = produce(owner('wide'), (d) => {
        d.seed = 'wide';
        d.currentYear = year;
      });
      return getBusinessScreen(life, content).options.length;
    };
    expect(loanIn(2000 + phases.indexOf('boom'))).toBeGreaterThan(0);
    expect(content.balance.business.economy.phases.recession.bank).toBeLessThan(content.balance.business.economy.phases.boom.bank);
  });
});

describe('competition', () => {
  it('a crowded city takes trade, more from an exposed line than a protected one, and a small town gives some; quality wins some back', () => {
    const def = content.businesses.cafe!;
    const coffee = def.products.find((p) => p.id === 'coffee')!;
    const beans = def.products.find((p) => p.id === 'beans_to_go')!;
    expect(competitionFx(coffee, 'nyc', 50, content)).toBeLessThan(1);
    expect(competitionFx(coffee, 'small_town', 50, content)).toBeGreaterThan(1);
    expect(competitionFx(coffee, 'nyc', 50, content)).toBeLessThan(competitionFx(beans, 'nyc', 50, content));
    expect(competitionFx(coffee, 'nyc', 90, content)).toBeGreaterThan(competitionFx(coffee, 'nyc', 50, content));
    expect(competitionFx(coffee, 'houston', 50, content)).toBeCloseTo(1, 5);
  });

  it('is used: against the rest of its menu, a café sells less coffee (easy to get elsewhere) in a crowded city than in a small town', () => {
    const run = (city: string) => {
      const life = produce(owner('comp'), (d) => {
        d.character.cityId = city;
      });
      const lines = produce(start(life, 'cafe'), (d) => {
        d.character.hidden.luck = 50;
        runBusiness(d, content);
      }).business.items[0]!.report!.lines!;
      return lines.find((l) => l.productId === 'coffee')!.demand / lines.find((l) => l.productId === 'pastries')!.demand;
    };
    expect(run('nyc')).toBeLessThan(run('small_town'));
  });
});

describe('headcount and the crew', () => {
  it('the preset fills the targets and the crew pools', () => {
    const life = start(owner('b2-hc'), 'cafe');
    const b = life.business.items[0]!;
    const loc = b.locations[0]!;
    expect(b.headcount[loc.id]).toEqual(presetHeads(content.businesses.cafe!, 'standard', 'normal', content));
    const heads = Object.values(b.headcount[loc.id]!).reduce((a, n) => a + n, 0);
    expect(b.crew.reduce((s, p) => s + p.count, 0)).toBe(heads);
    const full = act(life, 'set_business_decisions', { businessId: b.id, decisions: { staffing: 'full' } });
    expect(Object.values(full.business.items[0]!.headcount[loc.id]!).reduce((a, n) => a + n, 0)).toBe(staffNeed(content.businesses.cafe!, 'standard', 'full', content));
    expect(businessFailures(full, content)).toEqual([]);
  });

  it('steppers set a role\'s headcount within its range and the location\'s cap; the crew follows at the next step and the hire costs money', () => {
    const life = start(owner('b2-step'), 'cafe');
    const b = life.business.items[0]!;
    const loc = b.locations[0]!;
    const more = act(life, 'set_headcount', { businessId: b.id, locationId: loc.id, roleId: 'barista', count: 4 });
    expect(more.business.items[0]!.headcount[loc.id]!.barista).toBe(4);
    expect(() => act(life, 'set_headcount', { businessId: b.id, locationId: loc.id, roleId: 'barista', count: 99 })).toThrow(InvalidInputError);
    expect(() => act(life, 'set_headcount', { businessId: b.id, locationId: loc.id, roleId: 'nope', count: 1 })).toThrow(InvalidInputError);
    expect(() => act(life, 'set_headcount', { businessId: b.id, locationId: 'l99', roleId: 'barista', count: 1 })).toThrow(InvalidInputError);
    const next = step(more);
    const nb = next.business.items[0]!;
    expect(nb.crew.find((p) => p.roleId === 'barista')!.count).toBe(4);
    expect(nb.report!.hiring!).toBeGreaterThan(0);
    expect(nb.report!.heads).toBe(Object.values(nb.headcount[loc.id]!).reduce((a, n) => a + n, 0));
    expect(businessFailures(next, content)).toEqual([]);
  });

  it('more heads serve more customers and cost more; fewer save money and show in quality', () => {
    const life = start(owner('b2-serve'), 'cafe');
    const b = life.business.items[0]!;
    const loc = b.locations[0]!;
    const run = (count: number) =>
      step(life, (d) => {
        d.character.hidden.luck = 50;
        d.business.items[0]!.founded -= 5;
        d.business.items[0]!.locations[0]!.opened -= 5;
        d.business.items[0]!.headcount[loc.id] = { ...d.business.items[0]!.headcount[loc.id]!, barista: count };
      }).business.items[0]!.report!;
    const few = run(0);
    const some = run(2);
    expect(some.customers).toBeGreaterThanOrEqual(few.customers);
    expect(some.wages).toBeGreaterThan(few.wages);
  });

  it('a hire goes to the location and the role chosen (not always the first)', () => {
    let life = withPeople(start(owner('b2-hire'), 'cafe'));
    const b0 = life.business.items[0]!;
    life = act(life, 'open_location', { businessId: b0.id, cityId: life.character.cityId, style: 'standard', funding: 'savings' });
    const b = life.business.items[0]!;
    const second = b.locations[1]!;
    const hired = act(life, 'hire_staff', { businessId: b.id, locationId: second.id, roleId: 'shift_lead' });
    const person = hired.business.items[0]!.staff.at(-1)!;
    expect(person.locationId).toBe(second.id);
    expect(person.roleId).toBe('shift_lead');
    expect(namedAt(hired.business.items[0]!, second.id, 'shift_lead')).toBe(1);
    expect(namedAt(hired.business.items[0]!, b.locations[0]!.id, 'shift_lead')).toBe(0);
    expect(hired.business.items[0]!.headcount[second.id]!.shift_lead).toBeGreaterThanOrEqual(1);
    expect(businessFailures(hired, content)).toEqual([]);
    // A crew hire raises the target, and costs nothing until the year turns.
    const crew = act(hired, 'hire_staff', { businessId: b.id, locationId: second.id, roleId: 'barista', crew: true });
    expect(crew.business.items[0]!.headcount[second.id]!.barista).toBe(hired.business.items[0]!.headcount[second.id]!.barista! + 1);
    expect(crew.finances.savings).toBe(hired.finances.savings);
    expect(() => act(life, 'hire_staff', { businessId: b.id, locationId: 'l99' })).toThrow(InvalidInputError);
  });

  it('named people are capped by rule: per location and in all, not by a flat four', () => {
    let life = withPeople(start(owner('b2-cap', 4_000_000), 'cafe'), 10);
    const cap = content.balance.business.limits.namedPerLocation;
    for (let i = 0; i < cap; i++) life = act(life, 'hire_staff', { businessId: life.business.items[0]!.id });
    expect(life.business.items[0]!.staff).toHaveLength(cap);
    expect(() => act(life, 'hire_staff', { businessId: life.business.items[0]!.id })).toThrow(InvalidInputError);
    life = act(life, 'open_location', { businessId: life.business.items[0]!.id, cityId: life.character.cityId, style: 'standard', funding: 'savings' });
    const second = life.business.items[0]!.locations[1]!.id;
    life = act(life, 'hire_staff', { businessId: life.business.items[0]!.id, locationId: second });
    expect(life.business.items[0]!.staff.length).toBeGreaterThan(cap);
    expect(businessFailures(life, content)).toEqual([]);
  });

  it('promotes someone from the crew into a person, once, and no pool goes negative', () => {
    const life = start(owner('b2-promote'), 'cafe');
    const before = life.business.items[0]!.crew.reduce((s, p) => s + p.count, 0);
    const next = produce(life, (d) => {
      const id = promoteFromCrew(d, d.business.items[0]!, content);
      expect(id).not.toBeNull();
      expect(d.people[id!]!.tags).toContain('staff');
      expect(d.relationships[id!]).toBeDefined();
    });
    const nb = next.business.items[0]!;
    expect(nb.staff).toHaveLength(1);
    expect(nb.crew.reduce((s, p) => s + p.count, 0)).toBe(before - 1);
    expect(nb.crew.every((p) => p.count >= 0)).toBe(true);
    expect(businessFailures(next, content)).toEqual([]);
  });

  it('an event that casts a crew member makes them a person, and takes them back if the event is dropped', () => {
    const life = start(owner('b2-cast'), 'cafe');
    const def = content.events.biz_crew_star!;
    const next = produce(life, (d) => {
      d.business.items[0]!.reputation = 60;
      const cast = castEvent(d, def, createRng('cast'), content, { '@business': d.business.items[0]!.id });
      expect(cast).not.toBeNull();
      const id = cast!.cast.crew!;
      expect(d.business.items[0]!.staff.some((s) => s.personId === id)).toBe(true);
      uncast(d, cast!.created);
      expect(d.business.items[0]!.staff).toHaveLength(0);
      expect(d.people[id]).toBeUndefined();
    });
    expect(next.business.items[0]!.staff).toHaveLength(0);
  });
});

describe('training, morale and turnover', () => {
  it('training costs a share of payroll and lifts skill and morale; a low-paid crew leaves faster and replacing them costs money', () => {
    const life = start(owner('b2-train', 4_000_000), 'cafe');
    const run = (training: 'none' | 'lots') =>
      step(life, (d) => {
        d.character.hidden.luck = 50;
        d.business.items[0]!.training = training;
      }).business.items[0]!;
    const none = run('none');
    const lots = run('lots');
    expect(none.report!.training).toBe(0);
    expect(lots.report!.training!).toBeGreaterThan(0);
    expect(lots.crew[0]!.skill).toBeGreaterThan(none.crew[0]!.skill);
    expect(lots.crew[0]!.morale).toBeGreaterThan(none.crew[0]!.morale);
    // Over a few years an unhappy crew turns over, and it shows in the books.
    let unhappy = produce(life, (d) => {
      d.business.items[0]!.pay = 'low';
      for (const p of d.business.items[0]!.crew) p.morale = 5;
    });
    let lost = 0;
    let cost = 0;
    for (let i = 0; i < 5; i++) {
      unhappy = produce(unhappy, (d) => {
        for (const p of d.business.items[0]!.crew) p.morale = 5;
        runBusiness(d, content);
        d.scheduled = [];
        d.currentYear += 1;
      });
      lost += unhappy.business.items[0]?.report?.turnover ?? 0;
      cost += unhappy.business.items[0]?.report?.hiring ?? 0;
      if (unhappy.business.items.length === 0) break;
    }
    expect(lost).toBeGreaterThan(0);
    expect(cost).toBeGreaterThan(0);
  });

  it('an overworked crew (too few heads for the customers) wears down', () => {
    const life = start(owner('b2-work', 4_000_000), 'cafe');
    const loc = life.business.items[0]!.locations[0]!.id;
    const thin = step(life, (d) => {
      d.character.hidden.luck = 50;
      d.business.items[0]!.founded -= 5;
      d.business.items[0]!.locations[0]!.opened -= 5;
      d.business.items[0]!.headcount[loc] = { shift_lead: 0, barista: 1, cashier: 0 };
    }).business.items[0]!;
    expect(thin.report!.notes.some((n) => n === 'understaffed' || n === 'overworked')).toBe(true);
    expect(businessHolds({ understaffed: true }, step(life, (d) => {
      d.business.items[0]!.headcount[loc] = { shift_lead: 0, barista: 1, cashier: 0 };
    }), { '@business': thin.id }, content)).toBe(true);
  });
});

describe('transfers and location managers', () => {
  const twoPlaces = (seed: string, city = true): LifeState => {
    let life = withPeople(start(owner(seed, 4_000_000), 'cafe'), 8);
    life = act(life, 'open_location', { businessId: life.business.items[0]!.id, cityId: city ? life.character.cityId : other(life), style: 'standard', funding: 'savings' });
    return life;
  };

  it('a named person moves between locations in the same city for a small fee', () => {
    let life = twoPlaces('b2-move');
    life = act(life, 'hire_staff', { businessId: life.business.items[0]!.id });
    const b = life.business.items[0]!;
    const who = b.staff[0]!.personId;
    const to = b.locations[1]!.id;
    expect(transferBlock(life, b, who, to, content)).toBeNull();
    const moved = act(life, 'transfer_staff', { businessId: b.id, personId: who, locationId: to });
    expect(moved.business.items[0]!.staff[0]!.locationId).toBe(to);
    expect(moved.finances.savings).toBeLessThan(life.finances.savings);
    expect(moved.business.items[0]!.staff[0]!.morale).toBeLessThan(life.business.items[0]!.staff[0]!.morale);
    expect(businessFailures(moved, content)).toEqual([]);
    expect(() => act(moved, 'transfer_staff', { businessId: b.id, personId: who, locationId: to })).toThrow(InvalidInputError);
  });

  it('across cities the person must be willing (a number, never a roll), they move there, and someone with a family cannot', () => {
    let life = twoPlaces('b2-far', false);
    life = act(life, 'hire_staff', { businessId: life.business.items[0]!.id });
    const b = life.business.items[0]!;
    const s = b.staff[0]!;
    const to = b.locations[1]!;
    const happy = produce(life, (d) => {
      d.business.items[0]!.staff[0]!.morale = 95;
      d.relationships[s.personId]!.affection = 95;
      if (d.people[s.personId]!.life) {
        d.people[s.personId]!.life!.partner = null;
        d.people[s.personId]!.life!.children = [];
      }
    });
    expect(transferBlock(happy, happy.business.items[0]!, s.personId, to.id, content)).toBeNull();
    const moved = produce(happy, (d) => void transferStaff(d, d.business.items[0]!, s.personId, to.id, content));
    expect(moved.people[s.personId]!.cityId).toBe(to.cityId);
    expect(businessFailures(moved, content)).toEqual([]);
    const sad = produce(happy, (d) => {
      d.business.items[0]!.staff[0]!.morale = 0;
      d.relationships[s.personId]!.affection = 0;
    });
    expect(willingness(sad, sad.business.items[0]!, sad.business.items[0]!.staff[0]!, to.id, content)).toBeLessThan(willingness(happy, happy.business.items[0]!, happy.business.items[0]!.staff[0]!, to.id, content));
    expect(transferBlock(sad, sad.business.items[0]!, s.personId, to.id, content)).toBe('unwilling');
    const family = produce(happy, (d) => {
      d.people[s.personId]!.life = { tier: 'near', background: 'working', level: 0, levelSince: d.currentYear, partner: { first: 'Sam', birthYear: 1990, status: 'married' } as never, children: [], troubles: [], recovered: [], gossip: 50 };
    });
    expect(transferBlock(family, family.business.items[0]!, s.personId, to.id, content)).toBe('family');
  });

  it('a location manager runs their location; the business with managers does better across cities than one with none', () => {
    const build = (managers: boolean): Business => {
      let life = twoPlaces(`b2-mgr-${managers}`, false);
      life = act(life, 'hire_staff', { businessId: life.business.items[0]!.id, locationId: life.business.items[0]!.locations[1]!.id });
      if (managers) life = act(life, 'appoint_manager', { businessId: life.business.items[0]!.id, personId: life.business.items[0]!.staff[0]!.personId, locationId: life.business.items[0]!.locations[1]!.id });
      expect(businessFailures(life, content)).toEqual([]);
      return produce(life, (d) => {
        d.character.hidden.luck = 50;
        const b = d.business.items[0]!;
        b.founded -= 5;
        for (const l of b.locations) l.opened -= 5;
        for (const s of b.staff) {
          s.skill = 75;
          s.honesty = 90;
          s.morale = 80;
        }
        runBusiness(d, content);
      }).business.items[0]!;
    };
    const without = build(false);
    const withMgr = build(true);
    expect(withMgr.locations[1]!.manager).toBeDefined();
    expect(withMgr.locations[1]!.result!.revenue).toBeGreaterThan(without.locations[1]!.result!.revenue);
    // Removing one puts the place back in your hands.
    const life = twoPlaces('b2-mgr-back', false);
    const hired = act(life, 'hire_staff', { businessId: life.business.items[0]!.id, locationId: life.business.items[0]!.locations[1]!.id });
    const m = act(hired, 'appoint_manager', { businessId: hired.business.items[0]!.id, personId: hired.business.items[0]!.staff[0]!.personId, locationId: hired.business.items[0]!.locations[1]!.id });
    const back = act(m, 'remove_manager', { businessId: m.business.items[0]!.id, locationId: m.business.items[0]!.locations[1]!.id });
    expect(back.business.items[0]!.locations[1]!.manager).toBeUndefined();
    expect(back.business.items[0]!.staff[0]!.roleId).toBe('barista');
    expect(businessFailures(back, content)).toEqual([]);
  });

  it('a person always lives where their location is (a person who moves away leaves the job)', () => {
    let life = twoPlaces('b2-city');
    life = act(life, 'hire_staff', { businessId: life.business.items[0]!.id });
    const who = life.business.items[0]!.staff[0]!.personId;
    const gone = step(life, (d) => void (d.people[who]!.cityId = other(d)));
    expect(gone.business.items[0]!.staff).toHaveLength(0);
    expect(businessFailures(gone, content)).toEqual([]);
  });
});

describe('limits', () => {
  it('allow five businesses, 24 locations a business and 36 in all, and a business of 24 locations is valid and trades', () => {
    const bal = content.balance.business.limits;
    expect([bal.businesses, bal.locations, bal.totalLocations, bal.franchises]).toEqual([5, 24, 36, 20]);
    let life = start(owner('b2-big', 900_000_000), 'cafe', 'budget');
    for (let i = 1; i < bal.locations; i++) life = act(life, 'open_location', { businessId: life.business.items[0]!.id, cityId: life.character.cityId, style: 'budget', funding: 'savings' });
    expect(life.business.items[0]!.locations).toHaveLength(24);
    expect(openLocation(life, { id: life.business.items[0]!.id, cityId: life.character.cityId, style: 'budget', funding: 'savings' }, content)).toBe(false);
    const stepped = step(life);
    expect(stepped.business.items[0]!.report!.locations).toHaveLength(24);
    expect(businessFailures(stepped, content)).toEqual([]);
  });

  it('every other business you run yourself takes a share of your effort', () => {
    const one = start(owner('b2-attn', 20_000_000), 'cafe');
    const two = produce(act(one, 'start_business', { defId: 'bakery', name: 'Second Place', cityId: one.character.cityId, style: 'standard', plan: { source: 'savings' }, role: 'self' }), (d) => void (d.character.hidden.luck = 50));
    const solo = produce(one, (d) => {
      d.character.hidden.luck = 50;
      runBusiness(d, content);
    }).business.items[0]!.report!;
    const shared = produce(two, (d) => void runBusiness(d, content)).business.items[0]!.report!;
    expect(shared.customers).toBeLessThan(solo.customers);
  });
});

describe('franchising', () => {
  const ready = (seed: string): LifeState => {
    let life = withPeople(start(owner(seed, 40_000_000), 'cafe'), 4);
    for (let i = 0; i < 2; i++) life = act(life, 'open_location', { businessId: life.business.items[0]!.id, cityId: life.character.cityId, style: 'standard', funding: 'savings' });
    return produce(life, (d) => {
      const b = d.business.items[0]!;
      b.founded -= 8;
      b.quality = 70;
      b.reputation = 70;
      b.profits = [40_000, 50_000, 60_000];
    });
  };

  it('needs years, locations, quality, reputation and a clean record, and is refused until they are met', () => {
    const life = start(owner('b2-fr-no'), 'cafe');
    const b = life.business.items[0]!;
    expect(franchiseEligible(b, life, content)).toBe(false);
    expect(franchiseConditions(b, life, content).filter((c) => !c.met).length).toBeGreaterThan(2);
    expect(() => act(life, 'sell_franchise', { businessId: b.id, cityId: other(life), style: 'standard', royalty: 0.06 })).toThrow(InvalidInputError);
    const ok = ready('b2-fr-yes');
    expect(franchiseEligible(ok.business.items[0]!, ok, content)).toBe(true);
  });

  it('a franchise pays a fee into the business, a royalty each year and costs the brand support, all through the report; it passes to an heir and counts in the value', () => {
    const life = ready('b2-fr-sell');
    const b = life.business.items[0]!;
    const sold = act(life, 'sell_franchise', { businessId: b.id, cityId: other(life), style: 'standard', royalty: 0.06 });
    const sb = sold.business.items[0]!;
    expect(sb.franchises).toHaveLength(1);
    expect(sb.cash).toBeGreaterThan(b.cash);
    expect(sb.franchises[0]!.fee).toBeGreaterThan(0);
    const next = step(sold, (d) => void (d.character.hidden.luck = 50));
    const nb = next.business.items[0]!;
    expect(nb.report!.royalties!).toBeGreaterThan(0);
    expect(nb.report!.support!).toBeGreaterThan(0);
    expect(nb.franchises[0]!.revenue).toBeGreaterThan(0);
    expect(nb.franchises[0]!.royaltyPaid).toBe(Math.round(nb.franchises[0]!.revenue * 0.06));
    expect(businessFailures(next, content)).toEqual([]);
    // It ends, and costs nothing to the books but the royalty it stops paying.
    const ended = act(next, 'end_franchise', { businessId: nb.id, franchiseId: nb.franchises[0]!.id, how: 'end' });
    expect(ended.business.items[0]!.franchises).toHaveLength(0);
  });

  it('an operator you know is remembered (a registered memory), kept from the people list pruning, and the franchise can be ended or bought back', () => {
    const life0 = ready('b2-fr-known');
    const here = produce(life0, (d) => {
      const rng = createRng('b2-fr-known:operator');
      const id = createPerson(d, { kind: 'friend', presence: 'elsewhere', createIfMissing: true, age: { min: 28, max: 40 } }, rng, content);
      d.people[id!]!.cityId = other(d);
      d.relationships[id!]!.affection = 80;
    });
    const id = Object.keys(here.people).find((x) => here.people[x]!.cityId === other(here) && here.relationships[x]?.kind === 'friend')!;
    const sold = act(here, 'sell_franchise', { businessId: 'b1', cityId: other(here), style: 'standard', royalty: 0.06, personId: id });
    expect(sold.business.items[0]!.franchises[0]!.personId).toBe(id);
    expect(sold.relationships[id]!.memories.some((m) => m.tag === 'franchised_from_you')).toBe(true);
    expect(checkInvariants(sold, content).filter((f) => !/is due in the past/.test(f))).toEqual([]);
    const bought = act(sold, 'end_franchise', { businessId: 'b1', franchiseId: sold.business.items[0]!.franchises[0]!.id, how: 'buyback' });
    expect(bought.business.items[0]!.franchises).toHaveLength(0);
    expect(bought.finances.savings).toBeLessThan(sold.finances.savings);
    expect(checkInvariants(bought, content).filter((f) => !/is due in the past/.test(f))).toEqual([]);
  });

  it('a franchisee who does badly puts the brand at risk and leaves after losing money', () => {
    let life = act(ready('b2-fr-risk'), 'sell_franchise', { businessId: 'b1', cityId: 'small_town', style: 'premium', royalty: 0.08 });
    life = produce(life, (d) => {
      d.business.items[0]!.franchises[0]!.skill = 5;
      d.business.items[0]!.franchises[0]!.risk = 60;
    });
    const before = life.business.items[0]!.reputation;
    let after = life;
    for (let i = 0; i < 4 && after.business.items[0]!.franchises.length > 0; i++) after = step(after, (d) => void (d.currentYear += 1));
    const b = after.business.items[0]!;
    expect(b.reputation).toBeLessThan(before);
    expect(b.franchises.length === 0 || b.franchises[0]!.risk > 60).toBe(true);
  });

  it('passes to an heir with the business, and counts in what it is worth', () => {
    const parent = produce(parentLife({ seed: 'b2-fr-heir', age: 55, kids: [27], noRelatives: true, savings: 3_000_000 }), (d) => ledger(d, 90_000));
    let life = start(parent, 'cafe');
    for (let i = 0; i < 2; i++) life = act(life, 'open_location', { businessId: life.business.items[0]!.id, cityId: life.character.cityId, style: 'standard', funding: 'savings' });
    life = produce(life, (d) => {
      const b = d.business.items[0]!;
      b.founded -= 8;
      b.quality = 70;
      b.reputation = 70;
      b.profits = [80_000, 80_000, 80_000];
    });
    life = act(life, 'sell_franchise', { businessId: life.business.items[0]!.id, cityId: other(life), style: 'standard', royalty: 0.06 });
    const worth = produce(life, (d) => {
      d.business.items[0]!.franchises[0]!.royaltyPaid = 90_000;
    });
    expect(getBusinessScreen(worth, content).owned[0]!.value).toBeGreaterThanOrEqual(getBusinessScreen(life, content).owned[0]!.value);
    const dead = die(life, content);
    expect(dead.estate!.businesses).toHaveLength(1);
    const heir = continueAsHeir(dead, heirCandidates(dead)[0]!, content);
    expect(heir.business.items[0]!.franchises).toHaveLength(1);
    expect(businessFailures(heir, content)).toEqual([]);
  });
});

describe('effects and conditions for events', () => {
  it('set a line\'s price or order, change what a supplier charges, buy ahead, write stock off and move the brand', () => {
    const life = start(owner('b2-fx', 4_000_000), 'cafe');
    const cast = { '@business': life.business.items[0]!.id };
    const next = produce(life, (d) => {
      applyBusinessEffect(d, { type: 'business', action: 'price', product: 'coffee', level: 'high' }, cast, content);
      applyBusinessEffect(d, { type: 'business', action: 'order', product: 'coffee', level: 'heavy' }, cast, content);
      d.business.items[0]!.focus = { category: 'coffee' };
      applyBusinessEffect(d, { type: 'business', action: 'supplier', delta: -10, years: 3 }, cast, content);
      applyBusinessEffect(d, { type: 'business', action: 'shortage', delta: -40, years: 1 }, cast, content);
    });
    const b = next.business.items[0]!;
    expect(b.lines.find((l) => l.productId === 'coffee')!.price).toBe('high');
    expect(b.orders.coffee).toBe('heavy');
    expect(b.shocks.find((s) => s.kind === 'deal' && s.category === 'coffee')!.mult).toBeCloseTo(0.9, 5);
    expect(b.shocks.find((s) => s.kind === 'shortage')!.mult).toBeCloseTo(0.6, 5);
    const stocked = step(next);
    const ahead = produce(stocked, (d) => void applyBusinessEffect(d, { type: 'business', action: 'buyAhead', share: 0.1, floor: 500 }, cast, content));
    expect(ahead.finances.savings).toBeLessThan(stocked.finances.savings);
    expect(ahead.business.items[0]!.stockValue).toBeGreaterThan(stocked.business.items[0]!.stockValue);
    const wasted = produce(ahead, (d) => void applyBusinessEffect(d, { type: 'business', action: 'writeOff', share: 0.5 }, cast, content));
    expect(wasted.business.items[0]!.stockValue).toBeLessThan(ahead.business.items[0]!.stockValue);
    expect(businessFailures(wasted, content)).toEqual([]);
  });

  it('the new conditions read the business: what it sells, the economy, its stock, franchises and managers', () => {
    const life = step(start(owner('b2-cond'), 'cafe'));
    const cast = { '@business': life.business.items[0]!.id };
    expect(businessHolds({ sells: ['coffee'] }, life, cast, content)).toBe(true);
    expect(businessHolds({ sells: ['clothes'] }, life, cast, content)).toBe(false);
    expect(businessHolds({ economy: [economyPhase(life.seed, life.currentYear, content)] }, life, cast, content)).toBe(true);
    expect(businessHolds({ franchises: { gte: 1 } }, life, cast, content)).toBe(false);
    expect(businessHolds({ hasLocationManager: false }, life, cast, content)).toBe(true);
    expect(businessHolds({ namedRoom: true }, life, cast, content)).toBe(true);
    expect(businessHolds({ franchiseReady: false }, life, cast, content)).toBe(true);
  });

  it('a life with no business does not see a business event in its pool', () => {
    const none = lifeAtAge('b2-nopool', 40);
    const queued = Object.values(content.registries.business.triggers).flatMap((t) => t.events);
    expect(queued.length).toBeGreaterThanOrEqual(40);
    for (const id of queued) expect(content.events[id]!.followUpOnly).toBe(true);
    expect(none.business.items).toHaveLength(0);
  });
});

describe('the hire sheet bug', () => {
  it('the screen view lists hireable people for each location\'s own city', () => {
    const life = withPeople(start(owner('b2-view', 4_000_000), 'cafe'));
    const view = getBusinessScreen(life, content).owned[0]!;
    expect(view.depth.team[0]!.hireable.length).toBeGreaterThan(0);
    expect(view.depth.hireRoles.length).toBe(crewRoles(content.businesses.cafe!).length);
    expect(hireStaff).toBeTypeOf('function');
  });
});
