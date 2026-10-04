/**
 * Custody (E2a). When you and the other parent of your children are no
 * longer together (they are an ex), a custody hearing decides where the
 * minors live: with you (full), shared, or with the other parent. The
 * event's choice applies it: the children move, and child support is set
 * up to match. Numbers: balance/family.yaml (custody, support).
 */
import type { ContentBundle } from '../../content/schemas';
import { ageOf } from '../relationships';
import { livingChildren } from './children';
import { styleOf } from './parenting';
import type { Id, LifeState } from '../types';

/** Your living minor children with this person whose custody hasn't been decided. */
export function undecidedChildren(state: LifeState, otherId: Id, content: ContentBundle): Id[] {
  const { adultAge } = content.balance.relationships;
  return livingChildren(state)
    .filter((p) => p.child.otherParentId === otherId && !p.child.custodyDecided && state.currentYear - p.birthYear < adultAge)
    .map((p) => p.id);
}

/**
 * How strong your custody case is (0–100): how involved and warm you have
 * been with the children, and how steady your home and work are.
 */
export function custodyCase(state: LifeState, otherId: Id, content: ContentBundle): number {
  const w = content.balance.family.custody.case;
  const ids = undecidedChildren(state, otherId, content);
  const children = ids.length > 0 ? ids : livingChildren(state).filter((p) => p.child.otherParentId === otherId).map((p) => p.id);
  let involvement = 50;
  let warmth = 50;
  if (children.length > 0) {
    involvement = children.reduce((sum, id) => sum + styleOf(state.relationships[id]!, content).involvement, 0) / children.length;
    warmth = children.reduce((sum, id) => sum + styleOf(state.relationships[id]!, content).warmth, 0) / children.length;
  }
  const housed = state.housing.kind !== 'homeless' && state.housing.kind !== 'incarcerated';
  const working = state.career.job !== null || state.career.retired || state.career.gig;
  return Math.round(involvement * w.involvement + warmth * w.warmth + (housed ? 100 : 25) * w.housing + (working ? 100 : 40) * w.work);
}

/** Who needs a custody decision: exes with undecided minor children together (in id order). Children whose other parent has died stay with you, decided. */
export function custodyHearings(state: LifeState, content: ContentBundle): Id[] {
  const out: Id[] = [];
  for (const person of livingChildren(state)) {
    const otherId = person.child.otherParentId;
    if (otherId === undefined || person.child.custodyDecided || ageOf(state, person) >= content.balance.relationships.adultAge) continue;
    const rel = state.relationships[otherId];
    if (rel?.kind === 'ex' && !out.includes(otherId)) out.push(otherId);
  }
  return out.sort();
}

/**
 * Applies a custody decision for the children you have with this person:
 * full (they live with you; you receive support), shared (no support), or
 * other (they live with the other parent, in their city; you pay support).
 */
export function applyCustody(state: LifeState, otherId: Id, choice: 'full' | 'shared' | 'other', content: ContentBundle): void {
  const ids = undecidedChildren(state, otherId, content);
  if (ids.length === 0) return;
  const other = state.people[otherId];
  const custody = choice === 'full' ? 'you' : choice === 'shared' ? 'shared' : 'other';
  for (const id of ids) {
    const person = state.people[id]!;
    person.child!.custody = custody;
    person.child!.custodyDecided = true;
    person.cityId = custody === 'other' && other ? other.cityId : state.character.cityId;
  }
  state.family.support = choice === 'full' ? { direction: 'receive', personId: otherId } : choice === 'other' ? { direction: 'pay', personId: otherId } : state.family.support?.personId === otherId ? null : state.family.support;
}
