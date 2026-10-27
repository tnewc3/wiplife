/**
 * The looks step (P1): sets down the look of everyone who has none yet (people who joined your life since the last year, and
 * saves from before portraits). It draws nothing from the life's own random stream.
 */
import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';
import { personLook, yourLook } from './query';

export function runLooks(state: LifeState, content: ContentBundle): void {
  const ids = Object.keys(state.people).sort();
  // A person's parents' looks are worked out from the same seed, so the order cannot change anyone's look.
  if (!state.character.look) state.character.look = yourLook(state, content);
  for (const id of ids) {
    const person = state.people[id]!;
    if (!person.look) person.look = personLook(state, id, content);
  }
}
