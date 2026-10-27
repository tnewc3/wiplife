import 'fake-indexeddb/auto';
import { produce } from 'immer';
import { afterEach, describe, expect, it } from 'vitest';
import { content } from '../content';
import { archiveEntry } from '../engine/archive';
import { createLife } from '../engine/life';
import { lookFromDescriptors } from '../engine/looks/descriptors';
import { personLook, yourLook } from '../engine/looks/query';
import { replayLife } from '../engine/replay';
import { cloneJson, lifeAtAge } from '../engine/testFixtures';
import type { LifeState } from '../engine/types';
import { archivedLifeSchema } from './archive';
import { makeEnvelope } from './envelope';
import { lifeStateSchema, loadedLifeSchema } from './lifeSchema';
import { migrateEnvelope } from './migrations';
import { createThumbnailDb, thumbnailKey, ThumbnailStore, type ThumbnailDb } from './thumbnails';

/** A schema-37 save: nobody has a look yet. */
function oldSave(seed = 'look-save', age = 30): Record<string, unknown> {
  const old = cloneJson(lifeAtAge(seed, age)) as unknown as { character: Record<string, unknown>; people: Record<string, Record<string, unknown>> };
  delete old.character.look;
  for (const p of Object.values(old.people)) delete p.look;
  return old as unknown as Record<string, unknown>;
}

const upgrade = (data: Record<string, unknown>): LifeState => migrateEnvelope({ ...makeEnvelope(data, content.contentVersion), schemaVersion: 37 }).data as LifeState;

describe('P1 save upgrade (schema 37 → 38)', () => {
  it('gives you and everyone you know a valid look, and the save still loads', () => {
    const after = upgrade(oldSave());
    expect(after.character.look).toBeDefined();
    for (const p of Object.values(after.people)) expect(p.look, p.name.first).toBeDefined();
    expect(lifeStateSchema.safeParse(after).success).toBe(true);
    const loaded = loadedLifeSchema(content).safeParse(after);
    expect(loaded.success ? [] : loaded.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)).toEqual([]);
  });

  it('maps your old hair and eye descriptors to your portrait colors', () => {
    const old = oldSave('descriptor-save');
    const named = lookFromDescriptors((old.character as { appearance: { descriptors: string[] } }).appearance.descriptors, content);
    const after = upgrade(old);
    expect(after.character.look!.hair).toBe(named.hair);
    expect(after.character.look!.eyes).toBe(named.eyes);
  });

  it('gives the same looks a new life would have, so a replay of the input log agrees', () => {
    const life = createLife({ mode: 'random', seed: 'replay-look', birthYear: 2000, countryId: 'us' }, content);
    const old = cloneJson(life) as unknown as { character: Record<string, unknown>; people: Record<string, Record<string, unknown>> };
    delete old.character.look;
    for (const p of Object.values(old.people)) delete p.look;
    const after = upgrade(old as unknown as Record<string, unknown>);
    const replayed = replayLife(life.inputLog, content);
    expect(after.character.look).toEqual(replayed.character.look);
    for (const id of Object.keys(replayed.people)) expect(after.people[id]!.look).toEqual(replayed.people[id]!.look);
  });

  it('keeps a look that is already there, and changes nothing when run again', () => {
    const current = cloneJson(lifeAtAge('already', 25)) as unknown as Record<string, unknown>;
    expect(upgrade(current)).toEqual(current);
    const once = upgrade(oldSave('twice'));
    expect(upgrade(once as unknown as Record<string, unknown>)).toEqual(once);
  });

  it('upgrades the starting snapshot in an heir replay log', () => {
    const old = oldSave('heir-look');
    const saved = { ...old, inputLog: [{ year: 2030, kind: 'create', payload: { heir: true, snapshot: cloneJson(old) } }] };
    const after = upgrade(saved);
    const snapshot = (after as unknown as { inputLog: { payload: { snapshot: LifeState } }[] }).inputLog[0]!.payload.snapshot;
    expect(snapshot.character.look).toBeDefined();
  });

  it('leaves something that is not a life for the schema check to turn away', () => {
    const odd = { nonsense: true };
    expect(upgrade(odd as unknown as Record<string, unknown>)).toEqual(odd);
  });
});

describe('a save with a bad look is refused', () => {
  it('rejects an option the art does not have, and a graying age out of range', () => {
    const life = lifeAtAge('bad-look', 20);
    const bad = produce(life, (d) => {
      d.character.look = { ...yourLook(d, content), hairstyle: 'rainbow' as never };
    });
    expect(lifeStateSchema.safeParse(bad).success).toBe(false);
    const bad2 = produce(life, (d) => {
      const id = Object.keys(d.people)[0]!;
      d.people[id]!.look = { ...personLook(d, id, content), grayingAge: 3 };
    });
    expect(lifeStateSchema.safeParse(bad2).success).toBe(false);
  });
});

describe('the archive keeps how someone looked', () => {
  it('stores the look, and an entry from before portraits is still valid', () => {
    const life = lifeAtAge('archived-look', 40);
    const entry = archiveEntry(life, content);
    expect(entry.look).toEqual(yourLook(life, content));
    expect(archivedLifeSchema.safeParse(entry).success).toBe(true);
    const { look: _look, ...without } = entry;
    expect(archivedLifeSchema.safeParse(without).success).toBe(true);
  });
});

let counter = 0;
const opened: ThumbnailDb[] = [];
const fresh = (maxRows = 3, revision = 15) => {
  const db = createThumbnailDb(`thumbs-test-${++counter}`);
  opened.push(db);
  return { db, store: new ThumbnailStore(db, revision, maxRows) };
};
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});
const blob = (text: string) => new Blob([text], { type: 'image/png' });

describe('the thumbnail cache', () => {
  it('keys a thumbnail by art revision, size and settings', () => {
    expect(thumbnailKey(15, 96, 'abc')).toBe('15:96:abc');
    expect(thumbnailKey(15, 96, 'abc')).not.toBe(thumbnailKey(16, 96, 'abc'));
    expect(thumbnailKey(15, 96, 'abc')).not.toBe(thumbnailKey(15, 192, 'abc'));
  });

  it('stores and reads back a thumbnail, and misses on one it has not seen', async () => {
    const { store } = fresh();
    expect(await store.get('15:96:a', 1)).toBeNull();
    await store.put('15:96:a', blob('one'), 1);
    expect(await (await store.get('15:96:a', 2))!.text()).toBe('one');
  });

  it('drops the least recently used past its limit', async () => {
    const { store } = fresh(3);
    for (const [i, key] of ['a', 'b', 'c'].entries()) await store.put(`15:96:${key}`, blob(key), i + 1);
    await store.get('15:96:a', 10);
    await new Promise((r) => setTimeout(r, 20));
    await store.put('15:96:d', blob('d'), 11);
    expect(await store.get('15:96:b', 12)).toBeNull();
    expect(await store.get('15:96:a', 12)).not.toBeNull();
    expect(await store.get('15:96:d', 12)).not.toBeNull();
  });

  it('drops thumbnails drawn from older art, and clears on request', async () => {
    const { db, store } = fresh(10, 15);
    await db.thumbnails.bulkPut([
      { key: '14:96:old', blob: blob('old'), usedAt: 1 },
      { key: '15:96:new', blob: blob('new'), usedAt: 1 },
    ]);
    await store.dropStale();
    expect(await db.thumbnails.count()).toBe(1);
    await store.clear();
    expect(await db.thumbnails.count()).toBe(0);
  });
});
