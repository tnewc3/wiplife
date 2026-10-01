/**
 * Careers (Stage 8): eligibility, the job market, application odds, the
 * yearly review (performance, promotion, raises, firing, layoffs), pay
 * through the ledger, leaving a job (quitting, retiring, moving, school),
 * the people at work, work actions and effects, and the condition language.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { ContentBundle, Effect, EventDef } from '../content/schemas';
import { finishAction, isLifeActionAvailable, performAction } from './actions';
import {
  afterMove,
  currentBoss,
  currentCoworkers,
  hireChance,
  jobApplyBlock,
  jobLossPay,
  levelPay,
  meetsJobRequirements,
  rollOpenings,
  searchBlock,
  startJob,
  startLevel,
} from './career';
import { evaluate } from './conditions';
import { InvalidInputError } from './creation/input';
import { applyEffects } from './events/effects';
import { checkInvariants } from './invariants';
import { beginYear, resolveChoice } from './life';
import { createRng } from './rng';
import { getCareerHistory, getJobSearch, getWorkView } from './selectors';
import { runCareer } from './systems/career';
import { runEconomy } from './systems/economy';
import { runRelationships } from './systems/relationships';
import { cloneJson, lifeAtAge } from './testFixtures';
import type { Credential, LifeState } from './types';

const careers = content.balance.careers;

/** An adult in Chicago, out of school, with these credentials and every job open. */
function adult(credentials: Credential['type'][] = ['hs_diploma'], setup: (d: LifeState) => void = () => {}, age = 25): LifeState {
  return produce(lifeAtAge('careers', age), (d) => {
    d.character.cityId = 'chicago';
    d.character.birthCityId = 'chicago';
    d.housing = { kind: 'renting', cityId: 'chicago', annualCost: 0, since: d.birthYear + 20 };
    d.education.credentials = credentials.map((type) => ({ type, year: d.birthYear + 18 }));
    d.career.openings = Object.keys(content.jobs).sort();
    setup(d);
  });
}

/** Content with careers balance changes (for certain outcomes). */
function withCareers(change: (b: ContentBundle['balance']['careers']) => void): ContentBundle {
  const bundle = cloneJson(content);
  change(bundle.balance.careers);
  return bundle;
}

const sure = [{ at: 0, x: 1 }];
const never = [{ at: 0, x: 0 }];

/** Hired in `jobId` two years ago, so this year's review is due. */
function employed(jobId: string, credentials: Credential['type'][] = ['hs_diploma'], setup: (d: LifeState) => void = () => {}): LifeState {
  return produce(adult(credentials), (d) => {
    startJob(d, jobId, content);
    d.career.job!.since = d.currentYear - 2;
    setup(d);
  });
}

