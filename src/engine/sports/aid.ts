/**
 * The share of tuition an athletic scholarship pays (Batch 5), read by the education module when it bills a year. It pays only
 * for the program it is for. The sports step ends it when you leave the team or lose your eligibility, before the year is billed.
 */
import type { Enrollment, LifeState } from '../types';

export function athleticShare(state: LifeState, enrollment: Pick<Enrollment, 'program' | 'tier'>): number {
  const sch = state.sports.scholarship;
  return sch && enrollment.program === 'college' && enrollment.tier === sch.tier ? sch.share : 0;
}
