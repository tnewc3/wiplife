/**
 * Diagnosis (M1, docs/expansion.md): a mental health condition or
 * neurodivergence is named by a doctor, a therapist, an assessment (school
 * testing, an adult asking for one) or a crisis. Until then it shows only in
 * your stats and in events, and the Health page doesn't name it. Chances
 * come from balance/mental-health.yaml diagnosis.
 */
import type { ContentBundle } from '../../content/schemas';
import { curveAt } from '../curve';
import { conditionOf, healthHistory } from '../health';
import { chance } from '../rng';
import { startItem } from '../web/knowledge';
import type { DiagnosisPath, Id, LifeState } from '../types';
import { mentalConditions } from './query';

/** Conditions you have that are not named yet and old enough to be named. */
export function undiagnosed(state: LifeState, content: ContentBundle): Id[] {
  return mentalConditions(state, content)
    .filter(({ condition, def }) => condition.diagnosed === undefined && state.character.age >= (def.diagnosableFrom ?? 0))
    .map(({ def }) => def.id);
}

/** Names the condition (if you have it, it isn't named yet and you're old enough). Returns whether it was named. */
export function diagnose(state: LifeState, conditionId: Id, by: DiagnosisPath, content: ContentBundle): boolean {
  const condition = conditionOf(state, conditionId);
  const def = content.conditions[conditionId];
  if (!condition || !def || condition.diagnosed !== undefined || !undiagnosed(state, content).includes(conditionId)) return false;
  condition.diagnosed = state.currentYear;
  condition.diagnosedBy = by;
  healthHistory(state, 'diagnosed', def, content);
  // E4: a diagnosis is a fact that can be kept private or spread (a secret of the mentalHealth kind). Whoever lives with you may have seen.
  startItem({ cur: state, web: state.web, content, rng: state.rng, year: state.currentYear }, 'mentalHealth', 'you', conditionId);
  return true;
}

/**
 * Someone looks at what you carry: each condition that isn't named yet is
 * named with a chance by how bad it is (the balance's curve for this way of
 * looking). Returns the ones named, in the order you got them.
 */
export function rollDiagnosis(state: LifeState, by: 'doctor' | 'therapist' | 'assessment', content: ContentBundle): Id[] {
  const curve = content.balance.mentalHealth.diagnosis[by];
  const named: Id[] = [];
  for (const id of undiagnosed(state, content)) {
    const condition = conditionOf(state, id)!;
    const mult = by !== 'assessment' && content.conditions[id]?.kind === 'neuro' ? content.balance.mentalHealth.diagnosis.neuroMult : 1;
    if (chance(state.rng, curveAt(curve, condition.severity) * mult) && diagnose(state, id, by, content)) named.push(id);
  }
  return named;
}
