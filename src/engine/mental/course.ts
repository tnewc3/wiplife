/**
 * A mental health condition's year (M1, docs/expansion.md). Depression,
 * anxiety and PTSD move up and down: their own course (worse untreated,
 * better in care), the support of the people who noticed, a random swing
 * and now and then a flare-up. At severity 0 they are gone (and can come
 * back: see ../health.ts onsetChance). Neurodivergence is born with you: no
 * course, no recovery, challenges that care soften and strengths that stay.
 * Therapy and medication cost money each year (medical costs, through the
 * finance module); medication can bring side effects. Numbers:
 * balance/mental-health.yaml and the condition's own file.
 */
import type { ConditionDef, ContentBundle } from '../../content/schemas';
import { changeSeverity } from '../health';
import { clampInt, wholeChange } from '../random';
import { chance, nextFloat, nextInt } from '../rng';
import { applyStatEffects, scaledEffects } from '../systems/economy';
import type { HealthCondition, LifeState } from '../types';
import { payMentalCostYear } from './yearlyCost';
import { careOf, professionalCare, supportScore } from './query';

/** The severity change this year for a mental health condition: course, support, swing and flare-ups (a fraction; the caller makes it whole). */
export function mentalCourse(state: LifeState, held: HealthCondition, def: ConditionDef, content: ContentBundle): number {
  const m = content.balance.mentalHealth;
  const care = careOf(held);
  const shares = m.course.share[def.id] ?? { therapy: 0, medication: 0 };
  const careShare = Math.min(1, (care.includes('therapy') ? shares.therapy : 0) + (care.includes('medication') ? shares.medication : 0));
  let delta = def.course.untreated + (def.course.treated - def.course.untreated) * careShare;
  delta -= supportScore(state, care.includes('support'), content) * m.course.supportBonus;
  delta += (nextFloat(state.rng) * 2 - 1) * m.course.swing;
  if (chance(state.rng, m.course.flare.chance * (professionalCare(care) ? m.course.flare.careMult : 1))) {
    delta += nextInt(state.rng, m.course.flare.severity.min, m.course.flare.severity.max);
  }
  return delta;
}

/** One mental health condition's year: its course, then its pull on your stats (and, for neurodivergence, its gifts). */
export function mentalYear(state: LifeState, held: HealthCondition, def: ConditionDef, content: ContentBundle): void {
  if (def.kind === 'mental') {
    const delta = wholeChange(state.rng, mentalCourse(state, held, def, content));
    if (delta !== 0) changeSeverity(state, def.id, delta, content);
  }
  const still = state.health.conditions.find((c) => c.conditionId === def.id);
  if (!still) return;
  const share = still.severity / 100;
  applyStatEffects(state, scaledEffects(def.effects, share * (still.treated ? content.balance.health.treated.effects : 1)));
  if (def.strengths) applyStatEffects(state, scaledEffects(def.strengths, share));
}

/** After every condition has had its year: what care costs, and what medication does to you. */
export function mentalCareYear(state: LifeState, content: ContentBundle): void {
  payMentalCostYear(state, content);
  if (state.health.conditions.some((c) => careOf(c).includes('therapy'))) {
    // The time and the effort: showing up week after week is work.
    const stats = state.character.stats;
    stats.stress = clampInt(stats.stress + content.balance.mentalHealth.care.therapy.stress, 0, 100);
  }
  const med = content.balance.mentalHealth.care.medication;
  for (const held of state.health.conditions) {
    if (!careOf(held).includes('medication') || !chance(state.rng, med.sideEffectChance)) continue;
    applyStatEffects(state, med.sideEffect);
    state.health.mental.sideEffectYear = state.currentYear;
  }
  state.health.mental.trauma = clampInt(state.health.mental.trauma - content.balance.mentalHealth.trauma.decay, 0, 100);
}
