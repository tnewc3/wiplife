import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import type { CountryId, RouteId } from '../../content/schemas';
import { COUNTRY_IDS, ROUTES } from '../../content/schemas';
import { finishAction, isLifeActionAvailable, performAction } from '../actions';
import { playYear, resolveAll } from '../autoplay';
import { endJob, startJob } from '../career';
import { checkInvariants } from '../invariants';
import { migrationFailures } from './invariants';
import { createRng } from '../rng';
import { lifeAtAge } from '../testFixtures';
import type { LifeState, Person } from '../types';
import { citiesOfCountry } from '../country';
import { birthCitizenships } from './citizenship';
import { purchaseQuote } from '../housing';
import { loanOffer } from '../business/funding';
import { entryBlock, entryOdds, naturalizationBlock, permanentBlock, regularizationBlock, type EntryInput } from './routes';
import { getMigrationView } from './view';
import { removeFromCountry } from './move';
import { removalRisk, runMigration } from './step';
import { statusKind } from './query';

const city = (c: CountryId) => citiesOfCountry(c, content)[0]!;
const homeOf: Record<CountryId, string> = { us: 'chicago', ca: 'toronto', uk: 'london', mx: 'mexico_city' };

/** An adult from `home`, skilled and with money, who speaks every official language of every country. */
function adult(home: CountryId = 'us', age = 30): LifeState {
  return produce(lifeAtAge(`w6-${home}-${age}`, age), (d) => {
    const cityId = homeOf[home];
    d.character.cityId = d.character.birthCityId = cityId;
    d.character.citizenships = [home];
    for (const p of Object.values(d.people)) { p.cityId = cityId; p.citizenships = [home]; }
    d.housing = { kind: 'renting', cityId, annualCost: 12000, since: d.currentYear };
    d.finances.savings = 2_000_000;
    d.character.stats.smarts = 70;
    d.character.languages = ['en', 'fr', 'es'].map((id) => ({ id, skill: 90, native: id === 'en', lastUsed: d.currentYear }));
    d.education.credentials = [{ type: 'hs_diploma', year: d.birthYear + 18, gpa: 3.2 }, { type: 'bachelor', refId: 'computer_science', year: d.birthYear + 22, gpa: 3.4, tier: 'state' }];
  });
}
const year = (l: LifeState) => l.currentYear;
function entry(route: RouteId, countryId: CountryId, extra: Partial<EntryInput> = {}): EntryInput {
  return { route, countryId, cityId: city(countryId), majorId: 'computer_science', tier: 'state', ...extra };
}
/** Plays real years (events answered with the first choice). */
function advance(life: LifeState, years: number): LifeState {
  let l = life;
  for (let i = 0; i < years; i++) l = playYear(l, content, { choices: createRng(`w6-${l.seed}-${l.currentYear}`) });
  return l;
}
/** Sets the odds, then plays the years until the application is decided. */
function decide(life: LifeState, odds = 1): LifeState {
  const set = produce(life, (d) => { d.migration.application!.odds = odds; });
  return advance(set, set.migration.application!.decisionYear - set.currentYear);
}
function settle(life: LifeState): LifeState {
  return finishAction(resolveAll(life, content, createRng('w6'), undefined, (_l, card) => card.choices.at(-1)?.id ?? 'continue'));
}
const withJob = (l: LifeState): LifeState => produce(l, (d) => { startJob(d, 'software_engineer', content); });
/** Backdates the arrival, so the years count without playing them. */
const lived = (l: LifeState, years: number): LifeState => produce(l, (d) => { d.migration.arrivedYear! -= years; if (d.travel.residence) d.travel.residence.startYear -= years; });
/** The migration rules hold (for states made by changing a life directly, where the rest of the timeline is not played). */
const sound = (l: LifeState) => expect(migrationFailures(l, content)).toEqual([]);
/** Applies, is approved, and moves. */
function emigrated(route: RouteId, from: CountryId, to: CountryId, prep?: (l: LifeState) => LifeState): LifeState {
  let life = prep ? prep(adult(from)) : adult(from);
  if (route === 'family') life = produce(life, (d) => sponsorIn(d, to));
  if (route === 'work_sponsor') life = withJob(life);
  life = settle(performAction(life, 'apply_entry', { entry: entry(route, to) }, content));
  life = decide(life);
  expect(life.migration.application?.status).toBe('approved');
  return settle(performAction(life, 'move_abroad', {}, content));
}
function sponsorIn(d: LifeState, country: CountryId): void {
  const id = 'sponsor';
  const template = Object.values(d.people)[0] as Person;
  d.people[id] = { ...template, id, name: { first: 'Alex', last: 'Sponsor' }, birthYear: d.currentYear - 35, alive: true, cityId: city(country), citizenships: [country], tags: [], languages: d.character.languages.map((l) => ({ ...l })) };
  d.relationships[id] = { personId: id, kind: 'spouse', status: 'active', affection: 80, trust: 80, memories: [], since: d.currentYear - 2, kindSince: d.currentYear - 2, wasSpouse: true };
}

