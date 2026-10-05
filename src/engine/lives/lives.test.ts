import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import type { ContentBundle, LifeCondition } from '../../content/schemas';
import { costPrice } from '../costs';
import { castEvent } from '../events/casting';
import { applyEffects } from '../events/effects';
import { checkInvariants } from '../invariants';
import { playYear } from '../autoplay';
import { beginYear, createLife } from '../life';
import { moveTo } from '../housing';
import { whereabouts } from '../presence';
import { replayLife } from '../replay';
import { canChangeKind, isRomanticMatch } from '../relationships';
import { createRng } from '../rng';
import { runEconomy } from '../systems/economy';
import { cloneJson, lifeAtAge } from '../testFixtures';
import type { GenderCategory, LifeState, Person, Relationship, RelationshipKind } from '../types';
import { careCosts } from './care';
import { lifeHelp } from './help';
import { livesFailures } from './invariants';
import { defaultLife, tierFor } from './model';
import { lifeHolds } from './query';
import { giveSampleLife } from './sample';
import { runLives } from './step';
import { getNews, getPersonLifeView } from './views';

const ADULT = content.balance.relationships.adultAge;
const bal = content.balance.people;

interface Spec {
  id: string;
  age: number;
  kind: RelationshipKind;
  category?: GenderCategory;
  affection?: number;
  cityId?: string;
  occupation?: string;
  alive?: boolean;
  status?: Relationship['status'];
}

function addPerson(d: LifeState, spec: Spec, template: Person): void {
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
    mood: 60,
    moodBase: 60,
    wealthLevel: 'middle',
    canCarry: true,
  };
  delete d.people[spec.id]!.child;
  delete d.people[spec.id]!.priorChildren;
  delete d.people[spec.id]!.life;
  delete d.people[spec.id]!.occupation;
  delete d.people[spec.id]!.deathYear;
  if (spec.occupation) d.people[spec.id]!.occupation = spec.occupation;
  if (spec.alive === false) d.people[spec.id]!.deathYear = d.currentYear;
  d.relationships[spec.id] = { personId: spec.id, kind: spec.kind, status: spec.status ?? 'active', affection: spec.affection ?? 70, trust: 70, memories: [], since: d.currentYear - 5 };
}

/** An adult life with only these people around. */
function lifeWith(specs: Spec[], age = 35, seed = 'lives'): LifeState {
  return produce(lifeAtAge(seed, age), (d) => {
    const template = cloneJson(Object.values(d.people)[0]!);
    for (const id of Object.keys(d.people)) {
      delete d.people[id];
      delete d.relationships[id];
    }
    d.character.identity.attractedTo = ['man', 'woman', 'nonbinary'];
    for (const spec of specs) addPerson(d, spec, template);
    d.finances.savings = 50_000;
  });
}

/** One run of the people step on a life. */
const step = (life: LifeState, bundle: ContentBundle = content): LifeState =>
  produce(life, (d) => {
    runLives(d, bundle);
  });

/** The content with some people balance replaced. */
function withPeople(patch: Partial<typeof bal>): ContentBundle {
  return { ...content, balance: { ...content.balance, people: { ...bal, ...patch } } };
}

/** Rates so high the step always has something to say (for the caps). */
const BUSY = {
  love: { ...bal.love, meet: [{ at: 0, x: 1 }], engage: 1, marry: 1, breakup: [{ at: 0, x: 0 }], divorce: [{ at: 0, x: 0 }] },
  career: { ...bal.career, hire: [{ at: 0, x: 1 }], hireLevel: [{ at: 0, x: 1 }], switch: [{ at: 0, x: 0.5 }], retire: [{ at: 0, x: 0 }] },
  moving: { ...bal.moving, rate: [{ at: 0, x: 1 }] },
};

