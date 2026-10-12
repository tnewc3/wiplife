/**
 * What running a business yourself does to the job you also hold (W3): you
 * are in two places, and the job suffers a little. Read by the job performance
 * aim (../career.ts). Numbers: balance/business.yaml (owner.jobDrag).
 */
import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';

/** Points on the job performance aim (zero or negative): the drag of each business you run yourself while holding a job. */
export function businessPerformanceDrag(state: LifeState, content: ContentBundle): number {
  if (state.career.job === null) return 0;
  const running = state.business.items.filter((b) => b.role === 'self').length;
  return running === 0 ? 0 : -Math.min(content.balance.business.owner.jobDrag * 2, content.balance.business.owner.jobDrag * running);
}
