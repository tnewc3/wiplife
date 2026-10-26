/**
 * Social media actions (Batch 8, the Social screen): open an account on a
 * platform with a handle you type and a niche, close it, make it private or
 * public, post (safely, or by saying the bold thing), send the followers of one
 * account to another, make something with a creator you know, and promote your
 * music, film or season to your followers. Each takes effect at once, between
 * years; what it earns, how it fades and what it does to a career follow in the
 * social step. The common checks (between years, input validation, the input
 * log) live in ./index.ts.
 */
import { SOCIAL_TONES, type SocialTone } from '../../content/schemas';
import { closeAccount, closeBlock, collab, collabBlock, crossBlock, crossPromote, openAccount, openBlock, post, postBlock, promoteBlock, promoteWork, setPrivate } from '../social/accounts';
import { handleIssue } from '../social/query';
import type { LifeActionParams, LifeActionRule } from './life';

export const SOCIAL_ACTION_IDS = ['open_account', 'close_account', 'set_private', 'post', 'cross_promote', 'collab', 'promote_work'] as const;
export type SocialActionId = (typeof SOCIAL_ACTION_IDS)[number];

const field = (params: unknown, key: string): unknown => (typeof params === 'object' && params !== null ? (params as Record<string, unknown>)[key] : undefined);
const only = (params: unknown, keys: readonly string[]): boolean => typeof params === 'object' && params !== null && Object.keys(params).every((k) => keys.includes(k));
const id = (params: unknown, key: string): string | undefined => {
  const v = field(params, key);
  return typeof v === 'string' && v.length > 0 && v.length <= 60 ? v : undefined;
};

export const SOCIAL_ACTIONS: Record<SocialActionId, LifeActionRule> = {
  open_account: {
    parse: (params, content) => {
      const platformId = id(params, 'platformId');
      const nicheId = id(params, 'nicheId');
      const raw = field(params, 'handle');
      if (!only(params, ['platformId', 'handle', 'nicheId']) || platformId === undefined || nicheId === undefined || typeof raw !== 'string') return null;
      // The log keeps the tidy form of the handle (no @, lower case); a handle that is not allowed is not an action.
      return handleIssue(raw, content) === null ? { platformId, nicheId, handle: raw.trim().replace(/^@/, '').toLowerCase() } : null;
    },
    allowed: (state, p, content) => p.platformId !== undefined && p.nicheId !== undefined && p.handle !== undefined && openBlock(state, p.platformId, content, p.handle, p.nicheId) === null,
    apply: (state, p, content) => void openAccount(state, p.platformId!, p.handle!, p.nicheId!, content),
  },
  close_account: {
    parse: (params) => {
      const platformId = id(params, 'platformId');
      return only(params, ['platformId']) && platformId !== undefined ? { platformId } : null;
    },
    allowed: (state, p) => p.platformId !== undefined && closeBlock(state, p.platformId) === null,
    apply: (state, p) => closeAccount(state, p.platformId!),
  },
  set_private: {
    parse: (params) => {
      const platformId = id(params, 'platformId');
      const on = field(params, 'on');
      return only(params, ['platformId', 'on']) && platformId !== undefined && typeof on === 'boolean' ? { platformId, on } : null;
    },
    allowed: (state, p) => p.platformId !== undefined && state.social.accounts[p.platformId]?.private !== p.on,
    apply: (state, p) => setPrivate(state, p.platformId!, p.on === true),
  },
  post: {
    parse: (params) => {
      const platformId = id(params, 'platformId');
      const tone = field(params, 'tone');
      return only(params, ['platformId', 'tone']) && platformId !== undefined && typeof tone === 'string' && (SOCIAL_TONES as readonly string[]).includes(tone) ? { platformId, tone: tone as SocialTone } : null;
    },
    allowed: (state, p, content) => p.platformId !== undefined && p.tone !== undefined && postBlock(state, p.platformId, content) === null,
    apply: (state, p, content) => void post(state, p.platformId!, p.tone!, content, state.rng),
  },
  cross_promote: {
    parse: (params) => {
      const fromId = id(params, 'fromId');
      const toId = id(params, 'toId');
      return only(params, ['fromId', 'toId']) && fromId !== undefined && toId !== undefined ? { fromId, toId } : null;
    },
    allowed: (state, p, content) => p.fromId !== undefined && p.toId !== undefined && crossBlock(state, p.fromId, p.toId, content) === null,
    apply: (state, p, content) => void crossPromote(state, p.fromId!, p.toId!, content),
  },
  collab: {
    parse: (params) => {
      const platformId = id(params, 'platformId');
      const personId = id(params, 'personId');
      return only(params, ['platformId', 'personId']) && platformId !== undefined && personId !== undefined ? { platformId, personId } : null;
    },
    allowed: (state, p, content) => p.platformId !== undefined && p.personId !== undefined && collabBlock(state, p.platformId, p.personId, content) === null,
    apply: (state, p, content) => void collab(state, p.platformId!, p.personId!, content),
  },
  promote_work: {
    parse: (params) => {
      const platformId = id(params, 'platformId');
      return only(params, ['platformId']) && platformId !== undefined ? { platformId } : null;
    },
    allowed: (state, p, content) => p.platformId !== undefined && promoteBlock(state, p.platformId, content) === null,
    apply: (state, p, content) => void promoteWork(state, p.platformId!, content),
  },
};

export type { LifeActionParams };
