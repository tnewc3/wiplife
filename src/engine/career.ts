/**
 * Career rules (docs/design.md, section I; docs/technical.md, Stage 8): who
 * can be hired where, the job market in your city, your odds, starting and
 * leaving a job, performance, promotions and raises, and the people you work
 * with. The yearly career step (./systems/career.ts, which also runs gig
 * work), actions, effects, conditions, selectors and invariants all use these
 * functions, so each rule lives in one place. Numbers come from
 * src/content/balance/careers.yaml; jobs from src/content/jobs.
 *
 * Pay: a level's base salary × the city's salary multiplier. Salaries are
 * earned income, paid by the yearly ledger (yearIncome in
 * ./systems/career.ts) and recorded for the retirement benefit. You're hired
 * between years (or by an event during one), so the first year of pay is
 * the next year's ledger; the yearly review comes after a full year worked.
 */
import type { CareerHistoryKey, ContentBundle, JobDef } from '../content/schemas';
import { evaluate } from './conditions';
import { curveAt } from './curve';
import { modelChance } from './education';
import { createPerson } from './events/casting';
import { scoreOf } from './events/checks';
import { wholeDollars } from './finance';
import { clampInt } from './random';
import { chance, nextFloat, pick } from './rng';
import { writeFromGroup } from './systems/history';
import type { Id, Job, JobEnd, LifeState } from './types';

/** An active (not retired) job track, or undefined. */
export function activeJob(content: ContentBundle, jobId: Id): JobDef | undefined {
  const def = content.jobs[jobId];
  return def && !def.retired ? def : undefined;
}

/** The job's title at a level ("junior developer"). */
export function levelTitle(def: JobDef | undefined, level: number): string {
  return def?.levels[Math.min(def.levels.length, Math.max(1, level)) - 1]?.title ?? '';
}

/** The city's job market (0–100) for a job category, where you live. */
export function marketStrength(state: LifeState, def: JobDef, content: ContentBundle): number {
  return content.cities[state.character.cityId]?.jobMarket[def.category] ?? 50;
}

/** A level's pay in your city: its base salary × the city's salary multiplier. */
export function levelPay(state: LifeState, def: JobDef, level: number, content: ContentBundle): number {
  const city = content.cities[state.character.cityId];
  const base = def.levels[Math.min(def.levels.length, Math.max(1, level)) - 1]!.salary;
  return wholeDollars(base * (city?.salaryMultiplier ?? 1));
}

/** In any school program now (jobs and school don't mix: gig work is the student's option). */
export function inSchool(state: LifeState): boolean {
  return state.education.current !== null;
}

/** Why you can't look for work now, or null when you can. */
export type SearchBlock = 'age' | 'school' | 'away';

export function searchBlock(state: LifeState, content: ContentBundle): SearchBlock | null {
  if (state.character.age < content.balance.careers.minAge) return 'age';
  if (inSchool(state)) return 'school';
  if (state.housing.kind === 'incarcerated') return 'away';
  return null;
}

/** You meet the job's requirements (and are old enough to be hired at all). */
export function meetsJobRequirements(state: LifeState, def: JobDef, content: ContentBundle): boolean {
  return state.character.age >= content.balance.careers.minAge && evaluate(def.requires, state, { roles: 'strict' });
}

/** Why you can't apply for this job now, or null when you can. */
export type JobApplyBlock = SearchBlock | 'unknown' | 'closed' | 'current' | 'requirements' | 'tried' | 'limit';

export function jobApplyBlock(state: LifeState, jobId: Id, content: ContentBundle): JobApplyBlock | null {
  const def = activeJob(content, jobId);
  if (!def) return 'unknown';
  const blocked = searchBlock(state, content);
  if (blocked) return blocked;
  const c = state.career;
  if (!c.openings.includes(jobId)) return 'closed';
  if (c.job?.jobId === jobId) return 'current';
  if (!meetsJobRequirements(state, def, content)) return 'requirements';
  if (c.applied.some((a) => a.jobId === jobId)) return 'tried';
  if (c.applied.length >= content.balance.careers.maxApplications) return 'limit';
  return null;
}

