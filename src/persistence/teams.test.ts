import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createDb, type WiplifeDb } from './db';
import { DEFAULT_SETTINGS, loadSettings, migrateSettings, SETTINGS_VERSION, updateSettings } from './settings';
import { emptySetup, type TeamSetup } from '../engine/sports/setup';
import { content } from '../content';
import { playYear } from '../engine/autoplay';
import { createLife } from '../engine/life';
import { replayLife } from '../engine/replay';

let n = 0;
const opened: WiplifeDb[] = [];
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});
const freshDb = (): WiplifeDb => {
  const db = createDb(`wiplife-teams-test-${++n}`);
  opened.push(db);
  return db;
};

const setup: TeamSetup = {
  renamed: { chicago_lakefront_fc: { name: 'Chicago Lakeshore Rovers', nickname: 'Rovers' } },
  moved: { houston_gulf_city_fc: 'nyc' },
  added: [{ id: 'custom_1', sport: 'soccer', name: 'Garden City Albion', city: 'chicago', strength: 5, tier: 1 }],
};

describe('team settings', () => {
  it('start empty: the game’s own teams', async () => {
    expect(DEFAULT_SETTINGS.teams).toEqual(emptySetup());
    expect((await loadSettings(freshDb())).teams).toEqual(emptySetup());
  });

  it('upgrade a version 1 settings row (from before teams): the other settings are kept and the teams are empty', async () => {
    const db = freshDb();
    await db.settings.put({ key: 'app', value: { ageConfirmed: true, theme: 'dark', persistRequested: true, installPromptShown: false } as never });
    expect(migrateSettings({ ageConfirmed: true })).toMatchObject({ version: SETTINGS_VERSION, teams: emptySetup(), ageConfirmed: true });
    const loaded = await loadSettings(db);
    expect(loaded).toEqual({ ageConfirmed: true, theme: 'dark', persistRequested: true, installPromptShown: false, teams: emptySetup(), godMode: false });
    // The next write puts the current version in the row.
    await updateSettings(db, { theme: 'light' });
    const row = await db.settings.get('app');
    expect(row?.value.version).toBe(SETTINGS_VERSION);
    expect((await loadSettings(db)).theme).toBe('light');
  });

  it('store the changes to the world of teams and bring them back', async () => {
    const db = freshDb();
    await updateSettings(db, { teams: setup });
    expect((await loadSettings(db)).teams).toEqual(setup);
    // Other settings are not touched by a team change, and a team change leaves them be.
    await updateSettings(db, { ageConfirmed: true });
    expect(await loadSettings(db)).toEqual({ ...DEFAULT_SETTINGS, ageConfirmed: true, teams: setup });
  });

  it('refuse a setting of the wrong shape, and fall back to the game’s own teams for a damaged row', async () => {
    const db = freshDb();
    await expect(updateSettings(db, { teams: { renamed: { x: { name: 'a' } }, moved: {}, added: [] } })).rejects.toThrow();
    await expect(updateSettings(db, { teams: { renamed: {}, moved: {}, added: [], extra: 1 } as never })).rejects.toThrow();
    await db.settings.put({ key: 'app', value: { ...DEFAULT_SETTINGS, ageConfirmed: true, teams: 'oops' as never, version: 2 } });
    const loaded = await loadSettings(db);
    expect(loaded.teams).toEqual(emptySetup());
    expect(loaded.ageConfirmed).toBe(true);
  });
});

describe('a life and the team settings changing after it begins', () => {
  it('does not change the life’s replay: the life carries its own snapshot of the teams', async () => {
    const db = freshDb();
    let life = createLife({ mode: 'random', seed: 'settings-replay', birthYear: 2000 }, content);
    for (let i = 0; i < 6; i++) life = playYear(life, content);
    expect(life.league.setup).toEqual(emptySetup());
    // The player changes the teams in Settings afterwards.
    await updateSettings(db, { teams: setup });
    expect((await loadSettings(db)).teams).toEqual(setup);
    // The life rebuilds exactly from its input log, whatever the settings say now.
    expect(replayLife(life.inputLog, content)).toEqual(life);
    // A life that began with the new settings has them, in its log, and replays exactly too.
    let next = createLife({ mode: 'random', seed: 'settings-replay', birthYear: 2000, teamSetup: (await loadSettings(db)).teams }, content);
    for (let i = 0; i < 6; i++) next = playYear(next, content);
    expect(next.league.setup).toEqual(setup);
    expect(replayLife(next.inputLog, content)).toEqual(next);
    // ...and settings back to the game's own do not touch it either.
    await updateSettings(db, { teams: emptySetup() });
    expect(replayLife(next.inputLog, content)).toEqual(next);
  });
});
