import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import type { ContentBundle, OutcomeTier } from '../../content/schemas';
import { InvalidInputError } from '../creation/input';
import { createPerson } from '../events/casting';
import { applyEffects } from '../events/effects';
import { checkInvariants } from '../invariants';
import { resolveAll } from '../autoplay';
import { beginYear, endYear, PhaseError, resolveChoice } from '../life';
import { replayLife } from '../replay';
import { createRng, nextInt } from '../rng';
import { cloneJson, lifeAtAge } from '../testFixtures';
import type { GenderCategory, LifeState, Person, Relationship, RelationshipKind } from '../types';
import { availableInteractions, defaultExtras, isInteractionAvailable } from './availability';
import { betray, canAffordGift, giftPrice, giveMoney, rollAskedAmount } from './links';
import { isClose, moodBand, moodBaseline, moodView, runMoods, shiftMood } from './mood';
import { closeInteraction, performInteraction, resolveInteractionChoice } from './perform';
import { reactionScore, repeatsThisYear, returnsFactor, rollTier, tierForScore } from './reaction';
import { blendWealth, rollWealth, wealthFromSalary } from './wealth';

const ADULT = content.balance.relationships.adultAge;
const balance = content.balance.interactions;

interface Spec {
  id: string;
  age: number;
  kind: RelationshipKind;
  category?: GenderCategory;
  affection?: number;
  trust?: number;
  mood?: number;
  cityId?: string;
  status?: Relationship['status'];
  alive?: boolean;
  memories?: Relationship['memories'];
}

/** Adds someone to a draft life: an adult attracted to everyone unless told otherwise. */
function addPerson(d: LifeState, spec: Spec): void {
  const template = Object.values(d.people)[0]!;
  const category = spec.category ?? 'woman';
  d.people[spec.id] = {
    ...cloneJson(template),
    id: spec.id,
    name: { first: `N${spec.id}`, last: 'Test' },
    birthYear: d.currentYear - spec.age,
    alive: spec.alive ?? true,
    identity: {
      genderIdentity: category,
      genderCategory: category,
      genderExpression: 'neutral',
      pronouns: { subject: 'they', object: 'them', possessive: 'their', possessivePronoun: 'theirs', reflexive: 'themself', verbPlural: true },
      attractedTo: ['man', 'woman', 'nonbinary'],
    },
    traits: {},
    cityId: spec.cityId ?? d.character.cityId,
    tags: [spec.kind],
    mood: spec.mood ?? 60,
    moodBase: 60,
    wealthLevel: 'middle',
  };
  if (spec.kind === 'child' || spec.kind === 'stepchild') {
    const person = d.people[spec.id]!;
    person.traits = { ambition: 50, confidence: 50, kindness: 50, riskTaking: 50, discipline: 50, sociability: 50 };
    person.child = { origin: spec.kind === 'child' ? 'birth' : 'step', custody: 'you', custodyDecided: true, health: 80, happiness: 70, fitness: 50, stress: 10, geneticRisk: 30, talent: null, gpa: 0, latent: {} };
  }
  if (spec.alive === false) d.people[spec.id]!.deathYear = d.currentYear;
  d.relationships[spec.id] = {
    personId: spec.id,
    kind: spec.kind,
    status: spec.status ?? 'active',
    affection: spec.affection ?? 60,
    trust: spec.trust ?? 60,
    memories: spec.memories ?? [],
    since: d.currentYear - 3,
    ...(['partner', 'fiance', 'spouse', 'ex'].includes(spec.kind) ? { kindSince: d.currentYear - 1 } : {}),
  };
}

/** A life at `age` with these people, attracted to everyone, and savings. */
function lifeWith(age: number, specs: Spec[], savings = 5000, seed = 'interactions'): LifeState {
  return produce(lifeAtAge(seed, age), (d) => {
    d.character.identity.attractedTo = ['man', 'woman', 'nonbinary'];
    for (const spec of specs) addPerson(d, spec);
    d.finances.savings = savings;
  });
}

/** A content bundle whose roll always lands on this tier (no noise, thresholds around any score). */
function forced(tier: OutcomeTier, overrides: Partial<ContentBundle['balance']['interactions']['chances']> = {}): ContentBundle {
  const t = { backfire: -4000, bad: -3000, good: -2000, great: -1000 };
  if (tier === 'good') Object.assign(t, { great: 2000 });
  if (tier === 'neutral') Object.assign(t, { good: 2000, great: 3000 });
  if (tier === 'bad') Object.assign(t, { bad: 2000, good: 3000, great: 4000 });
  if (tier === 'backfire') Object.assign(t, { backfire: 2000, bad: 3000, good: 4000, great: 5000 });
  return {
    ...content,
    balance: {
      ...content.balance,
      interactions: {
        ...balance,
        reaction: { ...balance.reaction, noiseSd: 0, thresholds: t },
        chances: { ...balance.chances, ...overrides },
      },
    },
  };
}

const friend = (extra: Partial<Spec> = {}): Spec => ({ id: 'f1', age: 30, kind: 'friend', ...extra });

