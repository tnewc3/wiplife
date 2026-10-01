import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { InvalidInputError } from './creation/input';
import { checkInvariants } from './invariants';
import { createLife } from './life';
import { getFamily } from './selectors';
import { customInput } from './testFixtures';
import type { LifeState } from './types';

const BIRTH_YEAR = 2026;


function random(seed: string): LifeState {
  return createLife({ mode: 'random', seed, birthYear: BIRTH_YEAR }, content);
}

describe('createLife (random)', () => {
  it('is deterministic for a seed', () => {
    expect(random('seed-a')).toEqual(random('seed-a'));
  });

  it('gives different seeds different lives', () => {
    const a = random('seed-a');
    const b = random('seed-b');
    expect(a.character).not.toEqual(b.character);
  });

  it('starts at age 0 with every section present and empty', () => {
    const life = random('fresh');
    expect(life.character.age).toBe(0);
    expect(life.character.lifeStage).toBe('early');
    expect(life.currentYear).toBe(BIRTH_YEAR);
    expect(life.birthYear).toBe(BIRTH_YEAR);
    expect(life.phase).toBe('yearStart');
    expect(life.character.custom).toBe(false);
    expect(life.education).toEqual({ current: null, credentials: [], admission: null, left: null, applied: [], fund: 0 });
    expect(life.career).toEqual({ job: null, gig: false, retired: false, history: [] });
    expect(life.finances).toEqual({ savings: 0, debts: [], lifestyle: 'comfortable', earnings: { years: 0, total: 0 }, hardshipYears: 0 });
    expect(life.housing).toEqual({ kind: 'with_parents', cityId: life.character.cityId, annualCost: 0, since: life.birthYear });
    expect(life.character.birthCityId).toBe(life.character.cityId);
    expect(life.health).toEqual({ conditions: [] });
    expect(life.legal).toEqual({ record: [] });
    expect([life.flags, life.eventLog]).toEqual([{}, {}]);
    expect([life.scheduled, life.pending, life.history]).toEqual([[], [], []]);
    expect(life.lineage).toEqual({ generation: 1 });
    expect([life.recap, life.death]).toEqual([null, null]);
    expect(checkInvariants(life, content)).toEqual([]);
  });

  it('records the create input and replays from it', () => {
    const life = random('replay');
    expect(life.inputLog).toHaveLength(1);
    expect(life.inputLog[0]).toMatchObject({ year: BIRTH_YEAR, kind: 'create' });
    const replayed = createLife(life.inputLog[0]!.payload as never, content);
    expect(replayed).toEqual(life);
  });

  it('survives a JSON round trip unchanged', () => {
    const life = random('json');
    expect(JSON.parse(JSON.stringify(life))).toEqual(life);
  });

  it('matches the golden life for a fixed seed', () => {
    // If this changes on purpose (content or rules changed), update the
    // snapshot and say why in the commit message.
    const life = random('golden-1');
    const summary = {
      name: life.character.name,
      city: life.character.cityId,
      identity: life.character.identity.genderIdentity,
      stats: life.character.stats,
      family: getFamily(life).map((m) => `${m.relationship.kind} ${m.person.name.first} ${m.age}`),
    };
    expect(summary).toMatchInlineSnapshot(`
      {
        "city": "chicago",
        "family": [
          "parent Samantha 24",
          "parent Ethan 24",
          "sibling Owen 8",
          "sibling Jessica 4",
        ],
        "identity": "man",
        "name": {
          "first": "Thomas",
          "last": "Sullivan",
        },
        "stats": {
          "fitness": 66,
          "happiness": 84,
          "health": 69,
          "looks": 55,
          "smarts": 52,
          "stress": 5,
        },
      }
    `);
  });
});