describe('who can be hired', () => {
  it('checks degrees, licenses and their fields, the minimum age and school', () => {
    const se = content.jobs.software_engineer!;
    expect(meetsJobRequirements(adult(['hs_diploma']), se, content)).toBe(false);
    const english = produce(adult(['hs_diploma', 'bachelor']), (d) => {
      d.education.credentials[1]!.refId = 'english';
      d.education.credentials[1]!.tier = 'state';
    });
    expect(meetsJobRequirements(english, se, content)).toBe(false);
    const cs = produce(english, (d) => void (d.education.credentials[1]!.refId = 'computer_science'));
    expect(meetsJobRequirements(cs, se, content)).toBe(true);
    // A trade license in the right trade.
    const licensed = produce(adult(['hs_diploma', 'trade_license']), (d) => void (d.education.credentials[1]!.refId = 'plumber'));
    expect(meetsJobRequirements(licensed, content.jobs.plumber!, content)).toBe(true);
    expect(meetsJobRequirements(licensed, content.jobs.electrician!, content)).toBe(false);
    // Too young, or in school.
    expect(searchBlock(lifeAtAge('young', careers.minAge - 1), content)).toBe('age');
    const student = produce(adult(), (d) => {
      d.education.current = { program: 'college', tier: 'state', majorId: 'english', year: 1, lengthYears: 4, gpa: 3, boost: 0, repeats: 0, scholarship: 0, since: d.currentYear };
    });
    expect(searchBlock(student, content)).toBe('school');
    expect(getJobSearch(student, content).options).toEqual([]);
  });

  it('can check the criminal record through the condition language', () => {
    const police = content.jobs.police_officer!;
    const clean = adult();
    expect(meetsJobRequirements(clean, police, content)).toBe(true);
    const record = produce(clean, (d) => void d.legal.record.push({ offenseId: 'theft', year: d.currentYear - 3, outcome: 'fine' }));
    expect(meetsJobRequirements(record, police, content)).toBe(false);
    expect(evaluate({ record: {} }, record)).toBe(true);
    expect(evaluate({ record: { outcome: ['jail'] } }, record)).toBe(false);
    expect(evaluate({ record: { within: 2 } }, record)).toBe(false);
    // Security work only rules out probation and jail.
    expect(meetsJobRequirements(record, content.jobs.security_guard!, content)).toBe(true);
    // A record also lowers your odds.
    expect(hireChance(record, content.jobs.retail_associate!, content)).toBeLessThan(hireChance(clean, content.jobs.retail_associate!, content));
  });

  it('lists only openings you qualify for in job search, and never your own job', () => {
    const search = getJobSearch(adult(), content);
    expect(search.options.length).toBeGreaterThan(0);
    for (const o of search.options) expect(meetsJobRequirements(adult(), content.jobs[o.jobId]!, content)).toBe(true);
    expect(search.options.some((o) => o.jobId === 'software_engineer')).toBe(false);
    const working = employed('retail_associate');
    expect(getJobSearch(working, content).options.some((o) => o.jobId === 'retail_associate')).toBe(false);
    // Closed tracks aren't listed.
    const closed = produce(adult(), (d) => void (d.career.openings = ['warehouse_worker']));
    expect(getJobSearch(closed, content).options.map((o) => o.jobId)).toEqual(['warehouse_worker']);
  });

  it('has requirements every job track can meet, and at least three levels', () => {
    // Every credential anyone could hold: each major, trade and grad program.
    const profiles: Credential[][] = [[], [{ type: 'hs_diploma', year: 2018 }]];
    for (const majorId of Object.keys(content.majors)) {
      for (const type of ['associate', 'bachelor'] as const) profiles.push([{ type: 'hs_diploma', year: 2018 }, { type, refId: majorId, year: 2022, tier: type === 'associate' ? 'community' : 'state' }]);
    }
    for (const trade of Object.keys(content.trades)) profiles.push([{ type: 'hs_diploma', year: 2018 }, { type: 'trade_license', refId: trade, year: 2020 }]);
    for (const grad of Object.keys(content.gradPrograms)) {
      profiles.push([{ type: 'hs_diploma', year: 2018 }, { type: 'bachelor', refId: 'biology', year: 2022, tier: 'state' }, { type: 'grad', refId: grad, year: 2025 }]);
    }
    for (const def of Object.values(content.jobs)) {
      expect(def.levels.length).toBeGreaterThanOrEqual(3);
      const reachable = profiles.some((credentials) => meetsJobRequirements(produce(adult([], () => {}, 30), (d) => void (d.education.credentials = credentials)), def, content));
      expect(reachable, def.id).toBe(true);
    }
    expect(Object.keys(content.jobs).length).toBeGreaterThanOrEqual(30);
  });
});

