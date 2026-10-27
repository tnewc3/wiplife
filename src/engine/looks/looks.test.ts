import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { NATURAL_HAIR_COLORS, SKIN_TONES } from '../../portraits/options';
import { normalizeAppearance } from '../../portraits/selection';
import type { Catalog } from '../../portraits/types';
import { createChild } from '../family/children';
import { createLife } from '../life';
import { createRng } from '../rng';
import { lifeAtAge } from '../testFixtures';
import type { LifeState, Look } from '../types';
import { performAction } from '../actions';
import { getPortrait } from '../selectors';
import manifest from '../../../public/portraits/manifest.json' with { type: 'json' };
import palettes from '../../../public/portraits/palettes.json' with { type: 'json' };
import { descriptorsMatching, lookFromDescriptors } from './descriptors';
import { bodyFor, completeLook, rollLook } from './generate';
import { personLook, yourLook } from './query';
import { portraitSettings, shownHair, stageOf, templateOf } from './render';
import { lookSchema } from './schema';
import { runLooks } from './step';

const catalog = { manifest, palettes } as unknown as Catalog;

const base: Look = rollLook(createRng('looks-base'), content, 'female');

describe('portrait age stages', () => {
  it('map ages to the stages in balance/portraits.yaml', () => {
    const at = (age: number) => stageOf(age, content);
    expect([0, 2].map(at)).toEqual(['baby', 'baby']);
    expect([3, 12].map(at)).toEqual(['young_child', 'young_child']);
    expect([13, 17].map(at)).toEqual(['teenager', 'teenager']);
    expect([18, 29].map(at)).toEqual(['young_adult', 'young_adult']);
    expect([30, 44].map(at)).toEqual(['adult', 'adult']);
    expect([45, 59].map(at)).toEqual(['middle_aged', 'middle_aged']);
    expect([60, 74].map(at)).toEqual(['senior', 'senior']);
    expect([75, 110].map(at)).toEqual(['very_old', 'very_old']);
  });

  it('derive the template from body type and stage, and it changes as a person ages', () => {
    expect(templateOf('male', 'adult')).toBe('male_adult');
    const ctx = { year: 2000, mood: 50 };
    expect(portraitSettings(base, { ...ctx, age: 10 }, content).templateId).toBe('female_young_child');
    expect(portraitSettings(base, { ...ctx, age: 40 }, content).templateId).toBe('female_adult');
    expect(portraitSettings(base, { ...ctx, age: 80 }, content).templateId).toBe('female_very_old');
  });
});

describe('graying, dye and expression', () => {
  const look: Look = { ...base, hair: 'dark_brown', grayingAge: 50 };
  it('shows natural hair until the graying age and silver from then on', () => {
    expect(shownHair(look, 49, 2050, content)).toBe('dark_brown');
    expect(shownHair(look, 50, 2051, content)).toBe('silver');
  });
  it('lets dye override both, until it fades after dyeFadeYears', () => {
    const fade = content.balance.portraits.dyeFadeYears;
    const dyed: Look = { ...look, dye: { color: 'copper', year: 2040 } };
    expect(shownHair(dyed, 30, 2040, content)).toBe('copper');
    expect(shownHair(dyed, 60, 2040 + fade - 1, content)).toBe('copper');
    expect(shownHair(dyed, 60, 2040 + fade, content)).toBe('silver');
    expect(shownHair(dyed, 30, 2040 + fade, content)).toBe('dark_brown');
  });
  it('smiles at the happiness threshold and is neutral below it, and can be surprised', () => {
    const smileAt = content.balance.portraits.smileAt;
    expect(portraitSettings(base, { age: 30, year: 2000, mood: smileAt }, content).expression).toBe('smile');
    expect(portraitSettings(base, { age: 30, year: 2000, mood: smileAt - 1 }, content).expression).toBe('neutral');
    expect(portraitSettings(base, { age: 30, year: 2000, mood: 90, surprised: true }, content).expression).toBe('surprised');
  });
});

