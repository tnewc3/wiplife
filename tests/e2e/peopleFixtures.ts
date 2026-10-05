/**
 * A saved life for the people-lives tests (E3): an adult with a sister who
 * has a job, a friend with a partner, children and trouble, and a mother who
 * will die as the next year begins, built with the engine on the test content
 * pack and written into the app's database before it loads. In the pack the
 * people you know are quiet: anyone with a job retires at their first chance,
 * and a death in your life always asks something of you.
 */
import { produce } from 'immer';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ContentBundle } from '../../src/content/schemas';
import { createLife } from '../../src/engine/life';
import { lifeStageForAge } from '../../src/engine/systems/aging';
import type { GenderCategory, LifeState, Person, RelationshipKind } from '../../src/engine/types';

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

export function peopleLife(seed: string): LifeState {
  const content = pack();
  const age = 40;
  const base = createLife({ mode: 'random', seed, birthYear: 1990 }, content);
  return produce(base, (d) => {
    d.currentYear = d.birthYear + age;
    d.character.age = age;
    d.character.lifeStage = lifeStageForAge(age, content);
    for (let i = 0; i < age; i++) d.inputLog.push({ year: d.birthYear + i, kind: 'ageUp', payload: {} });
    // Nobody the generator gave you is in the way: you know exactly these people.
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
    const sister = add({ id: 'sis', first: 'Rae', age: 38, kind: 'sibling', category: 'woman', affection: 75 });
    sister.occupation = Object.keys(content.jobs).sort()[0]!;
    // Dolores reaches the oldest age a person can, as the next year begins: she dies then, for certain.
    add({ id: 'mom', first: 'Dolores', age: content.balance.mortality.maxAge - 1, kind: 'grandparent', category: 'woman', affection: 80 });
    add({ id: 'frd', first: 'Marcus', age: 41, kind: 'friend', category: 'man', affection: 85 });
    add({ id: 'pal', first: 'Jo', age: 36, kind: 'friend', category: 'nonbinary', affection: 85 });
    d.finances.savings = 40_000;
    const stats = { ...d.character.stats };
    d.recap = { year: d.currentYear, age, statsBefore: stats, statsAfter: { ...stats } };
    d.lifetime = { happinessTotal: d.character.stats.happiness * age, years: age };
    const condition = Object.values(content.conditions).find((c) => c.kind === 'illness' && c.treatable)!;
    const offense = Object.values(content.offenses)[0]!;
    d.people.frd!.life = {
      tier: 'close',
      background: 'middle',
      level: 0,
      levelSince: d.currentYear - 2,
      partner: { name: { first: 'Kit', last: 'Lee' }, genderCategory: 'woman', birthYear: d.currentYear - 39, canCarry: true, status: 'married', since: d.currentYear - 6, statusSince: d.currentYear - 3 },
      children: [
        { first: 'Ada', birthYear: d.currentYear - 4 },
        { first: 'Sam', birthYear: d.currentYear - 1 },
      ],
      troubles: [
        { kind: 'illness', refId: condition.id, since: d.currentYear - 1, severity: 50, treated: true },
        { kind: 'crime', refId: offense.id, since: d.currentYear, severity: 0, treated: false, stage: 'bailed' },
      ],
      recovered: [],
      gossip: 50,
    };
    d.news = [
      {
        year: d.currentYear - 1,
        lines: [
          { personId: 'sis', kind: 'promoted', text: 'Rae Rivera, your sister, got promoted and is a senior analyst now.' },
          { personId: 'frd', kind: 'had_child', text: 'A new baby: Sam, born to Marcus, your friend.' },
        ],
      },
    ];
  });
}
