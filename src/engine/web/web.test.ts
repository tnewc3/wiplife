import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import type { ContentBundle, Effect, OutcomeTier } from '../../content/schemas';
import { InvalidInputError } from '../creation/input';
import { applyEffects } from '../events/effects';
import { castEvent } from '../events/casting';
import { evaluate } from '../conditions';
import { die, parentLife } from '../estate/fixtures';
import { continueAsHeir, heirCandidates } from '../estate/heir';
import { betray } from '../interactions/links';
import { availableInteractions, defaultExtras, isInteractionAvailable } from '../interactions/availability';
import { performInteraction } from '../interactions/perform';
import { checkInvariants } from '../invariants';
import { createLife } from '../life';
import { playYear } from '../autoplay';
import { createRng } from '../rng';
import { cloneJson, lifeAtAge } from '../testFixtures';
import type { GenderCategory, KnowledgeItem, LifeState, Relationship, RelationshipKind, WebState } from '../types';
import { applyIntroduce } from './actions';
import { ITEM_ROLE, getTie, tieKey, tieStatus } from './query';
import { runWeb } from './step';
import { heardText } from './knowledge';
import { addTie, emptyWeb, mayBeCouple } from './ties';
import { webFailures } from './invariants';
import { getConnections, getHeard } from './views';

const ADULT = content.balance.relationships.adultAge;
const bal = content.balance.web;

interface Spec {
  id: string;
  age: number;
  kind: RelationshipKind;
  category?: GenderCategory;
  affection?: number;
  cityId?: string;
  alive?: boolean;
  traits?: Record<string, number>;
  partner?: boolean;
}

function addPerson(d: LifeState, spec: Spec, template: LifeState['people'][string]): void {
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
    traits: spec.traits ?? {},
    cityId: spec.cityId ?? d.character.cityId,
    tags: [spec.kind],
    mood: 60,
    moodBase: 60,
    wealthLevel: 'middle',
  };
  const p = d.people[spec.id]!;
  delete p.child;
  delete p.priorChildren;
  delete p.life;
  delete p.occupation;
  delete p.deathYear;
  if (spec.alive === false) p.deathYear = d.currentYear;
  d.relationships[spec.id] = { personId: spec.id, kind: spec.kind, status: 'active', affection: spec.affection ?? 60, trust: 60, memories: [], since: d.currentYear - 5 } as Relationship;
}

/** An adult life with only these people around (and nothing in the web). */
function lifeWith(specs: Spec[], age = 35, seed = 'web'): LifeState {
  return produce(lifeAtAge(seed, age), (d) => {
    const template = cloneJson(Object.values(d.people)[0]!);
    for (const id of Object.keys(d.people)) {
      delete d.people[id];
      delete d.relationships[id];
    }
    d.character.identity.attractedTo = ['man', 'woman', 'nonbinary'];
    for (const spec of specs) addPerson(d, spec, template);
    d.web = emptyWeb();
    d.finances.savings = 20_000;
  });
}

/** The content with some web balance replaced. */
function withWeb(patch: (b: typeof bal) => typeof bal, base: ContentBundle = content): ContentBundle {
  return { ...base, balance: { ...base.balance, web: patch(bal) } };
}

/** A web that changes nothing by chance: no wobble, no shocks, no meeting people, no gossip. */
const STILL = (b: typeof bal): typeof bal => ({
  ...b,
  ties: {
    ...b.ties,
    drift: { ...b.ties.drift, pull: 0, sd: 0 },
    shock: { ...b.ties.shock, chance: 0 },
    meet: { ...b.ties.meet, inLaw: 0, friends: 0 },
    context: { ...b.ties.context, draws: 0 },
    couple: { ...b.ties.couple, marry: 0, breakup: [{ at: 0, x: 0 }] },
  },
  feud: { ...b.feud, heal: { chance: 0, min: 0, max: 0 } },
  knowledge: { ...b.knowledge, spread: { ...b.knowledge.spread, base: 0 }, newPerYear: 1 },
});

/** Gossip that always travels: every holder tells everyone they are tied to. */
const GOSSIPY = (b: typeof bal): typeof bal => ({
  ...STILL(b),
  knowledge: {
    ...b.knowledge,
    spread: { ...b.knowledge.spread, base: 1, closeness: { close: 1, normal: 1, strained: 1, feuding: 1 }, gossip: 0, secret: 1, loyalty: 0, hushed: b.knowledge.spread.hushed, perHolder: 6 },
    twist: { chance: 0, secret: 0 },
    reaction: { ...b.knowledge.reaction, eventChance: 1 },
  },
});

const step = (life: LifeState, bundle: ContentBundle = content): LifeState =>
  produce(life, (d) => {
    runWeb(d, bundle);
  });

const tie = (life: LifeState, a: string, b: string) => getTie(life.web, a, b);

function withTie(life: LifeState, a: string, b: string, kind: 'friends' | 'siblings' | 'parentChild' | 'inLaw' | 'married' | 'dating', affection = 60, since = life.currentYear - 5): LifeState {
  return produce(life, (d) => {
    addTie(d.web, a, b, kind, affection, 'family', since);
  });
}

function withItem(life: LifeState, kind: string, truth: string, holders: Record<string, { version: string; from?: string; reacted?: boolean }>, extra: Partial<KnowledgeItem> = {}): LifeState {
  return produce(life, (d) => {
    d.web.items.push({
      id: `k${d.web.nextItem}`,
      kind,
      subject: 'you',
      year: d.currentYear - 1,
      truth,
      holders: Object.fromEntries(Object.entries(holders).map(([id, h]) => [id, { version: h.version, since: d.currentYear - 1, from: h.from ?? 'saw', reacted: h.reacted ?? true }])),
      ...extra,
    });
    d.web.nextItem += 1;
  });
}

/** A bundle whose interaction roll always lands on this tier. */
function forced(tier: OutcomeTier): ContentBundle {
  const t = { backfire: -4000, bad: -3000, good: -2000, great: -1000 };
  if (tier === 'good') Object.assign(t, { great: 2000 });
  if (tier === 'neutral') Object.assign(t, { good: 2000, great: 3000 });
  if (tier === 'bad') Object.assign(t, { bad: 2000, good: 3000, great: 4000 });
  if (tier === 'backfire') Object.assign(t, { backfire: 2000, bad: 3000, good: 4000, great: 5000 });
  const b = content.balance.interactions;
  return { ...content, balance: { ...content.balance, interactions: { ...b, reaction: { ...b.reaction, noiseSd: 0, thresholds: t } } } };
}

