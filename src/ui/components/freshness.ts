/**
 * How fresh an activity still is this year, as pips (U3). The diminishing-returns counters are the engine's: the times you did
 * any option of the activity this year, and the most. Each repeat multiplies what you get by `repeat` (balance/activities.yaml
 * returns), so the pips follow that curve: all lit while it is fresh, fewer with each repeat, none at the limit.
 */
export function freshnessOf(done: number, limit: number, repeat = 0.6, pips = 4): { lit: number; pips: number; word: string } {
  if (limit <= 0 || done >= limit) return { lit: 0, pips, word: 'Worn out' };
  if (done <= 0) return { lit: pips, pips, word: 'Fresh' };
  const lit = Math.max(1, Math.round(pips * repeat ** done));
  return { lit, pips, word: lit >= pips - 1 ? 'Fresh' : lit >= 2 ? 'Fine' : 'Stale' };
}
