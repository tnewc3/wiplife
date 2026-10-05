import 'fake-indexeddb/auto';
import { produce } from 'immer';
import { afterEach, describe, expect, it } from 'vitest';
import { content } from '../content';
import { performAction } from '../engine/actions';
import { performInteraction } from '../engine/interactions/perform';
import { playYear } from '../engine/autoplay';
import { beginYear, createLife } from '../engine/life';
import { nextUint32 } from '../engine/rng';
import { emptyWeb } from '../engine/web/ties';
import { die, parentLife } from '../engine/estate/fixtures';
import { continueAsHeir, heirCandidates } from '../engine/estate/heir';
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
      // A life from before C1 gets the average Happiness baseline (the C1 migration).
      const expected = produce(random('stage2'), (d) => {
        d.character.hidden.happinessBaseline = 50;
        // E1: everyone has a plain mood and your family's background (the E1 migration).
        for (const person of Object.values(d.people)) {
          person.mood = 50;
          person.moodBase = 50;
          person.wealthLevel = d.character.familyWealth;
        }
        // E4: the web starts empty (the first year builds it).
        d.web = emptyWeb();
      });
      expect(result.envelope.data).toEqual(expected);
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
      d.finances.lastLedger = { year: d.currentYear, gross: 90_000, retirement: 0, tax: 0, housing: 0, living: 0, debtPayments: 0, interest: 0, debtInterest: 0, borrowed: 0, support: 0, children: 0, care: 0, supportPaid: 0, supportReceived: 0, net: 90_000 };
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

describe('lives from Stage 9 on', () => {
  it('upgrade a schema version 7 life with an empty self-discovery record', async () => {
    const life = lifeAtAge('stage9-migrate', 30);
    const { discovery: _discovery, ...v7 } = life;
    const db = freshDb();
    await db.lives.put({ id: 'active', envelope: { ...makeEnvelope(v7, content.contentVersion), schemaVersion: 7 } });
    const result = await readSave(db, loadedLifeSchema(content));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.envelope.data.discovery).toEqual({ surfaced: {} });
    expect(result.envelope.data.health).toEqual(life.health);
  });

  it('round trip a life with conditions, a doctor visit, a record, prison and things that surfaced', async () => {
    const life = produce(lifeAtAge('stage9-round', 30), (d) => {
      d.health = { conditions: [{ conditionId: 'depression', since: d.currentYear - 2, severity: 35, treated: true }], lastVisit: d.currentYear - 1 };
      d.legal = {
        record: [
          { offenseId: 'shoplifting', year: d.currentYear - 15, outcome: 'warning' },
          { offenseId: 'theft', year: d.currentYear, outcome: 'jail', years: 2 },
        ],
        incarceratedUntil: d.currentYear + 2,
      };
      d.housing = { kind: 'incarcerated', cityId: d.character.cityId, annualCost: 0, since: d.currentYear };
      d.discovery = { surfaced: { personality: { year: d.currentYear - 3, times: 2 } }, crisisYear: d.currentYear - 1 };
      d.character.latent = { personality: { riskTaking: 90 } };
      d.character.hidden.innerConflict = 33;
    });
    expect(loadedLifeSchema(content).safeParse(life).success).toBe(true);
    expect(await roundTrip(life)).toEqual(life);
  });

  it('refuse prison without a sentence, an unknown condition, or a bad severity', () => {
    const life = lifeAtAge('stage9-bad', 30);
    const schema = loadedLifeSchema(content);
    expect(schema.safeParse({ ...life, housing: { ...life.housing, kind: 'incarcerated' } }).success).toBe(false);
    expect(schema.safeParse({ ...life, health: { conditions: [{ conditionId: 'the_vapors', since: life.currentYear, severity: 10, treated: false }] } }).success).toBe(false);
    expect(lifeStateSchema.safeParse({ ...life, health: { conditions: [{ conditionId: 'cancer', since: life.currentYear, severity: 0, treated: false }] } }).success).toBe(false);
  });
});

