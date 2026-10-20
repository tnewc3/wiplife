/**
 * Saved lives for the school and work tests (Batch 3): a teenager in high school with a class and teachers (in the US
 * and the UK, where the choice at 16 is open), and an adult with a job, a boss and coworkers. Built with the engine on
 * the test content pack and written into the app's database before it loads.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { produce } from 'immer';
import type { ContentBundle, CountryId } from '../../src/content/schemas';
import { playYear } from '../../src/engine/autoplay';
import { startJob } from '../../src/engine/career';
import { createLife } from '../../src/engine/life';
import { lifeStageForAge } from '../../src/engine/systems/aging';
import type { LifeState } from '../../src/engine/types';
import { pruneWeb } from '../../src/engine/web/ties';

function pack(): ContentBundle {
  return JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;
}

/** A life moved straight to an age at the start of a year, without living the years between. */
function moveTo(seed: string, countryId: CountryId, age: number, content: ContentBundle): LifeState {
  const base = createLife({ mode: 'random', seed, birthYear: 2000, countryId }, content);
  return produce(base, (d) => {
    d.currentYear = d.birthYear + age;
    d.character.age = age;
    d.character.lifeStage = lifeStageForAge(age, content);
    for (let i = 0; i < age; i++) d.inputLog.push({ year: d.birthYear + i, kind: 'ageUp', payload: {} });
    for (const person of Object.values(d.people)) {
      if (d.currentYear - person.birthYear >= content.balance.mortality.maxAge) {
        person.alive = false;
        person.deathYear = d.currentYear;
      }
    }
    pruneWeb(d);
    const stats = { ...d.character.stats };
    d.recap = { year: d.currentYear, age, statsBefore: stats, statsAfter: { ...stats } };
    d.lifetime = { happinessTotal: d.character.stats.happiness * age, years: age };
  });
}

export interface SchoolLifeOptions {
  seed: string;
  country?: CountryId;
  age?: number;
}

/** A teenager at the start of a year in high school, with the class and teachers the school step made. */
export function studentLife(options: SchoolLifeOptions): LifeState {
  const content = pack();
  const age = options.age ?? 15;
  // Two years before the age, then live those two: the school step starts the school, its class and its teachers.
  let life = moveTo(options.seed, options.country ?? 'us', age - 2, content);
  for (let i = 0; i < 2; i++) life = playYear(life, content);
  return produce(life, (d) => {
    d.finances.savings = 800;
    Object.assign(d.character.stats, { stress: 20 });
  });
}

/** An adult at the start of a year with a job, a boss and coworkers. */
export function workerLife(options: SchoolLifeOptions): LifeState {
  const content = pack();
  const life = moveTo(options.seed, options.country ?? 'us', options.age ?? 26, content);
  return produce(life, (d) => {
    d.finances.savings = 5000;
    d.education.credentials.push({ type: 'hs_diploma', year: d.birthYear + 18, gpa: 3 });
    startJob(d, 'bank_teller', content);
  });
}
