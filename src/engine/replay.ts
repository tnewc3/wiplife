/**
 * Replays a life from its input log (docs/technical.md, "Input log and
 * determinism"): every player input is recorded and every random draw comes
 * from the life's seeded generator, so the same log always rebuilds the same
 * life. Steps the engine takes by itself (closing a finished management
 * action, ending a year whose events are all resolved) are applied between
 * inputs, as the app does.
 */
import type { ContentBundle } from '../content/schemas';
import { finishAction, performAction } from './actions';
import type { CreateLifeOptions } from './creation/input';
import { closeInteraction, performInteraction, resolveInteractionChoice } from './interactions/perform';
import { beginYear, createLife, endYear, resolveChoice } from './life';
import { firstUnresolvedEvent } from './selectors';
import type { InputRecord, LifeState } from './types';

/** Finishes what the engine finishes by itself: a resolved management action, a year with every event resolved. */
function settle(state: LifeState, content: ContentBundle): LifeState {
  let current = state;
  if (current.phase === 'action' && firstUnresolvedEvent(current) === null) current = finishAction(current);
  if (current.phase === 'yearEnd') current = endYear(current, content);
  return current;
}

/** Rebuilds a life from its input log. Throws if the log doesn't start with a create input or holds an input that doesn't apply. */
export function replayLife(log: readonly InputRecord[], content: ContentBundle): LifeState {
  const first = log[0];
  if (first?.kind !== 'create') throw new Error('The input log must start with the create input.');
  // E2b: an heir's log starts with a snapshot of the life they began as (the parent's life isn't there to rebuild it from).
  const snapshot = first.payload.snapshot;
  let state: LifeState = first.payload.heir === true && typeof snapshot === 'object' && snapshot !== null
    ? { ...(JSON.parse(JSON.stringify(snapshot)) as LifeState), inputLog: [first] }
    : createLife(first.payload as unknown as CreateLifeOptions, content);
  for (const record of log.slice(1)) {
    state = settle(state, content);
    const p = record.payload;
    switch (record.kind) {
      case 'ageUp':
        state = beginYear(state, content);
        break;
      case 'choice':
        state = resolveChoice(state, String(p.instanceId), String(p.choiceId), content);
        break;
      case 'action':
        state = performAction(state, p.actionId, p.params, content);
        break;
      case 'interact':
        state = performInteraction(state, p, content);
        break;
      case 'interactChoice':
        state = resolveInteractionChoice(state, p.choiceId, content);
        break;
      case 'interactClose':
        state = closeInteraction(state, content);
        break;
      case 'create':
        throw new Error('The input log has a second create input.');
    }
  }
  return settle(state, content);
}
