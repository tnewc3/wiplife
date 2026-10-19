/**
 * The activities action (Batch 2a): one generic action, `do_activity`, runs
 * any activity on the Activities screen (More → Activities) through the
 * finance, health, legal and relationship systems and the event pipeline. All
 * the rules (age, legal age, place, adults only, who can come, the yearly limit,
 * the price) are in ../pastimes/query.ts; the input is recorded in the input log
 * by ./index.ts like every life action.
 */
import { PASTIME_QUALITIES, type PastimeQuality } from '../../content/schemas';
import { performPastime } from '../pastimes/perform';
import { pastimeBlock } from '../pastimes/query';
import type { LifeActionRule } from './life';

export const PASTIME_ACTION_IDS = ['do_activity'] as const;
export type PastimeActionId = (typeof PASTIME_ACTION_IDS)[number];

const field = (params: unknown, key: string): unknown => (typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[key] : undefined);
const only = (params: unknown, keys: readonly string[]): boolean => typeof params === 'object' && params !== null && Object.keys(params).every((k) => keys.includes(k));

export const PASTIME_ACTIONS: Record<PastimeActionId, LifeActionRule> = {
  do_activity: {
    parse: (params, content) => {
      const pastimeId = field(params, 'pastimeId');
      const companionId = field(params, 'companionId');
      const quality = field(params, 'quality');
      if (!only(params, ['pastimeId', 'companionId', 'quality'])) return null;
      if (typeof pastimeId !== 'string' || !content.pastimes[pastimeId]) return null;
      if (companionId !== undefined && (typeof companionId !== 'string' || companionId.length === 0 || companionId.length > 60)) return null;
      if (quality !== undefined && !(PASTIME_QUALITIES as readonly unknown[]).includes(quality)) return null;
      return { pastimeId, ...(companionId !== undefined ? { companionId } : {}), ...(quality !== undefined ? { quality: quality as PastimeQuality } : {}) };
    },
    allowed: (state, p, content) => {
      const def = p.pastimeId === undefined ? undefined : content.pastimes[p.pastimeId];
      return def !== undefined && !def.retired && pastimeBlock(state, def, { companionId: p.companionId, quality: p.quality }, content) === null;
    },
    apply: (state, p, content) => performPastime(state, content.pastimes[p.pastimeId!]!, { companionId: p.companionId, quality: p.quality }, content),
  },
};
