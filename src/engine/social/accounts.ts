/**
 * Accounts and posting (Batch 8): opening an account on a platform with a
 * handle you type, closing it, keeping it private, posting inside the year's
 * budget (each post this year counts less than the one before), crossing over
 * to another of your accounts, making something with a creator you know, and
 * promoting your music, film or season to the followers you have. Everything
 * takes effect at once, between years; the platforms pay, the audience fades
 * and the career follows in the social step as the next year begins. Numbers:
 * balance/social.yaml.
 */
import type { ContentBundle, SocialPlatformDef, SocialTone } from '../../content/schemas';
import { curveAt, powInt } from '../curve';
import { isIncarcerated } from '../legal';
import { clampInt, rollNormal } from '../random';
import { chance, type RngState } from '../rng';
import { writeFromGroup } from '../systems/history';
import { aptitude } from '../fame/work';
import { hasTalentFor, isMinorStar, pathDef, workedPaths } from '../fame/query';
import { renderText } from '../text';
import type { Id, LifeState, SocialAccount, SocialPostResult } from '../types';
import {
  bestNiche,
  collabCandidates,
  creatorFollowers,
  engagementFactor,
  followerWords,
  handleSuggestion,
  joinAge,
  nicheFit,
  parentPresent,
  parseHandle,
  platformBudget,
  platformList,
  platformOf,
  postsThisYear,
  yearNow,
  yearView,
} from './query';

export type OpenBlock = 'unknown' | 'niche' | 'handle' | 'have' | 'age' | 'prison' | 'parent';

/** Why you can't open an account on this platform now, or null. `handle` and `nicheId` are checked when given. */
export function openBlock(state: LifeState, platformId: Id, content: ContentBundle, handle?: string, nicheId?: Id): OpenBlock | null {
  const platform = platformOf(content, platformId);
  if (!platform) return 'unknown';
  if (state.social.accounts[platformId]) return 'have';
  if (isIncarcerated(state)) return 'prison';
  if (state.character.age < joinAge(state, platform, content)) return 'age';
  if (isMinorStar(state, content) && !parentPresent(state)) return 'parent';
  if (nicheId !== undefined && (!content.niches[nicheId] || content.niches[nicheId]!.retired)) return 'niche';
  if (handle !== undefined && parseHandle(handle, content) === null) return 'handle';
  return null;
}

/** You open an account: a few followers from the people who know you, and a niche. Under 18, a parent set it up and it starts private. */
export function openAccount(state: LifeState, platformId: Id, handle: string, nicheId: Id, content: ContentBundle): SocialAccount | null {
  if (openBlock(state, platformId, content, handle, nicheId) !== null) return null;
  const b = content.balance.social;
  const minor = isMinorStar(state, content);
  const account: SocialAccount = {
    platform: platformId,
    handle: parseHandle(handle, content)!,
    niche: nicheId,
    followers: Math.round(b.start.followers + (state.character.personality.sociability / 100) * b.start.perSociability * 100),
    engagement: b.start.engagement,
    since: state.currentYear,
    private: minor,
    byParent: minor,
    posts: 0,
    quality: b.start.quality,
    monetized: 0,
    demonetized: 0,
    earned: 0,
    peak: 0,
  };
  account.peak = account.followers;
  state.social.accounts[platformId] = account;
  state.social.totals.opened += 1;
  const platform = platformOf(content, platformId)!;
  writeFromGroup(
    state,
    content.text.social.history.opened,
    ['social', 'opened'],
    { values: { platform: platform.name, handle: account.handle, followerWords: followerWords(account.followers, content) } },
    content,
  );
  return account;
}

export function closeBlock(state: LifeState, platformId: Id): 'none' | null {
  return state.social.accounts[platformId] ? null : 'none';
}

/** You close an account: its followers go with it. The career, if you have one, follows your reach down. */
export function closeAccount(state: LifeState, platformId: Id): void {
  delete state.social.accounts[platformId];
}

/** You make an account private (few people see it, it earns nothing and grows slowly) or public again. */
export function setPrivate(state: LifeState, platformId: Id, on: boolean): void {
  const a = state.social.accounts[platformId];
  if (a) a.private = on;
}

// ── Posting ─────────────────────────────────────────────────────────────────

export type PostBlock = 'none' | 'prison' | 'budget';