/** Whole years you've worked in this track before (past jobs and your current one). */
export function yearsInTrack(state: LifeState, jobId: Id): number {
  const past = state.career.history.filter((h) => h.jobId === jobId).reduce((sum, h) => sum + Math.max(0, h.toYear - h.fromYear), 0);
  const job = state.career.job;
  return past + (job?.jobId === jobId ? Math.max(0, state.currentYear - job.since) : 0);
}

/** The level you'd start at: the highest you've held in this track before (experience counts), or the first. */
export function startLevel(state: LifeState, def: JobDef): number {
  const best = state.career.history.filter((h) => h.jobId === def.id).reduce((most, h) => Math.max(most, h.level), 1);
  return Math.min(def.levels.length, best);
}

/** Your chance (0–1) of being hired for this job: the category's odds, experience, degrees, your record and the city's market. */
export function hireChance(state: LifeState, def: JobDef, content: ContentBundle): number {
  const h = content.balance.careers.hiring;
  const degrees = state.education.credentials;
  let points = Math.min(h.experience.max, h.experience.perYear * yearsInTrack(state, def.id));
  const tiers = degrees.flatMap((c) => (c.type === 'bachelor' || c.type === 'associate') && c.tier ? [h.tier[c.tier]] : []);
  if (tiers.length > 0) points += Math.max(...tiers);
  if (degrees.some((c) => c.type === 'grad')) points += h.grad;
  if (state.legal.record.length > 0) points += h.record;
  const multiplier = curveAt(h.market, marketStrength(state, def, content));
  return modelChance(state, h.odds[def.category], undefined, content, { points, multiplier });
}

/**
 * Rolls which job tracks are hiring in your city this year (none before
 * you're old enough to be hired). Draws from the life's generator.
 */
export function rollOpenings(state: LifeState, content: ContentBundle): void {
  const city = content.cities[state.character.cityId];
  const open: Id[] = [];
  if (state.character.age < content.balance.careers.minAge) {
    state.career.openings = open;
    return;
  }
  for (const id of Object.keys(content.jobs).sort()) {
    const def = activeJob(content, id);
    if (!def || !city) continue;
    if (chance(state.rng, curveAt(content.balance.careers.openings, city.jobMarket[def.category]))) open.push(id);
  }
  state.career.openings = open;
}

/** A career history entry (text/history.yaml career). */
export function careerHistory(state: LifeState, key: CareerHistoryKey, values: Record<string, string | number>, content: ContentBundle): void {
  writeFromGroup(state, content.text.history.career[key], ['career', key], { values }, content);
}

/** Your current boss: living, still in your life, and your boss. */
export function currentBoss(state: LifeState): Id | null {
  for (const id of Object.keys(state.relationships).sort()) {
    const rel = state.relationships[id]!;
    if (rel.kind === 'boss' && rel.status !== 'ended' && state.people[id]?.alive) return id;
  }
  return null;
}

/** The coworkers in your life now (living, not faded). */
export function currentCoworkers(state: LifeState): Id[] {
  return Object.keys(state.relationships)
    .sort()
    .filter((id) => {
      const rel = state.relationships[id]!;
      return rel.kind === 'coworker' && rel.status !== 'ended' && state.people[id]?.alive === true;
    });
}

function addCoworker(state: LifeState, content: ContentBundle): void {
  const w = content.balance.careers.workplace;
  const min = content.balance.careers.minAge;
  createPerson(state, { kind: 'coworker', age: { min, max: 120 }, ageOffset: w.coworkerAgeOffset }, state.rng, content);
}

/**
 * Staffs your workplace: a boss when you have none (a new job, or yours
 * died or faded out of your life), and at a new job its first coworkers;
 * later, now and then, someone new joins.
 */
