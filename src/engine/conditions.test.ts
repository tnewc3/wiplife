import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { Condition } from '../content/schemas';
import { compare, evaluate, referencesIn, rolesIn } from './conditions';
import { lifeAtAge } from './testFixtures';

const base = produce(lifeAtAge('conditions', 30), (d) => {
  d.character.stats.health = 70;
  d.character.personality.kindness = 80;
  d.character.hidden.luck = 40;
  d.finances.savings = 500;
  d.flags.has_dog = true;
  d.flags.count = 0;
  d.eventLog.stray_dog = { count: 1, lastYear: d.currentYear - 5 };
  const [firstId] = Object.keys(d.relationships).sort();
  d.relationships[firstId!]!.memories.push({ tag: 'lent_money', year: d.currentYear });
});
const parentId = Object.keys(base.relationships).sort()[0]!;
const holds = (c: Condition, cast: Record<string, string> = {}) => evaluate(c, base, { cast, roles: 'strict' });

describe('conditions', () => {
  it('compare numbers with every operator', () => {
    expect(compare(5, { gt: 4, lt: 6 })).toBe(true);
    expect(compare(5, { gte: 5, lte: 5, eq: 5 })).toBe(true);
    expect(compare(5, { gt: 5 })).toBe(false);
  });

  it('check age, life stage, stats, traits, hidden values and money', () => {
    expect(holds({ age: { gte: 18 } })).toBe(true);
    expect(holds({ lifeStage: ['adult'] })).toBe(true);
    expect(holds({ lifeStage: ['teen'] })).toBe(false);
    expect(holds({ stat: 'health', gt: 60 })).toBe(true);
    expect(holds({ trait: 'kindness', gt: 90 })).toBe(false);
    expect(holds({ hidden: 'luck', lt: 50 })).toBe(true);
    expect(holds({ money: { gte: 200 } })).toBe(true);
    expect(holds({ money: { gte: 501 } })).toBe(false);
  });

  it('check city, family wealth, flags and the event log', () => {
    expect(holds({ city: base.character.cityId })).toBe(true);
    expect(holds({ familyWealth: [base.character.familyWealth] })).toBe(true);
    expect(holds({ flag: 'has_dog' })).toBe(true);
    expect(holds({ flag: 'count' })).toBe(false);
    expect(holds({ flag: 'count', eq: 0 })).toBe(true);
    expect(holds({ flag: 'missing' })).toBe(false);
    expect(holds({ fired: 'stray_dog' })).toBe(true);
    expect(holds({ fired: 'first_words' })).toBe(false);
  });

  it('check relatives, memories and cast roles', () => {
    expect(holds({ relative: { kind: 'parent' } })).toBe(true);
    expect(holds({ relative: { kind: 'friend' } })).toBe(false);
    expect(holds({ memory: { role: 'npc', tag: 'lent_money' } }, { npc: parentId })).toBe(true);
    expect(holds({ memory: { role: 'npc', tag: 'paid_you_back' } }, { npc: parentId })).toBe(false);
    expect(holds({ role: 'npc', alive: true, age: { gte: 30 } }, { npc: parentId })).toBe(true);
    expect(holds({ role: 'npc', affection: { gt: 100 } }, { npc: parentId })).toBe(false);
  });

  it('combine with all, any and not', () => {
    expect(holds({ all: [{ age: { gte: 18 } }, { flag: 'has_dog' }] })).toBe(true);
    expect(holds({ any: [{ age: { lt: 18 } }, { flag: 'has_dog' }] })).toBe(true);
    expect(holds({ not: { flag: 'has_dog' } })).toBe(false);
  });

  it('treat unknown roles as passing before casting and failing after', () => {
    const c: Condition = { memory: { role: 'npc', tag: 'lent_money' } };
    expect(evaluate(c, base, { roles: 'assumeTrue' })).toBe(true);
    expect(evaluate({ not: c }, base, { roles: 'assumeTrue' })).toBe(true);
    expect(evaluate(c, base, { roles: 'strict' })).toBe(false);
  });

  it('list the roles and references a condition uses', () => {
    const c: Condition = { all: [{ memory: { role: 'friend', tag: 'kept_in_touch' } }, { not: { flag: 'x' } }, { fired: 'y' }] };
    expect(rolesIn(c)).toEqual(['friend']);
    expect(referencesIn(c)).toEqual({ flags: ['x'], memories: ['kept_in_touch'], events: ['y'], cities: [], majors: [], trades: [], fields: [], jobs: [], conditions: [] });
  });

  it('agree with the content: every event requirement parses and evaluates', () => {
    for (const def of Object.values(content.events)) expect(() => evaluate(def.requires, base, { roles: 'assumeTrue' })).not.toThrow();
  });
});