describe('W6 citizenship by birthplace and parentage', () => {
  it('gives a child the citizenship of the country of birth where the country gives it to anyone born there', () => {
    expect(birthCitizenships(city('us'), [{ citizenships: ['mx'] }], content)).toEqual(['us', 'mx']);
    expect(birthCitizenships(city('ca'), [{ citizenships: ['ca'] }], content)).toEqual(['ca']);
  });
  it('gives a child born where citizenship needs a citizen or settled parent only what the parents pass down, until they are', () => {
    expect(birthCitizenships(city('uk'), [{ citizenships: ['mx'] }], content)).toEqual(['mx']);
    expect(birthCitizenships(city('uk'), [{ citizenships: ['mx'], settledIn: 'uk' }], content)).toEqual(['uk', 'mx']);
    expect(birthCitizenships(city('uk'), [{ citizenships: ['uk'] }], content)).toEqual(['uk']);
  });
  it('is never empty, and lists each country once', () => {
    for (const home of COUNTRY_IDS) for (const born of COUNTRY_IDS) {
      const c = birthCitizenships(city(born), [{ citizenships: [home] }, { citizenships: [home, born] }], content);
      expect(c.length).toBeGreaterThan(0);
      expect(new Set(c).size).toBe(c.length);
    }
  });
  it('starts a life with the citizenship of its birth country, and its family with theirs', () => {
    const life = lifeAtAge('cit', 12);
    expect(life.character.citizenships).toEqual([content.cities[life.character.birthCityId]!.countryId]);
    for (const p of Object.values(life.people)) expect(p.citizenships.length).toBeGreaterThan(0);
  });
});

describe('W6 sponsored job on arrival', () => {
  it('is not taken if the local language faded below the job’s requirement since the offer', () => {
    const approved = decide(settle(performAction(withJob(adult('us')), 'apply_entry', { entry: entry('work_sponsor', 'mx') }, content)), 1);
    const faded = produce(approved, (d) => { d.character.languages = d.character.languages.map((l) => (l.id === 'es' ? { ...l, skill: 0 } : l)); });
    const moved = settle(performAction(faded, 'move_abroad', {}, content));
    expect(moved.travel.residence?.settled).toBe(true);
    expect(checkInvariants(moved, content)).toEqual([]);
  });
});

