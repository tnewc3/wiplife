/**
 * C1 consistency: category contracts and presence (docs/expansion.md, C1).
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { castSpecSchema, eventSchema, type ContentBundle, type EventDef } from '../content/schemas';
import { isActionAvailable } from './actions';
import { evaluate } from './conditions';
import { castCandidates, castEvent, createPerson } from './events/casting';
import { applyEffects } from './events/effects';
import { checkInvariants } from './invariants';
import { consistencyProblems, fitsPresence, whereabouts } from './presence';
import { createRng } from './rng';
import { getEventCard } from './selectors';
import { runPacing } from './systems/pacing';
import { cloneJson, lifeAtAge } from './testFixtures';
import type { LifeState, Person, Relationship, RelationshipKind } from './types';

const AWAY = Object.keys(content.cities).sort().find((id) => !content.cities[id]!.retired && id !== 'chicago')!;

interface Spec {
  id: string;
  kind: RelationshipKind;
  age?: number;
  away?: boolean;
  trust?: number;
}

/** A life at `age` in Chicago, renting alone, with these people added (everyone else removed). */
function lifeWith(age: number, people: Spec[], change?: (d: LifeState) => void): LifeState {
  return produce(lifeAtAge('presence', age), (d) => {
    d.character.cityId = 'chicago';
    d.housing = { kind: 'renting', cityId: 'chicago', annualCost: 12000, since: d.currentYear };
    const template = Object.values(d.people)[0]!;
    d.people = {};
    d.relationships = {};
    d.scheduled = [];
    for (const s of people) {
      const person: Person = { ...cloneJson(template), id: s.id, birthYear: d.currentYear - (s.age ?? 30), alive: true, cityId: s.away ? AWAY : 'chicago', tags: [] };
      delete person.deathYear;
      d.people[s.id] = person;
      const rel: Relationship = { personId: s.id, kind: s.kind, status: 'active', affection: 80, trust: s.trust ?? 80, memories: [], since: d.currentYear - 5 };
      if (['partner', 'fiance', 'spouse'].includes(s.kind)) rel.kindSince = d.currentYear - 2;
      d.relationships[s.id] = rel;
    }
    change?.(d);
  });
}

function ev(overrides: Record<string, unknown>): EventDef {
  return eventSchema.parse({
    title: 'Test',
    text: 'Something happens.',
    tone: 'neutral',
    category: 'friends',
    rarity: 'common',
    lifeStages: ['adult'],
    weight: { base: 10 },
    autoOutcome: { effects: [] },
    ...overrides,
  });
}

const withEvents = (...defs: EventDef[]): ContentBundle => ({ ...content, events: Object.fromEntries(defs.map((d) => [d.id, d])) });

describe('whereabouts', () => {
  it('places a live-in partner in the household, others in the city, and anyone in another city elsewhere', () => {
    const life = lifeWith(30, [
      { id: 'spouse', kind: 'spouse' },
      { id: 'friend', kind: 'friend' },
      { id: 'far', kind: 'friend', away: true },
    ], (d) => {
      d.housing.partnerId = 'spouse';
    });
    expect(whereabouts(life, 'spouse', content)).toBe('household');
    expect(whereabouts(life, 'friend', content)).toBe('city');
    expect(whereabouts(life, 'far', content)).toBe('elsewhere');
  });

  it('counts parents and young siblings as household while you live with your parents', () => {
    const life = lifeWith(16, [
      { id: 'mom', kind: 'parent', age: 45 },
      { id: 'kid', kind: 'sibling', age: 12 },
      { id: 'grown', kind: 'sibling', age: 30 },
    ], (d) => {
      d.housing.kind = 'with_parents';
    });
    expect(whereabouts(life, 'mom', content)).toBe('household');
    expect(whereabouts(life, 'kid', content)).toBe('household');
    expect(whereabouts(life, 'grown', content)).toBe('city');
    const alone = produce(life, (d) => {
      d.housing.kind = 'renting';
    });
    expect(whereabouts(alone, 'mom', content)).toBe('city');
  });

  it('matches each presence', () => {
    const life = lifeWith(30, [{ id: 'spouse', kind: 'spouse' }, { id: 'friend', kind: 'friend' }, { id: 'far', kind: 'friend', away: true }], (d) => {
      d.housing.partnerId = 'spouse';
    });
    const fits = (id: string) => (['household', 'city', 'nearby', 'elsewhere', 'anywhere'] as const).filter((p) => fitsPresence(life, id, p, content));
    expect(fits('spouse')).toEqual(['household', 'nearby', 'anywhere']);
    expect(fits('friend')).toEqual(['city', 'nearby', 'anywhere']);
    expect(fits('far')).toEqual(['elsewhere', 'anywhere']);
  });
});

