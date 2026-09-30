/**
 * Management actions (docs/technical.md, "Engine API": performAction). An
 * action is taken between years, on a person's page; it records the input
 * and queues a result event through the event engine, which the player
 * resolves with resolveChoice. finishAction then returns the life to
 * 'yearStart'. The events that answer each action are content
 * (registries/actions.yaml); the person acted on is cast as `person`.
 */
import { produce } from 'immer';
import { ACTION_IDS, type ActionId, type ContentBundle, type EventDef } from '../../content/schemas';
import { evaluate } from '../conditions';
import { InvalidInputError } from '../creation/input';
import { PhaseError } from '../life';
import { weightedPick } from '../random';
import { romanceAllowed } from '../relationships';
import { cloneRng } from '../rng';
import type { Id, LifeState } from '../types';
import { RELATIONSHIP_ACTIONS } from './relationships';

export { RELATIONSHIP_ACTIONS } from './relationships';

/** The role a management action's result event casts the person in. */
export const ACTION_ROLE = 'person';

export interface ActionParams {
  personId: Id;
}

export interface AvailableAction {
  id: ActionId;
  /** Can't be undone: the UI asks for confirmation first. */
  irreversible: boolean;
}

function isActionId(value: unknown): value is ActionId {
  return typeof value === 'string' && (ACTION_IDS as readonly string[]).includes(value);
}

/** The action's result events that fit now, with their weights. */
function resultEvents(state: LifeState, actionId: ActionId, personId: Id, content: ContentBundle): (readonly [EventDef, number])[] {
  const cast = { [ACTION_ROLE]: personId };
  const ctx = { cast, roles: 'strict' as const };
  return content.registries.actions.actions[actionId].events.flatMap((id) => {
    const def = content.events[id];
    if (!def || def.retired) return [];
    if (!evaluate(def.requires, state, ctx) || !romanceAllowed(state, def, cast, content)) return [];
    let weight = def.weight.base * content.balance.events.rarityWeight[def.rarity];
    for (const modifier of def.weight.modifiers ?? []) if (evaluate(modifier.if, state, ctx)) weight *= modifier.x;
    return weight > 0 ? [[def, weight] as const] : [];
  });
}

/**
 * True when the action can be taken with this person now: between years, a
 * living person you know, no other action with them this year, the action's
 * own rules, and a result event that fits. Dead people have no actions.
 */
export function isActionAvailable(state: LifeState, actionId: ActionId, personId: Id, content: ContentBundle): boolean {
  if (state.phase !== 'yearStart') return false;
  const rel = state.relationships[personId];
  const person = state.people[personId];
  if (!rel || !person || !person.alive) return false;
  if (rel.lastActionYear === state.currentYear) return false;
  if (!RELATIONSHIP_ACTIONS[actionId].allowed(state, rel, person, content)) return false;
  return resultEvents(state, actionId, personId, content).length > 0;
}

/** Every action that can be taken with this person now, in a fixed order. */
export function availableActions(state: LifeState, personId: Id, content: ContentBundle): AvailableAction[] {
  return ACTION_IDS.filter((id) => isActionAvailable(state, id, personId, content)).map((id) => ({
    id,
    irreversible: RELATIONSHIP_ACTIONS[id].irreversible,
  }));
}

/**
 * Takes a management action: records the input, marks the person as acted
 * on this year, and queues one of the action's result events (picked by
 * weight) as the only pending event, in the 'action' phase. Throws
 * PhaseError outside 'yearStart' and InvalidInputError for an unknown action,
 * bad params, or an action that isn't available.
 */
export function performAction(state: LifeState, actionId: unknown, params: unknown, content: ContentBundle): LifeState {
  if (state.phase !== 'yearStart') throw new PhaseError(`Can't take an action in the "${state.phase}" phase (expected "yearStart").`);
  if (!isActionId(actionId)) throw new InvalidInputError([{ path: 'action', message: `Unknown action "${String(actionId)}".` }]);
  const personId = typeof params === 'object' && params !== null ? (params as { personId?: unknown }).personId : undefined;
  if (typeof personId !== 'string') throw new InvalidInputError([{ path: 'action.personId', message: 'An action needs a personId.' }]);
  if (!isActionAvailable(state, actionId, personId, content)) {
    throw new InvalidInputError([{ path: 'action', message: `"${actionId}" isn't available for "${personId}" now.` }]);
  }
  const options = resultEvents(state, actionId, personId, content);

  return produce(state, (draft) => {
    // A plain generator copy skips Immer's proxy for each draw (as in life.ts).
    draft.rng = cloneRng(state.rng);
    const year = draft.currentYear;
    draft.inputLog.push({ year, kind: 'action', payload: { actionId, params: { personId } } });
    draft.relationships[personId]!.lastActionYear = year;
    const def = weightedPick(draft.rng, options);
    const log = draft.eventLog[def.id];
    draft.eventLog[def.id] = { count: (log?.count ?? 0) + 1, lastYear: year };
    draft.pending = [{ instanceId: `a${year}-${draft.inputLog.length}`, eventId: def.id, cast: { [ACTION_ROLE]: personId } }];
    draft.phase = 'action';
  });
}

/**
 * Closes a management action once its result event is resolved: clears it
 * and returns the life to 'yearStart'. Throws PhaseError outside 'action' and
 * InvalidInputError while the result is still waiting for a choice.
 */
export function finishAction(state: LifeState): LifeState {
  if (state.phase !== 'action') throw new PhaseError(`Can't finish an action in the "${state.phase}" phase (expected "action").`);
  if (state.pending.some((p) => p.resolvedChoiceId === undefined)) {
    throw new InvalidInputError([{ path: 'action', message: 'The action’s result is still waiting for a choice.' }]);
  }
  return produce(state, (draft) => {
    draft.pending = [];
    draft.phase = 'yearStart';
  });
}