describe('lining up a job in your final year of school', () => {
  /** A computer science senior: the bachelor's comes as the next year begins. */
  const senior = () =>
    produce(adult(['hs_diploma'], () => {}, 21), (d) => {
      d.education.current = { program: 'college', tier: 'state', majorId: 'computer_science', year: 4, lengthYears: 4, gpa: 3.2, boost: 0, repeats: 0, scholarship: 0, since: d.currentYear - 3 };
    });

  it('counts the degree you are finishing, and keeps the job as you graduate', () => {
    const life = senior();
    expect(searchBlock(life, content)).toBeNull();
    expect(getJobSearch(life, content).options.some((o) => o.jobId === 'software_engineer')).toBe(true);
    const hired = produce(life, (d) => startJob(d, 'software_engineer', content));
    expect(checkInvariants(hired, content)).toEqual([]);
    // As the year begins: the degree, then the job, paid by the ledger.
    const next = beginYear(hired, content);
    expect(next.education.credentials.some((c) => c.type === 'bachelor' && c.refId === 'computer_science')).toBe(true);
    expect(next.career.job?.jobId).toBe('software_engineer');
    expect(next.finances.lastLedger!.gross).toBeGreaterThanOrEqual(hired.career.job!.salary);
  });

  it('falls through if you drop out instead', () => {
    const hired = produce(senior(), (d) => startJob(d, 'software_engineer', content));
    const dropped = performAction(hired, 'drop_out', {}, content);
    expect(dropped.career.job).toBeNull();
    expect(dropped.history.at(-1)!.tags).toEqual(['career', 'fellThrough']);
    expect(checkInvariants(dropped, content)).toEqual([]);
  });

  it('keeps students out of work before the final year', () => {
    const junior = produce(senior(), (d) => void (d.education.current!.year = 3));
    expect(searchBlock(junior, content)).toBe('school');
  });
});

describe('the job market and hiring', () => {
  it('rolls openings by the city market (none before the hiring age), and a move opens the new city', () => {
    const rolled = produce(adult(), (d) => rollOpenings(d, content));
    expect(rolled.career.openings.length).toBeGreaterThan(0);
    expect(rolled.career.openings.every((id) => content.jobs[id])).toBe(true);
    const young = produce(lifeAtAge('teen', careers.minAge - 1), (d) => rollOpenings(d, content));
    expect(young.career.openings).toEqual([]);
    // Over many cities and years, a strong market has more openings than a weak one.
    const count = (cityId: string) => {
      let open = 0;
      for (let i = 0; i < 40; i++) {
        open += produce(adult(), (d) => {
          d.character.cityId = cityId;
          d.rng = createRng(`open-${i}`);
          rollOpenings(d, content);
        }).career.openings.length;
      }
      return open;
    };
    expect(count('nyc')).toBeGreaterThan(count('small_town'));
  });

  it('gives odds that respond to Confidence and the market, never certain or impossible', () => {
    const def = content.jobs.marketing_specialist!;
    const shy = produce(adult(), (d) => void (d.character.personality.confidence = 0));
    const bold = produce(adult(), (d) => void (d.character.personality.confidence = 100));
    expect(hireChance(bold, def, content)).toBeGreaterThan(hireChance(shy, def, content));
    const weak = produce(bold, (d) => void (d.character.cityId = 'small_town'));
    expect(hireChance(weak, def, content)).toBeLessThan(hireChance(bold, def, content));
    const odds = careers.hiring.odds.professional;
    for (const life of [shy, bold, weak]) {
      const chance = hireChance(life, def, content);
      expect(chance).toBeGreaterThanOrEqual(odds.min / 100);
      expect(chance).toBeLessThanOrEqual(odds.max / 100);
    }
  });

  it('starts a job at the first level, paid the level salary × the city multiplier, with a boss and coworkers', () => {
    const life = produce(adult(), (d) => {
      d.career.gig = true;
      startJob(d, 'bank_teller', content);
    });
    const job = life.career.job!;
    expect(job).toMatchObject({ jobId: 'bank_teller', level: 1, yearsAtLevel: 0, since: life.currentYear });
    expect(job.salary).toBe(Math.round(content.jobs.bank_teller!.levels[0]!.salary * content.cities.chicago!.salaryMultiplier));
    expect(content.jobs.bank_teller!.employers).toContain(job.employer);
    expect(life.career.gig).toBe(false);
    expect(currentBoss(life)).not.toBeNull();
    expect(currentCoworkers(life)).toHaveLength(careers.workplace.coworkers);
    expect(life.history.at(-1)!.tags).toEqual(['career', 'hired']);
    expect(checkInvariants(life, content)).toEqual([]);
  });

  it('starts you at the level you reached in a track before (experience counts)', () => {
    const life = produce(adult(), (d) => {
      d.career.history.push({ jobId: 'bank_teller', employer: 'First Prairie Bank', fromYear: 2018, toYear: 2023, level: 3, salary: 58_000, endedBy: 'laid_off' });
    });
    expect(startLevel(life, content.jobs.bank_teller!)).toBe(3);
    expect(startLevel(life, content.jobs.retail_associate!)).toBe(1);
    expect(hireChance(life, content.jobs.bank_teller!, content)).toBeGreaterThan(hireChance(adult(), content.jobs.bank_teller!, content));
  });
});

