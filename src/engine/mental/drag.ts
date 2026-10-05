/**
 * What a mental health condition costs you in work and school (M1): the time
 * therapy takes out of the week, and what ignoring a severe condition does
 * over the years. Read by the job performance aim (../career.ts) and the
 * school grade (../education.ts); numbers in balance/mental-health.yaml.
 */
import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';
import { careOf, mentalConditions, professionalCare } from './query';

/** True while a mental health condition is this severe and you aren't caring for it at all. */
function ignoring(state: LifeState, content: ContentBundle): boolean {
  const limit = content.balance.mentalHealth.course.ignored.severity;
  return mentalConditions(state, content).some(({ condition, def }) => {
    const care = careOf(condition);
    return def.kind === 'mental' && condition.severity >= limit && !professionalCare(care) && !care.includes('support');
  });
}

/** Points on the job performance aim (zero or negative). */
export function performanceDrag(state: LifeState, content: ContentBundle): number {
  const m = content.balance.mentalHealth;
  let drag = 0;
  if (mentalConditions(state, content).some(({ condition }) => careOf(condition).includes('therapy'))) drag += m.care.therapy.performance;
  if (ignoring(state, content)) drag += m.course.ignored.performance;
  return drag;
}

/** GPA points on this year's grade (zero or negative). */
export function gradeDrag(state: LifeState, content: ContentBundle): number {
  return ignoring(state, content) ? content.balance.mentalHealth.course.ignored.grades : 0;
}
