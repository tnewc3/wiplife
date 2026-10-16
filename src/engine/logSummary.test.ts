import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { foundHealthy, markHealthy } from './healthy';
import { checkInvariants } from './invariants';
import { summarizeLog } from './logSummary';
import { lifeAtAge } from './testFixtures';
import type { InputRecord } from './types';

const romance = Object.values(content.interactions).find((d) => d.romance)!;

describe('the input log summary', () => {
  it('counts years and finds romance records, the same incrementally as from scratch', () => {
    const life = lifeAtAge('log-summary', 30);
    const log: InputRecord[] = [...life.inputLog];
    const first = summarizeLog(log, content);
    const base = { ageUps: first.ageUps, romance: first.romance.length };
    const grown = [...log, { year: 2030, kind: 'interact', payload: { interactionId: romance.id, personId: 'p1' } } as InputRecord, { year: 2030, kind: 'ageUp', payload: {} } as InputRecord];
    const incremental = summarizeLog(grown, content);
    expect({ ageUps: incremental.ageUps, romance: incremental.romance.length }).toEqual({ ageUps: base.ageUps + 1, romance: base.romance + 1 });
    // A log that is not an extension of the last one read (here, a shorter one) is read afresh.
    const again = summarizeLog(log, content);
    expect({ ageUps: again.ageUps, romance: again.romance.length }).toEqual(base);
    expect(summarizeLog([], content)).toEqual({ ageUps: 0, romance: [] });
  });
});

describe('remembering what was found healthy', () => {
  it('only holds for the same objects and year, and a changed person is checked again', () => {
    const life = lifeAtAge('healthy-memory', 30);
    expect(checkInvariants(life, content)).toEqual([]);
    const id = Object.keys(life.people)[0]!;
    const broken = produce(life, (d) => {
      d.people[id]!.looks = 500;
    });
    expect(checkInvariants(broken, content).join('\n')).toMatch(/looks/);
    // ...while the untouched life is still healthy, and the broken one is still reported when checked again.
    expect(checkInvariants(life, content)).toEqual([]);
    expect(checkInvariants(broken, content).join('\n')).toMatch(/looks/);
  });

  it('matches on the key, the other objects it depends on and the year', () => {
    const key = {};
    const dep = {};
    markHealthy(content, 'test-scope', key, [dep], 2040);
    expect(foundHealthy(content, 'test-scope', key, [dep], 2040)).toBe(true);
    expect(foundHealthy(content, 'test-scope', key, [dep], 2041)).toBe(false);
    expect(foundHealthy(content, 'test-scope', key, [{}], 2040)).toBe(false);
    expect(foundHealthy(content, 'other-scope', key, [dep], 2040)).toBe(false);
  });
});
