/**
 * Career (year pipeline step 4). Gig work (Stage 6): deliveries, rides and
 * odd jobs from the gig minimum age, with low, unstable pay and no ladder
 * (docs/design.md, section I), the safety net for anyone without a job.
 * Jobs (Stage 8): the yearly review sets your performance, then checks for a
 * layoff, firing, promotion or raise; your workplace is staffed; and the
 * year's job openings in your city are rolled. Numbers come from
 * src/content/balance/economy.yaml (gig) and careers.yaml; the job rules
 * live in ../career.ts.
 */
import type { ContentBundle } from '../../content/schemas';
import {
  atTop,
  endJob,
  giveRaise,
  inSchool,
  jobLossPay,
  marketStrength,
  promote,
  reviewPerformance,
  rollOpenings,
  staffWorkplace,
  yearsToPromotion,
} from '../career';
import { curveAt } from '../curve';
import { inPostSecondary } from '../education';
import { wholeDollars } from '../finance';
import { chance, nextFloat, type RngState } from '../rng';
import type { LifeState } from '../types';

/** Old enough for gig work, free to do it, and without a job (a job is full-time). */
export function canGig(state: LifeState, content: ContentBundle): boolean {
  return state.character.age >= content.balance.economy.gig.minAge && state.housing.kind !== 'incarcerated' && state.career.job === null;
}

/** A typical year of gig pay for you now: your city's market and your age, before the yearly swing. */
export function expectedGigPay(state: LifeState, content: ContentBundle, age = state.character.age): number {
  const { gig } = content.balance.economy;
  const city = content.cities[state.character.cityId];
  if (!city) return 0;
  return wholeDollars(gig.pay * city.salaryMultiplier * curveAt(gig.market, city.jobMarket.gig) * curveAt(gig.byAge, age));
}

/**
 * This year's gig pay: the typical pay times a random swing (none if you
 * don't do gig work); part-time around college, trade school or grad school.
 */
export function gigPay(state: LifeState, content: ContentBundle, rng: RngState): number {
  if (!state.career.gig || !canGig(state, content)) return 0;
  const { swing } = content.balance.economy.gig;
  const share = inPostSecondary(state) ? content.balance.education.studentGigShare : 1;
  return wholeDollars(expectedGigPay(state, content) * share * (swing.min + nextFloat(rng) * (swing.max - swing.min)));
}

/**
 * This year's gross income: your salary, pay from a job lost as the year
 * began (careers.yaml jobLoss), and gig pay. Draws from the life's generator.
 */
export function yearIncome(state: LifeState, content: ContentBundle): number {
  return wholeDollars((state.career.job?.salary ?? 0) + jobLossPay(state, content) + gigPay(state, content, state.rng));
}

/**
 * The yearly review, after a full year worked: performance, then a layoff
 * (by the city's job market), firing (by performance), a promotion (by
 * performance and Ambition, once you've been at the level long enough) or
 * else a merit raise.
 */
function review(state: LifeState, content: ContentBundle): void {
  const job = state.career.job!;
  const def = content.jobs[job.jobId];
  if (!def) return;
  const b = content.balance.careers;
  job.yearsAtLevel += 1;
  job.performance = reviewPerformance(state, def, content);
  if (chance(state.rng, curveAt(b.layoffs, marketStrength(state, def, content)))) {
    endJob(state, 'laid_off', content);
    return;
  }
  if (chance(state.rng, curveAt(b.firing, job.performance))) {
    endJob(state, 'fired', content);
    return;
  }
  const eligible = !atTop(state, content) && job.yearsAtLevel >= yearsToPromotion(def, job.level, content);
  const odds = curveAt(b.promotion.chance, job.performance) * curveAt(b.promotion.ambition, state.character.personality.ambition);
  if (eligible && chance(state.rng, odds)) promote(state, content);
  else giveRaise(state, curveAt(b.raises.merit, job.performance), content);
}

/** Step 4: gig work you can no longer do stops; your job's yearly review; the year's openings. */
export function runCareer(state: LifeState, content: ContentBundle): void {
  const c = state.career;
  c.applied = [];
  if (c.gig && !canGig(state, content)) c.gig = false;
  if (c.job) {
    // Still in school as the year begins (a new program, or held back): you leave work for it.
    if (inSchool(state)) endJob(state, 'quit', content, 'leftForSchool');
    // Reviewed once you've worked a full year (hired last year or earlier, paid from the year after).
    else if (state.currentYear - c.job.since >= 2) review(state, content);
    if (c.job) staffWorkplace(state, content, false);
  }
  rollOpenings(state, content);
}
