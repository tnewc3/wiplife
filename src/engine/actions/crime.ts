/**
 * Crime actions (E6a, Money tab): launder some dirty money through a cash
 * business (for its fee and a risk), or spend some of it (which draws
 * attention). Each takes effect at once, between years; the common checks
 * (between years, input validation, the input log) live in ./index.ts. A
 * deposit that is flagged queues its event for the year that begins next.
 */
import { queueCrimeEvent } from '../crime/step';
import { launder, launderBlock, spendBlock, spendDirty } from '../crime/money';
import type { LifeActionParams, LifeActionRule } from './life';

export const CRIME_ACTION_IDS = ['launder_money', 'spend_dirty'] as const;
export type CrimeActionId = (typeof CRIME_ACTION_IDS)[number];

const field = (params: unknown, key: string): unknown =>
  typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[key] : undefined;
const only = (params: unknown, keys: readonly string[]): boolean =>
  typeof params === 'object' && params !== null && Object.keys(params).every((k) => keys.includes(k));
const dollars = (params: unknown): number | undefined => {
  const v = field(params, 'amount');
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : undefined;
};

export const CRIME_ACTIONS: Record<CrimeActionId, LifeActionRule> = {
  launder_money: {
    parse: (params) => {
      const frontId = field(params, 'frontId');
      const amount = dollars(params);
      return only(params, ['frontId', 'amount']) && typeof frontId === 'string' && frontId.length > 0 && frontId.length <= 60 && amount !== undefined ? { frontId, amount } : null;
    },
    allowed: (state, p, content) => p.frontId !== undefined && p.amount !== undefined && launderBlock(state, p.frontId, p.amount, content) === null,
    apply: (state, p, content) => {
      const result = launder(state, p.frontId!, p.amount!, content);
      if (result.flagged) queueCrimeEvent(state, 'laundering', content, state.currentYear + 1);
    },
  },
  spend_dirty: {
    parse: (params) => {
      const amount = dollars(params);
      return only(params, ['amount']) && amount !== undefined ? { amount } : null;
    },
    allowed: (state, p, content) => p.amount !== undefined && spendBlock(state, p.amount, content) === null,
    apply: (state, p, content) => void spendDirty(state, p.amount!, content),
  },
};

export type { LifeActionParams };
