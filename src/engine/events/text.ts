/**
 * Text context for an event: every cast role, you as `self` (your name and
 * pronouns, for what others say about you), and the values event text may use.
 */
import type { ContentBundle } from '../../content/schemas';
import { discoveryValues } from '../discovery';
import { sentenceText } from '../legal';
import type { TextContext } from '../text';
import type { Id, LifeState } from '../types';

/** The role that is always you in event text (Stage 9): {self.they}, {self.name}. Never a cast role. */
export const SELF_ROLE = 'self';

export function textContext(state: LifeState, cast: Record<string, Id>, content: ContentBundle): TextContext {
  const c = state.character;
  const roles: NonNullable<TextContext['roles']> = { [SELF_ROLE]: { name: c.name, pronouns: c.identity.pronouns } };
  for (const [role, id] of Object.entries(cast)) {
    const person = state.people[id];
    if (person) roles[role] = { name: person.name, pronouns: person.identity.pronouns };
  }
  return { roles, values: { age: c.age, ...discoveryValues(state, content), sentence: sentenceText(state, content) } };
}

/**
 * Values event text may use besides cast roles: {age}; (Stage 9) {talent}
 * (your hidden talent, "music"), {latentPeople}, {latentGender},
 * {latentExpression} and {latentTrait} (a latent trait, in words; your
 * current one without a latent trait), and {sentence} (what a court just
 * handed down, "two years in prison"; only in an outcome with a legal effect).
 */
export const EVENT_TEXT_VALUES = ['age', 'talent', 'latentPeople', 'latentGender', 'latentExpression', 'latentTrait', 'sentence'] as const;