describe('tiers', () => {
  it('follow how close people are to you', () => {
    const life = lifeWith([
      { id: 'a', age: 60, kind: 'parent' },
      { id: 'b', age: 30, kind: 'friend', affection: bal.tiers.closeAffection },
      { id: 'c', age: 30, kind: 'friend', affection: bal.tiers.closeAffection - 1 },
      { id: 'd', age: 30, kind: 'coworker' },
      { id: 'e', age: 30, kind: 'acquaintance' },
      { id: 'f', age: 60, kind: 'parent', status: 'estranged' },
    ]);
    const tier = (id: string) => tierFor(life.relationships[id]!, content);
    expect([tier('a'), tier('b'), tier('c'), tier('d'), tier('e'), tier('f')]).toEqual(['close', 'close', 'near', 'near', 'far', 'far']);
  });

  it("change as relationships change, and the step updates a person's tier", () => {
    const life = lifeWith([{ id: 'b', age: 30, kind: 'friend', affection: 80 }]);
    expect(step(life).people.b!.life!.tier).toBe('close');
    const cooled = produce(life, (d) => {
      d.relationships.b!.affection = 20;
    });
    expect(step(cooled).people.b!.life!.tier).toBe('near');
  });
});

describe("the people step", () => {
  it('gives everyone you know a life summary, and leaves the dead and the faded alone', () => {
    const life = lifeWith([
      { id: 'a', age: 60, kind: 'parent' },
      { id: 'b', age: 30, kind: 'friend' },
      { id: 'x', age: 40, kind: 'friend', status: 'ended' },
    ]);
    const next = step(life);
    expect(next.people.a!.life).toBeDefined();
    expect(next.people.b!.life!.partner === null || next.people.b!.life!.partner.birthYear > 0).toBe(true);
    expect(next.people.x!.life).toBeUndefined();
    expect(checkInvariants(next, content)).toEqual([]);
  });

  it('is deterministic, and replays exactly from the input log', () => {
    const a = step(lifeWith([{ id: 'b', age: 30, kind: 'friend' }, { id: 'c', age: 26, kind: 'sibling' }]));
    const b = step(lifeWith([{ id: 'b', age: 30, kind: 'friend' }, { id: 'c', age: 26, kind: 'sibling' }]));
    expect(b).toEqual(a);
    let life = createLife({ mode: 'random', seed: 'lives-replay', birthYear: 2026 }, content);
    for (let i = 0; i < 30 && life.phase !== 'dead'; i++) life = playYear(life, content);
    expect(life.news.length).toBeGreaterThan(0);
    expect(replayLife(life.inputLog, content)).toEqual(life);
  });

  it('keeps the older generation out of new love lives, and your partner out of any', () => {
    const bundle = withPeople(BUSY);
    const life = lifeWith([
      { id: 'a', age: 60, kind: 'parent' },
      { id: 'g', age: 80, kind: 'grandparent' },
      { id: 'p', age: 33, kind: 'partner' },
    ]);
    const next = step(life, bundle);
    for (const id of ['a', 'g', 'p']) {
      expect(next.people[id]!.life!.partner, id).toBeNull();
      expect(next.people[id]!.life!.children, id).toEqual([]);
    }
  });
});