export function staffWorkplace(state: LifeState, content: ContentBundle, newJob: boolean): void {
  const w = content.balance.careers.workplace;
  if (currentBoss(state) === null) createPerson(state, { kind: 'boss', age: w.bossAge }, state.rng, content);
  if (newJob) {
    for (let i = 0; i < w.coworkers; i++) addCoworker(state, content);
  } else if (currentCoworkers(state).length < w.maxCoworkers && chance(state.rng, w.newCoworkerChance)) {
    addCoworker(state, content);
  }
}

/** The people from a job you leave become acquaintances: former coworkers and a former boss. */
function leaveWorkplace(state: LifeState): void {
  for (const rel of Object.values(state.relationships)) {
    if ((rel.kind === 'coworker' || rel.kind === 'boss') && rel.status !== 'ended') {
      rel.kind = 'acquaintance';
      rel.kindSince = state.currentYear;
    }
  }
}

const END_HISTORY: Record<JobEnd, CareerHistoryKey> = {
  quit: 'quit',
  fired: 'fired',
  laid_off: 'laidOff',
  retired: 'retired',
  moved: 'moved',
};

/**
 * You leave your job: it goes into your career history, the people there
 * become acquaintances, and a history entry is written (`historyKey`
 * overrides the usual one, e.g. leaving for school).
 */
export function endJob(state: LifeState, how: JobEnd, content: ContentBundle, historyKey?: CareerHistoryKey): void {
  const job = state.career.job;
  if (!job) return;
  const def = content.jobs[job.jobId];
  state.career.history.push({
    jobId: job.jobId,
    employer: job.employer,
    fromYear: job.since,
    toYear: state.currentYear,
    level: job.level,
    salary: job.salary,
    endedBy: how,
  });
  state.career.job = null;
  leaveWorkplace(state);
  const key = historyKey ?? END_HISTORY[how];
  if (key === 'retired') careerHistory(state, 'retired', { years: state.finances.earnings.years }, content);
  else careerHistory(state, key, { title: levelTitle(def, job.level), employer: job.employer }, content);
}

/**
 * You start a job in this track (the caller checks you can): any job you
 * have ends (you quit), gig work stops, you're no longer retired. You start
 * at the level your experience in the track earns, with that level's pay
 * in your city, and meet your boss and coworkers.
 */
export function startJob(state: LifeState, jobId: Id, content: ContentBundle): void {
  const def = content.jobs[jobId];
  if (!def) return;
  if (state.career.job) endJob(state, 'quit', content);
  const level = startLevel(state, def);
  const last = state.career.history.filter((h) => h.jobId === jobId).at(-1)?.employer;
  const employers = def.employers.length > 1 ? def.employers.filter((e) => e !== last) : def.employers;
  const job: Job = {
    jobId,
    level,
    yearsAtLevel: 0,
    performance: 0,
    salary: levelPay(state, def, level, content),
    since: state.currentYear,
    employer: pick(state.rng, employers),
  };
  job.performance = clampInt(performanceAim(state, def, content) + content.balance.careers.performance.start, 0, 100);
  state.career.job = job;
  state.career.gig = false;
  state.career.retired = false;
  staffWorkplace(state, content, true);
  careerHistory(state, 'hired', { title: levelTitle(def, level), employer: job.employer }, content);
}

/** You can take this job now (an offer from an event): old enough, out of school, and you meet its requirements. */
export function canTakeJob(state: LifeState, jobId: Id, content: ContentBundle): boolean {
  const def = activeJob(content, jobId);
  return def !== undefined && searchBlock(state, content) === null && state.career.job?.jobId !== jobId && meetsJobRequirements(state, def, content);
}

/**
 * What your performance aims at this year: the base, plus each of the job's
 * stat weights × (value − 50), minus the stress and health penalties.
 */
export function performanceAim(state: LifeState, def: JobDef, content: ContentBundle): number {
  const p = content.balance.careers.performance;
  let aim = p.base;
  for (const stat of def.performance) aim += stat.weight * (scoreOf(state, stat.key) - 50);
  aim -= curveAt(p.stress, state.character.stats.stress);
  aim -= curveAt(p.health, state.character.stats.health);
  return aim;
}

