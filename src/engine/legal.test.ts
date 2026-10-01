/**
 * The law (Stage 9): sentencing, fines through the debt system, probation,
 * the record's effect on jobs and renting, prison as a reduced year (only
 * prison events, few actions, the right number of years) and release.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { ContentBundle, EventDef } from '../content/schemas';
import { isActionAvailable, isLifeActionAvailable } from './actions';
import { resolveAll } from './autoplay';
import { hireChance, meetsJobRequirements, startJob } from './career';
import { runEconomy } from './systems/economy';
import { evaluate } from './conditions';
import { isPrisonEvent } from './events/selection';
import { checkInvariants } from './invariants';
import { onProbation, sentence, sentenceText, sentenceWeights } from './legal';
import { moveInCost } from './housing';
import { beginYear, endYear, resolveChoice } from './life';
import { createRng } from './rng';
import { getLegalStatus, getMoneyView, getSchoolView, getWorkView } from './selectors';
import { rollOpenings } from './career';
import { runLegal } from './systems/legal';
import { cloneJson, lifeAtAge } from './testFixtures';
import type { LifeState } from './types';

function adult(setup: (d: LifeState) => void = () => {}, age = 30, bundle: ContentBundle = content): LifeState {
  return produce(lifeAtAge('legal', age, bundle), (d) => {
    d.character.cityId = 'chicago';
    d.character.birthCityId = 'chicago';
    d.housing = { kind: 'renting', cityId: 'chicago', annualCost: 0, since: d.birthYear + 20 };
    d.education.credentials = [{ type: 'hs_diploma', year: d.birthYear + 18 }];
    setup(d);
  });
}

/** Content where nobody dies and no condition starts, plus two test events. */
const safe: ContentBundle = (() => {
  const b = cloneJson(content);
  b.balance.mortality.background = 0;
  b.balance.mortality.ageCurve.base = 0;
  b.balance.health.maxConditions = 0;
  const event = (id: string, extra: Partial<EventDef>): EventDef => ({
    id,
    title: id,
    text: 'Test.',
    tone: 'neutral',
    category: 'justice',
    rarity: 'common',
    lifeStages: ['youngAdult', 'adult'],
    weight: { base: 1 },
    followUpOnly: true,
    ...extra,
  });
  b.events.test_heist = event('test_heist', {
    choices: [
      { id: 'drive', label: 'Drive', outcome: { text: 'You get {sentence}.', effects: [{ type: 'legal', offenseId: 'theft', outcome: 'jail', years: 2 }] } },
      { id: 'stay', label: 'Stay home', outcome: { effects: [] } },
    ],
  });
  b.events.test_later = event('test_later', { autoOutcome: { effects: [] } });
  return b;
})();

describe('sentencing', () => {
  it('hands down a warning, a fine, probation or prison, each on the record with a history entry', () => {
    const life = adult((d) => (d.finances.savings = 100_000));
    const warned = produce(life, (d) => void sentence(d, 'shoplifting', 'warning', undefined, content));
    expect(warned.legal.record).toEqual([{ offenseId: 'shoplifting', year: life.currentYear, outcome: 'warning' }]);
    expect(warned.history.at(-1)!.tags).toEqual(['legal', 'warning']);
    const fined = produce(life, (d) => void sentence(d, 'dui', 'fine', undefined, content));
    const amount = fined.legal.record[0]!.amount!;
    expect(amount).toBeGreaterThanOrEqual(content.offenses.dui!.fine!.min);
    expect(fined.finances.savings).toBe(100_000 - amount);
    const probation = produce(life, (d) => void sentence(d, 'drug_possession', 'probation', 2, content));
    expect(probation.legal.probationUntil).toBe(life.currentYear + 2);
    expect(onProbation(probation)).toBe(true);
    const jailed = produce(life, (d) => void sentence(d, 'theft', 'jail', 3, content));
    expect(jailed.housing.kind).toBe('incarcerated');
    expect(jailed.legal.incarceratedUntil).toBe(life.currentYear + 3);
    for (const l of [warned, fined, probation, jailed]) expect(checkInvariants(l, content)).toEqual([]);
  });

  it('turns a fine savings can’t cover into debt (the debt system)', () => {
    const fined = produce(adult(), (d) => void sentence(d, 'fraud', 'fine', undefined, content));
    expect(fined.finances.debts).toEqual([expect.objectContaining({ kind: 'personal', balance: fined.legal.record[0]!.amount })]);
  });

  it('weighs a prior record, and never sends a minor to prison', () => {
    const def = content.offenses.drug_dealing!;
    const first = sentenceWeights(adult(), def, content);
    const repeat = sentenceWeights(adult((d) => d.legal.record.push({ offenseId: 'theft', year: d.currentYear - 5, outcome: 'fine' })), def, content);
    expect(repeat.jail / repeat.fine).toBeGreaterThan(first.jail / first.fine);
    const teen = produce(lifeAtAge('legal-teen', 16), (d) => void sentence(d, 'car_theft', 'jail', 2, content));
    expect(sentenceWeights(teen, content.offenses.car_theft!, content).jail).toBe(0);
    expect(teen.legal.record[0]!.outcome).toBe('probation');
    expect(teen.housing.kind).toBe('with_parents');
    expect(checkInvariants(teen, content)).toEqual([]);
  });

  it('writes what was handed down into the outcome text ({sentence})', () => {
    const life = produce(adult(), (d) => void sentence(d, 'theft', 'jail', 2, content));
    expect(sentenceText(life, content)).toBe('2 years in prison');
    expect(sentenceText(adult(), content)).toBe('');
  });
});

