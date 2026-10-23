/**
 * The social effects events can have (Batch 8): your following moves, your
 * engagement moves, you take your accounts private or public, you open or close
 * an account, a platform pays you again after an appeal, a row blows over or you
 * are cancelled. The engine ignores what does not fit (no account, a platform
 * you cannot join) and never breaks a rule: nobody under the platform's age
 * joins, and a minor's account needs a parent present.
 */
import type { ContentBundle, Effect } from '../../content/schemas';
import { clampInt } from '../random';
import { signContract } from '../fame/ladder';
import { writeFromGroup } from '../systems/history';
import type { RngState } from '../rng';
import type { Id, LifeState } from '../types';
import { openAccount, openBlock, closeAccount } from './accounts';
import { accountList, bestNiche, focusAccount, handleSuggestion, platformOf } from './query';
import { cancel } from './step';

type SocialEffect = Extract<Effect, { type: 'social' }>;

export function applySocialEffect(state: LifeState, effect: SocialEffect, content: ContentBundle, rng: RngState): void {
  const s = state.social;
  const target = effect.platform !== undefined ? s.accounts[effect.platform] : focusAccount(state);
  switch (effect.action) {
    case 'followers':
      if (target) {
        target.followers = Math.max(0, Math.min(content.balance.social.growth[platformOf(content, target.platform)!.growth].cap, Math.round(target.followers * (1 + (effect.delta ?? 0) / 100))));
        target.peak = Math.max(target.peak, target.followers);
      }
      return;
    case 'engagement':
      if (target) target.engagement = clampInt(target.engagement + (effect.delta ?? 0), 0, 100);
      return;
    case 'private':
      for (const a of accountList(state)) a.private = effect.value === true;
      return;
    case 'open': {
      const id = effect.platform;
      if (id === undefined || !platformOf(content, id)) return;
      const handle = handleSuggestion(state, content, Object.keys(s.accounts).length + s.totals.opened);
      if (openBlock(state, id, content, handle) === null) openAccount(state, id, handle, bestNiche(state, content).id, content);
      return;
    }
    case 'close':
      if (target) closeAccount(state, target.platform);
      return;
    case 'restore':
      for (const a of accountList(state)) if (a.demonetized >= state.currentYear && (effect.platform === undefined || a.platform === effect.platform)) a.demonetized = 0;
      return;
    case 'clear':
      if (s.controversy?.stage === 'brewing') s.controversy = null;
      return;
    case 'cancel':
      if (accountList(state).length > 0) cancel(state, content, rng);
      return;
    case 'sponsor': {
      // A deal with a brand, for a creator: the social media path is the one the brands sign (a parent signs for anyone under 18).
      const f = state.fame;
      if (f.active && f.main === 'social' && accountList(state).length > 0 && effect.terms !== undefined && signContract(state, effect.terms, content, rng, 'brand')) {
        writeFromGroup(state, content.text.social.history.sponsor, ['social', 'sponsor'], { values: {} }, content);
        s.totals.sponsorships += 1;
      }
      return;
    }
  }
}

export type { Id };
