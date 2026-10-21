import type { ContentBundle } from '../../content/schemas';
import { isIndependent } from '../finance';
import type { LifeState } from '../types';

/** Whether you can pay a cost out of savings; a minor's family pays what they cannot, so a minor always can. */
export function canAffordCost(state: LifeState, cost: number, content: ContentBundle): boolean {
  return !isIndependent(state, content) || state.finances.savings >= cost;
}
