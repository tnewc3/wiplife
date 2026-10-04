/** Scenario builders for the estate and heir tests (E2b). */
import { produce } from 'immer';
import { content } from '../../content';
import type { ContentBundle } from '../../content/schemas';
import { createChild } from '../family/children';
import { endYear } from '../life';
import { createRng } from '../rng';
import { cloneJson, lifeAtAge } from '../testFixtures';
import type { LifeState, Person } from '../types';

export interface ParentOptions {
  seed?: string;
  age?: number;
  /** Ages of children born to you. */
  kids?: number[];
  /** A spouse (id "sp"), alive, who is the other parent of any children. */
  spouse?: boolean;
  savings?: number;
  home?: { value: number; mortgage: number };
  /** Other debts (personal) owed. */
  debt?: number;
  /** Remove the relatives the generator gave you (parents, siblings, grandparents). */
  noRelatives?: boolean;
  /** The family line's reputation. */
  reputation?: number;
}

/** An adult with children and, optionally, a spouse, a home and debts, ready to be taken through death. */
export function parentLife(opts: ParentOptions = {}, bundle: ContentBundle = content): LifeState {
  const base = lifeAtAge(opts.seed ?? 'estate', opts.age ?? 50, bundle);
  return produce(base, (d) => {
    const rng = createRng(`${d.seed}-kids`);
    if (opts.noRelatives) {
      for (const id of Object.keys(d.people)) {
        delete d.people[id];
        delete d.relationships[id];
      }
    }
    d.finances.savings = opts.savings ?? 100_000;
    if (opts.spouse) {
      const template: Person = cloneJson(Object.values(d.people)[0] ?? ({} as Person));
      const sp: Person = {
        ...template,
        id: 'sp',
        name: { first: 'Sam', last: 'Spouse' },
        birthYear: d.currentYear - 48,
        alive: true,
        tags: [],
        cityId: d.character.cityId,
        identity: { ...cloneJson(d.character.identity), attractedTo: ['man', 'woman', 'nonbinary'] },
        traits: {},
        looks: 50,
        smarts: 50,
        mood: 50,
        moodBase: 50,
        wealthLevel: 'middle',
        canCarry: true,
      };
      delete sp.deathYear;
      delete sp.child;
      d.people.sp = sp;
      d.relationships.sp = { personId: 'sp', kind: 'spouse', status: 'active', affection: 80, trust: 80, memories: [], since: d.currentYear - 20, kindSince: d.currentYear - 18, wasSpouse: true };
    }
    for (const age of opts.kids ?? []) {
      createChild(d, rng, { origin: 'birth', age, parents: { you: true, ...(opts.spouse ? { other: 'sp' } : {}) }, ...(opts.spouse ? { otherParentId: 'sp' } : {}), custody: 'you' }, bundle);
    }
    if (opts.home) {
      d.housing = { kind: 'owned', cityId: d.character.cityId, annualCost: 0, homeValue: opts.home.value, since: d.currentYear - 10 };
      if (opts.home.mortgage > 0) {
        d.finances.debts.push({ id: 'd1', kind: 'mortgage', balance: opts.home.mortgage, annualRate: 0.06, minPayment: 1000, missed: 0 });
        d.housing.mortgageDebtId = 'd1';
      }
    }
    if (opts.debt) d.finances.debts.push({ id: 'd2', kind: 'personal', balance: opts.debt, annualRate: 0.12, minPayment: 500, missed: 0 });
    if (opts.reputation !== undefined) d.lineage.reputation = opts.reputation;
  });
}

/** Takes the life through its last year: it dies of the first cause there is, and its estate is settled. */
export function die(life: LifeState, bundle: ContentBundle = content): LifeState {
  const ending = produce(life, (d) => {
    d.phase = 'yearEnd';
    d.recap = { year: d.currentYear, age: d.character.age, statsBefore: { ...d.character.stats }, statsAfter: null };
    d.death = { year: d.currentYear, age: d.character.age, causeId: Object.keys(bundle.causes).sort()[0]! };
    d.lifetime = { happinessTotal: d.character.stats.happiness * (d.character.age - 1), years: d.character.age - 1 };
  });
  return endYear(ending, bundle);
}
