import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { createPerson } from '../events/casting';
import { createChild } from '../family/children';
import { createLife } from '../life';
import { createRng } from '../rng';
import { customInput, lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { heritageFromParents, heritagesForFirstName, rollHeritage } from './family';

const tally = (n: number, roll: (rng: ReturnType<typeof createRng>) => string): Record<string, number> => {
  const rng = createRng('tally');
  const counts: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const h = roll(rng);
    counts[h] = (counts[h] ?? 0) + 1;
  }
  return counts;
};
const share = (counts: Record<string, number>, id: string, n: number) => (counts[id] ?? 0) / n;

describe('B1: name pools', () => {
  it('give every heritage at least 50 first names per gender category and 50 last names', () => {
    const { minFirstPerCategory, minLast } = content.balance.creation.namePool;
    expect(minFirstPerCategory).toBeGreaterThanOrEqual(50);
    expect(minLast).toBeGreaterThanOrEqual(50);
    for (const pool of Object.values(content.names)) {
      for (const [id, h] of Object.entries(pool.heritages)) {
        for (const category of ['man', 'woman', 'nonbinary'] as const) {
          expect(new Set(h.first[category].map((n) => n.toLowerCase())).size, `${pool.id}/${id}/${category}`).toBeGreaterThanOrEqual(50);
        }
        expect(new Set(h.last.map((n) => n.toLowerCase())).size, `${pool.id}/${id}/last`).toBeGreaterThanOrEqual(50);
      }
    }
  });
});

describe('B1: where people are from', () => {
  const n = 3000;
  it('rolls a heritage from the city’s own weights, falling back to the country’s', () => {
    const us = content.names.us!;
    const ca = content.names.ca!;
    const houston = tally(n, (rng) => rollHeritage(rng, content, us, undefined, 'houston'));
    const chicago = tally(n, (rng) => rollHeritage(rng, content, us, undefined, 'chicago'));
    const country = tally(n, (rng) => rollHeritage(rng, content, us));
    expect(content.cities.chicago!.heritageWeights).toBeUndefined();
    // Houston leans Hispanic; a city without weights is the country's mix (about 19% Hispanic).
    expect(share(houston, 'hispanic', n)).toBeGreaterThan(0.3);
    expect(share(chicago, 'hispanic', n)).toBeLessThan(0.26);
    expect(share(chicago, 'hispanic', n)).toBeCloseTo(share(country, 'hispanic', n), 1);
    const la = tally(n, (rng) => rollHeritage(rng, content, us, undefined, 'los_angeles'));
    expect(share(la, 'hispanic', n)).toBeGreaterThan(0.3);
    // Montreal leans French; Toronto does not.
    const montreal = tally(n, (rng) => rollHeritage(rng, content, ca, undefined, 'montreal'));
    const toronto = tally(n, (rng) => rollHeritage(rng, content, ca, undefined, 'toronto'));
    expect(share(montreal, 'french', n)).toBeGreaterThan(0.4);
    expect(share(toronto, 'french', n)).toBeLessThan(0.1);
  });

  it('has weights for Houston, Los Angeles and Montreal that only name heritages the country’s pool has', () => {
    for (const id of ['houston', 'los_angeles', 'montreal']) {
      const city = content.cities[id]!;
      expect(city.heritageWeights, id).toBeDefined();
      for (const h of Object.keys(city.heritageWeights!)) expect(content.names[city.countryId]!.heritages[h], `${id}/${h}`).toBeDefined();
    }
  });

  it('gives people you meet a heritage from their own city, with a first name from that heritage', () => {
    const life = produce(lifeAtAge('meet-houston', 30), (d) => {
      d.character.cityId = 'houston';
      d.housing.cityId = 'houston';
    });
    const heritages: Record<string, number> = {};
    produce(life, (d) => {
      const rng = createRng('meet');
      for (let i = 0; i < 400; i++) {
        const id = createPerson(d as LifeState, { kind: 'acquaintance', presence: 'city' }, rng, content);
        const person = d.people[id!]!;
        heritages[person.heritage!] = (heritages[person.heritage!] ?? 0) + 1;
        const h = content.names.us!.heritages[person.heritage!]!;
        expect(h.first[person.identity.genderCategory]).toContain(person.name.first);
        expect(h.last).toContain(person.name.last);
      }
    });
    expect((heritages.hispanic ?? 0) / 400).toBeGreaterThan(0.25);
  });
});

