import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { eventSchema, type ContentBundle, type EventDef } from '../../content/schemas';
import { checkInvariants } from '../invariants';
import { beginYear, createLife, endYear, resolveChoice, SURPRISE_CHOICE } from '../life';
import { replayLife } from '../replay';
import { getEventCard } from '../selectors';
import { lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';

/** U1: event cards: the banner, icon and meter, "Surprise me", and the money lines of the life log. */

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
const withEvents = (...defs: EventDef[]): ContentBundle => ({ ...content, events: Object.fromEntries(defs.map((d) => [d.id, d])) });

const choices = [
  { id: 'a', label: 'A', outcome: { text: 'You chose A.', effects: [{ type: 'stat', key: 'happiness', delta: 1 }] } },
  { id: 'b', label: 'B', outcome: { text: 'You chose B.', effects: [{ type: 'stat', key: 'happiness', delta: 2 }] } },
  { id: 'secret', label: 'Secret', visibleIf: { age: { lt: 10 } }, outcome: {} },
];
const pickEvent = ev({ id: 'pick', autoOutcome: undefined, choices });
const bundle = withEvents(pickEvent);

/** A grown life with the pick event waiting. */
function waiting(seed: string): LifeState {
  const life = beginYear(lifeAtAge(seed, 40), bundle);
  return produce(life, (d) => {
    d.pending = [{ instanceId: 'x1', eventId: 'pick', cast: {} }];
    d.phase = 'events';
  });
}

describe('Surprise me', () => {
  it('picks one of the visible choices with the life’s seeded generator, and logs it as a surprise', () => {
    const life = waiting('surprise-1');
    const done = resolveChoice(life, 'x1', SURPRISE_CHOICE, bundle);
    expect(['a', 'b']).toContain(done.pending[0]!.resolvedChoiceId);
    expect(done.pending[0]!.outcomeText).toMatch(/You chose [AB]\./);
    expect(done.inputLog.at(-1)).toEqual({ year: life.currentYear, kind: 'choice', payload: { instanceId: 'x1', choiceId: SURPRISE_CHOICE } });
    expect(checkInvariants(done, bundle)).toEqual([]);
  });

  it('is deterministic for a seed, never picks a hidden choice, and varies across seeds', () => {
    const picks = new Set<string>();
    for (let i = 0; i < 24; i++) {
      const first = resolveChoice(waiting(`surprise-seed-${i}`), 'x1', SURPRISE_CHOICE, bundle).pending[0]!.resolvedChoiceId!;
      const again = resolveChoice(waiting(`surprise-seed-${i}`), 'x1', SURPRISE_CHOICE, bundle).pending[0]!.resolvedChoiceId!;
      expect(again).toBe(first);
      picks.add(first);
    }
    expect([...picks].sort()).toEqual(['a', 'b']);
  });

  it('draws from the generator, so the draws after it differ from a plain choice', () => {
    const life = waiting('surprise-rng');
    const plain = resolveChoice(life, 'x1', 'a', bundle);
    const surprise = resolveChoice(life, 'x1', SURPRISE_CHOICE, bundle);
    expect(surprise.rng).not.toEqual(plain.rng);
  });

  it('replays exactly from the input log', () => {
    const everyYear = ev({ id: 'pick', autoOutcome: undefined, choices, lifeStages: ['early', 'child', 'teen', 'youngAdult', 'adult', 'senior'], weight: { base: 1000 } });
    const replayBundle = withEvents(everyYear);
    let life = createLife({ mode: 'random', seed: 'surprise-replay', birthYear: 2000, countryId: 'us' }, replayBundle);
    let surprises = 0;
    for (let year = 0; year < 8; year++) {
      life = beginYear(life, replayBundle);
      for (const p of life.pending) {
        if (p.resolvedChoiceId === undefined) {
          life = resolveChoice(life, p.instanceId, SURPRISE_CHOICE, replayBundle);
          surprises++;
        }
      }
      life = endYear(life, replayBundle);
    }
    expect(surprises).toBeGreaterThan(0);
    const rebuilt = replayLife(life.inputLog, replayBundle);
    expect(rebuilt).toEqual(life);
  });

  it('refuses an event with no choices, and an unknown choice', () => {
    const auto = ev({ id: 'auto' });
    const life = produce(beginYear(lifeAtAge('surprise-auto', 40), withEvents(pickEvent, auto)), (d) => {
      d.pending = [
        { instanceId: 'x1', eventId: 'pick', cast: {} },
        { instanceId: 'x2', eventId: 'auto', cast: {} },
      ];
      d.phase = 'events';
    });
    expect(() => resolveChoice(life, 'x2', SURPRISE_CHOICE, withEvents(pickEvent, auto))).toThrow(/no choices/);
    expect(() => resolveChoice(life, 'x1', 'nope', bundle)).toThrow(/not a choice/);
  });

  it('is offered on a card with two or more choices, and not on one without', () => {
    expect(getEventCard(waiting('surprise-offer'), 0, bundle)!.canSurprise).toBe(true);
    const auto = ev({ id: 'auto' });
    const life = produce(beginYear(lifeAtAge('surprise-offer-2', 40), withEvents(auto)), (d) => {
      d.pending = [{ instanceId: 'x2', eventId: 'auto', cast: {} }];
      d.phase = 'events';
    });
    expect(getEventCard(life, 0, withEvents(auto))!.canSurprise).toBe(false);
  });
});

describe('the card’s banner, icon and meter', () => {
  const pending = (life: LifeState, eventId: string, cast: Record<string, string> = {}): LifeState =>
    produce(life, (d) => {
      d.pending = [{ instanceId: 'x1', eventId, cast }];
      d.phase = 'events';
    });

  it('takes the banner and icon from the event’s category by default', () => {
    const card = getEventCard(pending(lifeAtAge('card-default', 40), 'pick'), 0, bundle)!;
    expect(card.banner).toEqual({ id: 'family', label: 'Family' });
    expect(card.icon).toBe(content.registries.banners.banners.family!.icon);
    expect(card.meter).toBeNull();
  });

  it('lets an event pick its own banner and icon', () => {
    const own = ev({ id: 'own', banner: 'money', icon: 'fire' });
    const card = getEventCard(pending(lifeAtAge('card-own', 40), 'own'), 0, withEvents(own))!;
    expect(card.banner).toEqual({ id: 'money', label: 'Money' });
    expect(card.icon).toBe('fire');
  });

  it('fills a meter from one of your stats', () => {
    const meter = ev({ id: 'meter', meter: { label: 'Your health', stat: 'health' } });
    const life = pending(lifeAtAge('card-meter', 40), 'meter');
    const card = getEventCard(life, 0, withEvents(meter))!;
    expect(card.meter).toEqual({ label: 'Your health', value: life.character.stats.health });
  });

  it('fills a meter from how a cast person feels about you', () => {
    const meter = ev({ id: 'bond', cast: { p: { kind: 'parent', presence: 'anywhere' } }, meter: { label: 'How close you feel', role: 'p', bond: 'affection' } });
    const life = lifeAtAge('card-bond', 40);
    const parent = Object.keys(life.relationships).find((id) => life.relationships[id]!.kind === 'parent')!;
    const card = getEventCard(pending(life, 'bond', { p: parent }), 0, withEvents(meter))!;
    expect(card.meter).toEqual({ label: 'How close you feel', value: life.relationships[parent]!.affection });
  });

  it('shows every real category under a banner that has an icon', () => {
    for (const category of Object.keys(content.registries.categories.categories)) {
      const banner = content.registries.banners.categories[category];
      expect(banner, category).toBeDefined();
      expect(content.registries.icons.icons[content.registries.banners.banners[banner!]!.icon], category).toBeDefined();
    }
  });

  it('rejects an event that names an unknown icon or meter field', () => {
    expect(() => ev({ id: 'x', meter: { label: 'x', stat: 'nope' } })).toThrow();
    expect(() => ev({ id: 'x', meter: { label: '', stat: 'health' } })).toThrow();
  });
});

describe('money lines in the life log', () => {
  const cost = ev({
    id: 'cost',
    autoOutcome: undefined,
    choices: [
      { id: 'pay', label: 'Pay', outcome: { text: 'You paid.', effects: [{ type: 'money', delta: -200 }] } },
      { id: 'history', label: 'Remember it', outcome: { text: 'It cost you.', effects: [{ type: 'money', delta: 300 }, { type: 'history', text: 'A windfall.', importance: 2 }] } },
      { id: 'nothing', label: 'Nothing', outcome: { text: 'Nothing.', effects: [] } },
    ],
  });
  const costBundle = withEvents(cost);
  const waitingCost = () =>
    produce(beginYear(lifeAtAge('log-money', 40), costBundle), (d) => {
      d.finances.savings = 1000;
      d.pending = [{ instanceId: 'x1', eventId: 'cost', cast: {} }];
      d.phase = 'events';
    });

  it('puts the amount and the balance on the event’s own history entry', () => {
    const done = resolveChoice(waitingCost(), 'x1', 'history', costBundle);
    const entry = done.history.find((e) => e.text === 'A windfall.')!;
    expect(entry.money).toEqual({ change: expect.any(Number), balance: done.finances.savings });
    expect(entry.money!.change).toBeGreaterThan(0);
  });

  it('adds a line of its own, with the outcome’s words, when the event wrote nothing', () => {
    const life = waitingCost();
    const done = resolveChoice(life, 'x1', 'pay', costBundle);
    const entry = done.history.at(-1)!;
    expect(entry.text).toBe('You paid.');
    expect(entry.importance).toBe(1);
    expect(entry.tags).toEqual(['event', 'cost', 'money']);
    expect(entry.money).toEqual({ change: done.finances.savings - 1000, balance: done.finances.savings });
    expect(entry.money!.change).toBeLessThan(0);
    expect(checkInvariants(done, costBundle)).toEqual([]);
  });

  it('writes nothing when no money moved', () => {
    const life = waitingCost();
    const done = resolveChoice(life, 'x1', 'nothing', costBundle);
    expect(done.history).toHaveLength(life.history.length);
  });
});