describe('the reaction roll', () => {
  it('maps a score to tiers by the balance thresholds', () => {
    const t = balance.reaction.thresholds;
    expect(tierForScore(t.backfire - 1, content)).toBe('backfire');
    expect(tierForScore(t.bad - 1, content)).toBe('bad');
    expect(tierForScore(t.good - 1, content)).toBe('neutral');
    expect(tierForScore(t.good, content)).toBe('good');
    expect(tierForScore(t.great, content)).toBe('great');
  });

  it('scores higher for affection, trust, mood, their kindness and your confidence', () => {
    const life = lifeWith(30, [friend()]);
    const def = content.interactions.compliment!;
    const rel = life.relationships.f1!;
    const person = life.people.f1!;
    const base = reactionScore(life, def, rel, person, { same: 0, total: 0 }, undefined, content);
    const score = (r: Partial<Relationship>, p: Partial<Person> = {}) =>
      reactionScore(life, def, { ...rel, ...r }, { ...person, ...p }, { same: 0, total: 0 }, undefined, content);
    expect(score({ affection: 90 })).toBeGreaterThan(base);
    expect(score({ trust: 95 })).toBeGreaterThan(base);
    expect(score({}, { mood: 95 })).toBeGreaterThan(base);
    expect(score({}, { mood: 5 })).toBeLessThan(base);
    expect(score({}, { traits: { kindness: 95 } })).toBeGreaterThan(base);
    const confident = produce(life, (d) => {
      d.character.personality.confidence = 100;
      d.character.stats.looks = 95;
    });
    expect(reactionScore(confident, def, rel, person, { same: 0, total: 0 }, undefined, content)).toBeGreaterThan(base);
  });

  it('counts memories from the profile, recent ones only', () => {
    const life = lifeWith(30, [friend()]);
    const def = content.interactions.compliment!;
    const person = life.people.f1!;
    const rel = life.relationships.f1!;
    const base = reactionScore(life, def, rel, person, { same: 0, total: 0 }, undefined, content);
    const recent = { ...rel, memories: [{ tag: 'humiliated_them', year: life.currentYear - 1 }] };
    const old = { ...rel, memories: [{ tag: 'humiliated_them', year: life.currentYear - 20 }] };
    expect(reactionScore(life, def, recent, person, { same: 0, total: 0 }, undefined, content)).toBeLessThan(base);
    expect(reactionScore(life, def, old, person, { same: 0, total: 0 }, undefined, content)).toBe(base);
  });

  it('scores lower with every repeat this year, and gifts add by tier and by how much the person has', () => {
    const life = lifeWith(30, [friend()]);
    const def = content.interactions.compliment!;
    const rel = life.relationships.f1!;
    const person = life.people.f1!;
    const score = (same: number, total = same) => reactionScore(life, def, rel, person, { same, total }, undefined, content);
    expect(score(1)).toBeLessThan(score(0));
    expect(score(4)).toBeLessThan(score(1));
    const gift = content.interactions.give_gift!;
    const gs = (tier: 'small' | 'big', wealth: Person['wealthLevel']) =>
      reactionScore(life, gift, rel, { ...person, wealthLevel: wealth }, { same: 0, total: 0 }, tier, content);
    expect(gs('big', 'middle')).toBeGreaterThan(gs('small', 'middle'));
    expect(gs('small', 'poor')).toBeGreaterThan(gs('small', 'rich'));
  });

  it('goes worse more often the more it is repeated, and better when they like you', () => {
    const rng = createRng('tiers');
    const rate = (score: number, tiers: OutcomeTier[]) => {
      let hit = 0;
      for (let i = 0; i < 4000; i++) if (tiers.includes(rollTier(rng, score, content))) hit++;
      return hit / 4000;
    };
    // Backfires happen, and more so for a score dragged down by repeats.
    expect(rate(5, ['backfire'])).toBeGreaterThan(0);
    expect(rate(-25, ['backfire', 'bad'])).toBeGreaterThan(rate(5, ['backfire', 'bad']) * 4);
    expect(rate(30, ['good', 'great'])).toBeGreaterThan(rate(0, ['good', 'great']));
    // And it isn't a sure thing either way: a warm friend still has bad days.
    expect(rate(14, ['neutral', 'bad', 'backfire'])).toBeGreaterThan(0.2);
  });
});

describe('diminishing returns', () => {
  it('shrinks the factor with each repeat of the same interaction and of any interaction', () => {
    expect(returnsFactor({ same: 0, total: 0 }, content)).toBe(1);
    expect(returnsFactor({ same: 1, total: 1 }, content)).toBeLessThan(1);
    expect(returnsFactor({ same: 3, total: 3 }, content)).toBeLessThan(returnsFactor({ same: 1, total: 1 }, content));
    expect(returnsFactor({ same: 0, total: 5 }, content)).toBeLessThan(1);
  });

  it('gives less each time, and a neutral relationship never reaches maximum affection from spamming', () => {
    const good = forced('great');
    let life = lifeWith(30, [friend({ affection: 50, trust: 50, mood: 50 })]);
    const gains: number[] = [];
    for (let i = 0; i < 60; i++) {
      const before = life.relationships.f1!.affection;
      life = performInteraction(life, { interactionId: 'compliment', personId: 'f1' }, good);
      gains.push(life.relationships.f1!.affection - before);
      life = closeInteraction(life, content);
    }
    expect(gains[0]!).toBeGreaterThan(gains[3]!);
    expect(gains[0]!).toBeGreaterThan(gains[10]!);
    const cap = balance.returns.yearlyCap;
    expect(life.relationships.f1!.affection).toBeLessThanOrEqual(50 + cap.affection);
    expect(life.relationships.f1!.trust).toBeLessThanOrEqual(50 + cap.trust);
    expect(life.relationships.f1!.affection).toBeLessThan(100);
    expect(life.relationships.f1!.interactions?.gained.affection).toBeLessThanOrEqual(cap.affection);
    expect(checkInvariants(life, good)).toEqual([]);
  });

  it('resets the counters each year', () => {
    const good = forced('good');
    let life = lifeWith(30, [friend()]);
    life = closeInteraction(performInteraction(life, { interactionId: 'chat', personId: 'f1' }, good), content);
    life = closeInteraction(performInteraction(life, { interactionId: 'chat', personId: 'f1' }, good), content);
    expect(repeatsThisYear(life, life.relationships.f1!, 'chat')).toEqual({ same: 2, total: 2 });
    life = produce(life, (d) => {
      d.currentYear += 1;
      d.character.age += 1;
    });
    expect(repeatsThisYear(life, life.relationships.f1!, 'chat')).toEqual({ same: 0, total: 0 });
    life = performInteraction(life, { interactionId: 'chat', personId: 'f1' }, good);
    expect(life.relationships.f1!.interactions).toMatchObject({ year: life.currentYear, counts: { chat: 1 } });
  });

  it('leaves them annoyed after repeats or a bad outcome', () => {
    let life = lifeWith(30, [friend()]);
    const good = forced('good');
    for (let i = 0; i < balance.reaction.annoyedAfter; i++) life = closeInteraction(performInteraction(life, { interactionId: 'chat', personId: 'f1' }, good), content);
    expect(life.relationships.f1!.interactions?.annoyed).toBe(true);
    const fresh = lifeWith(30, [friend()]);
    expect(performInteraction(fresh, { interactionId: 'chat', personId: 'f1' }, good).relationships.f1!.interactions?.annoyed).toBe(false);
    expect(performInteraction(fresh, { interactionId: 'chat', personId: 'f1' }, forced('bad')).relationships.f1!.interactions?.annoyed).toBe(true);
  });

  it('costs trust for each repeated ask, whatever the outcome', () => {
    const neutral = forced('neutral');
    let life = lifeWith(30, [{ id: 'm', age: 55, kind: 'parent', trust: 80 }]);
    life = closeInteraction(performInteraction(life, { interactionId: 'ask_money', personId: 'm' }, neutral), content);
    const afterFirst = life.relationships.m!.trust;
    life = closeInteraction(performInteraction(life, { interactionId: 'ask_money', personId: 'm' }, neutral), content);
    const firstLoss = 80 - afterFirst;
    const secondLoss = afterFirst - life.relationships.m!.trust;
    expect(secondLoss).toBeGreaterThan(firstLoss);
  });
});