describe('rolling looks', () => {
  it('is deterministic and always a valid look', () => {
    for (let i = 0; i < 200; i++) {
      const body = i % 2 === 0 ? 'male' : 'female';
      const a = rollLook(createRng(`valid-${i}`), content, body);
      expect(a).toEqual(rollLook(createRng(`valid-${i}`), content, body));
      expect(lookSchema.safeParse(a).success).toBe(true);
      const { graying } = content.balance.portraits;
      expect(a.grayingAge).toBeGreaterThanOrEqual(graying.min);
      expect(a.grayingAge).toBeLessThanOrEqual(graying.max);
    }
  });

  it('never makes a portrait the renderer has to reject: every look at every age stage normalizes', () => {
    for (let i = 0; i < 150; i++) {
      const look = rollLook(createRng(`render-${i}`), content, i % 2 === 0 ? 'male' : 'female');
      for (const age of [0, 5, 15, 25, 40, 50, 65, 80]) {
        const settings = portraitSettings(look, { age, year: 2000, mood: 50 }, content);
        const { appearance } = normalizeAppearance(catalog, settings);
        expect(appearance.templateId).toBe(settings.templateId);
      }
    }
  });

  it('gives babies and children only what their age offers (facial hair and the like fall back)', () => {
    const bearded: Look = { ...base, body: 'male', facialHair: 'short_beard', earrings: 'hoops' };
    const child = normalizeAppearance(catalog, portraitSettings(bearded, { age: 8, year: 2000, mood: 50 }, content)).appearance;
    expect(child.facialHair).toBe('none');
    const adult = normalizeAppearance(catalog, portraitSettings(bearded, { age: 30, year: 2000, mood: 50 }, content)).appearance;
    expect(adult.facialHair).toBe('short_beard');
  });

  it('gives a nonbinary character a body type from a roll, and men and women theirs', () => {
    const rng = createRng('body');
    expect(bodyFor(rng, 'man', content)).toBe('male');
    expect(bodyFor(rng, 'woman', content)).toBe('female');
    const seen = new Set(Array.from({ length: 60 }, (_, i) => bodyFor(createRng(`nb-${i}`), 'nonbinary', content)));
    expect(seen).toEqual(new Set(['male', 'female']));
  });
});

describe('children inherit from their biological parents', () => {
  const dark: Look = { ...base, skin: 'deep_brown', hair: 'black', eyes: 'brown' };
  const light: Look = { ...base, skin: 'porcelain', hair: 'blond', eyes: 'blue' };

  it('takes skin near the mean of the parents and hair and eyes from one of them, with some change', () => {
    const n = 600;
    let hairFromParent = 0;
    let eyesFromParent = 0;
    const tones: number[] = [];
    for (let i = 0; i < n; i++) {
      const child = rollLook(createRng(`child-${i}`), content, 'female', [dark, light]);
      tones.push(SKIN_TONES.indexOf(child.skin));
      if (child.hair === 'black' || child.hair === 'blond') hairFromParent++;
      if (child.eyes === 'brown' || child.eyes === 'blue') eyesFromParent++;
    }
    const mean = tones.reduce((a, b) => a + b, 0) / n;
    const expected = (SKIN_TONES.indexOf('deep_brown') + SKIN_TONES.indexOf('porcelain')) / 2;
    expect(Math.abs(mean - expected)).toBeLessThan(0.3);
    // Most hair and eye colors are a parent's; the rest changed (hairChange 12%, eyesChange 10%).
    expect(hairFromParent / n).toBeGreaterThan(0.8);
    expect(eyesFromParent / n).toBeGreaterThan(0.85);
    expect(hairFromParent).toBeLessThan(n);
  });

  it('keeps a child of two identical parents close to them', () => {
    for (let i = 0; i < 100; i++) {
      const child = rollLook(createRng(`same-${i}`), content, 'male', [dark, dark]);
      expect(Math.abs(SKIN_TONES.indexOf(child.skin) - SKIN_TONES.indexOf('deep_brown'))).toBeLessThanOrEqual(3);
      expect(Math.abs(NATURAL_HAIR_COLORS.indexOf(child.hair) - NATURAL_HAIR_COLORS.indexOf('black'))).toBeLessThanOrEqual(1);
    }
  });

  it('gives the player’s own child a look from you and the other parent, and an adopted child one of their own', () => {
    const life = produce(lifeAtAge('kids', 30), (d) => {
      d.character.look = dark;
      const partner = Object.values(d.people).find((p) => d.relationships[p.id]?.kind === 'parent')!;
      partner.look = dark;
      const rng = createRng('make-kids');
      const born: string[] = [];
      for (let i = 0; i < 80; i++) born.push(createChild(d, rng, { origin: 'birth', age: 0, parents: { you: true, other: partner.id }, otherParentId: partner.id, custody: 'you' }, content));
      const adopted: string[] = [];
      for (let i = 0; i < 80; i++) adopted.push(createChild(d, rng, { origin: 'adopted', age: 3, parents: { you: false }, custody: 'you' }, content));
      d.flags.test_born = true;
      (d as unknown as { _born: string[]; _adopted: string[] })._born = born;
      (d as unknown as { _born: string[]; _adopted: string[] })._adopted = adopted;
    }) as LifeState & { _born: string[]; _adopted: string[] };
    const tone = (id: string) => SKIN_TONES.indexOf(life.people[id]!.look!.skin);
    const bornMean = life._born.reduce((s, id) => s + tone(id), 0) / life._born.length;
    const adoptedMean = life._adopted.reduce((s, id) => s + tone(id), 0) / life._adopted.length;
    expect(bornMean).toBeGreaterThan(5.4);
    expect(adoptedMean).toBeLessThan(5.0);
  });
});

