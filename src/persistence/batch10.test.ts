import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { performAction } from '../engine/actions';
import { emptyLanguageLearning } from '../engine/languages';
import { cloneJson, lifeAtAge } from '../engine/testFixtures';
import { emptyTravel } from '../engine/travel/types';
import type { LifeState } from '../engine/types';
import { makeEnvelope } from './envelope';
import { lifeStateSchema, loadedLifeSchema } from './lifeSchema';
import { migrateEnvelope } from './migrations';

/** A schema-36 save: the Batch 10 fields are not there yet. */
function oldSave(): Record<string, unknown> {
  const life = produce(lifeAtAge('b10-save', 45), (d) => {
    d.finances.earnings = { years: 8, total: 240_000, byCountry: { [content.cities[d.character.cityId]!.countryId]: { years: 8, total: 240_000 } } };
  });
  const old = cloneJson(life) as unknown as Record<string, unknown>;
  const languages = old.languages as Record<string, unknown>;
  for (const key of ['methodYear', 'practice', 'certificates', 'examYear', 'recentExam', 'exams', 'home']) delete languages[key];
  languages.totals = { school: 3, classes: 12, immersion: 5, faded: 1 };
  const travel = old.travel as Record<string, unknown>;
  delete travel.businessYear;
  travel.totals = { ...(travel.totals as object), trips: 2, destinations: { kyoto: 2 } };
  for (const key of ['styles', 'activities', 'souvenirs', 'perDiem', 'familyStays', 'familyMembers']) delete (travel.totals as Record<string, unknown>)[key];
  delete (old.finances as { earnings: Record<string, unknown> }).earnings.byCountry;
  return old;
}

const home = (): string => content.cities[(lifeAtAge('b10-save', 45)).character.cityId]!.countryId;
describe('Batch 10 save upgrade (schema 36 → 37)', () => {
  it('fills the language, travel and retirement records without inventing anything', () => {
    const old = oldSave();
    const after = migrateEnvelope({ ...makeEnvelope(old, content.contentVersion), schemaVersion: 36 }).data as LifeState;
    expect(after.languages).toEqual({ ...emptyLanguageLearning(), totals: { ...emptyLanguageLearning().totals, school: 3, classes: 12, immersion: 5, faded: 1 } });
    expect(after.travel.businessYear).toBeNull();
    expect(after.travel.totals).toMatchObject({ trips: 2, destinations: { kyoto: 2 }, styles: {}, activities: {}, souvenirs: {}, perDiem: 0, familyStays: 0, familyMembers: 0 });
    // Every year so far counts for the country the life is in, which is how the old rule counted them.
    expect(after.finances.earnings).toEqual({ years: 8, total: 240_000, byCountry: { [home()]: { years: 8, total: 240_000 } } });
    expect(lifeStateSchema.safeParse(after).success).toBe(true);
    const loaded = loadedLifeSchema(content).safeParse(after);
    expect(loaded.success ? [] : loaded.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)).toEqual([]);
    // Upgrading what is already current changes nothing.
    expect(migrateEnvelope({ ...makeEnvelope(after, content.contentVersion), schemaVersion: 36 }).data).toEqual(after);
  });
  it('a record with no years gets no country row', () => {
    const old = oldSave();
    (old.finances as { earnings: Record<string, unknown> }).earnings = { years: 0, total: 0 };
    const after = migrateEnvelope({ ...makeEnvelope(old, content.contentVersion), schemaVersion: 36 }).data as LifeState;
    expect(after.finances.earnings).toEqual({ years: 0, total: 0, byCountry: {} });
  });
  it('upgrades the starting snapshot in an heir replay log, and keeps a stay in progress solo', () => {
    const old = oldSave();
    const saved = { ...old, inputLog: [{ year: 2026, kind: 'create', payload: { heir: true, snapshot: cloneJson(old) } }] };
    const after = migrateEnvelope({ ...makeEnvelope(saved, content.contentVersion), schemaVersion: 36 }).data as { inputLog: { payload: { snapshot: LifeState } }[] };
    const snapshot = after.inputLog[0]!.payload.snapshot;
    expect(snapshot.languages.certificates).toEqual({});
    expect(snapshot.finances.earnings.byCountry).toEqual({ [home()]: { years: 8, total: 240_000 } });
    expect(lifeStateSchema.safeParse(snapshot).success).toBe(true);
    const stay = produce(oldSave(), (d) => {
      (d as { travel: unknown }).travel = { ...(d.travel as object), residence: { country: 'Canada', destinationId: 'toronto', type: 'temporary_worker', startYear: 2070, endYear: 2072, homeCityId: 'chicago', route: 'working_holiday' } };
    });
    const kept = migrateEnvelope({ ...makeEnvelope(stay, content.contentVersion), schemaVersion: 36 }).data as LifeState;
    expect(kept.travel.residence).toMatchObject({ destinationId: 'toronto', route: 'working_holiday' });
    expect(kept.travel.residence).not.toHaveProperty('family');
  });
  it('empty travel totals are the ones the migration fills', () => {
    expect(emptyTravel().totals).toMatchObject({ styles: {}, activities: {}, souvenirs: {}, perDiem: 0 });
  });
});

describe('Batch 10 saves', () => {
  it('roundtrips a honeymoon-style trip with an activity and a souvenir, a certificate and a language at home', () => {
    const life = produce(lifeAtAge('b10-roundtrip', 30), (d) => {
      d.finances.savings = 40_000;
      d.languages.certificates = { fr: 'conversational' };
      d.languages.examYear = { fr: d.currentYear - 1 };
      d.languages.recentExam = { id: 'fr', level: 'conversational', passed: true };
      d.languages.exams = { sat: 2, passed: 1 };
    });
    const trip = performAction(life, 'plan_trip', { trip: { destinationId: 'berlin', budget: 'budget', companions: [], activity: 'food', souvenir: 'small' } }, content);
    expect(trip.travel.active).toMatchObject({ style: 'vacation', activity: 'food', souvenir: 'small' });
    expect(loadedLifeSchema(content).parse(JSON.parse(JSON.stringify(trip)))).toEqual(trip);
  });
  it('rejects a certificate for a language that does not exist and a family with no one in it', () => {
    const life = lifeAtAge('b10-bad', 30);
    const bad = produce(life, (d) => { d.languages.certificates = { klingon: 'basic' }; });
    expect(loadedLifeSchema(content).safeParse(bad).success).toBe(false);
  });
});
