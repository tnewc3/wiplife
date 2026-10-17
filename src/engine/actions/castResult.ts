/**
 * A result event that casts someone: the "Find a date" action (B1) and the
 * Activities (Batch 2a) answer with one of a list of events, picked at random,
 * cast through the existing casting (a new acquaintance or potential partner
 * in your city, whoever the event asks for) and queued as the only pending
 * event. If the pick can't be cast, or doesn't fit now, nothing is queued and
 * whoever was created for it is removed again.
 */
import type { ContentBundle } from '../../content/schemas';
import { evaluate, rolesIn } from '../conditions';
import { castEvent, uncast } from '../events/casting';
import { consistencyProblems } from '../presence';
import { romanceAllowed } from '../relationships';
import { pick } from '../rng';
import type { Id, LifeState } from '../types';
import { queueResult } from './result';

/** Tries one of these events (picked at random); returns true when it was queued. */
export function tryQueueCastEvent(state: LifeState, eventIds: readonly Id[], content: ContentBundle): boolean {
  // An event that can't fit whoever is cast (it asks only about you, and that fails now) is left out of the pick.
  const options = eventIds
    .map((id) => content.events[id])
    .filter((d) => d !== undefined && !d.retired && (rolesIn(d.requires).length > 0 || evaluate(d.requires, state, { cast: {}, roles: 'strict', content })));
  if (options.length === 0) return false;
  const def = pick(state.rng, options)!;
  const cast = castEvent(state, def, state.rng, content);
  if (!cast) return false;
  if (evaluate(def.requires, state, { cast: cast.cast, roles: 'strict', content }) && romanceAllowed(state, def, cast.cast, content) && consistencyProblems(state, def, cast.cast, content).length === 0) {
    queueResult(state, [[def, 1]], cast.cast);
    return true;
  }
  uncast(state, cast.created);
  return false;
}