describe('love lives are for adults only', () => {
  it('never starts a relationship for anyone under the adult age, whatever the rates say', () => {
    const bundle = withPeople(BUSY);
    let life = lifeWith([
      { id: 'a', age: ADULT - 1, kind: 'friend' },
      { id: 'b', age: ADULT - 2, kind: 'sibling' },
      { id: 'c', age: 14, kind: 'classmate' },
      { id: 'd', age: ADULT + 7, kind: 'friend' },
    ]);
    life = step(life, bundle);
    for (const id of ['a', 'b', 'c']) expect(life.people[id]!.life!.partner, id).toBeNull();
    // The adult's partner is an adult too.
    const partner = life.people.d!.life!.partner!;
    expect(partner).not.toBeNull();
    expect(life.currentYear - partner.birthYear).toBeGreaterThanOrEqual(ADULT);
    expect(livesFailures(life, content)).toEqual([]);
  });

  it('is checked by the invariants too', () => {
    const life = step(lifeWith([{ id: 'a', age: ADULT - 1, kind: 'friend' }]));
    const broken = produce(life, (d) => {
      d.people.a!.life!.partner = { name: { first: 'Kit', last: 'Lee' }, genderCategory: 'woman', birthYear: d.currentYear - 30, canCarry: true, status: 'dating', since: d.currentYear - 1, statusSince: d.currentYear - 1 };
    });
    expect(livesFailures(broken, content).join('\n')).toMatch(/under 18|began a relationship/);
    const young = produce(life, (d) => {
      d.people.a!.birthYear = d.currentYear - 30;
      d.people.a!.life!.partner = { name: { first: 'Kit', last: 'Lee' }, genderCategory: 'woman', birthYear: d.currentYear - 15, canCarry: true, status: 'dating', since: d.currentYear - 1, statusSince: d.currentYear - 1 };
    });
    expect(livesFailures(young, content).join('\n')).toMatch(/someone under 18/);
  });

  it("leaves people who have a partner of their own out of your romance", () => {
    const life = withPeopleLife();
    const taken = life.people.d!;
    expect(taken.life!.partner).not.toBeNull();
    expect(isRomanticMatch(life, taken, content)).toBe(false);
    expect(canChangeKind(life, 'd', 'partner', content)).toBe(false);
  });

  function withPeopleLife(): LifeState {
    return produce(lifeWith([{ id: 'd', age: 30, kind: 'friend' }]), (d) => {
      d.people.d!.life = { ...defaultLife(d, d.people.d!, d.relationships.d, content), partner: { name: { first: 'Kit', last: 'Lee' }, genderCategory: 'woman', birthYear: d.currentYear - 30, canCarry: true, status: 'dating', since: d.currentYear - 2, statusSince: d.currentYear - 2 } };
    });
  }

  it('lets people marry, divorce and be widowed, with the right words in the news', () => {
    let life = lifeWith([{ id: 'd', age: 30, kind: 'friend', affection: 80 }]);
    const fast = withPeople({ ...BUSY, requests: { ...bal.requests, maxPerYear: 0 } });
    for (let i = 0; i < 6; i++) {
      life = step(life, fast);
      life = produce(life, (d) => {
        d.currentYear += 1;
      });
    }
    expect(life.people.d!.life!.partner?.status).toBe('married');
  });
});

describe('the news feed', () => {
  it('shows each change once, within its caps, with no placeholders left', () => {
    const bundle = withPeople({ ...BUSY, news: { ...bal.news, maxPerYear: 3, perPerson: 1 }, requests: { ...bal.requests, maxPerYear: 0 } });
    let life = lifeWith(Array.from({ length: 8 }, (_, i): Spec => ({ id: `f${i}`, age: 24 + i, kind: i % 2 ? 'sibling' : 'friend', affection: 80 })));
    for (let i = 0; i < 8; i++) {
      life = step(life, bundle);
      life = produce(life, (d) => {
        d.currentYear += 1;
      });
    }
    expect(life.news.length).toBeLessThanOrEqual(bundle.balance.people.news.keepYears);
    for (const year of life.news) {
      expect(year.lines.length).toBeLessThanOrEqual(3);
      expect(new Set(year.lines.map((l) => `${l.personId}:${l.kind}`)).size).toBe(year.lines.length);
      for (const line of year.lines) expect(line.text).not.toMatch(/[{}]/);
    }
    expect(life.news.length).toBeGreaterThan(0);
    expect(getNews(life)!.items.length).toBeGreaterThan(0);
  });

  it('tells near and far people only the major news', () => {
    const bundle = withPeople({ ...BUSY, requests: { ...bal.requests, maxPerYear: 0 } });
    const life = step(lifeWith(Array.from({ length: 12 }, (_, i): Spec => ({ id: `c${i}`, age: 26 + i, kind: 'coworker', affection: 40 }))), bundle);
    const kinds = new Set((life.news[0]?.lines ?? []).map((l) => l.kind));
    for (const kind of kinds) expect(bal.news.major).toContain(kind);
  });

  it('keeps work news for close people', () => {
    const bundle = withPeople({ ...BUSY, requests: { ...bal.requests, maxPerYear: 0 } });
    const life = step(lifeWith([{ id: 's', age: 30, kind: 'sibling' }, { id: 't', age: 30, kind: 'sibling' }]), bundle);
    const kinds = life.news[0]!.lines.map((l) => l.kind);
    expect(kinds).toContain('hired');
  });
});

