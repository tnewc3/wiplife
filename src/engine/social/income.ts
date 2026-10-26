/**
 * What the platforms pay (Batch 8): each platform pays by its own model, once
 * your account passes its threshold and you keep posting: a share of ad money
 * (YouTube), subscriptions and donations (Twitch), a creator fund (TikTok),
 * ad reads (podcasts), a premium share (X) and brand deals (Instagram). A
 * sponsorship is a contract with a fictional brand (E6b's contracts) that pays
 * for the followers you have everywhere. Private accounts, demonetized accounts
 * and accounts that stopped posting earn nothing from the platform. The year's
 * pay is set aside here for the ledger (economy.ts reads it through
 * `socialIncome`), less an agent's cut and, under 18, a share held in trust.
 * Numbers: balance/social.yaml.
 */
import type { ContentBundle } from '../../content/schemas';
import { wholeDollars } from '../finance';
import { agentDef } from '../fame/work';
import { payLevel } from '../fame/query';
import { isMinorStar } from '../fame/query';
import type { Id, LifeState, SocialAccount } from '../types';
import { accountList, engagementFactor, platformBudget, platformOf } from './query';

/** What one account's platform pays for a year of `posts` posts (0 when it does not pay: below the threshold, private, demonetized, too few posts). */
export function platformPay(state: LifeState, account: SocialAccount, posts: number, year: number, content: ContentBundle): number {
  const platform = platformOf(content, account.platform);
  if (!platform || account.monetized === 0 || account.private || account.demonetized >= year) return 0;
  const pay = content.balance.social.pay[platform.pay];
  if (account.followers < pay.threshold || posts < pay.minPosts) return 0;
  const budget = platformBudget(state, platform, content);
  const units = pay.perPost ? posts : Math.min(1, posts / budget);
  return account.followers * pay.rate * units * engagementFactor(account.engagement, content) * payLevel(state, content);
}

/** What a sponsorship pays for one account (0 without a brand contract). */
export function sponsorPay(state: LifeState, account: SocialAccount, content: ContentBundle): number {
  const c = state.fame.contract;
  const company = c ? content.fameCompanies[c.company] : undefined;
  if (!c || c.path !== 'social' || company?.kind !== 'brand' || !state.fame.active) return 0;
  const b = content.balance.social;
  if (account.private || account.followers < b.sponsor.minFollowers) return 0;
  const niche = content.niches[account.niche];
  const tier = b.sponsor.tier[Math.min(b.sponsor.tier.length, Math.max(1, company.tier)) - 1] ?? 1;
  return account.followers * (b.platforms[account.platform]?.brand ?? 0) * b.sponsor.rate * b.sponsor.terms[c.terms] * tier * (niche?.brands ?? 1) * engagementFactor(account.engagement, content) * payLevel(state, content);
}

/** Whether you have a sponsorship with a brand now. */
export function hasSponsor(state: LifeState, content: ContentBundle): boolean {
  const c = state.fame.contract;
  return state.fame.active && c !== null && c.path === 'social' && content.fameCompanies[c.company]?.kind === 'brand';
}

export interface IncomeParts {
  byPlatform: Record<Id, number>;
  byModel: Record<Id, number>;
  gross: number;
}

/** Everything the year's posts earned, by platform and by pay model (whole dollars). `postsOf`: posts made last year, by platform. */
export function yearEarnings(state: LifeState, postsOf: Record<Id, number>, year: number, content: ContentBundle): IncomeParts {
  const parts: IncomeParts = { byPlatform: {}, byModel: {}, gross: 0 };
  for (const a of accountList(state)) {
    const platform = platformOf(content, a.platform);
    if (!platform) continue;
    const fromPlatform = platformPay(state, a, postsOf[a.platform] ?? 0, year, content);
    const fromBrand = (postsOf[a.platform] ?? 0) > 0 ? sponsorPay(state, a, content) : 0;
    const own = wholeDollars(fromPlatform);
    const brand = wholeDollars(fromBrand);
    if (own > 0) {
      parts.byPlatform[a.platform] = (parts.byPlatform[a.platform] ?? 0) + own;
      parts.byModel[platform.pay] = (parts.byModel[platform.pay] ?? 0) + own;
    }
    if (brand > 0) {
      parts.byPlatform[a.platform] = (parts.byPlatform[a.platform] ?? 0) + brand;
      parts.byModel.brand_deals = (parts.byModel.brand_deals ?? 0) + brand;
    }
    parts.gross += own + brand;
  }
  return parts;
}

/** Sets the year's pay aside for the ledger: the agent's cut comes off, and under 18 a share is held in trust by a parent. */
export function settleSocialIncome(state: LifeState, parts: IncomeParts, content: ContentBundle): void {
  const agent = state.fame.active ? agentDef(state, content) : undefined;
  const cut = agent ? wholeDollars(parts.gross * agent.cut) : 0;
  const net = Math.max(0, parts.gross - cut);
  let trust = 0;
  if (isMinorStar(state, content) && net > 0) {
    trust = wholeDollars(net * content.balance.fame.minors.trust);
    if (trust > 0) {
      const held = state.finances.trust;
      state.finances.trust = {
        balance: wholeDollars((held?.balance ?? 0) + trust),
        releaseAge: held?.releaseAge ?? content.balance.economy.independenceAge,
      };
    }
  }
  state.social.income = { year: state.currentYear, gross: parts.gross, agent: cut, trust, byPlatform: parts.byPlatform, byModel: parts.byModel };
  state.social.totals.earned += Math.max(0, net - trust);
  for (const [id, amount] of Object.entries(parts.byPlatform)) {
    const a = state.social.accounts[id];
    if (a) a.earned += amount;
  }
}