describe('moods', () => {
  it('has a baseline from personality and circumstances, without randomness', () => {
    const life = lifeWith(30, [friend()]);
    const person = life.people.f1!;
    const base = moodBaseline(life, person, content);
    expect(base).toBe(moodBaseline(life, person, content));
    expect(moodBaseline(life, { ...person, traits: { kindness: 95, sociability: 95 } }, content)).toBeGreaterThan(base);
    expect(moodBaseline(life, { ...person, wealthLevel: 'poor' }, content)).toBeLessThan(base);
    const estranged = produce(life, (d) => {
      d.relationships.f1!.status = 'estranged';
    });
    expect(moodBaseline(estranged, estranged.people.f1!, content)).toBeLessThan(base);
  });

  it('moves with interactions and events, and drifts back toward the baseline each year', () => {
    let life = lifeWith(30, [friend({ mood: 60 })]);
    life = performInteraction(life, { interactionId: 'chat', personId: 'f1' }, forced('great'));
    const lifted = life.people.f1!.mood;
    expect(lifted).toBeGreaterThan(60);
    const drifted = produce(life, (d) => {
      d.people.f1!.moodBase = 50;
      d.people.f1!.mood = 90;
      runMoods(d, { ...content, balance: { ...content.balance, interactions: { ...balance, mood: { ...balance.mood, baseline: { ...balance.mood.baseline, noiseSd: 0 } } } } });
    });
    const person = drifted.people.f1!;
    const base = moodBaseline(drifted, person, content);
    expect(person.moodBase).toBe(base);
    expect(Math.abs(person.mood - base)).toBeLessThan(Math.abs(90 - base));
    const shifted = produce(life, (d) => shiftMood(d.people.f1!, -500));
    expect(shifted.people.f1!.mood).toBe(0);
  });

  it('shows a mood word only for close people', () => {
    const life = lifeWith(30, [
      { id: 'mum', age: 58, kind: 'parent', affection: 10 },
      friend({ id: 'close', affection: balance.mood.closeAffection }),
      friend({ id: 'far', affection: balance.mood.closeAffection - 5 }),
      { id: 'boss', age: 45, kind: 'boss', affection: 30 },
      { id: 'gone', age: 30, kind: 'friend', status: 'estranged', affection: 90 },
      { id: 'dead', age: 30, kind: 'friend', alive: false, affection: 90 },
    ]);
    expect(moodView(life, 'mum', content)).not.toBeNull();
    expect(moodView(life, 'close', content)).not.toBeNull();
    expect(moodView(life, 'far', content)).toBeNull();
    expect(moodView(life, 'boss', content)).toBeNull();
    expect(moodView(life, 'gone', content)).toBeNull();
    expect(moodView(life, 'dead', content)).toBeNull();
    expect(isClose(life, 'close', content)).toBe(true);
  });

  it('bands moods and flags being annoyed with you', () => {
    expect(moodBand(95, content)).toBe('great');
    expect(moodBand(balance.mood.bands.good, content)).toBe('good');
    expect(moodBand(balance.mood.bands.okay, content)).toBe('okay');
    expect(moodBand(balance.mood.bands.low, content)).toBe('low');
    expect(moodBand(0, content)).toBe('bad');
    const life = performInteraction(lifeWith(30, [friend()]), { interactionId: 'chat', personId: 'f1' }, forced('backfire'));
    expect(moodView(life, 'f1', content)?.annoyed).toBe(true);
  });
});

describe('wealth levels', () => {
  it('turns a job’s pay into a level and blends it with the background', () => {
    expect(wealthFromSalary(20000, content)).toBe('poor');
    expect(wealthFromSalary(45000, content)).toBe('working');
    expect(wealthFromSalary(70000, content)).toBe('middle');
    expect(wealthFromSalary(100000, content)).toBe('affluent');
    expect(wealthFromSalary(500000, content)).toBe('rich');
    expect(blendWealth('rich', 'poor', content)).not.toBe('poor');
    expect(blendWealth('rich', 'poor', content)).not.toBe('rich');
    expect(blendWealth('middle', 'middle', content)).toBe('middle');
  });

  it('gives relatives your family background and rolls people you meet', () => {
    const life = createdLife('wealth-1');
    for (const person of Object.values(life.people)) expect(person.wealthLevel).toBe(life.character.familyWealth);
    const rng = createRng('wealth');
    const adult = lifeWith(30, []);
    const levels = new Set<string>();
    let employed = 0;
    for (let i = 0; i < 400; i++) {
      const rolled = rollWealth(adult, 'friend', 30, rng, content);
      levels.add(rolled.wealthLevel);
      if (rolled.occupation !== undefined) {
        employed++;
        expect(content.jobs[rolled.occupation]).toBeDefined();
      }
    }
    expect(levels.size).toBeGreaterThan(2);
    expect(employed).toBeGreaterThan(200);
    expect(rollWealth(adult, 'friend', 12, rng, content).occupation).toBeUndefined();
    expect(rollWealth(adult, 'friend', 80, rng, content).occupation).toBeUndefined();
    expect(rollWealth(adult, 'sibling', 30, rng, content)).toEqual({ wealthLevel: adult.character.familyWealth });
  });
});

function createdLife(seed: string): LifeState {
  return lifeAtAge(seed, 0);
}

