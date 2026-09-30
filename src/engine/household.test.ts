/** Living with a partner or spouse: moving in, sharing the housing cost, moving apart. */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { Effect, EventDef } from '../content/schemas';
import { isActionAvailable, isLifeActionAvailable, performAction } from './actions';
import { applyEffects } from './events/effects';
import { housingCost } from './housing';
import { checkInvariants } from './invariants';
import { createRng } from './rng';
import { getHomeView } from './selectors';
import { runEconomy } from './systems/economy';
import { lifeAtAge } from './testFixtures';
import type { LifeState, RelationshipKind } from './types';

const eco = content.balance.economy;
const def = { id: 'test', rarity: 'common' } as EventDef;
const apply = (life: LifeState, effects: Effect[], cast: Record<string, string> = { person: 'love' }) =>
  produce(life, (d) => applyEffects(d, effects, { def, cast, rng: createRng('household'), content }));
const moveIn: Effect = { type: 'housing', action: 'move_in_together', role: 'person' };

/** A 30-year-old in Chicago with a partner ("love") of `kind`, living `kind` of home. */
function couple(kind: RelationshipKind = 'partner', home: LifeState['housing']['kind'] = 'renting'): LifeState {
  return produce(lifeAtAge('household', 30), (d) => {
    d.character.cityId = 'chicago';
    d.character.birthCityId = 'chicago';
    for (const p of Object.values(d.people)) p.cityId = 'chicago';
    d.housing = { kind: home, cityId: 'chicago', annualCost: 0, since: d.currentYear - 1 };
    if (home === 'owned') d.housing.homeValue = 300_000;
    const template = Object.values(d.people)[0]!;
    d.people.love = {
      ...template,
      id: 'love',
      birthYear: d.currentYear - 30,
      alive: true,
      cityId: 'houston',
      identity: { ...template.identity, attractedTo: [d.character.identity.genderCategory] },
    };
    d.relationships.love = {
      personId: 'love',
      kind,
      status: 'active',
      affection: 70,
      trust: 70,
      memories: [],
      since: d.currentYear - 3,
      kindSince: d.currentYear - 2,
      ...(kind === 'spouse' ? { wasSpouse: true as const } : {}),
    };
  });
}

describe('living together', () => {
  it('a partner who moves in pays their share of the rent', () => {
    const life = couple();
    const together = apply(life, [moveIn]);
    expect(together.housing.partnerId).toBe('love');
    expect(together.people.love!.cityId).toBe('chicago');
    const rent = content.cities.chicago!.baseRent;
    expect(housingCost(together, content)).toBe(Math.round(rent * eco.housing.partnerShare));
    expect(together.housing.annualCost).toBe(Math.round(rent * eco.housing.partnerShare));
    expect(getHomeView(together, content).partnerName).toContain(together.people.love!.name.first);
    expect(checkInvariants(together, content)).toEqual([]);
    // The ledger charges only your share.
    const next = produce(together, (d) => runEconomy(d, content));
    expect(next.finances.lastLedger!.housing).toBe(Math.round(rent * eco.housing.partnerShare));
  });

  it('shares an owned home’s upkeep; the mortgage stays yours', () => {
    const owner = apply(couple('spouse', 'owned'), [moveIn]);
    expect(housingCost(owner, content)).toBe(Math.round(300_000 * eco.ownership.upkeep * eco.housing.partnerShare));
  });

  it('from your parents’ home, the two of you rent a place; a roommate moves out', () => {
    const atHome = apply(couple('fiance', 'with_parents'), [moveIn]);
    expect(atHome.housing).toMatchObject({ kind: 'renting', partnerId: 'love' });
    const withRoommate = produce(couple(), (d) => void (d.housing.roommate = true));
    const moved = apply(withRoommate, [moveIn]);
    expect(moved.housing.roommate).toBeUndefined();
    expect(moved.housing.partnerId).toBe('love');
    // No roommate while living together.
    expect(apply(moved, [{ type: 'housing', action: 'roommate' }]).housing.roommate).toBeUndefined();
    expect(isLifeActionAvailable(moved, 'find_roommate', {}, content)).toBe(false);
  });

  it('only a current partner moves in', () => {
    const friend = produce(couple(), (d) => void (d.relationships.love!.kind = 'friend'));
    expect(apply(friend, [moveIn]).housing.partnerId).toBeUndefined();
  });

  it('moves apart on a breakup or divorce: you keep the home and its whole cost', () => {
    for (const [kind, ended] of [
      ['partner', 'ex'],
      ['spouse', 'ex'],
    ] as const) {
      const together = apply(couple(kind), [moveIn]);
      const apart = apply(together, [{ type: 'relationship', role: 'person', kind: ended }]);
      expect(apart.housing.partnerId).toBeUndefined();
      expect(apart.housing.kind).toBe('renting');
      expect(apart.housing.annualCost).toBe(content.cities.chicago!.baseRent);
      expect(apart.history.at(-1)!.tags).toContain('movedApart');
      expect(checkInvariants(apart, content)).toEqual([]);
    }
  });

  it('a partner who dies no longer lives with you, without a moving-out entry', () => {
    const together = apply(couple('spouse'), [moveIn]);
    const widowed = produce(together, (d) => {
      d.people.love!.alive = false;
      d.people.love!.deathYear = d.currentYear;
      runEconomy(d, content);
    });
    expect(widowed.housing.partnerId).toBeUndefined();
    expect(widowed.history.some((e) => e.tags.includes('movedApart'))).toBe(false);
  });

  it('a partner moves with you to a new city, but not back to your parents’', () => {
    const together = produce(apply(couple(), [moveIn]), (d) => void (d.finances.savings = 50_000));
    const moved = performAction(together, 'relocate', { cityId: 'nyc' }, content);
    expect(moved.housing).toMatchObject({ cityId: 'nyc', partnerId: 'love' });
    expect(moved.people.love!.cityId).toBe('nyc');
    expect(checkInvariants(moved, content)).toEqual([]);
  });

  it('the "move in together" action asks through an event, and is gone once you live together', () => {
    const life = couple();
    expect(isActionAvailable(life, 'move_in', 'love', content)).toBe(true);
    const asked = performAction(life, 'move_in', { personId: 'love' }, content);
    expect(asked.phase).toBe('action');
    expect(content.registries.actions.actions.move_in.events).toContain(asked.pending[0]!.eventId);
    expect(isActionAvailable(apply(life, [moveIn]), 'move_in', 'love', content)).toBe(false);
  });

  it('a partner living with you must be your current partner (invariant)', () => {
    const together = apply(couple(), [moveIn]);
    const broken = produce(together, (d) => void (d.relationships.love!.kind = 'ex'));
    expect(checkInvariants(broken, content)).toContain('housing.partnerId is not your current partner');
  });
});