/** Why you can't post on this platform now, or null. */
export function postBlock(state: LifeState, platformId: Id, content: ContentBundle): PostBlock | null {
  const platform = platformOf(content, platformId);
  if (!platform || !state.social.accounts[platformId]) return 'none';
  if (isIncarcerated(state)) return 'prison';
  if (postsThisYear(state, platformId) >= platformBudget(state, platform, content)) return 'budget';
  return null;
}

/** The posts left this year on a platform. */
export function postsLeft(state: LifeState, platform: SocialPlatformDef, content: ContentBundle): number {
  return Math.max(0, platformBudget(state, platform, content) - postsThisYear(state, platform.id));
}

/** The quality of a post (0–100): what you bring, the niche, craft, a talent that fits, and a roll that spreads wider for a bold post. */
export function rollPostQuality(state: LifeState, account: SocialAccount, tone: SocialTone, content: ContentBundle, rng: RngState): number {
  const q = content.balance.social.quality;
  const def = pathDef(content, 'social');
  const niche = content.niches[account.niche]!;
  const path = state.fame.paths.social;
  const talent = state.character.hidden.talent;
  const gifted = talent !== null && (niche.talents.includes(talent) || (def !== undefined && hasTalentFor(state, def)));
  const bold = tone === 'bold';
  const base =
    q.base +
    q.aptitude * (def ? aptitude(state, def) : 0.5) +
    q.fit * nicheFit(state, niche) +
    q.craft * (path?.craft ?? 0) +
    (gifted ? q.talent : 0) +
    (bold ? q.bold.quality : 0);
  return clampInt(Math.round(base + rollNormal(rng, { mean: 0, sd: q.noise * (bold ? q.bold.spread : 1) })), 0, 100);
}

/** The algorithm's mood on a platform this year: 1, or the boost or the drop. */
export function algorithmFactor(state: LifeState, platformId: Id, content: ContentBundle): number {
  const a = state.social.algorithm;
  if (a.year !== state.currentYear) return 1;
  const shift = a.shifts[platformId];
  return shift === 'up' ? content.balance.social.algorithm.boost : shift === 'down' ? content.balance.social.algorithm.drop : 1;
}

/**
 * What the next post would win in followers if it is neither viral nor flat
 * (reads only): the platform's base and your following, times the quality
 * multiplier, the niche, the new-account boost, the diminishing return for the
 * posts already made this year, the algorithm and a bold post's reach.
 */
export function postGain(state: LifeState, account: SocialAccount, quality: number, tone: SocialTone, content: ContentBundle): number {
  const b = content.balance.social;
  const platform = platformOf(content, account.platform)!;
  const g = b.growth[platform.growth];
  const niche = content.niches[account.niche]!;
  const fresh = account.followers < g.newBelow ? g.newBoost : 1;
  const dim = powInt(b.budget.repeat, postsThisYear(state, account.platform));
  const priv = account.private ? b.private.growth : 1;
  const bold = tone === 'bold' ? b.gain.bold : 1;
  const room = Math.max(0, 1 - account.followers / g.cap);
  const compounding = (g.compound * account.followers) / (1 + account.followers / b.gain.knee);
  return (g.base + compounding) * room * curveAt(b.gain.quality, quality) * niche.demand * fresh * dim * algorithmFactor(state, account.platform, content) * priv * bold;
}

