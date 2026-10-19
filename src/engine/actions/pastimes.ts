/**
 * The activities action (Batch 2a): one generic action, `do_activity`, runs
 * any activity on the Activities screen (More → Activities) through the
 * finance, health, legal and relationship systems and the event pipeline. All
 * the rules (age, legal age, place, adults only, who can come, the yearly limit,
 * the price) are in ../pastimes/query.ts; the input is recorded in the input log
 * by ./index.ts like every life action.
 */
import { PASTIME_QUALITIES, PASTIME_ROUTES, PASTIME_STAKES, type PastimeQuality, type PastimeRoute, type PastimeStake } from '../../content/schemas';
import { performPastime } from '../pastimes/perform';
import { pastimeBlock, type PastimeChoice } from '../pastimes/query';
import { parseLegalName } from '../pastimes/risk';
import type { LifeActionParams, LifeActionRule } from './life';

export const PASTIME_ACTION_IDS = ['do_activity'] as const;
export type PastimeActionId = (typeof PASTIME_ACTION_IDS)[number];

const field = (params: unknown, key: string): unknown => (typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[key] : undefined);
const only = (params: unknown, keys: readonly string[]): boolean => typeof params === 'object' && params !== null && Object.keys(params).every((k) => keys.includes(k));

/** The activity's choices from the action's params. */
const choiceOf = (p: LifeActionParams): PastimeChoice => ({
  companionId: p.companionId,
  quality: p.quality,
  stake: p.stake,
  chase: p.chase,
  route: p.route,
  first: p.first,
  last: p.last,
  consentId: p.consentId,
});

export const PASTIME_ACTIONS: Record<PastimeActionId, LifeActionRule> = {
  do_activity: {
    parse: (params, content) => {
      const pastimeId = field(params, 'pastimeId');
      const companionId = field(params, 'companionId');
      const quality = field(params, 'quality');
      const stake = field(params, 'stake');
      const chase = field(params, 'chase');
      const route = field(params, 'route');
      const consentId = field(params, 'consentId');
      if (!only(params, ['pastimeId', 'companionId', 'quality', 'stake', 'chase', 'route', 'first', 'last', 'consentId'])) return null;
      if (typeof pastimeId !== 'string' || !content.pastimes[pastimeId]) return null;
      if (companionId !== undefined && (typeof companionId !== 'string' || companionId.length === 0 || companionId.length > 60)) return null;
      if (consentId !== undefined && (typeof consentId !== 'string' || consentId.length === 0 || consentId.length > 60)) return null;
      if (quality !== undefined && !(PASTIME_QUALITIES as readonly unknown[]).includes(quality)) return null;
      if (stake !== undefined && !(PASTIME_STAKES as readonly unknown[]).includes(stake)) return null;
      if (route !== undefined && !(PASTIME_ROUTES as readonly unknown[]).includes(route)) return null;
      if (chase !== undefined && chase !== true) return null;
      // A typed name is checked and tidied here; the log keeps the tidy form.
      const first = field(params, 'first') === undefined ? undefined : parseLegalName(field(params, 'first'));
      const last = field(params, 'last') === undefined ? undefined : parseLegalName(field(params, 'last'));
      if (first === null || last === null) return null;
      return {
        pastimeId,
        ...(companionId !== undefined ? { companionId } : {}),
        ...(quality !== undefined ? { quality: quality as PastimeQuality } : {}),
        ...(stake !== undefined ? { stake: stake as PastimeStake } : {}),
        ...(chase === true ? { chase: true } : {}),
        ...(route !== undefined ? { route: route as PastimeRoute } : {}),
        ...(first !== undefined ? { first } : {}),
        ...(last !== undefined ? { last } : {}),
        ...(consentId !== undefined ? { consentId } : {}),
      };
    },
    allowed: (state, p, content) => {
      const def = p.pastimeId === undefined ? undefined : content.pastimes[p.pastimeId];
      return def !== undefined && !def.retired && pastimeBlock(state, def, choiceOf(p), content) === null;
    },
    apply: (state, p, content) => performPastime(state, content.pastimes[p.pastimeId!]!, choiceOf(p), content),
  },
};