describe('the record', () => {
  it('costs you a job whose requirements it breaks', () => {
    const cop = produce(adult(undefined, 30), (d) => {
      d.career.openings = ['police_officer'];
      startJob(d, 'police_officer', content);
    });
    const after = produce(cop, (d) => void sentence(d, 'disorderly_conduct', 'warning', undefined, content));
    expect(after.career.job).toBeNull();
    expect(after.career.history.at(-1)!.endedBy).toBe('fired');
    expect(checkInvariants(after, content)).toEqual([]);
  });

  it('counts a conviction, not a warning, against you when hiring', () => {
    const job = content.jobs.office_administrator!;
    const clean = hireChance(adult(), job, content);
    const warned = hireChance(adult((d) => d.legal.record.push({ offenseId: 'shoplifting', year: d.currentYear, outcome: 'warning' })), job, content);
    const fined = hireChance(adult((d) => d.legal.record.push({ offenseId: 'shoplifting', year: d.currentYear, outcome: 'fine', amount: 300 })), job, content);
    expect(warned).toBe(clean);
    expect(fined).toBeLessThan(clean);
  });

  it('makes renting cost more after probation or prison', () => {
    const clean = adult();
    const flagged = adult((d) => d.legal.record.push({ offenseId: 'theft', year: d.currentYear - 1, outcome: 'probation', years: 1 }));
    expect(moveInCost(flagged, 'chicago', content)).toBeGreaterThan(moveInCost(clean, 'chicago', content));
  });

  it('is readable by conditions', () => {
    const life = adult((d) => {
      d.legal.record.push({ offenseId: 'theft', year: d.currentYear, outcome: 'probation', years: 2 });
      d.legal.probationUntil = d.currentYear + 2;
    });
    expect(evaluate({ record: { outcome: ['probation'] } }, life)).toBe(true);
    expect(evaluate({ legal: { probation: true } }, life)).toBe(true);
    expect(evaluate({ legal: { incarcerated: true } }, life)).toBe(false);
  });
});

describe('probation', () => {
  it('keeps you from moving city, and ends after its last year', () => {
    const life = adult((d) => {
      d.finances.savings = 100_000;
      d.legal.record.push({ offenseId: 'theft', year: d.currentYear, outcome: 'probation', years: 1 });
      d.legal.probationUntil = d.currentYear;
    });
    expect(isLifeActionAvailable(life, 'relocate', { cityId: 'houston' }, content)).toBe(false);
    expect(getLegalStatus(life)).toEqual({ kind: 'probation', lastYear: life.currentYear, yearsLeft: 1 });
    const next = produce(life, (d) => {
      d.currentYear += 1;
      d.character.age += 1;
      runLegal(d, content);
    });
    expect(next.legal.probationUntil).toBeUndefined();
    expect(next.history.at(-1)!.tags).toEqual(['legal', 'probationEnded']);
    expect(isLifeActionAvailable(next, 'relocate', { cityId: 'houston' }, content)).toBe(true);
  });
});

