/**
 * The will action (E2b, More → Write a will): writes your will, or clears it.
 * It takes effect at once, between years. The shares are checked against the
 * people and causes that exist now (./../estate/will.ts); an empty list
 * clears the will, and the default shares apply again.
 */
import type { ContentBundle } from '../../content/schemas';
import { canWriteWill, parseShares, writeWill } from '../estate/will';
import type { LifeState, WillShare } from '../types';
import type { LifeActionParams, LifeActionRule } from './life';

export const ESTATE_ACTION_IDS = ['write_will'] as const;
export type EstateActionId = (typeof ESTATE_ACTION_IDS)[number];

/** The shape of the shares only; whether the people exist is checked when the action is taken. */
function parse(params: unknown): LifeActionParams | null {
  const shares = typeof params === 'object' && params !== null ? (params as { shares?: unknown }).shares : undefined;
  if (!Array.isArray(shares)) return null;
  const out: WillShare[] = [];
  for (const raw of shares as unknown[]) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { kind, id, percent } = raw as Record<string, unknown>;
    if ((kind !== 'person' && kind !== 'cause') || typeof id !== 'string' || id.length === 0 || typeof percent !== 'number') return null;
    out.push({ kind, id, percent });
  }
  return { shares: out };
}

export const ESTATE_ACTIONS: Record<EstateActionId, LifeActionRule> = {
  write_will: {
    parse,
    allowed: (state: LifeState, p: LifeActionParams, content: ContentBundle) => canWriteWill(state, content) && parseShares(p.shares, state, content) !== null,
    apply: (state: LifeState, p: LifeActionParams, content: ContentBundle) => writeWill(state, parseShares(p.shares, state, content) ?? []),
  },
};
