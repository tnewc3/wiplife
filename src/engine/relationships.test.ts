import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { eventSchema, type ContentBundle, type EventDef } from '../content/schemas';
import { availableActions, finishAction, isActionAvailable, performAction } from './actions';
import { playAction, playYear } from './autoplay';
import { evaluate } from './conditions';
import { InvalidInputError } from './creation/input';
import { castCandidates, castEvent } from './events/casting';
import { successChance } from './events/checks';
import { applyEffects } from './events/effects';
import { eventWeight } from './events/selection';
import { checkInvariants } from './invariants';
import { beginYear, CONTINUE_CHOICE, createLife, endYear, PhaseError, resolveChoice } from './life';
import { writeObituary } from './obituary';
import {
  canChangeKind,
  currentPartner,
  isRomanceEvent,
  isRomanticMatch,
  mutualAttraction,
  partnerAgeRange,
  romanceAllowed,
  romanceStatus,
} from './relationships';
import { createRng } from './rng';
import { getPeople, getPersonDetail } from './selectors';
import { ageNpcs } from './systems/people';
import { runPacing } from './systems/pacing';
import { runRelationships } from './systems/relationships';
import { cloneJson, lifeAtAge } from './testFixtures';
import type { GenderCategory, LifeState, Person, Relationship, RelationshipKind } from './types';

const ADULT = content.balance.relationships.adultAge;

interface PersonSpec {
  id: string;
  age: number;
  kind: RelationshipKind;
  category?: GenderCategory;
  attractedTo?: GenderCategory[];
  affection?: number;
  trust?: number;
  status?: Relationship['status'];
  alive?: boolean;
  kindSince?: number;
  memories?: Relationship['memories'];
}

/** Adds someone to a draft life (an adult woman attracted to men, unless told otherwise). */
function addPerson(d: LifeState, spec: PersonSpec): void {
  const category = spec.category ?? 'woman';
  const template = Object.values(d.people)[0]!;
  const person: Person = {
    ...cloneJson(template),
    id: spec.id,
    name: { first: `N${spec.id}`, last: 'Test' },
    birthYear: d.currentYear - spec.age,
    alive: spec.alive ?? true,
    identity: {
      ...cloneJson(template.identity),
      genderCategory: category,
      attractedTo: spec.attractedTo ?? ['man'],
    },
    tags: [],
  };
  if (spec.alive === false) person.deathYear = d.currentYear;
  else delete person.deathYear;
  d.people[spec.id] = person;
  const rel: Relationship = {
    personId: spec.id,
    kind: spec.kind,
    status: spec.status ?? 'active',
    affection: spec.affection ?? 60,
    trust: spec.trust ?? 60,
    memories: spec.memories ?? [],
    since: d.currentYear - Math.min(spec.age, 5),
  };
  if (spec.kind === 'spouse') rel.wasSpouse = true;
  if (spec.kindSince !== undefined) rel.kindSince = spec.kindSince;
  else if (['partner', 'fiance', 'spouse', 'ex'].includes(spec.kind)) rel.kindSince = d.currentYear;
  d.relationships[spec.id] = rel;
}

/** A life at `age` whose character is a man attracted to women, with these people added. */
function lifeWith(age: number, people: PersonSpec[], seed = 'rel'): LifeState {
  return produce(lifeAtAge(seed, age), (d) => {
    d.character.identity.genderCategory = 'man';
    d.character.identity.attractedTo = ['woman'];
    for (const spec of people) addPerson(d, spec);
  });
}

/** An event with test defaults; override anything. Cast roles default to presence anywhere (C1). */
function ev(overrides: Record<string, unknown>): EventDef {
  const cast = overrides.cast as Record<string, Record<string, unknown>> | undefined;
  if (cast) overrides = { ...overrides, cast: Object.fromEntries(Object.entries(cast).map(([r, s]) => [r, { presence: 'anywhere', ...s }])) };
  return eventSchema.parse({
    title: 'Test',
    text: 'Something happens.',
    tone: 'neutral',
    category: 'family',
    rarity: 'common',
    lifeStages: ['adult'],
    weight: { base: 10 },
    autoOutcome: { effects: [] },
    ...overrides,
  });
}

const withEvents = (...defs: EventDef[]): ContentBundle => ({ ...content, events: Object.fromEntries(defs.map((d) => [d.id, d])) });
const ctx = (cast: Record<string, string>, def = ev({ id: 'fx' })) => ({ def, cast, rng: createRng('fx'), content });

