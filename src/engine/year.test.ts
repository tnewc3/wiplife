import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { checkInvariants } from './invariants';
import { resolveAll } from './autoplay';
import { beginYear, createLife, endYear, PhaseError } from './life';
import { createRng } from './rng';
import { YEAR_PIPELINE, type PipelineStep } from './pipeline';
import { getYearRecap } from './selectors';
import { cloneJson, lifeAtAge, liveOut } from './testFixtures';
import type { LifeState } from './types';

const newborn = (seed: string) => createLife({ mode: 'random', seed, birthYear: 2026 }, content);

/** Begins a year and resolves its events with random choices, ready for endYear. */
const begin = (life: LifeState) => resolveAll(beginYear(life, content), content, createRng(`choices:${life.currentYear}`));

describe('year pipeline', () => {
  it('lists the steps in the order of section M', () => {
    expect(YEAR_PIPELINE.map((s) => s.id)).toEqual([
      'aging',
      'npcs',
      'education',
      'career',
      'economy',
      'health',
      'relationships',
      'selfDiscovery',
      'pacing',
    ]);
  });

  it('runs every step once, in order, during beginYear', () => {
    const ran: string[] = [];
    const recording: PipelineStep[] = YEAR_PIPELINE.map((step) => ({
      id: step.id,
      run: (state, bundle) => {
        ran.push(step.id);
        step.run(state, bundle);
      },
    }));
    beginYear(newborn('order'), content, recording);
    expect(ran).toEqual(YEAR_PIPELINE.map((s) => s.id));
  });

  it('ages the character before NPCs are checked', () => {
    let ageDuringNpcStep = -1;
    const steps = YEAR_PIPELINE.map((step) =>
      step.id === 'npcs' ? { id: step.id, run: (state: LifeState) => void (ageDuringNpcStep = state.character.age) } : step,
    );
    beginYear(newborn('aging-first'), content, steps);
    expect(ageDuringNpcStep).toBe(1);
  });
});

describe('beginYear and endYear', () => {
  it('advance one year through the phases and record the age-up input', () => {
    const start = newborn('phases');
    const begun = beginYear(start, content);
    expect(['events', 'yearEnd']).toContain(begun.phase);
    expect([begun.currentYear, begun.character.age]).toEqual([2027, 1]);
    expect(begun.inputLog.at(-1)).toEqual({ year: 2026, kind: 'ageUp', payload: {} });
    expect(begun.recap).toMatchObject({ year: 2027, age: 1, statsAfter: null });

    const ended = endYear(begin(start), content);
    expect(['yearStart', 'dead']).toContain(ended.phase);
    expect(ended.recap?.statsAfter).toEqual(ended.character.stats);
    expect(checkInvariants(ended, content)).toEqual([]);
  });

  it('never change the state they are given', () => {
    const start = newborn('pure');
    const snapshot = cloneJson(start);
    const begun = begin(start);
    const beginSnapshot = cloneJson(begun);
    endYear(begun, content);
    expect(start).toEqual(snapshot);
    expect(begun).toEqual(beginSnapshot);
  });

  it('refuse to advance a year twice or end a year that has not begun', () => {
    const start = newborn('twice');
    const begun = begin(start);
    expect(() => beginYear(begun, content)).toThrow(PhaseError);
    expect(() => endYear(start, content)).toThrow(PhaseError);
    const ended = endYear(begun, content);
    if (ended.phase === 'yearStart') expect(() => endYear(ended, content)).toThrow(PhaseError);
  });

  it('refuse to go on after death', () => {
    const dead = liveOut(newborn('after-death'));
    expect(() => beginYear(dead, content)).toThrow(PhaseError);
    expect(() => endYear(dead, content)).toThrow(PhaseError);
  });

  it('give the same life for the same seed and actions', () => {
    const a = liveOut(newborn('same-seed'));
    const b = liveOut(newborn('same-seed'));
    expect(a).toEqual(b);
    expect(liveOut(newborn('other-seed'))).not.toEqual(a);
  });

  it('can be saved and reloaded in the middle of a year', () => {
    let life = newborn('mid-year');
    for (let i = 0; i < 30 && life.phase !== 'dead'; i++) {
      const begun = beginYear(life, content);
      const reloaded = JSON.parse(JSON.stringify(begun)) as LifeState;
      expect(reloaded).toEqual(begun);
      const direct = endYear(begin(life), content);
      expect(endYear(resolveAll(reloaded, content, createRng(`choices:${life.currentYear}`)), content)).toEqual(direct);
      life = direct;
    }
  });

  it('build a recap with the stat changes and entries of the year', () => {
    const life = lifeAtAge('recap', 89);
    const ended = endYear(begin(life), content);
    const recap = getYearRecap(ended, content)!;
    expect(recap).toMatchObject({ year: ended.currentYear, age: 90 });
    const before = life.character.stats;
    const expected = (Object.keys(before) as (keyof typeof before)[])
      .map((stat) => ({ stat, change: ended.character.stats[stat] - before[stat] }))
      .filter((c) => c.change !== 0);
    expect(recap.statChanges).toEqual(expected);
    expect(recap.entries).toEqual(ended.history.filter((e) => e.year === ended.currentYear));
  });
});

