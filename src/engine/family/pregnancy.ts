/**
 * Pregnancy (E2a): beginning one (from trying for a baby or an intimate
 * night), the decision an unplanned one asks for (keep it, place the baby
 * for adoption, or end it), a year of trying that didn't work, and the
 * chance of miscarriage. A pregnancy begun this year ends the next, in the
 * family step of the year pipeline (./step.ts). Numbers: balance/family.yaml.
 */
import type { ContentBundle } from '../../content/schemas';
import { curveAt } from '../curve';
import { carrierAge, canConceiveWith, naturalCarrier, type Carrier } from './carrying';
import type { Id, LifeState, Pregnancy } from '../types';

/**
 * Begins a pregnancy with this person if one is possible (see
 * canConceiveWith). Trying (and processes) start as decided; an unplanned
 * pregnancy waits for the player's decision. Returns true when it began.
 */
export function beginPregnancy(state: LifeState, how: 'trying' | 'unplanned', personId: Id, content: ContentBundle): boolean {
  if (!canConceiveWith(state, personId, content)) return false;
  const carrier = naturalCarrier(state, personId)!;
  const pregnancy: Pregnancy = { startYear: state.currentYear, how, carrier, otherParentId: personId, decision: how === 'unplanned' ? 'pending' : 'keep' };
  state.family.pregnancy = pregnancy;
  state.family.attempts = 0;
  state.relationships[personId]?.memories.push({ tag: 'expecting_together', year: state.currentYear });
  return true;
}

/**
 * The player's decision on an unplanned pregnancy: keep it, place the baby
 * for adoption when it is born, or end it. Ignored without a pregnancy that
 * is waiting for one.
 */
export function decidePregnancy(state: LifeState, choice: 'keep' | 'adoption' | 'end'): void {
  const p = state.family.pregnancy;
  if (!p || p.decision !== 'pending') return;
  if (choice === 'end') {
    state.family.pregnancy = null;
    return;
  }
  p.decision = choice;
}

/** A year of trying that didn't work. */
export function failAttempt(state: LifeState): void {
  state.family.attempts += 1;
}

/** The chance (0–1) this pregnancy ends in miscarriage: the base times the carrier's age and Health factors. A surrogate counts as average. */
export function miscarriageChance(state: LifeState, carrier: Carrier | 'surrogate', content: ContentBundle): number {
  const m = content.balance.family.pregnancy.miscarriage;
  if (carrier === 'surrogate') return Math.min(1, m.base * curveAt(m.carrierAge, 30) * curveAt(m.health, content.balance.family.fertility.npcHealth));
  const age = carrierAge(state, carrier, content);
  const health = carrier === 'you' ? state.character.stats.health : content.balance.family.fertility.npcHealth;
  return Math.min(1, m.base * curveAt(m.carrierAge, age) * curveAt(m.health, health));
}
