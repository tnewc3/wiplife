/**
 * Which interactions can be done with a person now (E1): the right
 * relationship kind and status, ages, city for in-person ones, alive, not
 * blocked by prison (only visit-style ones from inside), and the adults-only
 * rule for romance, which the engine enforces whatever the content says.
 */
import type { ContentBundle, InteractionDef, InteractionGroup } from '../../content/schemas';
import { INTERACTION_GROUPS } from '../../content/schemas';
import { evaluate } from '../conditions';
import { whereabouts } from '../presence';
import { ageOf, bothAdults, isCurrentPartner, isFamilyKind, isPartnerKind, mutualAttraction } from '../relationships';
import type { Id, LifeState } from '../types';

/** The role the person is cast in for an interaction's text and conditions. */
export const INTERACTION_ROLE = 'person';

function inRange(age: number, range: { min?: number | undefined; max?: number | undefined }): boolean {
  return (range.min === undefined || age >= range.min) && (range.max === undefined || age <= range.max);
}

/** The interactions in the content, active ones, in id order. */
export function activeInteractions(content: ContentBundle): InteractionDef[] {
  return Object.keys(content.interactions)
    .sort()
    .map((id) => content.interactions[id]!)
    .filter((def) => !def.retired);
}

/**
 * True when this interaction can be done with this person right now: between
 * years, a living person you know, the interaction's own rules, and for
 * romance both of you adults, not family, and (outside a current romance)
 * attraction both ways.
 */
export function isInteractionAvailable(state: LifeState, def: InteractionDef, personId: Id, content: ContentBundle): boolean {
  if (state.phase !== 'yearStart') return false;
  const rel = state.relationships[personId];
  const person = state.people[personId];
  if (!rel || !person || !person.alive || def.retired) return false;
  const a = def.availability;
  if (!a.kinds.includes(rel.kind) || !a.status.includes(rel.status)) return false;
  if (!inRange(state.character.age, a.you) || !inRange(ageOf(state, person), a.them)) return false;

  // Prison: only visits, calls and letters.
  const inside = state.housing.kind === 'incarcerated';
  if (inside && !def.visit) return false;
  if (def.inPerson && whereabouts(state, personId, content) === 'elsewhere') return false;

  if (def.romance) {
    if (isFamilyKind(rel.kind) || !bothAdults(state, person, content)) return false;
    if (isPartnerKind(rel.kind) ? !isCurrentPartner(state, rel) : !mutualAttraction(state, person) || person.life?.partner) return false;
  }
  return evaluate(a.requires, state, { cast: { [INTERACTION_ROLE]: personId }, roles: 'strict', content });
}

/** Every interaction available with this person now, in id order. */
export function availableInteractions(state: LifeState, personId: Id, content: ContentBundle): InteractionDef[] {
  return activeInteractions(content).filter((def) => isInteractionAvailable(state, def, personId, content));
}

/** The available interactions by group, in the groups' order; empty groups are left out. */
export function groupInteractions(defs: readonly InteractionDef[]): { group: InteractionGroup; defs: InteractionDef[] }[] {
  return INTERACTION_GROUPS.map((group) => ({ group, defs: defs.filter((d) => d.group === group) })).filter((g) => g.defs.length > 0);
}
