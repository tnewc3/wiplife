import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { checkInvariants } from './invariants';
import { createLife } from './life';
import { getFamily } from './selectors';
import type { LifeState } from './types';

const SEEDS = 10_000;

function random(seed: string): LifeState {
  return createLife({ mode: 'random', seed, birthYear: 2026 }, content);
}

describe('10,000 random lives', () => {
  it('produce zero invariant failures and believable families', () => {
    const { parentAgeAtBirth, siblingWeights } = content.balance.creation.family;
    const pool = content.names.us!;
    const failures: string[] = [];
    let singleParent = 0;
    let withSiblings = 0;
    let withLatent = 0;
    const categories = new Map<string, number>();

    for (let i = 0; i < SEEDS; i++) {
      const life = random(`inv-${i}`);
      for (const f of checkInvariants(life, content)) failures.push(`seed inv-${i}: ${f}`);

      const family = getFamily(life);
      const parents = family.filter((m) => m.relationship.kind === 'parent');
      const siblings = family.filter((m) => m.relationship.kind === 'sibling');
      if (parents.length === 1) singleParent++;
      if (siblings.length > 0) withSiblings++;
      if (life.character.latent.identity || life.character.latent.personality) withLatent++;
      categories.set(life.character.identity.genderCategory, (categories.get(life.character.identity.genderCategory) ?? 0) + 1);

      if (parents.length < 1 || parents.length > 2) failures.push(`seed inv-${i}: ${parents.length} parents`);
      if (siblings.length > siblingWeights.length - 1) failures.push(`seed inv-${i}: ${siblings.length} siblings`);
      for (const p of parents) {
        if (p.age < parentAgeAtBirth.min || p.age > parentAgeAtBirth.max) failures.push(`seed inv-${i}: parent aged ${p.age}`);
      }
      // Siblings are older than the character and younger than every parent by a plausible gap.
      for (const s of siblings) {
        if (s.age < 1) failures.push(`seed inv-${i}: sibling aged ${s.age}`);
        for (const p of parents) {
          if (p.age - s.age < parentAgeAtBirth.min) failures.push(`seed inv-${i}: parent ${p.age}, sibling ${s.age}`);
        }
      }
      // Two parents are attracted to each other's gender category.
      if (parents.length === 2) {
        const [a, b] = parents as [(typeof parents)[0], (typeof parents)[0]];
        if (!a.person.identity.attractedTo.includes(b.person.identity.genderCategory)) failures.push(`seed inv-${i}: parents mismatch`);
        if (!b.person.identity.attractedTo.includes(a.person.identity.genderCategory)) failures.push(`seed inv-${i}: parents mismatch`);
      }
      const firstNames = [life.character.name.first, ...family.map((m) => m.person.name.first)];
      if (new Set(firstNames).size !== firstNames.length) failures.push(`seed inv-${i}: repeated first name in family`);

      // Names hang together: a parent with the family's last name has a first
      // name from a heritage that includes that last name; the character's
      // first name comes from one of the parents' heritages.
      const heritages = Object.values(pool.heritages);
      const lastName = life.character.name.last;
      const fits = parents.some(
        ({ person: p }) =>
          p.name.last === lastName &&
          heritages.some((h) => h.last.includes(lastName) && h.first[p.identity.genderCategory].includes(p.name.first)),
      );
      if (!fits) failures.push(`seed inv-${i}: family names don't share a heritage`);
      const parentHeritages = heritages.filter((h) =>
        parents.some((p) => h.first[p.person.identity.genderCategory].includes(p.person.name.first)),
      );
      if (!parentHeritages.some((h) => h.first[life.character.identity.genderCategory].includes(life.character.name.first))) {
        failures.push(`seed inv-${i}: character's first name fits neither parent's heritage`);
      }
    }

    expect(failures.slice(0, 20)).toEqual([]);
    // Sanity: the rolls actually vary.
    expect(singleParent).toBeGreaterThan(SEEDS * 0.1);
    expect(withSiblings).toBeGreaterThan(SEEDS * 0.4);
    expect(withLatent).toBeGreaterThan(SEEDS * 0.1);
    expect(categories.size).toBe(3);
  }, 120_000);
});

describe('invariant checks catch broken lives', () => {
  const broken: [string, (life: LifeState) => void, RegExp][] = [
    ['a stat out of range', (l) => (l.character.stats.health = 101), /stats\.health/],
    ['a fractional stat', (l) => (l.character.stats.looks = 50.5), /stats\.looks/],
    ['negative savings', (l) => (l.finances.savings = -1), /savings/],
    ['non-finite money', (l) => (l.finances.savings = Number.NaN), /savings/],
    ['a wrong age', (l) => (l.character.age = 3), /age/],
    ['a missing pronoun form', (l) => (l.character.identity.pronouns.reflexive = ''), /reflexive/],
    ['an unknown city', (l) => (l.character.cityId = 'atlantis'), /atlantis/],
    [
      'a parent too young',
      (l) => {
        const parent = getFamily(l).find((m) => m.relationship.kind === 'parent')!;
        parent.person.birthYear = l.birthYear - 5;
      },
      /was 5 when/,
    ],
    ['a relationship to nobody', (l) => (l.relationships.ghost = { ...Object.values(l.relationships)[0]!, personId: 'ghost' }), /missing person/],
    ['an empty input log', (l) => (l.inputLog = []), /input log/],
  ];

  it.each(broken)('flags %s', (_label, breakIt, pattern) => {
    const life = random('break-me');
    expect(checkInvariants(life, content)).toEqual([]);
    breakIt(life);
    expect(checkInvariants(life, content).join('\n')).toMatch(pattern);
  });
});