describe('two-way attraction', () => {
  it('needs attraction in both directions', () => {
    const life = lifeWith(30, [
      { id: 'both', age: 30, kind: 'friend' },
      { id: 'onlyYou', age: 30, kind: 'friend', attractedTo: ['woman'] },
      { id: 'onlyThem', age: 30, kind: 'friend', category: 'man', attractedTo: ['man'] },
      { id: 'nobody', age: 30, kind: 'friend', attractedTo: [] },
    ]);
    expect(mutualAttraction(life, life.people.both!)).toBe(true);
    expect(mutualAttraction(life, life.people.onlyYou!)).toBe(false);
    expect(mutualAttraction(life, life.people.onlyThem!)).toBe(false);
    expect(mutualAttraction(life, life.people.nobody!)).toBe(false);
  });

  it('never matches family, minors or the dead', () => {
    const life = lifeWith(30, [
      { id: 'sis', age: 28, kind: 'sibling' },
      { id: 'young', age: 17, kind: 'acquaintance' },
      { id: 'gone', age: 30, kind: 'friend', alive: false },
      { id: 'ok', age: 18, kind: 'acquaintance' },
    ]);
    expect(isRomanticMatch(life, life.people.sis!, content)).toBe(false);
    expect(isRomanticMatch(life, life.people.young!, content)).toBe(false);
    expect(isRomanticMatch(life, life.people.gone!, content)).toBe(false);
    expect(isRomanticMatch(life, life.people.ok!, content)).toBe(true);
    const teen = lifeWith(17, [{ id: 'adult', age: 20, kind: 'acquaintance' }]);
    expect(isRomanticMatch(teen, teen.people.adult!, content)).toBe(false);
  });

  it('romantic roles only cast people who match both ways', () => {
    const life = lifeWith(30, [
      { id: 'a', age: 30, kind: 'acquaintance', attractedTo: ['woman'] },
      { id: 'b', age: 30, kind: 'acquaintance' },
      { id: 'c', age: 16, kind: 'acquaintance' },
    ]);
    expect(castCandidates(life, { kind: 'acquaintance', romantic: true, presence: 'city' }, content).map((p) => p.id)).toEqual(['b']);
  });

  it('the meeting pool creates adults who are attracted to you, of a gender you are attracted to', () => {
    const def = ev({ id: 'meet', category: 'romance', cast: { date: { kind: 'acquaintance', romantic: true, createIfMissing: true, newChance: 1 } } });
    const orientations: [GenderCategory, GenderCategory[]][] = [
      ['man', ['woman']],
      ['woman', ['woman']],
      ['nonbinary', ['man', 'nonbinary']],
      ['woman', ['man', 'woman', 'nonbinary']],
    ];
    for (const [category, attractedTo] of orientations) {
      for (let i = 0; i < 40; i++) {
        const life = cloneJson(
          produce(lifeAtAge(`pool-${i}`, 20 + i), (d) => {
            d.character.identity.genderCategory = category;
            d.character.identity.attractedTo = attractedTo;
          }),
        );
        const result = castEvent(life, def, createRng(`pool-${i}`), content)!;
        const person = life.people[result.cast.date!]!;
        expect(attractedTo).toContain(person.identity.genderCategory);
        expect(person.identity.attractedTo).toContain(category);
        const range = partnerAgeRange(life.character.age, content);
        const age = life.currentYear - person.birthYear;
        expect(age).toBeGreaterThanOrEqual(Math.max(ADULT, range.min));
        expect(age).toBeLessThanOrEqual(range.max);
        expect(checkInvariants(life, content)).toEqual([]);
      }
    }
  });

  it('meets partners of a plausible age, relative to yours (balance/relationships.yaml)', () => {
    const { younger, older } = content.balance.relationships.meeting;
    // The balance points themselves.
    for (const point of younger) expect(partnerAgeRange(point.at, content).min).toBe(Math.max(ADULT, point.at - Math.round(point.x)));
    for (const point of older) expect(partnerAgeRange(point.at, content).max).toBe(point.at + Math.round(point.x));
    // Never younger than the adult age; the range only widens with age; minors get none.
    for (let age = ADULT; age <= 100; age++) {
      const range = partnerAgeRange(age, content);
      expect(range.min).toBeGreaterThanOrEqual(ADULT);
      expect(range.min).toBeLessThanOrEqual(age);
      expect(range.max).toBeGreaterThanOrEqual(age);
      if (age > ADULT) expect(range.max - range.min).toBeGreaterThanOrEqual(partnerAgeRange(age - 1, content).max - partnerAgeRange(age - 1, content).min - 1);
    }
    const minor = partnerAgeRange(ADULT - 1, content);
    expect(minor.min).toBeGreaterThan(minor.max);
    // An event's own ages narrow the range further; with no overlap, nobody is created.
    const narrow = ev({ id: 'narrow', cast: { date: { kind: 'acquaintance', romantic: true, createIfMissing: true, newChance: 1, age: { min: 80, max: 90 } } } });
    expect(castEvent(cloneJson(lifeAtAge('narrow', 25)), narrow, createRng('n'), content)).toBeNull();
    // Across many new people at ages 18–80, every one is inside the range.
    const def = ev({ id: 'meet', cast: { date: { kind: 'acquaintance', romantic: true, createIfMissing: true, newChance: 1 } } });
    for (let age = ADULT; age <= 80; age += 3) {
      for (let s = 0; s < 10; s++) {
        const life = cloneJson(lifeWith(age, [], `range-${s}`));
        const id = castEvent(life, def, createRng(`range-${age}-${s}`), content)!.cast.date!;
        const theirs = life.currentYear - life.people[id]!.birthYear;
        const range = partnerAgeRange(age, content);
        expect(theirs, `at ${age}`).toBeGreaterThanOrEqual(range.min);
        expect(theirs, `at ${age}`).toBeLessThanOrEqual(range.max);
      }
    }
  });

  it('creates no one for someone attracted to nobody, or for a minor', () => {
    const def = ev({ id: 'meet', cast: { date: { kind: 'acquaintance', romantic: true, createIfMissing: true, newChance: 1 } } });
    const aro = cloneJson(produce(lifeAtAge('aro', 30), (d) => void (d.character.identity.attractedTo = [])));
    expect(castEvent(aro, def, createRng('x'), content)).toBeNull();
    expect(castEvent(cloneJson(lifeAtAge('minor', 16)), def, createRng('x'), content)).toBeNull();
  });
});

