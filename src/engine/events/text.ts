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

/** How long ago `since` was, in words ("two years"); "a while" without one (C1). */
export function sinceText(state: LifeState, since: number | undefined, content: ContentBundle): string {
  const t = content.text.time;
  if (since === undefined) return t.since.unknown;
  const years = Math.max(1, state.currentYear - since);
  return years === 1 ? t.since.one : t.since.many.replace('{n}', t.numbers[years] ?? String(years));
}

/** `since`: for a follow-up, the year the event that scheduled it happened ({since}). */
export function textContext(state: LifeState, cast: Record<string, Id>, content: ContentBundle, since?: number): TextContext {
  const c = state.character;
  const roles: NonNullable<TextContext['roles']> = { [SELF_ROLE]: { name: c.name, pronouns: c.identity.pronouns } };
  for (const [role, id] of Object.entries(cast)) {
    const person = state.people[id];
    if (person) roles[role] = { name: person.name, pronouns: person.identity.pronouns };
  }
  return { roles, values: { age: c.age, ...discoveryValues(state, content), sentence: sentenceText(state, content), since: sinceText(state, since, content) } };
}

/**
 * Values event text may use besides cast roles: {age}; (Stage 9) {talent}
 * (your hidden talent, "music"), {latentPeople}, {latentGender},
 * {latentExpression} and {latentTrait} (a latent trait, in words; your
 * current one without a latent trait), and {sentence} (what a court just
 * handed down, "two years in prison"; only in an outcome with a legal effect);
 * (C1) {since}, how long ago the event that scheduled a follow-up happened
 * ("two years"; only in follow-ups).
 */
export const EVENT_TEXT_VALUES = ['age', 'talent', 'latentPeople', 'latentGender', 'latentExpression', 'latentTrait', 'sentence', 'since'] as const;