describe('prison', () => {
  /** A 30-year-old with a job and a home they own, mid-year, about to make a bad choice. */
  function beforeHeist(): LifeState {
    return produce(adult((d) => (d.finances.savings = 300_000), 30, safe), (d) => {
      d.career.openings = ['retail_associate'];
      startJob(d, 'retail_associate', safe);
      d.housing = { kind: 'owned', cityId: 'chicago', annualCost: 0, homeValue: 250_000, since: d.currentYear - 2 };
      d.scheduled.push({ eventId: 'test_later', dueYear: d.currentYear + 1, cast: {} });
      d.pending = [
        { instanceId: 'e1', eventId: 'test_heist', cast: {} },
        { instanceId: 'e2', eventId: 'test_later', cast: {} },
      ];
      d.phase = 'events';
      d.recap = { year: d.currentYear, age: d.character.age, statsBefore: { ...d.character.stats }, statsAfter: null };
      d.lifetime.years -= 1;
      d.lifetime.happinessTotal = d.character.stats.happiness * d.lifetime.years;
    });
  }

  it('takes your job and the rest of the year (not your home), and ends the outcome with the sentence', () => {
    const jailed = resolveChoice(beforeHeist(), 'e1', 'drive', safe);
    expect(jailed.housing.kind).toBe('incarcerated');
    expect(jailed.housing.homeValue).toBe(250_000);
    expect(jailed.finances.savings).toBe(300_000);
    expect(jailed.career.job).toBeNull();
    expect(jailed.career.history.at(-1)!.endedBy).toBe('jailed');
    expect(jailed.pending.map((p) => p.eventId)).toEqual(['test_heist']);
    expect(jailed.pending[0]!.outcomeText).toBe('You get 2 years in prison.');
    expect(jailed.phase).toBe('yearEnd');
    expect(jailed.scheduled.some((s) => s.eventId === 'prison_first_night' && s.dueYear === jailed.currentYear + 1)).toBe(true);
    expect(checkInvariants(jailed, safe)).toEqual([]);
  });

  it('skips exactly the sentence, with only prison events and a few actions, then releases you', () => {
    let life = endYear(resolveChoice(beforeHeist(), 'e1', 'drive', safe), safe);
    const sentencedIn = life.currentYear;
    const choices = createRng('prison');
    let yearsInside = 0;
    while (life.housing.kind === 'incarcerated') {
      expect(getLegalStatus(life)!.kind).toBe('prison');
      expect(isLifeActionAvailable(life, 'start_gig', {}, safe)).toBe(false);
      expect(isLifeActionAvailable(life, 'apply_job', { jobId: 'retail_associate' }, safe)).toBe(false);
      for (const id of Object.keys(life.relationships)) expect(isActionAvailable(life, 'ask_out', id, safe)).toBe(false);
      life = beginYear(life, safe);
      if (life.housing.kind !== 'incarcerated') break;
      yearsInside++;
      // The first year inside begins with intake; later years have a few prison events, or none.
      if (yearsInside === 1) expect(life.pending.map((p) => p.eventId)).toContain('prison_first_night');
      for (const p of life.pending) expect(isPrisonEvent(safe.events[p.eventId]!, safe)).toBe(true);
      expect(checkInvariants(life, safe)).toEqual([]);
      life = endYear(resolveAll(life, safe, choices), safe);
    }
    expect(yearsInside).toBe(2);
    expect(life.currentYear).toBe(sentencedIn + 3);
    // Released: back to the home you own, parole, a release event, and the deferred follow-up.
    expect(life.housing.kind).toBe('owned');
    expect(life.legal.incarceratedUntil).toBeUndefined();
    expect(getLegalStatus(life)).toEqual({ kind: 'probation', lastYear: life.currentYear, yearsLeft: 1 });
    expect(life.pending.map((p) => p.eventId)).toEqual(expect.arrayContaining(['release_day', 'test_later']));
    expect(life.history.some((e) => e.tags.includes('released'))).toBe(true);
    expect(checkInvariants(life, safe)).toEqual([]);
  });

  it('shows school, work and lifestyle choices as closed while you are inside', () => {
    const inside = produce(adult((d) => (d.finances.savings = 1000), 70), (d) => {
      sentence(d, 'theft', 'jail', 2, content);
      rollOpenings(d, content);
    });
    expect(inside.career.openings).toEqual([]);
    expect(getSchoolView(inside, content).between).toBe(false);
    expect(getSchoolView(inside, content).canApply).toBe(false);
    expect(getMoneyView(inside, content).canChangeLifestyle).toBe(false);
    expect(getWorkView(inside, content).canRetire).toBe(false);
    expect(getWorkView(inside, content).searchBlock).toBe('away');
  });

  /** Invariant failures about homes, partners, debts and prison (years advanced by hand skip the age-up bookkeeping). */
  const homeFailures = (life: LifeState) => checkInvariants(life, content).filter((f) => !f.startsWith('scheduled') && /home|partner|mortgage|debt|prison|housing|incarcerat|probation/.test(f));

  /** A homeowner with a mortgage and a partner living with them, sentenced to `years` in prison. */
  function homeowner(savings: number, years = 3): LifeState {
    const life = adult((d) => (d.finances.savings = savings));
    return produce(life, (d) => {
      const id = 'p900';
      d.people[id] = { ...d.people[Object.keys(d.people)[0]!]!, id, birthYear: d.birthYear - 1, cityId: 'chicago', tags: ['partner'] };
      d.people[id]!.identity = { ...d.people[id]!.identity, attractedTo: [d.character.identity.genderCategory] };
      d.character.identity.attractedTo = [d.people[id]!.identity.genderCategory];
      d.relationships[id] = { personId: id, kind: 'spouse', status: 'active', affection: 70, trust: 70, memories: [], since: d.currentYear - 5, kindSince: d.currentYear - 3, wasSpouse: true };
      d.housing = { kind: 'owned', cityId: 'chicago', annualCost: 0, homeValue: 300_000, since: d.currentYear - 2, partnerId: id };
      d.finances.debts.push({ id: 'd1', kind: 'mortgage', balance: 200_000, annualRate: 0.06, minPayment: 16_000, missed: 0 });
      d.housing.mortgageDebtId = 'd1';
      sentence(d, 'fraud', 'jail', years, content);
    });
  }

  it('keeps a home you own: its mortgage and upkeep run through the ledger, and a partner there pays their share', () => {
    const inside = homeowner(100_000);
    expect(inside.housing).toEqual(expect.objectContaining({ kind: 'incarcerated', homeValue: 300_000, mortgageDebtId: 'd1', partnerId: 'p900' }));
    expect(checkInvariants(inside, content)).toEqual([]);
    const e = content.balance.economy;
    const upkeep = Math.round(300_000 * e.ownership.upkeep * e.housing.partnerShare);
    expect(inside.housing.annualCost).toBe(upkeep);
    const year = produce(inside, (d) => {
      d.currentYear += 1;
      d.character.age += 1;
      runEconomy(d, content);
    });
    // The home appreciates first, then its upkeep is charged.
    expect(year.finances.lastLedger!.housing).toBe(Math.round(year.housing.homeValue! * e.ownership.upkeep * e.housing.partnerShare));
    expect(year.finances.lastLedger!.living).toBe(0);
    expect(year.finances.lastLedger!.debtPayments).toBe(16_000);
    expect(year.finances.debts.find((d) => d.id === 'd1')!.missed).toBe(0);
    expect(homeFailures(year)).toEqual([]);
  });

  it('can still lose that home to foreclosure if payments are missed, and you stay inside', () => {
    let life = homeowner(0, 6);
    const after = content.balance.economy.missed.foreclosureAfter;
    for (let i = 0; i < after; i++) {
      life = produce(life, (d) => {
        d.currentYear += 1;
        d.character.age += 1;
        runEconomy(d, content);
      });
      expect(homeFailures(life)).toEqual([]);
    }
    expect(life.housing.kind).toBe('incarcerated');
    expect(life.housing.homeValue).toBeUndefined();
    expect(life.housing.partnerId).toBeUndefined();
    expect(life.finances.debts.some((d) => d.kind === 'mortgage')).toBe(false);
    expect(life.history.some((e) => e.tags.includes('foreclosed'))).toBe(true);
  });

  it('brings you back to the home you own on release', () => {
    const inside = homeowner(100_000, 1);
    const out = produce(inside, (d) => {
      d.currentYear += 2;
      d.character.age += 2;
      runLegal(d, content);
    });
    expect(out.housing).toEqual(expect.objectContaining({ kind: 'owned', homeValue: 300_000, partnerId: 'p900' }));
    expect(homeFailures(out)).toEqual([]);
  });
});

