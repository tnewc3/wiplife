/**
 * The `social` condition (Batch 8): your accounts, your following, whether the
 * platforms pay you, a row that is brewing or has blown up, and what the social
 * step made happen as the year began. Every field given must hold.
 */
import type { Compare, ContentBundle, SocialCondition } from '../../content/schemas';
import type { LifeState } from '../types';
import { promotablePath } from './accounts';
import { hasSponsor } from './income';
import { accountList, isCreator, totalFollowers, topAccount } from './query';

function within(value: number, c: Compare): boolean {
  if (c.gt !== undefined && !(value > c.gt)) return false;
  if (c.gte !== undefined && !(value >= c.gte)) return false;
  if (c.lt !== undefined && !(value < c.lt)) return false;
  if (c.lte !== undefined && !(value <= c.lte)) return false;
  if (c.eq !== undefined && value !== c.eq) return false;
  return true;
}

export function socialHolds(c: SocialCondition, state: LifeState, content?: ContentBundle): boolean {
  const s = state.social;
  const year = state.currentYear;
  const accounts = accountList(state);
  const top = topAccount(state);
  if (c.account !== undefined && (accounts.length > 0) !== c.account) return false;
  if (c.creator !== undefined && isCreator(state) !== c.creator) return false;
  if (c.platform !== undefined && !c.platform.some((p) => s.accounts[p] !== undefined)) return false;
  if (c.accounts && !within(accounts.length, c.accounts)) return false;
  if (c.followers && !within(totalFollowers(state), c.followers)) return false;
  if (c.top && !within(top?.followers ?? 0, c.top)) return false;
  if (c.engagement && !within(top?.engagement ?? 0, c.engagement)) return false;
  if (c.niche !== undefined && (top === undefined || !c.niche.includes(top.niche))) return false;
  if (c.private !== undefined && (accounts.length > 0 && accounts.every((a) => a.private)) !== c.private) return false;
  if (c.byParent !== undefined && accounts.some((a) => a.byParent) !== c.byParent) return false;
  if (c.monetized !== undefined && accounts.some((a) => a.monetized > 0) !== c.monetized) return false;
  if (c.demonetized !== undefined && accounts.some((a) => a.demonetized >= year) !== c.demonetized) return false;
  if (c.sponsor !== undefined && (content !== undefined ? hasSponsor(state, content) : state.fame.contract !== null) !== c.sponsor) return false;
  if (c.controversy !== undefined) {
    const stage = s.controversy?.stage;
    if (typeof c.controversy === 'boolean' ? (stage !== undefined) !== c.controversy : stage === undefined || !c.controversy.includes(stage)) return false;
  }
  if (c.happened !== undefined) {
    const now = s.happened.year === year ? s.happened.triggers : [];
    if (!c.happened.some((t) => now.includes(t))) return false;
  }
  if (c.promotable !== undefined && (content !== undefined && promotablePath(state, content) !== null) !== c.promotable) return false;
  return true;
}