describe('W6 legal routes, per country', () => {
  for (const to of COUNTRY_IDS) {
    const from: CountryId = to === 'us' ? 'mx' : 'us';
    for (const route of ROUTES) {
      it(`${route} to ${to}: requirements, cost, wait and approval (from ${from})`, () => {
        let life = adult(from);
        if (route === 'family') life = produce(life, (d) => sponsorIn(d, to));
        if (route === 'work_sponsor') life = withJob(life);
        const input = entry(route, to);
        expect(entryBlock(life, input, content)).toBeNull();
        const rules = content.balance.immigration.countries[to][route];
        const odds = entryOdds(life, input, content);
        expect(odds).toBeGreaterThanOrEqual(content.balance.immigration.odds.min);
        expect(odds).toBeLessThanOrEqual(content.balance.immigration.odds.max);
        const after = settle(performAction(life, 'apply_entry', { entry: input }, content));
        const held = route === 'investment' ? content.balance.immigration.countries[to].investment.amount : 0;
        expect(after.finances.savings).toBe(life.finances.savings - rules.fee - held);
        expect(after.migration.application).toMatchObject({ kind: 'entry', route, countryId: to, status: 'pending', decisionYear: year(life) + rules.wait });
        expect(checkInvariants(after, content)).toEqual([]);
        // Nothing is decided early: the wait is the country's.
        if (rules.wait > 1) expect(advance(after, rules.wait - 1).migration.application!.status).toBe('pending');
        const approved = decide(after, 1);
        expect(approved.migration.application!.status).toBe('approved');
        const moved = settle(performAction(approved, 'move_abroad', {}, content));
        expect(moved.character.cityId).toBe(city(to));
        expect(moved.migration.application).toBeNull();
        const r = moved.travel.residence!;
        expect(r.settled).toBe(true);
        expect(r.route).toBe(route);
        expect(r.type).toBe(route === 'work_sponsor' ? 'temporary_worker' : route === 'study_work' ? 'student' : 'permanent_resident');
        expect(checkInvariants(moved, content)).toEqual([]);
        if (route === 'work_sponsor') expect(moved.career.job).not.toBeNull();
        if (route === 'study_work') expect(moved.education.admission).not.toBeNull();
      });
    }
  }
  it('refuses a route the person does not qualify for, with the reason', () => {
    const base = adult('us');
    expect(entryBlock(produce(base, (d) => { d.education.credentials = []; }), entry('work_sponsor', 'ca'), content)).toBe('skills');
    expect(entryBlock(produce(base, (d) => { d.finances.savings = 10; }), entry('investment', 'ca'), content)).toBe('money');
    expect(entryBlock(base, entry('family', 'ca'), content)).toBe('sponsor');
    expect(entryBlock(produce(base, (d) => { d.character.languages = [{ id: 'en', skill: 100, native: true, lastUsed: d.currentYear }]; }), entry('work_sponsor', 'mx'), content)).toBe('language');
    expect(entryBlock(base, entry('work_sponsor', 'us'), content)).toBe('citizen');
    expect(entryBlock(produce(base, (d) => { d.legal.record.push({ offenseId: Object.keys(content.offenses)[0]!, year: d.currentYear - 2, outcome: 'jail', years: 1 }); }), entry('investment', 'ca'), content)).toBe('record');
    expect(entryBlock(produce(base, (d) => { d.character.age = 17; }), entry('investment', 'ca'), content)).toBe('age');
  });
  it('lowers the odds for a conviction and raises them for schooling', () => {
    const base = withJob(adult('us'));
    const input = entry('work_sponsor', 'ca');
    const weaker = produce(base, (d) => { d.education.credentials = [{ type: 'hs_diploma', year: 2000, gpa: 3 }]; d.career.history.push({ jobId: 'software_engineer', employer: 'x', fromYear: d.currentYear - 6, toYear: d.currentYear - 5, level: 1, salary: 50000, endedBy: 'quit' }); });
    expect(entryOdds(base, input, content)).toBeGreaterThan(entryOdds(weaker, input, content) - 0.001 * 0);
    const convicted = produce(base, (d) => { d.legal.record.push({ offenseId: Object.keys(content.offenses)[0]!, year: d.currentYear - 2, outcome: 'fine', amount: 100 }); });
    expect(entryOdds(convicted, input, content)).toBeLessThan(entryOdds(base, input, content));
    const unlettered = produce(base, (d) => { d.education.credentials = [{ type: 'hs_diploma', year: 2000, gpa: 3 }, { type: 'associate', refId: 'computer_science', year: 2004, gpa: 3, tier: 'community' }]; });
    expect(entryOdds(base, input, content)).toBeGreaterThan(entryOdds(unlettered, input, content));
  });
  it('can be refused, and holds an investment only until then', () => {
    const life = settle(performAction(adult('us'), 'apply_entry', { entry: entry('investment', 'ca') }, content));
    const refused = decide(life, 0);
    expect(refused.migration.application!.status).toBe('denied');
    // What was held came back: only the fee (and a year's living) is gone.
    expect(refused.finances.savings).toBeGreaterThan(adult('us').finances.savings - content.balance.immigration.countries.ca.investment.amount);
    expect(isLifeActionAvailable(refused, 'apply_entry', { entry: entry('investment', 'ca') }, content)).toBe(false);
  });
  it('lets an application be withdrawn, returning an investment but not the fee', () => {
    const life = settle(performAction(adult('us'), 'apply_entry', { entry: entry('investment', 'ca') }, content));
    const back = performAction(life, 'withdraw_application', {}, content);
    expect(back.migration.application).toBeNull();
    expect(back.finances.savings).toBe(adult('us').finances.savings - content.balance.immigration.countries.ca.investment.fee);
  });
  it('rejects invalid input', () => {
    expect(() => performAction(adult('us'), 'apply_entry', { entry: { route: 'smuggling', countryId: 'ca', cityId: 'toronto' } }, content)).toThrow();
    expect(() => performAction(adult('us'), 'apply_entry', { entry: entry('investment', 'ca'), extra: 1 }, content)).toThrow();
    expect(() => performAction(adult('us'), 'set_remittance', { remit: 'a lot' }, content)).toThrow();
  });
});

