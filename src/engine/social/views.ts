/**
 * What the Social screen shows (Batch 8): your accounts with their followers
 * in words and numbers, how many posts each has left this year, what each
 * platform pays and whether it does yet, the platforms you could join and why
 * you can't join one, the creators you know, and what your reach has done for
 * your career. Reads only.
 */
import type { ContentBundle } from '../../content/schemas';
import { isMinorStar, pathDef, rungDef } from '../fame/query';
import { isIncarcerated } from '../legal';
import type { Id, LifeState, SocialPostResult } from '../types';
import { collabBlock, crossBlock, openBlock, outcomeLine, postBlock, postGain, postsLeft, promoteBlock, type CollabBlock, type CrossBlock, type OpenBlock, type PostBlock, type PromoteBlock } from './accounts';
import { hasSponsor } from './income';
import {
  accountList,
  collabCandidates,
  engagementWords,
  followerNumber,
  followerWords,
  handleSuggestion,
  isCreator,
  joinAge,
  nicheFit,
  nicheList,
  platformBudget,
  platformList,
  platformOf,
  postsThisYear,
  reachOf,
  totalFollowers,
  yearView,
} from './query';

export interface AccountView {
  platform: Id;
  platformName: string;
  handle: string;
  nicheName: string;
  followers: number;
  followersText: string;
  followerWords: string;
  engagementWords: string;
  private: boolean;
  byParent: boolean;
  /** The platform's pay model (the screen's words for it are in ui/labels.ts), whether it pays you now, whether it has stopped, and the followers it asks for. */
  payModel: string;
  paying: boolean;
  demonetized: boolean;
  threshold: number;
  postVerb: string;
  postNoun: string;
  postPlural: string;
  budget: number;
  done: number;
  left: number;
  postBlock: PostBlock | null;
  /** What a typical next post would win (a rough figure, in followers). */
  typical: number;
  /** What the platform paid this year, and in all. */
  paidThisYear: number;
  earned: number;
  promoteBlock: PromoteBlock | null;
}

export interface PlatformOptionView {
  id: Id;
  name: string;
  blurb: string;
  age: number;
  payModel: string;
  block: OpenBlock | null;
}

export interface CrossView {
  fromId: Id;
  toId: Id;
  label: string;
  block: CrossBlock | null;
}

export interface CollabView {
  personId: Id;
  name: string;
  followers: number;
  followerWords: string;
  platforms: { id: Id; name: string; block: CollabBlock | null }[];
}

export interface SocialView {
  /** You are between years and free to use a phone. */
  canAct: boolean;
  inPrison: boolean;
  creator: boolean;
  minor: boolean;
  /** The career's words when you have one: the rung's title and your fame in it. */
  career: { title: string; fame: number } | null;
  accounts: AccountView[];
  platforms: PlatformOptionView[];
  niches: { id: Id; name: string; blurb: string; fit: number }[];
  suggestion: string;
  reach: number;
  reachWords: string;
  followers: number;
  incomeThisYear: number;
  incomeByPlatform: { id: Id; name: string; model: string; amount: number }[];
  sponsor: { company: string } | null;
  crossPromos: { left: number; options: CrossView[] };
  collabs: { left: number; people: CollabView[] };
  last: { text: string; platformName: string; result: SocialPostResult } | null;
  controversy: 'brewing' | 'cancelled' | null;
  algorithm: { platformName: string; mood: 'up' | 'down' }[];
}

