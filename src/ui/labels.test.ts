import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { createLife } from '../engine/life';
import { getFamily, type FamilyMember } from '../engine/selectors';
import type { GenderCategory, RelationshipKind } from '../engine/types';
import { REFUSAL_CODES } from '../engine/godmode';
import { ageFixedSentence, GOD_AREA_LABELS, relationshipLabel, refusalSentence, relativeLabel } from './labels';

function member(kind: RelationshipKind, genderCategory: GenderCategory): FamilyMember {
  return {
    person: { identity: { genderCategory } },
    relationship: { kind },
    age: 30,
  } as FamilyMember; // Only the fields relativeLabel reads.
}

describe('relativeLabel', () => {
  it.each([
    ['parent', 'woman', 'Mother'],
    ['parent', 'man', 'Father'],
    ['parent', 'nonbinary', 'Parent'],
    ['sibling', 'woman', 'Sister'],
    ['sibling', 'man', 'Brother'],
    ['sibling', 'nonbinary', 'Sibling'],
    ['stepparent', 'woman', 'Stepmother'],
    ['stepparent', 'man', 'Stepfather'],
    ['stepparent', 'nonbinary', 'Stepparent'],
    ['grandparent', 'woman', 'Grandmother'],
    ['grandparent', 'man', 'Grandfather'],
    ['grandparent', 'nonbinary', 'Grandparent'],
  ] as const)('labels a %s who is a %s as %s', (kind, category, label) => {
    expect(relativeLabel(member(kind, category))).toBe(label);
  });

  it('follows gender category, not pronouns', () => {
    const woman = member('parent', 'woman');
    woman.person.identity = { ...woman.person.identity, pronouns: { subject: 'they' } as never };
    expect(relativeLabel(woman)).toBe('Mother');
  });

  it('matches the gender category of every generated relative', () => {
    const expected: Record<string, Record<GenderCategory, string>> = {
      parent: { woman: 'Mother', man: 'Father', nonbinary: 'Parent' },
      sibling: { woman: 'Sister', man: 'Brother', nonbinary: 'Sibling' },
      grandparent: { woman: 'Grandmother', man: 'Grandfather', nonbinary: 'Grandparent' },
    };
    for (let i = 0; i < 300; i++) {
      const life = createLife({ mode: 'random', seed: `labels-${i}`, birthYear: 2026, countryId: 'us' }, content);
      for (const m of getFamily(life)) {
        expect(relativeLabel(m)).toBe(expected[m.relationship.kind]![m.person.identity.genderCategory]);
      }
    }
  });
});

describe('relationshipLabel', () => {
  it('labels partners by gender, and an ex you married as an ex-spouse', () => {
    expect(relationshipLabel('partner', 'woman')).toBe('Girlfriend');
    expect(relationshipLabel('fiance', 'man')).toBe('Fiancé');
    expect(relationshipLabel('spouse', 'nonbinary')).toBe('Spouse');
    expect(relationshipLabel('ex', 'woman')).toBe('Ex');
    expect(relationshipLabel('ex', 'woman', true)).toBe('Ex-spouse');
    expect(relationshipLabel('ex', 'man', true)).toBe('Ex-spouse');
    expect(relationshipLabel('spouse', 'man', true)).toBe('Husband');
  });
});


describe('god mode refusal sentences (G1)', () => {
  const name = (id: string) => (id === 'p' ? 'Maya' : id);
  const facts = { message: 'must be whole', max: 5, min: 0, age: 18, theirAge: 16, minAge: 20, maxAge: 40, job: 'Welder', country: 'Canada', reason: 'family', id: 'x' };

  it('has a sentence for every code the engine can return, with the facts filled in and the person named', () => {
    for (const code of REFUSAL_CODES) {
      const sentence = refusalSentence({ code, area: 'relationship', person: 'p', facts }, name);
      expect(sentence.trim().length).toBeGreaterThan(8);
      expect(sentence).not.toMatch(/undefined|\[object|NaN|\{|\}/);
    }
  });

  it('names a person by their first name and never guesses pronouns', () => {
    for (const code of REFUSAL_CODES) {
      const sentence = refusalSentence({ code, area: 'relationship', person: 'p', facts }, name);
      expect(sentence).not.toMatch(/\b(he|she|him|her|his|hers|himself|herself)\b/i);
    }
    expect(refusalSentence({ code: 'minor_romance', area: 'relationship', person: 'p', field: 'kind', facts: { age: 18 } }, name)).toBe('Maya is under 18, so romance isn’t possible.');
    expect(refusalSentence({ code: 'minor_romance', area: 'relationship', person: 'p', facts: { age: 18, you: 1 } }, name)).toBe('You are under 18, so romance isn’t possible.');
  });

  it('gives a reason for every age that is fixed, and a name for every area an edit can point at', () => {
    for (const reason of ['self', 'family', 'place', 'child', 'dead', 'guardian', 'unknown']) expect(ageFixedSentence(reason, 'Maya').length).toBeGreaterThan(10);
    for (const area of ['name', 'identity', 'latent', 'looks', 'appearance', 'stats', 'personality', 'values', 'conditions', 'troubles', 'neuro', 'relationship', 'work', 'wealth', 'cityId', 'faith', 'languages', 'citizenships', 'money', 'birthYear', 'target']) {
      expect(GOD_AREA_LABELS[area]).toBeTruthy();
    }
  });
});
