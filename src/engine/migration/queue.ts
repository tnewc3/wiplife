/** Queuing the events the migration step and its actions answer with (registries/immigration.yaml). */
import type { ContentBundle } from '../../content/schemas';
import { eventWeight } from '../events/selection';
import { fittingResults, queueResult } from '../actions/result';
import { weightedPick } from '../random';
import type { Id, LifeState } from '../types';

/** Queues one of the events that fits now, by weight, for this year's events (unless one of them is already waiting). */
export function queueEvent(state: LifeState, ids: readonly Id[], content: ContentBundle): boolean {
  const options = ids.flatMap((id) => {
    const def = content.events[id];
    if (!def || def.retired) return [];
    const weight = eventWeight(state, def, content);
    return weight > 0 ? [[def, weight] as const] : [];
  });
  if (options.length === 0) return false;
  if (state.scheduled.some((s) => ids.includes(s.eventId) && s.dueYear <= state.currentYear)) return false;
  const def = weightedPick(state.rng, options);
  state.scheduled.push({ eventId: def.id, dueYear: state.currentYear, cast: {} });
  return true;
}

/**
 * The receipt that answers an action: an automatic, cast-free event shown at once (the 'action' phase), with the
 * amount spent and the new balance. The registry's first event always fits.
 */
export function queueReceipt(state: LifeState, ids: readonly Id[], cost: number, content: ContentBundle): void {
  const options = fittingResults(state, ids, {}, content);
  queueResult(state, options, {});
  state.pending[0]!.money = { change: -cost, balance: state.finances.savings, debtChange: 0 };
}
