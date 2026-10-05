/**
 * Text context for an event: every cast role, you as `self` (your name and
 * pronouns, for what others say about you), and the values event text may use.
 */
import type { ContentBundle } from '../../content/schemas';
import { discoveryValues } from '../discovery';
import { sentenceText } from '../legal';
import { lifeTextRole } from '../lives/model';
import { heardFor } from '../web/knowledge';
import { ITEM_ROLE } from '../web/query';
import { castPossession, possessionNoun } from '../possessions/query';
import type { TextContext } from '../text';
import type { Id, LifeState, Pronouns } from '../types';

/** A pet is "it" in text: events name it by name, and use these where a pronoun reads naturally. */
const IT: Pronouns = { subject: 'it', object: 'it', possessive: 'its', possessivePronoun: 'its', reflexive: 'itself', verbPlural: false };

/** The role that is always you in event text (Stage 9): {self.they}, {self.name}. Never a cast role. */
export const SELF_ROLE = 'self';

/** When `since` was, in words ("last year", "two years ago"); "a while ago" without one (C1). */
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
    // E5: the possessions an event is about are not people; they are named below.
    if (role.startsWith('@')) continue;
    const person = state.people[id];
    // E3: and the facts of their own life ({npc.relation}, {npc.partner}, {npc.city}, {npc.job}).
    if (person) roles[role] = lifeTextRole(state, id, content) ?? { name: person.name, pronouns: person.identity.pronouns };
  }
  // E4: what the person in the story has heard about you (the item the event or interaction is about).
  const holderId = cast.npc ?? cast.person;
  const heard = holderId === undefined ? '' : heardFor(state, holderId, cast[ITEM_ROLE], content);
  // E5: a bound pet is the role `pet` ({pet.name}); a bound vehicle and vacation home give {vehicle}, {homeCity}, and a pet's species {petKind}.
  const values: Record<string, string | number> = { age: c.age, ...discoveryValues(state, content), sentence: sentenceText(state, content), since: sinceText(state, since, content), heard };
  const pet = castPossession(state, cast, 'pet', 'pet');
  if (pet) {
    roles.pet = { name: { first: pet.name ?? '', last: '' }, pronouns: IT };
    values.petKind = possessionNoun(pet, content);
  }
  const vehicle = castPossession(state, cast, 'vehicle', 'vehicle');
  if (vehicle) values.vehicle = possessionNoun(vehicle, content);
  const home = castPossession(state, cast, 'home', 'home');
  if (home) values.homeCity = possessionNoun(home, content);
  return { roles, values };
}

/**
 * Values event text may use besides cast roles: {age}; (Stage 9) {talent}
 * (your hidden talent, "music"), {latentPeople}, {latentGender},
 * {latentExpression} and {latentTrait} (a latent trait, in words; your
 * current one without a latent trait), and {sentence} (what a court just
 * handed down, "two years in prison"; only in an outcome with a legal effect);
 * (C1) {since}, how long ago the event that scheduled a follow-up happened
 * ("last year", "two years ago"; only in follow-ups); (E4) {heard}, what the
 * person in the story (npc or person) has heard about you, as a phrase ("that
 * you were fired for stealing"; only where the event requires that they have).
 */
export const EVENT_TEXT_VALUES = ['age', 'talent', 'latentPeople', 'latentGender', 'latentExpression', 'latentTrait', 'sentence', 'since', 'heard'] as const;
/** E5: values an event may use only when it binds the possession: a pet's species, a vehicle's name, a vacation home's city. */
export const POSSESSION_TEXT_VALUES = { pet: ['petKind'], vehicle: ['vehicle'], home: ['homeCity'] } as const;

/**
 * E5: a possession an effect removed (a pet that died, a car that was stolen)
 * is still named in the outcome that did it: its text is taken from the
 * context made before the effects ran.
 */
export function keepPossessionText(after: TextContext, before: TextContext): TextContext {
  const roles = { ...after.roles };
  const values = { ...after.values };
  if (roles.pet === undefined && before.roles?.pet !== undefined) roles.pet = before.roles.pet;
  for (const key of ['petKind', 'vehicle', 'homeCity'] as const) {
    const was = before.values?.[key];
    if (values[key] === undefined && was !== undefined) values[key] = was;
  }
  return { roles, values };
}
