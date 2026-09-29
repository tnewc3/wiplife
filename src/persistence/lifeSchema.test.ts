import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { content } from '../content';
import { createLife } from '../engine/life';
import { nextUint32 } from '../engine/rng';
import { customInput } from '../engine/testFixtures';
import type { LifeState } from '../engine/types';
import { createDb, type WiplifeDb } from './db';
import { makeEnvelope } from './envelope';
import { lifeStateSchema } from './lifeSchema';
import { readSave, writeSave } from './saves';

let n = 0;
const opened: WiplifeDb[] = [];
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});

function freshDb(): WiplifeDb {
  const db = createDb(`wiplife-life-test-${++n}`);
  opened.push(db);
  return db;
}

const random = (seed: string) => createLife({ mode: 'random', seed, birthYear: 2026 }, content);
const custom = (seed: string) => createLife({ mode: 'custom', seed, birthYear: 2026, custom: customInput() }, content);

async function roundTrip(life: LifeState): Promise<LifeState> {
  const db = freshDb();
  await writeSave(db, makeEnvelope(life, content.contentVersion));
  db.close();
  await db.open();
  const result = await readSave(db, lifeStateSchema);
  if (result.status !== 'ok') throw new Error(`expected ok, got ${result.status}`);
  return result.envelope.data;
}

describe('life save and load', () => {
  it('gives an identical random life after saving and reloading', async () => {
    const life = random('save-1');
    expect(await roundTrip(life)).toEqual(life);
  });

  it('gives an identical custom life after saving and reloading', async () => {
    const life = custom('save-2');
    expect(await roundTrip(life)).toEqual(life);
  });

  it('continues the random sequence exactly after reloading', async () => {
    const life = random('save-3');
    const loaded = await roundTrip(life);
    const a = Array.from({ length: 50 }, () => nextUint32(life.rng));
    const b = Array.from({ length: 50 }, () => nextUint32(loaded.rng));
    expect(b).toEqual(a);
  });

  it('accepts every generated life', () => {
    for (let i = 0; i < 500; i++) {
      const life = i % 2 ? random(`schema-${i}`) : custom(`schema-${i}`);
      const result = lifeStateSchema.safeParse(life);
      if (!result.success) throw new Error(`seed schema-${i}: ${result.error.message}`);
    }
  });

  it('rejects damaged lives', () => {
    const life = random('damaged');
    const withStat = structuredClone(life);
    withStat.character.stats.health = 140;
    const withExtra = { ...structuredClone(life), cheat: true };
    const withoutRng = { ...structuredClone(life), rng: { a: 1 } };
    for (const bad of [withStat, withExtra, withoutRng]) {
      expect(lifeStateSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('falls back to the backup when the autosave is damaged', async () => {
    const db = freshDb();
    const older = random('older');
    await writeSave(db, makeEnvelope(older, content.contentVersion));
    const damaged = structuredClone(random('newer'));
    damaged.character.stats.smarts = -5;
    await writeSave(db, makeEnvelope(damaged, content.contentVersion));
    const result = await readSave(db, lifeStateSchema);
    expect(result.status).toBe('recovered');
    if (result.status === 'recovered') expect(result.envelope.data).toEqual(older);
  });
});
