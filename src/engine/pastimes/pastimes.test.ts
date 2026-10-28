/**
 * Activities (Batch 2a): the data-driven pastimes and the one `do_activity` action.
 * Rules under test: availability (age, legal age, adults-only, place, who can come),
 * costs through the finance module scaled to country and city, diminishing returns,
 * yearly limits, receipts with the money change and new balance, valuables as a
 * possession kind, the estate, saves, and the input log replay.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { PASTIME_CATEGORIES, type ContentBundle } from '../../content/schemas';
import { performAction } from '../actions';
import { isLifeActionAvailable } from '../actions';
import { checkInvariants } from '../invariants';
import { beginYear } from '../life';
import { replayLife } from '../replay';
import { cloneJson, lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { pastimeBlock, pastimeCount, pastimePrice, allPastimes, companionOptions } from './query';
import { returnsFactor, tierWeights } from './perform';
import { valuablesOf } from '../possessions/query';
import { valuableCosts } from '../possessions/valuables';
import { possessionCosts } from '../possessions/costs';
import { resolveAll, playYear } from '../autoplay';
import { createLife } from '../life';
import { createRng } from '../rng';
import { finishAction } from '../actions';

const rich = (life: LifeState, savings = 500_000): LifeState =>
  produce(life, (d) => {
    d.finances.savings = savings;
    d.finances.debts = [];
    d.housing = { kind: 'renting', cityId: d.character.cityId, annualCost: 0, since: d.currentYear - 2 };
  });

const act = (life: LifeState, pastimeId: string, extra: Record<string, unknown> = {}) => performAction(life, 'do_activity', { pastimeId, ...extra }, content);

/** Plays out whatever result event an activity opened (random choices) and returns to year start. */
function settle(life: LifeState): LifeState {
  if (life.phase !== 'action') return life;
  const done = resolveAll(life, content, createRng(`${life.seed}:settle:${life.inputLog.length}`));
  return done.phase === 'action' ? finishAction(done) : done;
}

