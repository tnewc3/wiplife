/**
 * A saved life for the drug tests (D1): a grown-up with savings, a dealer in their circle, a stash, and an addiction on the way,
 * built with the engine on the test content pack and written into the app's database before it loads.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { produce } from 'immer';
import type { ContentBundle } from '../../src/content/schemas';
import { meetDealer } from '../../src/engine/drugs/market';
import { syncAddiction } from '../../src/engine/drugs/habit';
import { createLife } from '../../src/engine/life';
import { lifeStageForAge } from '../../src/engine/systems/aging';
import { startingTeen } from '../../src/engine/teen/query';
import type { LifeState } from '../../src/engine/types';

function pack(): ContentBundle {
  return JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;
}

export interface D1Life {
  seed: string;
  age?: number;
  /** A dealer you know, a stash, a habit that has passed the line. */
  dealer?: boolean;
  stash?: boolean;
  addicted?: boolean;
}

export function d1Life(options: D1Life): LifeState {
  const content = pack();
  const age = options.age ?? 29;
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
    d.finances.savings = 60_000;
    d.character.cityId = 'chicago';
    d.housing = { kind: 'renting', cityId: 'chicago', annualCost: 0, since: d.currentYear - 3 };
    if (age < 18) return;
    if (options.dealer) for (let i = 0; i < 40 && d.drugs.dealers.length === 0; i++) meetDealer(d as LifeState, content);
    if (options.stash) {
      d.drugs.stock.cocaine = { units: 4, quality: 62, hidden: false };
      d.drugs.stock.cannabis = { units: 10, quality: 55, hidden: false };
    }
    if (options.addicted) {
      d.drugs.habits.painkillers = { dependence: 55, tolerance: 40, peak: 55, year: d.currentYear - 1, uses: 6, total: 20, last: d.currentYear - 1, clean: 0, quitYear: 0, recovered: false, relapses: 0 };
      syncAddiction(d as LifeState, content);
    }
  });
}
