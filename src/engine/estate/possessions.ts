/**
 * The place E5 possessions pass on in an estate (E2b). Pets, vehicles and
 * homes beyond the one you lived in don't exist yet, so nothing is passed
 * today; E5 fills `passPossessions` in. The settlement calls it once the
 * cash and the home are shared out, with each beneficiary's line, and keeps
 * what it returns in `Settlement.possessions`. The heir conversion
 * (./heir.ts) calls `receivePossessions` for the heir's transfers.
 */
import type { ContentBundle } from '../../content/schemas';
import type { EstateLine, LifeState, PossessionTransfer } from '../types';

/**
 * Decides who receives each possession of the life that ended. E5 reads
 * `life` (its possessions), `lines` (who is inheriting, with their shares)
 * and `content`, and returns one transfer per possession passed on (a pet
 * goes to someone who can look after it, a car to a driver, and so on).
 */
export function passPossessions(_life: LifeState, _lines: readonly EstateLine[], _content: ContentBundle): PossessionTransfer[] {
  return [];
}

/**
 * Moves the transfers made to the heir into the heir's new life (a pet at
 * home, a car in the drive). E5 fills this in; until then there is nothing
 * to receive.
 */
export function receivePossessions(_heir: LifeState, _transfers: readonly PossessionTransfer[], _content: ContentBundle): void {
  // E5: possessions arrive here.
}