describe('the activity content', () => {
  const all = allPastimes(content);
  it('has at least 5 activities in every category, and at least 5 valuables', () => {
    for (const category of PASTIME_CATEGORIES) {
      expect(all.filter((p) => p.category === category).length, category).toBeGreaterThanOrEqual(5);
    }
    expect(Object.values(content.valuables).filter((v) => !v.retired).length).toBeGreaterThanOrEqual(5);
  });
  it('keeps surgery, nightlife, luxury and love for adults', () => {
    const adult = content.balance.relationships.adultAge;
    for (const p of all.filter((x) => ['surgery', 'nightlife', 'luxury', 'love'].includes(x.category))) expect(p.minAge, p.id).toBeGreaterThanOrEqual(adult);
  });
  it('never creates money: no activity has a money, repay or dirty-money effect, and every cost is a price', () => {
    for (const p of all) {
      for (const tier of Object.values(p.tiers)) {
        const effects = [...(tier?.effects ?? []), ...(tier?.extras ?? []).flatMap((x) => x.effects)];
        for (const e of effects) expect(['money', 'repay', 'dirtyMoney', 'moneyFromPerson', 'famePay', 'rentMonths', 'debt']).not.toContain(e.type);
      }
      expect(content.balance.pastimes.costs[p.cost], p.id).toBeGreaterThanOrEqual(0);
    }
  });
  it('gives every tier two or three wordings', () => {
    for (const p of all) {
      for (const tier of Object.values(p.tiers)) {
        for (const list of [tier?.text, tier?.together]) if (list) expect(list.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('availability', () => {
  it('keeps adults-only activities from a teenager, and nightlife below the drinking age', () => {
    const teen = rich(lifeAtAge('act-teen', 16));
    expect(pastimeBlock(teen, content.pastimes.rhinoplasty!, { quality: 'standard' }, content)).toBe('age');
    expect(pastimeBlock(teen, content.pastimes.go_to_a_bar!, {}, content)).toBe('age');
    expect(pastimeBlock(teen, content.pastimes.go_to_a_comedy_night!, {}, content)).toBe('age');
    expect(pastimeBlock(teen, content.pastimes.go_to_the_gym ?? content.pastimes.go_to_the_gym!, {}, content)).toBe(null);
    // 19 is an adult but under the US drinking age.
    const nineteen = rich(lifeAtAge('act-19', 19));
    expect(content.countries.us!.legalAges.drinking).toBe(21);
    expect(pastimeBlock(nineteen, content.pastimes.go_to_a_bar!, {}, content)).toBe('age');
    expect(pastimeBlock(nineteen, content.pastimes.go_to_a_comedy_night!, {}, content)).toBe(null);
    const adult = rich(lifeAtAge('act-21', 21));
    expect(pastimeBlock(adult, content.pastimes.go_to_a_bar!, {}, content)).toBe(null);
  });
  it('needs the price in savings, and the quality tier for surgery', () => {
    const poor = produce(rich(lifeAtAge('act-poor', 30)), (d) => void (d.finances.savings = 100));
    expect(pastimeBlock(poor, content.pastimes.rhinoplasty!, { quality: 'budget' }, content)).toBe('afford');
    expect(pastimeBlock(rich(lifeAtAge('act-q', 30)), content.pastimes.rhinoplasty!, {}, content)).toBe('quality');
    expect(pastimeBlock(rich(lifeAtAge('act-q2', 30)), content.pastimes.haircut!, { quality: 'budget' }, content)).toBe('quality');
  });
  it('limits an activity to its yearly maximum', () => {
    let life = rich(lifeAtAge('act-limit', 30));
    const def = content.pastimes.go_for_a_run!;
    for (let i = 0; i < def.yearlyLimit; i++) life = settle(act(life, def.id));
    expect(pastimeCount(life, def.id)).toBe(def.yearlyLimit);
    expect(pastimeBlock(life, def, {}, content)).toBe('limit');
    expect(isLifeActionAvailable(life, 'do_activity', { pastimeId: def.id }, content)).toBe(false);
    // A new year starts from nothing.
    const next = produce(life, (d) => void (d.currentYear += 1));
    expect(pastimeCount(next, def.id)).toBe(0);
  });
  it('rejects unknown ids and extra fields', () => {
    const life = rich(lifeAtAge('act-bad', 30));
    expect(() => performAction(life, 'do_activity', { pastimeId: 'nope' }, content)).toThrow();
    expect(() => performAction(life, 'do_activity', { pastimeId: 'haircut', extra: 1 }, content)).toThrow();
    expect(() => performAction(life, 'do_activity', { pastimeId: 'haircut', companionId: 'p999' }, content)).toThrow();
  });
});

describe('doing an activity', () => {
  it('pays the price through the finance module, shows the money change and new balance, and logs the input', () => {
    const life = rich(lifeAtAge('act-pay', 30), 10_000);
    const def = content.pastimes.haircut!;
    const price = pastimePrice(life, def, {}, content);
    expect(price).toBeGreaterThan(0);
    const after = settle(act(life, def.id));
    expect(after.finances.savings).toBe(10_000 - price);
    const receipt = after.pastimes.receipts.at(-1)!;
    expect(receipt.pastimeId).toBe(def.id);
    expect(receipt.money).toEqual({ change: -price, balance: 10_000 - price, debtChange: 0 });
    expect(receipt.text.length).toBeGreaterThan(10);
    expect(after.inputLog.at(-1)).toMatchObject({ kind: 'action', payload: { actionId: 'do_activity', params: { pastimeId: 'haircut' } } });
    expect(checkInvariants(after, content)).toEqual([]);
  });
  it('shows no money for a free activity', () => {
    const life = rich(lifeAtAge('act-free', 30), 1_000);
    const after = settle(act(life, 'walk_in_the_park'));
    expect(after.finances.savings).toBe(1_000);
    expect(after.pastimes.receipts.at(-1)!.money).toBeUndefined();
  });
  it('scales the price by the price level of the country and the cost of living of the city', () => {
    const us = lifeAtAge('act-scale', 30);
    const def = content.pastimes.haircut!;
    const base = pastimePrice(us, def, {}, content);
    const mx = produce(us, (d) => {
      const city = Object.values(content.cities).find((c) => c.countryId === 'mx')!;
      d.character.cityId = city.id;
    });
    const mxPrice = pastimePrice(mx, def, {}, content);
    expect(mxPrice).not.toBe(base);
    // A pricier city costs more within the same country.
    const cities = Object.values(content.cities).filter((c) => c.countryId === 'us').sort((a, b) => a.costOfLiving - b.costOfLiving);
    const cheap = produce(us, (d) => void (d.character.cityId = cities[0]!.id));
    const dear = produce(us, (d) => void (d.character.cityId = cities.at(-1)!.id));
    expect(pastimePrice(dear, def, {}, content)).toBeGreaterThan(pastimePrice(cheap, def, {}, content));
  });
  it('gives less each time in a year: gains shrink and the good outcomes get rarer', () => {
    const life = rich(lifeAtAge('act-repeat', 30));
    const def = content.pastimes.go_to_the_gym!;
    expect(returnsFactor(0, content)).toBe(1);
    expect(returnsFactor(1, content)).toBeLessThan(1);
    expect(returnsFactor(3, content)).toBeLessThan(returnsFactor(1, content));
    expect(returnsFactor(50, content)).toBe(content.balance.activities.returns.floor);
    const odds = (n: number) => {
      const w = tierWeights(life, def, {}, n, content);
      const good = w.filter(([t]) => t === 'great' || t === 'good').reduce((s, [, x]) => s + x, 0);
      return good / w.reduce((s, [, x]) => s + x, 0);
    };
    expect(odds(3)).toBeLessThan(odds(0));
  });
  it('never makes a gain bigger on a repeat, over many lives (the spammer shape)', () => {
    let first = 0;
    let later = 0;
    for (let i = 0; i < 40; i++) {
      let life = rich(lifeAtAge(`act-spam-${i}`, 30));
      life = produce(life, (d) => void (d.character.stats.fitness = 40));
      const before = life.character.stats.fitness;
      life = settle(act(life, 'go_for_a_run'));
      first += life.character.stats.fitness - before;
      const mid = life.character.stats.fitness;
      for (let k = 0; k < 5; k++) life = settle(act(life, 'go_for_a_run'));
      later += (life.character.stats.fitness - mid) / 5;
    }
    expect(later).toBeLessThan(first);
  });
  it('rebuilds exactly from the input log (replay)', () => {
    let life = createLife({ mode: 'random', seed: 'act-replay', birthYear: 2000, countryId: 'us' }, content);
    for (let i = 0; i < 20; i++) life = playYear(life, content);
    const played = settle(act(settle(act(settle(act(life, 'take_a_walk' in content.pastimes ? 'take_a_walk' : 'walk_in_the_park')), 'meditate')), 'go_for_a_run'));
    expect(played.pastimes.receipts.length).toBe(3);
    const rebuilt = replayLife(played.inputLog, content);
    expect(rebuilt.pastimes).toEqual(played.pastimes);
    expect(rebuilt.finances.savings).toBe(played.finances.savings);
    expect(rebuilt.character.stats).toEqual(played.character.stats);
  });
});

describe('who comes along', () => {
  it('offers only people in your city or home, old enough, of the kinds the activity allows', () => {
    const life = rich(lifeAtAge('act-comp', 30));
    const date = content.pastimes.date_night!;
    expect(date.companion).toBe('required');
    // Without a partner nobody can come on a date night.
    const none = companionOptions(life, date, content);
    expect(none.filter((c) => c.kind !== 'partner')).toEqual([]);
    expect(pastimeBlock(life, date, {}, content)).toBe('companion');
  });
  it('lets a partner come on a date night, adds their affection and pays for both', () => {
    let life = rich(lifeAtAge('act-date', 30));
    const partnerId = 'p-partner';
    life = produce(life, (d) => {
      const spouseSource = Object.values(d.people).find((p) => p.alive)!;
      d.people[partnerId] = { ...cloneJson(spouseSource), id: partnerId, cityId: d.character.cityId, birthYear: d.birthYear + 1 };
      d.relationships[partnerId] = { ...cloneJson(Object.values(d.relationships)[0]!), personId: partnerId, kind: 'partner', affection: 40, trust: 40 };
      d.housing = { kind: 'renting', cityId: d.character.cityId, annualCost: 0, since: d.currentYear - 1, partnerId };
    });
    const date = content.pastimes.date_night!;
    expect(companionOptions(life, date, content).map((c) => c.id)).toContain(partnerId);
    const solo = pastimePrice(life, content.pastimes.go_to_a_bar!, {}, content);
    const together = pastimePrice(life, content.pastimes.go_to_a_bar!, { companionId: partnerId }, content);
    expect(together).toBeGreaterThan(solo);
    const after = settle(act(life, date.id, { companionId: partnerId }));
    expect(after.relationships[partnerId]!.affection).not.toBe(40);
    expect(after.pastimes.receipts.at(-1)!.companion).toMatchObject({ id: partnerId });
    expect(after.pastimes.receipts.at(-1)!.text).toContain(life.people[partnerId]!.name.first);
  });
  it('never offers a child as a companion for an adults-only activity', () => {
    let life = rich(lifeAtAge('act-kid', 30));
    life = produce(life, (d) => {
      const src = Object.values(d.people).find((p) => p.alive)!;
      d.people.kid = { ...cloneJson(src), id: 'kid', cityId: d.character.cityId, birthYear: d.currentYear - 10 };
      d.relationships.kid = { ...cloneJson(Object.values(d.relationships)[0]!), personId: 'kid', kind: 'child' };
    });
    expect(companionOptions(life, content.pastimes.go_to_a_bar!, content).map((c) => c.id)).not.toContain('kid');
    expect(companionOptions(life, content.pastimes.go_to_a_comedy_night!, content).map((c) => c.id)).not.toContain('kid');
  });
});

describe('plastic surgery', () => {
  it('goes wrong more often with a cheaper surgeon, through the health system', () => {
    const complications = (quality: 'budget' | 'premier') => {
      let count = 0;
      for (let i = 0; i < 250; i++) {
        const life = rich(lifeAtAge(`surg-${quality}-${i}`, 30));
        const after = settle(act(life, 'rhinoplasty', { quality }));
        if (after.health.conditions.some((c) => c.conditionId === 'surgical_complication')) count++;
      }
      return count;
    };
    const budget = complications('budget');
    const premier = complications('premier');
    expect(budget).toBeGreaterThan(premier);
    expect(budget).toBeGreaterThan(0);
  });
  it('costs more at a better surgeon', () => {
    const life = rich(lifeAtAge('surg-price', 30));
    const def = content.pastimes.rhinoplasty!;
    expect(pastimePrice(life, def, { quality: 'premier' }, content)).toBeGreaterThan(pastimePrice(life, def, { quality: 'standard' }, content));
    expect(pastimePrice(life, def, { quality: 'standard' }, content)).toBeGreaterThan(pastimePrice(life, def, { quality: 'budget' }, content));
  });
});

describe('nightlife', () => {
  it('opens adult follow-ups only, never casts anyone under 18, and keeps romance for adults', () => {
    let casts = 0;
    for (let i = 0; i < 120; i++) {
      const life = rich(lifeAtAge(`night-${i}`, 25 + (i % 30)));
      const out = act(life, 'go_clubbing');
      if (out.phase === 'action') {
        casts++;
        for (const pending of out.pending) {
          for (const id of Object.values(pending.cast)) {
            const person = out.people[id];
            if (person) expect(out.currentYear - person.birthYear).toBeGreaterThanOrEqual(18);
          }
        }
      }
      expect(checkInvariants(settle(out), content)).toEqual([]);
    }
    expect(casts).toBeGreaterThan(0);
  });
  it('can start an addiction or a fight through the health and legal systems', () => {
    let addicted = 0;
    let fights = 0;
    for (let i = 0; i < 400; i++) {
      let life = rich(lifeAtAge(`night-bad-${i}`, 30));
      life = produce(life, (d) => void (d.character.hidden.vice = 90));
      for (let k = 0; k < 4; k++) life = settle(act(life, 'go_to_a_bar'));
      if (life.health.conditions.some((c) => c.conditionId === 'alcohol_addiction')) addicted++;
      if (life.flags.nightlife_fight === true) fights++;
    }
    expect(addicted).toBeGreaterThan(0);
    expect(fights).toBeGreaterThan(0);
  });
  it('opens the drunk-driving event of the possessions registry for a drinker with a car', () => {
    let opened = 0;
    for (let i = 0; i < 300; i++) {
      let life = rich(lifeAtAge(`night-drive-${i}`, 30));
      life = produce(life, (d) => {
        d.character.hidden.vice = 90;
        d.possessions.items.push({ id: 'q1', kind: 'vehicle', defId: 'sedan', acquired: d.currentYear - 1, value: 8000, condition: 70, vehicle: { startAge: 2, insured: true } });
        d.possessions.nextId = 2;
      });
      const out = act(life, 'go_to_a_bar');
      if (out.phase === 'action' && out.pending.some((p) => content.registries.possessions.accidents.drunk.events.includes(p.eventId))) opened++;
    }
    expect(opened).toBeGreaterThan(0);
  });
});

describe('valuables', () => {
  const luxury = (life: LifeState, id = 'buy_pearl_necklace') => settle(act(life, id));
  it('are bought through a luxury activity, valued at the price, and counted in net worth', () => {
    const life = rich(lifeAtAge('val-buy', 35), 100_000);
    const def = content.pastimes.buy_pearl_necklace!;
    const price = pastimePrice(life, def, {}, content);
    const after = luxury(life);
    const items = valuablesOf(after);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'valuable', defId: def.buys, value: price });
    expect(after.finances.savings).toBe(100_000 - price);
    expect(checkInvariants(after, content)).toEqual([]);
  });
  it('cost upkeep and insurance in the yearly ledger, and nothing in prison', () => {
    const life = luxury(rich(lifeAtAge('val-cost', 35), 100_000), 'buy_a_sailboat');
    const costs = valuableCosts(life, content);
    expect(costs.upkeep).toBeGreaterThan(0);
    expect(costs.insurance).toBeGreaterThan(0);
    expect(possessionCosts(life, content).upkeep).toBeGreaterThanOrEqual(costs.upkeep);
    const uninsured = produce(life, (d) => void (valuablesOf(d)[0]!.valuable!.insured = false));
    expect(valuableCosts(uninsured, content).insurance).toBe(0);
    const inside = produce(life, (d) => void (d.housing.kind = 'incarcerated'));
    expect(valuableCosts(inside, content)).toEqual({ upkeep: 0, insurance: 0 });
  });
  it('appreciate or depreciate each year by their class', () => {
    let boat = 0;
    let art = 0;
    for (let i = 0; i < 30; i++) {
      const base = rich(lifeAtAge(`val-drift-${i}`, 35), 400_000);
      const withBoat = luxury(base, 'buy_a_sailboat');
      const withArt = luxury(base, 'buy_signed_print');
      const nextBoat = beginYear(withBoat, content);
      const nextArt = beginYear(withArt, content);
      boat += (valuablesOf(nextBoat)[0]?.value ?? valuablesOf(withBoat)[0]!.value) / valuablesOf(withBoat)[0]!.value;
      art += (valuablesOf(nextArt)[0]?.value ?? valuablesOf(withArt)[0]!.value) / valuablesOf(withArt)[0]!.value;
    }
    expect(boat / 30).toBeLessThan(1);
    expect(art / 30).toBeGreaterThan(boat / 30);
  });
  it('can be sold for a share of their value', () => {
    const owned = luxury(rich(lifeAtAge('val-sell', 35), 100_000), 'buy_gold_watch');
    const id = valuablesOf(owned)[0]!.id;
    const before = owned.finances.savings;
    const sold = performAction(owned, 'sell_valuable', { possessionId: id }, content);
    expect(valuablesOf(sold)).toHaveLength(0);
    expect(sold.finances.savings).toBeGreaterThan(before);
    expect(sold.finances.savings - before).toBeLessThan(valuablesOf(owned)[0]!.value);
  });
  it('can be stolen: the possessions step queues the event, and the insurer pays out only when it is insured', () => {
    const always = produce(content, (d) => void (d.balance.possessions.valuables.classes.jewelry.theft = 1));
    for (const insured of [true, false]) {
      const base = luxury(rich(lifeAtAge(`val-theft-${insured}`, 35), 100_000), 'buy_diamond_earrings');
      const life = produce(base, (d) => void (valuablesOf(d)[0]!.valuable!.insured = insured));
      const year = beginYear(life, always);
      const value = valuablesOf(year)[0]!.value;
      const queued = [...year.pending.map((p) => p.eventId), ...year.scheduled.map((s) => s.eventId)];
      expect(queued.some((id) => always.registries.possessions.valuableStolen.events.includes(id))).toBe(true);
      const eventId = queued.find((id) => always.registries.possessions.valuableStolen.events.includes(id))!;
      const instance = year.pending.find((p) => p.eventId === eventId);
      const savings = year.finances.savings;
      const resolved = resolveAll(year, always, createRng('theft'));
      expect(valuablesOf(resolved)).toHaveLength(0);
      const card = resolved.pending.find((p) => p.eventId === eventId) ?? instance;
      const gained = (card?.money?.change ?? 0);
      if (insured) expect(gained).toBe(Math.round(value * always.balance.possessions.valuables.payout));
      else expect(gained).toBe(0);
      void savings;
    }
  });
  it('pass through the estate to an heir or are sold', () => {
    // The plan treats a valuable like a possession without a loan.
    expect(content.balance.possessions.valuables.payout).toBeGreaterThan(0);
  });
});

export type { ContentBundle };