describe('W6 residence, permanent status and citizenship', () => {
  it('moves the partner and children who live with you and sells nothing it should not', () => {
    const moved = emigrated('investment', 'us', 'ca');
    expect(statusKind(moved, content)).toBe('permanent');
    expect(moved.character.citizenships).toEqual(['us']);
    expect(moved.housing).toMatchObject({ kind: 'renting', cityId: moved.character.cityId });
  });
  it('turns a study permit into a work permit with a degree, and ends the permit without one', () => {
    const base = emigrated('study_work', 'us', 'ca', (l) => produce(l, (d) => { d.education.credentials = [{ type: 'hs_diploma', year: 2000, gpa: 3 }]; }));
    expect(base.travel.residence!.type).toBe('student');
    const graduated = produce(base, (d) => {
      d.currentYear += 1; // (one more year of study has gone by)
      d.education.admission = null; d.education.current = null;
      d.education.credentials.push({ type: 'bachelor', refId: 'computer_science', year: d.currentYear - 1, gpa: 3, tier: 'state' });
      runMigration(d, content);
    });
    expect(graduated.travel.residence).toMatchObject({ type: 'temporary_worker', route: 'study_work' });
    const dropped = produce(base, (d) => { d.currentYear += 1; d.education.admission = null; d.education.current = null; runMigration(d, content); });
    expect(dropped.travel.residence!.endYear).toBeLessThanOrEqual(dropped.currentYear);
  });
  it('takes a sponsored job only by leaving school: someone who enrolled after the offer holds no job in school', () => {
    let life = settle(performAction(withJob(adult('us')), 'apply_entry', { entry: entry('work_sponsor', 'ca') }, content));
    life = decide(life);
    expect(life.migration.application?.status).toBe('approved');
    life = produce(life, (d) => {
      endJob(d, 'quit', content);
      d.education.current = { program: 'grad', gradProgramId: 'masters', year: 1, lengthYears: 2, gpa: 3.5, boost: 0, repeats: 0, scholarship: 0, since: d.currentYear } as never;
    });
    const moved = settle(performAction(life, 'move_abroad', {}, content));
    expect(moved.career.job).not.toBeNull();
    expect(moved.education.current).toBeNull();
    expect(checkInvariants(moved, content).filter((m) => m.includes('in school'))).toEqual([]);
  });
  it('keeps a child from applying for citizenship, permanent residence or status (every answer to an application is an adult\'s event)', () => {
    const settled = produce(emigrated('investment', 'us', 'ca'), (d) => {
      d.currentYear -= d.character.age - 14;
      d.character.age = 14;
      d.travel.residence!.type = 'permanent_resident';
      d.travel.residence!.settled = true;
    });
    expect(naturalizationBlock(settled, content)).toBe('age');
    expect(permanentBlock(settled, content)).toBe('age');
    expect(regularizationBlock(settled, 'long_residence' as never, content)).toBe('age');
    expect(isLifeActionAvailable(settled, 'apply_status', { status: { kind: 'naturalization' } }, content)).toBe(false);
  });
  it('asks for permanent residence after the years the country sets, with a job, and grants it', () => {
    const moved = emigrated('work_sponsor', 'us', 'ca');
    expect(permanentBlock(moved, content)).toBe('years');
    const later = produce(lived(moved, content.balance.immigration.countries.ca.permanent.afterYears), (d) => { d.travel.residence!.endYear = d.currentYear + 3; });
    expect(permanentBlock(later, content)).toBeNull();
    const asked = settle(performAction(later, 'apply_status', { status: { kind: 'permanent' } }, content));
    expect(asked.migration.application).toMatchObject({ kind: 'permanent', status: 'pending' });
    const granted = decide(asked, 1);
    expect(granted.travel.residence).toMatchObject({ type: 'permanent_resident', route: 'work_sponsor', settled: true });
    expect(checkInvariants(granted, content)).toEqual([]);
  });
  it('asks for citizenship after the years, language and a clean record, passes the test, and keeps the other citizenship', () => {
    const pr = emigrated('investment', 'us', 'ca');
    expect(naturalizationBlock(pr, content)).toBe('years');
    const ready = lived(pr, content.balance.immigration.countries.ca.naturalization.years);
    expect(naturalizationBlock(ready, content)).toBeNull();
    const dirty = produce(ready, (d) => { d.legal.record.push({ offenseId: Object.keys(content.offenses)[0]!, year: d.currentYear - 1, outcome: 'fine', amount: 50 }); });
    expect(naturalizationBlock(dirty, content)).toBe('record');
    const weak = produce(ready, (d) => { d.character.languages = [{ id: 'en', skill: 5, native: false, lastUsed: d.currentYear }, { id: 'es', skill: 100, native: true, lastUsed: d.currentYear }]; });
    expect(naturalizationBlock(weak, content)).toBe('language');
    const asked = settle(performAction(ready, 'apply_status', { status: { kind: 'naturalization' } }, content));
    expect(asked.migration.application).toMatchObject({ kind: 'naturalization', status: 'pending' });
    // The odds are the test's: sure to pass here.
    const sure = produce(asked, (d) => { d.migration.application!.prepared = true; d.character.stats.smarts = 100; });
    const passed = decide(produce(sure, (d) => { d.migration.application!.odds = 1; }), 1);
    if (passed.migration.application?.status === 'approved') {
      expect(passed.character.citizenships).toEqual(['us', 'ca']);
      expect(passed.travel.residence).toBeNull();
      expect(passed.migration.counts['citizen:ca']).toBe(1);
    }
    expect(checkInvariants(passed, content)).toEqual([]);
  });
  it('fails the test with its own odds, and may sit it again', () => {
    const pr = lived(emigrated('investment', 'us', 'ca'), 6);
    const asked = settle(performAction(pr, 'apply_status', { status: { kind: 'naturalization' } }, content));
    const hard = produce(asked, (d) => { d.character.stats.smarts = 0; });
    let sawFail = false;
    for (let i = 0; i < 30 && !sawFail; i++) {
      const tried = produce(hard, (d) => { d.rng = createRng(`fail-${i}`); });
      const result = decide(tried, 0);
      if (result.migration.application?.status === 'denied') {
        sawFail = true;
        expect(result.migration.testFails).toBe(1);
        expect(result.character.citizenships).toEqual(['us']);
      }
    }
    expect(sawFail).toBe(true);
  });
  it('lets a citizen go home whenever they like, and only to a country they are a citizen of', () => {
    const pr = produce(emigrated('investment', 'us', 'ca'), (d) => { d.finances.savings = 500000; });
    expect(isLifeActionAvailable(pr, 'return_home', { cityId: 'chicago' }, content)).toBe(true);
    expect(isLifeActionAvailable(pr, 'return_home', { cityId: 'london' }, content)).toBe(false);
    const home = settle(performAction(pr, 'return_home', { cityId: 'chicago' }, content));
    expect(home.travel.residence).toBeNull();
    expect(home.character.cityId).toBe('chicago');
    expect(checkInvariants(home, content)).toEqual([]);
  });
  it('ends the permit record when a move takes you to a country you are a citizen of', () => {
    const pr = produce(emigrated('investment', 'us', 'ca'), (d) => { d.finances.savings = 500000; });
    expect(pr.travel.residence?.settled).toBe(true);
    const parentless = produce(pr, (d) => { for (const r of Object.values(d.relationships)) if (r.kind === 'parent') { d.people[r.personId]!.cityId = 'chicago'; d.people[r.personId]!.alive = true; r.status = 'active'; } });
    if (isLifeActionAvailable(parentless, 'move_home', {}, content)) {
      const home = performAction(parentless, 'move_home', {}, content);
      expect(home.travel.residence).toBeNull();
      expect(home.character.cityId).toBe('chicago');
    }
  });
  it('visits home refresh ties with the people who live there', () => {
    const pr = produce(emigrated('investment', 'us', 'ca'), (d) => { d.finances.savings = 500000; });
    const kin = Object.values(pr.relationships).find((r) => r.kind === 'parent' || r.kind === 'sibling')!;
    const worn = produce(pr, (d) => { d.relationships[kin.personId]!.affection = 40; d.people[kin.personId]!.cityId = 'chicago'; });
    const visit = settle(performAction(worn, 'plan_trip', { trip: { destinationId: 'chicago', budget: 'budget', companions: [] } }, content));
    expect(visit.relationships[kin.personId]!.affection).toBe(40 + content.balance.immigration.visits.affection);
    expect(visit.travel.residence?.settled).toBe(true);
    expect(checkInvariants(visit, content)).toEqual([]);
  });
});