describe('createLife (custom)', () => {
  it('uses exactly what the player chose', () => {
    const input = customInput();
    const life = createLife({ mode: 'custom', seed: 'c1', birthYear: BIRTH_YEAR, custom: input }, content);
    const c = life.character;
    expect(c.custom).toBe(true);
    expect(c.name).toEqual(input.name);
    expect(c.identity).toEqual(input.identity);
    expect(c.stats).toEqual(input.stats);
    expect(c.personality).toEqual(input.personality);
    expect(c.cityId).toBe('chicago');
    expect(c.familyWealth).toBe('working');
    const eyes = content.character.appearance.groups.find((g) => g.id === 'eyes')!.options;
    // Hair was chosen; eyes were left to chance, so they are rolled.
    expect(c.appearance.descriptors).toHaveLength(3);
    expect(c.appearance.descriptors[0]).toBe('red hair');
    expect(eyes).toContain(c.appearance.descriptors[1]);
    expect(c.appearance.descriptors[2]).toBe('freckles');
    const family = getFamily(life);
    expect(family.filter((m) => m.relationship.kind === 'parent')).toHaveLength(2);
    expect(family.filter((m) => m.relationship.kind === 'sibling')).toHaveLength(2);
    for (const member of family) expect(member.person.name.last === 'Okafor' || member.relationship.kind === 'parent').toBe(true);
    expect(checkInvariants(life, content)).toEqual([]);
  });

  it('rolls every appearance group left to chance', () => {
    const { groups } = content.character.appearance;
    const life = createLife(
      { mode: 'custom', seed: 'looks', birthYear: BIRTH_YEAR, custom: customInput({ appearance: { descriptors: [] } }) },
      content,
    );
    expect(life.character.appearance.descriptors).toHaveLength(groups.length);
    groups.forEach((g, i) => expect(g.options).toContain(life.character.appearance.descriptors[i]));
  });

  it('allows any stat from 0 to 100, including extremes', () => {
    const zeros = { health: 0, happiness: 0, smarts: 0, looks: 0, fitness: 0, stress: 0 };
    const hundreds = { health: 100, happiness: 100, smarts: 100, looks: 100, fitness: 100, stress: 100 };
    for (const stats of [zeros, hundreds]) {
      const life = createLife({ mode: 'custom', seed: 's', birthYear: BIRTH_YEAR, custom: customInput({ stats }) }, content);
      expect(life.character.stats).toEqual(stats);
    }
  });

  it('supports one parent and no siblings', () => {
    const life = createLife(
      { mode: 'custom', seed: 'solo', birthYear: BIRTH_YEAR, custom: customInput({ family: { parents: 1, siblings: 0 } }) },
      content,
    );
    const family = getFamily(life);
    expect(family).toHaveLength(1);
    expect(family[0]!.relationship.kind).toBe('parent');
  });

  it('gives relatives names from the heritage of a known custom last name', () => {
    const pool = content.names.us!;
    const vietnamese = pool.heritages.vietnamese!;
    for (let i = 0; i < 50; i++) {
      const life = createLife(
        {
          mode: 'custom',
          seed: `heritage-${i}`,
          birthYear: BIRTH_YEAR,
          custom: customInput({ name: { first: 'Robin', last: 'nguyen' }, family: { parents: 1, siblings: 0 } }),
        },
        content,
      );
      const parent = getFamily(life)[0]!.person;
      expect(vietnamese.first[parent.identity.genderCategory]).toContain(parent.name.first);
      expect(life.character.name.last).toBe('nguyen');
    }
  });

  it('still works with a last name no heritage has', () => {
    const life = createLife(
      { mode: 'custom', seed: 'unknown-last', birthYear: BIRTH_YEAR, custom: customInput({ name: { first: 'Robin', last: 'Zyxwv' } }) },
      content,
    );
    expect(checkInvariants(life, content)).toEqual([]);
    expect(getFamily(life).every((m) => m.relationship.kind !== 'parent' || m.person.name.last.length > 0)).toBe(true);
  });

  it('normalizes text input', () => {
    const life = createLife(
      {
        mode: 'custom',
        seed: 'n',
        birthYear: BIRTH_YEAR,
        custom: customInput({ name: { first: '  Zoë  ', last: 'Nguyễn   Van' } }),
      },
      content,
    );
    expect(life.character.name).toEqual({ first: 'Zoë', last: 'Nguyễn Van' });
  });

  it('rolls latent traits for custom characters too', () => {
    let withLatent = 0;
    const runs = 2000;
    for (let i = 0; i < runs; i++) {
      const life = createLife({ mode: 'custom', seed: `latent-${i}`, birthYear: BIRTH_YEAR, custom: customInput() }, content);
      if (life.character.latent.identity || life.character.latent.personality) withLatent++;
    }
    const { latent } = content.balance.creation;
    const expected =
      1 -
      (1 - latent.orientationChance) * (1 - latent.genderChance) * (1 - latent.expressionChance) * (1 - latent.personalityChance);
    expect(withLatent / runs).toBeGreaterThan(expected * 0.8);
    expect(withLatent / runs).toBeLessThan(expected * 1.2);
  });

  it('never makes a latent trait equal to the visible one', () => {
    for (let i = 0; i < 3000; i++) {
      const life = random(`latent-diff-${i}`);
      const { identity, personality } = life.character.latent;
      const current = life.character;
      if (identity?.genderCategory) expect(identity.genderCategory).not.toBe(current.identity.genderCategory);
      if (identity?.genderExpression) expect(identity.genderExpression).not.toBe(current.identity.genderExpression);
      if (identity?.attractedTo) expect([...identity.attractedTo].sort()).not.toEqual([...current.identity.attractedTo].sort());
      for (const [trait, value] of Object.entries(personality ?? {})) {
        expect(value).not.toBe(current.personality[trait as keyof typeof current.personality]);
      }
    }
  });
});