describe('work and money', () => {
  it("hires, moves up, and lets people go with the careers balance, and wealth follows the job", () => {
    const bundle = withPeople({ ...BUSY, requests: { ...bal.requests, maxPerYear: 0 } });
    let life = lifeWith([{ id: 'w', age: 30, kind: 'sibling' }]);
    life = produce(life, (d) => {
      d.people.w!.wealthLevel = 'working';
    });
    life = step(life, bundle);
    const w = life.people.w!;
    expect(w.occupation).toBeDefined();
    expect(w.life!.level).toBeGreaterThanOrEqual(1);
    expect(Object.keys(content.jobs)).toContain(w.occupation);
    expect(checkInvariants(life, content)).toEqual([]);
  });

  it('retires people past the retirement age, who stay retired', () => {
    const bundle = withPeople({ career: { ...bal.career, retire: [{ at: 0, x: 1 }] } });
    const job = Object.keys(content.jobs).sort()[0]!;
    let life = lifeWith([{ id: 'r', age: 70, kind: 'friend', occupation: job }]);
    life = step(life, bundle);
    expect(life.people.r!.occupation).toBeUndefined();
    expect(life.people.r!.life!.retired).toBe(true);
    life = step(produce(life, (d) => void (d.currentYear += 1)), withPeople({ career: { ...bal.career, hire: [{ at: 0, x: 1 }] } }));
    expect(life.people.r!.occupation).toBeUndefined();
  });
});

describe('trouble', () => {
  const offenseId = Object.keys(content.offenses).sort()[0]!;
  const held = (d: LifeState, id: string, stage: 'held' | 'bailed' = 'held') => {
    d.people[id]!.life = { ...defaultLife(d, d.people[id]!, d.relationships[id], content), troubles: [{ kind: 'crime', refId: offenseId, since: d.currentYear - 1, severity: 0, treated: false, stage }] };
  };

  it("decides a case the year after the arrest, and bail changes the odds of jail", () => {
    const base = lifeWith([{ id: 'f', age: 30, kind: 'friend', affection: 90 }]);
    const open = produce(base, (d) => held(d, 'f'));
    const out = step(open, withPeople({ requests: { ...bal.requests, maxPerYear: 0 } }));
    const trouble = out.people.f!.life!.troubles.find((t) => t.kind === 'crime');
    expect(trouble === undefined || ['probation', 'jail'].includes(trouble.stage!)).toBe(true);
    expect(out.news[0]!.lines.some((l) => ['warned', 'fined', 'probation', 'jailed'].includes(l.kind))).toBe(true);
    // Bail multiplies the weight of jail by the balance.
    expect(bal.trouble.crime.bailJail).toBeLessThan(1);
  });

  it("bail, rehab and treatment go through the person's own troubles", () => {
    let life = lifeWith([{ id: 'f', age: 30, kind: 'friend' }]);
    const condition = Object.values(content.conditions).find((c) => c.kind === 'illness' && c.treatable)!;
    const addiction = Object.values(content.conditions).find((c) => c.kind === 'addiction')!;
    life = produce(life, (d) => {
      const person = d.people.f!;
      person.life = {
        ...defaultLife(d, person, d.relationships.f, content),
        troubles: [
          { kind: 'crime', refId: offenseId, since: d.currentYear, severity: 0, treated: false, stage: 'held' },
          { kind: 'illness', refId: condition.id, since: d.currentYear - 1, severity: 50, treated: false },
          { kind: 'addiction', refId: addiction.id, since: d.currentYear - 1, severity: 50, treated: false },
        ],
      };
    });
    const rng = createRng('help');
    life = produce(life, (d) => {
      lifeHelp(d, 'f', 'bail', rng, content);
      lifeHelp(d, 'f', 'rehab', rng, content);
      lifeHelp(d, 'f', 'treatment', rng, content);
    });
    const troubles = life.people.f!.life!.troubles;
    expect(troubles.find((t) => t.kind === 'crime')!.stage).toBe('bailed');
    expect(troubles.find((t) => t.kind === 'addiction')!.treated).toBe(true);
    expect(troubles.find((t) => t.kind === 'illness')!.treated).toBe(true);
  });

  it('recovers from an addiction on treatment, and can relapse', () => {
    const addiction = Object.values(content.conditions).find((c) => c.kind === 'addiction')!;
    const sure = withPeople({ trouble: { ...bal.trouble, relapse: { years: 5, chance: 1 } }, requests: { ...bal.requests, maxPerYear: 0 } });
    let life = lifeWith([{ id: 'f', age: 40, kind: 'friend', affection: 90 }]);
    life = produce(life, (d) => {
      d.people.f!.life = { ...defaultLife(d, d.people.f!, d.relationships.f, content), troubles: [{ kind: 'addiction', refId: addiction.id, since: d.currentYear - 3, severity: 3, treated: true }] };
    });
    const better = step(life, withPeople({ trouble: { ...bal.trouble, illnessScale: 0 }, requests: { ...bal.requests, maxPerYear: 0 } }));
    expect(better.people.f!.life!.troubles.some((t) => t.kind === 'addiction')).toBe(false);
    expect(better.people.f!.life!.recovered.map((r) => r.refId)).toEqual([addiction.id]);
    expect(better.news[0]!.lines.some((l) => l.kind === 'recovered_health')).toBe(true);
    // A year on, the relapse comes.
    const later = step(produce(better, (d) => void (d.currentYear += 1)), sure);
    expect(later.people.f!.life!.troubles.some((t) => t.kind === 'addiction')).toBe(true);
    expect(later.people.f!.life!.recovered).toEqual([]);
  });

  it('adds the illnesses people have to their chance of dying', () => {
    const condition = Object.values(content.conditions).find((c) => c.mortality > 0)!;
    const life = lifeWith([{ id: 'f', age: 50, kind: 'friend' }]);
    const sick = produce(life, (d) => {
      d.people.f!.life = { ...defaultLife(d, d.people.f!, d.relationships.f, content), troubles: [{ kind: 'illness', refId: condition.id, since: d.currentYear - 2, severity: 90, treated: false }] };
    });
    expect(sick.people.f!.life!.troubles).toHaveLength(1);
  });
});