describe('presence-aware casting', () => {
  it('only casts people who are where the role needs them; never a live-in partner as a visitor', () => {
    const life = lifeWith(30, [{ id: 'spouse', kind: 'spouse' }, { id: 'near', kind: 'friend' }, { id: 'far', kind: 'friend', away: true }], (d) => {
      d.housing.partnerId = 'spouse';
    });
    const ids = (spec: Record<string, unknown>) => castCandidates(life, castSpecSchema.parse(spec), content).map((p) => p.id);
    expect(ids({ kind: 'friend', presence: 'city' })).toEqual(['near']);
    expect(ids({ kind: 'friend', presence: 'elsewhere' })).toEqual(['far']);
    expect(ids({ kind: 'friend', presence: 'anywhere' })).toEqual(['far', 'near']);
    expect(ids({ kind: 'spouse', presence: 'city' })).toEqual([]);
    expect(ids({ kind: 'spouse', presence: 'household' })).toEqual(['spouse']);
  });

  it('prefers a live-in partner for home and wellbeing support roles, otherwise the most trusted', () => {
    const life = lifeWith(30, [{ id: 'spouse', kind: 'spouse', trust: 70 }, { id: 'pal', kind: 'friend', trust: 95 }], (d) => {
      d.housing.partnerId = 'spouse';
    });
    const role = { support: true, presence: 'nearby' };
    for (const [category, expected] of [['home', 'spouse'], ['health', 'spouse'], ['friends', 'pal']] as const) {
      const def = ev({ id: `support_${category}`, category, cast: { helper: role } });
      expect(castEvent(cloneJson(life), def, createRng('s'), content)?.cast.helper).toBe(expected);
    }
  });

  it('creates new people in your city, or another city for a role elsewhere, and never creates a household member', () => {
    const life = lifeWith(30, []);
    produce(life, (d) => {
      const rng = createRng('new');
      const local = createPerson(d, { kind: 'friend', presence: 'city' }, rng, content)!;
      const far = createPerson(d, { kind: 'friend', presence: 'elsewhere' }, rng, content)!;
      expect(d.people[local]!.cityId).toBe('chicago');
      expect(d.people[far]!.cityId).not.toBe('chicago');
      expect(createPerson(d, { kind: 'friend', presence: 'household' }, rng, content)).toBeNull();
    });
  });
});

describe('moving away', () => {
  it('moves someone to another city, but not someone who lives with you', () => {
    const life = lifeWith(30, [{ id: 'spouse', kind: 'spouse' }, { id: 'pal', kind: 'friend' }], (d) => {
      d.housing.partnerId = 'spouse';
    });
    const after = produce(life, (d) => {
      const ctx = { def: ev({ id: 'fx' }), cast: { a: 'pal', b: 'spouse' }, rng: createRng('fx'), content };
      applyEffects(d, [{ type: 'moveAway', role: 'a' }, { type: 'moveAway', role: 'b' }], ctx);
    });
    expect(whereabouts(after, 'pal', content)).toBe('elsewhere');
    expect(whereabouts(after, 'spouse', content)).toBe('household');
  });
});

