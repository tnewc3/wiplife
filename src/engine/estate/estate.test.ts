import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import type { ContentBundle } from '../../content/schemas';
import { InvalidInputError } from '../creation/input';
import { performAction } from '../actions';
import { checkInvariants } from '../invariants';
import { cloneJson } from '../testFixtures';
import type { LifeState, WillShare } from '../types';
import { die, parentLife } from './fixtures';
import { heirCandidates } from './heir';
import { canWriteWill, livingWill, parseShares, willCandidates, writeWill } from './will';

/** A content bundle with some family balance numbers replaced. */
function withEstate(patch: (e: ContentBundle['balance']['family']['estate']) => void): ContentBundle {
  const family = cloneJson(content.balance.family);
  patch(family.estate);
  return { ...content, balance: { ...content.balance, family } };
}

const noTax = withEstate((e) => {
  e.tax = [{ at: 0, x: 0 }];
});

/** Cash plus the equity of a home, summed over everything the estate gave out. */
const given = (life: LifeState) => life.estate!.lines.reduce((n, l) => n + l.cash + (l.property ? l.property.value - l.property.mortgage : 0), 0) + life.estate!.unclaimed;

/** The identity every settlement must meet: nothing is created or lost. */
function accounted(life: LifeState): { held: number; used: number } {
  const e = life.estate!;
  return {
    held: e.savings + e.homeValue - (e.home === 'passes' ? e.mortgage : 0),
    used: e.costs + e.debtsPaid + e.tax + e.mortgagePaid + e.saleCosts + e.netEstate,
  };
}

describe('default shares (no will)', () => {
  it('give a spouse half and split the rest between children', () => {
    const dead = die(parentLife({ kids: [10, 12, 14], spouse: true }), noTax);
    const e = dead.estate!;
    expect(e.source).toBe('default');
    const spouse = e.lines.find((l) => l.relation === 'spouse')!;
    const kids = e.lines.filter((l) => l.relation === 'child');
    expect(spouse.percent).toBe(content.balance.family.estate.default.spouseWithChildren);
    expect(kids).toHaveLength(3);
    expect(spouse.percent + kids.reduce((n, k) => n + k.percent, 0)).toBe(100);
    // The remainder of an uneven split goes to the eldest child.
    expect(kids[0]!.percent).toBeGreaterThanOrEqual(kids[2]!.percent);
    expect(checkInvariants(dead, noTax)).toEqual([]);
  });

  it('split between children equally with no spouse', () => {
    const dead = die(parentLife({ kids: [10, 12], noRelatives: true }), noTax);
    expect(dead.estate!.lines.map((l) => [l.relation, l.percent])).toEqual([['child', 50], ['child', 50]]);
  });

  it('go to a spouse, and living parents and siblings, with no children', () => {
    const alone = die(parentLife({ spouse: true, noRelatives: true }), noTax).estate!;
    expect(alone.lines.map((l) => [l.relation, l.percent])).toEqual([['spouse', 100]]);
    const withRelatives = die(parentLife({ spouse: true, seed: 'estate-relatives' }), noTax).estate!;
    const spouse = withRelatives.lines.find((l) => l.relation === 'spouse')!;
    expect(spouse.percent).toBeLessThanOrEqual(100);
    expect(withRelatives.lines.reduce((n, l) => n + l.percent, 0)).toBe(100);
  });

  it('go to parents and siblings with no spouse or children, and to no one when nobody is left', () => {
    const dead = die(parentLife({ seed: 'estate-family', age: 30 }), noTax);
    const lines = dead.estate!.lines;
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.relation === 'parent' || l.relation === 'sibling')).toBe(true);
    expect(lines.reduce((n, l) => n + l.percent, 0)).toBe(100);
    const nobody = die(parentLife({ noRelatives: true }), noTax).estate!;
    expect(nobody.lines).toEqual([]);
    expect(nobody.unclaimed).toBe(nobody.netEstate);
  });
});