describe('B1: heritage is stored', () => {
  it('on you and everyone in your birth family, who share its names', () => {
    for (let i = 0; i < 25; i++) {
      const life = createLife({ mode: 'random', seed: `store-${i}`, birthYear: 2000, countryId: 'us' }, content);
      const pool = content.names.us!;
      expect(pool.heritages[life.character.heritage!]).toBeDefined();
      for (const p of Object.values(life.people)) {
        expect(pool.heritages[p.heritage!]).toBeDefined();
        expect(pool.heritages[p.heritage!]!.first[p.identity.genderCategory]).toContain(p.name.first);
      }
      // Your own first name comes from your own heritage.
      expect(pool.heritages[life.character.heritage!]!.first[life.character.identity.genderCategory]).toContain(life.character.name.first);
    }
  });

  it('with a custom last name found in a heritage, and a custom first name too', () => {
    const lastOnly = createLife({ mode: 'custom', seed: 'h-last', birthYear: 2000, custom: customInput({ name: { first: 'Robin', last: 'Nguyen' }, family: { parents: 1, siblings: 0 }, cityId: 'houston' }) }, content);
    expect(lastOnly.character.heritage).toBe('vietnamese');
    const firstOnly = createLife({ mode: 'custom', seed: 'h-first', birthYear: 2000, custom: customInput({ name: { first: 'Minh', last: 'Zyxwv' }, family: { parents: 1, siblings: 0 }, cityId: 'houston' }) }, content);
    expect(heritagesForFirstName(content.names.us!, 'Minh')).toContain('vietnamese');
    expect(firstOnly.character.heritage).toBe('vietnamese');
    // A custom first name in the pool (case-insensitive) picks it for the whole family when the last name is unknown.
    const both = createLife({ mode: 'custom', seed: 'h-both', birthYear: 2000, custom: customInput({ name: { first: 'minh', last: 'tran' }, family: { parents: 1, siblings: 0 }, cityId: 'houston' }) }, content);
    expect(both.character.heritage).toBe('vietnamese');
  });

  it('on your children: they take a parent’s heritage, mixed parents give either, and an adopted child’s is rolled for the city', () => {
    const life = produce(lifeAtAge('kids', 30), (d) => {
      d.character.heritage = 'chinese';
      d.people.p = { ...Object.values(d.people)[0]!, id: 'p', heritage: 'hispanic', identity: { ...d.character.identity }, cityId: d.character.cityId };
      d.relationships.p = { personId: 'p', kind: 'spouse', status: 'active', affection: 70, trust: 70, memories: [], since: d.currentYear - 5, kindSince: d.currentYear - 3 };
    });
    const kids = (parents: { you: boolean; other?: string }, origin: 'birth' | 'adopted', n: number) =>
      produce(life, (d) => {
        const rng = createRng(`kids-${origin}-${parents.other ?? 'none'}`);
        for (let i = 0; i < n; i++) createChild(d as LifeState, rng, { origin, age: 0, parents, ...(parents.other ? { otherParentId: parents.other } : {}), custody: 'you' }, content);
      });
    const heritagesOf = (state: LifeState) => Object.values(state.people).filter((p) => p.child).map((p) => p.heritage);
    const solo = heritagesOf(kids({ you: true }, 'birth', 30));
    expect(new Set(solo)).toEqual(new Set(['chinese']));
    const mixed = new Set(heritagesOf(kids({ you: true, other: 'p' }, 'birth', 60)));
    expect(mixed).toEqual(new Set(['chinese', 'hispanic']));
    const adopted = new Set(heritagesOf(kids({ you: false }, 'adopted', 60)));
    expect(adopted.size).toBeGreaterThan(1);
    for (const kid of Object.values(kids({ you: true }, 'birth', 5).people).filter((p) => p.child)) {
      expect(content.names.us!.heritages.chinese!.first[kid.identity.genderCategory]).toContain(kid.name.first);
    }
  });

  it('ignores a parent’s heritage the pool doesn’t have and rolls for the city instead', () => {
    const us = content.names.us!;
    const rng = createRng('foreign');
    expect(heritageFromParents(rng, content, us, ['afro_mexican'], 'houston')).toSatisfy((h: string) => us.heritages[h] !== undefined);
    expect(heritageFromParents(rng, content, us, [undefined, 'korean'], 'houston')).toBe('korean');
  });
});