/** Posts: the quality roll, then followers (and a chance it goes viral), the account's quality, and the chance it is one you would not want certain people to see. */
export function post(state: LifeState, platformId: Id, tone: SocialTone, content: ContentBundle, rng: RngState): SocialPostResult | null {
  if (postBlock(state, platformId, content) !== null) return null;
  const b = content.balance.social;
  const account = state.social.accounts[platformId]!;
  const platform = platformOf(content, platformId)!;
  const g = b.growth[platform.growth];
  const quality = rollPostQuality(state, account, tone, content, rng);
  const gained0 = Math.round(postGain(state, account, quality, tone, content));
  let gained = gained0;
  let outcome: SocialPostResult['outcome'] = 'steady';
  const qm = curveAt(b.gain.quality, quality);
  if (qm < b.quality.outcome.flat) outcome = 'flat';
  else if (qm >= b.quality.outcome.strong) outcome = 'strong';
  const viralChance = account.private ? 0 : curveAt(b.viral.chance, quality) * (tone === 'bold' ? b.viral.bold : 1);
  const y = yearNow(state);
  if (chance(rng, viralChance)) {
    gained += Math.min(Math.max(0, g.cap - account.followers - gained), Math.max(g.viralMin, Math.round(account.followers * (g.viral - 1))));
    outcome = 'viral';
    if (!y.viral.includes(platformId)) y.viral.push(platformId);
    state.social.totals.viral += 1;
    state.character.stats.happiness = clampInt(state.character.stats.happiness + 2, 0, 100);
  }
  account.followers += gained;
  account.peak = Math.max(account.peak, account.followers);
  account.posts += 1;
  account.quality = clampInt(Math.round(account.quality + (quality - account.quality) * b.quality.follow), 0, 100);
  y.posts[platformId] = (y.posts[platformId] ?? 0) + 1;
  y.quality[platformId] = (y.quality[platformId] ?? 0) + quality;
  if (tone === 'bold') y.bold += 1;
  // Something you would not want certain people to see: more likely when you say the bold thing.
  const risky = Math.min(1, b.casual.risky * (tone === 'bold' ? b.casual.bold : 1));
  if (chance(rng, risky) && Object.values(y.risky).reduce((a, n) => a + n, 0) < b.casual.max) y.risky[platformId] = (y.risky[platformId] ?? 0) + 1;
  state.social.totals.posts += 1;
  const result: SocialPostResult = { year: state.currentYear, platform: platformId, outcome, gained, bold: tone === 'bold' };
  state.social.last = result;
  return result;
}

/** The sentence for a post's outcome, picked by the post itself so it reads the same every time it is shown. */
export function outcomeLine(result: SocialPostResult, state: LifeState, content: ContentBundle): string {
  const lines = content.text.social.outcomes[result.outcome];
  const i = (result.year + result.gained + state.social.totals.posts) % lines.length;
  const a = state.social.accounts[result.platform];
  const platform = platformOf(content, result.platform);
  return renderText(lines[i]!, { values: { platform: platform?.name ?? '', handle: a?.handle ?? '' } });
}

// ── Cross-promotion ─────────────────────────────────────────────────────────

export type CrossBlock = 'none' | 'same' | 'prison' | 'private' | 'small' | 'budget' | 'done';

/** Why you can't send the followers of one of your accounts to another, or null. */
export function crossBlock(state: LifeState, fromId: Id, toId: Id, content: ContentBundle): CrossBlock | null {
  const from = state.social.accounts[fromId];
  const to = state.social.accounts[toId];
  if (!from || !to) return 'none';
  if (fromId === toId) return 'same';
  if (isIncarcerated(state)) return 'prison';
  if (from.private || to.private) return 'private';
  const b = content.balance.social;
  if (from.followers < b.cross.minFollowers) return 'small';
  const y = yearView(state);
  if (y.crossed.includes(`${fromId}>${toId}`)) return 'done';
  if (y.crossed.length >= b.budget.crossPromos) return 'budget';
  return null;
}

/** Your followers on one account are pointed at another: a share of them follow, and the audience you spoke to hears from you again. */
export function crossPromote(state: LifeState, fromId: Id, toId: Id, content: ContentBundle): number {
  if (crossBlock(state, fromId, toId, content) !== null) return 0;
  const b = content.balance.social;
  const from = state.social.accounts[fromId]!;
  const to = state.social.accounts[toId]!;
  const toCap = content.balance.social.growth[platformOf(content, toId)!.growth].cap;
  const moved = Math.min(Math.max(0, toCap - to.followers), Math.round(from.followers * b.cross.share * engagementFactor(from.engagement, content)));
  to.followers += moved;
  to.peak = Math.max(to.peak, to.followers);
  from.engagement = clampInt(from.engagement + b.cross.engagement, 0, 100);
  yearNow(state).crossed.push(`${fromId}>${toId}`);
  state.social.totals.crossPromos += 1;
  return moved;
}

// ── Collaborations ──────────────────────────────────────────────────────────

export type CollabBlock = 'none' | 'prison' | 'private' | 'person' | 'budget';

