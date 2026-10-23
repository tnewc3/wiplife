/**
 * Who is on a business's staff list (B2): the small, dependency-light part of
 * ./staff.ts that the people and event systems also use, so they do not pull the
 * whole business engine in with it.
 */
import type { Business, Id, LifeState } from '../types';
import { staffIds } from './query';

/** Someone leaves the staff: the person stays in your life, no longer protected as staff. */
export function removeStaff(state: LifeState, b: Business, personId: Id): void {
  const gone = b.staff.find((s) => s.personId === personId);
  b.staff = b.staff.filter((s) => s.personId !== personId);
  // A location manager's place is empty again.
  for (const l of b.locations) if (l.manager === personId) delete l.manager;
  // With the manager gone, you are running it again.
  if (gone?.manager && b.role === 'manager') b.role = 'self';
  const person = state.people[personId];
  if (person && !staffIds(state).has(personId)) person.tags = person.tags.filter((t) => t !== 'staff');
}

/** Someone who works in your businesses moves to another city on their own: they leave the job. */
export function leaveStaff(state: LifeState, personId: Id): void {
  for (const b of state.business.items) if (b.staff.some((s) => s.personId === personId)) removeStaff(state, b, personId);
}
