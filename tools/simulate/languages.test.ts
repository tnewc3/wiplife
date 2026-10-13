import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { content } from '../../src/content';
import { lifeAtAge } from '../../src/engine/testFixtures';
import { emptyLanguagesReport, formatLanguages, LanguagesWatcher } from './languages';

describe('W4b simulation reports', () => {
  it('counts language-blocked work, shared/barrier contacts, learning and native skills from the observed life', () => {
    const before = lifeAtAge('language-report', 25);
    const after = produce(before, (d) => {
      d.character.cityId = 'montreal';
      d.character.languages = [{ id: 'en', skill: 100, native: true, lastUsed: d.currentYear }, { id: 'fr', skill: 20, native: false, lastUsed: d.currentYear }];
      d.career.openings = ['software_engineer', 'registered_nurse'];
      d.languages.totals = { school: 6, classes: 12, immersion: 8, faded: 1 };
      const template = Object.values(d.people)[0]!;
      for (const [id, language] of [['shared', 'en'], ['barrier', 'fr']] as const) {
        d.people[id] = { ...template, id, alive: true, languages: [{ id: language, skill: 100, native: true, lastUsed: d.currentYear }] };
        d.relationships[id] = { personId: id, kind: 'friend', status: 'active', affection: 50, trust: 50, since: d.currentYear, memories: [] };
      }
    });
    const report = emptyLanguagesReport(); const watcher = new LanguagesWatcher(report, content);
    watcher.observe(before, after); watcher.finish(after);
    expect(report.jobs).toMatchObject({ openings: 2, eligible: 1, blocked: 1, adultYears: 1 });
    expect(report.friendships.shared.meetings).toBe(1);
    expect(report.friendships.barrier.meetings).toBe(1);
    expect(report.points).toEqual({ school: 6, classes: 12, immersion: 8, faded: 1 });
    expect(report.spoken.fr?.basic).toBe(1);
    expect(report.native.en).toBe(1);
    expect(report.learnedLives).toBe(1);
    expect(formatLanguages(report, content).join('\n')).toContain('blocked by language 1');
  });
});
