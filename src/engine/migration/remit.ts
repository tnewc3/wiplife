/** Money sent home (W6): a share of the year's income, paid through the yearly ledger from what is left after the essentials, never into debt. */
import type { ContentBundle } from '../../content/schemas';
import { wholeDollars } from '../finance';
import type { LifeState } from '../types';
import { relativesAbroad } from './query';

/** What is sent this year, given the income and what is left after housing, living and the other fixed costs. Records it. */
export function remittanceDue(state: LifeState, gross: number, surplus: number, content: ContentBundle): number {
  const m = state.migration;
  if (m.remit.level === 'none') return 0;
  if (relativesAbroad(state, content).length === 0) {
    m.remit.level = 'none';
    return 0;
  }
  const b = content.balance.immigration.remit;
  const share = Math.min(b.maxShare, b.levels[m.remit.level]);
  const paid = Math.min(wholeDollars(gross * share), Math.max(0, surplus));
  if (paid > 0) {
    m.remit.sent += paid;
    m.counts.remitYears = (m.counts.remitYears ?? 0) + 1;
    m.counts.remitted = (m.counts.remitted ?? 0) + paid;
  }
  return paid;
}
