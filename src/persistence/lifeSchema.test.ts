import 'fake-indexeddb/auto';
import { produce } from 'immer';
import { afterEach, describe, expect, it } from 'vitest';
import { content } from '../content';
import { performAction } from '../engine/actions';
import { beginYear, createLife } from '../engine/life';
import { nextUint32 } from '../engine/rng';
import { customInput, lifeAtAge, liveOut } from '../engine/testFixtures';
import type { LifeState } from '../engine/types';
import { createDb, type WiplifeDb } from './db';
import { CURRENT_SCHEMA_VERSION, makeEnvelope, type SaveEnvelope } from './envelope';
import { lifeStateSchema, loadedLifeSchema } from './lifeSchema';
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

  it('keeps relationship changes and a management action in progress', async () => {
    const start = lifeAtAge('save-rel', 30);
    // Every life has a parent; at 30 you can cut contact with them.
    const parentId = Object.keys(start.relationships).find((id) => start.relationships[id]!.kind === 'parent')!;
    const acted = performAction(start, 'cut_contact', { personId: parentId }, content);
    expect(acted.phase).toBe('action');
    expect(acted.relationships[parentId]!.lastActionYear).toBe(acted.currentYear);
    expect(await roundTrip(acted)).toEqual(acted);
    const wed = produce(start, (d) => {
      const template = Object.values(d.people)[0]!;
      d.people.w = { ...template, id: 'w', birthYear: d.currentYear - 30, tags: [] };
      d.relationships.w = { personId: 'w', kind: 'fiance', status: 'active', affection: 70, trust: 70, memories: [], since: d.currentYear - 3, kindSince: d.currentYear - 1 };
    });
    expect(await roundTrip(wed)).toEqual(wed);
    expect(lifeStateSchema.safeParse({ ...wed, phase: 'dating' }).success).toBe(false);
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

  it('rejects empty names and missing pronoun forms', () => {
    const life = random('empty-text');
    const personId = Object.keys(life.people)[0]!;
    const breaks: ((l: LifeState) => void)[] = [
      (l) => (l.character.name.first = ''),
      (l) => (l.character.name.last = '   '),
      (l) => (l.people[personId]!.name.first = ''),
      ...(['subject', 'object', 'possessive', 'possessivePronoun', 'reflexive'] as const).flatMap((form) => [
        (l: LifeState) => (l.character.identity.pronouns[form] = ''),
        (l: LifeState) => (l.people[personId]!.identity.pronouns[form] = ' '),
      ]),
    ];
    for (const breakIt of breaks) {
      const bad = structuredClone(life);
      breakIt(bad);
      expect(lifeStateSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('runs the invariant checks when loading', () => {
    const life = random('invariant-load');
    expect(loadedLifeSchema(content).safeParse(life).success).toBe(true);
    // Well-formed, but impossible: the character is older than the calendar allows.
    const bad = structuredClone(life);
    bad.character.age = 5;
    expect(lifeStateSchema.safeParse(bad).success).toBe(true);
    const result = loadedLifeSchema(content).safeParse(bad);
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('does not match birth year');
  });

  it('falls back to the backup when the autosave breaks an invariant', async () => {
    const db = freshDb();
    const older = random('inv-older');
    await writeSave(db, makeEnvelope(older, content.contentVersion));
    const broken = structuredClone(random('inv-newer'));
    broken.inputLog = [];
    await writeSave(db, makeEnvelope(broken, content.contentVersion));
    const result = await readSave(db, loadedLifeSchema(content));
    expect(result.status).toBe('recovered');
    if (result.status === 'recovered') {
      expect(result.envelope.data).toEqual(older);
      expect(result.errors.join(' ')).toContain('input log');
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

describe('lives from Stage 3 on', () => {
  it('round trip mid-year, after years of aging, and after death', async () => {
    const midYear = beginYear(random('stage3-mid'), content);
    expect(['events', 'yearEnd']).toContain(midYear.phase);
    expect(await roundTrip(midYear)).toEqual(midYear);
    const dead = liveOut(random('stage3-dead'));
    expect(await roundTrip(dead)).toEqual(dead);
  });

  it('upgrades a Stage 2 (schema version 1) save while loading', async () => {
    const db = freshDb();
    const { recap: _recap, death: _death, lifetime: _lifetime, ...stage2 } = random('stage2');
    const old: SaveEnvelope = { ...makeEnvelope(stage2, content.contentVersion), schemaVersion: 1 };
    await db.lives.put({ id: 'active', envelope: old });
    const result = await readSave(db, loadedLifeSchema(content));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.envelope.data).toEqual(random('stage2'));
    }
  });

  it('rejects a death record outside the dead phase and a dead life without one', () => {
    const life = random('death-record');
    const schema = loadedLifeSchema(content);
    expect(schema.safeParse({ ...life, death: { year: 2026, age: 0, causeId: 'stroke' } }).success).toBe(false);
    expect(schema.safeParse({ ...life, phase: 'dead' }).success).toBe(false);
  });
});

describe('lives from Stage 5 on', () => {
  it('upgrade a schema version 3 save, marking spouses and ex-spouses', async () => {
    const start = lifeAtAge('stage5-migrate', 50);
    const template = Object.values(start.people)[0]!;
    const person = (id: string) => ({ ...template, id, birthYear: start.currentYear - 48, tags: [] });
    const rel = (id: string, kind: 'spouse' | 'ex', tags: string[]) => ({
      personId: id,
      kind,
      status: 'active' as const,
      affection: 50,
      trust: 50,
      memories: tags.map((tag) => ({ tag, year: start.currentYear - 1 })),
      since: start.currentYear - 20,
      kindSince: start.currentYear - 1,
    });
    // A version 3 save: no wasSpouse anywhere.
    const v3 = {
      ...start,
      people: { ...start.people, w: person('w'), d: person('d'), x: person('x') },
      relationships: {
        ...start.relationships,
        w: rel('w', 'spouse', ['married_you']),
        d: rel('d', 'ex', ['married_you', 'divorced']),
        x: rel('x', 'ex', ['started_dating', 'you_broke_up']),
      },
    };
    const db = freshDb();
    await db.lives.put({ id: 'active', envelope: { ...makeEnvelope(v3, content.contentVersion), schemaVersion: 3 } });
    const result = await readSave(db, loadedLifeSchema(content));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const upgraded = result.envelope.data.relationships;
    expect(upgraded.w!.wasSpouse).toBe(true);
    expect(upgraded.d!.wasSpouse).toBe(true);
    expect(upgraded.x!.wasSpouse).toBeUndefined();
    for (const id of Object.keys(start.relationships)) expect(upgraded[id]).toEqual(start.relationships[id]);
  });

  it('refuses a wasSpouse that is not true', () => {
    const life = lifeAtAge('stage5-bad', 30);
    const id = Object.keys(life.relationships)[0]!;
    const bad = { ...life, relationships: { ...life.relationships, [id]: { ...life.relationships[id]!, wasSpouse: false } } };
    expect(lifeStateSchema.safeParse(bad).success).toBe(false);
  });
});

describe('lives from Stage 4 on', () => {
  it('upgrade a Stage 3 (schema version 2) save with its lifetime happiness', async () => {
    const db = freshDb();
    // A Stage 3 life after five quiet years (Happiness never changed in Stage 3).
    let life = random('stage3');
    for (let i = 0; i < 5; i++) life = { ...life, currentYear: life.currentYear + 1 };
    const stage3 = {
      ...life,
      character: { ...life.character, age: 5, lifeStage: 'child' as const },
      inputLog: [...life.inputLog, ...Array.from({ length: 5 }, (_, i) => ({ year: 2026 + i, kind: 'ageUp' as const, payload: {} }))],
      recap: { year: 2031, age: 5, statsBefore: life.character.stats, statsAfter: life.character.stats },
    };
    const { lifetime: _lifetime, ...withoutLifetime } = stage3;
    await db.lives.put({ id: 'active', envelope: { ...makeEnvelope(withoutLifetime, content.contentVersion), schemaVersion: 2 } });
    const result = await readSave(db, loadedLifeSchema(content));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.envelope.data.lifetime).toEqual({ happinessTotal: 5 * life.character.stats.happiness, years: 5 });
    }
  });
});

describe('lives from Stage 6 on', () => {
  it('upgrade a schema version 4 save with its birth city, home and money tracking', async () => {
    const life = lifeAtAge('stage6-migrate', 30);
    // A version 4 save: no birth city, no year you moved in, no hardship count.
    const { birthCityId: _birth, ...character } = life.character;
    const { since: _since, ...housing } = life.housing;
    const { hardshipYears: _hardship, earnings: _earnings, ...finances } = life.finances;
    const v4 = { ...life, character, housing, finances: { ...finances, savings: 1_234 } };
    const db = freshDb();
    await db.lives.put({ id: 'active', envelope: { ...makeEnvelope(v4, content.contentVersion), schemaVersion: 4 } });
    const result = await readSave(db, loadedLifeSchema(content));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const upgraded = result.envelope.data;
    expect(upgraded.character.birthCityId).toBe(life.character.cityId);
    expect(upgraded.housing.since).toBe(life.birthYear);
    expect(upgraded.finances).toEqual({ ...life.finances, savings: 1_234, earnings: { years: 0, total: 0 }, hardshipYears: 0 });
  });

  it('round trip a life with debts, a mortgage and a move', async () => {
    let life = produce(lifeAtAge('stage6-round', 30), (d) => {
      d.finances.savings = 500_000;
      d.finances.lastLedger = { year: d.currentYear, gross: 90_000, retirement: 0, tax: 0, housing: 0, living: 0, debtPayments: 0, interest: 0, debtInterest: 0, borrowed: 0, support: 0, net: 90_000 };
      d.finances.debts.push({ id: 'd1', kind: 'student', balance: 12_000, annualRate: 0.055, minPayment: 1_600, missed: 1 });
    });
    const other = life.character.cityId === 'nyc' ? 'houston' : 'nyc';
    life = performAction(life, 'relocate', { cityId: other }, content);
    life = performAction(life, 'buy_home', {}, content);
    expect(life.housing.kind).toBe('owned');
    expect(await roundTrip(life)).toEqual(life);
  });

  it('refuse negative savings, a mortgage without a home and a roommate outside a rental', () => {
    const life = lifeAtAge('stage6-bad', 30);
    const schema = loadedLifeSchema(content);
    expect(schema.safeParse({ ...life, finances: { ...life.finances, savings: -1 } }).success).toBe(false);
    const mortgage = { id: 'd1', kind: 'mortgage', balance: 1_000, annualRate: 0.06, minPayment: 300, missed: 0 };
    expect(schema.safeParse({ ...life, finances: { ...life.finances, debts: [mortgage] } }).success).toBe(false);
    expect(schema.safeParse({ ...life, housing: { ...life.housing, roommate: true } }).success).toBe(false);
    expect(schema.safeParse({ ...life, character: { ...life.character, birthCityId: 'atlantis' } }).success).toBe(false);
  });
});

describe('lives from Stage 7 on', () => {
  /** A version 5 save: education has only current and credentials. */
  const v5 = (life: LifeState) => ({ ...life, education: { current: null, credentials: [] } });

  it('upgrade a schema version 5 adult with the high school diploma they would have earned', async () => {
    const life = lifeAtAge('stage7-migrate', 30);
    const db = freshDb();
    await db.lives.put({ id: 'active', envelope: { ...makeEnvelope(v5(life), content.contentVersion), schemaVersion: 5 } });
    const result = await readSave(db, loadedLifeSchema(content));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.envelope.data.education).toEqual({
      current: null,
      credentials: [{ type: 'hs_diploma', year: life.birthYear + 18 }],
      admission: null,
      left: null,
      applied: [],
      fund: 0,
    });
  });

  it('upgrade a schema version 5 child, who starts school at the next age-up', async () => {
    const life = lifeAtAge('stage7-child', 9);
    const db = freshDb();
    await db.lives.put({ id: 'active', envelope: { ...makeEnvelope(v5(life), content.contentVersion), schemaVersion: 5 } });
    const result = await readSave(db, loadedLifeSchema(content));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.envelope.data.education.credentials).toEqual([]);
    const next = beginYear(result.envelope.data, content);
    expect(next.education.current).toMatchObject({ program: 'elementary', year: 11 - 5 });
  });

  it('round trip a life in college with a place, a program left behind and scholarship money', async () => {
    const life = produce(lifeAtAge('stage7-round', 22), (d) => {
      d.education.credentials.push({ type: 'hs_diploma', year: d.currentYear - 4, gpa: 3.25 });
      d.education.current = { program: 'college', tier: 'state', majorId: 'nursing', year: 4, lengthYears: 4, gpa: 3.1, boost: 0.25, repeats: 0, scholarship: 0.3, since: d.currentYear - 3 };
      d.education.admission = { program: 'grad', gradProgramId: 'medicine', scholarship: 0.1, decided: d.currentYear };
      d.education.left = { program: 'trade', tradeId: 'welder', year: 1, lengthYears: 1, gpa: 2.5, boost: 0, repeats: 0, scholarship: 0, since: d.currentYear - 4, leftYear: d.currentYear - 4 };
      d.education.applied = [{ option: 'grad:medicine', accepted: true }];
      d.education.fund = 2_500;
      d.education.lastBill = { year: d.currentYear, tuition: 11_500, scholarship: 3_450, family: 3_220, fund: 0, loan: 4_830 };
    });
    expect(await roundTrip(life)).toEqual(life);
  });

  it('refuse school that breaks the rules', () => {
    const life = lifeAtAge('stage7-bad', 20);
    const schema = loadedLifeSchema(content);
    const enrollment = { program: 'grad', gradProgramId: 'law', year: 1, lengthYears: 3, gpa: 3, boost: 0, repeats: 0, scholarship: 0, since: life.currentYear };
    expect(schema.safeParse({ ...life, education: { ...life.education, current: enrollment } }).success).toBe(false);
    expect(schema.safeParse({ ...life, education: { ...life.education, current: { ...enrollment, gpa: 5 } } }).success).toBe(false);
    expect(schema.safeParse({ ...life, education: { ...life.education, fund: -1 } }).success).toBe(false);
    expect(schema.safeParse({ ...life, education: { ...life.education, credentials: [{ type: 'bachelor', refId: 'alchemy', year: life.currentYear, tier: 'state' }] } }).success).toBe(false);
  });
});

describe('lives from Stage 8 on', () => {
  it('upgrade a schema version 6 life with empty applications and openings', async () => {
    const life = lifeAtAge('stage8-migrate', 30);
    const v6 = { ...life, career: { job: null, gig: true, retired: false, history: [] } };
    const db = freshDb();
    await db.lives.put({ id: 'active', envelope: { ...makeEnvelope(v6, content.contentVersion), schemaVersion: 6 } });
    const result = await readSave(db, loadedLifeSchema(content));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.envelope.data.career).toEqual({ job: null, gig: true, retired: false, history: [], applied: [], openings: [] });
    // The next year rolls the openings.
    expect(beginYear(result.envelope.data, content).career.openings.length).toBeGreaterThan(0);
  });

  it('round trip a life with a job, a past job, applications and openings', async () => {
    const life = produce(lifeAtAge('stage8-round', 30), (d) => {
      d.education.credentials.push({ type: 'hs_diploma', year: d.currentYear - 12 });
      d.career.job = { jobId: 'bank_teller', level: 2, yearsAtLevel: 1, performance: 61, salary: 43_200, since: d.currentYear - 3, employer: 'Keystone Savings', raiseYear: d.currentYear };
      d.career.history = [{ jobId: 'retail_associate', employer: 'MegaMart', fromYear: d.currentYear - 8, toYear: d.currentYear - 3, level: 2, salary: 33_000, endedBy: 'quit' }];
      d.career.applied = [{ jobId: 'bank_teller', hired: true }];
      d.career.openings = ['bank_teller', 'warehouse_worker'];
    });
    expect(await roundTrip(life)).toEqual(life);
  });

  it('refuse a job with an unknown end or a bad level', () => {
    const life = lifeAtAge('stage8-bad', 30);
    const bad = { ...life, career: { ...life.career, history: [{ jobId: 'bank_teller', employer: 'X', fromYear: 2020, toYear: 2021, level: 0, salary: 1, endedBy: 'vanished' }] } };
    expect(lifeStateSchema.safeParse(bad).success).toBe(false);
  });
});