describe('writing a will', () => {
  const life = parentLife({ kids: [10, 12], spouse: true });
  const [a, b] = heirCandidates({ ...life, phase: 'dead' } as LifeState);

  it('lists everyone you could name, then the causes', () => {
    const candidates = willCandidates(life, content);
    expect(candidates[0]!.relation).toBe('spouse');
    expect(candidates.filter((c) => c.kind === 'cause').map((c) => c.id)).toEqual(Object.keys(content.registries.estate.causes).sort());
    expect(candidates.every((c) => c.name.length > 0)).toBe(true);
  });

  it('accepts shares that add up to 100 and nothing else', () => {
    const good: WillShare[] = [{ kind: 'person', id: a!, percent: 60 }, { kind: 'cause', id: 'food_bank', percent: 40 }];
    expect(parseShares(good, life, content)).toEqual(good);
    expect(parseShares([], life, content)).toEqual([]);
    const bad: unknown[] = [
      [{ kind: 'person', id: a!, percent: 60 }],
      [{ kind: 'person', id: a!, percent: 60 }, { kind: 'person', id: a!, percent: 40 }],
      [{ kind: 'person', id: 'nobody', percent: 100 }],
      [{ kind: 'cause', id: 'not_a_cause', percent: 100 }],
      [{ kind: 'person', id: a!, percent: 0 }, { kind: 'person', id: b!, percent: 100 }],
      [{ kind: 'person', id: a!, percent: 50.5 }, { kind: 'person', id: b!, percent: 49.5 }],
      Array.from({ length: content.balance.family.estate.maxShares + 1 }, (_, i) => ({ kind: 'cause', id: 'food_bank', percent: i })),
      'a will',
      null,
    ];
    for (const shares of bad) expect(parseShares(shares, life, content), JSON.stringify(shares)).toBeNull();
  });

  it('is an action under More: an adult, between years; it validates its input, and can be cleared', () => {
    const shares: WillShare[] = [{ kind: 'person', id: a!, percent: 100 }];
    const written = performAction(life, 'write_will', { shares }, content);
    expect(written.will).toEqual({ shares, year: life.currentYear });
    expect(written.inputLog.at(-1)).toMatchObject({ kind: 'action', payload: { actionId: 'write_will' } });
    expect(checkInvariants(written, content)).toEqual([]);
    const rewritten = performAction(written, 'write_will', { shares: [{ kind: 'person', id: b!, percent: 100 }] }, content);
    expect(rewritten.will!.shares[0]!.id).toBe(b);
    expect(performAction(rewritten, 'write_will', { shares: [] }, content).will).toBeNull();
    expect(() => performAction(life, 'write_will', { shares: [{ kind: 'person', id: a!, percent: 70 }] }, content)).toThrow(InvalidInputError);
    expect(() => performAction(life, 'write_will', {}, content)).toThrow(InvalidInputError);
    const child = produce(life, (d) => {
      d.character.age = 15;
    });
    expect(canWriteWill(child, content)).toBe(false);
    expect(() => performAction(child, 'write_will', { shares }, content)).toThrow(InvalidInputError);
  });

  it('drops people who died and scales the rest up to 100', () => {
    const withWill = produce(life, (d) => writeWill(d, [{ kind: 'person', id: a!, percent: 50 }, { kind: 'person', id: b!, percent: 30 }, { kind: 'cause', id: 'library', percent: 20 }]));
    const oneDied = produce(withWill, (d) => {
      d.people[a!]!.alive = false;
      d.people[a!]!.deathYear = d.currentYear;
    });
    const kept = livingWill(oneDied.will, oneDied, content)!;
    expect(kept.map((s) => s.id)).toEqual([b, 'library']);
    expect(kept.reduce((n, s) => n + s.percent, 0)).toBe(100);
    const allDied = produce(oneDied, (d) => {
      d.people[b!]!.alive = false;
      d.people[b!]!.deathYear = d.currentYear;
      writeWill(d, [{ kind: 'person', id: a!, percent: 50 }, { kind: 'person', id: b!, percent: 50 }]);
    });
    expect(livingWill(allDied.will, allDied, content)).toBeNull();
    // Nothing left of the will to follow: the default shares apply.
    expect(die(allDied, noTax).estate!.source).toBe('default');
  });
});