describe('adults-only romance', () => {
  const date = ev({ id: 'date', category: 'romance', cast: { p: { kind: 'friend' } } });
  const sneaky = ev({
    id: 'sneaky',
    category: 'family',
    cast: { p: { kind: 'friend' } },
    autoOutcome: { effects: [{ type: 'relationship', role: 'p', kind: 'partner' }] },
  });

  it('knows a romance event by its category, its roles or its effects', () => {
    expect(isRomanceEvent(date, content)).toBe(true);
    expect(isRomanceEvent(sneaky, content)).toBe(true);
    expect(isRomanceEvent(ev({ id: 'x', cast: { s: { kind: 'spouse' } } }), content)).toBe(true);
    expect(isRomanceEvent(ev({ id: 'y', cast: { f: { kind: 'friend', romantic: true } } }), content)).toBe(true);
    expect(isRomanceEvent(ev({ id: 'z', cast: { f: { kind: 'friend' } } }), content)).toBe(false);
  });

  it('gives romance events no weight before the adult age, even without requirements', () => {
    for (const def of [date, sneaky]) {
      expect(eventWeight(lifeWith(ADULT - 1, []), def, withEvents(def))).toBe(0);
      expect(eventWeight(lifeWith(ADULT, []), def, withEvents(def))).toBeGreaterThan(0);
    }
  });

  it('blocks a romance event that would cast a minor, even when you are an adult', () => {
    const life = lifeWith(ADULT, [{ id: 'kid', age: ADULT - 2, kind: 'friend' }]);
    expect(romanceAllowed(life, date, { p: 'kid' }, content)).toBe(false);
    const bundle = withEvents(date);
    for (let i = 0; i < 20; i++) {
      const after = produce(life, (d) => {
        d.rng = createRng(`minor-${i}`);
        runPacing(d, bundle);
      });
      expect(after.pending.map((p) => p.eventId)).not.toContain('date');
    }
    const grown = lifeWith(ADULT, [{ id: 'adult', age: ADULT + 2, kind: 'friend' }]);
    expect(romanceAllowed(grown, date, { p: 'adult' }, content)).toBe(true);
  });

  it('refuses to make a minor anyone’s partner, whatever the content says', () => {
    const young = lifeWith(ADULT, [{ id: 'kid', age: ADULT - 1, kind: 'friend' }]);
    const tried = produce(young, (d) => applyEffects(d, [{ type: 'relationship', role: 'p', kind: 'partner', affection: 5 }], ctx({ p: 'kid' })));
    expect(tried.relationships.kid!.kind).toBe('friend');
    expect(tried.relationships.kid!.affection).toBe(65);
    const teen = lifeWith(ADULT - 1, [{ id: 'adult', age: 25, kind: 'friend' }]);
    const tried2 = produce(teen, (d) => applyEffects(d, [{ type: 'relationship', role: 'p', kind: 'partner' }], ctx({ p: 'adult' })));
    expect(tried2.relationships.adult!.kind).toBe('friend');
  });

  it('offers no romance actions to or with a minor', () => {
    const teen = lifeWith(ADULT - 1, [{ id: 'adult', age: 25, kind: 'acquaintance' }]);
    expect(isActionAvailable(teen, 'ask_out', 'adult', content)).toBe(false);
    const adult = lifeWith(ADULT, [{ id: 'kid', age: ADULT - 1, kind: 'acquaintance' }]);
    expect(isActionAvailable(adult, 'ask_out', 'kid', content)).toBe(false);
    expect(() => performAction(adult, 'ask_out', { personId: 'kid' }, content)).toThrow(InvalidInputError);
  });

  it('every romance event in the content requires adults', () => {
    for (const def of Object.values(content.events)) {
      if (!isRomanceEvent(def, content)) continue;
      expect(evaluate(def.requires, lifeWith(ADULT - 1, []), { roles: 'assumeTrue' }), def.id).toBe(false);
    }
  });
});

