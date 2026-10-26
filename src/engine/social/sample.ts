/**
 * The event sandbox's social state (Batch 8): gives a previewed life the
 * accounts, followers, pay, row or happening an event's requirements ask for.
 * Not used by the game itself.
 */
import type { Compare, Condition, ContentBundle, EventDef, SocialCondition } from '../../content/schemas';
import { enterPath } from '../fame/ladder';
import type { Id, LifeState } from '../types';
import { openAccount } from './accounts';
import { bestNiche, handleSuggestion, platformList } from './query';

function wanted(condition: Condition | undefined): SocialCondition {
  const out: SocialCondition = {};
  const walk = (c: Condition | undefined) => {
    if (!c) return;
    if ('all' in c) c.all.forEach(walk);
    else if ('social' in c) Object.assign(out, c.social);
  };
  walk(condition);
  return out;
}

const low = (c: Compare | undefined): number | undefined => (c === undefined ? undefined : (c.eq ?? c.gte ?? (c.gt === undefined ? undefined : c.gt + 1)));

const SOCIAL_WORDS = /\{(platform|handle|followerWords|niche|postNoun)\}/;

export function giveSampleSocial(state: LifeState, def: EventDef, _cast: Record<string, Id>, content: ContentBundle): void {
  const want = wanted(def.requires);
  const uses = SOCIAL_WORDS.test(JSON.stringify(def)) || def.category.startsWith('social') || Object.keys(want).length > 0;
  if (!uses || want.account === false) return;
  const year = state.currentYear;
  if (want.creator === true && !state.fame.active) enterPath(state, 'social', 'after_viral', content);
  const platformId = want.platform?.[0] ?? (state.social.accounts.tiktok ? 'tiktok' : (platformList(content)[0]?.id ?? 'tiktok'));
  if (!state.social.accounts[platformId]) openAccount(state, platformId, handleSuggestion(state, content, 0), bestNiche(state, content).id, content);
  const a = state.social.accounts[platformId];
  if (!a) return;
  a.followers = Math.max(a.followers, low(want.top) ?? low(want.followers) ?? 3000);
  a.peak = Math.max(a.peak, a.followers);
  if (want.private === true) a.private = true;
  if (want.private === false) a.private = false;
  if (want.monetized === true) a.monetized = year;
  if (want.demonetized === true) a.demonetized = year;
  if (want.controversy !== undefined && want.controversy !== false) {
    const stage = Array.isArray(want.controversy) ? want.controversy[0]! : 'brewing';
    state.social.controversy = { year: stage === 'cancelled' ? year - 1 : year, platform: platformId, stage, lost: {} };
  }
  if (want.happened) state.social.happened = { year, triggers: [...want.happened] };
}
