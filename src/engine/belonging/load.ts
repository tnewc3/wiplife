/**
 * What the time a group takes does to the rest of your life (W2): a little
 * less at work or in class when your groups take more of the week than is
 * easy, and a little less at home. Read by the job performance aim
 * (../career.ts) and the school grade (../education.ts); the stress,
 * the sense of belonging and the strain on the people at home are applied
 * by the yearly step. Numbers: balance/belonging.yaml (groups.load).
 */
import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';
import { weeklyHours } from './query';

/** Points on the job performance aim (zero or negative). */
export function groupPerformanceDrag(state: LifeState, content: ContentBundle): number {
  const w = content.balance.belonging.groups.load.work;
  const over = weeklyHours(state, content) - w.over;
  return over > 0 ? -Math.min(w.performance * 3, w.performance * over) : 0;
}

/** GPA points on this year's grade (zero or negative). */
export function groupGradeDrag(state: LifeState, content: ContentBundle): number {
  const s = content.balance.belonging.groups.load.school;
  const over = weeklyHours(state, content) - s.over;
  return over > 0 ? -Math.min(s.gpa * 8, s.gpa * over) : 0;
}