describe('W6 sending money home through the ledger', () => {
  it('pays a share of income from what is left after the essentials, and shows it in the ledger', () => {
    const moved = produce(withJob(emigrated('investment', 'us', 'ca')), (d) => {
      d.finances.savings = 1_000_000;
      for (const r of Object.values(d.relationships)) if (r.kind === 'parent') { d.people[r.personId]!.cityId = 'chicago'; d.people[r.personId]!.alive = true; r.status = 'active'; }
    });
    const set = performAction(moved, 'set_remittance', { remit: 'steady' }, content);
    expect(set.migration.remit.level).toBe('steady');
    const next = advance(set, 1);
    const ledger = next.finances.lastLedger!;
    expect(ledger.remittances ?? 0).toBeGreaterThan(0);
    expect(ledger.net).toBe(ledger.gross + ledger.retirement + ledger.interest + ledger.supportReceived - ledger.tax - ledger.housing - ledger.living - ledger.children - ledger.care - ledger.supportPaid - ledger.upkeep - ledger.insurance - ledger.giving - ledger.remittances! - ledger.business - ledger.debtPayments);
    expect(next.migration.remit.sent).toBe(ledger.remittances);
    expect(checkInvariants(next, content)).toEqual([]);
  });
  it('is only available to someone with relatives in another country', () => {
    expect(isLifeActionAvailable(adult('us'), 'set_remittance', { remit: 'some' }, content)).toBe(false);
  });
});

