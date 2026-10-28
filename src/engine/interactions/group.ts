/**
 * "Spend time with everyone" (U1): the People tab's group interaction. It is the everyday "spend time" interaction (E1)
 * with each person who can have it now, one after another, each through the same engine calls as a single interaction:
 * the same seeded rolls, the same input log (so a replay is exact) and the same diminishing returns per person, so doing
 * it again the same year gains less and less, and a person who has had enough is left out.
 */
import type { ContentBundle } from '../../content/schemas';
import type { Id, LifeState, OutcomeTier } from '../types';
import { isInteractionAvailable } from './availability';
import { closeInteraction, performInteraction } from './perform';

/** The interaction everyone is spent time with. */
export const GROUP_INTERACTION = 'spend_time';

/** What happened with one person. */
export interface GroupTimeRow {
  personId: Id;
  name: string;
  tier: OutcomeTier;
  affection: number;
  trust: number;
}

export interface GroupTimeView {
  /** Who you can spend time with now (everyone who is free to, in your city, and hasn't had enough this year). */
  people: Id[];
  /** The button is enabled: between years, with at least one person. */
  available: boolean;
}

/** Everyone "spend time" is open to now who has not had enough of you this year, closest first. */
function candidates(state: LifeState, content: ContentBundle): Id[] {
  const def = content.interactions[GROUP_INTERACTION];
  if (!def || def.retired) return [];
  return Object.keys(state.relationships)
    .sort()
    .filter((id) => isInteractionAvailable(state, def, id, content) && state.relationships[id]!.interactions?.annoyed !== true)
    .sort((a, b) => state.relationships[b]!.affection - state.relationships[a]!.affection || (a < b ? -1 : 1));
}

export function getGroupTimeView(state: LifeState, content: ContentBundle): GroupTimeView {
  const people = state.pendingInteraction ? [] : candidates(state, content);
  return { people, available: state.phase === 'yearStart' && people.length > 0 };
}

/**
 * Spends time with everyone who can, each as its own interaction. Stops early if a moment opens a choice of its own
 * (that card waits for you, as it would after a single interaction). Returns the new life and one row per person.
 */
export function spendTimeWithEveryone(state: LifeState, content: ContentBundle): { state: LifeState; rows: GroupTimeRow[]; waiting: boolean } {
  const rows: GroupTimeRow[] = [];
  let current = state;
  for (const personId of getGroupTimeView(state, content).people) {
    // A person drops out as the session goes (a bad moment can make them annoyed); check again before each.
    const def = content.interactions[GROUP_INTERACTION]!;
    if (!isInteractionAvailable(current, def, personId, content) || current.relationships[personId]!.interactions?.annoyed === true) continue;
    current = performInteraction(current, { interactionId: GROUP_INTERACTION, personId }, content);
    const card = current.pendingInteraction!;
    const person = current.people[personId]!;
    rows.push({ personId, name: `${person.name.first} ${person.name.last}`, tier: card.tier, affection: card.changes.affection, trust: card.changes.trust });
    if (card.choice && card.choice.chosen === undefined) return { state: current, rows, waiting: true };
    current = closeInteraction(current, content);
  }
  return { state: current, rows, waiting: false };
}

