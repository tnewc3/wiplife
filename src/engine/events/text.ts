/** Text context for an event: every cast role, plus the character's age. */
import type { TextContext } from '../text';
import type { Id, LifeState } from '../types';

export function textContext(state: LifeState, cast: Record<string, Id>): TextContext {
  const roles: NonNullable<TextContext['roles']> = {};
  for (const [role, id] of Object.entries(cast)) {
    const person = state.people[id];
    if (person) roles[role] = { name: person.name, pronouns: person.identity.pronouns };
  }
  return { roles, values: { age: state.character.age } };
}

/** Values event text may use besides cast roles. */
export const EVENT_TEXT_VALUES = ['age'] as const;
