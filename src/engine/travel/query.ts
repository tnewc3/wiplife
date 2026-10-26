import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';

/** Batch 10: your job calls for travel (its track says so) and you are not retired. */
export function hasBusinessJob(state: LifeState, content: ContentBundle): boolean {
  const job = state.career.job;
  return job !== null && !state.career.retired && content.jobs[job.jobId]?.businessTravel === true;
}
