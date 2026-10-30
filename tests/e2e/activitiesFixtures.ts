/**
 * A saved life for the Activities tests (Batch 2a): a grown-up with money and a rented home, built with the
 * engine on the test content pack and written into the app's database before it loads.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { produce } from 'immer';
import type { ContentBundle } from '../../src/content/schemas';
import { createLife } from '../../src/engine/life';
import { lifeStageForAge } from '../../src/engine/systems/aging';
import { startingTeen } from '../../src/engine/teen/query';
import type { LifeState } from '../../src/engine/types';

function pack(): ContentBundle {
  return JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;
}

export interface ActivitiesLife {
  seed: string;
  age?: number;
  savings?: number;
  /** The vice score: a high one makes a night out riskier. */
  vice?: number;
  /** Flags set from the start (what a lawsuit has to go on, say). */
  flags?: string[];
}

export function activitiesLife(options: ActivitiesLife): LifeState {
  const content = pack();
  const age = options.age ?? 36;
  const base = createLife({ mode: 'random', seed: options.seed, birthYear: 1990, countryId: 'us' }, content);
  return produce(base, (d) => {
    d.currentYear = d.birthYear + age;
    d.character.age = age;
    d.character.lifeStage = lifeStageForAge(age, content);
    d.teen = startingTeen(age, d.currentYear, content);
    for (let i = 0; i < age; i++) d.inputLog.push({ year: d.birthYear + i, kind: 'ageUp', payload: {} });
    for (const person of Object.values(d.people)) {
      if (d.currentYear - person.birthYear >= content.balance.mortality.maxAge) {
        person.alive = false;
        person.deathYear = d.currentYear;
      }
    }
    const stats = { ...d.character.stats };
    d.recap = { year: d.currentYear, age, statsBefore: stats, statsAfter: { ...stats } };
    d.lifetime = { happinessTotal: d.character.stats.happiness * age, years: age };
    d.finances.savings = options.savings ?? 40_000;
    d.finances.lastLedger = { year: d.currentYear - 1, gross: 90_000, retirement: 0, tax: 0, housing: 0, living: 0, debtPayments: 0, interest: 0, debtInterest: 0, borrowed: 0, support: 0, children: 0, care: 0, supportPaid: 0, supportReceived: 0, upkeep: 0, insurance: 0, giving: 0, business: 0, net: 90_000 };
    d.housing = age < 18 ? { kind: 'with_parents', cityId: d.character.cityId, annualCost: 0, since: d.birthYear } : { kind: 'renting', cityId: d.character.cityId, annualCost: 0, since: d.currentYear - 3 };
    if (options.vice !== undefined) d.character.hidden.vice = options.vice;
    for (const flag of options.flags ?? []) d.flags[flag] = true;
  });
}