describe('availability', () => {
  const ids = (life: LifeState, id: string) => availableInteractions(life, id, content).map((d) => d.id);

  it('shows everyday and practical interactions with family, not romance', () => {
    const life = lifeWith(30, [{ id: 'mum', age: 58, kind: 'parent' }]);
    const shown = ids(life, 'mum');
    for (const id of ['chat', 'hug', 'give_gift', 'ask_money', 'ask_advice', 'argue']) expect(shown).toContain(id);
    for (const id of ['flirt', 'go_on_date', 'kiss', 'be_intimate']) expect(shown).not.toContain(id);
  });

  it('needs the right kind, status and ages', () => {
    const life = lifeWith(30, [
      { id: 'boss', age: 45, kind: 'boss' },
      { id: 'kid', age: 6, kind: 'sibling' },
    ]);
    expect(ids(life, 'boss')).toContain('chat');
    expect(ids(life, 'boss')).not.toContain('hug');
    expect(ids(life, 'boss')).not.toContain('ask_money');
    expect(ids(life, 'kid')).not.toContain('ask_advice');
    expect(ids(life, 'kid')).not.toContain('ask_money');
    expect(ids(life, 'kid')).toContain('hug');
    const young = lifeWith(3, [{ id: 'mum', age: 28, kind: 'parent' }]);
    expect(ids(young, 'mum')).not.toContain('compliment');
  });

  it('needs the same city for in-person interactions, and works remotely anywhere', () => {
    const life = lifeWith(30, [friend({ id: 'near' }), friend({ id: 'far', cityId: 'elsewhere_city' })]);
    const other = Object.keys(content.cities).find((c) => c !== life.character.cityId)!;
    const moved = produce(life, (d) => {
      d.people.far!.cityId = other;
    });
    expect(ids(moved, 'near')).toContain('spend_time');
    expect(ids(moved, 'far')).not.toContain('spend_time');
    expect(ids(moved, 'far')).not.toContain('hug');
    expect(ids(moved, 'far')).not.toContain('give_gift');
    expect(ids(moved, 'far')).toContain('chat');
    expect(ids(moved, 'far')).toContain('ask_advice');
  });

  it('is empty for the dead and the faded, and only apologize works when estranged', () => {
    const life = lifeWith(30, [
      friend({ id: 'dead', alive: false }),
      friend({ id: 'gone', status: 'ended' }),
      friend({ id: 'cold', status: 'estranged' }),
    ]);
    expect(ids(life, 'dead')).toEqual([]);
    expect(ids(life, 'gone')).toEqual([]);
    expect(ids(life, 'cold')).toEqual(['apologize']);
  });

  it('only offers apologize when there is something to apologize for', () => {
    const calm = lifeWith(30, [friend()]);
    expect(ids(calm, 'f1')).not.toContain('apologize');
    const fought = lifeWith(30, [friend({ memories: [{ tag: 'big_fight', year: 2020 }] })]);
    expect(ids(fought, 'f1')).toContain('apologize');
  });

  it('allows only visits from prison', () => {
    const inside = produce(lifeWith(30, [friend(), { id: 'mum', age: 58, kind: 'parent' }]), (d) => {
      d.housing.kind = 'incarcerated';
    });
    const shown = ids(inside, 'mum');
    expect(shown).toEqual(expect.arrayContaining(['chat', 'hug', 'ask_advice']));
    expect(shown).not.toContain('give_gift');
    expect(shown).not.toContain('ask_money');
    expect(shown).not.toContain('pick_a_fight');
    expect(ids(inside, 'f1')).not.toContain('spend_time');
  });

  it('only offers anything between years', () => {
    const life = produce(lifeWith(30, [friend()]), (d) => {
      d.phase = 'events';
    });
    expect(ids(life, 'f1')).toEqual([]);
  });

  describe('romance (adults only)', () => {
    const romance = Object.values(content.interactions).filter((d) => d.romance);

    it('has romance interactions, and every one asks both people to be adults and never family', () => {
      expect(romance.map((d) => d.id).sort()).toEqual(['be_intimate', 'flirt', 'go_on_date', 'kiss']);
      for (const def of romance) {
        expect(def.availability.you.min).toBeGreaterThanOrEqual(ADULT);
        expect(def.availability.them.min).toBeGreaterThanOrEqual(ADULT);
        expect(def.availability.kinds.some((k) => ['parent', 'stepparent', 'sibling', 'grandparent'].includes(k))).toBe(false);
      }
    });

    it('is available with an adult friend you are attracted to', () => {
      const life = lifeWith(30, [friend({ affection: 80 })]);
      expect(ids(life, 'f1')).toEqual(expect.arrayContaining(['flirt', 'go_on_date', 'kiss', 'be_intimate']));
    });

    it('is never available when either of you is under 18', () => {
      const youngYou = lifeWith(16, [friend({ age: 20, affection: 90 })]);
      const youngThem = lifeWith(30, [friend({ age: 16, affection: 90 })]);
      for (const life of [youngYou, youngThem]) {
        for (const def of romance) expect(isInteractionAvailable(life, def, 'f1', content)).toBe(false);
      }
      // Even a content bundle that gets it wrong can't make it happen: the engine checks the ages itself.
      const sloppy = {
        ...content,
        interactions: {
          ...content.interactions,
          flirt: { ...content.interactions.flirt!, availability: { ...content.interactions.flirt!.availability, you: {}, them: {} } },
        },
      };
      expect(isInteractionAvailable(youngThem, sloppy.interactions.flirt, 'f1', sloppy)).toBe(false);
      expect(isInteractionAvailable(youngYou, sloppy.interactions.flirt, 'f1', sloppy)).toBe(false);
    });

    it('is never available with family, whatever the ages', () => {
      const life = lifeWith(40, [{ id: 'sis', age: 38, kind: 'sibling', affection: 90 }]);
      const sloppy = {
        ...content.interactions.flirt!,
        availability: { ...content.interactions.flirt!.availability, kinds: ['sibling' as const] },
      };
      expect(isInteractionAvailable(life, sloppy, 'sis', content)).toBe(false);
      for (const def of romance) expect(isInteractionAvailable(life, def, 'sis', content)).toBe(false);
    });

    it('needs attraction both ways outside a current romance', () => {
      const life = produce(lifeWith(30, [friend({ affection: 80 })]), (d) => {
        d.people.f1!.identity.attractedTo = [];
      });
      for (const def of romance) expect(isInteractionAvailable(life, def, 'f1', content)).toBe(false);
    });

    it('needs affection for a kiss or a night, and a current partner for a partner kind', () => {
      const cold = lifeWith(30, [friend({ affection: 20 })]);
      expect(ids(cold, 'f1')).not.toContain('kiss');
      expect(ids(cold, 'f1')).not.toContain('be_intimate');
      const lukewarm = lifeWith(30, [friend({ affection: 50 })]);
      expect(ids(lukewarm, 'f1')).toContain('kiss');
      expect(ids(lukewarm, 'f1')).not.toContain('be_intimate');
      const partner = lifeWith(30, [{ id: 'p', age: 30, kind: 'partner', affection: 60 }]);
      expect(ids(partner, 'p')).toEqual(expect.arrayContaining(['flirt', 'be_intimate']));
    });
  });
});

