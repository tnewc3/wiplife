/** God mode (G1): the Settings switch, its upgrade, and the save round trip of an edited life. */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { content } from '../content';
import { editable } from '../engine/godmode/fixtures';
import { performEdit } from '../engine/godmode';
import { createDb, type WiplifeDb } from './db';
import { makeEnvelope } from './envelope';
import { loadedLifeSchema } from './lifeSchema';
import { readSave, writeSave } from './saves';
import { DEFAULT_SETTINGS, loadSettings, migrateSettings, SETTINGS_VERSION, updateSettings } from './settings';

let counter = 0;
const opened: WiplifeDb[] = [];
function freshDb(): WiplifeDb {
  const db = createDb(`wiplife-godmode-${++counter}`);
  opened.push(db);
  return db;
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});

describe('the god mode setting', () => {
  it('is off by default', async () => {
    expect(DEFAULT_SETTINGS.godMode).toBe(false);
    expect((await loadSettings(freshDb())).godMode).toBe(false);
  });

  it('persists across a reload', async () => {
    const db = freshDb();
    await updateSettings(db, { godMode: true });
    db.close();
    await db.open();
    expect((await loadSettings(db)).godMode).toBe(true);
    await updateSettings(db, { godMode: false });
    expect((await loadSettings(db)).godMode).toBe(false);
  });

  it('upgrades a version 2 row with the switch off, keeping everything else', async () => {
    const db = freshDb();
    await db.settings.put({ key: 'app', value: { ageConfirmed: true, theme: 'dark', persistRequested: true, installPromptShown: true, teams: { renamed: {}, moved: {}, added: [] }, version: 2 } as never });
    expect(migrateSettings({ ageConfirmed: true, version: 2 })).toMatchObject({ version: SETTINGS_VERSION, godMode: false, ageConfirmed: true });
    const loaded = await loadSettings(db);
    expect(loaded).toMatchObject({ ageConfirmed: true, theme: 'dark', godMode: false });
    expect(SETTINGS_VERSION).toBe(4);
    await updateSettings(db, { godMode: true });
    expect((await db.settings.get('app'))?.value).toMatchObject({ version: SETTINGS_VERSION, godMode: true, theme: 'dark' });
  });

  it('upgrades a version 1 row too', () => {
    expect(migrateSettings({ ageConfirmed: true })).toMatchObject({ version: SETTINGS_VERSION, godMode: false });
  });

  it('survives a damaged value: the switch is off and the other settings are kept', async () => {
    const db = freshDb();
    await db.settings.put({ key: 'app', value: { ageConfirmed: true, theme: 'light', godMode: 'yes please', version: 3 } as never });
    expect(await loadSettings(db)).toMatchObject({ ageConfirmed: true, theme: 'light', godMode: false });
    await db.settings.put({ key: 'app', value: 'garbage' as never });
    expect((await loadSettings(db)).godMode).toBe(false);
  });
});

describe('an edited life', () => {
  it('makes the round trip: write, read, migrate and validate return the same life', async () => {
    const db = freshDb();
    let life = editable();
    life = performEdit(life, { target: 'self', stats: { happiness: 12 }, money: { savings: 99_000, debts: [{ kind: 'personal', balance: 800 }] }, faith: { id: 'jewish', strength: 70 } }, content);
    life = performEdit(life, { target: { person: 'pal' }, relationship: { kind: 'partner' }, identity: { attractedTo: ['man'] }, looks: 91 }, content);
    life = performEdit(life, { target: 'self', cityId: 'houston' }, content);
    expect(life.inputLog.filter((r) => r.kind === 'edit')).toHaveLength(3);
    // The schema pass the store runs before it commits.
    expect(loadedLifeSchema(content).safeParse(life).success).toBe(true);
    await writeSave(db, makeEnvelope(life, content.contentVersion));
    db.close();
    await db.open();
    const result = await readSave(db, loadedLifeSchema(content));
    if (result.status !== 'ok') throw new Error(`expected ok, got ${result.status}`);
    expect(result.envelope.data).toEqual(life);
  });

  it('keeps its edit records in the input log (the enum accepts them) and nothing marks it', () => {
    const life = performEdit(editable(), { target: 'self', looks: 3 }, content);
    const parsed = loadedLifeSchema(content).safeParse(life);
    expect(parsed.success).toBe(true);
    expect(Object.keys(life).sort()).toEqual(Object.keys(editable()).sort());
  });
});
