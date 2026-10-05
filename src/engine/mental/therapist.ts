/**
 * Seeing a therapist (M1, docs/expansion.md): once a year, from age 10 (a
 * child's family takes them and pays). The session costs a medical cost
 * (balance/mental-health.yaml costs); a therapist may name what you carry
 * (more readily than a doctor does), and either way it answers with an event
 * (registries/mental.yaml).
 */
import type { ContentBundle } from '../../content/schemas';
import { fittingResults, queueResult } from '../actions/result';
import { payMentalCost } from './care';
import { rollDiagnosis } from './diagnose';
import { mentalConditions } from './query';
import type { LifeState } from '../types';

/** The youngest age you see a therapist on your own page: the age the balance says people notice. */
const MIN_AGE = 10;

/** True once a year, between years, alive and out of prison, and an event answers (a talk always does). */
export function canSeeTherapist(state: LifeState, content: ContentBundle): boolean {
  return (
    state.phase === 'yearStart' &&
    state.character.age >= MIN_AGE &&
    state.health.mental.lastTherapist !== state.currentYear &&
    state.housing.kind !== 'incarcerated' &&
    fittingResults(state, content.registries.mental.therapist.talked.events, {}, content).length > 0
  );
}

/** What a session costs in your city. */
export function therapistQuote(state: LifeState, content: ContentBundle): number {
  const def = content.balance.mentalHealth.costs.therapy_session!;
  return Math.round(def.amount * (content.cities[state.character.cityId]?.costOfLiving ?? 1));
}

/** The session: it is paid, the therapist may name what you carry, and an event answers. */
export function seeTherapist(state: LifeState, content: ContentBundle): void {
  state.health.mental.lastTherapist = state.currentYear;
  payMentalCost(state, 'therapy_session', content);
  const named = rollDiagnosis(state, 'therapist', content).length > 0;
  const registry = content.registries.mental.therapist;
  const options = fittingResults(state, named ? registry.diagnosed.events : registry.talked.events, {}, content);
  if (options.length > 0) queueResult(state, options, {});
}

/** Whether you carry anything a therapist could still name (for the Health page: a hint, never a name). */
export function somethingUnnamed(state: LifeState, content: ContentBundle): boolean {
  return mentalConditions(state, content).some((h) => h.condition.diagnosed === undefined);
}
