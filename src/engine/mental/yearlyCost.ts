/** The yearly cost of therapy and medication (M1): medical costs, through ../health.ts payMedical. */
import type { ContentBundle } from '../../content/schemas';
import { payMedical } from '../health';
import type { LifeState } from '../types';
import { careCost } from './care';
import { careOf } from './query';

/** Pays this year's therapy (once, however many conditions it covers) and each condition's medication. */
export function payMentalCostYear(state: LifeState, content: ContentBundle): void {
  const held = state.health.conditions;
  if (held.some((c) => careOf(c).includes('therapy'))) payMedical(state, careCost(state, 'therapy', 'yearly', content), content);
  for (const c of held) if (careOf(c).includes('medication')) payMedical(state, careCost(state, 'medication', 'yearly', content), content);
}
