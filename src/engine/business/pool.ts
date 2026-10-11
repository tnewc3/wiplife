/** The businesses an event can be about (W3): the ones you own, in id order. */
import type { Id, LifeState } from '../types';

export function businessPool(state: LifeState): Id[] {
  return state.business.items.map((b) => b.id).sort((a, c) => a.localeCompare(c, 'en', { numeric: true }));
}
