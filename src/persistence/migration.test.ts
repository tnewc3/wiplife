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

describe('Batch 2a saves', () => {
  it('upgrades a save from before activities: an empty record for the current year, in the life and in an heir snapshot', () => {
    const life = lifeAtAge('b2a-migrate', 30);
    const old = cloneJson(life) as unknown as Record<string, unknown>;
    delete old.pastimes;
    const saved = { ...old, inputLog: [{ year: life.currentYear, kind: 'create', payload: { heir: true, snapshot: cloneJson(old) } }] };
    const after = migrateEnvelope({ ...makeEnvelope(saved, content.contentVersion), schemaVersion: 28 }).data as typeof life;
    expect(after.pastimes).toEqual({ year: life.currentYear, counts: {}, receipts: [] });
    expect(after.inputLog[0]!.payload.snapshot).toMatchObject({ pastimes: { counts: {}, receipts: [] } });
    expect(lifeStateSchema.safeParse(after).success).toBe(true);
  });

  it('roundtrips a life with a valuable and a receipt', () => {
    const life = produce(lifeAtAge('b2a-save', 35), (d) => {
      d.possessions.items.push({ id: 'q1', kind: 'valuable', defId: 'gold_watch', acquired: d.currentYear, value: 4800, condition: 100, valuable: { insured: true } });
      d.possessions.nextId = 2;
      d.pastimes = { year: d.currentYear, counts: { haircut: 1 }, receipts: [{ year: d.currentYear, pastimeId: 'haircut', tier: 'good', text: 'A clean cut.', notes: [], money: { change: -35, balance: 100, debtChange: 0 }, changes: { looks: 2 } }] };
    });
    expect(loadedLifeSchema(content).parse(JSON.parse(JSON.stringify(life)))).toEqual(life);
  });
});

describe('Batch 2b saves', () => {
  it('upgrades a save from before the risk activities without changing it, in the life and in an heir snapshot', () => {
    const life = lifeAtAge('b2b-migrate', 30);
    const old = cloneJson(life) as unknown as Record<string, unknown>;
    const saved = { ...old, inputLog: [{ year: life.currentYear, kind: 'create', payload: { heir: true, snapshot: cloneJson(old) } }] };
    const after = migrateEnvelope({ ...makeEnvelope(saved, content.contentVersion), schemaVersion: 29 }).data as typeof life;
    expect(after.character.formerNames).toBeUndefined();
    expect(after.finances.debts).toEqual(life.finances.debts);
    expect(after.inputLog[0]!.payload.snapshot).toMatchObject({ pastimes: { counts: {}, receipts: [] } });
    expect(lifeStateSchema.safeParse(after).success).toBe(true);
  });

  it('roundtrips a life with a bank loan, a payday loan, a loan shark debt, a former name and a receipt that shows dirty money', () => {
    const life = produce(lifeAtAge('b2b-save', 35), (d) => {
      d.finances.debts.push(
        { id: 'd1', kind: 'bank', balance: 8000, annualRate: 0.11, minPayment: 2200, missed: 0 },
        { id: 'd2', kind: 'payday', balance: 900, annualRate: 0.9, minPayment: 1710, missed: 1 },
        { id: 'd3', kind: 'shark', balance: 4000, annualRate: 1.3, minPayment: 6400, missed: 2 },
      );
      d.character.formerNames = [{ first: 'Sam', last: 'Hale', year: d.currentYear - 4 }];
      d.pastimes = {
        year: d.currentYear,
        counts: { burglary: 1 },
        receipts: [{ year: d.currentYear, pastimeId: 'burglary', tier: 'good', text: 'Out and gone.', notes: [], money: { change: 0, balance: 100, debtChange: 0, dirty: { change: 3000, balance: 3000 } }, changes: {} }],
      };
    });
    expect(loadedLifeSchema(content).parse(JSON.parse(JSON.stringify(life)))).toEqual(life);
    expect(lifeStateSchema.safeParse(produce(life, (d) => void (d.finances.debts[0]!.kind = 'loan' as never))).success).toBe(false);
    expect(lifeStateSchema.safeParse(produce(life, (d) => void (d.character.formerNames = [{ first: '', last: 'x', year: 1 }]))).success).toBe(false);
  });
});