describe('relationship changes', () => {
  it('allow only one partner at a time, so no one is married to two people', () => {
    const life = lifeWith(35, [
      { id: 'wife', age: 34, kind: 'spouse' },
      { id: 'other', age: 30, kind: 'fiance' },
      { id: 'friend', age: 30, kind: 'friend' },
    ]);
    // The fixture itself breaks the rule; the invariants say so.
    expect(checkInvariants(life, content).join('\n')).toMatch(/2 current partners/);

    const married = lifeWith(35, [
      { id: 'wife', age: 34, kind: 'spouse' },
      { id: 'friend', age: 30, kind: 'friend' },
    ]);
    expect(canChangeKind(married, 'friend', 'partner', content)).toBe(false);
    expect(canChangeKind(married, 'friend', 'spouse', content)).toBe(false);
    const after = produce(married, (d) => applyEffects(d, [{ type: 'relationship', role: 'p', kind: 'spouse' }], ctx({ p: 'friend' })));
    expect(after.relationships.friend!.kind).toBe('friend');
    expect(checkInvariants(after, content)).toEqual([]);
  });

  it('follow dating → engaged → married → divorced, never skipping into an engagement', () => {
    const life = lifeWith(30, [{ id: 'p', age: 29, kind: 'friend' }]);
    expect(canChangeKind(life, 'p', 'fiance', content)).toBe(false);
    expect(canChangeKind(life, 'p', 'ex', content)).toBe(false);
    let state = life;
    for (const kind of ['partner', 'fiance', 'spouse', 'ex'] as const) {
      expect(canChangeKind(state, 'p', kind, content)).toBe(true);
      state = produce(state, (d) => applyEffects(d, [{ type: 'relationship', role: 'p', kind }], ctx({ p: 'p' })));
      expect(state.relationships.p!.kind).toBe(kind);
      expect(state.relationships.p!.kindSince).toBe(state.currentYear);
      // Only a wedding marks someone as having been your spouse, and it stays after the divorce.
      expect(state.relationships.p!.wasSpouse).toBe(kind === 'spouse' || kind === 'ex' ? true : undefined);
      expect(checkInvariants(state, content)).toEqual([]);
    }
    expect(romanceStatus(state)).toBe('single');
    expect(getPeople(state).romance.find((r) => r.id === 'p')).toMatchObject({ kind: 'ex', wasSpouse: true });
    // An ex you only dated was never your spouse.
    const dated = produce(lifeWith(30, [{ id: 'q', age: 29, kind: 'partner' }]), (d) =>
      applyEffects(d, [{ type: 'relationship', role: 'p', kind: 'ex' }], ctx({ p: 'q' })),
    );
    expect(dated.relationships.q!.wasSpouse).toBeUndefined();
    // A spouse without the mark breaks an invariant.
    const unmarked = produce(lifeWith(30, [{ id: 'w', age: 29, kind: 'spouse' }]), (d) => void delete d.relationships.w!.wasSpouse);
    expect(checkInvariants(unmarked, content).join('\n')).toMatch(/spouse without wasSpouse/);
  });

  it('never make family romantic, and a current partner can’t be estranged', () => {
    const life = lifeWith(30, [
      { id: 'mom', age: 55, kind: 'parent' },
      { id: 'gf', age: 29, kind: 'partner' },
    ]);
    expect(canChangeKind(life, 'mom', 'partner', content)).toBe(false);
    const after = produce(life, (d) => applyEffects(d, [{ type: 'relationship', role: 'p', status: 'estranged' }], ctx({ p: 'gf' })));
    expect(after.relationships.gf!.status).toBe('active');
  });

  it('let you marry again once your spouse has died, and write the death to history', () => {
    let life = lifeWith(70, [
      { id: 'wife', age: 119, kind: 'spouse' },
      { id: 'friend', age: 68, kind: 'friend' },
    ]);
    life = produce(life, (d) => {
      // Past the maximum age, so the year's NPC step is sure to end her life.
      d.people.wife!.birthYear = d.currentYear - content.balance.mortality.maxAge;
      d.currentYear += 1;
      d.character.age += 1;
      d.inputLog.push({ year: d.currentYear - 1, kind: 'ageUp', payload: {} });
      d.recap = { year: d.currentYear, age: d.character.age, statsBefore: d.character.stats, statsAfter: d.character.stats };
      d.lifetime.years += 1;
      ageNpcs(d, content);
    });
    expect(life.people.wife!.alive).toBe(false);
    expect(life.history.at(-1)!.text).toContain('wife');
    expect(currentPartner(life)).toBeNull();
    expect(romanceStatus(life)).toBe('single');
    expect(canChangeKind(life, 'friend', 'partner', content)).toBe(true);
    expect(checkInvariants(life, content)).toEqual([]);
  });
});

