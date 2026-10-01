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
 * 4. Vice escalation: an untreated addiction feeds the habit (vice rises);
 *    with only treated addictions it fades.
 * 5. New conditions may start, each by its onset chance.
 *
 * The rules live in ../health.ts; numbers in balance/health.yaml.
 */
import type { ContentBundle, StatEffects } from '../../content/schemas';
import { spend } from '../finance';
import { activeCondition, addCondition, addictions, changeSeverity, onsetChance, payMedical, rollSeverity } from '../health';
import { clampInt } from '../random';
import { chance } from '../rng';
import type { LifeState, StatKey } from '../types';
import { applyStatEffects } from './economy';

/** A condition's yearly stat pulls at this severity (and treatment). */
function scaledEffects(effects: StatEffects, share: number): StatEffects {
  const out: StatEffects = {};
  for (const key of Object.keys(effects).sort() as StatKey[]) {
    const pull = effects[key];
    if (pull) out[key] = { perYear: pull.perYear * share, limit: pull.limit };
  }
  return out;
}

/** A whole number from a fractional change: the fraction happens by chance. */
function wholeChange(state: LifeState, change: number): number {
  const size = Math.abs(change);
  const whole = Math.floor(size);
  const n = whole + (size > whole && chance(state.rng, size - whole) ? 1 : 0);
  return change < 0 ? -n : n;
}

/** Step 6: progress conditions and roll for new ones. */
export function runHealth(state: LifeState, content: ContentBundle): void {
  const h = content.balance.health;

  // 1–3. Each condition, in the order you got them.
  for (const condition of [...state.health.conditions]) {
    const def = content.conditions[condition.conditionId];
    if (!def) continue;
    const delta = wholeChange(state, condition.treated ? def.course.treated : def.course.untreated);
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