describe('the yearly review', () => {
  it('skips a job you were only just hired for', () => {
    const fresh = produce(adult(), (d) => {
      startJob(d, 'warehouse_worker', content);
      d.career.job!.since = d.currentYear - 1;
    });
    const after = produce(fresh, (d) => runCareer(d, withCareers((b) => (b.firing = sure))));
    expect(after.career.job?.yearsAtLevel).toBe(0);
  });

  it('promotes a strong performer who has been at the level long enough, to the new level’s pay', () => {
    const bundle = withCareers((b) => {
      b.promotion.chance = sure;
      b.layoffs = never;
      b.firing = never;
    });
    const life = employed('warehouse_worker', ['hs_diploma'], (d) => void (d.career.job!.yearsAtLevel = 1));
    const after = produce(life, (d) => runCareer(d, bundle));
    expect(after.career.job!.level).toBe(2);
    expect(after.career.job!.yearsAtLevel).toBe(0);
    expect(after.career.job!.salary).toBeGreaterThanOrEqual(levelPay(after, content.jobs.warehouse_worker!, 2, content));
    expect(after.history.at(-1)!.tags).toEqual(['career', 'promoted']);
    // Not yet long enough at the level: a merit raise instead (never past the cap).
    // Bank tellers wait the usual years at a level.
    const teller = employed('bank_teller', ['hs_diploma'], (d) => void (d.career.job!.performance = 100));
    const early = produce(teller, (d) => runCareer(d, bundle));
    expect(early.career.job!.level).toBe(1);
    expect(early.career.job!.salary).toBeGreaterThanOrEqual(teller.career.job!.salary);
    expect(early.career.job!.salary).toBeLessThanOrEqual(Math.round(levelPay(early, content.jobs.bank_teller!, 1, content) * (1 + careers.raises.maxAboveLevel)));
  });

  it('fires by performance, lays off by the market, and pays part of the salary the year the job ends', () => {
    const fireAll = withCareers((b) => {
      b.firing = sure;
      b.layoffs = never;
    });
    const life = employed('bank_teller');
    const salary = life.career.job!.salary;
    const fired = produce(life, (d) => runCareer(d, fireAll));
    expect(fired.career.job).toBeNull();
    expect(fired.career.history.at(-1)).toMatchObject({ jobId: 'bank_teller', endedBy: 'fired', toYear: fired.currentYear, salary });
    expect(jobLossPay(fired, content)).toBe(Math.round(salary * careers.jobLoss.fired));
    // The people from work become acquaintances.
    expect(currentBoss(fired)).toBeNull();
    expect(currentCoworkers(fired)).toEqual([]);
    expect(checkInvariants(fired, content)).toEqual([]);
    const paid = produce(fired, (d) => runEconomy(d, content));
    expect(paid.finances.lastLedger!.gross).toBe(Math.round(salary * careers.jobLoss.fired));

    const laidOff = produce(life, (d) => runCareer(d, withCareers((b) => (b.layoffs = sure))));
    expect(laidOff.career.history.at(-1)!.endedBy).toBe('laid_off');
    expect(jobLossPay(laidOff, content)).toBe(Math.round(salary * careers.jobLoss.laid_off));
  });

  it('keeps performance within 0–100, worse under stress and poor health', () => {
    const calm = employed('accountant', ['hs_diploma', 'bachelor'], (d) => {
      d.education.credentials[1] = { type: 'bachelor', refId: 'business', year: d.birthYear + 22, tier: 'state' };
      d.character.stats.stress = 0;
      d.character.stats.health = 100;
    });
    const wrecked = produce(calm, (d) => {
      d.character.stats.stress = 100;
      d.character.stats.health = 5;
    });
    let calmTotal = 0;
    let wreckedTotal = 0;
    const steady = withCareers((b) => {
      b.firing = never;
      b.layoffs = never;
    });
    for (let i = 0; i < 20; i++) {
      const a = produce(calm, (d) => {
        d.rng = createRng(`perf-${i}`);
        runCareer(d, steady);
      });
      const b = produce(wrecked, (d) => {
        d.rng = createRng(`perf-${i}`);
        runCareer(d, steady);
      });
      for (const l of [a, b]) expect(l.career.job!.performance).toBeGreaterThanOrEqual(0);
      calmTotal += a.career.job!.performance;
      wreckedTotal += b.career.job!.performance;
    }
    expect(calmTotal).toBeGreaterThan(wreckedTotal);
  });

  it('pays salaries through the ledger, into the earnings record', () => {
    const life = employed('bank_teller');
    const paid = produce(life, (d) => runEconomy(d, content));
    expect(paid.finances.lastLedger!.gross).toBe(life.career.job!.salary);
    expect(paid.finances.earnings.years).toBe(life.finances.earnings.years + 1);
  });

  it('ends your job when school starts', () => {
    const life = produce(employed('retail_associate'), (d) => {
      d.education.current = { program: 'college', tier: 'community', majorId: 'business', year: 1, lengthYears: 2, gpa: 3, boost: 0, repeats: 0, scholarship: 0, since: d.currentYear };
    });
    const after = produce(life, (d) => runCareer(d, content));
    expect(after.career.job).toBeNull();
    expect(after.career.history.at(-1)!.endedBy).toBe('quit');
    expect(after.history.some((e) => e.tags.includes('leftForSchool'))).toBe(true);
  });

  it('keeps your boss in your life while you work there', () => {
    const life = produce(employed('retail_associate'), (d) => {
      const boss = d.relationships[currentBoss(d)!]!;
      boss.affection = 0;
      boss.memories = [];
    });
    const after = produce(life, (d) => runRelationships(d, content));
    expect(currentBoss(after)).toBe(currentBoss(life));
  });
});