/** The yearly review's performance: part of last year's, the rest this year's aim, plus a random swing. Draws from the life's generator. */
export function reviewPerformance(state: LifeState, def: JobDef, content: ContentBundle): number {
  const p = content.balance.careers.performance;
  const job = state.career.job!;
  const aim = performanceAim(state, def, content) + (nextFloat(state.rng) * 2 - 1) * p.swing;
  return clampInt(job.performance * p.carry + aim * (1 - p.carry), 0, 100);
}

/** At the top level of your track. */
export function atTop(state: LifeState, content: ContentBundle): boolean {
  const job = state.career.job;
  const def = job && content.jobs[job.jobId];
  return !def || job.level >= def.levels.length;
}

/** Years at your level before a promotion is possible. */
export function yearsToPromotion(def: JobDef, level: number, content: ContentBundle): number {
  return def.levels[level - 1]?.years ?? content.balance.careers.promotion.minYears;
}

/** Up a level: the new level's pay, and at least the promotion bump. */
export function promote(state: LifeState, content: ContentBundle): void {
  const job = state.career.job;
  const def = job && content.jobs[job.jobId];
  if (!job || !def || job.level >= def.levels.length) return;
  job.level += 1;
  job.yearsAtLevel = 0;
  const bumped = wholeDollars(job.salary * (1 + content.balance.careers.promotion.bump));
  job.salary = Math.max(levelPay(state, def, job.level, content), bumped);
  careerHistory(state, 'promoted', { title: levelTitle(def, job.level), employer: job.employer }, content);
}

/** A raise of `share` of your salary, never more than raises.maxAboveLevel above your level's pay. */
export function giveRaise(state: LifeState, share: number, content: ContentBundle): void {
  const job = state.career.job;
  const def = job && content.jobs[job.jobId];
  if (!job || !def || share <= 0) return;
  const cap = wholeDollars(levelPay(state, def, job.level, content) * (1 + content.balance.careers.raises.maxAboveLevel));
  job.salary = Math.max(job.salary, Math.min(cap, wholeDollars(job.salary * (1 + share))));
}

/** You can ask for a raise: a year in, not asked yet this year, and a boss to ask. */
export function canAskRaise(state: LifeState): boolean {
  const job = state.career.job;
  if (!job || state.currentYear <= job.since || job.raiseYear === state.currentYear) return false;
  const boss = currentBoss(state);
  return boss !== null && state.relationships[boss]!.status === 'active';
}

/** You can retire: old enough, and not retired already. */
export function canRetire(state: LifeState, content: ContentBundle): boolean {
  return state.character.age >= content.balance.careers.retireAge && !state.career.retired;
}

/** You retire: your job ends (or, without one, you simply stop looking), and gig work stops. */
export function retire(state: LifeState, content: ContentBundle): void {
  state.career.gig = false;
  state.career.retired = true;
  if (state.career.job) endJob(state, 'retired', content);
  else careerHistory(state, 'retired', { years: state.finances.earnings.years }, content);
}

/**
 * Pay this year from a job you lost as it began (fired or laid off at the
 * yearly review): the jobLoss share of its salary, for the months worked
 * before it ended and severance.
 */
export function jobLossPay(state: LifeState, content: ContentBundle): number {
  const shares = content.balance.careers.jobLoss;
  return wholeDollars(
    state.career.history
      .filter((h) => h.toYear === state.currentYear && (h.endedBy === 'fired' || h.endedBy === 'laid_off'))
      .reduce((sum, h) => sum + h.salary * shares[h.endedBy as 'fired' | 'laid_off'], 0),
  );
}

/**
 * After a move: when it took you to another city, your job there ends and
 * the new city's job market opens to you.
 */
export function afterMove(state: LifeState, fromCityId: Id, content: ContentBundle): void {
  if (state.character.cityId === fromCityId) return;
  if (state.career.job) endJob(state, 'moved', content);
  rollOpenings(state, content);
}
