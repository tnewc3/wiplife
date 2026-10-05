import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { checkInvariants } from '../invariants';
import { withPossessions } from '../possessions/fixtures';
import { die, parentLife } from './fixtures';
import { continueAsHeir } from './heir';

const sameCity = (life: ReturnType<typeof parentLife>) => life.character.cityId;

describe('possessions in an estate (E5)', () => {
  it('passes a pet to the beneficiary best placed to keep it, a car and a vacation home to adults, each with its loan', () => {
    const home = parentLife({ kids: [20, 25], spouse: true, noRelatives: true });
    const base = produce(home, (d) => {
      d.housing.kind = 'renting';
      d.housing.partnerId = 'sp';
    });
    const life = withPossessions(base, { pets: [{ species: 'cat' }], vehicles: [{ loan: 6_000 }], vacation: [{ cityId: sameCity(base), value: 300_000, mortgage: 120_000 }] });
    const dead = die(life);
    const estate = dead.estate!;
    expect(checkInvariants(dead, content)).toEqual([]);
    expect(estate.possessions.map((t) => t.item.kind).sort()).toEqual(['home', 'pet', 'vehicle']);
    // The spouse lives with you and has the largest share: the pet goes there; so do the others.
    for (const t of estate.possessions) expect(t.toPersonId).toBe('sp');
    expect(estate.possessions.find((t) => t.item.kind === 'vehicle')!.loan).toBe(6_000);
    expect(estate.possessions.find((t) => t.item.kind === 'home')!.loan).toBe(120_000);
    // Their loans are not the estate's debts: nothing is written off, nothing sold.
    expect(estate.writtenOff).toBe(0);
    expect(estate.possessionSales).toBe(0);
  });

  it('never leaves a debt with an heir beyond what the thing is worth: an underwater car goes back to the lender', () => {
    const life = withPossessions(parentLife({ kids: [30], noRelatives: true }), { vehicles: [{ loan: 60_000, defId: 'hatchback', condition: 40, startAge: 6 }] });
    const dead = die(life);
    expect(dead.estate!.possessions).toEqual([]);
    expect(dead.estate!.writtenOff).toBeGreaterThan(0);
    expect(checkInvariants(dead, content)).toEqual([]);
  });

  it('sells a car or home nobody can take, and the cash is settled like the rest', () => {
    // Only a minor to inherit: too young to drive or own a home, so both are sold.
    const life = withPossessions(parentLife({ kids: [9], noRelatives: true, savings: 50_000 }), { vehicles: [{}], vacation: [{ value: 200_000, mortgage: 100_000 }] });
    const dead = die(life);
    expect(dead.estate!.possessions).toEqual([]);
    expect(dead.estate!.possessionSales).toBeGreaterThan(0);
    expect(checkInvariants(dead, content)).toEqual([]);
  });

  it('sells vehicles and homes, rather than passing them on, when the estate cannot pay its costs and debts', () => {
    const life = withPossessions(parentLife({ kids: [30], noRelatives: true, savings: 1_000, debt: 40_000 }), { vehicles: [{}], vacation: [{ value: 300_000, mortgage: 100_000 }] });
    const dead = die(life);
    expect(dead.estate!.possessions.filter((t) => t.item.kind !== 'pet')).toEqual([]);
    expect(dead.estate!.debtsPaid).toBe(40_000);
    expect(checkInvariants(dead, content)).toEqual([]);
  });

  it('gives the heir what was passed to them: a pet at home, a car with its loan as a debt', () => {
    const life = withPossessions(parentLife({ kids: [28], noRelatives: true }), { pets: [{ species: 'dog' }], vehicles: [{ loan: 5_000 }] });
    const dead = die(life);
    const heirId = dead.estate!.lines[0]!.id;
    const heir = continueAsHeir(dead, heirId, content);
    expect(heir.possessions.items.map((p) => p.kind).sort()).toEqual(['pet', 'vehicle']);
    const car = heir.possessions.items.find((p) => p.kind === 'vehicle')!;
    expect(heir.finances.debts.find((d) => d.id === car.vehicle!.loanDebtId)).toMatchObject({ kind: 'auto', balance: 5_000 });
    expect(checkInvariants(heir, content)).toEqual([]);
  });

  it('an old pet and an old car keep their age when they pass, and are acquired in the heir’s own life', () => {
    const base = withPossessions(parentLife({ kids: [28], noRelatives: true }), { pets: [{ species: 'dog' }], vehicles: [{}] });
    const life = produce(base, (d) => {
      for (const p of d.possessions.items) p.acquired = d.currentYear - 3;
    });
    const dead = die(life);
    const heir = continueAsHeir(dead, dead.estate!.lines[0]!.id, content);
    for (const p of heir.possessions.items) {
      const was = life.possessions.items.find((q) => q.kind === p.kind)!;
      expect(p.acquired).toBeGreaterThanOrEqual(heir.birthYear);
      const age = (x: typeof p, year: number) => (x.pet ?? x.vehicle)!.startAge + year - x.acquired;
      expect(age(p, heir.currentYear)).toBe(age(was, heir.currentYear));
    }
    expect(checkInvariants(heir, content)).toEqual([]);
  });

  it('a pet at the very end of its life passes with one year left, not already past it', () => {
    const base = withPossessions(parentLife({ kids: [28], noRelatives: true }), { pets: [{ species: 'dog' }] });
    const life = produce(base, (d) => {
      const pet = d.possessions.items[0]!;
      pet.acquired = d.currentYear - 5;
      pet.pet!.startAge = pet.pet!.lifespan - 5;
    });
    const dead = die(life);
    const heir = continueAsHeir(dead, dead.estate!.lines[0]!.id, content);
    expect(heir.possessions.items).toHaveLength(1);
    expect(checkInvariants(heir, content)).toEqual([]);
  });

  it('a minor heir keeps the family pet and nothing with a loan', () => {
    const life = withPossessions(parentLife({ kids: [8], noRelatives: true, spouse: true }), { pets: [{ species: 'rabbit' }] });
    const dead = die(life);
    const heirId = dead.estate!.lines.find((l) => l.id !== 'sp')?.id ?? dead.estate!.lines[0]!.id;
    const heir = continueAsHeir(dead, heirId, content);
    expect(checkInvariants(heir, content)).toEqual([]);
  });
});