describe('lives from C1 on', () => {
  it('upgrade a schema version 8 life with the average Happiness baseline', async () => {
    const life = lifeAtAge('c1-migrate', 30);
    const { happinessBaseline: _dropped, ...hidden } = life.character.hidden;
    const v8 = { ...life, character: { ...life.character, hidden } };
    const db = freshDb();
    await db.lives.put({ id: 'active', envelope: { ...makeEnvelope(v8, content.contentVersion), schemaVersion: 8 } });
    const result = await readSave(db, loadedLifeSchema(content));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.envelope.data.character.hidden.happinessBaseline).toBe(50);
  });

  it('round trip a follow-up and its time, outcome money and a changed rent', async () => {
    const life = produce(lifeAtAge('c1-round', 30), (d) => {
      d.housing = { kind: 'renting', cityId: d.character.cityId, annualCost: 15_000, since: d.currentYear - 2, rentFactor: 1.08 };
      d.scheduled = [{ eventId: 'rent_hike', dueYear: d.currentYear + 2, cast: {}, since: d.currentYear }];
      d.phase = 'events';
      d.pending = [
        { instanceId: 'e1', eventId: 'rent_hike', cast: {}, since: d.currentYear - 1, resolvedChoiceId: 'pay', money: { change: 0, balance: 10, debtChange: 0, housing: { change: 1_100, annual: 15_000 } } },
      ];
    });
    expect(await roundTrip(life)).toEqual(life);
  });

  it('refuse a broken outcome record or rent factor', () => {
    const life = lifeAtAge('c1-bad', 30);
    const schema = loadedLifeSchema(content);
    expect(schema.safeParse({ ...life, housing: { ...life.housing, rentFactor: -1 } }).success).toBe(false);
    const pending = [{ instanceId: 'e1', eventId: 'rent_hike', cast: {}, money: { change: 1, balance: -5, debtChange: 0 } }];
    expect(schema.safeParse({ ...life, phase: 'events', pending }).success).toBe(false);
  });
});

describe('lives from E1 on', () => {
  it('upgrade a schema version 9 life: a plain mood, your family’s background for everyone, and no outcome card', async () => {
    const life = lifeAtAge('e1-migrate', 30);
    const v9 = {
      ...life,
      people: Object.fromEntries(
        Object.entries(life.people).map(([id, p]) => {
          const { mood: _m, moodBase: _b, wealthLevel: _w, ...rest } = p;
          return [id, rest];
        }),
      ),
    } as Record<string, unknown>;
    delete v9.pendingInteraction;
    const db = freshDb();
    await db.lives.put({ id: 'active', envelope: { ...makeEnvelope(v9, content.contentVersion), schemaVersion: 9 } });
    const result = await readSave(db, loadedLifeSchema(content));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const upgraded = result.envelope.data;
    expect(upgraded.pendingInteraction).toBeNull();
    for (const person of Object.values(upgraded.people)) {
      expect([person.mood, person.moodBase, person.wealthLevel]).toEqual([50, 50, life.character.familyWealth]);
    }
    expect(upgraded.relationships).toEqual(life.relationships);
  });

  it('round trip counters, an outcome card with a choice waiting, and the interaction inputs', async () => {
    const start = lifeAtAge('e1-round', 30);
    const withFriend = produce(start, (d) => {
      const template = Object.values(d.people)[0]!;
      d.people.f1 = { ...JSON.parse(JSON.stringify(template)), id: 'f1', birthYear: d.currentYear - 30 };
      d.relationships.f1 = { personId: 'f1', kind: 'friend', status: 'active', affection: 60, trust: 60, memories: [], since: d.currentYear - 2 };
      d.finances.savings = 1000;
    });
    const waiting = performInteraction(withFriend, { interactionId: 'give_gift', personId: 'f1', giftTier: 'small' }, content);
    expect(waiting.pendingInteraction?.money).toBeDefined();
    expect(await roundTrip(waiting)).toEqual(waiting);
    expect(loadedLifeSchema(content).safeParse(waiting).success).toBe(true);

    const fight = produce(withFriend, (d) => {
      d.pendingInteraction = {
        interactionId: 'pick_a_fight',
        personId: 'f1',
        tier: 'neutral',
        text: 'You stand nose to nose.',
        notes: ['You broke a bone in the fight.'],
        changes: { affection: -8, trust: -6, mood: -10 },
        annoyed: true,
        choice: { prompt: 'It could go either way.', options: [{ id: 'swing', label: 'Throw the first punch' }, { id: 'back_down', label: 'Back down' }] },
      };
    });
    expect(await roundTrip(fight)).toEqual(fight);
    const chosen = produce(fight, (d) => {
      d.pendingInteraction!.choice!.chosen = 'swing';
      d.pendingInteraction!.choice!.result = 'You swing.';
    });
    expect(await roundTrip(chosen)).toEqual(chosen);
    expect(waiting.inputLog.some((r) => r.kind === 'interact')).toBe(true);
  });

  it('refuse a bad mood, wealth level, counter or outcome card', () => {
    const life = lifeAtAge('e1-bad', 30);
    const id = Object.keys(life.people)[0]!;
    const schema = loadedLifeSchema(content);
    const person = (patch: object) => ({ ...life, people: { ...life.people, [id]: { ...life.people[id]!, ...patch } } });
    expect(schema.safeParse(person({ mood: 101 })).success).toBe(false);
    expect(schema.safeParse(person({ moodBase: -1 })).success).toBe(false);
    expect(schema.safeParse(person({ wealthLevel: 'billionaire' })).success).toBe(false);
    const rel = (patch: object) => ({ ...life, relationships: { ...life.relationships, [id]: { ...life.relationships[id]!, ...patch } } });
    expect(schema.safeParse(rel({ interactions: { year: life.currentYear, counts: { chat: 0 }, gained: { affection: 0, trust: 0 }, annoyed: false } })).success).toBe(false);
    // Gains past the yearly cap can't have happened.
    expect(schema.safeParse(rel({ interactions: { year: life.currentYear, counts: { chat: 1 }, gained: { affection: 999, trust: 0 }, annoyed: false } })).success).toBe(false);
    expect(schema.safeParse({ ...life, pendingInteraction: { interactionId: 'chat', personId: id, tier: 'amazing', text: 'x', notes: [], changes: { affection: 0, trust: 0, mood: 0 }, annoyed: false } }).success).toBe(false);
    expect(schema.safeParse({ ...life, pendingInteraction: { interactionId: 'nope', personId: id, tier: 'good', text: 'x', notes: [], changes: { affection: 0, trust: 0, mood: 0 }, annoyed: false } }).success).toBe(false);
    expect(schema.safeParse({ ...life, pendingInteraction: { interactionId: 'chat', personId: 'ghost', tier: 'good', text: 'x', notes: [], changes: { affection: 0, trust: 0, mood: 0 }, annoyed: false } }).success).toBe(false);
  });
});

