/**
 * Saved lives for the Batch 10 phone tests (language and travel, expanded), built with the engine on the test content pack.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { produce } from 'immer';
import type { ContentBundle } from '../../src/content/schemas';
import { performAction } from '../../src/engine/actions';
import type { LifeState } from '../../src/engine/types';
import { familyLife } from './heirFixtures';

function pack(): ContentBundle {
  return JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;
}

/** A grown-up in Chicago who speaks English. Kids and a spouse are optional. */
export function chicagoLife(seed: string, options: { age?: number; kids?: number[]; spouse?: boolean; savings?: number } = {}): LifeState {
  const life = familyLife({ seed, age: options.age ?? 28, kids: options.kids ?? [], savings: options.savings ?? 40_000, ...(options.spouse ? { spouse: true } : {}) });
  return produce(life, (d) => {
    d.character.cityId = d.character.birthCityId = 'chicago';
    d.character.languages = [{ id: 'en', skill: 100, native: true, lastUsed: d.currentYear }];
    d.housing = { kind: 'renting', cityId: 'chicago', annualCost: 12_000, since: d.currentYear, ...(options.spouse ? { partnerId: 'sp' } : {}) };
    d.education.credentials = [{ type: 'hs_diploma', year: d.birthYear + 18, gpa: 3.2 }];
    for (const p of Object.values(d.people)) p.cityId = 'chicago';
  });
}

/** A friend in your city whose first language is Spanish. */
export function withSpanishFriend(life: LifeState): LifeState {
  return produce(life, (d) => {
    const template = JSON.parse(JSON.stringify(Object.values(d.people).find((p) => p.alive)!)) as (typeof d.people)[string];
    d.people.amiga = { ...template, id: 'amiga', name: { first: 'Lucía', last: 'Mora' }, birthYear: d.currentYear - 30, alive: true, tags: [], cityId: 'chicago', languages: [{ id: 'es', skill: 100, native: true, lastUsed: d.currentYear }, { id: 'en', skill: 80, native: false, lastUsed: d.currentYear }], looks: 50, smarts: 50, mood: 50, moodBase: 50, wealthLevel: 'middle' };
    delete d.people.amiga.deathYear;
    d.relationships.amiga = { personId: 'amiga', kind: 'friend', status: 'active', affection: 60, trust: 60, memories: [], since: d.currentYear - 4 };
  });
}

/** Someone who speaks French at the conversational level (not yet certified) and whose exam, the first time, is passed (the roll is the life's own). */
export function examLife(): LifeState {
  const content = pack();
  for (let i = 0; i < 80; i++) {
    const life = produce(chicagoLife(`languages-exam-${i}`, { savings: 20_000 }), (d) => {
      d.character.languages.push({ id: 'fr', skill: 55, native: false, lastUsed: d.currentYear });
    });
    const after = performAction(life, 'sit_language_exam', { exam: { languageId: 'fr', level: 'conversational' } }, content);
    if (after.languages.certificates.fr === 'conversational') return life;
  }
  throw new Error('no seed passes the exam');
}

/** Married a year ago, to the spouse who lives with you, no honeymoon yet. */
export function newlywedLife(): LifeState {
  return produce(chicagoLife('honeymoon-phone', { spouse: true, savings: 30_000 }), (d) => {
    d.relationships.sp!.memories.push({ tag: 'married_you', year: d.currentYear - 1 });
    d.relationships.sp!.since = d.currentYear - 2;
    d.relationships.sp!.kindSince = d.currentYear - 1;
  });
}

/** A couple with two children, in Chicago, with money for a family stay. */
export function familyStayLife(): LifeState {
  return produce(chicagoLife('family-stay-phone', { age: 30, kids: [4, 9], spouse: true, savings: 90_000 }), (d) => {
    d.character.stats.happiness = 50;
  });
}
