/**
 * How the fill is colored. 'stat': low is red, the middle amber, high green. 'bad': the same turned around, for a
 * measure where more is worse (stress, burnout, how severe a condition is). 'plain': not good or bad (personality).
 */
export type BarKind = 'stat' | 'bad' | 'plain';

/** The fill color token for a value (see src/ui/theme/tokens.css). */
export function barColor(value: number, kind: BarKind = 'stat'): string {
  if (kind === 'plain') return 'var(--wl-bar-fill)';
  const good = kind === 'bad' ? 100 - value : value;
  return good < 35 ? 'var(--wl-negative)' : good < 65 ? 'var(--wl-warning)' : 'var(--wl-positive)';
}
