/**
 * Career and money for the people you know (E3). The same rules your own
 * work follows, as a summary: the firing, layoff and promotion odds come from
 * balance/careers.yaml, pay from the job tracks, and a job's pay sets their
 * wealth level (E1) the way it does for anyone you meet. They have no
 * performance record, so a year's performance is rolled each year.
 */
import { curveAt } from '../curve';
import { blendWealth, WEALTH_LEVELS, wealthFromSalary } from '../interactions/wealth';
import { clampInt, rollNormal, rollScore, weightedPick } from '../random';
import { chance, nextFloat, pick, type RngState } from '../rng';
import type { ContentBundle, PeopleBalance } from '../../content/schemas';
import type { FamilyWealth, Person } from '../types';
import { isJailed, jobTracks, withArticle } from './model';
import { ask, say, type Ctx, type Subject } from './subject';

/** The wealth level their job and background point to. */
function wealthFor(ctx: Ctx, s: Subject, jobId: string, level: number): void {
  const def = ctx.content.jobs[jobId];
  const pay = def?.levels[Math.min(def.levels.length, Math.max(1, level)) - 1]?.salary;
  if (pay !== undefined) s.wealth = blendWealth(wealthFromSalary(pay, ctx.content), s.life.background, ctx.content);
}

/** A track for them to take: its starting pay near their wealth, and degrees only for the sharp. */
function pickTrack(rng: RngState, content: ContentBundle, bal: PeopleBalance, wealth: FamilyWealth, smarts: number, age: number) {
  const here = WEALTH_LEVELS.indexOf(wealth);
  const options = jobTracks(content).map((t) => {
    const needsDegree = t.def.requires !== undefined;
    const sharp = smarts >= bal.career.credentialSmarts && age >= 22;
    const gap = Math.abs(WEALTH_LEVELS.indexOf(t.entryWealth) - here);
    return [t, needsDegree && !sharp ? 0 : (bal.career.trackFit[Math.min(bal.career.trackFit.length - 1, gap)] ?? 0)] as const;
  });
  return weightedPick(rng, options);
}

export interface NewJob {
  jobId: string;
  level: number;
  employer: string;
  /** With its article ("an electrician"). */
  title: string;
  /** The wealth level the job and their background point to. */
  wealth: FamilyWealth;
}

/** Finds someone a job: a track that suits them, at a level that suits their age (draws from `rng`). */
export function rollJob(rng: RngState, content: ContentBundle, bal: PeopleBalance, person: Person, wealth: FamilyWealth, background: FamilyWealth, age: number): NewJob {
  const c = bal.career;
  const track = pickTrack(rng, content, bal, wealth, person.smarts, age);
  const level = clampInt(Math.round(rollNormal(rng, { mean: curveAt(c.hireLevel, age), sd: c.hireLevelSd })), 1, track.def.levels.length);
  const pay = track.def.levels[level - 1]!.salary;
  return {
    jobId: track.id,
    level,
    employer: pick(rng, track.def.employers),
    title: withArticle(track.def.levels[level - 1]!.title),
    wealth: blendWealth(wealthFromSalary(pay, content), background, content),
  };
}

/** Hires them into a job. */
function hire(ctx: Ctx, s: Subject, key: 'hired' | 'switched'): void {
  const job = rollJob(ctx.state.rng, ctx.content, ctx.bal, s.person, s.wealth, s.life.background, s.age);
  s.occupation = job.jobId;
  s.life.level = job.level;
  s.life.levelSince = ctx.year;
  delete s.life.jobLost;
  s.wealth = job.wealth;
  say(ctx, s, key, { title: job.title, employer: job.employer });
}

/** Losing a job costs them a wealth level at most. */
function lose(ctx: Ctx, s: Subject, how: 'fired' | 'laid_off', title: string): void {
  s.occupation = undefined;
  s.life.level = 0;
  s.life.jobLost = { year: ctx.year, how };
  const dropped = blendWealth(ctx.bal.career.unemployedWealth, s.life.background, ctx.content);
  const floor = Math.max(0, WEALTH_LEVELS.indexOf(s.wealth) - 1);
  s.wealth = WEALTH_LEVELS[Math.max(WEALTH_LEVELS.indexOf(dropped), floor)]!;
  say(ctx, s, how, { title: withArticle(title) }, 'jobLoss');
  ask(ctx, s, 'jobLoss');
}

/** The career step for one person: working people may retire, lose the job, move up or change track; the rest may find work. */
export function careerStep(ctx: Ctx, s: Subject): void {
  const careers = ctx.content.balance.careers;
  const c = ctx.bal.career;
  const rng = ctx.state.rng;
  if (s.age < careers.minAge || isJailed(s.life) || s.life.retired) return;

  if (s.occupation === undefined) {
    if (chance(rng, curveAt(c.hire, s.age))) hire(ctx, s, 'hired');
    return;
  }
  const def = ctx.content.jobs[s.occupation];
  if (!def) {
    s.occupation = undefined;
    s.life.level = 0;
    return;
  }
  if (s.life.level < 1) s.life.level = 1;
  const title = def.levels[Math.min(def.levels.length, s.life.level) - 1]!.title;

  if (chance(rng, curveAt(c.retire, s.age))) {
    s.occupation = undefined;
    s.life.level = 0;
    s.life.retired = true;
    say(ctx, s, 'retired');
    return;
  }

  // One roll decides between being let go (firing, then layoffs) and carrying on.
  const performance = rollScore(rng, c.performance);
  const fired = curveAt(careers.firing, performance);
  const laidOff = curveAt(careers.layoffs, c.market);
  const roll = nextFloat(rng);
  if (roll < fired) return lose(ctx, s, 'fired', title);
  if (roll < fired + laidOff) return lose(ctx, s, 'laid_off', title);

  const years = ctx.year - s.life.levelSince;
  const needs = def.levels[s.life.level - 1]?.years ?? careers.promotion.minYears;
  if (s.life.level < def.levels.length && years >= needs) {
    const ambition = s.person.traits.ambition ?? 50;
    if (chance(rng, curveAt(careers.promotion.chance, performance) * curveAt(careers.promotion.ambition, ambition))) {
      s.life.level += 1;
      s.life.levelSince = ctx.year;
      wealthFor(ctx, s, s.occupation, s.life.level);
      const next = def.levels[s.life.level - 1]!.title;
      say(ctx, s, 'promoted', { title: withArticle(next) }, 'promotion');
      ask(ctx, s, 'promotion');
      return;
    }
  }
  if (chance(rng, curveAt(c.switch, s.age))) hire(ctx, s, 'switched');
}
