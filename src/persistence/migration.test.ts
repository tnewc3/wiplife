import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { cloneJson, lifeAtAge } from '../engine/testFixtures';
import { emptyMigration } from '../engine/migration/types';
import { tourSizeFor } from '../engine/fame/grind';
import { enterPath } from '../engine/fame/ladder';
import type { LifeState } from '../engine/types';
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

describe('Batch 4 saves', () => {
  /** A schema 31 save: a musician with a project lined up and its tour box ticked, without any Batch 4 field. */
  const oldSave = (seed: string, ticked: boolean) => {
    const life = produce(lifeAtAge(seed, 30), (d) => {
      enterPath(d as LifeState, 'music', 'open_mic', content);
      d.fame.paths.music!.rung = 4;
      d.fame.paths.music!.peak = 4;
      d.fame.plan = { path: 'music', kind: 'album', style: 'artistic', risk: 'safe', press: false };
    });
    const old = cloneJson(life) as unknown as Record<string, unknown> & { fame: Record<string, unknown> & { plan: Record<string, unknown>; income: Record<string, unknown>; totals: Record<string, unknown> } };
    for (const key of ['band', 'pastBands', 'offers', 'instrument', 'grind', 'played']) delete old.fame[key];
    delete old.fame.income.tour;
    for (const key of ['shows', 'practice', 'bandsFormed', 'bandsJoined', 'bandSplits', 'memberChanges', 'genreSwitches', 'offGenre']) delete old.fame.totals[key];
    old.fame.plan.tour = ticked;
    return { life, old };
  };

  it('upgrades a save: a ticked tour box becomes a tour booked for the coming year at no cost, in the life and in an heir snapshot', () => {
    const { life, old } = oldSave('b4-migrate', true);
    const saved = { ...old, inputLog: [{ year: life.currentYear, kind: 'create', payload: { heir: true, snapshot: cloneJson(old) } }] };
    const after = migrateEnvelope({ ...makeEnvelope(saved, content.contentVersion), schemaVersion: 31 }).data as LifeState;
    expect(after.fame.plan).toEqual({ path: 'music', kind: 'album', style: 'artistic', risk: 'safe', press: false });
    expect(after.fame.grind.tour).toEqual({ path: 'music', size: tourSizeFor(content.famePaths.music!, 4, content), cost: 0 });
    expect(after.fame.grind.year).toBe(life.currentYear);
    expect(after.fame.band).toBeNull();
    expect(after.fame.income.tour).toBe(0);
    expect(after.fame.totals.shows).toBe(0);
    expect(after.inputLog[0]!.payload.snapshot).toMatchObject({ fame: { band: null, grind: { tour: { path: 'music' } } } });
    expect(lifeStateSchema.safeParse(after).success).toBe(true);
  });

  it('upgrades a plan without a tour to no booking, and the result is a valid life', () => {
    const { old } = oldSave('b4-no-tour', false);
    const after = migrateEnvelope({ ...makeEnvelope(old, content.contentVersion), schemaVersion: 31 }).data as LifeState;
    expect(after.fame.grind.tour).toBeNull();
    expect('tour' in after.fame.plan!).toBe(false);
    expect(loadedLifeSchema(content).safeParse(after).success).toBe(true);
  });

  it('roundtrips a life with a band, offers, skills, a booked tour and a typed title', () => {
    const life = produce(lifeAtAge('b4-save', 28), (d) => {
      enterPath(d as LifeState, 'music', 'band', content);
      d.fame.instrument = 'guitar';
      d.fame.paths.music!.genre = 'indie';
      d.fame.paths.music!.skills = { vocals: 31.5, instrument: 12 };
      d.fame.paths.music!.rung = 3;
      d.fame.paths.music!.peak = 3;
      d.fame.grind = { year: d.currentYear, shows: 2, showPay: 120, tour: { path: 'music', size: 'regional', cost: 4000 }, practice: 3, bySkill: { vocals: 3 }, lastShow: { venue: 'club', outcome: 'good', pay: 60, fans: 40, fame: 0.5 } };
      d.fame.plan = { path: 'music', kind: 'album', style: 'commercial', risk: 'bold', press: true, genre: 'metal', title: 'Rooms I Left', tracks: ['Intro', 'Outro'] };
      d.fame.pastBands.push({ name: 'The First Try', from: d.currentYear - 4, to: d.currentYear - 2, how: 'split' });
      d.fame.best = { title: 'Glass Weather', path: 'music', kind: 'single', year: d.currentYear - 1, score: 61.5, bandName: d.fame.band!.name };
    });
    expect(life.fame.band).not.toBeNull();
    expect(loadedLifeSchema(content).parse(JSON.parse(JSON.stringify(life)))).toEqual(life);
    // A title the player could never have typed is rejected on load.
    expect(lifeStateSchema.safeParse(produce(life, (d) => void (d.fame.plan!.title = 'x'.repeat(61)))).success).toBe(false);
  });
});

