/**
 * Career (year pipeline step 4). Stage 6 adds gig work, the first income
 * source: deliveries, rides and odd jobs from the gig minimum age, with low,
 * unstable pay and no ladder (docs/design.md, section I). Jobs, performance,
 * promotions and firing arrive in Stage 8. Numbers come from
 * src/content/balance/economy.yaml (gig).
 */
import type { ContentBundle } from '../../content/schemas';
import { curveAt } from '../curve';
import { wholeDollars } from '../finance';
import { nextFloat, type RngState } from '../rng';
import type { LifeState } from '../types';

/** Old enough for gig work, and free to do it. */
export function canGig(state: LifeState, content: ContentBundle): boolean {
  return state.character.age >= content.balance.economy.gig.minAge && state.housing.kind !== 'incarcerated';
}

/** A typical year of gig pay for you now: your city's market and your age, before the yearly swing. */
export function expectedGigPay(state: LifeState, content: ContentBundle, age = state.character.age): number {
  const { gig } = content.balance.economy;
  const city = content.cities[state.character.cityId];
  if (!city) return 0;
  return wholeDollars(gig.pay * city.salaryMultiplier * curveAt(gig.market, city.jobMarket.gig) * curveAt(gig.byAge, age));
}

/** This year's gig pay: the typical pay times a random swing (none if you don't do gig work). */
export function gigPay(state: LifeState, content: ContentBundle, rng: RngState): number {
  if (!state.career.gig || !canGig(state, content)) return 0;
  const { swing } = content.balance.economy.gig;
  return wholeDollars(expectedGigPay(state, content) * (swing.min + nextFloat(rng) * (swing.max - swing.min)));
}

/** This year's gross income: salary (from Stage 8) plus gig pay. Draws from the life's generator. */
export function yearIncome(state: LifeState, content: ContentBundle): number {
  return wholeDollars((state.career.job?.salary ?? 0) + gigPay(state, content, state.rng));
}

/**
 * Step 4: set performance, then check for promotion, raise or firing (Stage
 * 8). For now it only stops gig work you can no longer do.
 */
export function runCareer(state: LifeState, content: ContentBundle): void {
  if (state.career.gig && !canGig(state, content)) state.career.gig = false;
}
