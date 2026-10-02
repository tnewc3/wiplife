/**
 * C1: wedding costs through the finance module, family help, and rent
 * changes as a percentage of current rent (docs/expansion.md, C1).
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { costPrice, costToYou, familyHelp, payCost, rentMonthsAmount } from './costs';
import { applyEffects } from './events/effects';
import { totalDebt } from './finance';
import { changeRent, housingCost, moveTo, refreshHousingCost, rentIn } from './housing';
import { checkInvariants } from './invariants';
import { resolveChoice } from './life';
import { createRng } from './rng';
import { getEventCard } from './selectors';
import { cloneJson, lifeAtAge } from './testFixtures';
import type { FamilyWealth, LifeState, Person } from './types';

const eco = content.balance.economy;
const wedding = content.events.wedding!;

/** A 30-year-old renting alone in `city`, with one living parent at `affection` (or none). */
function adult(options: { city?: string; savings?: number; wealth?: FamilyWealth; parentAffection?: number | null } = {}): LifeState {
  return produce(lifeAtAge('costs', 30), (d) => {
    const city = options.city ?? 'chicago';
    d.character.cityId = city;
    d.character.familyWealth = options.wealth ?? 'middle';
    d.finances.savings = options.savings ?? 0;
    d.finances.debts = [];
    d.housing = { kind: 'renting', cityId: city, annualCost: 0, since: d.currentYear - 3 };
    const template = Object.values(d.people)[0]!;
    d.people = {};
    d.relationships = {};
    if (options.parentAffection !== null) {
      const parent: Person = { ...cloneJson(template), id: 'mom', birthYear: d.currentYear - 60, alive: true, cityId: city, tags: [] };
      delete parent.deathYear;
      d.people.mom = parent;
      d.relationships.mom = { personId: 'mom', kind: 'parent', status: 'active', affection: options.parentAffection ?? 80, trust: 70, memories: [], since: d.birthYear };
    }
    refreshHousingCost(d, content);
  });
}

describe('cost items', () => {
  it('scale with the city’s cost of living', () => {
    const cities = Object.values(content.cities).filter((c) => !c.retired);
    const cheap = cities.reduce((a, b) => (a.costOfLiving <= b.costOfLiving ? a : b));
    const dear = cities.reduce((a, b) => (a.costOfLiving >= b.costOfLiving ? a : b));
    expect(costPrice(adult({ city: cheap.id }), 'wedding_big', content)).toBe(Math.round(eco.costs.wedding_big!.amount * cheap.costOfLiving));
    expect(costPrice(adult({ city: dear.id }), 'wedding_big', content)).toBeGreaterThan(costPrice(adult({ city: cheap.id }), 'wedding_big', content));
  });

  it('get family help by wealth and closeness, none without a close living parent or for items families don’t help with', () => {
    const price = costPrice(adult(), 'wedding_big', content);
    expect(familyHelp(adult({ wealth: 'rich', parentAffection: 100 }), 'wedding_big', content)).toBe(Math.round(price * eco.familyHelp.share.rich));
    expect(familyHelp(adult({ wealth: 'rich', parentAffection: 50 }), 'wedding_big', content)).toBe(Math.round(price * eco.familyHelp.share.rich * 0.5));
    expect(familyHelp(adult({ wealth: 'rich', parentAffection: 50 }), 'wedding_big', content)).toBeLessThan(familyHelp(adult({ wealth: 'rich', parentAffection: 100 }), 'wedding_big', content));
    expect(familyHelp(adult({ wealth: 'poor', parentAffection: 100 }), 'wedding_big', content)).toBe(0);
    expect(familyHelp(adult({ wealth: 'rich', parentAffection: eco.familyHelp.minAffection - 1 }), 'wedding_big', content)).toBe(0);
    expect(familyHelp(adult({ wealth: 'rich', parentAffection: null }), 'wedding_big', content)).toBe(0);
    expect(familyHelp(adult({ wealth: 'rich', parentAffection: 100 }), 'wedding_courthouse', content)).toBe(0);
  });

  it('are paid from savings first, and the rest becomes personal debt', () => {
    const life = adult({ savings: 1000, wealth: 'poor' });
    const price = costToYou(life, 'wedding_small', content);
    const after = produce(life, (d) => payCost(d, 'wedding_small', content));
    expect(after.finances.savings).toBe(0);
    expect(totalDebt(after)).toBe(price - 1000);
  });
});