describe('estate settlement', () => {
  it('follows the will exactly', () => {
    const base = parentLife({ kids: [10, 12], spouse: true, savings: 400_000 });
    const [a, b] = heirCandidates({ ...base, phase: 'dead' } as LifeState);
    const shares: WillShare[] = [
      { kind: 'person', id: a!, percent: 70 },
      { kind: 'person', id: b!, percent: 20 },
      { kind: 'cause', id: 'food_bank', percent: 10 },
    ];
    const dead = die(produce(base, (d) => writeWill(d, shares)), noTax);
    const e = dead.estate!;
    expect(e.source).toBe('will');
    expect(e.lines.map((l) => [l.id, l.percent])).toEqual([[a, 70], [b, 20], ['food_bank', 10]]);
    const total = e.netEstate;
    expect(e.lines[0]!.cash).toBe(Math.floor(total * 0.7) + (total - Math.floor(total * 0.7) - Math.floor(total * 0.2) - Math.floor(total * 0.1)));
    expect(e.lines[1]!.cash).toBe(Math.floor(total * 0.2));
    expect(e.lines[2]!.cash).toBe(Math.floor(total * 0.1));
    expect(given(dead)).toBe(total);
    expect(checkInvariants(dead, noTax)).toEqual([]);
  });

  it('pays the funeral and debts other than the mortgage first, and writes off what is left: debt is never inherited', () => {
    const rich = die(parentLife({ kids: [20], noRelatives: true, savings: 100_000, debt: 30_000 }), noTax).estate!;
    expect(rich.debtsPaid).toBe(30_000);
    expect(rich.costs).toBeGreaterThan(0);
    expect(rich.netEstate).toBe(100_000 - rich.costs - 30_000);
    expect(rich.writtenOff).toBe(0);
    const poor = die(parentLife({ kids: [20], noRelatives: true, savings: 5_000, debt: 80_000 }), noTax);
    const e = poor.estate!;
    expect(e.debtsPaid).toBe(0);
    expect(e.netEstate).toBe(0);
    expect(e.writtenOff).toBe(80_000);
    expect(e.lines.every((l) => l.cash === 0 && !l.property)).toBe(true);
    expect(checkInvariants(poor, noTax)).toEqual([]);
  });

  it('sends a home to one person with its mortgage', () => {
    const dead = die(parentLife({ kids: [20], noRelatives: true, savings: 50_000, home: { value: 300_000, mortgage: 120_000 } }), noTax);
    const e = dead.estate!;
    expect(e.home).toBe('passes');
    const line = e.lines.find((l) => l.property)!;
    expect(line.property).toEqual({ value: 300_000, mortgage: 120_000 });
    expect(e.mortgagePaid).toBe(0);
    expect(given(dead)).toBe(e.netEstate);
    expect(checkInvariants(dead, noTax)).toEqual([]);
  });

  it('sells a home that no one’s share can cover, and shares the equity as cash', () => {
    const base = parentLife({ kids: [20, 22], noRelatives: true, savings: 1_000, home: { value: 400_000, mortgage: 100_000 } });
    const dead = die(base, noTax);
    const e = dead.estate!;
    // Two children at 50% each can't each cover the home's whole equity.
    expect(e.home).toBe('sold');
    expect(e.saleCosts).toBe(Math.round(400_000 * content.balance.economy.ownership.sellingCosts));
    expect(e.mortgagePaid).toBe(100_000);
    expect(e.lines.every((l) => !l.property)).toBe(true);
    expect(e.lines[0]!.cash + e.lines[1]!.cash).toBe(e.netEstate);
    const { held, used } = accounted(dead);
    expect(held).toBe(used);
  });

  it('sells the home to pay debts savings can’t, and writes off a shortfall', () => {
    const dead = die(parentLife({ kids: [20], noRelatives: true, savings: 0, debt: 60_000, home: { value: 200_000, mortgage: 100_000 } }), noTax);
    const e = dead.estate!;
    expect(e.home).toBe('sold');
    expect(e.debtsPaid).toBe(60_000);
    expect(e.writtenOff).toBe(0);
    expect(accounted(dead).held).toBe(accounted(dead).used);
  });

  it('lets the lender take a home worth less than its mortgage: nobody inherits that debt', () => {
    const dead = die(parentLife({ kids: [20], noRelatives: true, savings: 20_000, home: { value: 150_000, mortgage: 200_000 } }), noTax);
    const e = dead.estate!;
    expect(e.home).toBe('surrendered');
    expect(e.mortgagePaid).toBe(150_000);
    expect(e.writtenOff).toBe(50_000);
    expect(e.lines.every((l) => !l.property)).toBe(true);
    expect(checkInvariants(dead, noTax)).toEqual([]);
  });

  it('charges estate tax on a large estate only, and sells a home to pay it', () => {
    const small = die(parentLife({ kids: [20], noRelatives: true, savings: 300_000 })).estate!;
    expect(small.tax).toBe(0);
    const large = die(parentLife({ kids: [20], noRelatives: true, savings: 3_000_000 }));
    expect(large.estate!.tax).toBeGreaterThan(0);
    expect(large.estate!.tax).toBeLessThan(large.estate!.savings * 0.5);
    expect(accounted(large).held).toBe(accounted(large).used);
    // All the wealth is in the home: it must be sold to pay the tax.
    const homeRich = die(parentLife({ kids: [20], noRelatives: true, savings: 1_000, home: { value: 4_000_000, mortgage: 0 } }));
    expect(homeRich.estate!.home).toBe('sold');
    expect(homeRich.estate!.tax).toBeGreaterThan(0);
    expect(accounted(homeRich).held).toBe(accounted(homeRich).used);
  });

  it('counts money held in trust (a minor who dies) as part of the estate', () => {
    const base = produce(parentLife({ age: 16, noRelatives: false, savings: 0 }), (d) => {
      d.finances.trust = { balance: 50_000, releaseAge: 18 };
    });
    const dead = die(base, noTax);
    expect(dead.estate!.savings).toBe(50_000);
    expect(checkInvariants(dead, noTax)).toEqual([]);
  });

  it('never creates or loses money, over many lives', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      for (const home of [undefined, { value: 250_000, mortgage: 80_000 }, { value: 90_000, mortgage: 150_000 }]) {
        for (const debt of [0, 40_000, 400_000]) {
          const dead = die(parentLife({ seed, kids: [seed < 'e' ? 12 : 30], spouse: seed < 'c', savings: seed < 'f' ? 20_000 : 900_000, ...(home ? { home } : {}), debt }));
          const { held, used } = accounted(dead);
          expect(held, `${seed} ${JSON.stringify(home)} ${debt}`).toBe(used);
          expect(given(dead)).toBe(dead.estate!.netEstate);
          expect(checkInvariants(dead, content)).toEqual([]);
        }
      }
    }
  });
});