describe('juvenile records', () => {
  /** Shoplifting at 16 (probation), and now this age. */
  const withTeenRecord = (age: number) =>
    adult((d) => d.legal.record.push({ offenseId: 'shoplifting', year: d.birthYear + 16, outcome: 'probation', years: 1 }), age);

  it('stop counting for hiring and renting at 18, and count before', () => {
    const job = content.jobs.office_administrator!;
    expect(hireChance(withTeenRecord(19), job, content)).toBe(hireChance(adult(undefined, 19), job, content));
    expect(moveInCost(withTeenRecord(19), 'chicago', content)).toBe(moveInCost(adult(undefined, 19), 'chicago', content));
    expect(meetsJobRequirements(withTeenRecord(25), content.jobs.police_officer!, content)).toBe(true);
    expect(hireChance(withTeenRecord(17), job, content)).toBeLessThan(hireChance(adult(undefined, 17), job, content));
    // An offense at 18 or later still counts.
    const adultRecord = adult((d) => d.legal.record.push({ offenseId: 'shoplifting', year: d.birthYear + 18, outcome: 'fine', amount: 300 }), 25);
    expect(meetsJobRequirements(adultRecord, content.jobs.police_officer!, content)).toBe(false);
  });

  it('stay on the record, in life history and in event conditions', () => {
    const teen = produce(lifeAtAge('juvenile', 16), (d) => void sentence(d, 'shoplifting', 'fine', undefined, content));
    const grown = produce(teen, (d) => {
      d.currentYear += 6;
      d.character.age += 6;
    });
    expect(grown.legal.record).toHaveLength(1);
    expect(grown.history.some((e) => e.tags.includes('legal'))).toBe(true);
    expect(evaluate({ record: {} }, grown)).toBe(true);
    expect(evaluate({ record: { outcome: ['fine'] } }, grown)).toBe(true);
  });
});
