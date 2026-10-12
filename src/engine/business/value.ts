/**
 * What your businesses add to your net worth (W3): your share of each one's
 * value, kept on the life as `business.worth` so net worth can be read without
 * the content. It is refreshed whenever a business changes: in the yearly step
 * and in every action that starts, buys, sells, closes or reshapes one.
 */
import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';
import { valuation } from './model';
import { yourShare } from './query';

/** Recomputes the worth of your share of every business. */
export function refreshWorth(state: LifeState, content: ContentBundle): void {
  let total = 0;
  for (const b of state.business.items) total += (valuation(b, content) * yourShare(b)) / 100;
  state.business.worth = Math.round(total * content.balance.business.netWorthShare);
}

/** Your businesses' worth for net worth (as of the last change). */
export const businessValue = (state: LifeState): number => state.business.worth;