describe('Batch 5 saves', () => {
  /** A schema 32 save: a school-team player without any Batch 5 field. */
  const oldSave = (seed: string, withTeam = true) => {
    const life = produce(lifeAtAge(seed, 15), (d) => {
      d.character.hidden.talent = 'athletics';
      enterPath(d as LifeState, 'basketball', 'school_tryout', content);
      // Before Batch 5 the school team in the sport was the sports career's own, and not one of your teams and clubs.
      d.teen.activities = withTeam ? [] : d.teen.activities;
    });
    const old = cloneJson(life) as unknown as Record<string, unknown> & { sports: Record<string, unknown>; teen: { activities: unknown[] } };
    for (const key of ['tryout', 'tried', 'cut', 'teamless', 'club', 'training', 'offers', 'scholarship', 'combine', 'passed', 'role', 'number', 'captain']) delete old.sports[key];
    for (const key of ['tryouts', 'tryoutsMade', 'scholarships', 'scholarshipsLost', 'trainedTeam', 'trainedGym', 'trainedCoach', 'signedAfterUndrafted']) delete (old.sports.totals as Record<string, unknown>)[key];
    old.teen.activities = [];
    return { life, old };
  };

  it('upgrades a save: new records are empty, and a school-team player keeps the career and gains the team in their teams and clubs', () => {
    const { life, old } = oldSave('b5-migrate');
    const saved = { ...old, inputLog: [{ year: life.currentYear, kind: 'create', payload: { heir: true, snapshot: cloneJson(old) } }] };
    const after = migrateEnvelope({ ...makeEnvelope(saved, content.contentVersion), schemaVersion: 32 }).data as LifeState;
    expect(after.sports.sport).toBe('basketball');
    expect(after.sports.team).toEqual(life.sports.team);
    expect(after.fame.active).toBe(true);
    expect(after.sports).toMatchObject({ tryout: null, tried: [], cut: {}, teamless: false, club: null, offers: [], scholarship: null, combine: 0, passed: 0, role: 'starter', number: null, captain: false });
    expect(after.sports.totals).toMatchObject({ tryouts: 0, scholarships: 0, trainedTeam: 0, signedAfterUndrafted: 0 });
    const act = Object.values(content.activities).find((a) => a.sport === 'basketball')!;
    expect(after.teen.activities).toEqual([{ id: act.id, since: life.currentYear, tier: 'varsity' }]);
    // An heir's replay snapshot is upgraded the same way.
    expect(after.inputLog[0]!.payload.snapshot).toMatchObject({ sports: { teamless: false, role: 'starter' }, teen: { activities: [{ id: act.id }] } });
    expect(lifeStateSchema.safeParse(after).success).toBe(true);
    expect(loadedLifeSchema(content).safeParse(migrateEnvelope({ ...makeEnvelope(old, content.contentVersion), schemaVersion: 32 }).data).success).toBe(true);
  });

  it('leaves a life with no career alone, and does not add the team twice', () => {
    const none = cloneJson(lifeAtAge('b5-none', 15)) as unknown as Record<string, unknown> & { sports: Record<string, unknown> };
    for (const key of ['tryout', 'tried', 'cut', 'teamless', 'club', 'training', 'offers', 'scholarship', 'combine', 'passed', 'role', 'number', 'captain']) delete none.sports[key];
    const after = migrateEnvelope({ ...makeEnvelope(none, content.contentVersion), schemaVersion: 32 }).data as LifeState;
    expect(after.sports.sport).toBeNull();
    expect(after.teen.activities.every((a) => content.activities[a.id]?.sport === undefined)).toBe(true);
    const { old } = oldSave('b5-twice');
    const act = Object.values(content.activities).find((a) => a.sport === 'basketball')!;
    old.teen.activities = [{ id: act.id, since: 2000, tier: 'jv' }];
    const again = migrateEnvelope({ ...makeEnvelope(old, content.contentVersion), schemaVersion: 32 }).data as LifeState;
    expect(again.teen.activities).toEqual([{ id: act.id, since: 2000, tier: 'jv' }]);
  });

  it('roundtrips a life with a tryout record, a club team, training, a scholarship and offers', () => {
    const life = produce(lifeAtAge('b5-save', 17), (d) => {
      d.character.hidden.talent = 'athletics';
      enterPath(d as LifeState, 'basketball', 'school_tryout', content);
      d.sports.tried.push({ year: d.currentYear - 1, key: 'school:varsity', name: 'Westfield Comets', landedName: 'Westfield Comets JV', level: 'school', made: false, landed: 'school:jv', rating: 31, bar: 32 });
      d.sports.cut['school:varsity'] = d.currentYear - 1;
      d.sports.club = { id: null, name: 'Chicago Rim Rockers Travel', city: d.character.cityId, level: 'youth', quality: 54, tier: 'travel' };
      d.sports.training = { year: d.currentYear, team: 3, gym: 1, coach: 0, member: true, spent: 480 };
      d.sports.offers = [{ year: d.currentYear, tier: 'state', share: 0.55 }];
      d.sports.scholarship = { tier: 'elite', share: 0.9, since: d.currentYear, warned: 1 };
      d.sports.role = 'rotation';
      d.sports.number = 23;
      d.sports.captain = true;
      d.sports.combine = 4;
    });
    expect(loadedLifeSchema(content).parse(JSON.parse(JSON.stringify(life)))).toEqual(life);
    // A jersey number nobody could wear, a share over a full ride and a missing tryout key are rejected on load.
    expect(lifeStateSchema.safeParse(produce(life, (d) => void (d.sports.number = 100))).success).toBe(false);
    expect(lifeStateSchema.safeParse(produce(life, (d) => void (d.sports.scholarship!.share = 1.2))).success).toBe(false);
    expect(lifeStateSchema.safeParse(produce(life, (d) => void (d.sports.tried[0]!.key = ''))).success).toBe(false);
  });
});