export function getSocialView(state: LifeState, content: ContentBundle): SocialView {
  const s = state.social;
  const year = state.currentYear;
  const b = content.balance.social;
  const inPrison = isIncarcerated(state);
  const canAct = state.phase === 'yearStart' && !inPrison;
  const y = yearView(state);
  const accounts = accountList(state);
  const accountViews: AccountView[] = accounts.flatMap((a) => {
    const platform = platformOf(content, a.platform);
    if (!platform) return [];
    const pay = b.pay[platform.pay];
    return [
      {
        platform: a.platform,
        platformName: platform.name,
        handle: a.handle,
        nicheName: content.niches[a.niche]?.name ?? '',
        followers: a.followers,
        followersText: followerNumber(a.followers),
        followerWords: followerWords(a.followers, content),
        engagementWords: engagementWords(a.engagement, content),
        private: a.private,
        byParent: a.byParent,
        payModel: platform.pay,
        paying: a.monetized > 0 && a.demonetized < year && !a.private,
        demonetized: a.demonetized >= year,
        threshold: pay.threshold,
        postVerb: platform.verb,
        postNoun: platform.noun,
        postPlural: platform.plural,
        budget: platformBudget(state, platform, content),
        done: postsThisYear(state, a.platform),
        left: postsLeft(state, platform, content),
        postBlock: postBlock(state, a.platform, content),
        typical: Math.round(postGain(state, a, a.quality, 'safe', content)),
        paidThisYear: s.income.year === year ? (s.income.byPlatform[a.platform] ?? 0) : 0,
        earned: a.earned,
        promoteBlock: promoteBlock(state, a.platform, content),
      },
    ];
  });
  const crossOptions: CrossView[] = [];
  for (const from of accounts) {
    for (const to of accounts) {
      if (from.platform === to.platform) continue;
      crossOptions.push({
        fromId: from.platform,
        toId: to.platform,
        label: `${platformOf(content, from.platform)?.name ?? from.platform} to ${platformOf(content, to.platform)?.name ?? to.platform}`,
        block: crossBlock(state, from.platform, to.platform, content),
      });
    }
  }
  const collabPeople: CollabView[] = collabCandidates(state, content).map((c) => ({
    personId: c.id,
    name: state.people[c.id]!.name.first,
    followers: c.followers,
    followerWords: followerWords(c.followers, content),
    platforms: accounts.map((a) => ({ id: a.platform, name: platformOf(content, a.platform)?.name ?? a.platform, block: collabBlock(state, a.platform, c.id, content) })),
  }));
  const socialDef = pathDef(content, 'social');
  const socialPath = state.fame.paths.social;
  const career = isCreator(state) && socialDef && socialPath ? { title: rungDef(socialDef, socialPath.rung).title, fame: Math.floor(socialPath.fame) } : null;
  const incomeByPlatform = Object.entries(s.income.year === year ? s.income.byPlatform : {})
    .sort(([x], [z]) => (x < z ? -1 : 1))
    .map(([id, amount]) => ({ id, name: platformOf(content, id)?.name ?? id, model: platformOf(content, id)?.pay ?? '', amount }));
  const company = state.fame.contract ? content.fameCompanies[state.fame.contract.company]?.name : undefined;
  const last = s.last && s.last.year === year ? s.last : undefined;
  const reach = reachOf(state, content);
  return {
    canAct,
    inPrison,
    creator: isCreator(state),
    minor: isMinorStar(state, content),
    career,
    accounts: accountViews,
    platforms: platformList(content).map((p) => ({ id: p.id, name: p.name, blurb: p.blurb, age: joinAge(state, p, content), payModel: p.pay, block: openBlock(state, p.id, content) })),
    niches: nicheList(content).map((n) => ({ id: n.id, name: n.name, blurb: n.blurb, fit: Math.round(nicheFit(state, n) * 100) })),
    suggestion: handleSuggestion(state, content, s.totals.opened),
    reach,
    reachWords: followerWords(reach, content),
    followers: totalFollowers(state),
    incomeThisYear: s.income.year === year ? Math.max(0, s.income.gross - s.income.agent - s.income.trust) : 0,
    incomeByPlatform,
    sponsor: hasSponsor(state, content) && company ? { company } : null,
    crossPromos: { left: Math.max(0, b.budget.crossPromos - y.crossed.length), options: crossOptions },
    collabs: { left: Math.max(0, b.budget.collabs - y.collabs.length), people: collabPeople },
    last: last ? { text: outcomeLine(last, state, content), platformName: platformOf(content, last.platform)?.name ?? last.platform, result: last } : null,
    controversy: s.controversy?.stage ?? null,
    algorithm:
      s.algorithm.year === year
        ? Object.entries(s.algorithm.shifts)
            .sort(([x], [z]) => (x < z ? -1 : 1))
            .map(([id, mood]) => ({ platformName: platformOf(content, id)?.name ?? id, mood }))
        : [],
  };
}
