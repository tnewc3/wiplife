/**
 * Upgrading a W3 save (B2, schema 34 to 35): a business keeps its last report, profits, cash, assets and worth, and gains the
 * lines, orders, headcount and crew the new model needs.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { performAction } from '../engine/actions';
import { staffNeed } from '../engine/business/model';
import { businessFailures } from '../engine/business/invariants';
import { runBusiness } from '../engine/business/step';
import { createPerson } from '../engine/events/casting';
import { checkInvariants } from '../engine/invariants';
import { createRng } from '../engine/rng';
import { lifeAtAge } from '../engine/testFixtures';
import type { LifeState } from '../engine/types';
import { makeEnvelope } from './envelope';
import { migrateEnvelope } from './migrations';

const ledger = (d: LifeState, gross = 60_000) => {
  d.finances.lastLedger = { year: d.currentYear - 1, gross, retirement: 0, tax: 0, housing: 0, living: 0, debtPayments: 0, interest: 0, debtInterest: 0, borrowed: 0, support: 0, children: 0, care: 0, supportPaid: 0, supportReceived: 0, upkeep: 0, insurance: 0, giving: 0, business: 0, net: gross };
};
const owner = (seed: string, savings = 4_000_000): LifeState =>
  produce(lifeAtAge(seed, 32), (d) => {
    d.finances.savings = savings;
    d.finances.dirty = 0;
    ledger(d);
  });
const act = (life: LifeState, id: Parameters<typeof performAction>[1], biz: Record<string, unknown>) => performAction(life, id, { biz }, content);
const start = (life: LifeState, defId: string): LifeState => act(life, 'start_business', { defId, name: 'Test Place', cityId: life.character.cityId, style: 'standard', plan: { source: 'savings' }, role: 'self' });
const step = (life: LifeState, mutate: (d: LifeState) => void = () => undefined): LifeState =>
  produce(life, (d) => {
    mutate(d);
    runBusiness(d, content);
    d.scheduled = [];
  });
const withPeople = (life: LifeState, n = 6): LifeState =>
  produce(life, (d) => {
    const rng = createRng(`${d.seed}:people`);
    for (let i = 0; i < n; i++) {
      const id = createPerson(d, { kind: 'friend', presence: 'city', createIfMissing: true, age: { min: 25, max: 45 } }, rng, content);
      if (id) d.relationships[id]!.affection = 80;
    }
  });

describe('upgrading a W3 save', () => {
  it('gives an existing business default lines, stock and headcount without changing its last year', () => {
    const played = step(withPeople(start(owner('b2-v34', 4_000_000), 'cafe')), (d) => void (d.character.hidden.luck = 50));
    const hired = act(played, 'hire_staff', { businessId: played.business.items[0]!.id });
    // Build the W3 shape: take the B2 fields away.
    const old = JSON.parse(JSON.stringify(hired)) as { business: { items: Record<string, unknown>[] } };
    const b = old.business.items[0]!;
    const before = { report: JSON.stringify(b.report), profits: JSON.stringify(b.profits), cash: b.cash, assets: b.assets };
    for (const k of ['lines', 'orders', 'headcount', 'crew', 'training', 'stockValue', 'franchises', 'focus']) delete b[k];
    for (const l of b.locations as Record<string, unknown>[]) {
      delete l.stock;
      delete l.forecast;
      delete l.manager;
    }
    for (const s of b.staff as Record<string, unknown>[]) delete s.roleId;
    b.prices = 'high';
    const worthBefore = (old as unknown as { business: { worth: number } }).business.worth;
    const upgraded = migrateEnvelope({ ...makeEnvelope(old, content.contentVersion), schemaVersion: 34 }).data as LifeState;
    const nb = upgraded.business.items[0]!;
    expect(JSON.stringify(nb.report)).toBe(before.report);
    expect(JSON.stringify(nb.profits)).toBe(before.profits);
    expect(nb.cash).toBe(before.cash);
    expect(nb.assets).toBe(before.assets);
    expect(upgraded.business.worth).toBe(worthBefore);
    expect(nb.lines.length).toBe(content.businesses.cafe!.products.length);
    expect(nb.lines.filter((l) => l.on).map((l) => l.productId).sort()).toEqual(['coffee', 'cold_drinks', 'pastries', 'sandwiches', 'tea']);
    expect(nb.lines.every((l) => l.price === 'high')).toBe(true);
    expect(nb.stockValue).toBe(0);
    expect(nb.training).toBe('none');
    expect(nb.franchises).toEqual([]);
    expect(nb.locations.every((l) => l.manager === undefined && Object.keys(l.stock).length === 0)).toBe(true);
    expect(nb.staff[0]!.roleId).toBe('barista');
    expect(Object.values(nb.headcount[nb.locations[0]!.id]!).reduce((a, n) => a + n, 0)).toBe(staffNeed(content.businesses.cafe!, 'standard', 'normal', content));
    expect(businessFailures(upgraded, content)).toEqual([]);
    expect(checkInvariants(upgraded, content).filter((f) => !/is due in the past/.test(f))).toEqual([]);
    // It carries on: the next year trades from the forecast.
    const next = step(upgraded);
    expect(next.business.items[0]!.report!.lines!.length).toBeGreaterThan(0);
  });
});

