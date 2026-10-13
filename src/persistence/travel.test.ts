import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { content } from '../content';
import { performAction } from '../engine/actions';
import { emptyTravel } from '../engine/travel/types';
import { cloneJson, lifeAtAge } from '../engine/testFixtures';
import { makeEnvelope } from './envelope';
import { migrateEnvelope } from './migrations';
import { lifeStateSchema, loadedLifeSchema } from './lifeSchema';
it('upgrades a W4b save and heir replay snapshot without inventing a trip', () => {
  const life = lifeAtAge('travel-migrate', 25);
  const old = cloneJson(life) as unknown as Record<string, unknown>;
  delete old.travel;
  const saved = { ...old, inputLog: [{ year: life.currentYear, kind: 'create', payload: { heir: true, snapshot: cloneJson(old) } }] };
  const after = migrateEnvelope({ ...makeEnvelope(saved, content.contentVersion), schemaVersion: 25 }).data as typeof life;
  expect(after.travel).toEqual(emptyTravel());
  expect(after.inputLog[0]!.payload.snapshot).toMatchObject({ travel: emptyTravel() });
  expect(lifeStateSchema.safeParse(after).success).toBe(true);
  const regular = migrateEnvelope({ ...makeEnvelope(old, content.contentVersion), schemaVersion: 25 }).data;
  expect(loadedLifeSchema(content).safeParse(regular).success).toBe(true);
});
describe('travel saves', () => {
  it('roundtrips a trip in progress, preserving contacts, money and result cards', () => {
    const life = produce(lifeAtAge('travel-save', 25), (d) => { d.finances.savings = 20000; });
    const trip = performAction(life, 'plan_trip', { trip: { destinationId: 'kyoto', budget: 'budget', companions: [] } }, content);
    expect(loadedLifeSchema(content).parse(JSON.parse(JSON.stringify(trip)))).toEqual(trip);
  });
  it('rejects unsupported residence status, malformed dates, unknown destinations and missing contacts', () => {
    const life = produce(lifeAtAge('travel-save', 25), (d) => { d.finances.savings = 20000; });
    const trip = performAction(life, 'plan_trip', { trip: { destinationId: 'kyoto', budget: 'budget', companions: [] } }, content);
    const unsupported = cloneJson(trip) as unknown as { travel: { residence: { type: string } } };
    unsupported.travel.residence.type = 'permanent';
    expect(lifeStateSchema.safeParse(unsupported).success).toBe(false);
    for (const change of [(d: typeof trip) => { d.travel.residence!.endYear = d.birthYear - 1; }, (d: typeof trip) => { d.travel.active!.destinationId = 'nowhere'; }, (d: typeof trip) => { d.travel.active!.encounterId = 'missing'; }]) {
      const invalid = produce(trip, change);
      expect(loadedLifeSchema(content).safeParse(invalid).success).toBe(false);
    }
  });
});
