/**
 * Where your children live (E2a). Children whose custody is yours live with
 * you (and move when you do), a stepchild lives where their parent does,
 * and a grown child who has moved out lives wherever they chose. Kept small
 * and free of other engine imports so housing can use it.
 */
import type { Id, LifeState } from '../types';

/**
 * After you move (or your partner does): children who live with you are in
 * your new city, and so are the stepchildren of a partner who lives with
 * you. Children who live with their other parent, and grown children who
 * moved out, stay where they are.
 */
export function relocateChildren(state: LifeState): void {
  const partnerId = state.housing.partnerId;
  for (const person of Object.values(state.people)) {
    // E3: a relative you've taken in comes with you, to a home of your own; without one (the street, your parents', prison) the family looks after them.
    if (person.alive && person.life?.care === 'home') {
      if (state.housing.kind === 'renting' || state.housing.kind === 'owned') person.cityId = state.character.cityId;
      else person.life.care = 'sibling';
    }
    const kid = person.child;
    if (!kid || !person.alive || kid.movedOutYear !== undefined) continue;
    const rel = state.relationships[person.id];
    if (!rel) continue;
    const withYou = rel.kind === 'child' ? kid.custody === 'you' : kid.otherParentId !== undefined && kid.otherParentId === partnerId;
    if (withYou) person.cityId = state.character.cityId;
  }
}

/** True when this child lives in your household: with you (custody yours, not moved out, in your city), or a stepchild of the partner who lives with you. */
export function livesWithYou(state: LifeState, personId: Id): boolean {
  const person = state.people[personId];
  const rel = state.relationships[personId];
  const kid = person?.child;
  if (!person || !rel || !kid || kid.movedOutYear !== undefined) return false;
  if (person.cityId !== state.character.cityId) return false;
  if (rel.kind === 'child') return kid.custody === 'you';
  if (rel.kind === 'stepchild') return kid.otherParentId !== undefined && kid.otherParentId === state.housing.partnerId;
  return false;
}
