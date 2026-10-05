/**
 * Health conditions (year pipeline step 6, Stage 9). Age-related Health
 * decline is part of aging (step 1); the chance a condition kills is part of
 * the death check (endYear). As each year begins, in this order:
 *
 * 1. Each condition runs its course: its severity moves by its untreated or
 *    treated rate (fractions by chance); one that reaches 0 is gone.
 * 2. Each condition pulls on your stats, scaled by its severity and softened
 *    by treatment.
 * 3. Treated conditions cost their yearly medication (medical debt for what
 *    savings can't cover); untreated ones can cost money too (an addiction).
 *    Mental health conditions and neurodivergence (M1) have their own year:
 *    ../mental/course.ts (care costs and side effects come after the loop).
 * 4. Vice escalation: an untreated addiction feeds the habit (vice rises);
 *    with only treated addictions it fades.
 * 5. New conditions may start, each by its onset chance.
 *
 * The rules live in ../health.ts; numbers in balance/health.yaml.
 */
import type { ContentBundle } from '../../content/schemas';
import { spend } from '../finance';
import { activeCondition, addCondition, addictions, changeSeverity, onsetChance, payMedical, rollSeverity } from '../health';
import { mentalCareYear, mentalYear } from '../mental/course';
import { isMentalKind } from '../mental/query';
import { clampInt, wholeChange } from '../random';
import { chance } from '../rng';
import type { LifeState } from '../types';
import { applyStatEffects, scaledEffects } from './economy';

/** Step 6: progress conditions and roll for new ones. */
export function runHealth(state: LifeState, content: ContentBundle): void {
  const h = content.balance.health;

  // 1–3. Each condition, in the order you got them.
  for (const condition of [...state.health.conditions]) {
    const def = content.conditions[condition.conditionId];
    if (!def) continue;
    // M1: mental health conditions and neurodivergence have their own year (their care costs come after).
    if (isMentalKind(def.kind)) {
      mentalYear(state, condition, def, content);
      continue;
    }
    const delta = wholeChange(state.rng, condition.treated ? def.course.treated : def.course.untreated);
    if (delta !== 0) changeSeverity(state, def.id, delta, content);
    const still = state.health.conditions.find((c) => c.conditionId === def.id);
    if (!still) continue;
    const share = (still.severity / 100) * (still.treated ? h.treated.effects : 1);
    applyStatEffects(state, scaledEffects(def.effects, share));
    const yearly = still.treated ? def.costs?.yearlyTreated : def.costs?.yearlyUntreated;
    if (yearly) {
      const amount = Math.round((yearly * still.severity) / 100);
      // Medication is a medical cost; an addiction's habit is ordinary spending.
      if (still.treated) payMedical(state, amount, content);
      else spend(state, amount, content);
    }
  }

  mentalCareYear(state, content);

  // 4. Vice escalation.
  const habits = addictions(state, content);
  const vice = state.character.hidden;
  if (habits.some((c) => !c.treated)) vice.vice = clampInt(vice.vice + h.vice.untreatedPerYear, 0, 100);
  else if (habits.length > 0) vice.vice = clampInt(vice.vice - h.vice.treatedPerYear, 0, 100);

  // 5. New conditions, in id order so rolls never depend on file order.
  for (const id of Object.keys(content.conditions).sort()) {
    const def = activeCondition(content, id);
    if (!def) continue;
    const p = onsetChance(state, def, content);
    if (p > 0 && chance(state.rng, p)) addCondition(state, id, rollSeverity(state, def), content);
  }
}