describe('work actions', () => {
  const act = (life: LifeState, id: string, params?: unknown, bundle = content) => performAction(life, id, params, bundle);

  it('apply for a job: an interview event, then the job (or not)', () => {
    const hireAll = withCareers((b) => {
      for (const c of ['professional', 'trade', 'gig'] as const) b.hiring.odds[c] = { ...b.hiring.odds[c], min: 100, max: 100 };
    });
    const life = adult();
    const hired = act(life, 'apply_job', { jobId: 'office_administrator' }, hireAll);
    expect(hired.career.job?.jobId).toBe('office_administrator');
    expect(hired.career.applied).toEqual([{ jobId: 'office_administrator', hired: true }]);
    expect(hired.phase).toBe('action');
    expect(content.registries.work.results.hired.events).toContain(hired.pending[0]!.eventId);
    expect(hired.pending[0]!.cast).toEqual({ boss: currentBoss(hired) });
    expect(hired.inputLog.at(-1)).toMatchObject({ kind: 'action', payload: { actionId: 'apply_job', params: { jobId: 'office_administrator' } } });
    expect(checkInvariants(hired, content)).toEqual([]);

    const rejectAll = withCareers((b) => {
      for (const c of ['professional', 'trade', 'gig'] as const) b.hiring.odds[c] = { ...b.hiring.odds[c], base: -100, min: 0, max: 0 };
    });
    const rejected = act(life, 'apply_job', { jobId: 'office_administrator' }, rejectAll);
    expect(rejected.career.job).toBeNull();
    expect(content.registries.work.results.rejected.events).toContain(rejected.pending[0]!.eventId);
    // Once per job a year, and only up to the limit.
    const back = finishAction(produce(rejected, (d) => void (d.pending[0]!.resolvedChoiceId = 'x')));
    expect(jobApplyBlock(back, 'office_administrator', content)).toBe('tried');
    expect(() => act(back, 'apply_job', { jobId: 'office_administrator' })).toThrow(InvalidInputError);
    expect(() => act(life, 'apply_job', { jobId: 'software_engineer' })).toThrow(InvalidInputError);
    expect(() => act(life, 'apply_job', { jobId: 'office_administrator', extra: 1 })).toThrow(InvalidInputError);
  });

  it('ask for a raise once a year, a year into the job: a raise event with your boss', () => {
    const life = employed('bank_teller');
    expect(isLifeActionAvailable(life, 'ask_raise', {}, content)).toBe(true);
    const asked = act(life, 'ask_raise');
    expect(asked.phase).toBe('action');
    expect(content.registries.work.results.raise.events).toContain(asked.pending[0]!.eventId);
    expect(asked.career.job!.raiseYear).toBe(life.currentYear);
    const back = finishAction(produce(asked, (d) => void (d.pending[0]!.resolvedChoiceId = 'x')));
    expect(isLifeActionAvailable(back, 'ask_raise', {}, content)).toBe(false);
    const fresh = produce(adult(), (d) => startJob(d, 'bank_teller', content));
    expect(isLifeActionAvailable(fresh, 'ask_raise', {}, content)).toBe(false);
  });

  it('quit and retire', () => {
    const life = employed('bank_teller');
    const quit = act(life, 'quit_job');
    expect(quit.career.job).toBeNull();
    expect(quit.career.history.at(-1)!.endedBy).toBe('quit');
    expect(() => act(quit, 'quit_job')).toThrow(InvalidInputError);
    expect(isLifeActionAvailable(life, 'retire', {}, content)).toBe(false);
    const older = produce(life, (d) => {
      d.character.age = careers.retireAge;
      d.currentYear = d.birthYear + careers.retireAge;
    });
    const retired = act(older, 'retire');
    expect(retired.career).toMatchObject({ job: null, retired: true, gig: false });
    expect(retired.career.history.at(-1)!.endedBy).toBe('retired');
    expect(getWorkView(retired, content).retired).toBe(true);
    // Back to work: retired no more.
    const back = produce(retired, (d) => startJob(d, 'retail_associate', content));
    expect(back.career.retired).toBe(false);
    expect(getCareerHistory(back, content).map((r) => r.endedBy)).toEqual([null, 'retired']);
  });

  it('relocating ends your job and opens the new city’s market', () => {
    const life = produce(employed('bank_teller'), (d) => void (d.finances.savings = 50_000));
    const moved = act(life, 'relocate', { cityId: 'houston' });
    expect(moved.career.job).toBeNull();
    expect(moved.career.history.at(-1)!.endedBy).toBe('moved');
    expect(moved.history.some((e) => e.tags.includes('moved'))).toBe(true);
    expect(checkInvariants(moved, content)).toEqual([]);
    // A move within the city changes nothing.
    const same = produce(life, (d) => afterMove(d, d.character.cityId, content));
    expect(same.career.job).not.toBeNull();
  });

  it('start gig work only without a job', () => {
    const life = employed('bank_teller');
    expect(isLifeActionAvailable(life, 'start_gig', {}, content)).toBe(false);
    expect(getWorkView(life, content).canGig).toBe(false);
  });
});

