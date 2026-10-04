import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { content } from '../content';
import { archiveEntry } from '../engine/archive';
import { createLife } from '../engine/life';
import { liveOut } from '../engine/testFixtures';
import type { ArchivedLife } from '../engine/types';
import { archiveLife, archivedLifeSchema, ARCHIVE_SCHEMA_VERSION, listArchive, makeArchiveEnvelope, readArchivedLife } from './archive';
import { createDb, type WiplifeDb } from './db';
import { makeEnvelope } from './envelope';
import { lifeStateSchema } from './lifeSchema';
import { readSave, writeSave } from './saves';

let n = 0;
const opened: WiplifeDb[] = [];
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});

function freshDb(name = `wiplife-archive-test-${++n}`): WiplifeDb {
  const db = createDb(name);
  opened.push(db);
  return db;
}

const random = (seed: string) => createLife({ mode: 'random', seed, birthYear: 2026 }, content);
const finished = (seed: string): ArchivedLife => archiveEntry(liveOut(random(seed)), content);
const at = (minute: number) => new Date(`2026-05-01T10:${String(minute).padStart(2, '0')}:00.000Z`);

describe('archive', () => {
  it('stores an entry and removes the active life and its backups', async () => {
    const db = freshDb();
    const life = random('to-archive');
    await writeSave(db, makeEnvelope(life, content.contentVersion));
    await writeSave(db, makeEnvelope(life, content.contentVersion));
    expect(await db.backups.count()).toBe(1);

    const entry = finished('to-archive');
    await archiveLife(db, makeArchiveEnvelope(entry, content.contentVersion));
    expect(await readSave(db, lifeStateSchema)).toEqual({ status: 'none' });
    expect(await db.backups.count()).toBe(0);
    expect(await readArchivedLife(db, entry.id)).toEqual(entry);
    expect((await db.archive.get(entry.id))?.envelope.schemaVersion).toBe(ARCHIVE_SCHEMA_VERSION);
  });

  it('can save the next life in the same step', async () => {
    const db = freshDb();
    const old = random('old');
    await writeSave(db, makeEnvelope(old, content.contentVersion));
    const next = random('next');
    await archiveLife(db, makeArchiveEnvelope(archiveEntry(old, content), content.contentVersion), makeEnvelope(next, content.contentVersion));
    const saved = await readSave(db, lifeStateSchema);
    expect(saved.status === 'ok' && saved.envelope.data).toEqual(next);
    expect(await db.backups.count()).toBe(0);
    expect((await listArchive(db)).lives.map((l) => [l.id, l.unfinished])).toEqual([[old.id, true]]);
  });

  it('lists lives newest first, survives reopening and grows with each life', async () => {
    const name = `wiplife-archive-reopen-${++n}`;
    const db = freshDb(name);
    const lives = ['a', 'b', 'c'].map(finished);
    for (const [i, entry] of lives.entries()) await archiveLife(db, makeArchiveEnvelope(entry, content.contentVersion, at(i)));
    db.close();

    const reopened = freshDb(name);
    const listing = await listArchive(reopened);
    expect(listing.damaged).toBe(0);
    expect(listing.lives.map((l) => l.id)).toEqual([lives[2]!.id, lives[1]!.id, lives[0]!.id]);
    expect(listing.lives[0]).toEqual(lives[2]);
  });

  it('skips damaged entries instead of failing', async () => {
    const db = freshDb();
    const good = finished('good');
    await archiveLife(db, makeArchiveEnvelope(good, content.contentVersion));
    await db.archive.put({ id: 'broken', envelope: { ...makeArchiveEnvelope(good, content.contentVersion), data: { name: 42 } } });
    const listing = await listArchive(db);
    expect(listing).toEqual({ lives: [good], damaged: 1 });
    expect(await readArchivedLife(db, 'broken')).toBeNull();
    expect(await readArchivedLife(db, 'missing')).toBeNull();
  });

  it('refuses to store an invalid entry', async () => {
    const db = freshDb();
    const bad = { ...finished('bad'), obituary: '' };
    await expect(archiveLife(db, makeArchiveEnvelope(bad, content.contentVersion))).rejects.toThrow();
    expect(await db.archive.count()).toBe(0);
  });

  it('accepts finished and unfinished entries from the engine', () => {
    expect(archivedLifeSchema.safeParse(finished('schema')).success).toBe(true);
    expect(archivedLifeSchema.safeParse(archiveEntry(random('schema-unfinished'), content)).success).toBe(true);
  });
});

describe('archive migrations', () => {
  it('upgrade a version 1 entry with its birth city (where the life ended: nobody could move before)', async () => {
    const db = freshDb();
    const { birthCityId: _birth, ...v1 } = finished('archive-v1');
    await db.archive.put({ id: v1.id, envelope: { ...makeArchiveEnvelope(v1 as ArchivedLife, content.contentVersion), schemaVersion: 1 } });
    const read = await readArchivedLife(db, v1.id);
    // E2b: and, on the way to version 3, a family line of its own.
    expect(read).toEqual({ ...v1, birthCityId: v1.cityId, lineId: v1.id, familyName: v1.name.split(' ').at(-1), familyReputation: 50 });
    expect(archivedLifeSchema.safeParse(read).success).toBe(true);
  });

  it('upgrade a version 2 entry into a family line of its own (E2b)', async () => {
    const db = freshDb();
    const { lineId: _line, familyName: _family, familyReputation: _rep, ...v2 } = finished('archive-v2');
    await db.archive.put({ id: v2.id, envelope: { ...makeArchiveEnvelope(v2 as ArchivedLife, content.contentVersion), schemaVersion: 2 } });
    const read = await readArchivedLife(db, v2.id);
    expect(read).toEqual({ ...v2, lineId: v2.id, familyName: v2.name.split(' ').at(-1), familyReputation: 50 });
    expect(archivedLifeSchema.safeParse(read).success).toBe(true);
  });
});
