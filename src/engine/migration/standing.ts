/** W6: the permit record ends when you are back in a country whose citizen you are. Kept apart so housing can use it without a cycle. */
import type { LifeState } from '../types';

export function endSettledStanding(state: LifeState): void {
  if (state.travel.residence?.settled) state.travel.residence = null;
  state.migration.arrivedYear = null;
  state.migration.undocumented = null;
  state.migration.application = null;
}