describe('work effects and conditions', () => {
  const def = { id: 'test', rarity: 'common' } as EventDef;
  const apply = (life: LifeState, effects: Effect[]) =>
    produce(life, (d) => applyEffects(d, effects, { def, cast: {}, rng: d.rng, content }));

  it('move performance, give raises (capped), promote, fire, quit and offer jobs', () => {
    const life = employed('bank_teller');
    expect(apply(life, [{ type: 'job', action: 'performance', value: 50 }]).career.job!.performance).toBe(Math.min(100, life.career.job!.performance + 50));
    const raised = apply(life, [{ type: 'job', action: 'raise' }]);
    expect(raised.career.job!.salary).toBe(Math.round(life.career.job!.salary * (1 + careers.raises.asked)));
    const many = apply(life, Array.from({ length: 20 }, () => ({ type: 'job', action: 'raise' }) as Effect));
    expect(many.career.job!.salary).toBe(Math.round(levelPay(life, content.jobs.bank_teller!, 1, content) * (1 + careers.raises.maxAboveLevel)));
    expect(apply(life, [{ type: 'job', action: 'promote' }]).career.job!.level).toBe(2);
    expect(apply(life, [{ type: 'job', action: 'fire' }]).career.history.at(-1)!.endedBy).toBe('fired');
    expect(apply(life, [{ type: 'job', action: 'quit' }]).career.job).toBeNull();
    const offered = apply(life, [{ type: 'job', action: 'offer', jobId: 'warehouse_worker' }]);
    expect(offered.career.job!.jobId).toBe('warehouse_worker');
    expect(offered.career.history.at(-1)!.jobId).toBe('bank_teller');
    // An offer you don't qualify for is ignored; so is anything without a job.
    expect(apply(life, [{ type: 'job', action: 'offer', jobId: 'lawyer' }]).career.job!.jobId).toBe('bank_teller');
    expect(apply(adult(), [{ type: 'job', action: 'promote' }]).career.job).toBeNull();
  });

  it('evaluate career conditions', () => {
    const life = employed('bank_teller', ['hs_diploma'], (d) => void (d.career.job!.performance = 70));
    expect(evaluate({ career: { employed: true, job: ['bank_teller'], level: { eq: 1 }, years: { gte: 2 }, performance: { gt: 60 } } }, life)).toBe(true);
    expect(evaluate({ career: { employed: false } }, life)).toBe(false);
    expect(evaluate({ career: { job: ['lawyer'] } }, life)).toBe(false);
    const fired = produce(life, (d) => applyEffects(d, [{ type: 'job', action: 'fire' }], { def, cast: {}, rng: d.rng, content }));
    expect(evaluate({ career: { employed: false, lostWithin: 1 } }, fired)).toBe(true);
    expect(evaluate({ career: { retired: false } }, fired)).toBe(true);
  });

  it('evaluate education fields: a credential in one of these majors, trades or grad programs', () => {
    const life = adult(['hs_diploma'], (d) => d.education.credentials.push({ type: 'trade_license', refId: 'welder', year: d.currentYear - 1 }));
    expect(evaluate({ education: { field: ['welder'] } }, life)).toBe(true);
    expect(evaluate({ education: { credential: ['trade_license'], field: ['welder'] } }, life)).toBe(true);
    expect(evaluate({ education: { credential: ['bachelor'], field: ['welder'] } }, life)).toBe(false);
    expect(evaluate({ education: { field: ['plumber'] } }, life)).toBe(false);
  });
});

describe('career invariants', () => {
  it('catch a job beside gig work, a boss without a job, and a job you don’t qualify for', () => {
    const life = employed('bank_teller');
    expect(checkInvariants(life, content)).toEqual([]);
    expect(checkInvariants(produce(life, (d) => void (d.career.gig = true)), content)).toContain('gig work and a job at once');
    expect(checkInvariants(produce(life, (d) => void (d.career.job = null)), content)).toContain('a boss or coworker without a job');
    const lawyer = produce(life, (d) => void (d.career.job!.jobId = 'lawyer'));
    expect(checkInvariants(lawyer, content)).toContain('job lawyer: its requirements are not met');
  });
});

describe('a work result event', () => {
  it('resolves and closes like a person action’s result', () => {
    const life = employed('bank_teller');
    const asked = performAction(life, 'ask_raise', {}, content);
    const def = content.events[asked.pending[0]!.eventId]!;
    const choice = def.choices!.find((c) => !c.visibleIf)!;
    const resolved = resolveChoice(asked, asked.pending[0]!.instanceId, choice.id, content);
    const done = finishAction(resolved);
    expect(done.phase).toBe('yearStart');
    expect(checkInvariants(done, content)).toEqual([]);
  });
});
