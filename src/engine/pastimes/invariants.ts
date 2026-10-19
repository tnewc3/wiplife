/**
 * Invariants for activities (Batch 2a): this year's counts and receipts are
 * real (the activity exists, a count never passes its yearly limit), no
 * receipt shows money coming in (an activity never creates money), every
 * receipt's balance and tier make sense, and an activity of an age or place the
 * life could not have done is never recorded.
 */
import { OUTCOME_TIERS, RISK_CATEGORIES, type ContentBundle } from '../../content/schemas';
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
    // A leisure activity never creates money: whatever else moved, the savings did not go up. Only crime, the black market, gambling,
    // lawsuits and loans bring money in (Batch 2b), and a name change is a fee.
    const brings = (RISK_CATEGORIES as readonly string[]).includes(def.category) && def.category !== 'identity';
    if (r.money && !brings && (r.money.change > 0 || r.money.debtChange < 0 || (r.money.dirty?.change ?? 0) > 0)) fail(`receipt for "${r.pastimeId}" shows money coming in`);
    if (r.money && def.category === 'identity' && (r.money.change > 0 || r.money.debtChange !== 0)) fail(`receipt for "${r.pastimeId}" shows money coming in`);
    if (r.money?.dirty && (r.money.dirty.balance < 0 || (def.category !== 'crime' && def.category !== 'black_market'))) fail(`receipt for "${r.pastimeId}" shows dirty money it should not`);
    if (r.money && r.money.balance < 0) fail(`receipt for "${r.pastimeId}" shows a negative balance`);
    if (r.year - state.birthYear < def.minAge) fail(`receipt for "${r.pastimeId}" is from before the minimum age ${def.minAge}`);
  }
  if (p.receipts.length > content.balance.pastimes.receipts) fail('more receipts are kept than the balance allows');
  // Batch 2b: the names you had before a legal name change.
  const former = state.character.formerNames ?? [];
  if (former.length > content.balance.risk.identity.formerMax) fail('more former names are kept than the balance allows');
  for (const f of former) {
    if (!Number.isInteger(f.year) || f.year < state.birthYear || f.year > state.currentYear) fail(`a former name "${f.first} ${f.last}" is from outside the life`);
    if (f.year - state.birthYear < content.balance.risk.identity.minorAge) fail(`a former name "${f.first} ${f.last}" was given up before the age ${content.balance.risk.identity.minorAge}`);
  }
  return failures;
}