describe('management actions', () => {
  const people: PersonSpec[] = [
    { id: 'mom', age: 55, kind: 'stepparent' },
    { id: 'acq', age: 29, kind: 'acquaintance' },
    { id: 'pal', age: 29, kind: 'friend', category: 'man', attractedTo: ['woman'] },
    { id: 'foe', age: 29, kind: 'friend', status: 'estranged' },
    { id: 'gone', age: 60, kind: 'friend', alive: false },
  ];
  const ids = (life: LifeState, personId: string) => availableActions(life, personId, content).map((a) => a.id);

  it('appear only when valid, and the dead have none', () => {
    const life = lifeWith(30, people);
    expect(ids(life, 'mom')).toEqual(['cut_contact']);
    expect(ids(life, 'acq')).toEqual(['ask_out', 'cut_contact']);
    expect(ids(life, 'pal')).toEqual(['cut_contact']);
    expect(ids(life, 'foe')).toEqual(['reconcile']);
    expect(ids(life, 'gone')).toEqual([]);
    expect(ids(life, 'nobody')).toEqual([]);
    const young = lifeWith(15, people.map((p) => ({ ...p, age: Math.min(p.age, 15) })).filter((p) => p.id !== 'mom'));
    expect(ids(young, 'acq')).toEqual(['cut_contact']);
    const child = lifeWith(10, [{ id: 'mom', age: 40, kind: 'stepparent' }, { id: 'kid', age: 10, kind: 'friend' }]);
    expect(ids(child, 'mom')).toEqual([]);
    expect(ids(child, 'kid')).toEqual([]);
  });

  it('follow the partner rules: propose after a year together, marry after a year engaged, one partner at a time', () => {
    const year = lifeAtAge('rel', 30).currentYear;
    const dating = lifeWith(30, [...people, { id: 'gf', age: 30, kind: 'partner', kindSince: year }]);
    // Moving in together is open to any current partner who doesn't live with you yet.
    expect(ids(dating, 'gf')).toEqual(['move_in', 'break_up']);
    expect(ids(dating, 'acq')).toEqual(['cut_contact']);
    const longer = lifeWith(30, [{ id: 'gf', age: 30, kind: 'partner', kindSince: year - 1 }]);
    expect(ids(longer, 'gf')).toEqual(['propose', 'move_in', 'break_up']);
    const engaged = lifeWith(30, [{ id: 'gf', age: 30, kind: 'fiance', kindSince: year - 1 }]);
    expect(ids(engaged, 'gf')).toEqual(['move_in', 'marry', 'break_up']);
    const married = lifeWith(30, [{ id: 'w', age: 30, kind: 'spouse', kindSince: year - 3 }]);
    expect(ids(married, 'w')).toEqual(['move_in', 'divorce']);
    const together = produce(married, (d) => {
      d.housing = { kind: 'renting', cityId: d.character.cityId, annualCost: 0, since: d.currentYear, partnerId: 'w' };
    });
    expect(ids(together, 'w')).toEqual(['divorce']);
    expect(availableActions(married, 'w', content).find((a) => a.id === 'divorce')!.irreversible).toBe(true);
  });

  it('are only taken between years, once per person per year', () => {
    const life = lifeWith(30, people);
    const begun = beginYear(life, content);
    expect(ids(begun, 'acq')).toEqual([]);
    expect(() => performAction(begun, 'ask_out', { personId: 'acq' }, content)).toThrow(PhaseError);
    const acted = finishAction(resolveChoice(performAction(life, 'cut_contact', { personId: 'pal' }, content), `a${life.currentYear}-${life.inputLog.length + 1}`, 'block', content));
    expect(ids(acted, 'pal')).toEqual([]);
    expect(ids(acted, 'acq')).toEqual(['ask_out', 'cut_contact']);
  });

  it('validate their input', () => {
    const life = lifeWith(30, people);
    expect(() => performAction(life, 'fly', { personId: 'acq' }, content)).toThrow(InvalidInputError);
    expect(() => performAction(life, 'ask_out', {}, content)).toThrow(InvalidInputError);
    expect(() => performAction(life, 'ask_out', null, content)).toThrow(InvalidInputError);
    expect(() => performAction(life, 'divorce', { personId: 'acq' }, content)).toThrow(InvalidInputError);
  });

  it('queue a result event through the event engine and record the input', () => {
    const life = lifeWith(30, people);
    const acted = performAction(life, 'ask_out', { personId: 'acq' }, content);
    expect(acted.phase).toBe('action');
    expect(acted.pending).toHaveLength(1);
    expect(acted.pending[0]!.cast).toEqual({ person: 'acq' });
    expect(content.registries.actions.actions.ask_out.events).toContain(acted.pending[0]!.eventId);
    expect(acted.inputLog.at(-1)).toEqual({ year: life.currentYear, kind: 'action', payload: { actionId: 'ask_out', params: { personId: 'acq' } } });
    expect(acted.relationships.acq!.lastActionYear).toBe(life.currentYear);
    expect(checkInvariants(acted, content)).toEqual([]);
    expect(() => beginYear(acted, content)).toThrow(PhaseError);
    expect(() => finishAction(acted)).toThrow(InvalidInputError);

    const resolved = resolveChoice(acted, acted.pending[0]!.instanceId, 'coffee', content);
    expect(resolved.phase).toBe('action');
    expect(resolved.pending[0]!.outcomeText).toBeTruthy();
    const done = finishAction(resolved);
    expect(done.phase).toBe('yearStart');
    expect(done.pending).toEqual([]);
    expect(checkInvariants(done, content)).toEqual([]);
    expect(() => finishAction(done)).toThrow(PhaseError);
  });

  it('replay identically for the same seed and inputs', () => {
    const run = () => playAction(lifeWith(30, people), content, 'ask_out', 'acq', createRng('same'));
    expect(run()).toEqual(run());
  });
});

