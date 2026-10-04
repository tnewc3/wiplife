/**
 * Presence and household (C1, docs/expansion.md): where the people in your
 * life are, so events only cast someone who could plausibly be there. A
 * person is in your household (a partner who lives with you; your parents,
 * and siblings still under the independence age, while you live with your
 * parents), elsewhere in your city, or in another city. People stay where
 * they live when you move; a partner who lives with you moves with you; an
 * event can move someone away (the moveAway effect).
 */
import type { ContentBundle, EventDef, Presence } from '../content/schemas';
import { evaluate } from './conditions';
import { livesWithYou } from './family/household';
import type { Id, LifeState } from './types';

export type Whereabouts = 'household' | 'city' | 'elsewhere';

/** Where this person is, from where you live. */
export function whereabouts(state: LifeState, personId: Id, content: ContentBundle): Whereabouts {
  const person = state.people[personId];
  const rel = state.relationships[personId];
  const sameCity = person !== undefined && person.cityId === state.character.cityId;
  if (!sameCity) return 'elsewhere';
  if (state.housing.partnerId === personId) return 'household';
  // E2a: children (and a stepchild of the partner who lives with you) in your home.
  if (livesWithYou(state, personId)) return 'household';
  if (state.housing.kind === 'with_parents' && rel && person) {
    if (rel.kind === 'parent' || rel.kind === 'stepparent') return 'household';
    if (rel.kind === 'sibling' && state.currentYear - person.birthYear < content.balance.economy.independenceAge) return 'household';
  }
  return 'city';
}

/** True when this person can fill a role that needs this presence. */
export function fitsPresence(state: LifeState, personId: Id, presence: Presence, content: ContentBundle): boolean {
  if (presence === 'anywhere') return true;
  const where = whereabouts(state, personId, content);
  return presence === 'nearby' ? where !== 'elsewhere' : where === presence;
}

/** True when your partner (dating, engaged or married) lives with you. */
export function livesWithPartner(state: LifeState): boolean {
  return state.housing.partnerId !== undefined && state.people[state.housing.partnerId]?.alive === true;
}

/** The category's contract (C1): the conditions every event of it needs. */
export function categoryContract(def: EventDef, content: ContentBundle) {
  return content.registries.categories.categories[def.category]?.requires;
}

/**
 * What would make this cast event break the consistency rules now: its
 * category contract failing, or someone cast who isn't where the role needs
 * them. Empty when it fits. Used when picking events, when an action queues
 * one, and by the invariants.
 */
export function consistencyProblems(state: LifeState, def: EventDef, cast: Record<string, Id>, content: ContentBundle): string[] {
  const problems: string[] = [];
  const contract = categoryContract(def, content);
  if (contract && !evaluate(contract, state, { cast, roles: 'strict', content })) problems.push(`${def.id}: breaks the "${def.category}" category contract`);
  for (const [role, id] of Object.entries(cast)) {
    const spec = def.cast?.[role];
    if (spec && !fitsPresence(state, id, spec.presence, content)) {
      problems.push(`${def.id}: ${role} must be ${spec.presence} but is ${whereabouts(state, id, content)}`);
    }
  }
  return problems;
}
