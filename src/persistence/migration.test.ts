import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { cloneJson, lifeAtAge } from '../engine/testFixtures';
import { emptyMigration } from '../engine/migration/types';
import { makeEnvelope } from './envelope';
import { migrateEnvelope } from './migrations';
import { lifeStateSchema, loadedLifeSchema } from './lifeSchema';

describe('W6 saves', () => {
  it('upgrades a W5 save and heir replay snapshot: citizenships from where you were born and where each person lives, an empty migration record', () => {
    const life = lifeAtAge('w6-migrate', 25);
    const old = cloneJson(life) as unknown as Record<string, unknown> & { character: Record<string, unknown>; people: Record<string, Record<string, unknown>> };
    delete old.migration;
    delete old.character.citizenships;
    for (const p of Object.values(old.people)) delete p.citizenships;
    const saved = { ...old, inputLog: [{ year: life.currentYear, kind: 'create', payload: { heir: true, snapshot: cloneJson(old) } }] };
    const after = migrateEnvelope({ ...makeEnvelope(saved, content.contentVersion), schemaVersion: 26 }).data as typeof life;
    expect(after.migration).toEqual(emptyMigration());
    expect(after.character.citizenships).toEqual([content.cities[life.character.birthCityId]!.countryId]);
    for (const p of Object.values(after.people)) expect(p.citizenships).toEqual([content.cities[life.people[p.id]!.cityId]!.countryId]);
    expect(after.inputLog[0]!.payload.snapshot).toMatchObject({ migration: emptyMigration() });
    expect(lifeStateSchema.safeParse(after).success).toBe(true);
    // Nobody had emigrated: no residence is invented.
    expect(after.travel.residence).toBeNull();
    expect(loadedLifeSchema(content).safeParse(migrateEnvelope({ ...makeEnvelope(old, content.contentVersion), schemaVersion: 26 }).data).success).toBe(true);
  });

  it('roundtrips a life lived in a new country without papers, with an application, removals and money sent home', () => {
    const life = produce(lifeAtAge('w6-save', 30), (d) => {
      d.character.citizenships = ['mx', 'us'];
      d.migration.arrivedYear = d.currentYear - 4;
      d.migration.remit = { level: 'some', sent: 1200 };
      d.migration.removed = { uk: d.currentYear - 3 };
      d.migration.counts = { 'applied:investment:ca': 1 };
      d.migration.application = { kind: 'entry', route: 'investment', countryId: 'ca', cityId: 'toronto', sinceYear: d.currentYear, decisionYear: d.currentYear + 1, status: 'pending', fee: 9000, odds: 0.8, invested: 400000 };
    });
    expect(loadedLifeSchema(content).parse(JSON.parse(JSON.stringify(life)))).toEqual(life);
  });

  it('rejects a person with no citizenship, an unknown country, an application with no route, and a permit record that does not fit', () => {
    const life = lifeAtAge('w6-bad', 30);
    const schema = loadedLifeSchema(content);
    expect(schema.safeParse(produce(life, (d) => { d.character.citizenships = []; })).success).toBe(false);
    expect(lifeStateSchema.safeParse(produce(life, (d) => { (d.character.citizenships as string[]) = ['xx']; })).success).toBe(false);
    expect(schema.safeParse(produce(life, (d) => { d.migration.application = { kind: 'entry', countryId: 'ca', sinceYear: d.currentYear, decisionYear: d.currentYear + 1, status: 'pending', fee: 1, odds: 0.5 }; })).success).toBe(false);
    // Living in another country than your citizenship, with no residence record.
    expect(schema.safeParse(produce(life, (d) => { d.character.citizenships = [d.character.citizenships[0] === 'us' ? 'mx' : 'us']; })).success).toBe(false);
    expect(schema.safeParse(produce(life, (d) => { d.migration.undocumented = { sinceYear: d.currentYear, origin: 'overstay', closeCalls: 0 }; })).success).toBe(false);
  });
});