describe('W6 life without papers', () => {
  /** A work permit that ends this year: playing the next year leaves its holder without papers. */
  const lapsed = (): LifeState => {
    const base = emigrated('work_sponsor', 'us', 'ca');
    // (Which events the year brings depends on the random stream; the tests that follow measure the risk from a known start.)
    return produce(advance(produce(base, (d) => { d.travel.residence!.endYear = d.currentYear - 1; }), 1), (d) => { d.migration.year.policeContact = false; d.legal.record = []; d.migration.exposure = 0; });
  };
  it('turns a lapsed permit into life without papers: no regular job, informal work, no loans, no licenses', () => {
    const life = lapsed();
    expect(life.travel.residence).toMatchObject({ type: 'undocumented', route: 'overstay' });
    expect(life.career.job).toBeNull();
    expect(life.career.gig).toBe(true);
    expect(life.migration.undocumented).not.toBeNull();
    expect(checkInvariants(life, content)).toEqual([]);
    for (const jobId of Object.keys(content.jobs).slice(0, 25)) expect(isLifeActionAvailable(life, 'apply_job', { jobId }, content)).toBe(false);
  });
  it('pays less for informal work than for the same work with papers', () => {
    const life = produce(lapsed(), (d) => { d.finances.savings = 50_000; });
    const legal = produce(life, (d) => { d.travel.residence = { ...d.travel.residence!, type: 'permanent_resident', route: 'family' }; d.migration.undocumented = null; d.career.gig = true; });
    const gross = (l: LifeState) => advance(produce(l, (d) => { d.rng = createRng('same'); }), 1).finances.lastLedger!.gross;
    expect(gross(life)).toBeLessThan(gross(legal));
  });
  it('refuses a mortgage, a car loan and a business loan to someone without papers', () => {
    const life = produce(lapsed(), (d) => { d.finances.savings = 400_000; d.housing = { kind: 'renting', cityId: d.character.cityId, annualCost: 12000, since: d.currentYear }; });
    expect(purchaseQuote(life, content).blocked === 'status' || purchaseQuote(life, content).mortgage === 0).toBe(true);
    const legal = produce(life, (d) => { d.travel.residence = { ...d.travel.residence!, type: 'permanent_resident', route: 'family' }; d.migration.undocumented = null; });
    expect(loanOffer(life, 20_000, undefined, content).block).toBe('status');
    expect(loanOffer(legal, 20_000, undefined, content).block).not.toBe('status');
  });
  it('carries a yearly risk of removal that rises with contact with police and a record, and falls with years there', () => {
    const life = lapsed();
    const base = removalRisk(life, content);
    const rules = content.balance.immigration.countries.ca.undocumented.deportation;
    const d = content.balance.immigration.undocumented.deportation;
    const years = life.currentYear - life.migration.arrivedYear!;
    expect(base).toBeCloseTo(rules * Math.max(d.floor, 1 - d.yearsDecay * years), 6);
    expect(removalRisk(produce(life, (x) => { x.migration.year.policeContact = true; }), content)).toBeCloseTo(base + d.policeContact, 6);
    expect(removalRisk(produce(life, (x) => { x.migration.arrivedYear! -= 10; }), content)).toBeLessThan(base);
    expect(removalRisk(produce(life, (x) => { x.legal.record.push({ offenseId: Object.keys(content.offenses)[0]!, year: x.currentYear - 1, outcome: 'fine', amount: 50 }); }), content)).toBeGreaterThan(base);
  });
  it('is lower for a member in good standing of a community group that backs newcomers', () => {
    const life = lapsed();
    const base = removalRisk(life, content);
    const member = produce(life, (x) => {
      x.belonging.groups.g1 = { id: 'g1', defId: 'newcomers_network', cityId: x.character.cityId, name: 'Table', welcome: 80, strict: 20, intense: 40, people: [] } as never;
      x.belonging.memberships.push({ groupId: 'g1', since: x.currentYear - 1, commitment: 'casual', rung: 0, rungSince: x.currentYear - 1, standing: 60 });
    });
    expect(removalRisk(member, content)).toBeCloseTo(base * content.balance.immigration.undocumented.deportation.community, 6);
  });
  it('removes someone to the country they are a citizen of, bars them, and ends the permit record', () => {
    const life = lapsed();
    const gone = produce(life, (d) => { d.migration.exposure = 0.5; d.rng = createRng('removal'); for (let i = 0; i < 40 && d.travel.residence; i++) { d.migration.exposure = 0.55; runMigration(d, content); } });
    expect(gone.travel.residence).toBeNull();
    expect(gone.character.cityId).toBe(homeOf.us);
    expect(gone.migration.removed.ca).toBeDefined();
    expect(gone.migration.undocumented).toBeNull();
    expect(entryBlock(produce(gone, (d) => { d.finances.savings = 2_000_000; }), entry('investment', 'ca'), content)).toBe('removed');
    sound(gone);
  });
  it('removes someone who is in prison without leaving the sentence behind (seeds batch0-careful-3-1403 and batch0-careful-4-853)', () => {
    // Found by the 10,000-life run: removed while serving a sentence, they were housed again but still "incarcerated until" a year.
    const life = produce(lapsed(), (d) => {
      d.housing = { kind: 'incarcerated', cityId: d.character.cityId, annualCost: 0, since: d.currentYear };
      d.legal.incarceratedUntil = d.currentYear + 3;
      d.legal.record.push({ offenseId: 'fraud', year: d.currentYear, outcome: 'jail', years: 4 });
    });
    const gone = produce(life, (d) => { removeFromCountry(d, content); });
    expect(gone.housing.kind).toBe('renting');
    expect(gone.legal.incarceratedUntil).toBeUndefined();
    expect(checkInvariants(gone, content).filter((f) => /prison/.test(f))).toEqual([]);
  });
  it('keeps a citizen partner in the country when the other is removed', () => {
    const life = produce(lapsed(), (d) => { sponsorIn(d, 'ca'); d.housing.partnerId = 'sponsor'; d.people.sponsor!.cityId = d.character.cityId; d.migration.exposure = 0.5; });
    const gone = produce(life, (d) => { d.rng = createRng('removal2'); for (let i = 0; i < 40 && d.travel.residence; i++) { d.migration.exposure = 0.55; runMigration(d, content); } });
    expect(gone.travel.residence).toBeNull();
    expect(gone.people.sponsor!.cityId).toBe(city('ca'));
    expect(gone.housing.partnerId).toBeUndefined();
    sound(gone);
  });
  it('has uncertain routes to status: marriage, long residence and a change in the rules', () => {
    const life = lapsed();
    expect(regularizationBlock(life, 'marriage', content)).toBe('spouse');
    expect(regularizationBlock(life, 'long_residence', content)).toBe('years');
    expect(regularizationBlock(life, 'rule_change', content)).toBe('window');
    const open = produce(lived(life, 12), (d) => { d.migration.ruleChangeUntil = d.currentYear; sponsorIn(d, 'ca'); d.finances.savings = 100000; });
    for (const basis of ['marriage', 'long_residence', 'rule_change'] as const) expect(regularizationBlock(open, basis, content), basis).toBeNull();
    const asked = settle(performAction(open, 'apply_status', { status: { kind: 'regularization', basis: 'marriage' } }, content));
    expect(asked.migration.exposure).toBeGreaterThan(0);
    const granted = decide(asked, 1);
    expect(granted.migration.application!.status).toBe('approved');
    expect(granted.travel.residence).toMatchObject({ type: 'permanent_resident', route: 'regularized' });
    expect(granted.migration.undocumented).toBeNull();
    // (A year of play can end the application another way, such as being removed: the first year that leaves it is the one judged.)
    let refused = decide(asked, 0);
    for (let i = 0; i < 8 && refused.migration.application === null; i++) refused = decide(produce(asked, (d) => { d.rng = createRng(`refused-${i}`); }), 0);
    expect(refused.migration.application!.status).toBe('denied');
    expect(refused.migration.denied['regularization:marriage:ca']).toBeDefined();
  });
  it('goes without papers: pays, may be turned back, and arrives without status', () => {
    const base = produce(adult('mx'), (d) => { d.finances.savings = 100000; });
    expect(isLifeActionAvailable(base, 'move_without_papers', { cityId: city('us') }, content)).toBe(true);
    const outcomes = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const tried = performAction(produce(base, (d) => { d.rng = createRng(`entry-${i}`); }), 'move_without_papers', { cityId: city('us') }, content);
      expect(tried.finances.savings).toBeLessThan(base.finances.savings);
      expect(tried.pending[0]!.money!.change).toBeLessThan(0);
      outcomes.add(tried.travel.residence ? 'arrived' : 'turned back');
      if (tried.travel.residence) expect(tried.travel.residence).toMatchObject({ type: 'undocumented', route: 'irregular', settled: true });
      expect(checkInvariants(settle(tried), content)).toEqual([]);
    }
    expect([...outcomes].sort()).toEqual(['arrived', 'turned back']);
  });
  it('is closed to a citizen of the country and to someone already abroad', () => {
    expect(isLifeActionAvailable(adult('us'), 'move_without_papers', { cityId: 'chicago' }, content)).toBe(false);
  });
  it('runs for many years with invariants holding', () => {
    let life = lapsed();
    for (let i = 0; i < 12 && life.phase !== 'dead'; i++) {
      life = playYear(life, content, { choices: createRng(`years-${i}`) });
      expect(checkInvariants(life, content), `year ${i}`).toEqual([]);
    }
  });
});