describe('role where conditions', () => {
  it('checks where the role is', () => {
    const life = lifeWith(30, [{ id: 'near', kind: 'friend' }, { id: 'far', kind: 'friend', away: true }]);
    const test = (id: string) => evaluate({ role: 'x', where: ['household', 'city'] }, life, { cast: { x: id }, roles: 'strict', content });
    expect(test('near')).toBe(true);
    expect(test('far')).toBe(false);
  });
});

describe('runtime enforcement', () => {
  const workEvent = ev({ id: 'work_thing', category: 'work', requires: { career: { employed: true, retired: false } } });
  const visit = ev({ id: 'visit', cast: { pal: { kind: 'friend', presence: 'city' } } });

  it('reports a pending event that breaks its category contract or a presence rule as an invariant failure', () => {
    const bundle = withEvents(workEvent, visit);
    const life = lifeWith(30, [{ id: 'far', kind: 'friend', away: true }], (d) => {
      d.career.job = null;
      d.phase = 'events';
      d.pending = [
        { instanceId: 'a', eventId: 'work_thing', cast: {} },
        { instanceId: 'b', eventId: 'visit', cast: { pal: 'far' } },
      ];
    });
    expect(consistencyProblems(life, workEvent, {}, bundle)).toHaveLength(1);
    const failures = checkInvariants(life, bundle).filter((f) => f.startsWith('consistency'));
    expect(failures).toEqual([
      'consistency: work_thing: breaks the "work" category contract',
      'consistency: visit: pal must be city but is elsewhere',
    ]);
  });

  it('drops a follow-up when someone in it is no longer where it needs them', () => {
    const followUp = ev({ id: 'visit_again', followUpOnly: true, cast: { pal: { kind: 'friend', presence: 'city' } } });
    const bundle = withEvents(followUp);
    const scheduled = (away: boolean) =>
      produce(
        lifeWith(30, [{ id: 'pal', kind: 'friend', away }], (d) => {
          d.scheduled = [{ eventId: 'visit_again', dueYear: d.currentYear, cast: { pal: 'pal' } }];
        }),
        (d) => runPacing(d, bundle),
      );
    expect(scheduled(false).pending.map((p) => p.eventId)).toContain('visit_again');
    const moved = scheduled(true);
    expect(moved.scheduled).toEqual([]);
    expect(moved.pending.map((p) => p.eventId)).not.toContain('visit_again');
  });

  it('carries when a follow-up was set up into its card text ({since})', () => {
    const followUp = ev({ id: 'visit_again', followUpOnly: true, text: 'It has been {since} since {pal.name} left.', cast: { pal: { kind: 'friend', presence: 'anywhere' } } });
    const bundle = withEvents(followUp);
    const life = produce(
      lifeWith(30, [{ id: 'pal', kind: 'friend' }], (d) => {
        d.scheduled = [{ eventId: 'visit_again', dueYear: d.currentYear, cast: { pal: 'pal' }, since: d.currentYear - 2 }];
      }),
      (d) => {
        runPacing(d, bundle);
        d.phase = 'events';
      },
    );
    expect(life.pending[0]?.since).toBe(life.currentYear - 2);
    expect(getEventCard(life, 0, bundle)?.text).toBe(`It has been two years since ${life.people.pal!.name.first} left.`);
  });

  it('makes an in-person action unavailable with someone who lives elsewhere', () => {
    const life = lifeWith(30, [{ id: 'near', kind: 'acquaintance' }, { id: 'far', kind: 'acquaintance', away: true }], (d) => {
      d.phase = 'yearStart';
      d.character.identity.attractedTo = [...new Set([...d.character.identity.attractedTo, d.people.near!.identity.genderCategory])];
      for (const id of ['near', 'far']) d.people[id]!.identity.attractedTo = [d.character.identity.genderCategory];
    });
    expect(isActionAvailable(life, 'ask_out', 'near', content)).toBe(true);
    expect(isActionAvailable(life, 'ask_out', 'far', content)).toBe(false);
  });
});