describe('death', () => {
  it('always comes by the maximum age', () => {
    const { maxAge } = content.balance.mortality;
    const old = lifeAtAge('oldest', maxAge - 1);
    const ended = endYear(begin(old), content);
    expect(ended.phase).toBe('dead');
    expect(ended.character.age).toBe(maxAge);
  });

  it('ends the life with a death record, a history entry and nothing pending', () => {
    const dead = liveOut(newborn('death'));
    expect(dead.phase).toBe('dead');
    expect(dead.death).toEqual({ year: dead.currentYear, age: dead.character.age, causeId: expect.any(String) });
    expect(content.causes[dead.death!.causeId]).toBeDefined();
    expect(dead.history.at(-1)).toMatchObject({ year: dead.currentYear, tags: ['milestone', 'death'], importance: 3 });
    expect(dead.history.at(-1)!.text).toContain(content.causes[dead.death!.causeId]!.text);
    expect(dead.pending).toEqual([]);
    expect(checkInvariants(dead, content)).toEqual([]);
  });

  it('clears events still pending when the character dies', () => {
    const { maxAge } = content.balance.mortality;
    const begun = begin(lifeAtAge('pending', maxAge - 1));
    const withPending: LifeState = { ...begun, pending: [{ instanceId: 'i1', eventId: 'lottery_ticket', cast: {}, resolvedChoiceId: 'save' }] };
    expect(endYear(withPending, content).pending).toEqual([]);
  });
});

describe('NPCs', () => {
  it('age with the years and eventually die, with history entries for family', () => {
    const dead = liveOut(newborn('npcs'));
    const people = Object.values(dead.people);
    // Parents are at least a generation older, so they are dead by the time a long life ends.
    const family = new Set(['parent', 'sibling', 'stepparent', 'grandparent']);
    for (const person of people) {
      if (!person.alive && family.has(dead.relationships[person.id]!.kind)) {
        expect(person.deathYear).toBeGreaterThanOrEqual(dead.birthYear);
        const entry = dead.history.find((e) => e.tags.includes(`person:${person.id}`));
        expect(entry?.year).toBe(person.deathYear);
        expect(entry?.text).toContain(person.name.first);
      }
    }
  });

  it('never outlive the maximum age', () => {
    const { maxAge } = content.balance.mortality;
    let life = lifeAtAge('npc-max', 60);
    for (let i = 0; i < 70; i++) {
      life = { ...beginYear(life, content), phase: 'yearStart', pending: [] };
      for (const p of Object.values(life.people)) {
        if (p.alive) expect(life.currentYear - p.birthYear).toBeLessThan(maxAge);
      }
    }
  });
});
