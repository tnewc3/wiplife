/**
 * A saved life for the organized crime tests (O1): a grown-up who is in an organization of one kind, at the top rank
 * (they run it) or a low one, with dirty money, built with the engine on the test content pack and written into the app's
 * database before it loads.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { produce } from 'immer';
import type { ContentBundle, OrgKind } from '../../src/content/schemas';
import { joinCrew, promote } from '../../src/engine/crime/crew';
import { createLife } from '../../src/engine/life';
import { lifeStageForAge } from '../../src/engine/systems/aging';
import { startingTeen } from '../../src/engine/teen/query';
import type { LifeState } from '../../src/engine/types';

function pack(): ContentBundle {
  return JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;
}

export interface OrgLife {
  seed: string;
  kind?: OrgKind;
  /** Runs the organization (the top rank, the default), or is at this rank. */
  rank?: number;
  age?: number;
  dirty?: number;
}

export function orgLife(options: OrgLife): LifeState {
  const content = pack();
  const age = options.age ?? 31;
  const kind = options.kind ?? 'mafia';
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
    d.finances.savings = 8_000;
    d.character.cityId = 'chicago';
    d.housing = { kind: 'renting', cityId: 'chicago', annualCost: 0, since: d.currentYear - 3 };
    if (age < 18) return;
    d.career.job = null;
    joinCrew(d as LifeState, content, undefined, undefined, kind);
    const rank = options.rank ?? 99;
    while (d.crime.rank < rank && promote(d as LifeState, content)) continue;
    d.crime.standing = 60;
    d.crime.heat = 20;
    d.finances.dirty = options.dirty ?? 30_000;
    d.crime.totals.earned = d.finances.dirty;
  });
}