describe('weddings cost money by size (C1 playtesting)', () => {
  const engaged = (savings: number, wealth: FamilyWealth = 'poor') =>
    produce(adult({ savings, wealth }), (d) => {
      const template = Object.values(d.people)[0]!;
      d.people.fi = { ...cloneJson(template), id: 'fi', birthYear: d.currentYear - 30, cityId: d.character.cityId };
      d.relationships.fi = { personId: 'fi', kind: 'fiance', status: 'active', affection: 85, trust: 80, memories: [], since: d.currentYear - 4, kindSince: d.currentYear - 1 };
      d.phase = 'action';
      d.pending = [{ instanceId: 'w', eventId: 'wedding', cast: { person: 'fi' } }];
    });

  it('offers courthouse, small and big, with known costs on the buttons', () => {
    const life = engaged(100_000);
    const card = getEventCard(life, 0, content)!;
    const cost = (id: string) => -(card.choices.find((c) => c.id === id)?.money ?? 0);
    expect(card.choices.map((c) => c.id)).toEqual(['courthouse', 'small', 'big']);
    expect(cost('courthouse')).toBe(costToYou(life, 'wedding_courthouse', content));
    expect(cost('small')).toBe(costToYou(life, 'wedding_small', content));
    expect(cost('big')).toBe(costToYou(life, 'wedding_big', content));
    expect(cost('courthouse')).toBeLessThan(cost('small'));
    expect(cost('small')).toBeLessThan(cost('big'));
  });

  it('charges the chosen size, shows the new balance, and puts what savings can’t cover on credit', () => {
    for (const [choice, item] of [['courthouse', 'wedding_courthouse'], ['small', 'wedding_small'], ['big', 'wedding_big']] as const) {
      const life = engaged(100_000);
      const after = resolveChoice(life, 'w', choice, content);
      expect(after.finances.savings).toBe(100_000 - costToYou(life, item, content));
      expect(getEventCard(after, 0, content)!.money).toMatchObject({ change: -costToYou(life, item, content), balance: after.finances.savings });
      expect(after.relationships.fi!.kind).toBe('spouse');
    }
    const broke = engaged(2000);
    const button = getEventCard(broke, 0, content)!.choices.find((c) => c.id === 'big')!;
    expect(button.credit).toBe(costToYou(broke, 'wedding_big', content) - 2000);
    const after = resolveChoice(broke, 'w', 'big', content);
    expect(totalDebt(after)).toBe(button.credit);
    expect(getEventCard(after, 0, content)!.money).toMatchObject({ change: -2000, balance: 0, debtChange: button.credit });
  });

  it('shows what the family chipped in', () => {
    const life = engaged(100_000, 'rich');
    const help = familyHelp(life, 'wedding_big', content);
    expect(help).toBeGreaterThan(0);
    expect(getEventCard(life, 0, content)!.choices.find((c) => c.id === 'big')!.familyHelp).toBe(help);
    expect(getEventCard(resolveChoice(life, 'w', 'big', content), 0, content)!.money?.familyHelp).toBe(help);
  });

  it('every wedding choice that marries you costs something', () => {
    for (const choice of wedding.choices!) {
      const marries = choice.outcome?.effects.some((e) => e.type === 'relationship' && e.kind === 'spouse');
      if (marries) expect(choice.outcome!.effects.some((e) => e.type === 'cost'), choice.id).toBe(true);
    }
  });
});

describe('rent changes (C1 playtesting)', () => {
  const effects = (life: LifeState, list: Parameters<typeof applyEffects>[1]) =>
    produce(life, (d) => applyEffects(d, list, { def: content.events.rent_hike!, cast: {}, rng: createRng('r'), content }));

  it('are a percentage of the current rent, and the new rent stays from then on', () => {
    const life = adult();
    const base = rentIn(content.cities.chicago!, false, content);
    expect(life.housing.annualCost).toBe(base);
    const raised = effects(life, [{ type: 'housing', action: 'rent_change', percent: 8 }]);
    expect(raised.housing.annualCost).toBe(Math.round(base * 1.08));
    // Again: 8% of the new rent, not of the old one.
    const twice = effects(raised, [{ type: 'housing', action: 'rent_change', percent: 8 }]);
    expect(twice.housing.annualCost).toBe(Math.round(base * 1.08 * 1.08));
    // The yearly ledger keeps charging it.
    expect(housingCost(twice, content)).toBe(twice.housing.annualCost);
    expect(checkInvariants(twice, content).filter((f) => f.includes('rentFactor'))).toEqual([]);
  });

  it('scale with the rent: the same percentage costs more in a dearer city', () => {
    const cities = Object.values(content.cities).filter((c) => !c.retired);
    const cheap = cities.reduce((a, b) => (a.baseRent <= b.baseRent ? a : b));
    const dear = cities.reduce((a, b) => (a.baseRent >= b.baseRent ? a : b));
    const rise = (city: string) => {
      const life = adult({ city });
      return effects(life, [{ type: 'housing', action: 'rent_change', percent: 8 }]).housing.annualCost - life.housing.annualCost;
    };
    expect(rise(dear.id)).toBeGreaterThan(rise(cheap.id));
  });

  it('stay within the balance limits, and end when you move', () => {
    const { max } = eco.housing.rentFactor;
    let life = adult();
    for (let i = 0; i < 30; i++) life = produce(life, (d) => changeRent(d, 50, content));
    expect(life.housing.rentFactor).toBe(max);
    const moved = produce(life, (d) => moveTo(d, 'renting', 'chicago', content));
    expect(moved.housing.rentFactor).toBeUndefined();
    expect(moved.housing.annualCost).toBe(rentIn(content.cities.chicago!, false, content));
  });

  it('do nothing when you don’t rent', () => {
    const home = produce(adult(), (d) => {
      d.housing.kind = 'with_parents';
      refreshHousingCost(d, content);
    });
    expect(effects(home, [{ type: 'housing', action: 'rent_change', percent: 8 }]).housing).toEqual(home.housing);
  });

  it('the rent hike shows the yearly change on its buttons and the new housing cost after', () => {
    const life = produce(adult(), (d) => {
      d.phase = 'events';
      d.pending = [{ instanceId: 'r', eventId: 'rent_hike', cast: {} }];
    });
    const card = getEventCard(life, 0, content)!;
    const rise = Math.round(life.housing.annualCost * 1.08) - life.housing.annualCost;
    expect(card.choices.find((c) => c.id === 'pay')!.rent).toBe(rise);
    expect(getEventCard(resolveChoice(life, 'r', 'pay', content), 0, content)!.money?.housing).toEqual({ change: rise, annual: life.housing.annualCost + rise });
  });

  it('money worth months of rent scales with your rent', () => {
    const life = adult();
    expect(rentMonthsAmount(life, 1)).toBe(Math.round(life.housing.annualCost / 12));
    const after = effects(produce(life, (d) => void (d.finances.savings = 10_000)), [{ type: 'rentMonths', months: -1 }]);
    expect(after.finances.savings).toBe(10_000 - Math.round(life.housing.annualCost / 12));
  });
});
