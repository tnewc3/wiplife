/** Shared test data for engine, store and persistence tests. */
import { produce } from 'immer';
import { content } from '../content';
import type { ContentBundle } from '../content/schemas';
import type { CustomLifeInput } from './creation/input';
import { playLife } from './autoplay';
import { createLife } from './life';
import { lifeStageForAge } from './systems/aging';
import { startingTeen } from './teen/query';
import type { LifeState } from './types';
import { pruneWeb } from './web/ties';

/** A complete, valid custom character; override any part. */
export function customInput(overrides: Partial<CustomLifeInput> = {}): CustomLifeInput {
  return {
    name: { first: 'Robin', last: 'Okafor' },
    identity: {
      genderIdentity: 'genderfluid',
      genderCategory: 'nonbinary',
      genderExpression: 'androgynous',
      pronouns: {
        subject: 'xe',
        object: 'xem',
        possessive: 'xyr',
        possessivePronoun: 'xyrs',
        reflexive: 'xemself',
        verbPlural: false,
      },
      attractedTo: ['man', 'nonbinary'],
    },
    appearance: { descriptors: ['red hair', 'freckles'] },
    cityId: 'chicago',
    familyWealth: 'working',
    family: { parents: 2, siblings: 2 },
    stats: { health: 100, happiness: 0, smarts: 73, looks: 12, fitness: 50, stress: 99 },
    personality: { ambition: 0, confidence: 100, kindness: 55, riskTaking: 100, discipline: 100, sociability: 1 },
    ...overrides,
  };
}

/**
 * Scenario builder (docs/technical.md, section Q): a random life moved
 * straight to `age` at the start of a year, without living the years between.
 * Relatives who would be past the maximum age are marked dead.
 */
export function lifeAtAge(seed: string, age: number, contentBundle: ContentBundle = content): LifeState {
  const life = createLife({ mode: 'random', seed, birthYear: 2000 }, contentBundle);
  return produce(life, (draft) => {
    draft.currentYear = draft.birthYear + age;
    draft.character.age = age;
    draft.character.lifeStage = lifeStageForAge(age, contentBundle);
    for (let i = 0; i < age; i++) draft.inputLog.push({ year: draft.birthYear + i, kind: 'ageUp', payload: {} });
    for (const person of Object.values(draft.people)) {
      if (draft.currentYear - person.birthYear >= contentBundle.balance.mortality.maxAge) {
        person.alive = false;
        person.deathYear = draft.currentYear;
      }
    }
    pruneWeb(draft);
    // T1: an adult is taken to hold a license (a life built at birth earns one in its teen years).
    draft.teen = startingTeen(age, draft.currentYear, contentBundle);
    if (age > 0) {
      const stats = { ...draft.character.stats };
      draft.recap = { year: draft.currentYear, age, statsBefore: stats, statsAfter: { ...stats } };
    }
    draft.lifetime = { happinessTotal: draft.character.stats.happiness * age, years: age };
  });
}

/** Plays a life with random choices until it ends, calling `onYear` after every engine step. */
export function liveOut(life: LifeState, contentBundle: ContentBundle = content, onYear?: (life: LifeState) => void): LifeState {
  return playLife(life, contentBundle, onYear ? { onStep: onYear } : {});
}

/** A deep copy through JSON (the engine has no structuredClone: it is type-checked without DOM or Node). */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
