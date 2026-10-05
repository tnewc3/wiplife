/**
 * A saved life for the social web tests (E4): an adult with parents who are
 * married, a sister, and two friends who are feuding. One friend has heard a
 * twisted version of how you lost a job; the other knows the true version of
 * something you did and haven't told anyone. Built with the engine on the
 * test content pack and written into the app's database before it loads. In
 * the pack the web is still (tests/e2e/content/balance/web.yaml): what is here
 * stays as it is.
 */
import { produce } from 'immer';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ContentBundle } from '../../src/content/schemas';
import { createLife } from '../../src/engine/life';
import { lifeStageForAge } from '../../src/engine/systems/aging';
import type { GenderCategory, LifeState, Person, RelationshipKind } from '../../src/engine/types';
import { addTie, emptyWeb } from '../../src/engine/web/ties';

function pack(): ContentBundle {
  return JSON.parse(readFileSync(path.resolve('src/content/compiled/test-content.json'), 'utf8')) as ContentBundle;
}

interface Spec {
  id: string;
  first: string;
  age: number;
  kind: RelationshipKind;
  category: GenderCategory;
  affection: number;
}

export function webLife(seed: string): LifeState {
  const content = pack();
  const age = 40;
  const base = createLife({ mode: 'random', seed, birthYear: 1990 }, content);
  return produce(base, (d) => {
    d.currentYear = d.birthYear + age;
    d.character.age = age;
    d.character.lifeStage = lifeStageForAge(age, content);
    for (let i = 0; i < age; i++) d.inputLog.push({ year: d.birthYear + i, kind: 'ageUp', payload: {} });
    const template: Person = JSON.parse(JSON.stringify(Object.values(d.people)[0]!)) as Person;
    for (const id of Object.keys(d.people)) {
      delete d.people[id];
      delete d.relationships[id];
    }
    const add = (spec: Spec): Person => {
      const person: Person = {
        ...JSON.parse(JSON.stringify(template)),
        id: spec.id,
        name: { first: spec.first, last: 'Rivera' },
        birthYear: d.currentYear - spec.age,
        alive: true,
        identity: { genderIdentity: spec.category, genderCategory: spec.category, genderExpression: 'neutral', pronouns: { subject: 'they', object: 'them', possessive: 'their', possessivePronoun: 'theirs', reflexive: 'themself', verbPlural: true }, attractedTo: ['man', 'woman', 'nonbinary'] },
        traits: {},
        cityId: d.character.cityId,
        tags: [spec.kind],
        mood: 60,
        moodBase: 60,
        wealthLevel: 'middle',
        canCarry: true,
      };
      delete person.deathYear;
      delete person.child;
      delete person.priorChildren;
      delete person.life;
      delete person.occupation;
      d.people[spec.id] = person;
      d.relationships[spec.id] = { personId: spec.id, kind: spec.kind, status: 'active', affection: spec.affection, trust: 70, memories: [], since: d.currentYear - 10 };
      return person;
    };
    add({ id: 'dad', first: 'Frank', age: 66, kind: 'parent', category: 'man', affection: 80 });
    add({ id: 'mom', first: 'Dolores', age: 64, kind: 'parent', category: 'woman', affection: 80 });
    add({ id: 'sis', first: 'Rae', age: 38, kind: 'sibling', category: 'woman', affection: 75 });
    add({ id: 'frd', first: 'Marcus', age: 41, kind: 'friend', category: 'man', affection: 85 });
    add({ id: 'pal', first: 'Jo', age: 36, kind: 'friend', category: 'nonbinary', affection: 85 });
    d.finances.savings = 40_000;
    const stats = { ...d.character.stats };
    d.recap = { year: d.currentYear, age, statsBefore: stats, statsAfter: { ...stats } };
    d.lifetime = { happinessTotal: d.character.stats.happiness * age, years: age };
    for (const id of ['frd', 'pal']) {
      d.people[id]!.life = { tier: 'close', background: 'middle', level: 0, levelSince: d.currentYear - 2, partner: null, children: [], troubles: [], recovered: [], gossip: 50 };
    }
    // The web: your parents are married and close, your sister is tied to them, and Marcus and Jo are feuding.
    d.web = emptyWeb();
    const year = d.currentYear;
    addTie(d.web, 'dad', 'mom', 'married', 85, 'family', year - 30);
    addTie(d.web, 'dad', 'sis', 'parentChild', 80, 'family', year - 38);
    addTie(d.web, 'mom', 'sis', 'parentChild', 80, 'family', year - 38);
    addTie(d.web, 'frd', 'pal', 'friends', 10, 'context', year - 5).feud = { since: year - 1, aware: true };
    d.web.items = [
      { id: 'k1', kind: 'jobLoss', subject: 'you', year: year - 1, truth: 'fired', holders: { pal: { version: 'fired', since: year - 1, from: 'saw', reacted: true }, frd: { version: 'fired_stealing', since: year - 1, from: 'pal', reacted: true } } },
      { id: 'k2', kind: 'unknownCrime', subject: 'you', year: year - 2, truth: 'crime', holders: { pal: { version: 'crime', since: year - 2, from: 'saw', reacted: true } } },
    ];
    d.web.nextItem = 3;
  });
}
