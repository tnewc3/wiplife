/**
 * Jobs and vehicles (E5): how much a job depends on a vehicle is the job's
 * own need (content: jobs) times how much life in your city depends on one
 * (content: cities). From balance/possessions.yaml jobs.requireAt it comes to
 * a requirement: no vehicle, no job. Below it a vehicle only helps.
 */
import type { ContentBundle } from '../../content/schemas';
import type { Id, LifeState } from '../types';

/** How much this job depends on a vehicle in this city (0–1). */
export function jobDependence(jobId: Id, cityId: Id, content: ContentBundle): number {
  const job = content.jobs[jobId];
  const city = content.cities[cityId];
  return (job?.vehicle ?? 0) * (city?.carDependence ?? 0);
}

/** The job needs a vehicle in this city: you can't be hired without one. */
export function jobRequiresVehicle(jobId: Id, cityId: Id, content: ContentBundle): boolean {
  return jobDependence(jobId, cityId, content) >= content.balance.possessions.jobs.requireAt;
}

/** The job you hold needs a vehicle where you live. */
export function jobNeedsVehicle(state: LifeState, content: ContentBundle): boolean {
  const job = state.career.job;
  return job !== null && jobRequiresVehicle(job.jobId, state.character.cityId, content);
}

/** Points the job's performance aim loses for having no vehicle (0 with one, or where it doesn't matter). */
export function missingVehiclePenalty(state: LifeState, content: ContentBundle): number {
  const job = state.career.job;
  if (!job || state.possessions.items.some((p) => p.kind === 'vehicle')) return 0;
  const j = content.balance.possessions.jobs;
  const dependence = jobDependence(job.jobId, state.character.cityId, content);
  if (dependence <= 0) return 0;
  return dependence >= j.requireAt ? j.missingPenalty : j.helpfulPenalty * dependence;
}
