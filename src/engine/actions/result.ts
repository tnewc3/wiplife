/**
 * Result events of management actions: the events that answer an action
 * (registries/actions.yaml for people, registries/work.yaml for work), the
 * ones that fit now, and queuing the one picked as the only pending event,
 * in the 'action' phase. ./index.ts and ./career.ts use these.
 */
import type { ContentBundle, EventDef } from '../../content/schemas';
import { evaluate } from '../conditions';
import { weightedPick } from '../random';
import { romanceAllowed } from '../relationships';
import type { Id, LifeState } from '../types';

/** The listed events that fit now with this cast, with their weights. */
export function fittingResults(state: LifeState, eventIds: readonly Id[], cast: Record<string, Id>, content: ContentBundle): (readonly [EventDef, number])[] {
  const ctx = { cast, roles: 'strict' as const };
  return eventIds.flatMap((id) => {
    const def = content.events[id];
    if (!def || def.retired) return [];
    if (!evaluate(def.requires, state, ctx) || !romanceAllowed(state, def, cast, content)) return [];
    let weight = def.weight.base * content.balance.events.rarityWeight[def.rarity];
    for (const modifier of def.weight.modifiers ?? []) if (evaluate(modifier.if, state, ctx)) weight *= modifier.x;
    return weight > 0 ? [[def, weight] as const] : [];
  });
}

/**
 * Picks one of the options (by weight, from the life's generator) and queues
 * it as the only pending event, in the 'action' phase. Call after the input
 * is recorded.
 */
export function queueResult(state: LifeState, options: readonly (readonly [EventDef, number])[], cast: Record<string, Id>): void {
  const year = state.currentYear;
  const def = weightedPick(state.rng, options);
  const log = state.eventLog[def.id];
  state.eventLog[def.id] = { count: (log?.count ?? 0) + 1, lastYear: year };
  state.pending = [{ instanceId: `a${year}-${state.inputLog.length}`, eventId: def.id, cast }];
  state.phase = 'action';
}
