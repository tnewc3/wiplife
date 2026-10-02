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
import { resolveChoice } from './life';
import { getEventCard, problemReport } from './selectors';
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
    const followUp = ev({ id: 'visit_again', followUpOnly: true, text: '{pal.name} left {since}.', cast: { pal: { kind: 'friend', presence: 'anywhere' } } });
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
    expect(getEventCard(life, 0, bundle)?.text).toBe(`${life.people.pal!.name.first} left two years ago.`);
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

describe('money on event cards', () => {
  const paid = ev({
    id: 'paid',
    autoOutcome: undefined,
    choices: [
      { id: 'buy', label: 'Buy it', outcome: { effects: [{ type: 'money', delta: -500 }, { type: 'money', delta: 100 }] } },
      {
        id: 'gamble',
        label: 'Gamble',
        check: { base: 50, stats: [{ key: 'smarts', weight: 1 }], success: { effects: [{ type: 'money', delta: 200 }] }, failure: { effects: [{ type: 'money', delta: -200 }] } },
      },
      {
        id: 'ticket',
        label: 'Pay the ticket',
        check: { base: 50, stats: [{ key: 'smarts', weight: 1 }], success: { effects: [{ type: 'money', delta: -50 }] }, failure: { effects: [{ type: 'money', delta: -50 }] } },
      },
      { id: 'skip', label: 'Skip it', outcome: {} },
    ],
  });
  const bundle = withEvents(paid);
  const pendingLife = (savings: number) =>
    lifeWith(30, [], (d) => {
      d.finances.savings = savings;
      d.phase = 'events';
      d.pending = [{ instanceId: 'a', eventId: 'paid', cast: {} }];
    });

  it('shows known costs on choice buttons, and nothing when the cost depends on luck', () => {
    const card = getEventCard(pendingLife(1000), 0, bundle)!;
    expect(card.choices.map((c) => [c.id, c.money])).toEqual([
      ['buy', -400],
      ['gamble', undefined],
      ['ticket', -50],
      ['skip', undefined],
    ]);
  });

  it('records each money change with the new balance, and any debt it left', () => {
    const after = resolveChoice(pendingLife(1000), 'a', 'buy', bundle);
    expect(getEventCard(after, 0, bundle)!.money).toEqual({ change: -400, balance: 600, debtChange: 0 });
    // Short of the cost: savings run out and the rest becomes debt; the $100 back lands in savings.
    const short = resolveChoice(pendingLife(100), 'a', 'buy', bundle);
    expect(getEventCard(short, 0, bundle)!.money).toEqual({ change: 0, balance: 100, debtChange: 400 });
    const none = resolveChoice(pendingLife(100), 'a', 'skip', bundle);
    expect(getEventCard(none, 0, bundle)!.money).toBeNull();
  });
});

describe('problem reports', () => {
  it('names the event, the choice, the cast and where they are, and the state the rules depend on', () => {
    const visit = ev({ id: 'visit', cast: { pal: { kind: 'friend', presence: 'city' } } });
    const bundle = withEvents(visit);
    const life = lifeWith(30, [{ id: 'far', kind: 'friend', away: true }], (d) => {
      d.phase = 'events';
      d.pending = [{ instanceId: 'a', eventId: 'visit', cast: { pal: 'far' }, resolvedChoiceId: 'continue' }];
    });
    const report = problemReport(life, 0, bundle);
    expect(report).toContain('event: visit (a)');
    expect(report).toContain('choice: continue');
    expect(report).toContain('cast pal: far friend, age 30, elsewhere');
    expect(report).toContain('home: renting in chicago');
    expect(report).toContain('consistency: visit: pal must be city but is elsewhere');
  });
});

describe('household awareness in wellbeing events (C1 playtesting)', () => {
  const partnered = (trust: number) =>
    lifeWith(30, [{ id: 'spouse', kind: 'spouse', trust }, { id: 'pal', kind: 'friend', trust: 95 }], (d) => {
      d.housing.partnerId = 'spouse';
      d.character.stats.stress = 80;
    });

  it('casts a partner you live with as the helper, even below the usual trust, and offers to wake them instead of calling', () => {
    const def = content.events.everything_is_too_much!;
    const life = partnered(10);
    const cast = castEvent(cloneJson(life), def, createRng('w'), content)!.cast;
    expect(cast.helper).toBe('spouse');
    const card = getEventCard(
      produce(life, (d) => {
        d.phase = 'events';
        d.pending = [{ instanceId: 'x', eventId: def.id, cast }];
      }),
      0,
      content,
    )!;
    const ids = card.choices.map((c) => c.id);
    expect(ids).toContain('wake');
    expect(ids).not.toContain('call');
  });

  it('calls a friend who is not at home instead', () => {
    const def = content.events.everything_is_too_much!;
    const life = lifeWith(30, [{ id: 'pal', kind: 'friend', trust: 95 }], (d) => {
      d.character.stats.stress = 80;
      d.phase = 'events';
      d.pending = [{ instanceId: 'x', eventId: def.id, cast: { helper: 'pal' } }];
    });
    const ids = getEventCard(life, 0, content)!.choices.map((c) => c.id);
    expect(ids).toContain('call');
    expect(ids).not.toContain('wake');
  });
});

describe('a partner you live with is never cast as visiting (C1 playtesting)', () => {
  it('rejects "in town for one night" for an old friend who now lives with you', () => {
    const def = content.events.old_friend_reunion!;
    const life = lifeWith(30, [{ id: 'old', kind: 'partner' }], (d) => {
      d.housing.partnerId = 'old';
    });
    expect(def.cast!.friend!.presence).toBe('elsewhere');
    expect(consistencyProblems(life, def, { friend: 'old' }, content)).toEqual(['old_friend_reunion: friend must be elsewhere but is household']);
  });
});