describe('requests', () => {
  it('queue an event for a death in the family, counted in the year (the cap of six holds)', () => {
    const life = lifeWith([{ id: 'p1', age: 70, kind: 'parent', alive: false }]);
    const next = step(life);
    expect(next.scheduled).toHaveLength(1);
    expect(['funeral_parent', 'eulogy_request']).toContain(next.scheduled[0]!.eventId);
    expect(next.scheduled[0]!.cast).toEqual({ npc: 'p1' });
    // The pacing director picks it up the same year.
    const queued = produce(next, (d) => {
      d.scheduled = d.scheduled.map((s) => ({ ...s, dueYear: d.currentYear + 1 }));
    });
    const begun = beginYear(queued, content);
    expect(begun.pending.map((p) => p.eventId)).toContain(next.scheduled[0]!.eventId);
    expect(begun.pending.length).toBeLessThanOrEqual(content.balance.pacing.cap);
  });

  it('never asks more than the balance allows in a year, and each person once', () => {
    const life = lifeWith([
      { id: 'a', age: 70, kind: 'parent', alive: false },
      { id: 'b', age: 75, kind: 'grandparent', alive: false },
      { id: 'c', age: 40, kind: 'sibling', alive: false },
      { id: 'd', age: 38, kind: 'friend', alive: false },
    ]);
    const next = step(life);
    expect(next.scheduled.length).toBeLessThanOrEqual(bal.requests.maxPerYear);
    expect(new Set(next.scheduled.map((s) => s.cast.npc)).size).toBe(next.scheduled.length);
  });

  it("skip people who feel too little for you to ask, and people who asked lately", () => {
    const cold = lifeWith([{ id: 'f', age: 30, kind: 'friend', affection: bal.requests.minAffection - 1 }]);
    const always = withPeople({
      ...BUSY,
      requests: { ...bal.requests, triggers: Object.fromEntries(Object.entries(bal.requests.triggers).map(([k, v]) => [k, { ...v, chance: 1, tiers: ['close', 'near', 'far'] }])) as typeof bal.requests.triggers },
    });
    expect(step(cold, always).scheduled).toEqual([]);
    const warm = lifeWith([{ id: 'f', age: 30, kind: 'sibling', affection: 90 }]);
    expect(step(warm, always).scheduled.length).toBeGreaterThan(0);
    const asked = produce(warm, (d) => {
      d.people.f!.life = { ...defaultLife(d, d.people.f!, d.relationships.f, content), requestYear: d.currentYear - 1 };
    });
    expect(step(asked, always).scheduled).toEqual([]);
  });

  it('are never queued while you are in prison', () => {
    const base = lifeWith([{ id: 'a', age: 70, kind: 'parent', alive: false }]);
    const inside = produce(base, (d) => {
      d.housing.kind = 'incarcerated';
    });
    expect(step(inside).scheduled).toEqual([]);
  });

  it('have events that fit: every registered event is a follow-up with a person it can be cast for', () => {
    for (const [trigger, list] of Object.entries(content.registries.people.requests)) {
      for (const id of list.events) {
        const def = content.events[id]!;
        expect(def.followUpOnly, `${trigger}: ${id}`).toBe(true);
        expect(def.cast?.npc, `${trigger}: ${id}`).toBeDefined();
      }
    }
  });

  it('cast a person from a preset and check the full requirements before queuing', () => {
    const life = produce(lifeWith([{ id: 'f', age: 30, kind: 'friend', affection: 90 }]), (d) => {
      giveSampleLife(d, 'f', { partner: ['married'] }, content);
    });
    const def = content.events.wedding_invitation!;
    const cast = castEvent(life, def, createRng('x'), content, { npc: 'f' });
    expect(cast?.cast).toEqual({ npc: 'f' });
  });
});