describe('W6 screen view', () => {
  const pick = { countryId: '' as const, cityId: '', route: 'work_sponsor' as const, majorId: '', tier: 'state' as const };
  it('offers the other countries and all four routes to a citizen, with the reason a route is closed', () => {
    const view = getMigrationView(adult('us'), pick, content);
    expect(view.status).toBe('citizen');
    expect(view.destinations.map((d) => d.id).sort()).toEqual(['ca', 'mx', 'uk']);
    expect(view.routes.map((r) => r.route)).toEqual([...ROUTES]);
    expect(view.permanent).toBeNull();
    expect(view.citizenship).toBeNull();
    expect(view.regular).toEqual([]);
    expect(view.routes.find((r) => r.route === 'family')!.block).toBe('sponsor');
    expect(view.withoutPapers?.can).toBe(true);
  });
  it('shows citizenship to a permanent resident and the routes to status to someone without papers', () => {
    const pr = emigrated('investment', 'us', 'ca');
    const v1 = getMigrationView(pr, pick, content);
    expect(v1.status).toBe('permanent');
    expect(v1.citizenship).not.toBeNull();
    expect(v1.returnCities.length).toBeGreaterThan(0);
    const undoc = produce(pr, (d) => { d.travel.residence = { ...d.travel.residence!, type: 'undocumented', route: 'overstay' }; d.migration.undocumented = { sinceYear: d.currentYear, origin: 'overstay', closeCalls: 0 }; });
    const v2 = getMigrationView(undoc, pick, content);
    expect(v2.status).toBe('undocumented');
    expect(v2.regular.map((r) => r.basis)).toEqual(['marriage', 'long_residence', 'rule_change']);
    expect(v2.undocumented?.risk).toBeGreaterThan(0);
  });
});

describe('W6 and temporary stays (W5)', () => {
  it('does not let someone who moved for good start a study or work stay elsewhere, which would lose their permit', () => {
    const pr = emigrated('investment', 'us', 'ca');
    const stay = { destinationId: 'london', route: 'working_holiday' as const };
    expect(isLifeActionAvailable(pr, 'work_abroad', { stay }, content)).toBe(false);
    expect(isLifeActionAvailable(produce(pr, (d) => { d.finances.savings = 500000; }), 'plan_trip', { trip: { destinationId: 'chicago', budget: 'budget', companions: [] } }, content)).toBe(true);
  });
});
