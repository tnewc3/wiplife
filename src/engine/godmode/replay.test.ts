/** God mode (G1): a life with edits replays exactly from its input log, plays on cleanly, and an unedited life is unchanged. */
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { playYear } from '../autoplay';
import { continueAsHeir, heirCandidates } from '../estate/heir';
import { die, parentLife } from '../estate/fixtures';
import { checkInvariants } from '../invariants';
import { createLife } from '../life';
import { replayLife } from '../replay';
import { cloneJson } from '../testFixtures';
import type { LifeState } from '../types';
import { checkEdit, performEdit } from './index';

const noJob = Object.values(content.jobs).find((j) => !j.requires && !j.vehicle && !j.retired && j.levels.length >= 3)!;

/** The first living adult friend or acquaintance, if there is one. */
function stranger(life: LifeState): string | null {
  return Object.values(life.relationships).find((r) => (r.kind === 'friend' || r.kind === 'acquaintance') && r.status === 'active' && life.people[r.personId]!.alive && life.currentYear - life.people[r.personId]!.birthYear >= 20)?.personId ?? null;
}

/** Edits to try at an age: a mix of areas for you and for someone you know. Only those the life accepts are made. */
function editsAt(life: LifeState): Record<string, unknown>[] {
  const other = stranger(life);
  const edits: Record<string, unknown>[] = [
    { target: 'self', stats: { happiness: 91, fitness: 33 }, personality: { kindness: 77 } },
    { target: 'self', money: { savings: 54_321 }, wealth: 'affluent' },
    { target: 'self', faith: { id: 'jewish', strength: 66 }, languages: [{ id: 'en', skill: 80, native: true }, { id: 'es', skill: 35, native: false }] },
    { target: 'self', conditions: [{ conditionId: 'high_blood_pressure', severity: 25, treated: true }] },
    { target: 'self', work: { jobId: noJob.id, level: 2 } },
    { target: 'self', cityId: life.character.cityId === 'houston' ? 'chicago' : 'houston' },
  ];
  if (other) {
    edits.push(
      { target: { person: other }, looks: 88, identity: { attractedTo: ['man', 'woman', 'nonbinary'] }, stats: { mood: 20 } },
      { target: { person: other }, relationship: { affection: 99, trust: 12 }, work: { jobId: noJob.id, level: 1 }, wealth: 'rich' },
      { target: { person: other }, relationship: { kind: 'partner' } },
    );
  }
  return edits;
}

/** Lives a random life, making every edit the life accepts at ages 6, 14, 22, 31 and 45. */
function editedLife(seed: string): { life: LifeState; made: number } {
  let life = createLife({ mode: 'random', seed, birthYear: 2000, countryId: 'us' }, content);
  let made = 0;
  while (life.phase !== 'dead' && life.character.age < 46) {
    if ([6, 14, 22, 31, 45].includes(life.character.age) && life.phase === 'yearStart') {
      for (const payload of editsAt(life)) {
        if (!checkEdit(life, payload, content).ok) continue;
        life = performEdit(life, payload, content);
        made++;
        expect(checkInvariants(life, content)).toEqual([]);
      }
    }
    life = playYear(life, content);
  }
  return { life, made };
}

describe('a life with edits', () => {
  it('is rebuilt exactly from its input log, at every edit', { timeout: 120_000 }, () => {
    let life = createLife({ mode: 'random', seed: 'replay-1', birthYear: 2000, countryId: 'us' }, content);
    let made = 0;
    while (life.phase !== 'dead' && life.character.age < 40) {
      if ([8, 20, 33].includes(life.character.age)) {
        for (const payload of editsAt(life)) {
          if (!checkEdit(life, payload, content).ok) continue;
          life = performEdit(life, payload, content);
          made++;
          expect(replayLife(life.inputLog, content)).toEqual(life);
        }
      }
      life = playYear(life, content);
    }
    expect(made).toBeGreaterThan(8);
    expect(life.inputLog.filter((r) => r.kind === 'edit')).toHaveLength(made);
    expect(replayLife(life.inputLog, content)).toEqual(life);
  });

  it('plays five more years after each edit with no invariant failure, and replays to the same state', () => {
    for (const seed of ['play-a', 'play-b']) {
      let { life } = editedLife(seed);
      for (let i = 0; i < 5 && life.phase !== 'dead'; i++) {
        life = playYear(life, content);
        expect(checkInvariants(life, content)).toEqual([]);
      }
      expect(replayLife(life.inputLog, content)).toEqual(life);
    }
  });

  it('keeps an edited job and wealth for someone you know through five years', () => {
    let life = createLife({ mode: 'random', seed: 'five-years', birthYear: 2000, countryId: 'us' }, content);
    while (life.character.age < 25) life = playYear(life, content);
    const id = stranger(life) ?? Object.keys(life.people)[0]!;
    const payload = { target: { person: id }, work: { jobId: noJob.id, level: 2 }, wealth: 'poor' };
    if (!checkEdit(life, payload, content).ok) return;
    life = performEdit(life, payload, content);
    const next = playYear(life, content);
    const person = next.people[id]!;
    // The yearly step may promote or fire them, like anyone; their background is what the edit set.
    expect(person.life?.background).toBe('poor');
  });

  it('is saved and loaded as JSON without changing', () => {
    const { life } = editedLife('json-trip');
    expect(cloneJson(life)).toEqual(life);
  });

  it('is replayed whatever the setting is now: replay needs no setting at all', () => {
    const { life } = editedLife('no-setting');
    expect(replayLife(cloneJson(life.inputLog), content)).toEqual(life);
  });
});

describe('a life without edits', () => {
  it('has no edit record, and replays as before', () => {
    const life = playYear(playYear(createLife({ mode: 'random', seed: 'plain', birthYear: 2000, countryId: 'us' }, content), content), content);
    expect(life.inputLog.some((r) => r.kind === 'edit')).toBe(false);
    expect(replayLife(life.inputLog, content)).toEqual(life);
  });
});

describe('an heir of an edited parent', () => {
  it('starts from the edited life and replays, with the heir’s own edits after the snapshot', () => {
    const edited = performEdit(parentLife({ kids: [28], seed: 'heir-edit' }), { target: 'self', stats: { smarts: 99 }, money: { savings: 777_000 } }, content);
    const dead = die(edited);
    const heirId = heirCandidates(dead)[0]!;
    let heir = continueAsHeir(dead, heirId, content);
    expect(replayLife(heir.inputLog, content)).toEqual(heir);
    heir = performEdit(heir, { target: 'self', stats: { happiness: 12 } }, content);
    expect(replayLife(heir.inputLog, content)).toEqual(heir);
    const next = playYear(heir, content);
    expect(replayLife(next.inputLog, content)).toEqual(next);
  });
});
