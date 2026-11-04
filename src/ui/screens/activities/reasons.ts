import type { ActivityEntryView } from '../../../engine/selectors';
import { money, PASTIME_BLOCK_LABELS } from '../../labels';

/** Why an option can't be chosen now, as the short chip that greys its card ("Needs $40 more", "Done this year"). */
export function reasonOf(entry: ActivityEntryView, price: number, savings: number, blockedByPhase: boolean): string | undefined {
  if (blockedByPhase) return 'Not now';
  if (entry.block === 'limit') return 'Done this year';
  if (entry.block === 'afford') return `Needs ${money(Math.max(0, price - savings))} more`;
  if (entry.block !== null && !['companion', 'name', 'consent', 'stake', 'route', 'quality', 'look'].includes(entry.block)) return PASTIME_BLOCK_LABELS[entry.block]?.replace(/\.$/, '') ?? 'Not now';
  return undefined;
}