describe('doing an interaction', () => {
  it('records the input, leaves an outcome card, and survives a close', () => {
    const start = lifeWith(30, [friend()]);
    const life = performInteraction(start, { interactionId: 'chat', personId: 'f1' }, content);
    expect(life.inputLog.at(-1)).toEqual({ year: life.currentYear, kind: 'interact', payload: { interactionId: 'chat', personId: 'f1' } });
    expect(life.pendingInteraction).toMatchObject({ interactionId: 'chat', personId: 'f1' });
    expect(life.pendingInteraction!.text.length).toBeGreaterThan(10);
    expect(life.pendingInteraction!.text).not.toMatch(/[{}]/);
    expect(checkInvariants(life, content)).toEqual([]);
    const closed = closeInteraction(life, content);
    expect(closed.pendingInteraction).toBeNull();
    expect(closed.inputLog.at(-1)?.kind).toBe('interactClose');
    expect(() => closeInteraction(closed, content)).toThrow(InvalidInputError);
    // The start life was not changed.
    expect(start.pendingInteraction).toBeNull();
  });

  it('rejects bad input', () => {
    const life = lifeWith(30, [friend()]);
    const bad = (params: unknown) => () => performInteraction(life, params, content);
    expect(bad(null)).toThrow(InvalidInputError);
    expect(bad({ interactionId: 'nope', personId: 'f1' })).toThrow(InvalidInputError);
    expect(bad({ interactionId: 'chat', personId: 'ghost' })).toThrow(InvalidInputError);
    expect(bad({ interactionId: 'chat', personId: 'f1', giftTier: 'huge' })).toThrow(InvalidInputError);
    expect(bad({ interactionId: 'chat', personId: 'f1', giftTier: 'small' })).toThrow(InvalidInputError);
    expect(bad({ interactionId: 'give_gift', personId: 'f1' })).toThrow(InvalidInputError);
    expect(bad({ interactionId: 'chat', personId: 'f1', extra: 1 })).toThrow(InvalidInputError);
    const acquaintance = lifeWith(30, [friend({ affection: 50 })]);
    expect(() => performInteraction(acquaintance, { interactionId: 'be_intimate', personId: 'f1' }, content)).toThrow(InvalidInputError);
    const mid = produce(life, (d) => {
      d.phase = 'events';
    });
    expect(() => performInteraction(mid, { interactionId: 'chat', personId: 'f1' }, content)).toThrow(PhaseError);
  });

  it('is deterministic: the same life and input give the same result', () => {
    const start = lifeWith(30, [friend()]);
    const a = performInteraction(start, { interactionId: 'compliment', personId: 'f1' }, content);
    const b = performInteraction(start, { interactionId: 'compliment', personId: 'f1' }, content);
    expect(a).toEqual(b);
    expect(a.rng).not.toEqual(start.rng);
  });

  it('rebuilds a life with interactions exactly from its input log', () => {
    let life = lifeAtAge('replay-interactions', 0);
    const rng = createRng('driver');
    const choices = createRng('driver-choices');
    for (let year = 0; year < 40 && life.phase !== 'dead'; year++) {
      const people = Object.keys(life.relationships).sort();
      for (let i = 0; i < 6 && life.phase === 'yearStart'; i++) {
        const id = people[nextInt(rng, 0, people.length - 1)]!;
        const options = availableInteractions(life, id, content);
        if (options.length === 0) continue;
        const def = options[nextInt(rng, 0, options.length - 1)]!;
        const giftTier = def.gift ? (['small', 'medium', 'big'] as const)[nextInt(rng, 0, 2)]! : undefined;
        if (giftTier && !canAffordGift(life, giftTier, content)) continue;
        life = performInteraction(life, { interactionId: def.id, personId: id, ...(giftTier ? { giftTier } : {}), ...defaultExtras(life, def, id, content) }, content);
        const choice = life.pendingInteraction?.choice;
        if (choice) life = resolveInteractionChoice(life, choice.options[nextInt(rng, 0, choice.options.length - 1)]!.id, content);
        if (nextInt(rng, 0, 1) === 0) life = closeInteraction(life, content);
      }
      life = beginYear(life, content);
      life = resolveAll(life, content, choices);
      if (life.phase === 'yearEnd') life = endYear(life, content);
    }
    expect(life.inputLog.filter((r) => r.kind === 'interact').length).toBeGreaterThan(5);
    expect(replayLife(life.inputLog, content)).toEqual(life);
  });
});

describe('big moments: a choice inside the outcome card', () => {
  it('opens a choice on a tense stand-off and applies the one you pick', () => {
    const neutral = forced('neutral');
    const start = lifeWith(30, [friend()]);
    let life = performInteraction(start, { interactionId: 'pick_a_fight', personId: 'f1' }, neutral);
    expect(life.pendingInteraction?.choice?.options.map((o) => o.id)).toEqual(['swing', 'back_down']);
    expect(() => closeInteraction(life, content)).toThrow(InvalidInputError);
    expect(() => performInteraction(life, { interactionId: 'chat', personId: 'f1' }, neutral)).toThrow(InvalidInputError);
    expect(() => beginYear(life, neutral)).toThrow(PhaseError);
    expect(() => resolveInteractionChoice(life, 'nope', neutral)).toThrow(InvalidInputError);
    const walked = resolveInteractionChoice(life, 'back_down', neutral);
    expect(walked.pendingInteraction?.choice?.chosen).toBe('back_down');
    expect(walked.pendingInteraction?.choice?.result).toMatch(/step back/);
    expect(walked.relationships.f1!.memories.some((m) => m.tag === 'big_fight')).toBe(false);
    life = resolveInteractionChoice(life, 'swing', forced('neutral', { fightInjury: 0, fightCharge: 0 }));
    expect(life.relationships.f1!.memories.some((m) => m.tag === 'big_fight')).toBe(true);
    expect(life.pendingInteraction?.changes.affection).toBeLessThan(-5);
    expect(() => resolveInteractionChoice(life, 'swing', neutral)).toThrow(InvalidInputError);
    expect(closeInteraction(life, content).pendingInteraction).toBeNull();
    expect(checkInvariants(life, neutral)).toEqual([]);
  });

  it('opens a walk-away-or-keep-going choice after a bad argument', () => {
    const bad = forced('bad');
    let life = performInteraction(lifeWith(30, [friend()]), { interactionId: 'argue', personId: 'f1' }, bad);
    expect(life.pendingInteraction?.choice?.options.map((o) => o.id)).toEqual(['walk_away', 'keep_going']);
    const before = life.relationships.f1!.affection;
    life = resolveInteractionChoice(life, 'keep_going', bad);
    expect(life.relationships.f1!.affection).toBeLessThan(before);
    expect(life.relationships.f1!.memories.map((m) => m.tag)).toContain('big_fight');
    expect(life.history.at(-1)!.text).toMatch(/fight/);
  });
});

