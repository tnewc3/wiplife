import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createRng, isRngState, nextUint32, type RngState } from '../engine/rng';
import { createDb, type WiplifeDb } from './db';
import { CURRENT_SCHEMA_VERSION, makeEnvelope, type SaveEnvelope } from './envelope';
import { assertMigrationChain, migrateEnvelope, MigrationError, migrations, type Migration } from './migrations';
import { clearAllData } from './reset';
import { readSave, writeSave } from './saves';
import { DEFAULT_SETTINGS, loadSettings, updateSettings } from './settings';

/** A stand-in for LifeState until Stage 2 defines it. */
const testDataSchema = z.object({
  label: z.string(),
  rng: z.custom<RngState>(isRngState, 'invalid rng state'),
});
type TestData = z.infer<typeof testDataSchema>;

let counter = 0;
const opened: WiplifeDb[] = [];

function freshDb(): WiplifeDb {
  const db = createDb(`wiplife-test-${++counter}`);
  opened.push(db);
  return db;
}

afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});

const at = new Date('2026-01-02T03:04:05.000Z');

function envelope(label: string, rng: RngState = createRng(label)): SaveEnvelope<TestData> {
  return makeEnvelope({ label, rng }, '0.1.0+test', at);
}

describe('save envelope', () => {
  it('records schema version, content version and time', () => {
    const e = envelope('x');
    expect(e.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(e.contentVersion).toBe('0.1.0+test');
    expect(e.savedAt).toBe('2026-01-02T03:04:05.000Z');
  });
});

describe('save round trip', () => {
  it('returns none when nothing is saved', async () => {
    expect(await readSave(freshDb(), testDataSchema)).toEqual({ status: 'none' });
  });

  it('loads exactly what was written', async () => {
    const db = freshDb();
    const saved = envelope('round-trip');
    await writeSave(db, saved);
    const result = await readSave(db, testDataSchema);
    expect(result).toEqual({ status: 'ok', envelope: saved });
  });

  it('resumes the random sequence identically after save and load', async () => {
    const db = freshDb();
    const uninterrupted = createRng('resume');
    const expected = Array.from({ length: 200 }, () => nextUint32(uninterrupted));

    const live = createRng('resume');
    const head = Array.from({ length: 77 }, () => nextUint32(live));
    await writeSave(db, envelope('resume', live));

    // Reopen the database as a fresh page load would.
    db.close();
    await db.open();
    const result = await readSave(db, testDataSchema);
    if (result.status !== 'ok') throw new Error(`expected ok, got ${result.status}`);
    const restored = result.envelope.data.rng;
    const tail = Array.from({ length: 123 }, () => nextUint32(restored));

    expect([...head, ...tail]).toEqual(expected);
  });

  it('keeps the last two saves as backups', async () => {
    const db = freshDb();
    for (const label of ['one', 'two', 'three', 'four']) await writeSave(db, envelope(label));
    const backups = await db.backups.orderBy('seq').toArray();
    expect(backups.map((b) => (b.envelope.data as TestData).label)).toEqual(['two', 'three']);
  });

  it('falls back to the newest valid backup when the autosave is corrupt', async () => {
    const db = freshDb();
    await writeSave(db, envelope('older'));
    await writeSave(db, envelope('newer'));
    await writeSave(db, envelope('current'));
    await db.lives.put({ id: 'active', envelope: { broken: true } as unknown as SaveEnvelope });

    const result = await readSave(db, testDataSchema);
    expect(result.status).toBe('recovered');
    if (result.status !== 'recovered') return;
    expect(result.envelope.data.label).toBe('newer');
    expect(result.errors[0]).toMatch(/^autosave:/);
  });

  it('reports corrupt with the raw data when nothing is readable', async () => {
    const db = freshDb();
    await writeSave(db, envelope('a'));
    await writeSave(db, envelope('b'));
    const bad = { ...envelope('bad'), data: { label: 42 } } as unknown as SaveEnvelope;
    await db.lives.put({ id: 'active', envelope: bad });
    await db.backups.toCollection().modify({ envelope: bad });

    const result = await readSave(db, testDataSchema);
    expect(result.status).toBe('corrupt');
    if (result.status !== 'corrupt') return;
    expect(result.raw).toHaveLength(2);
    expect(result.errors).toHaveLength(2);
  });

  it('refuses a save from a newer version of the game', async () => {
    const db = freshDb();
    await writeSave(db, { ...envelope('future'), schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
    const result = await readSave(db, testDataSchema);
    expect(result.status).toBe('corrupt');
    if (result.status === 'corrupt') expect(result.errors[0]).toMatch(/only understands up to/);
  });
});

describe('migrations', () => {
  const chain: Migration[] = [
    { from: 1, description: 'rename name to label', migrate: (d) => ({ label: (d as { name: string }).name }) },
    { from: 2, description: 'add rng', migrate: (d) => ({ ...(d as object), rng: createRng('migrated') }) },
  ];

  it('the shipped chain is complete', () => {
    expect(() => assertMigrationChain(migrations, CURRENT_SCHEMA_VERSION)).not.toThrow();
  });

  it('runs every step in order', () => {
    const old: SaveEnvelope = { schemaVersion: 1, contentVersion: 'old', savedAt: at.toISOString(), data: { name: 'Sam' } };
    const migrated = migrateEnvelope(old, chain, 3);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.data).toEqual({ label: 'Sam', rng: createRng('migrated') });
    expect(migrated.contentVersion).toBe('old');
  });

  it('starts from the save’s own version', () => {
    const v2: SaveEnvelope = { schemaVersion: 2, contentVersion: 'x', savedAt: at.toISOString(), data: { label: 'Kai' } };
    expect(migrateEnvelope(v2, chain, 3).data).toEqual({ label: 'Kai', rng: createRng('migrated') });
  });

  it('fails clearly when a step is missing', () => {
    const old: SaveEnvelope = { schemaVersion: 1, contentVersion: 'x', savedAt: at.toISOString(), data: {} };
    expect(() => migrateEnvelope(old, [chain[1]!], 3)).toThrow(MigrationError);
    expect(() => assertMigrationChain([chain[1]!], 3)).toThrow(/from version 1/);
  });

  it('upgrades old saves while loading', async () => {
    const db = freshDb();
    const old = { schemaVersion: 1, contentVersion: 'x', savedAt: at.toISOString(), data: { name: 'Ari' } };
    await db.lives.put({ id: 'active', envelope: old });
    const result = await readSave(db, testDataSchema, chain, 3);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.envelope.schemaVersion).toBe(3);
    expect(result.envelope.data).toEqual({ label: 'Ari', rng: createRng('migrated') });
  });
});

describe('settings table', () => {
  it('returns defaults on first launch', async () => {
    expect(await loadSettings(freshDb())).toEqual(DEFAULT_SETTINGS);
  });

  it('persists changes across reopening', async () => {
    const db = freshDb();
    await updateSettings(db, { ageConfirmed: true });
    await updateSettings(db, { theme: 'dark' });
    db.close();
    await db.open();
    expect(await loadSettings(db)).toEqual({ ...DEFAULT_SETTINGS, ageConfirmed: true, theme: 'dark' });
  });

  it('keeps valid fields and defaults damaged ones', async () => {
    const db = freshDb();
    await db.settings.put({ key: 'app', value: { ageConfirmed: true, theme: 'purple' } as never });
    expect(await loadSettings(db)).toEqual({ ...DEFAULT_SETTINGS, ageConfirmed: true });
  });

  it('rejects invalid updates', async () => {
    const db = freshDb();
    await expect(updateSettings(db, { theme: 'purple' as never })).rejects.toThrow();
    expect(await loadSettings(db)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('reset all data', () => {
  it('clears lives, backups, archive and settings', async () => {
    const db = freshDb();
    await writeSave(db, envelope('a'));
    await writeSave(db, envelope('b'));
    await db.archive.put({ id: 'past', envelope: envelope('past') });
    await updateSettings(db, { ageConfirmed: true, theme: 'light' });

    await clearAllData(db);

    expect(await readSave(db, testDataSchema)).toEqual({ status: 'none' });
    expect(await db.archive.count()).toBe(0);
    expect(await loadSettings(db)).toEqual(DEFAULT_SETTINGS);
  });
});
