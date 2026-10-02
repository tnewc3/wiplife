/**
 * Time and aging (year pipeline step 1): the year and age advance, the life
 * stage updates with a history entry, Health slowly declines with age, and
 * (C1) Happiness drifts back toward the life's personal baseline.
 */
import type { ContentBundle } from '../../content/schemas';
import { curveAt } from '../curve';
import { chance } from '../rng';
import type { LifeStage, LifeState } from '../types';
import { writeFromGroup } from './history';

/** The life stage for an age, from the stage start ages in balance/aging.yaml. */
export function lifeStageForAge(age: number, content: ContentBundle): LifeStage {
  const s = content.balance.aging.lifeStages;
  if (age >= s.senior) return 'senior';
  if (age >= s.adult) return 'adult';
  if (age >= s.youngAdult) return 'youngAdult';
  if (age >= s.teen) return 'teen';
  if (age >= s.child) return 'child';
  return 'early';
}

/** Health points lost this year: the balance curve by age, scaled by Fitness. */
export function yearlyHealthDecline(age: number, fitness: number, content: ContentBundle): number {
  const { healthDecline, fitnessEffect } = content.balance.aging;
  return curveAt(healthDecline, age) * curveAt(fitnessEffect, fitness);
}

/** Step 1: increase age and update life stage (plus age effects on Health). */
export function advanceAge(state: LifeState, content: ContentBundle): void {
  const c = state.character;
  state.currentYear += 1;
  c.age = state.currentYear - state.birthYear;

  const stage = lifeStageForAge(c.age, content);
  if (stage !== c.lifeStage) {
    c.lifeStage = stage;
    if (stage !== 'early') {
      writeFromGroup(state, content.text.history.lifeStage[stage], ['milestone', 'lifeStage', stage], { values: { age: c.age } }, content);
    }
  }

  const decline = yearlyHealthDecline(c.age, c.stats.fitness, content);
  const whole = Math.floor(decline);
  const lost = whole + (decline > whole && chance(state.rng, decline - whole) ? 1 : 0);
  c.stats.health = Math.max(0, c.stats.health - lost);

  c.stats.happiness = happinessAfterDrift(c.stats.happiness, c.hidden.happinessBaseline, content);
}

/** C1: Happiness moved part of the way back toward the baseline (balance aging.yaml happinessDrift). */
export function happinessAfterDrift(happiness: number, baseline: number, content: ContentBundle): number {
  const moved = happiness + Math.round((baseline - happiness) * content.balance.aging.happinessDrift.rate);
  return Math.max(0, Math.min(100, moved));
}