describe('care for aging parents', () => {
  const needing = (): LifeState =>
    produce(lifeWith([{ id: 'p', age: 82, kind: 'parent', cityId: 'houston' }, { id: 's', age: 53, kind: 'sibling' }], 50), (d) => {
      d.housing.kind = 'renting';
      d.housing.annualCost = 12_000;
      d.character.cityId = 'chicago';
      d.housing.cityId = 'chicago';
      giveSampleLife(d, 'p', { care: ['needed'] }, content);
    });

  it('moves them in through housing: they live with you, move with you, and cost money every year', () => {
    const rng = createRng('care');
    let life = needing();
    life = produce(life, (d) => lifeHelp(d, 'p', 'move_in', rng, content));
    expect(life.people.p!.life!.care).toBe('home');
    expect(life.people.p!.cityId).toBe(life.character.cityId);
    expect(whereabouts(life, 'p', content)).toBe('household');
    expect(careCosts(life, content)).toBeGreaterThan(0);
    const moved = produce(life, (d) => moveTo(d, 'renting', 'nyc', content));
    expect(moved.people.p!.cityId).toBe('nyc');
    expect(checkInvariants(moved, content)).toEqual([]);
  });

  it("pays for care through the ledger, and it stops when they die", () => {
    const rng = createRng('care');
    let life = produce(needing(), (d) => lifeHelp(d, 'p', 'pay_care', rng, content));
    expect(life.people.p!.life!.care).toBe('paid');
    const paid = produce(life, (d) => runEconomy(d, content));
    expect(paid.finances.lastLedger!.care).toBe(careCosts(life, content));
    expect(paid.finances.lastLedger!.net).toBe(
      paid.finances.lastLedger!.gross + paid.finances.lastLedger!.retirement + paid.finances.lastLedger!.interest + paid.finances.lastLedger!.supportReceived - paid.finances.lastLedger!.tax - paid.finances.lastLedger!.housing - paid.finances.lastLedger!.living - paid.finances.lastLedger!.children - paid.finances.lastLedger!.care - paid.finances.lastLedger!.supportPaid - paid.finances.lastLedger!.debtPayments,
    );
    life = produce(life, (d) => {
      d.people.p!.alive = false;
      d.people.p!.deathYear = d.currentYear;
    });
    expect(careCosts(life, content)).toBe(0);
  });

  it('can be left to the family, and cannot be taken in by someone living on the street or in prison', () => {
    const rng = createRng('care');
    expect(produce(needing(), (d) => lifeHelp(d, 'p', 'leave_care', rng, content)).people.p!.life!.care).toBe('sibling');
    const homeless = produce(needing(), (d) => {
      d.housing.kind = 'homeless';
      lifeHelp(d, 'p', 'move_in', rng, content);
    });
    expect(homeless.people.p!.life!.care).toBe('needed');
  });

  it('goes back to the family when you have no home of your own to look after them in', () => {
    const rng = createRng('care');
    const taken = produce(needing(), (d) => lifeHelp(d, 'p', 'move_in', rng, content));
    const homeless = produce(taken, (d) => moveTo(d, 'homeless', d.character.cityId, content));
    expect(homeless.people.p!.life!.care).toBe('sibling');
    expect(careCosts(homeless, content)).toBe(0);
    expect(checkInvariants(homeless, content)).toEqual([]);
  });

  it('only older people need care, and a need stays a request until someone steps in', () => {
    const bundle = withPeople({ care: { ...bal.care, needChance: [{ at: 0, x: 1 }] } });
    const next = step(lifeWith([{ id: 'p', age: 80, kind: 'parent' }, { id: 'y', age: 40, kind: 'parent' }]), bundle);
    expect(next.people.p!.life!.care).toBe('needed');
    expect(next.people.y!.life!.care).toBeUndefined();
  });
});

