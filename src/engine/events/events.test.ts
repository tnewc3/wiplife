import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { eventSchema, type ContentBundle, type EventDef } from '../../content/schemas';
import { playLife, resolveAll } from '../autoplay';
import { checkInvariants } from '../invariants';
import { beginYear, createLife, CONTINUE_CHOICE, endYear, PhaseError, resolveChoice } from '../life';
import { lifetimeHappiness } from '../obituary';
import { createRng } from '../rng';
import { getEventCard } from '../selectors';
import { runPacing, volatilityBonus } from '../systems/pacing';
import { cloneJson, lifeAtAge } from '../testFixtures';
import { renderText } from '../text';
import type { LifeState } from '../types';
import { castCandidates, castEvent, uncast } from './casting';
import { successChance } from './checks';
import { applyEffects } from './effects';
import { eventIndex, eventWeight } from './selection';
import { SELF_ROLE, sinceText, type EVENT_TEXT_VALUES } from './text';

/** An event with test defaults; override anything. */
function ev(overrides: Record<string, unknown>): EventDef {
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

/** The real content with only these events. */
function withEvents(...defs: EventDef[]): ContentBundle {
  return { ...content, events: Object.fromEntries(defs.map((d) => [d.id, d])) };
}

const adult = (seed = 'ev') => lifeAtAge(seed, 40);
const parentOf = (life: LifeState) => Object.keys(life.relationships).find((id) => life.relationships[id]!.kind === 'parent')!;
const ctx = (def: EventDef, cast: Record<string, string>, bundle = content) => ({ def, cast, rng: createRng('fx'), content: bundle });

describe('effect handlers', () => {
  const def = ev({ id: 'fx' });

  it('stat: changes stats, traits and hidden values, clamped to 0–100', () => {
    const life = produce(adult(), (d) => {
      d.character.stats.health = 98;
      applyEffects(d, [{ type: 'stat', key: 'health', delta: 5 }, { type: 'stat', key: 'kindness', delta: -500 }, { type: 'stat', key: 'luck', delta: 3 }], ctx(def, {}));
    });
    expect(life.character.stats.health).toBe(100);
    expect(life.character.personality.kindness).toBe(0);
    expect(life.character.hidden.luck).toBe(adult().character.hidden.luck + 3);
  });

  it('money: changes savings, never below zero', () => {
    const life = produce(adult(), (d) => {
      applyEffects(d, [{ type: 'money', delta: 300 }, { type: 'money', delta: -1000 }], ctx(def, {}));
    });
    expect(life.finances.savings).toBe(0);
    const richer = produce(adult(), (d) => applyEffects(d, [{ type: 'money', delta: 250 }], ctx(def, {})));
    expect(richer.finances.savings).toBe(250);
  });

  it('relationship, memory: change the cast person’s relationship', () => {
    const start = adult();
    const pid = parentOf(start);
    const life = produce(start, (d) => {
      d.relationships[pid]!.affection = 95;
      applyEffects(
        d,
        [
          { type: 'relationship', role: 'npc', affection: 10, trust: -200, status: 'estranged' },
          { type: 'memory', role: 'npc', tag: 'lent_money' },
        ],
        ctx(def, { npc: pid }),
      );
    });
    expect(life.relationships[pid]).toMatchObject({ affection: 100, trust: 0, status: 'estranged' });
    expect(life.relationships[pid]!.memories).toEqual([{ tag: 'lent_money', year: start.currentYear }]);
  });

  it('flag: sets a value', () => {
    const life = produce(adult(), (d) => applyEffects(d, [{ type: 'flag', key: 'has_dog', value: true }], ctx(def, {})));
    expect(life.flags.has_dog).toBe(true);
  });

  it('schedule: queues a follow-up within its window, carrying the named roles', () => {
    const start = adult();
    const pid = parentOf(start);
    for (let i = 0; i < 20; i++) {
      const life = produce(start, (d) =>
        applyEffects(d, [{ type: 'schedule', eventId: 'friend_repays', inYears: [2, 4], cast: ['npc'] }], {
          ...ctx(def, { npc: pid, other: 'p1' }),
          rng: createRng(`s${i}`),
        }),
      );
      const [item] = life.scheduled;
      expect(item!.dueYear - start.currentYear).toBeGreaterThanOrEqual(2);
      expect(item!.dueYear - start.currentYear).toBeLessThanOrEqual(4);
      expect(item!.cast).toEqual({ npc: pid });
      expect(item!.since).toBe(start.currentYear);
    }
  });

  it('{since}: says how long ago a follow-up was set up, in words (C1)', () => {
    const life = adult();
    const at = (since: number | undefined) => sinceText(life, since, content);
    expect(at(life.currentYear - 1)).toBe('last year');
    expect(at(life.currentYear - 3)).toBe('three years ago');
    expect(at(life.currentYear - 14)).toBe('14 years ago');
    expect(at(undefined)).toBe('a while ago');
  });

  it('history: writes a rendered entry; a legendary event marks it legendary', () => {
    const start = adult();
    const pid = parentOf(start);
    const legendary = ev({ id: 'leg', rarity: 'legendary' });
    const life = produce(start, (d) =>
      applyEffects(d, [{ type: 'history', text: 'You met {npc.name}.', importance: 3 }], ctx(legendary, { npc: pid })),
    );
    expect(life.history.at(-1)).toEqual({
      year: start.currentYear,
      age: 40,
      text: `You met ${start.people[pid]!.name.first}.`,
      tags: ['event', 'leg', 'legendary'],
      importance: 3,
      legendary: true,
    });
  });

  it('death: records the death; the year then ends the life with that cause', () => {
    const killer = ev({
      id: 'killer',
      choices: [
        { id: 'die', label: 'Die', outcome: { text: 'The end.', effects: [{ type: 'death', cause: 'skydiving_accident' }] } },
        { id: 'live', label: 'Live', outcome: {} },
      ],
      autoOutcome: undefined,
    });
    const quiet = ev({ id: 'quiet' });
    const bundle = withEvents(killer, quiet);
    const begun = produce(beginYear(adult('death-fx'), bundle), (d) => {
      d.pending = [
        { instanceId: 'a', eventId: 'killer', cast: {} },
        { instanceId: 'b', eventId: 'quiet', cast: {} },
      ];
      d.phase = 'events';
    });
    const afterChoice = resolveChoice(begun, 'a', 'die', bundle);
    expect(afterChoice.death?.causeId).toBe('skydiving_accident');
    expect(afterChoice.phase).toBe('yearEnd');
    expect(afterChoice.pending.map((p) => p.instanceId)).toEqual(['a']);
    expect(checkInvariants(afterChoice, bundle)).toEqual([]);
    const ended = endYear(afterChoice, bundle);
    expect(ended.phase).toBe('dead');
    expect(ended.pending).toEqual([]);
    expect(ended.history.at(-1)!.text).toContain('a skydiving accident');
    expect(checkInvariants(ended, bundle)).toEqual([]);
  });
});

describe('chance checks', () => {
  const check = { base: 50, stats: [{ key: 'confidence' as const, weight: 0.5 }], success: { effects: [] }, failure: { effects: [] } };
  const withTraits = (confidence: number, luck: number) =>
    produce(adult(), (d) => {
      d.character.personality.confidence = confidence;
      d.character.hidden.luck = luck;
    });

  it('add weighted stats and a luck nudge to the base', () => {
    expect(successChance(withTraits(50, 50), check, content)).toBeCloseTo(0.5);
    expect(successChance(withTraits(70, 50), check, content)).toBeCloseTo(0.6);
    expect(successChance(withTraits(50, 100), check, content)).toBeCloseTo(0.55);
  });

  it('are clamped to 5–95%', () => {
    expect(successChance(withTraits(100, 100), { ...check, base: 100 }, content)).toBe(0.95);
    expect(successChance(withTraits(0, 0), { ...check, base: 0 }, content)).toBe(0.05);
  });
});

describe('casting', () => {
  it('reuses someone who fits', () => {
    const life = adult('cast-existing');
    const result = castEvent(cloneJson(life), ev({ id: 'c', cast: { p: { kind: 'parent', presence: 'anywhere' } } }), createRng('c'), content);
    expect(life.relationships[result!.cast.p!]!.kind).toBe('parent');
    expect(result!.created).toEqual([]);
  });

  it('creates a friend when none fits, with a relationship starting this year', () => {
    const life = cloneJson(adult('cast-new'));
    const def = ev({ id: 'c', cast: { f: { kind: 'friend', ageOffset: { min: -2, max: 2 }, createIfMissing: true, presence: 'city' } } });
    const result = castEvent(life, def, createRng('c'), content)!;
    const id = result.cast.f!;
    expect(result.created).toEqual([id]);
    expect(life.relationships[id]).toMatchObject({ kind: 'friend', status: 'active', since: life.currentYear, memories: [] });
    expect(Math.abs(life.currentYear - life.people[id]!.birthYear - 40)).toBeLessThanOrEqual(2);
    expect(checkInvariants(life, content)).toEqual([]);
    uncast(life, result.created);
    expect(life.people[id]).toBeUndefined();
  });

  it('never creates family, and fails when a role can’t be filled', () => {
    const life = cloneJson(adult('cast-fail'));
    expect(castEvent(life, ev({ id: 'c', cast: { s: { kind: 'spouse', createIfMissing: true, presence: 'anywhere' } } }), createRng('c'), content)).toBeNull();
  });

  it('casts different people in different roles', () => {
    const life = cloneJson(adult('cast-two'));
    const parents = castCandidates(life, { kind: 'parent', presence: 'anywhere' }, content).length;
    const result = castEvent(life, ev({ id: 'c', cast: { a: { kind: 'parent', presence: 'anywhere' }, b: { kind: 'parent', presence: 'anywhere' } } }), createRng('c'), content);
    if (parents >= 2) expect(result!.cast.a).not.toBe(result!.cast.b);
    else expect(result).toBeNull();
  });

  it('drops a carried-over role whose person has died', () => {
    const life = produce(adult('cast-dead'), (d) => {
      const pid = parentOf(d);
      d.people[pid]!.alive = false;
      d.people[pid]!.deathYear = d.currentYear;
    });
    expect(castEvent(cloneJson(life), ev({ id: 'c', cast: { p: { kind: 'parent', presence: 'anywhere' } } }), createRng('c'), content, { p: parentOf(life) })).toBeNull();
  });

  it('filters by age', () => {
    const life = adult('cast-age');
    for (const p of castCandidates(life, { kind: 'parent', age: { min: 0, max: 10 }, presence: 'anywhere' }, content)) throw new Error(`unexpected ${p.id}`);
  });
});

describe('selection', () => {
  it('indexes events by life stage, leaving out follow-ups and retired events', () => {
    const index = eventIndex(content);
    for (const [stage, defs] of index) {
      for (const def of defs) {
        expect(def.lifeStages).toContain(stage);
        expect(def.followUpOnly).not.toBe(true);
        expect(def.retired).not.toBe(true);
      }
    }
  });

  it('gives zero weight to one-time events that happened, events on cooldown and failing requirements', () => {
    const life = adult('weights');
    const once = ev({ id: 'once', once: true });
    const cool = ev({ id: 'cool', cooldownYears: 3 });
    const req = ev({ id: 'req', requires: { age: { lt: 18 } } });
    const logged = produce(life, (d) => {
      d.eventLog.once = { count: 1, lastYear: d.currentYear - 10 };
      d.eventLog.cool = { count: 1, lastYear: d.currentYear - 2 };
    });
    expect(eventWeight(life, once, content)).toBe(10);
    expect(eventWeight(logged, once, content)).toBe(0);
    expect(eventWeight(logged, cool, content)).toBe(0);
    // Off cooldown, a repeat is less likely (C1): repeatWeight for each earlier time.
    const { repeatWeight } = content.balance.events;
    expect(eventWeight(produce(logged, (d) => void (d.currentYear += 1)), cool, content)).toBeCloseTo(10 * repeatWeight);
    expect(eventWeight(life, req, content)).toBe(0);
  });

  it('keeps full weight for recurring events that happened before (C1)', () => {
    const life = produce(adult('recurring'), (d) => {
      d.eventLog.yearly = { count: 3, lastYear: d.currentYear - 5 };
      d.eventLog.plain = { count: 2, lastYear: d.currentYear - 5 };
    });
    const { repeatWeight } = content.balance.events;
    expect(eventWeight(life, ev({ id: 'yearly', recurring: true }), content)).toBe(10);
    expect(eventWeight(life, ev({ id: 'plain' }), content)).toBeCloseTo(10 * repeatWeight * repeatWeight);
  });

  it('applies category cooldowns, rarity and modifiers', () => {
    const life = adult('weights-2');
    const wonder = ev({ id: 'w1', category: 'wonder' });
    const other = ev({ id: 'w2', category: 'wonder', rarity: 'rare', weight: { base: 10, modifiers: [{ if: { age: { gte: 18 } }, x: 3 }] } });
    const bundle = withEvents(wonder, other);
    expect(eventWeight(life, other, bundle)).toBeCloseTo(10 * content.balance.events.rarityWeight.rare * 3);
    const afterWonder = produce(life, (d) => void (d.eventLog.w1 = { count: 1, lastYear: d.currentYear - 1 }));
    expect(eventWeight(afterWonder, other, bundle)).toBe(0);
  });
});

describe('pacing director', () => {
  const years = (seed: string, count: number, bundle = content) => {
    const out: LifeState[] = [];
    let life = createLife({ mode: 'random', seed, birthYear: 2026 }, bundle);
    const choices = createRng(`${seed}:c`);
    for (let i = 0; i < count && life.phase !== 'dead'; i++) {
      life = beginYear(life, bundle);
      out.push(life);
      life = endYear(resolveAll(life, bundle, choices), bundle);
    }
    return out;
  };

  it('keeps each year within its stage budget plus the volatility bonus, never above the cap, without repeats', { timeout: 30_000 }, () => {
    const { budgets, cap, volatility } = content.balance.pacing;
    for (let s = 0; s < 20; s++) {
      for (const begun of years(`pace-${s}`, 90)) {
        const max = Math.min(cap, budgets[begun.character.lifeStage].max + volatility.maxBonus);
        // The budget limits the new events; follow-ups that fall due (and the ones systems queue) come first,
        // up to the cap, so a busy year can hold more than the stage's budget.
        expect(begun.pending.filter((p) => !content.events[p.eventId]!.followUpOnly).length).toBeLessThanOrEqual(max);
        expect(begun.pending.length).toBeLessThanOrEqual(cap);
        const ids = begun.pending.map((p) => p.eventId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it('orders the year’s events by tone', () => {
    const order = content.balance.pacing.toneOrder;
    for (const begun of years('tone', 80)) {
      const ranks = begun.pending.map((p) => order.indexOf(content.events[p.eventId]!.tone));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it('respects cooldowns and one-time events over whole lives', () => {
    for (let s = 0; s < 10; s++) {
      const seen = new Map<string, number[]>();
      for (const begun of years(`cool-${s}`, 120)) {
        for (const p of begun.pending) seen.set(p.eventId, [...(seen.get(p.eventId) ?? []), begun.currentYear]);
      }
      for (const [id, fired] of seen) {
        const def = content.events[id]!;
        if (def.once) expect(fired, id).toHaveLength(1);
        for (let i = 1; i < fired.length; i++) expect(fired[i]! - fired[i - 1]!, id).toBeGreaterThanOrEqual(def.cooldownYears ?? 1);
      }
    }
  });

  it('queues due follow-ups first and drops ones that can no longer happen', () => {
    const follow = ev({ id: 'follow', followUpOnly: true, cast: { p: { kind: 'parent', presence: 'anywhere' } } });
    const bundle = withEvents(follow, ev({ id: 'filler' }));
    const life = produce(adult('due'), (d) => {
      const pid = parentOf(d);
      d.currentYear += 1;
      d.character.age += 1;
      d.scheduled = [
        { eventId: 'follow', dueYear: d.currentYear, cast: { p: pid } },
        { eventId: 'gone_event', dueYear: d.currentYear, cast: {} },
        { eventId: 'follow', dueYear: d.currentYear + 3, cast: { p: pid } },
      ];
    });
    const after = produce(life, (d) => runPacing(d, bundle));
    expect(after.pending[0]!.eventId).toBe('follow');
    expect(after.pending.filter((p) => p.eventId === 'gone_event')).toEqual([]);
    expect(after.scheduled).toEqual([{ eventId: 'follow', dueYear: life.currentYear + 3, cast: { p: parentOf(life) } }]);
    expect(after.eventLog.follow).toEqual({ count: 1, lastYear: life.currentYear });
  });

  it('fires chain follow-ups within their delay window', { timeout: 60_000 }, () => {
    // stray_dog → dog_chews_shoes in 1–2 years (if the dog was kept).
    let checked = 0;
    for (let s = 0; s < 400 && checked < 5; s++) {
      const life = playLife(createLife({ mode: 'random', seed: `chain-${s}`, birthYear: 2026 }, content), content);
      const kept = life.history.find((e) => e.tags.includes('stray_dog'));
      if (!kept || !life.eventLog.dog_chews_shoes) continue;
      const delay = life.eventLog.dog_chews_shoes.lastYear - kept.year;
      expect(delay).toBeGreaterThanOrEqual(1);
      expect(delay).toBeLessThanOrEqual(2);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('adds a volatility bonus for risk-taking, recent major moments and new people', () => {
    const calm = produce(adult('vol'), (d) => {
      d.character.personality.riskTaking = 10;
      d.history = [];
    });
    expect(volatilityBonus(calm, content)).toBe(0);
    const wild = produce(calm, (d) => {
      d.character.personality.riskTaking = 90;
      d.history.push({ year: d.currentYear - 1, age: 39, text: 'x', tags: [], importance: 3 });
    });
    expect(volatilityBonus(wild, content)).toBe(2);
  });
});

describe('resolveChoice', () => {
  const choiceEvent = ev({
    id: 'pick',
    cast: { p: { kind: 'parent', presence: 'anywhere' } },
    autoOutcome: undefined,
    choices: [
      { id: 'hug', label: 'Hug {p.name}', outcome: { text: '{p.They} {p:smiles|smile}.', effects: [{ type: 'stat', key: 'happiness', delta: 1 }] } },
      { id: 'secret', label: 'Secret', visibleIf: { age: { lt: 10 } }, outcome: {} },
    ],
  });
  const auto = ev({ id: 'auto' });
  const bundle = withEvents(choiceEvent, auto);
  const setup = () => {
    const life = adult('resolve');
    const pid = parentOf(life);
    const begun = beginYear(life, bundle);
    return produce(begun, (d) => {
      d.pending = [
        { instanceId: 'x1', eventId: 'pick', cast: { p: pid } },
        { instanceId: 'x2', eventId: 'auto', cast: {} },
      ];
      d.phase = 'events';
    });
  };

  it('applies the outcome, renders its text and records the input', () => {
    const life = setup();
    const next = resolveChoice(life, 'x1', 'hug', bundle);
    const pronouns = life.people[life.pending[0]!.cast.p!]!.identity.pronouns;
    expect(next.pending[0]).toMatchObject({ resolvedChoiceId: 'hug' });
    expect(next.pending[0]!.outcomeText).toBe(renderText('{p.They} {p:smiles|smile}.', { roles: { p: { name: { first: '', last: '' }, pronouns } } }));
    expect(next.character.stats.happiness).toBe(Math.min(100, life.character.stats.happiness + 1));
    expect(next.inputLog.at(-1)).toEqual({ year: life.currentYear, kind: 'choice', payload: { instanceId: 'x1', choiceId: 'hug' } });
    expect(next.phase).toBe('events');
    const done = resolveChoice(next, 'x2', CONTINUE_CHOICE, bundle);
    expect(done.phase).toBe('yearEnd');
    expect(checkInvariants(done, bundle)).toEqual([]);
  });

  it('rejects unknown, hidden and repeated choices, and choices outside the events phase', () => {
    const life = setup();
    expect(() => resolveChoice(life, 'x1', 'nope', bundle)).toThrow(/not a choice/);
    expect(() => resolveChoice(life, 'x1', 'secret', bundle)).toThrow(/not a choice/);
    expect(() => resolveChoice(life, 'x2', 'hug', bundle)).toThrow(/no choices/);
    expect(() => resolveChoice(life, 'zz', 'hug', bundle)).toThrow(/No pending/);
    const once = resolveChoice(life, 'x1', 'hug', bundle);
    expect(() => resolveChoice(once, 'x1', 'hug', bundle)).toThrow(/already resolved/);
    expect(() => resolveChoice({ ...life, phase: 'yearStart' }, 'x1', 'hug', bundle)).toThrow(PhaseError);
  });

  it('shows only visible choices on the card', () => {
    const card = getEventCard(setup(), 0, bundle)!;
    expect(card.choices.map((c) => c.id)).toEqual(['hug']);
    expect(getEventCard(setup(), 1, bundle)!.choices).toEqual([{ id: CONTINUE_CHOICE, label: 'Continue' }]);
  });
});

describe('whole lives with events', () => {
  it('replay identically for the same seed and choices', () => {
    const a = playLife(createLife({ mode: 'random', seed: 'replay', birthYear: 2026 }, content), content);
    const b = playLife(createLife({ mode: 'random', seed: 'replay', birthYear: 2026 }, content), content);
    expect(a).toEqual(b);
    expect(a.inputLog.filter((r) => r.kind === 'choice').length).toBeGreaterThan(20);
  });

  it('keep the same queue after saving and reloading with events pending', () => {
    let life = createLife({ mode: 'random', seed: 'reload-events', birthYear: 2026 }, content);
    while (life.phase === 'yearStart') {
      life = beginYear(life, content);
      if (life.phase === 'events') break;
      life = endYear(life, content);
    }
    expect(life.phase).toBe('events');
    const reloaded = JSON.parse(JSON.stringify(life)) as LifeState;
    expect(reloaded.pending).toEqual(life.pending);
    const a = endYear(resolveAll(life, content, createRng('same')), content);
    const b = endYear(resolveAll(reloaded, content, createRng('same')), content);
    expect(b).toEqual(a);
  });

  it('track lifetime happiness for the obituary', () => {
    const life = playLife(createLife({ mode: 'random', seed: 'happy', birthYear: 2026 }, content), content);
    expect(life.lifetime.years).toBe(life.character.age);
    const average = lifetimeHappiness(life);
    expect(average).toBeGreaterThanOrEqual(0);
    expect(average).toBeLessThanOrEqual(100);
    expect(average).toBe(Math.round(life.lifetime.happinessTotal / life.lifetime.years));
  });
});

describe('event text', () => {
  it('renders every event, choice and outcome for she/her, he/him, they/them and xe/xem', () => {
    const presets = ['she_her', 'he_him', 'they_them', 'xe_xem'].map((id) => content.pronouns[id]!);
    for (const preset of presets) {
      // E3: a person you know also has what they are to you, a partner, a city and a job.
      const person = { name: { first: 'Ana', last: 'Ruiz' }, pronouns: preset, relation: 'friend', partner: 'Rowan', city: 'Chicago', job: 'an electrician' };
      const self = { name: person.name, pronouns: preset };
      for (const def of Object.values(content.events)) {
        // E5: an event that binds a pet can name it ({pet.name}, "it"), and use {petKind}, {vehicle} and {homeCity}.
        const pet = { name: { first: 'Biscuit', last: '' }, pronouns: { subject: 'it', object: 'it', possessive: 'its', possessivePronoun: 'its', reflexive: 'itself', verbPlural: false } };
        const roles = Object.fromEntries([...Object.keys(def.cast ?? {}).map((r) => [r, person] as const), [SELF_ROLE, self] as const, ...(def.bind?.includes('pet') ? [['pet', pet] as const] : [])]);
        const values = {
          age: 40,
          talent: 'music',
          latentPeople: 'men and women',
          latentGender: 'genderqueer',
          latentExpression: 'androgynous',
          latentTrait: 'a taste for risk you never let yourself have',
          sentence: 'a year in prison',
          since: 'two years ago',
          heard: 'that you were let go',
          petKind: 'dog',
          vehicle: 'sedan',
          homeCity: 'Chicago',
          clique: 'Back Bleacher',
          rival: 'Afterburn',
          school: 'Lincoln High',
          rule: 'curfew',
          activity: 'the soccer team',
          job: 'lifeguard',
          crew: 'the Cinder Row Outfit',
          rivalCrew: 'Marrow Street',
          rank: 'runner',
          project: 'Glass Weather',
          noun: 'album',
          review: 'A record that rewards a second listen.',
          fanLine: 'Played it forty times.',
          rungTitle: 'a signed act',
          nextTitle: 'artist with a hit',
          pathNoun: 'music',
          secondPath: 'acting',
          company: 'Brightline Music',
          agent: 'Dunmore Talent Group',
          award: 'the Halcyon Music Prize',
          headline: 'Star caught in the news',
        } satisfies Record<(typeof EVENT_TEXT_VALUES)[number] | 'petKind' | 'vehicle' | 'homeCity', string | number>;
        const context = { roles, values };
        const texts = [def.title, def.text, ...(def.choices ?? []).map((c) => c.label)];
        const outcomes = def.autoOutcome ? [def.autoOutcome] : (def.choices ?? []).flatMap((c) => (c.outcome ? [c.outcome] : [c.check!.success, c.check!.failure]));
        for (const o of outcomes) {
          if (o.text) texts.push(o.text);
          for (const e of o.effects) if (e.type === 'history') texts.push(e.text);
        }
        for (const t of texts) {
          const out = renderText(t, context);
          expect(out, `${def.id}: ${t}`).not.toMatch(/[{}]/);
          if (preset.id === 'xe_xem') expect(out, `${def.id}: hardcoded pronoun in "${out}"`).not.toMatch(/\b(he|she|him|her|his|hers|himself|herself)\b/i);
          // Verb agreement (Stage 10 editing pass): a pronoun placeholder needs {role:singular|plural} for its verb.
          if (preset.id === 'they_them') expect(out, `${def.id}: "they" with a singular verb in "${out}"`).not.toMatch(/\b[Tt]hey (is|was|has|does|doesn't|isn't|wasn't|hasn't)\b/);
          if (preset.id === 'he_him') expect(out, `${def.id}: "he" with a plural verb in "${out}"`).not.toMatch(/\b[Hh]e (are|were|have|don't|aren't|weren't|haven't)\b/);
          expect(out, `${def.id}: double space in "${out}"`).not.toMatch(/ {2}/);
        }
        // Contractions only after a pronoun that works for every pronoun set ("they'd", "she'll"; never "they're" or "she's").
        for (const t of texts) expect(t, `${def.id}: contraction after a pronoun placeholder`).not.toMatch(/\{\w+\.[Tt]hey\}'(s|re|ve|m)\b/);
      }
    }
  });
});