describe('dating to marriage to divorce through actions', () => {
  /** Plays an action, always picking the given choice (or Continue). */
  function act(life: LifeState, actionId: Parameters<typeof performAction>[1], personId: string, choice: string, bundle: ContentBundle): LifeState {
    const acted = performAction(life, actionId, { personId }, bundle);
    return finishAction(resolveChoice(acted, acted.pending[0]!.instanceId, choice, bundle));
  }
  /** Just the always-successful answers, so the path is certain. */
  const sure = (id: string, kind: string, effects: unknown[]) =>
    ev({ id, category: 'romance', requires: { age: { gte: 18 } }, followUpOnly: true, cast: { person: { kind } }, autoOutcome: { effects } });
  // Only these events, so the years in between are quiet and nothing else changes the couple.
  const bundle: ContentBundle = {
    ...content,
    events: {
      t_ask: sure('t_ask', 'acquaintance', [{ type: 'relationship', role: 'person', kind: 'partner' }, { type: 'memory', role: 'person', tag: 'started_dating' }]),
      t_propose: sure('t_propose', 'partner', [{ type: 'relationship', role: 'person', kind: 'fiance' }]),
      t_marry: sure('t_marry', 'fiance', [{ type: 'relationship', role: 'person', kind: 'spouse' }, { type: 'memory', role: 'person', tag: 'married_you' }]),
      t_divorce: sure('t_divorce', 'spouse', [{ type: 'relationship', role: 'person', kind: 'ex' }, { type: 'memory', role: 'person', tag: 'divorced' }]),
      t_break: sure('t_break', 'partner', [{ type: 'relationship', role: 'person', kind: 'ex' }]),
    },
    registries: {
      ...content.registries,
      actions: {
        actions: {
          ...content.registries.actions.actions,
          ask_out: { events: ['t_ask'] },
          propose: { events: ['t_propose'] },
          marry: { events: ['t_marry'] },
          divorce: { events: ['t_divorce'] },
          break_up: { events: ['t_break'] },
        },
      },
    },
  };
  const nextYear = (life: LifeState) => endYear(resolveAllContinue(beginYear(life, bundle)), bundle);
  function resolveAllContinue(life: LifeState): LifeState {
    let current = life;
    while (current.phase === 'events') {
      const p = current.pending.find((x) => x.resolvedChoiceId === undefined)!;
      const def = bundle.events[p.eventId]!;
      current = resolveChoice(current, p.instanceId, def.choices ? def.choices[0]!.id : CONTINUE_CHOICE, bundle);
    }
    return current;
  }

  it('updates both sides at every step and keeps every invariant', () => {
    let life = lifeWith(25, [{ id: 'amy', age: 25, kind: 'acquaintance', affection: 70 }], 'marriage');
    life = act(life, 'ask_out', 'amy', CONTINUE_CHOICE, bundle);
    expect(life.relationships.amy!.kind).toBe('partner');
    expect(romanceStatus(life)).toBe('dating');
    life = nextYear(life);
    expect(life.phase).not.toBe('dead');
    life = act(life, 'propose', 'amy', CONTINUE_CHOICE, bundle);
    expect(romanceStatus(life)).toBe('engaged');
    life = nextYear(life);
    expect(life.phase).not.toBe('dead');
    life = act(life, 'marry', 'amy', CONTINUE_CHOICE, bundle);
    expect(life.relationships.amy!.kind).toBe('spouse');
    expect(romanceStatus(life)).toBe('married');
    expect(currentPartner(life)?.personId).toBe('amy');
    expect(getPeople(life).romance.map((r) => [r.id, r.kind, r.current])).toEqual([['amy', 'spouse', true]]);
    expect(checkInvariants(life, content)).toEqual([]);
    // One action per person per year: the divorce waits a year.
    expect(availableActions(life, 'amy', bundle)).toEqual([]);
    life = nextYear(life);
    expect(life.phase).not.toBe('dead');

    life = act(life, 'divorce', 'amy', CONTINUE_CHOICE, bundle);
    // Your side: single, no partner. Their side: an ex, still in your life.
    expect(romanceStatus(life)).toBe('single');
    expect(currentPartner(life)).toBeNull();
    expect(life.relationships.amy).toMatchObject({ kind: 'ex', status: 'active', kindSince: life.currentYear });
    expect(getPeople(life).romance.map((r) => [r.id, r.kind, r.current])).toEqual([['amy', 'ex', false]]);
    expect(getPersonDetail(life, 'amy', bundle)!.memories.map((m) => m.text)).toEqual(['Divorced you', 'Married you', 'Started dating you']);
    expect(checkInvariants(life, content)).toEqual([]);
    // Next year, you could ask your ex out again.
    life = nextYear(life);
    expect(availableActions(life, 'amy', bundle).map((a) => a.id)).toContain('ask_out');
  });

  it('a breakup makes an ex and leaves you single', () => {
    let life = lifeWith(25, [{ id: 'amy', age: 25, kind: 'acquaintance' }], 'breakup');
    life = act(life, 'ask_out', 'amy', CONTINUE_CHOICE, bundle);
    life = nextYear(life);
    expect(life.phase).not.toBe('dead');
    life = act(life, 'break_up', 'amy', CONTINUE_CHOICE, bundle);
    expect(life.relationships.amy!.kind).toBe('ex');
    expect(romanceStatus(life)).toBe('single');
    expect(checkInvariants(life, content)).toEqual([]);
  });

  it('puts a spouse in the obituary', () => {
    let life = lifeWith(25, [{ id: 'amy', age: 25, kind: 'acquaintance' }], 'obit');
    life = act(life, 'ask_out', 'amy', CONTINUE_CHOICE, bundle);
    life = produce(life, (d) => {
      d.relationships.amy!.kind = 'spouse';
      d.relationships.amy!.wasSpouse = true;
    });
    const dead = produce(life, (d) => {
      d.phase = 'dead';
      d.death = { year: d.currentYear, age: d.character.age, causeId: 'natural_causes' };
    });
    expect(writeObituary(dead, content)).toContain('his wife Namy');
  });
});