describe('links to the finance, health and legal systems', () => {
  it('spends real money on a gift: savings first, then (a little) debt', () => {
    const life = lifeWith(30, [friend()], 1000);
    const price = giftPrice(life, 'medium', content);
    const done = performInteraction(life, { interactionId: 'give_gift', personId: 'f1', giftTier: 'medium' }, content);
    expect(done.finances.savings).toBe(1000 - price);
    expect(done.pendingInteraction?.giftTier).toBe('medium');
    expect(done.pendingInteraction?.money).toEqual({ change: -price, balance: 1000 - price, debtChange: 0 });
    // Bigger gifts cost more, in your city's prices.
    expect(giftPrice(life, 'big', content)).toBeGreaterThan(price);
    expect(giftPrice(life, 'small', content)).toBeLessThan(price);

    const broke = lifeWith(30, [friend()], 40);
    const big = giftPrice(broke, 'big', content);
    expect(canAffordGift(broke, 'big', content)).toBe(big <= 40 + balance.gifts.maxBorrow);
    const medium = performInteraction(broke, { interactionId: 'give_gift', personId: 'f1', giftTier: 'medium' }, content);
    const owed = giftPrice(broke, 'medium', content) - 40;
    expect(medium.finances.savings).toBe(0);
    expect(medium.finances.debts.reduce((sum, d) => sum + d.balance, 0)).toBe(owed);
    expect(medium.pendingInteraction?.money?.debtChange).toBe(owed);
    // Past that, you can't.
    const penniless = lifeWith(30, [friend()], 0);
    expect(canAffordGift(penniless, 'big', content)).toBe(false);
    expect(() => performInteraction(penniless, { interactionId: 'give_gift', personId: 'f1', giftTier: 'big' }, content)).toThrow(InvalidInputError);
    expect(checkInvariants(medium, content)).toEqual([]);
  });

  it('makes gifts cheaper for a child, who can only spend savings', () => {
    const kid = lifeWith(12, [{ id: 's', age: 14, kind: 'sibling' }], 30);
    expect(giftPrice(kid, 'big', content)).toBeLessThan(giftPrice(lifeWith(30, [], 0), 'big', content));
    expect(canAffordGift(lifeWith(12, [], 0), 'small', content)).toBe(false);
  });

  it('lets a person give you money when you ask: a gift is yours, a loan is a personal debt', () => {
    const asked = (tier: OutcomeTier, age = 30) => {
      const life = lifeWith(age, [{ id: 'mum', age: age + 28, kind: 'parent' }], 100);
      return performInteraction(life, { interactionId: 'ask_money', personId: 'mum' }, forced(tier));
    };
    const gift = asked('great');
    expect(gift.finances.savings).toBeGreaterThan(100);
    expect(gift.finances.debts).toEqual([]);
    expect(gift.relationships.mum!.memories.map((m) => m.tag)).toContain('gave_you_money');
    expect(gift.pendingInteraction?.money).toMatchObject({ change: gift.finances.savings - 100, debtChange: 0 });

    const loan = asked('good');
    expect(loan.finances.savings).toBeGreaterThan(100);
    const debt = loan.finances.debts.find((d) => d.kind === 'personal');
    expect(debt?.balance).toBe(loan.finances.savings - 100);
    expect(debt?.annualRate).toBe(balance.money.loan.annualRate);
    expect(loan.relationships.mum!.memories.map((m) => m.tag)).toContain('lent_you_money');
    expect(loan.pendingInteraction?.money?.debtChange).toBe(debt!.balance);
    // Money isn't created: what you got is exactly what you now owe.
    expect(loan.finances.savings - 100).toBe(debt!.balance);

    // A child is given pocket money, never a loan.
    const pocket = asked('good', 14);
    expect(pocket.finances.debts).toEqual([]);
    expect(pocket.finances.savings).toBeGreaterThan(100);

    // Refusals change nothing.
    for (const tier of ['neutral', 'bad', 'backfire'] as const) {
      expect(asked(tier).finances.savings).toBe(100);
      expect(asked(tier).pendingInteraction?.money).toBeUndefined();
    }
  });

  it('sizes what people give by how well off they are and where you live', () => {
    const rng = createRng('amounts');
    const rich = lifeWith(30, [{ id: 'r', age: 60, kind: 'parent' }]);
    const richer = produce(rich, (d) => {
      d.people.r!.wealthLevel = 'rich';
    });
    const poorer = produce(rich, (d) => {
      d.people.r!.wealthLevel = 'poor';
    });
    const avg = (life: LifeState) => {
      let total = 0;
      for (let i = 0; i < 50; i++) total += rollAskedAmount(life, 'r', rng, content);
      return total / 50;
    };
    expect(avg(richer)).toBeGreaterThan(avg(poorer) * 5);
    const child = produce(richer, (d) => {
      d.character.age = 12;
    });
    expect(avg(child)).toBeLessThan(avg(richer));
    const direct = produce(rich, (d) => {
      giveMoney(d, 'r', 'gift', createRng('x'), content);
    });
    expect(direct.finances.savings).toBeGreaterThan(5000);
  });

  it('can end a fight in an injury and an assault charge for an adult', () => {
    const certain = forced('backfire', { fightInjury: 1, fightCharge: 1, fightDiscipline: 1 });
    const life = performInteraction(lifeWith(30, [friend()]), { interactionId: 'pick_a_fight', personId: 'f1' }, certain);
    expect(life.health.conditions.map((c) => c.conditionId)).toContain('broken_bone');
    expect(life.legal.record.map((r) => r.offenseId)).toContain('assault');
    expect(life.pendingInteraction?.notes.join(' ')).toMatch(/bone/);
    expect(life.pendingInteraction?.notes.join(' ')).toMatch(/assault/);
    expect(life.relationships.f1!.memories.map((m) => m.tag)).toContain('big_fight');
    expect(life.flags.suspended).toBeUndefined();
    expect(checkInvariants(life, certain)).toEqual([]);
  });

  it('answers a minor’s fight with school discipline, not a charge', () => {
    const certain = forced('backfire', { fightInjury: 0, fightCharge: 1, fightDiscipline: 1 });
    const start = produce(lifeWith(15, [{ id: 'c', age: 15, kind: 'classmate' }]), (d) => {
      d.education.current = {
        program: 'high',
        year: 1,
        lengthYears: 4,
        gpa: 3,
        boost: 0,
        repeats: 0,
        scholarship: 0,
        since: d.currentYear,
      };
    });
    const life = performInteraction(start, { interactionId: 'pick_a_fight', personId: 'c' }, certain);
    expect(life.legal.record).toEqual([]);
    expect(life.flags.suspended).toBe(true);
    expect(life.education.current?.boost).toBeLessThan(0);
    expect(life.pendingInteraction?.notes.join(' ')).toMatch(/suspended/);
  });

  it('can’t pick a fight with family it has no place picking one with: not with a grandparent', () => {
    const life = lifeWith(30, [{ id: 'gran', age: 80, kind: 'grandparent' }]);
    expect(availableInteractions(life, 'gran', content).map((d) => d.id)).not.toContain('pick_a_fight');
  });

  it('carries a health risk into intimacy, lower with precautions', () => {
    const start = lifeWith(30, [{ id: 'p', age: 30, kind: 'partner', affection: 80 }]);
    const risky = forced('great', { intimacyTreatable: 1, intimacyChronic: 0, intimacyTreatableCareful: 0, intimacyChronicCareful: 0 });
    let life = performInteraction(start, { interactionId: 'be_intimate', personId: 'p' }, risky);
    expect(life.pendingInteraction?.choice?.options.map((o) => o.id)).toEqual(['careful', 'carefree']);
    expect(life.health.conditions).toEqual([]);
    const careful = resolveInteractionChoice(life, 'careful', risky);
    expect(careful.health.conditions).toEqual([]);
    life = resolveInteractionChoice(life, 'carefree', risky);
    expect(life.health.conditions.map((c) => c.conditionId)).toEqual(['treatable_infection']);
    expect(life.flags.was_infected).toBe(true);
    expect(life.relationships.p!.memories.map((m) => m.tag)).toContain('night_together');
    expect(life.pendingInteraction?.notes.join(' ')).toMatch(/infection/);
    // A partner is not cheating.
    expect(life.flags.unfaithful).toBeUndefined();
    expect(checkInvariants(life, risky)).toEqual([]);
  });

  it('writes memories, sets a flag and may get you found out when you are unfaithful', () => {
    const start = lifeWith(30, [
      { id: 'p', age: 30, kind: 'partner', affection: 70 },
      friend({ affection: 80 }),
    ]);
    const found = produce(start, (d) => {
      betray(d, 'f1', 'intimate', createRng('b'), {
        ...content,
        balance: { ...content.balance, interactions: { ...balance, infidelity: { ...balance.infidelity, discovery: { flirt: 1, intimate: 1 } } } },
      });
    });
    expect(found.flags.unfaithful).toBe(true);
    expect(found.relationships.p!.memories.map((m) => m.tag)).toContain('cheated_on_them');
    expect(found.relationships.f1!.memories.map((m) => m.tag)).toContain('affair_with_you');
    expect(found.scheduled.length).toBe(1);
    expect(found.scheduled[0]!.dueYear).toBeGreaterThan(found.currentYear);
    expect(found.scheduled[0]!.cast.partner).toBe('p');
    expect(content.registries.interactions.infidelity.intimate.events).toContain(found.scheduled[0]!.eventId);
    expect(checkInvariants(found, content)).toEqual([]);

    // Through the menu: a kiss with someone else while you have a partner.
    const kissed = performInteraction(start, { interactionId: 'kiss', personId: 'f1' }, forced('good'));
    expect(kissed.flags.unfaithful).toBe(true);
    expect(kissed.relationships.p!.memories.map((m) => m.tag)).toContain('cheated_on_them');
    expect(kissed.relationships.f1!.memories.map((m) => m.tag)).toContain('shared_a_kiss');
    // Kissing your partner is not.
    const fine = performInteraction(start, { interactionId: 'kiss', personId: 'p' }, forced('good'));
    expect(fine.flags.unfaithful).toBeUndefined();
    // Single: nothing to be unfaithful to.
    const single = performInteraction(lifeWith(30, [friend({ affection: 80 })]), { interactionId: 'kiss', personId: 'f1' }, forced('good'));
    expect(single.flags.unfaithful).toBeUndefined();
  });

  it('flirting with someone else can be found out too', () => {
    const start = lifeWith(30, [{ id: 'p', age: 30, kind: 'partner' }, friend({ affection: 70 })]);
    const life = performInteraction(start, { interactionId: 'flirt', personId: 'f1' }, forced('great'));
    expect(life.flags.unfaithful).toBe(true);
    expect(life.relationships.f1!.memories.map((m) => m.tag)).toContain('flirted_behind_their_back');
  });

  it('writes memories and history for a big moment', () => {
    const start = lifeWith(30, [friend()]);
    const life = performInteraction(start, { interactionId: 'insult', personId: 'f1' }, forced('backfire'));
    expect(life.relationships.f1!.memories.map((m) => m.tag)).toContain('humiliated_them');
    expect(life.history.length).toBeGreaterThan(start.history.length);
    expect(life.history.at(-1)!.text).not.toMatch(/[{}]/);
    expect(life.people.f1!.mood).toBeLessThan(start.people.f1!.mood);
  });

  it('lets an apology reach someone you are not speaking to', () => {
    const start = lifeWith(30, [friend({ status: 'estranged', affection: 30 })]);
    const life = performInteraction(start, { interactionId: 'apologize', personId: 'f1' }, forced('great'));
    expect(life.relationships.f1!.status).toBe('active');
    expect(life.relationships.f1!.memories.map((m) => m.tag)).toContain('made_peace');
  });
});