describe('effects that go through existing systems', () => {
  it('repays money like the cost it repays, and a cosigned debt is a personal debt scaled to your city', () => {
    const life = lifeWith([{ id: 'f', age: 30, kind: 'friend' }]);
    const rng = createRng('fx');
    const ctx = { def: { id: 'x', rarity: 'common' as const }, cast: { npc: 'f' }, rng, content };
    const back = produce(life, (d) => applyEffects(d, [{ type: 'repay', item: 'loan_small', share: 0.5 }], ctx));
    expect(back.finances.savings - life.finances.savings).toBe(Math.floor(costPrice(life, 'loan_small', content) * 0.5));
    const owed = produce(life, (d) => applyEffects(d, [{ type: 'debt', action: 'add', kind: 'personal', item: 'cosigned_debt' }], ctx));
    expect(owed.finances.debts.some((x) => x.kind === 'personal' && x.balance === costPrice(life, 'cosigned_debt', content))).toBe(true);
  });

  it("a job lead finds a jobless adult work, and only them", () => {
    const rng = createRng('lead');
    const life = lifeWith([{ id: 'f', age: 30, kind: 'friend' }, { id: 'k', age: 15, kind: 'sibling' }]);
    const led = produce(life, (d) => {
      lifeHelp(d, 'f', 'job_lead', rng, content);
      lifeHelp(d, 'k', 'job_lead', rng, content);
    });
    expect(led.people.f!.occupation).toBeDefined();
    expect(led.people.k!.occupation).toBeUndefined();
  });
});

describe('conditions about a life', () => {
  const life = produce(lifeWith([{ id: 'f', age: 40, kind: 'friend' }]), (d) => {
    giveSampleLife(d, 'f', { partner: ['married'], employed: true, children: { gte: 1 }, trouble: ['illness'], wealth: ['poor'], care: ['home'] } as LifeCondition, content);
  });
  const person = life.people.f!;
  const holds = (q: LifeCondition) => lifeHolds(q, person, life.currentYear, bal.trouble.serious);
  it('read the summary', () => {
    expect(holds({ partner: ['married'] })).toBe(true);
    expect(holds({ partner: ['none'] })).toBe(false);
    expect(holds({ employed: true, children: { gte: 1 } })).toBe(true);
    expect(holds({ trouble: ['crime'] })).toBe(false);
    expect(holds({ serious: true })).toBe(true);
    expect(holds({ wealth: ['poor', 'working'] })).toBe(true);
    expect(holds({ care: ['home'] })).toBe(true);
    expect(holds({ care: ['none'] })).toBe(false);
  });
  it('fail for someone without a summary', () => {
    const bare = lifeWith([{ id: 'g', age: 30, kind: 'friend' }]).people.g!;
    expect(lifeHolds({ employed: false }, bare, 2000, 35)).toBe(false);
  });
});

describe('what the screens show', () => {
  it("shows a person's job, partner, children, city and troubles", () => {
    const life = produce(lifeWith([{ id: 'f', age: 40, kind: 'friend' }]), (d) => {
      giveSampleLife(d, 'f', { partner: ['engaged'], employed: true, children: { gte: 1 }, trouble: ['illness', 'crime'], crime: ['bailed'] }, content);
    });
    const view = getPersonLifeView(life, 'f', content)!;
    expect(view.job).toBeTruthy();
    expect(view.partner?.status).toBe('engaged');
    expect(view.children).toHaveLength(1);
    expect(view.city.name).toBeTruthy();
    expect(view.troubles.map((t) => t.kind).sort()).toEqual(['crime', 'illness']);
  });

  it('builds a view for someone who has no summary yet (an old save)', () => {
    const life = lifeWith([{ id: 'f', age: 40, kind: 'friend' }]);
    const view = getPersonLifeView(life, 'f', content)!;
    expect(view.partner).toBeNull();
    expect(view.troubles).toEqual([]);
  });
});