describe('drift', () => {
  const drifted = (life: LifeState, years = 1) => {
    let state = life;
    for (let i = 0; i < years; i++) {
      state = produce(state, (d) => {
        d.currentYear += 1;
        runRelationships(d, content);
      });
    }
    return state;
  };

  it('slowly lowers affection with people you made no memories with, down to a floor', () => {
    const { floor } = content.balance.relationships.drift;
    const life = lifeWith(40, [
      { id: 'mom', age: 65, kind: 'parent', affection: 90 },
      { id: 'pal', age: 40, kind: 'friend', affection: 90 },
      { id: 'wife', age: 40, kind: 'spouse', affection: 90 },
    ]);
    const later = drifted(life, 200);
    expect(later.relationships.mom!.affection).toBe(floor.parent);
    expect(later.relationships.wife!.affection).toBe(floor.spouse);
    const once = drifted(life, 1);
    for (const id of ['mom', 'pal', 'wife']) {
      expect(once.relationships[id]!.affection).toBeLessThanOrEqual(90);
      expect(once.relationships[id]!.affection).toBeGreaterThanOrEqual(90 - 3);
    }
  });

  it('spares recent memories, estranged people and the dead, and never leaves 0–100', () => {
    const life = lifeWith(40, [
      { id: 'recent', age: 40, kind: 'friend', affection: 80, memories: [{ tag: 'kept_in_touch', year: lifeAtAge('rel', 40).currentYear }] },
      { id: 'cold', age: 40, kind: 'sibling', affection: 50, status: 'estranged' },
      { id: 'zero', age: 40, kind: 'acquaintance', affection: 0 },
      { id: 'full', age: 40, kind: 'friend', affection: 100, trust: 100 },
      { id: 'low', age: 40, kind: 'sibling', affection: 1 },
    ]);
    const next = drifted(life, 1);
    expect(next.relationships.recent!.affection).toBe(80);
    expect(next.relationships.cold!.affection).toBe(50);
    for (let s = 0; s < 50; s++) {
      const state = drifted(produce(life, (d) => void (d.rng = createRng(`drift-${s}`))), 30);
      for (const rel of Object.values(state.relationships)) {
        expect(Number.isInteger(rel.affection) && rel.affection >= 0 && rel.affection <= 100).toBe(true);
        expect(Number.isInteger(rel.trust) && rel.trust >= 0 && rel.trust <= 100).toBe(true);
      }
    }
    // Below a floor, drift never pushes further down (and never up).
    expect(drifted(life, 5).relationships.low!.affection).toBe(1);
  });

  it('is gentler for kind people', () => {
    const loss = (kindness: number) => {
      let total = 0;
      for (let s = 0; s < 40; s++) {
        const life = produce(lifeWith(40, [{ id: 'pal', age: 40, kind: 'friend', affection: 90 }]), (d) => {
          d.character.personality.kindness = kindness;
          d.rng = createRng(`k-${s}`);
        });
        total += 90 - drifted(life, 10).relationships.pal!.affection;
      }
      return total;
    };
    expect(loss(100)).toBeLessThan(loss(0));
  });
});

describe('pruning', () => {
  it('lets forgettable acquaintances, faded friends and the dead (but not dead friends) fade out', () => {
    const year = lifeAtAge('rel', 40).currentYear;
    const life = lifeWith(40, [
      { id: 'old_acq', age: 40, kind: 'acquaintance', affection: 60 },
      { id: 'faded', age: 40, kind: 'friend', affection: 5 },
      { id: 'dead_acq', age: 40, kind: 'acquaintance', alive: false },
      { id: 'dead_friend', age: 40, kind: 'friend', alive: false },
      { id: 'mom', age: 70, kind: 'parent', affection: 2 },
      { id: 'ex', age: 40, kind: 'ex', affection: 2, kindSince: year - 10 },
      { id: 'pal', age: 40, kind: 'friend', affection: 70 },
    ]);
    // The step reads the life as earlier steps left it, so the setup is its own step.
    const setUp = produce(life, (d) => void (d.relationships.old_acq!.since = year - 10));
    const aged = produce(setUp, (d) => runRelationships(d, content));
    expect(aged.relationships.old_acq!.status).toBe('ended');
    expect(aged.relationships.faded!.status).toBe('ended');
    expect(aged.relationships.dead_acq!.status).toBe('ended');
    expect(aged.relationships.dead_friend!.status).toBe('active');
    expect(aged.relationships.mom!.status).toBe('active');
    expect(aged.relationships.ex!.status).toBe('active');
    expect(aged.relationships.pal!.status).toBe('active');
    const groups = getPeople(aged);
    expect(groups.friends.map((r) => r.id)).toEqual(['pal', 'dead_friend']);
    expect(groups.family.map((r) => r.id)).toContain('mom');
  });

  it('caps the number of people outside family and romance, dropping the least close first', () => {
    const { maxPeople } = content.balance.relationships.prune;
    const extra = Array.from({ length: maxPeople + 5 }, (_, i): PersonSpec => ({
      id: `q${String(i).padStart(3, '0')}`,
      age: 30,
      kind: i < 10 ? 'acquaintance' : 'friend',
      affection: 40 + (i % 50),
      memories: [{ tag: 'kept_in_touch', year: lifeAtAge('rel', 30).currentYear }],
    }));
    const life = produce(lifeWith(30, extra), (d) => runRelationships(d, content));
    const active = Object.values(life.relationships).filter((r) => (r.kind === 'friend' || r.kind === 'acquaintance') && r.status === 'active');
    expect(active).toHaveLength(maxPeople);
    const ended = Object.values(life.relationships).filter((r) => r.status === 'ended');
    expect(ended.every((r) => r.kind === 'acquaintance')).toBe(true);
  });
});

