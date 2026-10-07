/**
 * Teen jobs (T1): part-time work around school (src/content/teenJobs). The
 * pay is earned income through the yearly ledger (yearIncome adds it), with
 * the hours costing grades. It is not the gig economy (16+, no employer) and
 * not a career job (18+): starting one stops gig work. Numbers: balance/teen.yaml (jobs).
 */
import type { ContentBundle, TeenJobDef } from '../../content/schemas';
import { curveAt } from '../curve';
import { scoreOf } from '../events/checks';
import { wholeDollars } from '../finance';
import { applyStatEffects } from '../systems/economy';
import { chance, nextFloat, pick } from '../rng';
import type { LifeState } from '../types';
import { teenHistory } from './cliques';
import { focusOf, hasLicense, inTeenYears, myClique, ruleOf } from './query';
import { cliqueDef } from './query';

export type JobBlock = 'age' | 'unknown' | 'have' | 'needs' | 'license' | 'away' | 'adult';

/** An active teen job, or undefined. */
export function teenJobDef(content: ContentBundle, id: string): TeenJobDef | undefined {
  const def = content.teenJobs[id];
  return def && !def.retired ? def : undefined;
}

/** Why you can't take this job now, or null. */
export function jobBlock(state: LifeState, jobId: string, content: ContentBundle): JobBlock | null {
  const def = teenJobDef(content, jobId);
  if (!def) return 'unknown';
  if (state.housing.kind === 'incarcerated') return 'away';
  if (state.character.age >= content.balance.relationships.adultAge) return 'adult';
  if (state.character.age < def.minAge) return 'age';
  if (state.teen.job) return 'have';
  if (def.needsLicense && !hasLicense(state)) return 'license';
  for (const [key, min] of Object.entries(def.needs)) if (scoreOf(state, key as Parameters<typeof scoreOf>[1]) < (min ?? 0)) return 'needs';
  return null;
}

/** A job you could be offered by an event: the same rules as the Teen screen. */
export function hireJob(state: LifeState, jobId: string, content: ContentBundle): boolean {
  if (jobBlock(state, jobId, content) !== null) return false;
  const def = teenJobDef(content, jobId)!;
  const employer = pick(state.rng, def.employers);
  state.teen.job = { jobId, employer, since: state.currentYear };
  // One source of part-time work: a teen job replaces gig work.
  state.career.gig = false;
  teenHistory(state, 'jobStarted', { job: def.name, employer }, content);
  return true;
}

/** You leave your teen job (or it ends). */
export function endTeenJob(state: LifeState, content: ContentBundle): boolean {
  const job = state.teen.job;
  if (!job) return false;
  const def = content.teenJobs[job.jobId];
  state.teen.job = null;
  teenHistory(state, 'jobEnded', { job: def?.name ?? 'job', employer: job.employer }, content);
  return true;
}

/** The share of your pay that is left to you after the rule at home about earnings. */
export function keptShare(state: LifeState, content: ContentBundle): number {
  const rule = ruleOf(state, 'money');
  return rule ? 1 - (content.balance.teen.jobs.parentShare[rule.level] ?? 0) : 1;
}

/** A typical year of pay for a job in your city now, before the yearly swing. */
export function expectedJobPay(state: LifeState, def: TeenJobDef, content: ContentBundle): number {
  const j = content.balance.teen.jobs;
  const city = content.cities[state.character.cityId];
  const crowd = myClique(state);
  const crowdMoney = crowd ? (cliqueDef(content, crowd.defId)?.money ?? 1) : 1;
  const focus = content.balance.teen.focus[focusOf(state)].income;
  return wholeDollars(def.hours * j.weeks * def.wage * (city?.salaryMultiplier ?? 1) * focus * crowdMoney * keptShare(state, content));
}

/**
 * This year's teen income: your job's pay (a typical year times a small swing)
 * and, with a focus on work and no job of your own, odd jobs. Draws from the
 * life's generator only when you earn it.
 */
export function teenIncome(state: LifeState, content: ContentBundle): number {
  if (state.character.age >= content.balance.relationships.adultAge || state.housing.kind === 'incarcerated') return 0;
  const j = content.balance.teen.jobs;
  const job = state.teen.job;
  const def = job && content.teenJobs[job.jobId];
  if (def) return wholeDollars(expectedJobPay(state, def, content) * (1 - j.swing + nextFloat(state.rng) * 2 * j.swing));
  if (focusOf(state) === 'work' && state.character.age >= content.balance.teen.ages.from + 1) {
    const city = content.cities[state.character.cityId];
    return wholeDollars(content.balance.teen.focus.work.odd * (city?.salaryMultiplier ?? 1) * (1 - j.swing + nextFloat(state.rng) * 2 * j.swing));
  }
  return 0;
}

/** The yearly part of a teen job: its stat pulls, the grades its hours cost, and the chance it ends. */
export function runJob(state: LifeState, content: ContentBundle): void {
  const job = state.teen.job;
  if (!job) return;
  const def = content.teenJobs[job.jobId];
  if (!def || !inTeenYears(state, content) || state.housing.kind === 'incarcerated' || (def.needsLicense && !hasLicense(state))) {
    endTeenJob(state, content);
    return;
  }
  const j = content.balance.teen.jobs;
  applyStatEffects(state, def.effects);
  const cur = state.education.current;
  if (cur) cur.boost -= Math.max(0, def.hours - j.freeHours) * j.gradePerHour;
  if (state.currentYear > job.since && chance(state.rng, curveAt(j.endChance, state.character.personality.discipline))) endTeenJob(state, content);
}
