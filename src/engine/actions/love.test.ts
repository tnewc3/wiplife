import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { playYear } from '../autoplay';
import { CONTINUE_CHOICE, createLife, resolveChoice } from '../life';
import { InvalidInputError } from '../creation/input';
import { checkInvariants } from '../invariants';
import { replayLife } from '../replay';
import { attractedTo, currentPartner, mutualAttraction } from '../relationships';
import { lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { finishAction, isLifeActionAvailable, performAction } from './index';
import { findDateBlock, findDateChance, findDateCost, findDateTries } from './love';

const balance = content.balance.relationships.findDate;
const single = (age: number, seed: string, attractedToCats: ('man' | 'woman' | 'nonbinary')[] = ['woman'], category: 'man' | 'woman' = 'man') =>
  produce(lifeAtAge(seed, age), (d) => {
    d.character.identity.genderCategory = category;
    d.character.identity.attractedTo = attractedToCats;
    d.finances.savings = 5000;
  });
const find = (life: LifeState, dateWay: 'app' | 'friend' | 'night_out') => performAction(life, 'find_date', { dateWay }, content);

describe('B1: Find a date', () => {
  it('is for single adults who are attracted to someone', () => {
    expect(isLifeActionAvailable(single(30, 'fd-ok'), 'find_date', { dateWay: 'app' }, content)).toBe(true);
    expect(isLifeActionAvailable(single(16, 'fd-teen'), 'find_date', { dateWay: 'app' }, content)).toBe(false);
    expect(isLifeActionAvailable(single(30, 'fd-none', []), 'find_date', { dateWay: 'app' }, content)).toBe(false);
    const partnered = produce(single(30, 'fd-partner'), (d) => {
      d.people.partner = { ...Object.values(d.people)[0]!, id: 'partner' };
      d.relationships.partner = { personId: 'partner', kind: 'partner', status: 'active', affection: 70, trust: 70, memories: [], since: d.currentYear };
    });
    expect(isLifeActionAvailable(partnered, 'find_date', { dateWay: 'app' }, content)).toBe(false);
    expect(() => find(single(16, 'fd-teen'), 'app')).toThrow(InvalidInputError);
  });

  it('validates its input', () => {
    const life = single(30, 'fd-input');
    for (const bad of [{}, { dateWay: 'pigeon' }, { dateWay: 'app', extra: 1 }, null, 'app']) {
      expect(() => performAction(life, 'find_date', bad, content)).toThrow(InvalidInputError);
    }
  });

  it('records the input and a life using it replays exactly from the log', () => {
    let life = createLife({ mode: 'random', seed: 'fd-replay', birthYear: 1990, countryId: 'us' }, content);
    life = playUntilAdult(life);
    const before = life.inputLog.length;
    const ways = ['app', 'friend', 'night_out'] as const;
    for (let i = 0; i < 3 && life.phase === 'yearStart'; i++) {
      if (!isLifeActionAvailable(life, 'find_date', { dateWay: ways[i]! }, content)) continue;
      life = finishIfAction(find(life, ways[i]!));
    }
    const tries = life.inputLog.slice(before).filter((r) => r.kind === 'action' && (r.payload as { actionId?: string }).actionId === 'find_date');
    expect(tries.length).toBeGreaterThan(0);
    life = playYear(life, content);
    expect(replayLife(life.inputLog, content)).toEqual(life);
    const next = find(createdAdult('fd-log'), 'app');
    expect(next.inputLog.at(-1)).toEqual({ year: next.currentYear, kind: 'action', payload: { actionId: 'find_date', params: { dateWay: 'app' } } });
    expect(findDateTries(next)).toBe(1);
  });

  it('cuts the chance with every try this year, and stops after the yearly maximum', () => {
    const chances = [0, 1, 2, 3].map((n) => findDateChance('app', n, content));
    expect(chances[0]).toBeCloseTo(balance.app.chance, 10);
    for (let i = 1; i < chances.length; i++) expect(chances[i]).toBeLessThan(chances[i - 1]!);
    expect(chances[1]!).toBeCloseTo(chances[0]! * balance.repeatFactor, 10);
    let life = createdAdult('fd-max');
    for (let i = 0; i < balance.yearlyMax; i++) {
      life = finishIfAction(find(life, 'app'));
    }
    expect(findDateTries(life)).toBe(balance.yearlyMax);
    expect(findDateBlock(life, 'app', findDateTries(life), content)).not.toBeNull();
    expect(() => find(life, 'app')).toThrow(InvalidInputError);
  });

  it('charges a night out through the finance module and shows the amount and your new balance', () => {
    const life = createdAdult('fd-cost');
    const cost = findDateCost(life, 'night_out', content);
    expect(cost).toBeGreaterThan(0);
    const next = find(life, 'night_out');
    expect(next.finances.savings).toBe(life.finances.savings - cost);
    expect(next.pending[0]!.money).toEqual({ change: -cost, balance: next.finances.savings, debtChange: 0 });
    expect(find(life, 'app').pending[0]!.money).toBeUndefined();
  });

  it('answers with one of the registered events, cast through the romantic casting: an adult attracted to you, whatever your orientation', () => {
    const orientations: { cats: ('man' | 'woman' | 'nonbinary')[]; category: 'man' | 'woman' }[] = [
      { cats: ['man'], category: 'man' },
      { cats: ['woman'], category: 'woman' },
      { cats: ['woman'], category: 'man' },
      { cats: ['man', 'woman'], category: 'woman' },
    ];
    const all = new Set(Object.values(content.registries.love.findDate).flat());
    let candidates = 0;
    for (const o of orientations) {
      for (let i = 0; i < 40; i++) {
        const life = single(28, `fd-cast-${o.category}-${o.cats.join('')}-${i}`, o.cats, o.category);
        const next = find(life, (['app', 'night_out'] as const)[i % 2]!);
        expect(all.has(next.pending[0]!.eventId)).toBe(true);
        expect(checkInvariants(next, content).filter((f) => !/input log|recap|lifetime|due in the past|lifeStage|housing.cityId|maximum age|scheduled/.test(f))).toEqual([]);
        const date = next.pending[0]!.cast.date;
        if (date === undefined) continue;
        candidates++;
        const person = next.people[date]!;
        expect(next.currentYear - person.birthYear).toBeGreaterThanOrEqual(content.balance.relationships.adultAge);
        expect(attractedTo(next.character.identity, person.identity)).toBe(true);
        expect(mutualAttraction(next, person)).toBe(true);
        expect(next.relationships[date]!.kind).toBe('acquaintance');
      }
    }
    expect(candidates).toBeGreaterThan(30);
  });

  it('can lead to dating through the event, and a same-gender candidate works as well', () => {
    let dated = 0;
    for (let i = 0; i < 80; i++) {
      const life = single(28, `fd-date-${i}`, ['man'], 'man');
      let next = find(life, 'app');
      const event = content.events[next.pending[0]!.eventId]!;
      const choice = event.choices?.[0]?.id ?? CONTINUE_CHOICE;
      next = finishAction(resolveChoice(next, next.pending[0]!.instanceId, choice, content));
      const partner = currentPartner(next);
      if (partner) {
        dated++;
        expect(next.people[partner.personId]!.identity.genderCategory).toBe('man');
      }
    }
    expect(dated).toBeGreaterThan(5);
  });

  it('brings no one new when the roll fails and answers with the quiet event', () => {
    const none = { ...content, balance: { ...content.balance, relationships: { ...content.balance.relationships, findDate: { ...balance, app: { chance: 0, cost: 0 } } } } };
    const life = single(30, 'fd-nobody');
    const next = performAction(life, 'find_date', { dateWay: 'app' }, none);
    expect(content.registries.love.findDate.nobody).toContain(next.pending[0]!.eventId);
    expect(next.pending[0]!.cast).toEqual({});
  });
});

function createdAdult(seed: string): LifeState {
  return single(30, seed);
}
function finishIfAction(life: LifeState): LifeState {
  const pending = life.pending[0]!;
  const event = content.events[pending.eventId]!;
  const choice = event.choices?.[event.choices.length - 1]?.id ?? CONTINUE_CHOICE;
  return finishAction(resolveChoice(life, pending.instanceId, choice, content));
}
function playUntilAdult(life: LifeState): LifeState {
  let current = life;
  while (current.phase !== 'dead' && current.character.age < 22) current = playYear(current, content);
  return current;
}