describe('input validation', () => {
  const tryCustom = (custom: unknown) => () =>
    createLife({ mode: 'custom', seed: 'v', birthYear: BIRTH_YEAR, custom } as never, content);

  it.each([
    ['empty first name', customInput({ name: { first: '   ', last: 'Lee' } }), 'name.first'],
    ['overlong last name', customInput({ name: { first: 'Al', last: 'x'.repeat(31) } }), 'name.last'],
    ['name with digits only', customInput({ name: { first: '123', last: 'Lee' } }), 'name.first'],
    ['name with emoji', customInput({ name: { first: 'Sam😀', last: 'Lee' } }), 'name.first'],
    ['stat above 100', customInput({ stats: { ...customInput().stats, looks: 101 } }), 'stats.looks'],
    ['fractional stat', customInput({ stats: { ...customInput().stats, looks: 50.5 } }), 'stats.looks'],
    ['unknown city', customInput({ cityId: 'atlantis' }), 'cityId'],
    ['too many siblings', customInput({ family: { parents: 2, siblings: 9 } }), 'family.siblings'],
    ['three parents', customInput({ family: { parents: 3 as never, siblings: 0 } }), 'family.parents'],
    ['repeated attraction', customInput({ identity: { ...customInput().identity, attractedTo: ['man', 'man'] } }), 'attractedTo'],
  ])('rejects %s', (_label, custom, path) => {
    const run = tryCustom(custom);
    expect(run).toThrow(InvalidInputError);
    try {
      run();
    } catch (err) {
      expect((err as InvalidInputError).issues.map((i) => i.path).join(' ')).toContain(path);
    }
  });

  it.each(['subject', 'object', 'possessive', 'possessivePronoun', 'reflexive'] as const)(
    'requires the %s pronoun form',
    (form) => {
      const input = customInput();
      const custom = { ...input, identity: { ...input.identity, pronouns: { ...input.identity.pronouns, [form]: ' ' } } };
      expect(tryCustom(custom)).toThrow(InvalidInputError);
    },
  );

  it('accepts long and Unicode names', () => {
    for (const [first, last] of [
      ['Maximilian-Alexander', 'Wolfeschlegelsteinhausen'],
      ['李', '王'],
      ['محمد', 'الحسيني'],
      ['Łukasz', 'Brzęczyszczykiewicz'],
      ["D'Andre", "O'Neill-Smith Jr."],
    ] as const) {
      expect(tryCustom(customInput({ name: { first, last } }))).not.toThrow();
    }
  });

  it('rejects an unknown mode or missing seed', () => {
    expect(() => createLife({ mode: 'other', seed: 'x', birthYear: 2026 } as never, content)).toThrow(InvalidInputError);
    expect(() => createLife({ mode: 'random', seed: '', birthYear: 2026 }, content)).toThrow(InvalidInputError);
  });
});