describe('Batch 6 saves', () => {
  /** A schema 33 save: a soccer pro without any Batch 6 field. */
  const oldSave = (seed: string) => {
    const club = content.famePaths.soccer!.sport!.leagues.pro.teams.find((t) => t.city === 'chicago')!;
    const life = produce(lifeAtAge(seed, 24), (d) => {
      d.character.hidden.talent = 'athletics';
      enterPath(d as LifeState, 'soccer', 'open_tryout', content);
      d.sports.pro = true;
      d.sports.team = { id: club.id, name: club.name, city: 'chicago', level: 'pro', quality: club.quality, division: 1 };
      d.sports.contract = { teamId: club.id, since: d.currentYear, until: d.currentYear + 2, salary: 600_000, kind: 'standard', option: 'none' };
      d.fame.paths.soccer!.rung = 4;
      d.fame.paths.soccer!.peak = 4;
    });
    const old = cloneJson(life) as unknown as Record<string, unknown> & { sports: Record<string, unknown> & { team: Record<string, unknown> } };
    delete old.league;
    for (const key of ['academy', 'loan', 'loanOffer', 'transfer', 'calledUp', 'academyOut', 'abroadYear', 'moved']) delete old.sports[key];
    delete old.sports.team.division;
    for (const key of ['loans', 'transfers', 'fees', 'graduates', 'abroad', 'caps', 'tournaments', 'tournamentTitles', 'goneUp', 'goneDown']) delete (old.sports.totals as Record<string, unknown>)[key];
    return { life, old };
  };

  it('upgrades a save: the game’s own teams, no academy, loan, offers or call-ups, a soccer club in the top league, and heir snapshots the same way', () => {
    const { life, old } = oldSave('b6-migrate');
    const saved = { ...old, inputLog: [{ year: life.currentYear, kind: 'create', payload: { heir: true, snapshot: cloneJson(old) } }] };
    const after = migrateEnvelope({ ...makeEnvelope(saved, content.contentVersion), schemaVersion: 33 }).data as LifeState;
    expect(after.league).toEqual({ setup: { renamed: {}, moved: {}, added: [] }, pending: null, tiers: {}, tierYear: 0 });
    expect(after.sports).toMatchObject({ academy: null, loan: null, loanOffer: null, transfer: null, calledUp: 0, academyOut: 0, abroadYear: 0, moved: null });
    expect(after.sports.totals).toMatchObject({ loans: 0, transfers: 0, fees: 0, graduates: 0, abroad: 0, caps: 0, tournaments: 0, tournamentTitles: 0, goneUp: 0, goneDown: 0 });
    expect(after.sports.team).toMatchObject({ division: 1 });
    expect(after.sports.contract).toEqual(life.sports.contract);
    expect(after.inputLog[0]!.payload.snapshot).toMatchObject({ league: { pending: null }, sports: { loan: null } });
    expect(lifeStateSchema.safeParse(after).success).toBe(true);
    expect(loadedLifeSchema(content).parse(migrateEnvelope({ ...makeEnvelope(old, content.contentVersion), schemaVersion: 33 }).data)).toEqual(life);
  });

  it('roundtrips a life with its own teams, a loan, transfer offers, a release clause and a pending change', () => {
    const life = produce(lifeAtAge('b6-save', 24), (d) => {
      d.league = {
        setup: { renamed: { chicago_lakefront_fc: { name: 'Chicago Lakeshore Rovers', nickname: 'Rovers' } }, moved: { houston_gulf_city_fc: 'nyc' }, added: [{ id: 'custom_1', sport: 'soccer', name: 'Garden City Albion', city: 'chicago', strength: 4, tier: 1 }] },
        pending: { applyYear: d.currentYear + 1, moved: {}, added: [] },
        tiers: { chicago_union_yard_sc: 2 },
        tierYear: d.currentYear - 1,
      };
      d.sports.sport = 'soccer';
      d.sports.pro = true;
      d.sports.loan = { parentId: 'chicago_lakefront_fc', hostId: 'chicago_union_yard_sc', since: d.currentYear, until: d.currentYear + 1 };
      d.sports.loanOffer = null;
      d.sports.transfer = { year: d.currentYear, offers: [{ id: `${d.currentYear}-0`, clubId: 'chicago_ashgrove_united', fee: 4_500_000, wage: 900_000, years: 3, clause: 11_000_000 }] };
      d.sports.contract = { teamId: 'chicago_lakefront_fc', since: d.currentYear, until: d.currentYear + 2, salary: 600_000, kind: 'standard', option: 'none', release: 9_000_000 };
      d.sports.moved = { year: d.currentYear - 1, dir: 'up' };
      d.sports.calledUp = d.currentYear;
      d.sports.team = { id: 'chicago_union_yard_sc', name: 'Chicago Union Yard SC', city: 'chicago', level: 'pro', quality: 45, division: 2, place: 'Boston', away: 'city', country: 'es' };
    });
    expect(loadedLifeSchema(content).parse(JSON.parse(JSON.stringify(life)))).toEqual(life);
    // A division nobody plays in, a city with no id and a made-up team with no name are rejected on load.
    expect(lifeStateSchema.safeParse(produce(life, (d) => void ((d.league.tiers as Record<string, number>)['x'] = 3))).success).toBe(false);
    expect(lifeStateSchema.safeParse(produce(life, (d) => void (d.league.setup.moved['x'] = ''))).success).toBe(false);
    expect(lifeStateSchema.safeParse(produce(life, (d) => void (d.league.setup.added[0]!.name = ''))).success).toBe(false);
    expect(lifeStateSchema.safeParse(produce(life, (d) => void (d.sports.transfer!.offers[0]!.years = 0))).success).toBe(false);
  });

  it('roundtrips a child in an academy abroad, and refuses one who is also a pro', () => {
    const kid = produce(lifeAtAge('b6-kid', 13), (d) => {
      d.character.cityId = 'london';
      d.character.birthCityId = 'london';
      d.character.citizenships = ['uk'];
      d.housing.cityId = 'london';
      for (const p of Object.values(d.people)) {
        p.cityId = 'london';
        p.citizenships = ['uk'];
      }
      d.character.hidden.talent = 'athletics';
      enterPath(d as LifeState, 'soccer', 'youth_league', content);
      const club = content.famePaths.soccer!.sport!.leagues.pro.teams.find((t) => t.country === 'es')!;
      d.sports.academy = { clubId: club.id, since: d.currentYear, abroad: true };
      d.sports.team = { id: null, name: `${club.name} Academy`, city: 'london', level: 'youth', quality: 52, tier: 'academy', place: club.cityName!, away: 'country', country: 'es' };
    });
    expect(loadedLifeSchema(content).parse(JSON.parse(JSON.stringify(kid)))).toEqual(kid);
    expect(loadedLifeSchema(content).safeParse(produce(kid, (d) => void (d.sports.academy!.clubId = 'nobody_fc'))).success).toBe(false);
  });
});
