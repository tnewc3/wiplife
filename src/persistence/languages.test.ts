import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { emptyLanguageLearning } from '../engine/languages';
import { lifeAtAge, cloneJson } from '../engine/testFixtures';
import { makeEnvelope } from './envelope';
import { migrateEnvelope } from './migrations';
import { lifeStateSchema, loadedLifeSchema } from './lifeSchema';
const adult = () => lifeAtAge('w4b-save', 25);
describe('language save upgrade', () => {
  it('upgrades W4a saves immediately and preserves existing records', () => {
    const old = cloneJson(adult()) as unknown as Record<string, unknown>;
    const character = old.character as Record<string, unknown>; delete character.languages; delete old.languages;
    for (const p of Object.values(old.people as Record<string, Record<string, unknown>>)) delete p.languages;
    const upgraded = migrateEnvelope({ ...makeEnvelope(old, content.contentVersion), schemaVersion: 24 }).data as ReturnType<typeof adult>;
    expect(upgraded.languages).toEqual(emptyLanguageLearning());
    expect(upgraded.character.languages.some((l) => l.native)).toBe(true);
    expect(lifeStateSchema.safeParse(upgraded).success).toBe(true);
    expect(loadedLifeSchema(content).safeParse(upgraded).success).toBe(true);
    const again = migrateEnvelope({ ...makeEnvelope(upgraded, content.contentVersion), schemaVersion: 24 }).data;
    expect(again).toEqual(upgraded);
  });
  it('upgrades the starting snapshot in an heir replay log', () => {
    const old = cloneJson(adult()) as unknown as Record<string, unknown>;
    delete old.languages;
    delete (old.character as Record<string, unknown>).languages;
    for (const p of Object.values(old.people as Record<string, Record<string, unknown>>)) delete p.languages;
    const saved = { ...old, inputLog: [{ year: 2026, kind: 'create', payload: { heir: true, snapshot: cloneJson(old) } }] };
    const upgraded = migrateEnvelope({ ...makeEnvelope(saved, content.contentVersion), schemaVersion: 24 }).data as { inputLog: { payload: { snapshot: unknown } }[] };
    expect(lifeStateSchema.safeParse(upgraded.inputLog[0]!.payload.snapshot).success).toBe(true);
  });
  it('rejects invalid and duplicate skill records', () => {
    const life = adult();
    const invalid = produce(life, (d) => { d.character.languages[0]!.skill = 101; });
    expect(lifeStateSchema.safeParse(invalid).success).toBe(false);
    const duplicate = produce(life, (d) => { d.character.languages.push({ ...d.character.languages[0]! }); });
    expect(lifeStateSchema.safeParse(duplicate).success).toBe(false);
  });
});