describe('ties from the family', () => {
  it('give parents a tie to each other, siblings a tie to each other and to their parents, the same from both sides', () => {
    let checked = 0;
    for (let i = 0; i < 60; i++) {
      const life = createLife({ mode: 'random', seed: `web-structure-${i}`, birthYear: 2000 }, content);
      const kinds = (k: RelationshipKind) => Object.keys(life.relationships).filter((id) => life.relationships[id]!.kind === k && life.people[id]!.alive);
      const parents = kinds('parent');
      // (Parents are a couple in the web once both are adults: a very young parent isn't tied yet.)
      if (parents.length === 2 && parents.every((id) => life.birthYear - life.people[id]!.birthYear >= ADULT)) {
        expect(tie(life, parents[0]!, parents[1]!)?.kind, `parents of ${i}`).toBe('married');
        expect(tie(life, parents[1]!, parents[0]!)).toBe(tie(life, parents[0]!, parents[1]!));
        checked++;
      }
      const siblings = kinds('sibling');
      for (const s of siblings) for (const p of parents) expect(tie(life, p, s)?.kind).toBe('parentChild');
      for (const a of siblings) for (const b of siblings) if (a < b) expect(tie(life, a, b)?.kind).toBe('siblings');
      expect(webFailures(life, content)).toEqual([]);
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('keep one record for each pair, under the pair key with the lower id first', () => {
    const life = withTie(lifeWith([{ id: 'x', age: 30, kind: 'friend' }, { id: 'a', age: 30, kind: 'friend' }]), 'x', 'a', 'friends');
    expect(Object.keys(life.web.ties)).toEqual([tieKey('a', 'x')]);
    expect(tieKey('a', 'x')).toBe(tieKey('x', 'a'));
    expect(life.web.ties[tieKey('a', 'x')]).toMatchObject({ a: 'a', b: 'x' });
  });

  it('end when someone dies or leaves your circle, and never point at someone who is gone', () => {
    let life = lifeWith([{ id: 'a', age: 30, kind: 'friend' }, { id: 'b', age: 30, kind: 'friend' }, { id: 'c', age: 30, kind: 'friend' }]);
    life = withTie(withTie(life, 'a', 'b', 'friends'), 'b', 'c', 'friends');
    const quiet = withWeb(STILL);
    life = produce(life, (d) => {
      d.people.a!.alive = false;
      d.people.a!.deathYear = d.currentYear;
      d.relationships.c!.status = 'ended';
    });
    const next = step(life, quiet);
    expect(Object.keys(next.web.ties)).toEqual([]);
    expect(checkInvariants(next, content).filter((f) => f.startsWith('tie'))).toEqual([]);
  });

  it('are rebuilt for an heir, from the heir\'s side, without the parent who died', () => {
    const dead = die(parentLife({ kids: [20, 25, 28], spouse: true, seed: 'web-heir' }));
    const [heirId] = heirCandidates(dead);
    const heir = continueAsHeir(dead, heirId!, content);
    expect(webFailures(heir, content)).toEqual([]);
    const siblings = Object.keys(heir.relationships).filter((id) => heir.relationships[id]!.kind === 'sibling' && heir.people[id]!.alive);
    expect(siblings.length).toBeGreaterThan(0);
    for (let i = 0; i < siblings.length; i++) for (let j = i + 1; j < siblings.length; j++) expect(tie(heir, siblings[i]!, siblings[j]!)?.kind).toBe('siblings');
    const parents = Object.keys(heir.relationships).filter((id) => heir.relationships[id]!.kind === 'parent');
    for (const p of parents) {
      if (!heir.people[p]!.alive) for (const t of Object.values(heir.web.ties)) expect([t.a, t.b]).not.toContain(p);
    }
    // The ties in the parent's life that were the same kind keep how they stood.
    const sib = siblings[0]!;
    for (const key of Object.keys(heir.web.ties)) {
      const was = dead.web.ties[key];
      if (was && was.kind === heir.web.ties[key]!.kind) expect(heir.web.ties[key]!.affection).toBe(was.affection);
    }
    expect(sib).toBeDefined();
  });
});

describe('ties from your partner and from shared context', () => {
  it('form when your partner meets your family and your friends', () => {
    const life = lifeWith([
      { id: 'mate', age: 33, kind: 'spouse' },
      { id: 'mom', age: 62, kind: 'parent' },
      { id: 'pal', age: 34, kind: 'friend' },
      { id: 'boss', age: 45, kind: 'boss' },
    ]);
    const meets = withWeb((b) => ({ ...STILL(b), ties: { ...STILL(b).ties, meet: { ...b.ties.meet, inLaw: 1, friends: 1, committed: 1, household: 1, afterYears: 0 } } }));
    const next = step(life, meets);
    expect(tie(next, 'mate', 'mom')).toMatchObject({ kind: 'inLaw', origin: 'partner' });
    expect(tie(next, 'mate', 'pal')).toMatchObject({ kind: 'friends', origin: 'partner' });
    // Coworkers aren't part of the web.
    expect(tie(next, 'mate', 'boss')).toBeUndefined();
    expect(webFailures(next, content)).toEqual([]);
  });

  it('form between friends who live in the same city, not between friends in different cities', () => {
    const home = lifeAtAge('web', 35).character.cityId;
    const other = Object.keys(content.cities).find((c) => c !== home && !content.cities[c]!.retired)!;
    const life = lifeWith([
      { id: 'a', age: 30, kind: 'friend', cityId: home },
      { id: 'b', age: 31, kind: 'friend', cityId: home },
      { id: 'c', age: 32, kind: 'friend', cityId: other },
    ]);
    const mixing = withWeb((b) => ({ ...STILL(b), ties: { ...STILL(b).ties, context: { draws: 30, chance: 1, maxPerYear: 10, romance: 0 } } }));
    const next = step(life, mixing);
    expect(tie(next, 'a', 'b')).toMatchObject({ kind: 'friends', origin: 'context' });
    expect(tie(next, 'a', 'c')).toBeUndefined();
    expect(tie(next, 'b', 'c')).toBeUndefined();
  });
});

describe('romance between the people you know', () => {
  const single = lifeWith([
    { id: 'a', age: 30, kind: 'friend' },
    { id: 'b', age: 31, kind: 'friend' },
    { id: 'kid', age: ADULT - 2, kind: 'friend' },
    { id: 'sis', age: 33, kind: 'sibling' },
    { id: 'bro', age: 36, kind: 'sibling' },
    { id: 'mom', age: 60, kind: 'parent' },
    { id: 'mate', age: 33, kind: 'partner' },
  ]);

  it('is only possible between living, unrelated adults who are attracted to each other', () => {
    expect(mayBeCouple(single, 'a', 'b', content)).toBe(true);
    // A minor, siblings, a parent and a child, and your own partner: never.
    expect(mayBeCouple(single, 'a', 'kid', content)).toBe(false);
    expect(mayBeCouple(single, 'sis', 'bro', content)).toBe(false);
    expect(mayBeCouple(single, 'mom', 'sis', content)).toBe(false);
    expect(mayBeCouple(single, 'mate', 'a', content)).toBe(false);
    // Someone with a partner of their own (E3), or already in a couple, isn't free.
    const taken = produce(single, (d) => {
      d.people.a!.life = { ...(d.people.a!.life ?? { tier: 'far', background: 'middle', level: 0, levelSince: 2000, children: [], troubles: [], recovered: [], gossip: 50 }), partner: { name: { first: 'Kit', last: 'Lee' }, genderCategory: 'woman', birthYear: 1990, canCarry: true, status: 'dating', since: 2030, statusSince: 2030 } };
    });
    expect(mayBeCouple(taken, 'a', 'b', content)).toBe(false);
    const dead = produce(single, (d) => {
      d.people.b!.alive = false;
    });
    expect(mayBeCouple(dead, 'a', 'b', content)).toBe(false);
    const aversion = produce(single, (d) => {
      d.people.b!.identity.attractedTo = ['man'];
      d.people.a!.identity.genderCategory = 'woman';
    });
    expect(mayBeCouple(aversion, 'a', 'b', content)).toBe(false);
  });

  it('forms couples among friends over the years, never with a minor or a relative, and a couple marries or splits', () => {
    const dating = withWeb((b) => ({ ...STILL(b), ties: { ...STILL(b).ties, context: { draws: 30, chance: 1, maxPerYear: 10, romance: 1 } } }));
    const next = step(single, dating);
    expect(tie(next, 'a', 'b')?.kind).toBe('dating');
    expect(tie(next, 'a', 'kid')?.kind).not.toBe('dating');
    for (const t of Object.values(next.web.ties)) if (t.kind === 'dating') expect([t.a, t.b]).toEqual(['a', 'b']);
    // The next year: they marry (no chance of a split).
    const marrying = withWeb((b) => ({ ...STILL(b), ties: { ...STILL(b).ties, couple: { ...b.ties.couple, marry: 1, afterYears: 0, breakup: [{ at: 0, x: 0 }] } } }));
    const later = step(produce(next, (d) => { d.web.ties[tieKey('a', 'b')]!.since = d.currentYear - 2; }), marrying);
    expect(tie(later, 'a', 'b')?.kind).toBe('married');
    expect(later.news.some((n) => n.lines.some((l) => l.kind === 'couple_wed'))).toBe(true);
    const splitting = withWeb((b) => ({ ...STILL(b), ties: { ...STILL(b).ties, couple: { ...b.ties.couple, marry: 0, afterYears: 0, breakup: [{ at: 0, x: 1 }] } } }));
    const apart = step(produce(next, (d) => { d.web.ties[tieKey('a', 'b')]!.since = d.currentYear - 2; }), splitting);
    expect(tie(apart, 'a', 'b')?.kind).toBe('friends');
    expect(webFailures(later, content)).toEqual([]);
  });

  it('is an invariant failure if a couple tie ever involves a minor or relatives', () => {
    const bad = produce(withTie(single, 'a', 'b', 'dating'), (d) => {
      d.web.ties[tieKey('a', 'b')]!.origin = 'context';
    });
    expect(webFailures(bad, content)).toEqual([]);
    const minor = withTie(single, 'a', 'kid', 'dating');
    expect(webFailures(minor, content).some((f) => f.includes('under'))).toBe(true);
    const kin = produce(withTie(single, 'sis', 'bro', 'dating'), (d) => {
      d.web.ties[tieKey('bro', 'sis')]!.origin = 'context';
    });
    expect(webFailures(kin, content).some((f) => f.includes('related'))).toBe(true);
  });

  it('is never made between people under 18 over a whole simulated life', () => {
    for (let i = 0; i < 12; i++) {
      let life = createLife({ mode: 'random', seed: `web-couples-${i}`, birthYear: 2000 }, content);
      for (let y = 0; y < 60 && life.phase !== 'dead'; y++) {
        life = playYear(life, content);
        expect(webFailures(life, content), `life ${i} age ${life.character.age}`).toEqual([]);
      }
    }
  });
});

describe('feuds', () => {
  const base = withTie(
    lifeWith([
      { id: 'a', age: 36, kind: 'sibling', affection: 70 },
      { id: 'b', age: 33, kind: 'sibling', affection: 70 },
    ]),
    'a',
    'b',
    'siblings',
    5,
  );
  const still = withWeb(STILL);

  it('begin when a tie falls below the set level, with a line of news and a side-taking event', () => {
    const feuding = withWeb((b) => ({ ...STILL(b), feud: { ...b.feud, sideChance: 1 } }));
    const next = step(base, feuding);
    expect(tie(next, 'a', 'b')?.feud).toMatchObject({ since: base.currentYear, aware: true });
    expect(tieStatus(tie(next, 'a', 'b')!, content)).toBe('feuding');
    expect(next.news.some((n) => n.lines.some((l) => l.kind === 'feud_began'))).toBe(true);
    const asked = next.scheduled.find((s) => content.registries.web.triggers.feudBegan.events.includes(s.eventId));
    expect(asked).toBeDefined();
    expect(Object.keys(asked!.cast).sort()).toEqual(['a', 'b']);
  });

  it('do not begin in the year a tie is made', () => {
    const fresh = produce(base, (d) => {
      d.web.ties[tieKey('a', 'b')]!.since = d.currentYear;
    });
    expect(tie(step(fresh, still), 'a', 'b')?.feud).toBeUndefined();
  });

  it('cost you affection with both sides each year you stay neutral, and nothing once you take a side', () => {
    const feud = produce(base, (d) => {
      d.web.ties[tieKey('a', 'b')]!.feud = { since: d.currentYear - 2, neutral: true, aware: true };
    });
    const year1 = step(feud, still);
    expect(year1.relationships.a!.affection).toBe(70 - bal.feud.neutralCost);
    expect(year1.relationships.b!.affection).toBe(70 - bal.feud.neutralCost);
    const sided = produce(feud, (d) => {
      applyEffects(d, [{ type: 'tie', a: 'a', b: 'b', action: 'side', with: 'a' }], { def: { id: 'x', rarity: 'common' }, cast: { a: 'a', b: 'b' }, rng: d.rng, content });
    });
    expect(tie(sided, 'a', 'b')!.feud).toMatchObject({ side: 'a' });
    const year2 = step(sided, still);
    expect(year2.relationships.a!.affection).toBe(70);
    expect(year2.relationships.b!.affection).toBe(70);
    // A feud nobody has told you about costs you nothing.
    const unknown = produce(base, (d) => {
      d.web.ties[tieKey('a', 'b')]!.feud = { since: d.currentYear - 2 };
    });
    expect(step(unknown, still).relationships.a!.affection).toBe(70);
  });

  it('change how both sides feel about you when you take a side in the event', () => {
    const feud = produce(base, (d) => {
      d.web.ties[tieKey('a', 'b')]!.feud = { since: d.currentYear, aware: true };
    });
    const def = content.events.feud_siblings_side!;
    const side = def.choices!.find((c) => c.id === 'side_a')!.outcome!;
    const after = produce(feud, (d) => {
      applyEffects(d, side.effects as Effect[], { def, cast: { a: 'a', b: 'b' }, rng: d.rng, content });
    });
    expect(after.relationships.a!.affection).toBeGreaterThan(feud.relationships.a!.affection);
    expect(after.relationships.b!.affection).toBeLessThan(feud.relationships.b!.affection);
    expect(tie(after, 'a', 'b')!.feud!.side).toBe('a');
  });

  it('end by time (healing), by mediation, and by an event that reconciles them', () => {
    const feud = produce(base, (d) => {
      d.web.ties[tieKey('a', 'b')]!.feud = { since: d.currentYear - 4 };
      d.web.ties[tieKey('a', 'b')]!.affection = bal.feud.end - 2;
    });
    const healing = withWeb((b) => ({ ...STILL(b), feud: { ...b.feud, heal: { chance: 1, min: 5, max: 5 } } }));
    const healed = step(feud, healing);
    expect(tie(healed, 'a', 'b')!.feud).toBeUndefined();
    expect(tie(healed, 'a', 'b')!.affection).toBeGreaterThanOrEqual(bal.feud.endAffection);
    expect(healed.news.some((n) => n.lines.some((l) => l.kind === 'feud_ended'))).toBe(true);
    const mend = (delta: number) =>
      produce(feud, (d) => {
        d.web.ties[tieKey('a', 'b')]!.affection = 10;
        applyEffects(d, [{ type: 'tie', a: 'a', b: 'b', action: 'mend', delta }], { def: { id: 'x', rarity: 'common' }, cast: { a: 'a', b: 'b' }, rng: d.rng, content });
      });
    expect(tie(mend(10), 'a', 'b')!.feud).toBeDefined();
    expect(tie(mend(35), 'a', 'b')!.feud).toBeUndefined();
    const reconciled = produce(feud, (d) => {
      applyEffects(d, [{ type: 'tie', a: 'a', b: 'b', action: 'reconcile' }], { def: { id: 'x', rarity: 'common' }, cast: { a: 'a', b: 'b' }, rng: d.rng, content });
    });
    expect(tie(reconciled, 'a', 'b')!.feud).toBeUndefined();
  });

  it('form and end over simulated lives, not everywhere', () => {
    let began = 0;
    let ended = 0;
    let tieYears = 0;
    let feudYears = 0;
    for (let i = 0; i < 25; i++) {
      let life = createLife({ mode: 'random', seed: `web-feuds-${i}`, birthYear: 2000 }, content);
      for (let y = 0; y < 70 && life.phase !== 'dead'; y++) {
        const prev = life.web.ties;
        life = playYear(life, content);
        for (const [key, t] of Object.entries(life.web.ties)) {
          tieYears++;
          if (t.feud) feudYears++;
          if (t.feud && !prev[key]?.feud) began++;
          if (!t.feud && prev[key]?.feud) ended++;
        }
      }
    }
    expect(began).toBeGreaterThan(5);
    expect(ended).toBeGreaterThan(0);
    expect(feudYears / tieYears).toBeLessThan(0.08);
  }, 120_000);
});

describe('gossip', () => {
  /** You, with a chain of people: s (saw it) – a – b – c, and d tied only to c. */
  const chain = (): LifeState => {
    let life = lifeWith([
      { id: 's', age: 30, kind: 'friend', affection: 70 },
      { id: 'a', age: 31, kind: 'friend', affection: 70 },
      { id: 'b', age: 32, kind: 'friend', affection: 70 },
      { id: 'c', age: 33, kind: 'friend', affection: 70 },
      { id: 'z', age: 34, kind: 'friend', affection: 70 },
    ]);
    life = withTie(withTie(withTie(life, 's', 'a', 'friends'), 'a', 'b', 'friends'), 'b', 'c', 'friends');
    return withItem(life, 'jobLoss', 'fired', { s: { version: 'fired' } });
  };
  const gossip = withWeb(GOSSIPY);

  it('spreads along ties only, a step at a time', () => {
    const one = step(chain(), gossip);
    expect(Object.keys(one.web.items[0]!.holders).sort()).toEqual(['a', 's']);
    // The next year it goes one step further (nothing crosses the whole web in a year).
    const two = step(produce(one, (d) => { d.currentYear += 1; }), gossip);
    expect(Object.keys(two.web.items[0]!.holders).sort()).toEqual(['a', 'b', 's']);
    // Nobody tied to no one hears it.
    expect(two.web.items[0]!.holders.z).toBeUndefined();
  });

  it('twists at the set rate, and different people can hold different versions', () => {
    const twisty = withWeb((b) => ({ ...GOSSIPY(b), knowledge: { ...GOSSIPY(b).knowledge, twist: { chance: 0.3, secret: 0.3 } } }));
    let passes = 0;
    let twists = 0;
    const versions = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const life = produce(chain(), (d) => {
        d.rng = createRng(`twist-${i}`);
      });
      const next = step(life, twisty);
      for (const [id, h] of Object.entries(next.web.items[0]!.holders)) {
        if (h.from === 'saw') continue;
        passes++;
        if (h.version !== 'fired') twists++;
        versions.add(`${id}:${h.version}`);
      }
    }
    expect(passes).toBe(400);
    const rate = twists / passes;
    expect(rate).toBeGreaterThan(0.2);
    expect(rate).toBeLessThan(0.4);
    // The same story reached different people in different versions.
    expect(new Set([...versions].map((v) => v.split(':')[1])).size).toBeGreaterThan(1);
  });

  it('every twisted version is one the content defines, and can be read as what someone heard', () => {
    const life = chain();
    for (const kind of Object.keys(content.registries.web.kinds)) {
      const def = content.registries.web.kinds[kind as keyof typeof content.registries.web.kinds];
      for (const [vid, v] of Object.entries(def.versions)) {
        for (const t of v.twists) expect(def.versions[t.to], `${kind}.${vid} → ${t.to}`).toBeDefined();
        const item: KnowledgeItem = { id: 'k1', kind, subject: 'you', other: 'a', year: 2030, truth: def.truths[0]!, holders: {} };
        expect(heardText(life, item, vid, content), `${kind}.${vid}`).toMatch(/^that /);
        if (v.heardAbout) expect(heardText(life, { ...item, subject: 'a' }, vid, content), `${kind}.${vid} about`).toMatch(/^that /);
      }
    }
  });

  it('is reacted to by the version each person believes: how they feel about you changes, by what they are to you', () => {
    let life = lifeWith([
      { id: 's', age: 30, kind: 'friend', affection: 70 },
      { id: 'a', age: 31, kind: 'friend', affection: 70 },
      { id: 'm', age: 60, kind: 'parent', affection: 70 },
    ]);
    life = withTie(withTie(life, 's', 'a', 'friends'), 's', 'm', 'parentChild');
    life = withItem(life, 'jobLoss', 'fired', { s: { version: 'fired_stealing' } });
    const twist = withWeb((b) => GOSSIPY(b));
    const next = step(life, twist);
    const def = content.registries.web.kinds.jobLoss.versions.fired_stealing!;
    const scale = bal.knowledge.reaction.scale;
    expect(next.relationships.a!.affection).toBe(70 + Math.round(def.affection * (scale.friend ?? 1)));
    expect(next.relationships.m!.affection).toBe(70 + Math.round(def.affection * (scale.parent ?? 1)));
    expect(next.relationships.a!.trust).toBeLessThan(60);
    // A softer version moves them less.
    const soft = step(withItem(withTie(lifeWith([{ id: 's', age: 30, kind: 'friend', affection: 70 }, { id: 'a', age: 31, kind: 'friend', affection: 70 }]), 's', 'a', 'friends'), 'jobLoss', 'laid_off', { s: { version: 'laid_off' } }), twist);
    expect(soft.relationships.a!.affection).toBeGreaterThanOrEqual(70);
  });

  it('can have a close person come to you in an event about what they heard, once', () => {
    let life = lifeWith([
      { id: 's', age: 30, kind: 'friend', affection: 70 },
      { id: 'a', age: 31, kind: 'friend', affection: 70 },
    ]);
    life = withItem(withTie(life, 's', 'a', 'friends'), 'jobLoss', 'fired', { s: { version: 'fired_stealing' } });
    const next = step(life, gossip);
    const queued = next.scheduled.filter((s) => content.registries.web.kinds.jobLoss.reactions.includes(s.eventId));
    expect(queued).toHaveLength(1);
    expect(queued[0]!.cast.npc).toBe('a');
    expect(queued[0]!.cast[ITEM_ROLE]).toBe(next.web.items[0]!.id);
    // They have reacted, so hearing it again next year brings no second event.
    expect(next.web.items[0]!.holders.a!.reacted).toBe(true);
    const again = step(next, gossip);
    expect(again.scheduled.filter((s) => content.registries.web.kinds.jobLoss.reactions.includes(s.eventId) && s.cast.npc === 'a')).toHaveLength(1);
  });

  it('reads as the version they believe on their page ("What they\'ve heard"), for close people only', () => {
    let life = lifeWith([
      { id: 'a', age: 31, kind: 'friend', affection: 80 },
      { id: 'q', age: 31, kind: 'acquaintance', affection: 30 },
    ]);
    life = produce(life, (d) => {
      d.people.a!.life = { tier: 'close', background: 'middle', level: 0, levelSince: 2000, partner: null, children: [], troubles: [], recovered: [], gossip: 50 };
      d.people.q!.life = { tier: 'far', background: 'middle', level: 0, levelSince: 2000, partner: null, children: [], troubles: [], recovered: [], gossip: 50 };
    });
    life = withItem(life, 'jobLoss', 'fired', { a: { version: 'fired_stealing', from: 'q' }, q: { version: 'fired', from: 'saw' } });
    const heard = getHeard(life, 'a', content);
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ text: 'that you were fired for stealing', distorted: true, learned: 'gossip' });
    expect(getHeard(life, 'q', content)).toEqual([]);
  });
});