describe('every interaction', () => {
  it('has a profile, 2–3 wordings per tier, and fills in cleanly for people of any pronouns', () => {
    const defs = Object.values(content.interactions).filter((d) => !d.retired);
    expect(defs.length).toBeGreaterThanOrEqual(19);
    expect(new Set(defs.map((d) => d.group))).toEqual(new Set(['everyday', 'conflict', 'romance', 'practical', 'parenting']));
    for (const def of defs) {
      expect(balance.profiles[def.profile], def.id).toBeDefined();
      for (const [tier, outcome] of Object.entries(def.outcomes)) {
        if (!outcome) continue;
        expect(outcome.text.length, `${def.id} ${tier}`).toBeGreaterThanOrEqual(2);
        expect(outcome.text.length, `${def.id} ${tier}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('plays out in every tier without an invariant failure', () => {
    for (const def of Object.values(content.interactions)) {
      for (const tier of ['great', 'good', 'neutral', 'bad', 'backfire'] as const) {
        const kind = def.availability.kinds.includes('partner') ? 'partner' : def.availability.kinds[0]!;
        const age = def.availability.you.min !== undefined ? Math.max(30, def.availability.you.min) : 30;
        const start = lifeWith(
          age,
          [{ id: 'x', age: kind === 'child' || kind === 'stepchild' ? Math.max(def.availability.them.min ?? 5, 5) : Math.max(def.availability.them.min ?? 20, 24) + (['parent', 'stepparent'].includes(kind) ? 30 : kind === 'grandparent' ? 55 : 0), kind, affection: 80, trust: 80, status: def.availability.status[0] === 'estranged' ? 'estranged' : 'active', memories: [{ tag: 'big_fight', year: 2020 }] }],
          20000,
        );
        if (!isInteractionAvailable(start, def, 'x', content)) continue;
        const bundle = forced(tier);
        let life = performInteraction(start, { interactionId: def.id, personId: 'x', ...(def.gift ? { giftTier: 'small' as const } : {}), ...defaultExtras(start, def, 'x', content) }, bundle);
        const choice = life.pendingInteraction?.choice;
        if (choice) for (const option of choice.options) life = resolveInteractionChoice(performInteraction(start, { interactionId: def.id, personId: 'x', ...(def.gift ? { giftTier: 'small' as const } : {}), ...defaultExtras(start, def, 'x', content) }, bundle), option.id, bundle);
        expect(life.pendingInteraction?.text, `${def.id} ${tier}`).toBeTruthy();
        expect(checkInvariants(life, bundle), `${def.id} ${tier}`).toEqual([]);
      }
    }
  });
});

describe('the adults-only rule in the log', () => {
  it('is an invariant failure if a romance interaction ever involved a minor or family', () => {
    const adult = lifeWith(30, [friend({ affection: 80 })]);
    const done = performInteraction(adult, { interactionId: 'flirt', personId: 'f1' }, content);
    expect(checkInvariants(done, content)).toEqual([]);
    const tampered = produce(done, (d) => {
      d.people.f1!.birthYear = d.currentYear - 15;
    });
    expect(checkInvariants(tampered, content).some((f) => f.includes('was under'))).toBe(true);
    const family = produce(done, (d) => {
      d.relationships.f1!.kind = 'sibling';
    });
    expect(checkInvariants(family, content).some((f) => f.includes('with family'))).toBe(true);
  });
});

describe('moods in the year pipeline', () => {
  it('draws every year for everyone in your life, and keeps moods in range', () => {
    let life = lifeWith(30, [friend(), { id: 'mum', age: 58, kind: 'parent' }]);
    for (let i = 0; i < 5; i++) {
      life = beginYear(life, content);
      while (life.phase === 'events') {
        const next = life.pending.find((p) => p.resolvedChoiceId === undefined);
        if (!next) break;
        const def = content.events[next.eventId];
        life = resolveChoice(life, next.instanceId, def?.choices ? def.choices[0]!.id : 'continue', content);
      }
      if (life.phase === 'yearEnd') life = endYear(life, content);
      if (life.phase === 'dead') break;
    }
    for (const person of Object.values(life.people)) {
      expect(person.mood).toBeGreaterThanOrEqual(0);
      expect(person.mood).toBeLessThanOrEqual(100);
    }
    expect(checkInvariants(life, content)).toEqual([]);
  });
});

describe('moods and wealth through the rest of the engine', () => {
  it('lets an event move someone’s mood, kept within 0–100', () => {
    const life = lifeWith(30, [friend({ mood: 60 })]);
    const effect = (mood: number) =>
      produce(life, (d) => {
        applyEffects(d, [{ type: 'relationship', role: 'who', mood }], { def: { id: 'x', rarity: 'common' }, cast: { who: 'f1' }, rng: createRng('m'), content });
      }).people.f1!.mood;
    expect(effect(15)).toBe(75);
    expect(effect(-25)).toBe(35);
    expect(effect(100)).toBe(100);
    expect(effect(-100)).toBe(0);
  });

  it('gives people an event creates a mood, a wealth level and sometimes a job', () => {
    const life = lifeWith(30, []);
    const rng = createRng('created');
    const made = produce(life, (d) => {
      for (let i = 0; i < 40; i++) createPerson(d, { kind: 'friend', presence: 'city', createIfMissing: true }, rng, content);
    });
    const people = Object.values(made.people).filter((p) => p.tags.includes('friend'));
    expect(people.length).toBeGreaterThanOrEqual(30);
    for (const p of people) {
      expect(p.mood).toBeGreaterThanOrEqual(0);
      expect(p.mood).toBeLessThanOrEqual(100);
      expect(p.moodBase).toBe(p.mood);
      expect(['poor', 'working', 'middle', 'affluent', 'rich']).toContain(p.wealthLevel);
      if (p.occupation !== undefined) expect(content.jobs[p.occupation]).toBeDefined();
    }
    expect(people.some((p) => p.occupation !== undefined)).toBe(true);
    expect(new Set(people.map((p) => p.wealthLevel)).size).toBeGreaterThan(1);
    expect(checkInvariants(made, content)).toEqual([]);
  });

  it('gives your coworkers and boss jobs in your own field', () => {
    const life = produce(lifeWith(30, []), (d) => {
      d.career.job = { jobId: 'accountant', level: 2, yearsAtLevel: 1, performance: 50, salary: 60000, since: d.currentYear - 2, employer: 'Test & Co' };
    });
    const rng = createRng('colleagues');
    for (const kind of ['coworker', 'boss'] as const) {
      const made = produce(life, (d) => {
        createPerson(d, { kind, presence: 'city', age: { min: 25, max: 55 } }, rng, content);
      });
      const person = Object.values(made.people).find((p) => p.tags.includes(kind))!;
      expect(person.occupation).toBe('accountant');
    }
  });
});

