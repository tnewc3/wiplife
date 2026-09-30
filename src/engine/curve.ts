/**
 * Numeric helpers for balance curves. Like random.ts they use only basic
 * arithmetic, whose results are identical on every JavaScript engine (unlike
 * Math.pow or Math.exp), so a seed replays the same life on any device.
 */
import type { Curve } from '../content/schemas';

/** The curve's value at `at`: straight lines between points, flat beyond the ends. */
export function curveAt(curve: Curve, at: number): number {
  const first = curve[0]!;
  if (at <= first.at) return first.x;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]!;
    const b = curve[i]!;
    if (at <= b.at) return a.x + ((b.x - a.x) * (at - a.at)) / (b.at - a.at);
  }
  return curve[curve.length - 1]!.x;
}

/** base^exponent for a whole, non-negative exponent, by repeated multiplication. */
export function powInt(base: number, exponent: number): number {
  let result = 1;
  for (let i = 0; i < exponent; i++) result *= base;
  return result;
}
