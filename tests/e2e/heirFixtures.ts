/**
 * Saved lives for the heir tests (E2b): a grown-up with a family, alive or just
 * dead, built with the engine on the test content pack and written into the
 * app's database before it loads. (Living a life to its end, with children, would
 * take hundreds of taps; the flows after the death are what these tests are for.)
 * The engine's own tests (src/engine/estate) cover who inherits what.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { produce } from 'immer';
import type { Page } from '@playwright/test';
import type { ContentBundle } from '../../src/content/schemas';
import { createChild } from '../../src/engine/family/children';
import { createLife, endYear } from '../../src/engine/life';
import { createRng } from '../../src/engine/rng';
import { lifeStageForAge } from '../../src/engine/systems/aging';
import type { LifeState } from '../../src/engine/types';

/** The test content pack, as the app loads it with ?content=test (read when first needed: `npm run content` builds it). */
function pack(): ContentBundle {
  return JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;
}

export interface FamilyLife {
  seed: string;
  /** Ages of your children. */
  kids: number[];
  age?: number;
  savings?: number;
  /** A spouse who is the other parent. */
  spouse?: boolean;
}

/** A grown-up with children (and a spouse), at the start of a year. */
export function familyLife(options: FamilyLife): LifeState {
  const content = pack();
  const age = options.age ?? 52;
  const base = createLife({ mode: 'random', seed: options.seed, birthYear: 1990 }, content);
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
    const stats = { ...d.character.stats };
    d.recap = { year: d.currentYear, age, statsBefore: stats, statsAfter: { ...stats } };
    d.lifetime = { happinessTotal: d.character.stats.happiness * age, years: age };
    d.finances.savings = options.savings ?? 240_000;
    if (options.spouse) {
      const template = JSON.parse(JSON.stringify(Object.values(d.people)[0]!)) as (typeof d.people)[string];
      d.people.sp = {
        ...template,
        id: 'sp',
        name: { first: 'Sam', last: 'Spouse' },
        birthYear: d.currentYear - 48,
        alive: true,
        tags: [],
        cityId: d.character.cityId,
        traits: {},
        looks: 50,
        smarts: 50,
        mood: 50,
        moodBase: 50,
        wealthLevel: 'middle',
        canCarry: true,
      };
      delete d.people.sp.deathYear;
      d.relationships.sp = { personId: 'sp', kind: 'spouse', status: 'active', affection: 80, trust: 80, memories: [], since: d.currentYear - 20, kindSince: d.currentYear - 18, wasSpouse: true };
    }
    const rng = createRng(`${options.seed}-kids`);
    for (const kid of options.kids) {
      createChild(d, rng, { origin: 'birth', age: kid, parents: { you: true, ...(options.spouse ? { other: 'sp' } : {}) }, ...(options.spouse ? { otherParentId: 'sp' } : {}), custody: 'you' }, content);
    }
  });
}

/** The same life, dead of natural causes at the end of its year, estate settled. */
export function deadLife(life: LifeState): LifeState {
  const content = pack();
  const ending = produce(life, (d) => {
    d.phase = 'yearEnd';
    d.recap = { year: d.currentYear, age: d.character.age, statsBefore: { ...d.character.stats }, statsAfter: null };
    d.death = { year: d.currentYear, age: d.character.age, causeId: Object.keys(content.causes).sort()[0]! };
    d.lifetime = { happinessTotal: d.character.stats.happiness * (d.character.age - 1), years: d.character.age - 1 };
  });
  return endYear(ending, content);
}

/** Puts a life in the app's database as the active life, and reloads so the app loads it. */
export async function loadSavedLife(page: Page, life: LifeState): Promise<void> {
  const content = pack();
  const envelope = { schemaVersion: 13, contentVersion: content.contentVersion, savedAt: new Date().toISOString(), data: JSON.parse(JSON.stringify(life)) as unknown };
  await page.evaluate(
    (saved) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('wiplife');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('lives', 'readwrite');
          tx.objectStore('lives').put({ id: 'active', envelope: saved });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    envelope,
  );
  await page.reload();
}
