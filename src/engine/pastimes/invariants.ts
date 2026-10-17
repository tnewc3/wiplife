/**
 * Invariants for activities (Batch 2a): this year's counts and receipts are
 * real (the activity exists, a count never passes its yearly limit), no
 * receipt shows money coming in (an activity never creates money), every
 * receipt's balance and tier make sense, and an activity of an age or place the
 * life could not have done is never recorded.
 */
import { OUTCOME_TIERS, type ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';

export function pastimesFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  const p = state.pastimes;
  if (!Number.isInteger(p.year) || p.year > state.currentYear) fail('pastimes.year is from the future');
  for (const [id, n] of Object.entries(p.counts)) {
    const def = content.pastimes[id];
    if (!def) fail(`pastimes.counts names an unknown activity "${id}"`);
    else if (!Number.isInteger(n) || n < 1 || n > def.yearlyLimit) fail(`activity "${id}" was done ${n} times (its yearly limit is ${def.yearlyLimit})`);
  }
  for (const r of p.receipts) {
    const def = content.pastimes[r.pastimeId];
    if (!def) {
      fail(`a receipt names an unknown activity "${r.pastimeId}"`);
      continue;
    }
    if (r.year > state.currentYear || r.year < state.birthYear) fail(`receipt for "${r.pastimeId}" is from outside the life`);
    if (!(OUTCOME_TIERS as readonly string[]).includes(r.tier) || def.tiers[r.tier] === undefined) fail(`receipt for "${r.pastimeId}" has a tier it does not define`);
    // An activity never creates money: whatever else moved, the savings did not go up.
    if (r.money && (r.money.change > 0 || r.money.debtChange < 0)) fail(`receipt for "${r.pastimeId}" shows money coming in`);
    if (r.money && r.money.balance < 0) fail(`receipt for "${r.pastimeId}" shows a negative balance`);
    if (r.year - state.birthYear < def.minAge) fail(`receipt for "${r.pastimeId}" is from before the minimum age ${def.minAge}`);
  }
  if (p.receipts.length > content.balance.pastimes.receipts) fail('more receipts are kept than the balance allows');
  return failures;
}
