/**
 * A saved life for the Social tests (Batch 8): a grown-up (or a teen) with a rented home, optionally a job and a boss,
 * and accounts already open, built with the engine on the test content pack and written into the app's database
 * before it loads.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { produce } from 'immer';
import type { ContentBundle } from '../../src/content/schemas';
import { enterPath } from '../../src/engine/fame/ladder';
import { createLife } from '../../src/engine/life';
import { openAccount } from '../../src/engine/social/accounts';
import { lifeStageForAge } from '../../src/engine/systems/aging';
import { startingTeen } from '../../src/engine/teen/query';
import type { LifeState } from '../../src/engine/types';

function pack(): ContentBundle {
  return JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;
}

export interface SocialLife {
  seed: string;
  age?: number;
  /** A job, with a boss, so a post can reach an employer. */
  job?: boolean;
  /** A career in the social media path (its first account is opened for you). */
  creator?: boolean;
  /** Accounts already open: the platform, handle and followers. */
  accounts?: { platform: string; handle: string; followers: number }[];
}

export function socialLife(options: SocialLife): LifeState {
  const content = pack();
  const age = options.age ?? 24;
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
    d.finances.savings = 5_000;
    if (age >= 18) d.housing = { kind: 'renting', cityId: d.character.cityId, annualCost: 0, since: d.currentYear - 3 };
    if (options.job) {
      d.career.job = { jobId: 'food_service', level: 1, salary: 27_000, since: d.currentYear - 2, yearsAtLevel: 1, performance: 60, employer: 'The Corner Grill' };
      d.people.boss = { ...Object.values(d.people)[0]!, id: 'boss', name: { first: 'Rowan', last: 'Pike' }, birthYear: d.birthYear - 15, alive: true };
      d.relationships.boss = { personId: 'boss', kind: 'boss', status: 'active', affection: 50, trust: 50, memories: [], since: d.currentYear - 2 };
    }
    if (options.creator) enterPath(d as LifeState, 'social', 'after_viral', content);
    for (const a of options.accounts ?? []) {
      openAccount(d as LifeState, a.platform, a.handle, 'gaming', content);
      d.social.accounts[a.platform]!.followers = a.followers;
      d.social.accounts[a.platform]!.peak = a.followers;
    }
  });
}
