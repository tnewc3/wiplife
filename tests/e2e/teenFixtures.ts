/**
 * A saved teenager for the teen-years tests (T1): a fifteen- or sixteen-year-old
 * with a school and its crowds, parents who set rules at home and a little
 * money, built with the engine on the test content pack (the teen step, crowds
 * and rules come from the real balance) and written into the app's database
 * before it loads.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { produce } from 'immer';
import type { ContentBundle } from '../../src/content/schemas';
import { playYear } from '../../src/engine/autoplay';
import { createLife } from '../../src/engine/life';
import { lifeStageForAge } from '../../src/engine/systems/aging';
import type { LifeState } from '../../src/engine/types';
import { pruneWeb } from '../../src/engine/web/ties';

function pack(): ContentBundle {
  return JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;
}

export interface TeenLife {
  seed: string;
  age?: number;
  savings?: number;
  /** Start with a permit and lessons, ready for the license test. */
  readyToTest?: boolean;
  /** Start already belonging to the first crowd. */
  inCrowd?: boolean;
}

/** A teenager at the start of a year. */
export function teenLife(options: TeenLife): LifeState {
  const content = pack();
  const age = options.age ?? 15;
  const base = createLife({ mode: 'random', seed: options.seed, birthYear: 2000 }, content);
  // Move to two years before the age (without living them), then live those two: the teen step runs and sets up the school and the rules at home.
  const from = age - 2;
  let life = produce(base, (d) => {
    d.currentYear = d.birthYear + from;
    d.character.age = from;
    d.character.lifeStage = lifeStageForAge(from, content);
    for (let i = 0; i < from; i++) d.inputLog.push({ year: d.birthYear + i, kind: 'ageUp', payload: {} });
    for (const person of Object.values(d.people)) {
      if (d.currentYear - person.birthYear >= content.balance.mortality.maxAge) {
        person.alive = false;
        person.deathYear = d.currentYear;
      }
    }
    pruneWeb(d);
    const stats = { ...d.character.stats };
    d.recap = { year: d.currentYear, age: from, statsBefore: stats, statsAfter: { ...stats } };
    d.lifetime = { happinessTotal: d.character.stats.happiness * from, years: from };
  });
  for (let i = 0; i < 2; i++) life = playYear(life, content);
  return produce(life, (d) => {
    d.finances.savings = options.savings ?? 600;
    // A steady teenager, so the tests don't depend on a roll.
    Object.assign(d.character.personality, { riskTaking: 30, discipline: 60, sociability: 70, confidence: 60, kindness: 60 });
    Object.assign(d.character.stats, { fitness: 70 });
    if (options.readyToTest) d.teen.license = { stage: 'permit', since: d.currentYear - 1, lessons: 4, fails: 0 };
    if (options.inCrowd) {
      d.teen.member = { cliqueId: d.teen.cliques[0]!.id, since: d.currentYear, rank: 50 };
    }
    d.teen.penalties = [];
    delete d.teen.caught;
    // A curfew at the usual level, whoever the parents are, so the rules tests have something to ask about and break.
    const home = d.teen.home;
    if (home && !home.rules.some((r) => r.ruleId === 'curfew')) {
      home.rules.push({ ruleId: 'curfew', by: Object.keys(home.styles)[0]!, level: 1, since: d.currentYear, broken: 0, caught: 0 });
    }
  });
}
