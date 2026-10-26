/** Shared test data for the god mode tests. */
import { produce } from 'immer';
import { content } from '../../content';
import { checkInvariants } from '../invariants';
import { lifeAtAge, cloneJson } from '../testFixtures';
import type { GenderCategory, LifeState, Person, Relationship, RelationshipKind } from '../types';

export interface PersonSpec {
  id: string;
  age: number;
  kind: RelationshipKind;
  category?: GenderCategory;
  attractedTo?: GenderCategory[];
  cityId?: string;
  alive?: boolean;
}

/** Adds someone to a draft life (an adult woman attracted to men, unless told otherwise). */
export function addPerson(d: LifeState, spec: PersonSpec): void {
  const template = Object.values(d.people).find((p) => !p.child)!;
  const category = spec.category ?? 'woman';
  const person: Person = {
    ...cloneJson(template),
    id: spec.id,
    name: { first: `Test${spec.id}`, last: 'Person' },
    birthYear: d.currentYear - spec.age,
    alive: spec.alive ?? true,
    cityId: spec.cityId ?? d.character.cityId,
    identity: { ...cloneJson(template.identity), genderCategory: category, attractedTo: spec.attractedTo ?? ['man'] },
    tags: [],
  };
  delete person.deathYear;
  delete person.child;
  delete person.grandchild;
  delete person.life;
  delete person.priorChildren;
  if (!person.alive) person.deathYear = d.currentYear - 1;
  d.people[spec.id] = person;
  d.relationships[spec.id] = {
    personId: spec.id,
    kind: spec.kind,
    status: 'active',
    affection: 60,
    trust: 60,
    memories: [],
    since: d.currentYear - 4,
  } satisfies Relationship;
}

/**
 * A man aged `age` (default 30) in Chicago, attracted to women, living in a rental, with a friend "pal" (a woman of 28, attracted to men),
 * a minor friend "kid" (16), an acquaintance "ace" (a man of 40), and the family a random life has.
 */
export function editable(age = 30, seed = 'wp1'): LifeState {
  const life = produce(lifeAtAge(seed, age), (d) => {
    d.character.cityId = 'chicago';
    d.character.identity.genderCategory = 'man';
    d.character.identity.attractedTo = ['woman'];
    d.housing = { kind: age >= 18 ? 'renting' : 'with_parents', cityId: 'chicago', annualCost: 0, since: d.currentYear - 1 };
    d.career.job = null;
    // What the tests rely on, whatever the seed rolled.
    d.belonging.faith = { id: 'protestant', strength: 45, raised: 'protestant', since: null, changes: 0 };
    d.belonging.household = { faith: 'protestant', devotion: 42 };
    d.character.hidden.talent = 'art';
    d.character.hidden.talentDiscovered = false;
    d.character.latent = {};
    d.character.canCarry = false;
    for (const p of Object.values(d.people)) p.cityId = 'chicago';
    // A parent, a sibling and a grandparent, whatever the seed rolled.
    for (const [kind, relAge] of [['parent', 58], ['sibling', 26], ['grandparent', 83]] as const) {
      if (Object.values(d.relationships).some((r) => r.kind === kind)) continue;
      addPerson(d, { id: `fam_${kind}`, age: relAge, kind });
      // A sibling is born while the parents are of an age to have a child, and not in your year.
      if (kind === 'sibling') {
        const parent = Object.values(d.relationships).find((r) => r.kind === 'parent');
        const born = (parent ? d.people[parent.personId]!.birthYear : d.currentYear - 56) + 27;
        d.people.fam_sibling!.birthYear = Math.min(born === d.birthYear ? born + 1 : born, d.birthYear - 1);
      }
    }
    addPerson(d, { id: 'pal', age: 28, kind: 'friend', category: 'woman', attractedTo: ['man'] });
    addPerson(d, { id: 'kid', age: 16, kind: 'friend', category: 'woman', attractedTo: ['man'] });
    addPerson(d, { id: 'ace', age: 40, kind: 'acquaintance', category: 'man', attractedTo: ['woman'] });
  });
  const bad = checkInvariants(life, content);
  if (bad.length > 0) throw new Error(`the test life is not valid: ${bad.join('; ')}`);
  return life;
}

/** The first relative of this kind. */
export function relativeOf(life: LifeState, kind: RelationshipKind): Person {
  const rel = Object.values(life.relationships).find((r) => r.kind === kind);
  if (!rel) throw new Error(`no ${kind} in the test life`);
  return life.people[rel.personId]!;
}