describe('a new life', () => {
  it('gives you, your parents and your siblings a look, the same every time for the same seed', () => {
    const a = createLife({ mode: 'random', seed: 'look-life', birthYear: 2000, countryId: 'us' }, content);
    const b = createLife({ mode: 'random', seed: 'look-life', birthYear: 2000, countryId: 'us' }, content);
    expect(a.character.look).toBeDefined();
    expect(a.character.look).toEqual(b.character.look);
    for (const p of Object.values(a.people)) {
      expect(p.look, p.name.first).toBeDefined();
      expect(lookSchema.safeParse(p.look).success).toBe(true);
    }
    expect(Object.values(a.people).map((p) => p.look)).toEqual(Object.values(b.people).map((p) => p.look));
  });

  it('makes your hair and eyes the colors your descriptors name, and your family look like you', () => {
    let alike = 0;
    let total = 0;
    for (let i = 0; i < 60; i++) {
      const life = createLife({ mode: 'random', seed: `fam-${i}`, birthYear: 2000, countryId: 'us' }, content);
      const named = lookFromDescriptors(life.character.appearance.descriptors, content);
      expect(life.character.look!.hair).toBe(named.hair);
      expect(life.character.look!.eyes).toBe(named.eyes);
      for (const p of Object.values(life.people)) {
        if (life.relationships[p.id]?.kind !== 'parent') continue;
        total++;
        if (Math.abs(SKIN_TONES.indexOf(p.look!.skin) - SKIN_TONES.indexOf(life.character.look!.skin)) <= 2) alike++;
      }
    }
    expect(alike / total).toBeGreaterThan(0.9);
  });

  it('lets a custom character choose a look, fills the rest, and writes their hair and eye text to match', () => {
    const life = createLife(
      {
        mode: 'custom',
        seed: 'custom-look',
        birthYear: 2000,
        custom: {
          name: { first: 'Rowan', last: 'Vale' },
          identity: { genderIdentity: 'woman', genderCategory: 'woman', genderExpression: 'feminine', pronouns: { subject: 'she', object: 'her', possessive: 'her', possessivePronoun: 'hers', reflexive: 'herself', verbPlural: false }, attractedTo: ['man'] },
          appearance: { descriptors: [] },
          look: { skin: 'olive', hair: 'copper', eyes: 'green', hairstyle: 'twin_braids' },
          cityId: Object.keys(content.cities).find((c) => content.cities[c]!.countryId === 'us')!,
          familyWealth: 'middle',
          family: { parents: 2, siblings: 1 },
          stats: { health: 50, happiness: 50, smarts: 50, looks: 50, fitness: 50, stress: 50 },
          personality: { ambition: 50, confidence: 50, kindness: 50, riskTaking: 50, discipline: 50, sociability: 50 },
        },
      },
      content,
    );
    expect(life.character.look).toMatchObject({ body: 'female', skin: 'olive', hair: 'copper', eyes: 'green', hairstyle: 'twin_braids' });
    expect(lookSchema.safeParse(life.character.look).success).toBe(true);
    expect(life.character.appearance.descriptors).toContain('red hair');
    expect(life.character.appearance.descriptors).toContain('green eyes');
  });

  it('does not touch the life’s own random stream (a life plays out as it did before portraits)', () => {
    const life = createLife({ mode: 'random', seed: 'stream', birthYear: 2000, countryId: 'us' }, content);
    const stripped = produce(life, (d) => {
      delete d.character.look;
      for (const p of Object.values(d.people)) delete p.look;
    });
    // Rolling every look from the seed must give the same looks, and must not have moved the stream: rolling again changes nothing.
    const again = produce(stripped, (d) => runLooks(d, content));
    expect(again.character.look).toEqual(life.character.look);
    expect(again.rng).toEqual(life.rng);
  });
});

