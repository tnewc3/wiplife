import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { createLife } from '../engine/life';
import { getFamily, type FamilyMember } from '../engine/selectors';
import type { GenderCategory, RelationshipKind } from '../engine/types';
import { relationshipLabel, relativeLabel } from './labels';

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
    };
    for (let i = 0; i < 300; i++) {
      const life = createLife({ mode: 'random', seed: `labels-${i}`, birthYear: 2026 }, content);
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
