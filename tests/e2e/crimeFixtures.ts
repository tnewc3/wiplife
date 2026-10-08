/**
 * A saved life for the crime career tests (E6a): a grown-up in a crew with
 * some standing, a little heat and dirty money to put through a business,
 * built with the engine on the test content pack and written into the app's
 * database before it loads.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { produce } from 'immer';
import type { ContentBundle } from '../../src/content/schemas';
import { joinCrew } from '../../src/engine/crime/crew';
import { createLife } from '../../src/engine/life';
import { lifeStageForAge } from '../../src/engine/systems/aging';
import { startingTeen } from '../../src/engine/teen/query';
import type { LifeState } from '../../src/engine/types';

function pack(): ContentBundle {
  return JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;
}

export interface CrimeLife {
  seed: string;
  /** In a crew (default), or just carrying dirty money from one. */
  inCrew?: boolean;
  dirty?: number;
  heat?: number;
  standing?: number;
}

export function crimeLife(options: CrimeLife): LifeState {
  const content = pack();
  const age = 29;
  const base = createLife({ mode: 'random', seed: options.seed, birthYear: 1990 }, content);
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
    d.finances.savings = 2_000;
    d.housing = { kind: 'renting', cityId: d.character.cityId, annualCost: 0, since: d.currentYear - 3 };
    // The test content pack has the real crews: pick the city's first.
    d.character.cityId = 'chicago';
    d.housing.cityId = 'chicago';
    if (options.inCrew !== false) {
      joinCrew(d as LifeState, content);
      d.crime.standing = options.standing ?? 55;
    }
    d.crime.heat = options.heat ?? 35;
    d.finances.dirty = options.dirty ?? 12_000;
    d.crime.totals.earned = d.finances.dirty;
  });
}