describe('secrets', () => {
  const quiet = withWeb((b) => ({ ...STILL(b), knowledge: { ...b.knowledge, spread: { ...b.knowledge.spread, base: 0 } } }));

  it('start known only to whoever witnessed them: an affair to the other person, then reach your partner through the existing discovery events', () => {
    let life = lifeWith([
      { id: 'mate', age: 33, kind: 'partner', affection: 70 },
      { id: 'lover', age: 31, kind: 'acquaintance', affection: 60 },
      { id: 'pal', age: 33, kind: 'friend', affection: 70 },
    ]);
    life = produce(life, (d) => {
      d.relationships.mate!.kindSince = d.currentYear - 1;
      betray(d, 'lover', 'intimate', createRng('affair'), { ...content, balance: { ...content.balance, interactions: { ...content.balance.interactions, infidelity: { ...content.balance.interactions.infidelity, discovery: { flirt: 0, intimate: 0 } } } } });
    });
    const first = step(life, quiet);
    const item = first.web.items.find((i) => i.kind === 'affair')!;
    expect(item).toBeDefined();
    expect(item.subject).toBe('you');
    expect(item.other).toBe('lover');
    expect(Object.keys(item.holders)).toEqual(['lover']);
    // The other person tells your partner (they're tied): the partner reacts, and the existing event for finding out is queued.
    const tied = withTie(first, 'lover', 'mate', 'friends');
    const out = step(tied, withWeb(GOSSIPY));
    expect(out.web.items[0]!.holders.mate).toMatchObject({ from: 'lover', reacted: true });
    expect(out.relationships.mate!.trust).toBeLessThan(first.relationships.mate!.trust);
    const found = out.scheduled.find((s) => ['cheating_found_out', 'affair_discovered'].includes(s.eventId));
    expect(found).toBeDefined();
    expect(found!.cast.partner ?? found!.cast.spouse).toBe('mate');
  });

  it('include who you are: accepting a change becomes an item, telling people yourself is not gossip', () => {
    let life = lifeWith([
      { id: 'mom', age: 60, kind: 'parent', affection: 80 },
      { id: 'pal', age: 33, kind: 'friend', affection: 80 },
    ]);
    life = produce(life, (d) => {
      d.character.identity.attractedTo = ['woman'];
      d.character.latent = { identity: { attractedTo: ['woman', 'man'] } };
      d.discovery.surfaced.attraction = { year: d.currentYear - 1, times: 1 };
      applyEffects(d, [{ type: 'identity', field: 'attraction', value: 'fromLatent' }], { def: { id: 'x', rarity: 'common' }, cast: {}, rng: createRng('identity'), content });
    });
    const item = life.web.items.find((i) => i.kind === 'identity')!;
    expect(item).toBeDefined();
    expect(item.subject).toBe('you');
    // Telling your friend yourself: they know the true version, and it's no gossip (they don't react).
    const told = produce(life, (d) => {
      applyEffects(d, [{ type: 'knowledge', role: 'pal', action: 'tell', kind: 'identity' }], { def: { id: 'x', rarity: 'common' }, cast: { pal: 'pal' }, rng: createRng('tell'), content });
    });
    expect(told.web.items.find((i) => i.kind === 'identity')!.holders.pal).toMatchObject({ from: 'you', reacted: true, version: 'identity' });
    // The friend tells your mother: she learns it from gossip, and the coming-out reaction comes to you.
    const withTies = withTie(told, 'pal', 'mom', 'friends');
    const out = step(withTies, withWeb(GOSSIPY));
    expect(out.web.items.find((i) => i.kind === 'identity')!.holders.mom).toMatchObject({ from: 'pal', reacted: true });
    const outed = out.scheduled.find((s) => s.eventId === 'outed_family');
    expect(outed).toBeDefined();
    expect(outed!.cast.npc).toBe('mom');
  });

  it('give the player a way to respond in every being-outed event, never forced', () => {
    for (const id of ['outed_family', 'outed_friend', 'outed_sibling', 'outed_partner']) {
      const def = content.events[id]!;
      expect(def.tone, id).toBe('serious');
      expect((def.choices ?? []).length, id).toBeGreaterThanOrEqual(3);
      // At least one answer that isn't a roll: asking for time or for quiet.
      expect((def.choices ?? []).some((c) => c.outcome !== undefined), id).toBe(true);
      // And the ways of telling go through the coming-out reactions: how they take it depends on how close you are.
      const telling = (def.choices ?? []).find((c) => c.check !== undefined)!;
      expect(telling.check!.stats.some((s) => 'key' in s && 'role' in s && s.key === 'affection'), id).toBe(true);
      expect(telling.check!.stats.some((s) => 'key' in s && 'role' in s && s.key === 'trust'), id).toBe(true);
    }
  });

  it('can be held by most of your circle: the secret becomes common knowledge, once', () => {
    let life = lifeWith(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ id, age: 30 + i, kind: 'friend' as const, affection: 70 })),
    );
    life = withItem(life, 'unknownCrime', 'crime', { a: { version: 'crime' }, b: { version: 'crime' }, c: { version: 'crime' }, d: { version: 'crime' }, e: { version: 'crime' } });
    const next = step(life, quiet);
    expect(next.web.items[0]!.public).toBe(true);
    expect(next.scheduled.some((s) => s.eventId === 'everyone_knows')).toBe(true);
    const again = step(next, quiet);
    expect(again.scheduled.filter((s) => s.eventId === 'everyone_knows')).toHaveLength(next.scheduled.filter((s) => s.eventId === 'everyone_knows').length);
  });

  it('stay secrets longer than other news (they spread at a share of the rate)', () => {
    const rate = (kind: string, truth: string) => {
      let hops = 0;
      for (let i = 0; i < 300; i++) {
        let life = lifeWith([{ id: 's', age: 30, kind: 'friend', affection: 70 }, { id: 'a', age: 31, kind: 'friend', affection: 70 }]);
        life = withItem(withTie(life, 's', 'a', 'friends'), kind, truth, { s: { version: truth } });
        life = produce(life, (d) => {
          d.rng = createRng(`rate-${i}`);
        });
        const next = step(life, withWeb((b) => ({ ...STILL(b), knowledge: { ...b.knowledge, spread: { ...b.knowledge.spread, base: 0.3, gossip: 0, loyalty: 0, secret: 0.3 }, twist: { chance: 0, secret: 0 }, reaction: { ...b.knowledge.reaction, eventChance: 0 } } })));
        if (next.web.items[0]!.holders.a) hops++;
      }
      return hops / 300;
    };
    expect(rate('unknownCrime', 'crime')).toBeLessThan(rate('arrest', 'arrested') * 0.7);
  });
});

