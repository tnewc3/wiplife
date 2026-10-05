/**
 * Higher-level random helpers built on the seeded generator. They only use
 * basic arithmetic (no Math.log, Math.cos...), whose results are identical on
 * every JavaScript engine, so a seed replays the same life on any device.
 */
import { chance, nextFloat, nextInt, type RngState } from './rng';

export interface Spread {
  mean: number;
  sd: number;
}

/** sqrt(12 / 4): scales a sum of four uniforms to a standard deviation of 1. */
const IRWIN_HALL_4_SCALE = 1.7320508075688772;

/** An approximately normal value (sum of four uniforms), unrounded. */
export function rollNormal(state: RngState, { mean, sd }: Spread): number {
  const sum = nextFloat(state) + nextFloat(state) + nextFloat(state) + nextFloat(state);
  return mean + sd * (sum - 2) * IRWIN_HALL_4_SCALE;
}

export function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** A 0–100 integer score around the mean. */
export function rollScore(state: RngState, spread: Spread): number {
  return clampInt(rollNormal(state, spread), 0, 100);
}

/** An integer around the mean, clamped to [min, max]. */
export function rollInRange(state: RngState, spread: Spread, min: number, max: number): number {
  return clampInt(rollNormal(state, spread), min, max);
}

/**
 * Picks an option in proportion to its weight. Zero weights are never picked.
 * Throws if no weight is positive.
 */
export function weightedPick<T>(state: RngState, options: readonly (readonly [T, number])[]): T {
  const total = options.reduce((sum, [, w]) => sum + (w > 0 ? w : 0), 0);
  if (!(total > 0)) throw new RangeError('weightedPick: no positive weights');
  let roll = nextFloat(state) * total;
  for (const [value, weight] of options) {
    if (weight <= 0) continue;
    if (roll < weight) return value;
    roll -= weight;
  }
  // Floating-point leftovers: return the last positive option.
  for (let i = options.length - 1; i >= 0; i--) {
    const option = options[i]!;
    if (option[1] > 0) return option[0];
  }
  throw new RangeError('weightedPick: unreachable');
}

/** Picks from a record of weights ({ man: 49, woman: 49 }). */
export function weightedKey<K extends string>(state: RngState, weights: Partial<Record<K, number>>): K {
  return weightedPick(state, Object.entries(weights) as [K, number][]);
}

/** Returns `count` distinct items in random order. */
export function sample<T>(state: RngState, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const result: T[] = [];
  while (result.length < count && pool.length > 0) {
    result.push(pool.splice(nextInt(state, 0, pool.length - 1), 1)[0]!);
  }
  return result;
}

/** A whole number from a fractional change: the fractional part happens by chance (a change of 1.4 is 1 with chance 0.6, otherwise 2). */
export function wholeChange(state: RngState, change: number): number {
  const size = Math.abs(change);
  const whole = Math.floor(size);
  const n = whole + (size > whole && chance(state, size - whole) ? 1 : 0);
  return change < 0 ? -n : n;
}