/** Why you can't make something with this person on this platform, or null. */
export function collabBlock(state: LifeState, platformId: Id, personId: Id, content: ContentBundle): CollabBlock | null {
  const a = state.social.accounts[platformId];
  if (!a) return 'none';
  if (isIncarcerated(state)) return 'prison';
  if (a.private) return 'private';
  if (!collabCandidates(state, content).some((c) => c.id === personId)) return 'person';
  if (yearView(state).collabs.length >= content.balance.social.budget.collabs) return 'budget';
  return null;
}

/** You make something with a creator you know: a share of their following comes over, and the two of you are closer for it. */
export function collab(state: LifeState, platformId: Id, personId: Id, content: ContentBundle): number {
  if (collabBlock(state, platformId, personId, content) !== null) return 0;
  const b = content.balance.social.collab;
  const a = state.social.accounts[platformId]!;
  const theirs = creatorFollowers(state, personId, content) ?? 0;
  const gained = Math.min(Math.max(0, content.balance.social.growth[platformOf(content, platformId)!.growth].cap - a.followers), Math.round(theirs * b.share * engagementFactor(a.engagement, content)));
  a.followers += gained;
  a.peak = Math.max(a.peak, a.followers);
  const rel = state.relationships[personId]!;
  rel.affection = clampInt(rel.affection + b.affection, 0, 100);
  yearNow(state).collabs.push(personId);
  state.social.totals.collabs += 1;
  return gained;
}

// ── Promoting your work ─────────────────────────────────────────────────────

export type PromoteBlock = 'none' | 'prison' | 'private' | 'small' | 'career' | 'work' | 'budget' | 'done';

/** The path whose work you can promote: a career in music, acting, writing and art or a sport, that put something out lately. */
export function promotablePath(state: LifeState, content: ContentBundle): Id | null {
  const f = state.fame;
  if (!f.active) return null;
  for (const id of workedPaths(state)) {
    if (id === 'social') continue;
    const path = f.paths[id]!;
    if (pathDef(content, id) && path.last >= state.currentYear - 1) return id;
  }
  return null;
}

/** Why you can't promote your work on this platform, or null. */
export function promoteBlock(state: LifeState, platformId: Id, content: ContentBundle): PromoteBlock | null {
  const a = state.social.accounts[platformId];
  if (!a) return 'none';
  if (isIncarcerated(state)) return 'prison';
  if (a.private) return 'private';
  const b = content.balance.social;
  if (a.followers < b.promo.minFollowers) return 'small';
  if (!state.fame.active) return 'career';
  if (promotablePath(state, content) === null) return 'work';
  const y = yearView(state);
  if (y.promoted.includes(platformId)) return 'done';
  if (y.promoted.length >= b.budget.promos || postBlock(state, platformId, content) !== null) return 'budget';
  return null;
}

/** You tell your followers about your work: some become fans, fans feel closer to you, and it is a post on that platform. Returns the fans won. */
export function promoteWork(state: LifeState, platformId: Id, content: ContentBundle): number {
  if (promoteBlock(state, platformId, content) !== null) return 0;
  const b = content.balance.social;
  const a = state.social.accounts[platformId]!;
  const f = state.fame;
  const pathId = promotablePath(state, content)!;
  const path = f.paths[pathId]!;
  const fans = Math.round(a.followers * b.promo.fans * engagementFactor(a.engagement, content));
  f.fans += fans;
  f.mood = clampInt(f.mood + b.promo.mood, 0, 100);
  path.fame = Math.min(100, path.fame + b.promo.fame);
  const y = yearNow(state);
  y.promoted.push(platformId);
  y.posts[platformId] = (y.posts[platformId] ?? 0) + 1;
  y.quality[platformId] = (y.quality[platformId] ?? 0) + a.quality;
  a.posts += 1;
  state.social.totals.posts += 1;
  state.social.totals.promos += 1;
  return fans;
}


/** A creator's first account, opened as the career begins: on the platform the route starts at (the first that has one), with a handle suggested for you and your best niche. Draws nothing from the generator. */
export function startCreatorAccount(state: LifeState, routeId: Id | undefined, content: ContentBundle): void {
  const list = platformList(content);
  const platform = list.find((p) => routeId !== undefined && p.routes.includes(routeId)) ?? list.find((p) => p.routes.length > 0) ?? list[0];
  if (!platform) return;
  const handle = handleSuggestion(state, content, state.social.totals.opened);
  if (openBlock(state, platform.id, content, handle) === null) openAccount(state, platform.id, handle, bestNiche(state, content).id, content);
}