describe('introducing people', () => {
  const life = (): LifeState =>
    lifeWith([
      { id: 'p', age: 30, kind: 'friend', affection: 80 },
      { id: 'q', age: 31, kind: 'friend', affection: 70 },
      { id: 'kid', age: 12, kind: 'friend', affection: 70 },
      { id: 'far', age: 31, kind: 'friend', affection: 70, cityId: Object.keys(content.cities).find((c) => c !== lifeAtAge('web', 35).character.cityId)! },
    ]);

  it('is offered with someone you could introduce them to: people in your city, of their age group, they are not already tied to', () => {
    const l = life();
    const def = content.interactions.introduce!;
    expect(isInteractionAvailable(l, def, 'p', content)).toBe(true);
    const extras = defaultExtras(l, def, 'p', content);
    expect(extras.otherId).toBe('q');
    // A child can't be introduced to an adult, and nobody in another city can be met.
    expect(() => performInteraction(l, { interactionId: 'introduce', personId: 'p', otherId: 'kid' }, content)).toThrow(InvalidInputError);
    expect(() => performInteraction(l, { interactionId: 'introduce', personId: 'p', otherId: 'far' }, content)).toThrow(InvalidInputError);
    // It needs someone to introduce them to.
    expect(() => performInteraction(l, { interactionId: 'introduce', personId: 'p' }, content)).toThrow(InvalidInputError);
    const tied = withTie(l, 'p', 'q', 'friends');
    expect(isInteractionAvailable(tied, def, 'p', content)).toBe(false);
  });

  it('creates a tie: friends when it goes well, a rivalry when it goes badly, a feud when it backfires', () => {
    const l = life();
    const go = (tier: OutcomeTier) => {
      const bundle = forced(tier);
      return performInteraction(l, { interactionId: 'introduce', personId: 'p', otherId: 'q' }, bundle);
    };
    const good = go('good');
    expect(tie(good, 'p', 'q')).toMatchObject({ kind: 'friends', origin: 'introduced' });
    expect(tie(good, 'p', 'q')!.feud).toBeUndefined();
    const bad = go('bad');
    expect(tieStatus(tie(bad, 'p', 'q')!, content)).toBe('strained');
    const backfire = go('backfire');
    expect(tie(backfire, 'p', 'q')!.feud).toBeDefined();
    expect(good.pendingInteraction!.otherId).toBe('q');
    expect(webFailures(good, content)).toEqual([]);
    expect(getConnections(good, 'p', content).map((c) => c.personId)).toEqual(['q']);
    expect(getConnections(good, 'q', content).map((c) => c.personId)).toEqual(['p']);
  });

  it('can start a couple between adults who are free and attracted to each other, and only friends otherwise', () => {
    const l = life();
    const couple = performInteraction(l, { interactionId: 'introduce', personId: 'p', otherId: 'q' }, forced('great'));
    expect(tie(couple, 'p', 'q')).toMatchObject({ kind: 'dating', origin: 'introduced' });
    // Two minors: friends, never a couple.
    const kids = lifeWith([
      { id: 'k1', age: 12, kind: 'friend' },
      { id: 'k2', age: 13, kind: 'friend' },
    ], 30);
    const met = performInteraction(kids, { interactionId: 'introduce', personId: 'k1', otherId: 'k2' }, forced('great'));
    expect(tie(met, 'k1', 'k2')?.kind).toBe('friends');
    // Relatives: friends at most (they are tied already, so they can't even be introduced).
    const kin = step(lifeWith([{ id: 's1', age: 30, kind: 'sibling' }, { id: 's2', age: 33, kind: 'sibling' }]), withWeb(STILL));
    expect(tie(kin, 's1', 's2')?.kind).toBe('siblings');
    expect(introduceCandidatesOf(kin, 's1')).toEqual([]);
    // The engine refuses a romance the content asked for if the people are taken or related.
    const taken = produce(l, (d) => {
      d.people.q!.identity.attractedTo = ['man'];
      d.people.p!.identity.genderCategory = 'woman';
    });
    const friendsOnly = produce(taken, (d) => {
      applyIntroduce(d, { type: 'introduce', role: 'a', with: 'b', result: 'romance' }, { a: 'p', b: 'q' }, createRng('x'), content);
    });
    expect(tie(friendsOnly, 'p', 'q')?.kind).toBe('friends');
  });
});

