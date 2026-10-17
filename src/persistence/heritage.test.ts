import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { createLife } from '../engine/life';
import { cloneJson, lifeAtAge } from '../engine/testFixtures';
import { makeEnvelope } from './envelope';
import { lifeStateSchema, loadedLifeSchema } from './lifeSchema';
import { migrateEnvelope } from './migrations';

describe('B1 saves: name heritage', () => {
  it('upgrades a save and heir replay snapshot, filling heritage only where the names show it', () => {
    const life = createLife({ mode: 'random', seed: 'b1-migrate', birthYear: 2000, countryId: 'us' }, content);
    expect(life.character.heritage).toBeDefined();
    const old = cloneJson(life) as unknown as Record<string, unknown> & { character: Record<string, unknown>; people: Record<string, Record<string, unknown>> };
    delete old.character.heritage;
    for (const p of Object.values(old.people)) delete p.heritage;
    // A person whose names fit no heritage stays unset.
    const first = Object.keys(old.people)[0]!;
    old.people[first] = { ...old.people[first]!, name: { first: 'Zzyzx', last: 'Qwxyz' } };
    const saved = { ...old, inputLog: [{ year: life.currentYear, kind: 'create', payload: { heir: true, snapshot: cloneJson(old) } }] };
    const after = migrateEnvelope({ ...makeEnvelope(saved, content.contentVersion), schemaVersion: 27 }).data as typeof life;
    const pool = content.names.us!;
    // Whatever was filled is a real heritage that has both of the person's names.
    for (const p of Object.values(after.people)) {
      if (p.heritage === undefined) continue;
      expect(pool.heritages[p.heritage]!.last.map((n) => n.toLowerCase())).toContain(p.name.last.toLowerCase());
    }
    expect(after.people[first]!.heritage).toBeUndefined();
    const filled = Object.values(after.people).filter((p) => p.heritage !== undefined);
    expect(filled.length).toBeGreaterThan(0);
    const snapshot = after.inputLog[0]!.payload.snapshot as { people: Record<string, { heritage?: string }> };
    expect(Object.values(snapshot.people).filter((p) => p.heritage !== undefined).length).toBe(filled.length);
    expect(lifeStateSchema.safeParse(after).success).toBe(true);
    expect(loadedLifeSchema(content).safeParse(migrateEnvelope({ ...makeEnvelope(old, content.contentVersion), schemaVersion: 27 }).data).success).toBe(true);
  });

  it('leaves heritage unset when it cannot be known, and a life with heritage roundtrips', () => {
    const life = lifeAtAge('b1-roundtrip', 20);
    expect(loadedLifeSchema(content).parse(JSON.parse(JSON.stringify(life)))).toEqual(life);
    const generated = createLife({ mode: 'random', seed: 'b1-heritage', birthYear: 2000, countryId: 'mx' }, content);
    expect(loadedLifeSchema(content).parse(JSON.parse(JSON.stringify(generated)))).toEqual(generated);
  });

  it('rejects a malformed heritage', () => {
    const life = cloneJson(createLife({ mode: 'random', seed: 'b1-bad', birthYear: 2000, countryId: 'us' }, content)) as unknown as { character: { heritage: unknown } };
    life.character.heritage = '';
    expect(lifeStateSchema.safeParse(life).success).toBe(false);
  });
});
