/**
 * Saved lives for the U1 (UI redesign) tests, built with the engine on the test content pack and written into the
 * app's database before it loads: a life whose grandmother has died (Late relationships), and a life of 99 years
 * with a full log (the life log over a whole century).
 */
import { produce } from 'immer';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ContentBundle } from '../../src/content/schemas';
import { createLife } from '../../src/engine/life';
import { lifeStageForAge } from '../../src/engine/systems/aging';
import type { HistoryEntry, LifeState } from '../../src/engine/types';
import { peopleLife } from './peopleFixtures';

const pack = () => JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;

/** The people-lives fixture, with Dolores (your grandmother) dead three years ago. */
export function lateRelationshipsLife(seed: string): LifeState {
  return produce(peopleLife(seed), (d) => {
    d.people.mom!.alive = false;
    d.people.mom!.deathYear = d.currentYear - 3;
  });
}

/** 99 years old, five lines a year (495 in all, the log's limit is 500), some with money. */
export function centuryLife(seed: string): LifeState {
  const content = pack();
  const age = 99;
  const base = createLife({ mode: 'random', seed, birthYear: 1920, countryId: 'us' }, content);
  return produce(base, (d) => {
    d.currentYear = d.birthYear + age;
    d.character.age = age;
    d.character.lifeStage = lifeStageForAge(age, content);
    for (let i = 0; i < age; i++) d.inputLog.push({ year: d.birthYear + i, kind: 'ageUp', payload: {} });
    const history: HistoryEntry[] = [];
    for (let a = 1; a <= age; a++) {
      for (let line = 1; line <= 5; line++) {
        const entry: HistoryEntry = { year: d.birthYear + a, age: a, text: `Age ${a}, line ${line}: something worth remembering happened.`, tags: ['event'], importance: line === 1 ? 3 : 1 };
        if (line === 3) entry.money = { change: (a % 2 === 0 ? 1 : -1) * 100 * a, balance: 5_000 + a };
        history.push(entry);
      }
    }
    d.history = history.slice(0, 500);
    d.finances.savings = 5_099;
  });
}
