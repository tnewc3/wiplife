/**
 * Mortality model: a low flat chance for children, then an age-based curve
 * (background plus a Gompertz-style growth term), adjusted by Health and
 * genetic risk for the character. All numbers come from
 * src/content/balance/mortality.yaml.
 */
import type { ContentBundle } from '../../content/schemas';
import { curveAt, powInt } from '../curve';
import { weightedKey } from '../random';
import type { RngState } from '../rng';
import type { Id } from '../types';

function baseChance(age: number, content: ContentBundle): number {
  const m = content.balance.mortality;
  if (age >= m.maxAge) return 1;
  if (age < m.childhood.untilAge) return m.childhood.yearlyChance;
  return m.background + m.ageCurve.base * powInt(m.ageCurve.growth, age);
}

/** The character's chance of dying in the year they reach `age`. 1 at the maximum age. */
export function characterDeathChance(age: number, health: number, geneticRisk: number, content: ContentBundle): number {
  const m = content.balance.mortality;
  if (age >= m.maxAge) return 1;
  const chance = baseChance(age, content) * curveAt(m.healthMultiplier, health) * curveAt(m.geneticRiskMultiplier, geneticRisk);
  return Math.min(1, chance);
}

/** An NPC's chance of dying in the year they reach `age`. 1 at the maximum age. */
export function npcDeathChance(age: number, content: ContentBundle): number {
  const m = content.balance.mortality;
  if (age >= m.maxAge) return 1;
  return Math.min(1, baseChance(age, content) * m.npcMultiplier);
}

/** Picks a cause of death for someone who died at `age`. */
export function pickCause(rng: RngState, age: number, content: ContentBundle): Id {
  const bands = content.balance.mortality.causes;
  const band = bands.find((b) => age <= b.maxAge) ?? bands[bands.length - 1]!;
  return weightedKey(rng, band.weights);
}