describe('setting the record straight and asking them to keep it quiet', () => {
  const heardBy = (): LifeState => {
    let l = lifeWith([
      { id: 'a', age: 31, kind: 'friend', affection: 80 },
      { id: 'b', age: 32, kind: 'friend', affection: 80 },
    ]);
    l = withTie(l, 'a', 'b', 'friends');
    return withItem(l, 'unknownCrime', 'crime', { a: { version: 'crime_worse', from: 'b', reacted: true }, b: { version: 'crime' } });
  };
  const item = (l: LifeState) => l.web.items[0]!;

  it('are offered only when they have heard a story that is not true, or a secret you could ask them to keep', () => {
    const l = heardBy();
    expect(availableInteractions(l, 'a', content).map((d) => d.id)).toEqual(expect.arrayContaining(['set_record_straight', 'keep_it_quiet']));
    // b knows the true version: nothing to set straight, but a secret to keep.
    const ids = availableInteractions(l, 'b', content).map((d) => d.id);
    expect(ids).not.toContain('set_record_straight');
    expect(ids).toContain('keep_it_quiet');
    const nobody = produce(l, (d) => {
      d.web.items = [];
    });
    expect(availableInteractions(nobody, 'a', content).map((d) => d.id)).not.toContain('set_record_straight');
    expect(() => performInteraction(l, { interactionId: 'set_record_straight', personId: 'a' }, content)).toThrow(InvalidInputError);
    expect(() => performInteraction(l, { interactionId: 'set_record_straight', personId: 'a', itemId: 'k999' }, content)).toThrow(InvalidInputError);
  });

  it('set the record straight: when it works they believe the true version, and it fails some of the time', () => {
    const l = heardBy();
    const ok = performInteraction(l, { interactionId: 'set_record_straight', personId: 'a', itemId: item(l).id }, forced('good'));
    expect(item(ok).holders.a!.version).toBe('crime');
    expect(ok.pendingInteraction!.text).toContain('that you');
    const no = performInteraction(l, { interactionId: 'set_record_straight', personId: 'a', itemId: item(l).id }, forced('neutral'));
    expect(item(no).holders.a!.version).toBe('crime_worse');
    // It depends on how they feel about you: over many rolls, a close friend believes you more often than a cold one.
    const tally = (affection: number) => {
      let believed = 0;
      for (let i = 0; i < 200; i++) {
        const start = produce(l, (d) => {
          d.relationships.a!.affection = affection;
          d.relationships.a!.trust = affection;
          d.rng = createRng(`straight-${i}`);
        });
        const done = performInteraction(start, { interactionId: 'set_record_straight', personId: 'a', itemId: item(start).id }, content);
        if (item(done).holders.a!.version === 'crime') believed++;
      }
      return believed;
    };
    expect(tally(90)).toBeGreaterThan(tally(15));
    expect(tally(90)).toBeGreaterThan(20);
    expect(tally(15)).toBeLessThan(200);
  });

  it('ask them to keep it quiet: they tell far fewer people for a while, and a backfire sends it further', () => {
    const l = heardBy();
    const hushed = performInteraction(l, { interactionId: 'keep_it_quiet', personId: 'a', itemId: item(l).id }, forced('good'));
    expect(item(hushed).holders.a!.hushed).toBe(hushed.currentYear);
    // Hushed people are not offered it again while it holds.
    expect(availableInteractions(hushed, 'a', content).map((d) => d.id)).not.toContain('keep_it_quiet');
    const wider = withTie(withTie(l, 'a', 'x', 'friends'), 'a', 'y', 'friends');
    const people = produce(wider, (d) => {
      for (const id of ['x', 'y']) {
        d.people[id] = { ...cloneJson(d.people.a!), id, name: { first: id.toUpperCase(), last: 'T' } };
        d.relationships[id] = { ...cloneJson(d.relationships.a!), personId: id, kind: 'friend' };
      }
    });
    const leaked = performInteraction(people, { interactionId: 'keep_it_quiet', personId: 'a', itemId: people.web.items[0]!.id }, forced('backfire'));
    expect(Object.keys(leaked.web.items[0]!.holders).length).toBeGreaterThan(Object.keys(people.web.items[0]!.holders).length);
    // A hushed holder spreads at a share of the rate.
    const rateWith = (hushed: boolean) => {
      let told = 0;
      for (let i = 0; i < 300; i++) {
        let s = withTie(withTie(people, 'a', 'x', 'friends'), 'a', 'y', 'friends');
        if (hushed) s = produce(s, (d) => { d.web.items[0]!.holders.a!.hushed = d.currentYear; });
        s = produce(s, (d) => { d.rng = createRng(`hush-${i}`); });
        const next = step(s, withWeb((b) => ({ ...STILL(b), knowledge: { ...b.knowledge, spread: { ...b.knowledge.spread, base: 0.4, gossip: 0, loyalty: 0, secret: 1 }, twist: { chance: 0, secret: 0 }, reaction: { ...b.knowledge.reaction, eventChance: 0 } } })));
        told += ['x', 'y'].filter((id) => next.web.items[0]!.holders[id]).length;
      }
      return told;
    };
    expect(rateWith(true)).toBeLessThan(rateWith(false) * 0.5);
  });

  it('cast {heard} as what they have heard in the card text', () => {
    const l = heardBy();
    const ok = performInteraction(l, { interactionId: 'set_record_straight', personId: 'a', itemId: item(l).id }, forced('good'));
    expect(ok.pendingInteraction!.text).toMatch(/Na heard that you're mixed up in something criminal/);
  });
});

describe('events from the web', () => {
  it('only fit the tie or the story they are about', () => {
    const life = withTie(lifeWith([{ id: 'a', age: 36, kind: 'sibling' }, { id: 'b', age: 33, kind: 'sibling' }]), 'a', 'b', 'siblings', 10);
    const feuding = produce(life, (d) => {
      d.web.ties[tieKey('a', 'b')]!.feud = { since: d.currentYear };
    });
    const def = content.events.feud_siblings_side!;
    expect(evaluate(def.requires, life, { cast: { a: 'a', b: 'b' }, roles: 'strict', content })).toBe(false);
    expect(evaluate(def.requires, feuding, { cast: { a: 'a', b: 'b' }, roles: 'strict', content })).toBe(true);
    // A reaction needs that they have heard it.
    const rumor = content.events.rumor_job_loss!;
    expect(evaluate(rumor.requires, feuding, { cast: { npc: 'a' }, roles: 'strict', content })).toBe(false);
  });

  it('are queued with the item they are about in the cast, and every web event has a path to being picked', () => {
    const life = lifeWith([{ id: 'a', age: 36, kind: 'friend' }, { id: 'b', age: 33, kind: 'friend' }]);
    const rolled = castEvent(life, content.events.rumor_job_loss!, createRng('cast'), content, { npc: 'a', [ITEM_ROLE]: 'k1' });
    expect(rolled?.cast[ITEM_ROLE]).toBe('k1');
    const reg = content.registries.web;
    const listed = new Set([...Object.values(reg.triggers).flatMap((t) => t.events), ...Object.values(reg.kinds).flatMap((k) => k.reactions)]);
    for (const [id, def] of Object.entries(content.events)) if (def.category === 'web') expect(listed.has(id), id).toBe(true);
    expect([...listed].filter((id) => content.events[id]?.category === 'web').length).toBeGreaterThanOrEqual(35);
  });
});

describe('the web over whole lives', () => {
  it('keeps every invariant and replays exactly from the input log', () => {
    let life = lifeAtAge('web-whole', 0);
    for (let y = 0; y < 50 && life.phase !== 'dead'; y++) {
      life = playYear(life, content);
      expect(webFailures(life, content), `age ${life.character.age}`).toEqual([]);
    }
    expect(Object.keys(life.web.ties).length).toBeGreaterThan(0);
  });

  it('is empty-handed for a life that has not had its first year: nothing is invented', () => {
    const empty: WebState = emptyWeb();
    expect(empty).toEqual({ ties: {}, items: [], nextItem: 1, seen: [] });
    const life = produce(lifeAtAge('web-upgrade', 20), (d) => {
      d.web = emptyWeb();
    });
    const first = step(life);
    expect(Object.keys(first.web.ties).length).toBeGreaterThan(0);
    expect(first.web.items.every((i) => i.holders !== undefined)).toBe(true);
  });
});

/** The people you could introduce this person to (via the selector used by the picker). */
function introduceCandidatesOf(l: LifeState, id: string): string[] {
  const def = content.interactions.introduce!;
  const extras = defaultExtras(l, def, id, content);
  return extras.otherId ? [extras.otherId] : [];
}