describe('looks over a life', () => {
  it('are set down by the looks step for anyone who has none, as the same look the screens already showed', () => {
    const life = produce(lifeAtAge('step-looks', 20), (d) => {
      for (const p of Object.values(d.people)) delete p.look;
      delete d.character.look;
    });
    const shown = personLook(life, Object.keys(life.people)[0]!, content);
    const done = produce(life, (d) => runLooks(d, content));
    expect(done.people[Object.keys(life.people)[0]!]!.look).toEqual(shown);
    expect(done.character.look).toEqual(yourLook(life, content));
    for (const p of Object.values(done.people)) expect(p.look).toBeDefined();
  });

  it('draws you at your age and happiness, and a person at their age (at death if they died)', () => {
    const life = produce(lifeAtAge('portrait-age', 40), (d) => {
      d.character.stats.happiness = 90;
      const person = Object.values(d.people)[0]!;
      person.alive = false;
      person.deathYear = person.birthYear + 70;
    });
    const you = getPortrait(life, 'you', content);
    expect(you.templateId).toMatch(/_adult$/);
    expect(you.expression).toBe('smile');
    const id = Object.keys(life.people)[0]!;
    expect(getPortrait(life, id, content).templateId).toMatch(/_senior$/);
    expect(() => getPortrait(life, 'nobody', content)).toThrow();
  });

  it('can have the body type changed any time, and nothing else about the life changes', () => {
    const life = lifeAtAge('body-change', 30);
    const other = yourLook(life, content).body === 'male' ? 'female' : 'male';
    const next = performAction(life, 'set_body', { body: other }, content);
    expect(next.character.look!.body).toBe(other);
    expect(getPortrait(next, 'you', content).templateId).toContain(other);
    expect(next.character.stats).toEqual(life.character.stats);
    expect(() => performAction(next, 'set_body', { body: other }, content)).toThrow();
    expect(() => performAction(life, 'set_body', { body: 'robot' }, content)).toThrow();
  });
});

describe('descriptor text and portrait colors', () => {
  it('map to each other and back', () => {
    expect(lookFromDescriptors(['blue eyes', 'red hair'], content)).toEqual({ eyes: 'blue', hair: 'copper' });
    expect(lookFromDescriptors(['dimples'], content)).toEqual({});
    expect(descriptorsMatching(['black hair', 'brown eyes', 'dimples'], { hair: 'blond', eyes: 'green' }, content)).toEqual(['blond hair', 'green eyes', 'dimples']);
  });
  it('write a color the list does not have', () => {
    expect(descriptorsMatching(['dimples'], { hair: 'black', eyes: 'gray' }, content)).toEqual(['dimples', 'black hair', 'gray eyes']);
  });
});

describe('completeLook', () => {
  it('keeps what was chosen and rolls the rest', () => {
    const look = completeLook(createRng('cl'), content, 'male', { skin: 'fair', hairstyle: 'mohawk' });
    expect(look.skin).toBe('fair');
    expect(look.hairstyle).toBe('mohawk');
    expect(look.body).toBe('male');
    expect(lookSchema.safeParse(look).success).toBe(true);
  });
});
