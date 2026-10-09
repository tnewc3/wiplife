/**
 * Queues the events the sports step asks for (registries/sports.yaml): one is
 * picked by weight among those whose requirements fit now, unless one of them
 * is already queued for the same year. Every event listed there is
 * followUpOnly, so it only happens this way.
 */
import type { ContentBundle, SportsTrigger } from '../../content/schemas';
import { eventWeight } from '../events/selection';
import { weightedPick } from '../random';
import type { Id, LifeState } from '../types';

export function queueSportsEvent(state: LifeState, trigger: SportsTrigger, content: ContentBundle, cast: Record<string, Id> = {}, dueYear = state.currentYear): boolean {
  const ids = content.registries.sports.triggers[trigger].events;
  const options = ids.flatMap((id) => {
    const def = content.events[id];
    if (!def || def.retired) return [];
    const weight = eventWeight(state, def, content);
    return weight > 0 ? [[def, weight] as const] : [];
  });
  if (options.length === 0) return false;
  if (state.scheduled.some((s) => ids.includes(s.eventId) && s.dueYear === dueYear)) return false;
  const def = weightedPick(state.rng, options);
  state.scheduled.push({ eventId: def.id, dueYear, cast });
  return true;
}
