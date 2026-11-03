/**
 * Habits (D1): dependence, tolerance, cravings and withdrawal, and the link to the Stage 9 addiction condition.
 *
 * Each drug has a habit: dependence (0–100) and tolerance (0–100). Using raises both; a year clean lowers both. At the
 * balance's threshold the addiction shows as the `drug_addiction` condition on the Health page, with the greatest
 * dependence as its severity. That condition stays what Stage 9 made it (doctors, treatment, events that read it); this
 * module keeps the two in step (`syncAddiction`): a change made to the condition from outside (a rehab activity, a doctor,
 * an old event) is carried into the habits; a dependence that rises or falls is carried into the condition.
 * Numbers: balance/drugs.yaml.
 */
import type { ContentBundle } from '../../content/schemas';
import { addCondition, changeSeverity, conditionOf } from '../health';
import { curveAt } from '../curve';
import { clampInt } from '../random';
import type { DrugHabit, Id, LifeState } from '../types';
import { ensureHabit, maxDependence } from './query';

export const ADDICTION = 'drug_addiction';

/** Your vice as a multiplier on how fast a drug takes hold. */
export function viceFactor(state: LifeState, content: ContentBundle): number {
  return curveAt(content.balance.drugs.use.vice, state.character.hidden.vice);
}

/** Adds to a habit's dependence (and its peak); returns whether it crossed the addiction threshold. */
export function addDependence(state: LifeState, id: Id, amount: number, content: ContentBundle): boolean {
  const h = ensureHabit(state, id);
  const before = h.dependence;
  h.dependence = Math.round(Math.min(100, Math.max(0, h.dependence + amount)) * 10) / 10;
  h.peak = Math.max(h.peak, h.dependence);
  const t = content.balance.drugs.threshold;
  return before < t && h.dependence >= t;
}

export function addTolerance(state: LifeState, id: Id, amount: number): void {
  const h = ensureHabit(state, id);
  h.tolerance = Math.round(Math.min(100, Math.max(0, h.tolerance + amount)) * 10) / 10;
}

/** The habits with dependence above 0, worst first. */
function dependents(state: LifeState): [Id, DrugHabit][] {
  return Object.entries(state.drugs.habits)
    .filter(([, h]) => h.dependence > 0)
    .sort((a, b) => b[1].dependence - a[1].dependence || (a[0] < b[0] ? -1 : 1));
}

/**
 * Brings the addiction condition and the habits into step. Run after anything that changes either: the drugs step, a use,
 * a recovery action, and before the Health page reads. Writes a history entry through the health system when the
 * condition starts or ends.
 */
export function syncAddiction(state: LifeState, content: ContentBundle): void {
  const d = state.drugs;
  const t = content.balance.drugs.threshold;
  const cond = conditionOf(state, ADDICTION);
  if (cond) {
    if (cond.severity !== d.synced) {
      // Changed from outside (a program, a doctor, an old event): carry the change into the habits.
      let delta = cond.severity - d.synced;
      const list = dependents(state);
      if (list.length === 0 && delta > 0) {
        // An addiction with no drug behind it yet (an old event): it belongs to the drug used most recently, or the legacy one (the pills).
        const first = Object.entries(d.habits).sort((a, b) => b[1].last - a[1].last)[0]?.[0] ?? content.balance.drugs.legacyDrug;
        const h = ensureHabit(state, first);
        if (h.total === 0) {
          h.total = 1;
          h.last = state.currentYear;
        }
        addDependence(state, first, delta, content);
      } else if (delta > 0) {
        addDependence(state, list[0]![0], delta, content);
      } else {
        for (const [, h] of list) {
          if (delta === 0) break;
          const take = Math.min(h.dependence, -delta);
          h.dependence = Math.round((h.dependence - take) * 10) / 10;
          delta += take;
        }
      }
    }
  } else if (d.synced > 0) {
    // Gone from outside (treated and recovered): the habits are over the line no more.
    for (const [, h] of dependents(state)) if (h.dependence >= t) h.dependence = Math.round(t * 0.5 * 10) / 10;
  }
  const max = maxDependence(state);
  const now = conditionOf(state, ADDICTION);
  if (max >= t) {
    if (!now) addCondition(state, ADDICTION, clampInt(max, 1, 100), content);
    else now.severity = clampInt(max, 1, 100);
  } else if (now) {
    changeSeverity(state, ADDICTION, -now.severity, content);
  }
  d.synced = conditionOf(state, ADDICTION)?.severity ?? 0;
}