describe('lives from E2a on', () => {
  it('upgrade a schema version 10 life: who can carry follows the gender category, an empty family, and a ledger without children', async () => {
    const base = lifeAtAge('e2a-migrate', 30);
    const life = produce(base, (d) => {
      d.finances.lastLedger = { year: d.currentYear, gross: 40_000, retirement: 0, tax: 3_000, housing: 5_000, living: 12_000, debtPayments: 0, interest: 0, debtInterest: 0, borrowed: 0, support: 0, children: 0, care: 0, supportPaid: 0, supportReceived: 0, net: 20_000 };
    });
    const v10 = JSON.parse(JSON.stringify(life)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- stripping fields from plain JSON to build an old save
    delete v10.family;
    delete v10.character.canCarry;
    for (const p of Object.values<Record<string, unknown>>(v10.people)) delete p.canCarry;
    for (const key of ['children', 'supportPaid', 'supportReceived']) delete v10.finances.lastLedger[key];
    const db = freshDb();
    await db.lives.put({ id: 'active', envelope: { ...makeEnvelope(v10, content.contentVersion), schemaVersion: 10 } });
    const result = await readSave(db, loadedLifeSchema(content));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const upgraded = result.envelope.data;
    expect(upgraded.family).toEqual({ pregnancy: null, process: null, support: null, attempts: 0, lostChildren: 0, miscarriages: 0 });
    for (const person of Object.values(upgraded.people)) {
      if (person.identity.genderCategory === 'woman') expect(person.canCarry).toBe(true);
      if (person.identity.genderCategory === 'man') expect(person.canCarry).toBe(false);
    }
    expect(upgraded.finances.lastLedger).toMatchObject({ children: 0, care: 0, supportPaid: 0, supportReceived: 0 });
  });

  it('round trip a pregnancy, a process, children with parenting styles, custody and child support', async () => {
    const start = lifeAtAge('e2a-round', 34);
    const life = produce(start, (d) => {
      const template = JSON.parse(JSON.stringify(Object.values(d.people)[0]!));
      d.people.x1 = { ...template, id: 'x1', birthYear: d.currentYear - 33, canCarry: true, name: { first: 'Ex', last: 'Test' } };
      d.relationships.x1 = { personId: 'x1', kind: 'ex', status: 'active', affection: 40, trust: 40, memories: [], since: d.currentYear - 6, kindSince: d.currentYear - 2, wasSpouse: true };
      d.people.k1 = {
        ...template,
        id: 'k1',
        birthYear: d.currentYear - 6,
        canCarry: false,
        name: { first: 'Kid', last: 'Test' },
        traits: { ambition: 50, confidence: 50, kindness: 55, riskTaking: 40, discipline: 60, sociability: 50 },
        child: { origin: 'birth', otherParentId: 'x1', custody: 'shared', custodyDecided: true, health: 90, happiness: 70, fitness: 50, stress: 12, geneticRisk: 30, talent: null, gpa: 3.1, latent: {} },
      };
      d.relationships.k1 = { personId: 'k1', kind: 'child', status: 'active', affection: 70, trust: 65, memories: [{ tag: 'parent_in_front_row', year: d.currentYear - 1 }], since: d.currentYear - 6, parenting: { warmth: 70, strictness: 40, involvement: 66 } };
      d.family = { pregnancy: { startYear: d.currentYear, how: 'ivf', carrier: 'you', decision: 'keep' }, process: null, support: null, attempts: 1, lostChildren: 0, miscarriages: 1 };
      d.character.canCarry = true;
    });
    expect(loadedLifeSchema(content).safeParse(life).success).toBe(true);
    expect(await roundTrip(life)).toEqual(life);
    const withProcess = produce(life, (d) => {
      d.family.pregnancy = null;
      d.family.process = { kind: 'adoption', startYear: d.currentYear, dueYear: d.currentYear + 2, otherParentId: 'x1' };
      d.family.support = { direction: 'pay', personId: 'x1' };
    });
    expect(await roundTrip(withProcess)).toEqual(withProcess);
  });

  it('rejects a save with a child who has no child data, or a parenting style out of range', () => {
    const base = lifeAtAge('e2a-bad', 34);
    const broken = produce(base, (d) => {
      const template = JSON.parse(JSON.stringify(Object.values(d.people)[0]!));
      d.people.k1 = { ...template, id: 'k1', birthYear: d.currentYear - 6, name: { first: 'Kid', last: 'Test' } };
      d.relationships.k1 = { personId: 'k1', kind: 'child', status: 'active', affection: 70, trust: 65, memories: [], since: d.currentYear - 6 };
    });
    expect(loadedLifeSchema(content).safeParse(broken).success).toBe(false);
    const style = produce(base, (d) => {
      const first = Object.keys(d.relationships)[0]!;
      d.relationships[first]!.parenting = { warmth: 120, strictness: 50, involvement: 50 };
    });
    expect(lifeStateSchema.safeParse(style).success).toBe(false);
  });
});

describe('heirs, wills and estates (E2b)', () => {
  it('upgrades a version 11 life with a family line of its own, no will and no estate', async () => {
    const life = lifeAtAge('e2b-v11', 30);
    const v11 = JSON.parse(JSON.stringify(life)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- stripping fields from plain JSON to build an old save
    delete v11.will;
    delete v11.estate;
    v11.lineage = { generation: 1 };
    const db = freshDb();
    await db.lives.put({ id: 'active', envelope: { ...makeEnvelope(v11, content.contentVersion), schemaVersion: 11 } });
    const result = await readSave(db, loadedLifeSchema(content));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const upgraded = result.envelope.data;
    expect(result.envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect([upgraded.will, upgraded.estate]).toEqual([null, null]);
    expect(upgraded.lineage).toEqual({ generation: 1, lineId: life.id, familyName: life.character.name.last, reputation: 50, deeds: [] });
    expect(upgraded).toEqual({ ...life, web: emptyWeb() });
  });

  it('round trips a will, an estate settlement, and heirs: a minor in trust with a guardian, one in foster care, a grown one with a home', async () => {
    const base = parentLife({ kids: [9, 30], spouse: true, home: { value: 300_000, mortgage: 100_000 }, seed: 'e2b-round' });
    const [a] = heirCandidates({ ...base, phase: 'dead' } as LifeState);
    const withWill = performAction(base, 'write_will', { shares: [{ kind: 'person', id: a!, percent: 70 }, { kind: 'cause', id: 'library', percent: 30 }] }, content);
    expect(await roundTrip(withWill)).toEqual(withWill);
    const dead = die(withWill);
    expect(await roundTrip(dead)).toEqual(dead);
    for (const id of heirCandidates(dead)) {
      const heir = continueAsHeir(dead, id, content);
      expect(loadedLifeSchema(content).safeParse(heir).success, id).toBe(true);
      expect(await roundTrip(heir)).toEqual(heir);
    }
    const orphan = die(parentLife({ kids: [10], noRelatives: true, seed: 'e2b-foster' }));
    const fostered = continueAsHeir(orphan, heirCandidates(orphan)[0]!, content);
    expect(fostered.housing.foster).toBe(true);
    expect(await roundTrip(fostered)).toEqual(fostered);
  });

  it('rejects a will that does not add up, a trust past its release age, and a minor with no one to live with', () => {
    const base = parentLife({ kids: [10], seed: 'e2b-bad' });
    const [kid] = heirCandidates({ ...base, phase: 'dead' } as LifeState);
    const badWill = produce(base, (d) => {
      d.will = { year: d.currentYear, shares: [{ kind: 'person', id: kid!, percent: 60 }] };
    });
    expect(loadedLifeSchema(content).safeParse(badWill).success).toBe(false);
    const dead = die(parentLife({ kids: [10], noRelatives: true, seed: 'e2b-bad-heir' }));
    const heir = continueAsHeir(dead, heirCandidates(dead)[0]!, content);
    const noGuardian = produce(heir, (d) => {
      delete d.housing.guardianId;
      delete d.housing.foster;
      delete d.flags.in_foster_care;
    });
    expect(loadedLifeSchema(content).safeParse(noGuardian).success).toBe(false);
    const stale = produce(heir, (d) => {
      d.finances.trust = { balance: 5_000, releaseAge: 5 };
    });
    expect(loadedLifeSchema(content).safeParse(stale).success).toBe(false);
    const extra = { ...heir, lineage: { ...heir.lineage, mystery: true } };
    expect(lifeStateSchema.safeParse(extra).success).toBe(false);
  });

  it('upgrades a version 12 life: no news, no care costs, and people who get their own life from the first year', async () => {
    const base = lifeAtAge('e3-v12', 30);
    const life = produce(base, (d) => {
      d.finances.lastLedger = { year: d.currentYear - 1, gross: 40_000, retirement: 0, tax: 3_000, housing: 5_000, living: 12_000, debtPayments: 0, interest: 0, debtInterest: 0, borrowed: 0, support: 0, children: 0, care: 0, supportPaid: 0, supportReceived: 0, net: 20_000 };
    });
    const v12 = JSON.parse(JSON.stringify(life)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- stripping fields from plain JSON to build an old save
    delete v12.news;
    delete v12.finances.lastLedger.care;
    for (const p of Object.values<Record<string, unknown>>(v12.people)) delete p.life;
    const db = freshDb();
    await db.lives.put({ id: 'active', envelope: { ...makeEnvelope(v12, content.contentVersion), schemaVersion: 12 } });
    const result = await readSave(db, loadedLifeSchema(content));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const upgraded = result.envelope.data;
    expect(result.envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(upgraded.news).toEqual([]);
    expect(upgraded.finances.lastLedger!.care).toBe(0);
    expect(upgraded).toEqual({ ...life, web: emptyWeb() });
    // Nobody is given a partner, children or troubles they never had: the first year builds each life from what the save holds.
    const next = beginYear(upgraded, content);
    for (const person of Object.values(next.people)) {
      if (!person.alive || next.relationships[person.id]?.status === 'ended' || person.child) continue;
      expect(person.life, person.id).toBeDefined();
    }
  });

  it('round trips a life with people living their own lives: partners, children, troubles, care and a news log', async () => {
    let life = random('e3-round');
    for (let i = 0; i < 35 && life.phase !== 'dead'; i++) life = playYear(life, content);
    expect(life.news.length).toBeGreaterThan(0);
    expect(Object.values(life.people).some((p) => p.life?.partner || (p.life?.children.length ?? 0) > 0 || (p.life?.troubles.length ?? 0) > 0)).toBe(true);
    expect(loadedLifeSchema(content).safeParse(life).success).toBe(true);
    expect(await roundTrip(life)).toEqual(life);
  });

  it('rejects a life with a partner who is not dating, engaged or married, a severity out of range, or an unknown field in the news', () => {
    let life = random('e3-bad');
    for (let i = 0; i < 25 && life.phase !== 'dead'; i++) life = playYear(life, content);
    const id = Object.keys(life.people).find((k) => life.people[k]!.life && !life.people[k]!.child)!;
    const badPartner = produce(life, (d) => {
      d.people[id]!.life!.partner = { name: { first: 'Kit', last: 'Lee' }, genderCategory: 'woman', birthYear: 1990, canCarry: true, status: 'seeing' as never, since: 2040, statusSince: 2040 };
    });
    expect(lifeStateSchema.safeParse(badPartner).success).toBe(false);
    const badSeverity = produce(life, (d) => {
      d.people[id]!.life!.troubles = [{ kind: 'illness', refId: 'cancer', since: 2040, severity: 200, treated: false }];
    });
    expect(lifeStateSchema.safeParse(badSeverity).success).toBe(false);
    const extra = { ...life, news: [{ year: life.currentYear, lines: [{ personId: id, kind: 'hired', text: 'x', mystery: 1 }] }] };
    expect(lifeStateSchema.safeParse(extra).success).toBe(false);
  });
  it('upgrades a version 13 life: no ties and no stories, and the first year builds the family\'s web from what the save holds', async () => {
    const life = lifeAtAge('e4-v13', 30);
    const v13 = JSON.parse(JSON.stringify(life)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- stripping fields from plain JSON to build an old save
    delete v13.web;
    const db = freshDb();
    await db.lives.put({ id: 'active', envelope: { ...makeEnvelope(v13, content.contentVersion), schemaVersion: 13 } });
    const result = await readSave(db, loadedLifeSchema(content));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const upgraded = result.envelope.data;
    expect(result.envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(upgraded.web).toEqual(emptyWeb());
    expect(upgraded).toEqual({ ...life, web: emptyWeb() });
    // Nobody is given a feud, a couple or a rumor they never had: the first year ties the family from its structure.
    const next = beginYear(upgraded, content);
    expect(Object.keys(next.web.ties).length).toBeGreaterThan(0);
    for (const t of Object.values(next.web.ties)) expect(['family', 'partner', 'context']).toContain(t.origin);
    expect(Object.values(next.web.ties).some((t) => t.feud)).toBe(false);
    expect(loadedLifeSchema(content).safeParse(next).success).toBe(true);
  });

  it('round trips a life with ties, feuds and what people have heard, and rejects a tie to someone who is gone or a broken story', async () => {
    let life = random('e4-round');
    for (let i = 0; i < 35 && life.phase !== 'dead'; i++) life = playYear(life, content);
    expect(Object.keys(life.web.ties).length).toBeGreaterThan(0);
    expect(loadedLifeSchema(content).safeParse(life).success).toBe(true);
    expect(await roundTrip(life)).toEqual(life);

    const [key, tie] = Object.entries(life.web.ties)[0]!;
    const gone = produce(life, (d) => {
      d.people[tie.a]!.alive = false;
      d.people[tie.a]!.deathYear = d.currentYear;
    });
    expect(loadedLifeSchema(content).safeParse(gone).success).toBe(false);
    const badKind = produce(life, (d) => {
      d.web.ties[key]!.kind = 'lovers' as never;
    });
    expect(lifeStateSchema.safeParse(badKind).success).toBe(false);
    const extra = produce(life, (d) => {
      (d.web.ties[key] as unknown as Record<string, unknown>).mystery = 1;
    });
    expect(lifeStateSchema.safeParse(extra).success).toBe(false);
    const story = produce(life, (d) => {
      d.web.items.push({ id: 'k99', kind: 'jobLoss', subject: 'you', year: d.currentYear, truth: 'fired', holders: { [tie.a]: { version: 'no_such_version', since: d.currentYear, from: 'saw', reacted: true } } });
      d.web.nextItem = 100;
    });
    expect(lifeStateSchema.safeParse(story).success).toBe(true);
    expect(loadedLifeSchema(content).safeParse(story).success).toBe(false);
  });
});