describe('support in a crisis', () => {
  const crisis = ev({
    id: 'crisis',
    cast: { helper: { support: true, optional: true } },
    choices: [
      { id: 'call', label: 'Call {helper.name}', visibleIf: { role: 'helper' }, outcome: { effects: [{ type: 'memory', role: 'helper', tag: 'stood_by_you' }] } },
      { id: 'alone', label: 'Alone', outcome: {} },
    ],
    autoOutcome: undefined,
  });
  const { minTrust, minAffection } = content.balance.relationships.support;

  it('casts the most trusted close person who would step in', () => {
    const base = produce(lifeWith(40, []), (d) => {
      for (const rel of Object.values(d.relationships)) rel.trust = 0;
    });
    const life = produce(base, (d) => {
      for (const spec of [
      { id: 'mom', age: 65, kind: 'parent', trust: minTrust + 5, affection: 80 },
      { id: 'best', age: 40, kind: 'friend', trust: minTrust + 20, affection: 80 },
      { id: 'cold', age: 40, kind: 'friend', trust: 99, affection: minAffection - 1 },
      { id: 'ex', age: 40, kind: 'ex', trust: 99, affection: 99 },
      { id: 'estranged', age: 40, kind: 'sibling', trust: 99, affection: 99, status: 'estranged' },
      { id: 'gone', age: 40, kind: 'friend', trust: 100, affection: 100, alive: false },
      ] as PersonSpec[])
        addPerson(d, spec);
    });
    expect(castCandidates(life, { support: true, presence: 'anywhere' }, content).map((p) => p.id)).toEqual(['best', 'mom']);
    const result = castEvent(cloneJson(life), crisis, createRng('s'), content)!;
    expect(result.cast).toEqual({ helper: 'best' });
  });

  it('leaves the role empty when nobody would, hiding the choices that need them', () => {
    const life = produce(lifeWith(40, []), (d) => {
      for (const rel of Object.values(d.relationships)) rel.trust = minTrust - 1;
    });
    const result = castEvent(cloneJson(life), crisis, createRng('s'), content)!;
    expect(result.cast).toEqual({});
    const pending = produce(beginYear(life, withEvents(crisis)), (d) => {
      d.pending = [{ instanceId: 'x', eventId: 'crisis', cast: {} }];
      d.phase = 'events';
    });
    expect(() => resolveChoice(pending, 'x', 'call', withEvents(crisis))).toThrow(/not a choice/);
    expect(resolveChoice(pending, 'x', 'alone', withEvents(crisis)).phase).toBe('yearEnd');
  });
});

describe('conditions and checks about relationships', () => {
  it('check your romantic status and a cast person’s kind, status and years together', () => {
    const year = lifeAtAge('rel', 40).currentYear;
    const life = lifeWith(40, [
      { id: 'w', age: 40, kind: 'spouse', kindSince: year - 12 },
      { id: 'f', age: 40, kind: 'friend', status: 'estranged' },
    ]);
    expect(evaluate({ romance: ['married'] }, life)).toBe(true);
    expect(evaluate({ romance: ['single', 'dating'] }, life)).toBe(false);
    const cast = { cast: { s: 'w', f: 'f' }, roles: 'strict' as const };
    expect(evaluate({ role: 's', kind: ['spouse'], years: { gte: 12 } }, life, cast)).toBe(true);
    expect(evaluate({ role: 's', years: { gt: 12 } }, life, cast)).toBe(false);
    expect(evaluate({ role: 'f', status: ['estranged'] }, life, cast)).toBe(true);
    expect(evaluate({ role: 'f', kind: ['spouse'] }, life, cast)).toBe(false);
  });

  it('let a chance check read how a cast person feels about you', () => {
    const check = {
      base: 50,
      stats: [{ role: 'p', key: 'affection' as const, weight: 0.5 }],
      success: { effects: [] },
      failure: { effects: [] },
    };
    const life = produce(lifeWith(40, [{ id: 'p', age: 40, kind: 'friend', affection: 90 }]), (d) => void (d.character.hidden.luck = 50));
    expect(successChance(life, check, content, { p: 'p' })).toBeCloseTo(0.7);
    expect(successChance(life, check, content, {})).toBeCloseTo(0.5);
  });
});

describe('relationship content', () => {
  it('has at least 5 events that check memories', () => {
    const mentions = (value: unknown): boolean =>
      typeof value === 'object' && value !== null && ('memory' in value || Object.values(value).some(mentions));
    const checking = Object.values(content.events).filter(
      (def) => mentions(def.requires ?? {}) || (def.choices ?? []).some((c) => mentions(c.visibleIf ?? {})) || (def.weight.modifiers ?? []).some((m) => mentions(m.if)),
    );
    expect(checking.length).toBeGreaterThanOrEqual(5);
  });

  it('renders every memory for she/her, he/him, they/them and xe/xem', () => {
    for (const presetId of ['she_her', 'he_him', 'they_them', 'xe_xem']) {
      const preset = content.pronouns[presetId]!;
      const life = produce(lifeWith(40, [{ id: 'p', age: 40, kind: 'friend' }]), (d) => {
        d.people.p!.identity.pronouns = { ...preset };
        d.relationships.p!.memories = Object.keys(content.registries.memories.tags).map((tag) => ({ tag, year: d.currentYear }));
      });
      for (const m of getPersonDetail(life, 'p', content)!.memories) {
        expect(m.text).not.toMatch(/[{}]/);
        if (presetId === 'xe_xem') expect(m.text).not.toMatch(/\b(he|she|him|her|his|hers)\b/i);
      }
    }
  });
});

describe('whole lives with relationships', () => {
  it('play out with actions and keep every invariant', () => {
    for (let s = 0; s < 6; s++) {
      let life = createLife({ mode: 'random', seed: `rel-life-${s}`, birthYear: 2026 }, content);
      const choices = createRng(`rel-life-${s}:c`);
      const check = (l: LifeState) => expect(checkInvariants(l, content)).toEqual([]);
      while (life.phase !== 'dead') {
        for (const id of Object.keys(life.relationships).sort()) {
          const action = availableActions(life, id, content)[0];
          if (action && life.character.age % 3 === 0) life = playAction(life, content, action.id, id, choices, check);
        }
        life = playYear(life, content, { choices, onStep: check });
      }
    }
  });
});
