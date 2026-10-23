/**
 * Batch 8: social media. The platforms are content with their own growth and pay models; accounts have typed,
 * validated handles; posting stays inside a yearly budget with diminishing returns; each platform pays by its own
 * model through the ledger; a career's rung and fame follow reach; fans of other careers cross over; a post can
 * reach an employer, a partner, an ex or family through events and the gossip web; and the rules for anyone under
 * 18 hold in the engine.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { SOCIAL_GROWTH_MODELS, SOCIAL_PAY_MODELS, type ContentBundle } from '../../content/schemas';
import { isLifeActionAvailable, performAction } from '../actions';
import { playYear } from '../autoplay';
import { InvalidInputError } from '../creation/input';
import { enterPath } from '../fame/ladder';
import { runFame } from '../fame/step';
import { checkInvariants } from '../invariants';
import { createLife } from '../life';
import { replayLife } from '../replay';
import { cloneRng } from '../rng';
import { yearIncome } from '../systems/career';
import { lifeAtAge } from '../testFixtures';
import type { LifeState, SocialAccount } from '../types';
import { closeAccount, collab, crossPromote, openAccount, openBlock, post, postBlock, postGain, promoteWork, startCreatorAccount } from './accounts';
import { applySocialEffect } from './effects';
import { platformPay, sponsorPay, yearEarnings } from './income';
import { accountList, collabCandidates, creatorFollowers, emptySocial, followerWords, handleIssue, handleSuggestion, isCreator, parseHandle, platformBudget, platformList, reachOf, socialIncome } from './query';
import { cancel, queueSocialEvent, runSocial } from './step';
import { getSocialView } from './views';

const b = content.balance.social;
const apply = (life: LifeState, fn: (d: LifeState) => void) => produce(life, (d) => void fn(d as LifeState));
const ok = (life: LifeState) => expect(checkInvariants(life, content).filter((f) => !/input log|recap|lifetime|due in the past|lifeStage|housing.cityId|maximum age|its requirements are not met/.test(f))).toEqual([]);
const adult = (seed = 'social', age = 24) => lifeAtAge(seed, age);
const open = (life: LifeState, platform = 'tiktok', handle = 'quiet_fox', niche = 'gaming') => performAction(life, 'open_account', { platformId: platform, handle, nicheId: niche }, content);
/** A year goes by the way the app runs it: the social step, then the fame step. */
const step = (life: LifeState, bundle: ContentBundle = content) =>
  apply(life, (d) => {
    d.currentYear += 1;
    d.character.age += 1;
    runSocial(d, bundle);
    runFame(d, bundle);
  });
const account = (life: LifeState, platform = 'tiktok'): SocialAccount => life.social.accounts[platform]!;
/** Puts an account's followers where the test needs them. */
const withFollowers = (life: LifeState, platform: string, followers: number, extra: Partial<SocialAccount> = {}) =>
  apply(life, (d) => {
    const a = d.social.accounts[platform]!;
    a.followers = followers;
    a.peak = Math.max(a.peak, followers);
    Object.assign(a, extra);
  });

describe('the platforms', () => {
  it('are six, with the real names, each with its own growth model and its own way of paying', () => {
    const list = platformList(content);
    expect(list.map((p) => p.name).sort()).toEqual(['Instagram', 'Podcasts', 'TikTok', 'Twitch', 'X / Twitter', 'YouTube']);
    for (const model of SOCIAL_GROWTH_MODELS) expect(list.filter((p) => p.growth === model).length).toBe(1);
    for (const model of SOCIAL_PAY_MODELS) expect(list.filter((p) => p.pay === model).length).toBe(1);
    expect(new Set(list.map((p) => p.contentKind)).size).toBe(6);
    for (const p of list) expect(p.minAge).toBeGreaterThanOrEqual(13);
  });

  it('are the only real names: no brand, network or studio borrows one', () => {
    for (const c of Object.values(content.fameCompanies)) expect(c.name).not.toMatch(/instagram|tiktok|twitter|youtube|twitch/i);
    expect(Object.values(content.fameCompanies).filter((c) => c.path === 'social' && c.kind === 'brand').length).toBeGreaterThanOrEqual(3);
  });
});

describe('handles', () => {
  it('are checked: length, characters, edges, doubled marks, all digits, reserved and blocked words', () => {
    expect(handleIssue('', content)).toBe('empty');
    expect(handleIssue('ab', content)).toBe('short');
    expect(handleIssue('a'.repeat(31), content)).toBe('long');
    expect(handleIssue('has space', content)).toBe('chars');
    expect(handleIssue('émile', content)).toBe('chars');
    expect(handleIssue('.leading', content)).toBe('edges');
    expect(handleIssue('trailing_', content)).toBe('edges');
    expect(handleIssue('two..dots', content)).toBe('repeat');
    expect(handleIssue('12345', content)).toBe('digits');
    expect(handleIssue('admin', content)).toBe('reserved');
    expect(handleIssue('my_tiktok', content)).toBeNull();
    expect(handleIssue('sexy_nobody', content)).toBe('blocked');
    expect(handleIssue(42, content)).toBe('empty');
    expect(handleIssue('quiet.fox_9', content)).toBeNull();
  });

  it('are kept in their tidy form: no @, lower case', () => {
    expect(parseHandle('  @Quiet_Fox ', content)).toBe('quiet_fox');
    expect(parseHandle('no good!', content)).toBeNull();
  });

  it('are suggested without drawing anything from the generator, and a suggestion is always a handle you could type', () => {
    const life = adult('handle-suggest');
    const before = JSON.stringify(life.rng);
    const seen = new Set<string>();
    for (let n = 0; n < 40; n++) {
      const h = handleSuggestion(life, content, n);
      expect(handleIssue(h, content), h).toBeNull();
      seen.add(h);
    }
    expect(seen.size).toBeGreaterThan(20);
    expect(JSON.stringify(life.rng)).toBe(before);
  });
});

describe('opening an account', () => {
  it('takes a platform, a typed handle and a niche, and records them', () => {
    const life = open(adult('open'));
    const a = account(life);
    expect(a.handle).toBe('quiet_fox');
    expect(a.niche).toBe('gaming');
    expect(a.followers).toBeGreaterThan(0);
    expect(a.private).toBe(false);
    expect(a.byParent).toBe(false);
    expect(life.social.totals.opened).toBe(1);
    expect(life.inputLog.at(-1)).toEqual({ year: life.currentYear, kind: 'action', payload: { actionId: 'open_account', params: { platformId: 'tiktok', handle: 'quiet_fox', nicheId: 'gaming' } } });
    ok(life);
  });

  it('validates every input', () => {
    const life = adult('open-bad');
    for (const bad of [
      {},
      { platformId: 'tiktok', nicheId: 'gaming' },
      { platformId: 'tiktok', handle: 'x', nicheId: 'gaming' },
      { platformId: 'tiktok', handle: 'has space', nicheId: 'gaming' },
      { platformId: 'tiktok', handle: 'good_one', nicheId: 'gaming', extra: 1 },
      { platformId: 'myspace', handle: 'good_one', nicheId: 'gaming' },
      { platformId: 'tiktok', handle: 'good_one', nicheId: 'nothing' },
      { platformId: 'tiktok', handle: 12345678, nicheId: 'gaming' },
      null,
      'tiktok',
    ]) {
      expect(() => open_(life, bad), JSON.stringify(bad)).toThrow(InvalidInputError);
    }
  });

  it('is one account to a platform, and you can have all six', () => {
    let life = open(adult('open-all'), 'tiktok', 'one_fox');
    expect(() => open(life, 'tiktok', 'other_fox')).toThrow(InvalidInputError);
    for (const p of platformList(content).filter((x) => x.id !== 'tiktok')) life = open(life, p.id, `fox_on_${p.id}`);
    expect(accountList(life).length).toBe(6);
    ok(life);
  });

  it('keeps out anyone under the platform’s age, and a minor needs a parent', () => {
    expect(openBlock(lifeAtAge('open-12', 12), 'tiktok', content)).toBe('age');
    const thirteen = lifeAtAge('open-13', 13);
    expect(openBlock(thirteen, 'tiktok', content)).toBeNull();
    const orphan = apply(thirteen, (d) => {
      delete d.housing.guardianId;
      for (const p of Object.values(d.people)) if (d.relationships[p.id]?.kind === 'parent' || d.relationships[p.id]?.kind === 'stepparent') p.alive = false;
    });
    expect(openBlock(orphan, 'tiktok', content)).toBe('parent');
    expect(isLifeActionAvailable(orphan, 'open_account', { platformId: 'tiktok', handle: 'young_fox', nicheId: 'gaming' }, content)).toBe(false);
  });

  it('under 18 starts private, set up by a parent; from 18 it does not', () => {
    const teen = open(lifeAtAge('open-teen', 14));
    expect(account(teen).private).toBe(true);
    expect(account(teen).byParent).toBe(true);
    expect(account(open(adult('open-adult', 18))).byParent).toBe(false);
    ok(teen);
  });

  it('can be shut, and made private or public', () => {
    let life = open(adult('close'));
    life = performAction(life, 'set_private', { platformId: 'tiktok', on: true }, content);
    expect(account(life).private).toBe(true);
    expect(() => performAction(life, 'set_private', { platformId: 'tiktok', on: true }, content)).toThrow(InvalidInputError);
    life = performAction(life, 'close_account', { platformId: 'tiktok' }, content);
    expect(accountList(life)).toEqual([]);
    expect(() => performAction(life, 'close_account', { platformId: 'tiktok' }, content)).toThrow(InvalidInputError);
  });

  it('is not possible in prison', () => {
    const inside = apply(adult('open-prison'), (d) => void (d.housing.kind = 'incarcerated'));
    expect(openBlock(inside, 'tiktok', content)).toBe('prison');
  });
});

/** (A wrapper so the loop above reads as one call.) */
function open_(life: LifeState, params: unknown): LifeState {
  return performAction(life, 'open_account', params, content);
}

describe('posting', () => {
  it('stays inside the platform’s yearly budget, and a casual account has less than a creator', () => {
    let life = open(adult('post-budget'));
    const tiktok = platformList(content).find((p) => p.id === 'tiktok')!;
    const budget = platformBudget(life, tiktok, content);
    expect(budget).toBe(Math.round(b.growth.short_video.posts * b.budget.casualShare));
    for (let i = 0; i < budget; i++) life = performAction(life, 'post', { platformId: 'tiktok', tone: 'safe' }, content);
    expect(postBlock(life, 'tiktok', content)).toBe('budget');
    expect(() => performAction(life, 'post', { platformId: 'tiktok', tone: 'safe' }, content)).toThrow(InvalidInputError);
    expect(life.social.year.posts.tiktok).toBe(budget);
    const creator = apply(adult('post-creator'), (d) => void enterPath(d, 'social', 'after_viral', content));
    expect(isCreator(creator)).toBe(true);
    expect(platformBudget(creator, tiktok, content)).toBe(b.growth.short_video.posts);
    ok(life);
  });

  it('gives less for each post already made this year (diminishing returns)', () => {
    const life = open(adult('post-dim'));
    const gains: number[] = [];
    // (The same account each time, with more posts already made this year.)
    for (let i = 0; i < 6; i++) {
      const later = apply(life, (d) => {
        d.social.year.year = d.currentYear;
        d.social.year.posts = { tiktok: i };
      });
      gains.push(postGain(later, account(later), 60, 'safe', content));
    }
    for (let i = 1; i < gains.length; i++) expect(gains[i]!).toBeLessThan(gains[i - 1]!);
    expect(gains[1]! / gains[0]!).toBeCloseTo(b.budget.repeat, 5);
  });

  it('wins followers, counts the post, and a bold post says the bold thing', () => {
    let life = open(adult('post-win'));
    const before = account(life).followers;
    life = performAction(life, 'post', { platformId: 'tiktok', tone: 'bold' }, content);
    expect(account(life).followers).toBeGreaterThan(before);
    expect(account(life).posts).toBe(1);
    expect(life.social.year.bold).toBe(1);
    expect(life.social.last?.platform).toBe('tiktok');
    expect(life.social.totals.posts).toBe(1);
    expect(() => performAction(life, 'post', { platformId: 'tiktok', tone: 'loud' }, content)).toThrow(InvalidInputError);
    expect(() => performAction(life, 'post', { platformId: 'instagram', tone: 'safe' }, content)).toThrow(InvalidInputError);
  });

  it('is slower on a private account', () => {
    const pub = open(adult('post-priv'));
    const priv = performAction(pub, 'set_private', { platformId: 'tiktok', on: true }, content);
    expect(postGain(priv, account(priv), 60, 'safe', content)).toBeCloseTo(postGain(pub, account(pub), 60, 'safe', content) * b.private.growth, 5);
  });

  it('records every input and a life using it replays exactly from the log', () => {
    let life = createLife({ mode: 'random', seed: 'social-replay', birthYear: 1990, countryId: 'us' }, content);
    while (life.character.age < 19) life = playYear(life, content);
    life = open(life, 'youtube', 'replay_fox', 'tech');
    life = performAction(life, 'post', { platformId: 'youtube', tone: 'safe' }, content);
    life = performAction(life, 'post', { platformId: 'youtube', tone: 'bold' }, content);
    life = performAction(life, 'set_private', { platformId: 'youtube', on: true }, content);
    life = playYear(life, content);
    expect(replayLife(life.inputLog, content)).toEqual(life);
  });
});

describe('what the platforms pay', () => {
  /** An account of this platform with this many followers, monetized, with a year of posts made. */
  const earning = (platform: string, followers: number, posts?: number, extra: Partial<SocialAccount> = {}) => {
    const life = withFollowers(open(adult(`pay-${platform}`), platform, `fox_on_${platform}`), platform, followers, { monetized: 2000, engagement: 50, ...extra });
    const def = platformList(content).find((p) => p.id === platform)!;
    const n = posts ?? platformBudget(life, def, content);
    return { life, n, pay: platformPay(life, account(life, platform), n, life.currentYear, content) };
  };

  it('each pays by its own model, once past its own threshold', () => {
    const models = new Set<string>();
    for (const p of platformList(content)) {
      const pay = b.pay[p.pay];
      const above = earning(p.id, pay.threshold * 4, Math.max(pay.minPosts, 1) + 10);
      const below = earning(p.id, Math.max(0, pay.threshold - 1), Math.max(pay.minPosts, 1) + 10);
      expect(above.pay, `${p.id} above`).toBeGreaterThan(0);
      expect(below.pay, `${p.id} below`).toBe(0);
      const parts = yearEarnings(above.life, { [p.id]: above.n }, above.life.currentYear, content);
      expect(Object.keys(parts.byModel), p.id).toContain(p.pay);
      expect(parts.byPlatform[p.id], p.id).toBeGreaterThan(0);
      models.add(p.pay);
    }
    expect(models.size).toBe(6);
  });

  it('pay per post where the model does (ad shares, ad reads) and per year of activity where it does not', () => {
    const few = earning('youtube', 50_000, 4);
    const many = earning('youtube', 50_000, 12);
    expect(many.pay).toBeCloseTo(few.pay * 3, 3);
    // (A creator has the whole budget of streams: twelve.)
    const streamer = withFollowers(apply(adult('pay-streamer'), (d) => void enterPath(d, 'social', 'streaming', content)), 'twitch', 5_000, { monetized: 2000, engagement: 50 });
    const part = platformPay(streamer, account(streamer, 'twitch'), 9, streamer.currentYear, content);
    const full = platformPay(streamer, account(streamer, 'twitch'), 12, streamer.currentYear, content);
    expect(part).toBeCloseTo(full * 0.75, 3);
  });

  it('need the posts: a platform stops paying an account that stopped posting', () => {
    expect(earning('youtube', 50_000, 0).pay).toBe(0);
    expect(earning('youtube', 50_000, b.pay.ad_share.minPosts - 1).pay).toBe(0);
  });

  it('pay nothing to a private account or a demonetized one, and engagement counts', () => {
    expect(earning('youtube', 50_000, 8, { private: true }).pay).toBe(0);
    const life = earning('youtube', 50_000, 8, { demonetized: 2100 });
    expect(life.pay).toBe(0);
    expect(earning('youtube', 50_000, 8, { engagement: 90 }).pay).toBeGreaterThan(earning('youtube', 50_000, 8, { engagement: 20 }).pay);
  });

  it('go through the ledger as income, less an agent’s cut', () => {
    let life = withFollowers(open(adult('pay-ledger'), 'youtube', 'ledger_fox'), 'youtube', 80_000, { monetized: 2000, engagement: 60 });
    life = apply(life, (d) => {
      d.social.year.year = d.currentYear;
      d.social.year.posts = { youtube: 8 };
      d.social.year.quality = { youtube: 8 * 60 };
    });
    const next = step(life);
    const net = socialIncome(next);
    expect(net).toBeGreaterThan(0);
    expect(next.social.income.byModel.ad_share).toBe(next.social.income.gross);
    expect(yearIncome(next, content)).toBeGreaterThanOrEqual(net);
    const without = apply(next, (d) => void (d.social.income = emptySocial(d.currentYear).income));
    expect(yearIncome(next, content) - yearIncome(without, content)).toBe(net);
    ok(next);
  });

  it('is part of income a minor’s parent puts partly in trust', () => {
    let life = withFollowers(open(lifeAtAge('pay-minor', 16), 'youtube', 'young_fox'), 'youtube', 80_000, { monetized: 2000, engagement: 60, private: false });
    life = apply(life, (d) => {
      d.social.year.year = d.currentYear;
      d.social.year.posts = { youtube: 8 };
      d.social.year.quality = { youtube: 480 };
    });
    const next = step(life);
    expect(next.social.income.gross).toBeGreaterThan(0);
    expect(next.social.income.trust).toBeGreaterThan(0);
    expect(next.finances.trust?.balance).toBe(next.social.income.trust);
    expect(socialIncome(next)).toBe(next.social.income.gross - next.social.income.trust);
    ok(next);
  });
});

describe('the year', () => {
  it('draws nothing from the generator for a life with no account', () => {
    const life = adult('step-none');
    const next = step(life);
    expect(next.rng).toEqual(life.rng);
    expect(next.social.accounts).toEqual({});
  });

  it('fades an account you left alone, far faster than one you kept up', () => {
    const idle = step(withFollowers(open(adult('step-idle'), 'tiktok', 'idle_fox'), 'tiktok', 10_000));
    const g = b.growth.short_video;
    expect(account(idle).followers).toBeLessThan(10_000 * (1 - g.idleFade) + 600);
    let busy = withFollowers(open(adult('step-busy'), 'tiktok', 'busy_fox'), 'tiktok', 10_000);
    busy = apply(busy, (d) => {
      d.social.year.year = d.currentYear;
      d.social.year.posts = { tiktok: platformBudget(d, platformList(content).find((p) => p.id === 'tiktok')!, content) };
      d.social.year.quality = { tiktok: 60 * d.social.year.posts.tiktok! };
    });
    expect(account(step(busy)).followers).toBeGreaterThan(account(idle).followers);
  });

  it('moves engagement toward the quality of the year’s posts, and lets it sink when you do not post', () => {
    let life = withFollowers(open(adult('step-engage'), 'tiktok', 'engage_fox'), 'tiktok', 5_000, { engagement: 40 });
    const idle = step(life);
    expect(account(idle).engagement).toBe(40 - b.engagement.idle);
    life = apply(life, (d) => {
      d.social.year.year = d.currentYear;
      d.social.year.posts = { tiktok: 10 };
      d.social.year.quality = { tiktok: 800 };
    });
    expect(account(step(life)).engagement).toBeGreaterThan(40);
  });

  it('starts a platform paying when the account passes its threshold with enough posts', () => {
    let life = withFollowers(open(adult('step-monetize'), 'youtube', 'money_fox'), 'youtube', 2_000);
    life = apply(life, (d) => {
      d.social.year.year = d.currentYear;
      d.social.year.posts = { youtube: 6 };
      d.social.year.quality = { youtube: 360 };
    });
    const next = step(life);
    expect(account(next, 'youtube').monetized).toBe(next.currentYear);
    expect(next.social.totals.monetized).toBe(1);
    expect(next.social.happened.triggers).toContain('monetized');
    expect(next.history.some((h) => h.tags?.includes('monetized'))).toBe(true);
    const idle = step(withFollowers(open(adult('step-monetize-idle'), 'youtube', 'money_fox'), 'youtube', 2_000));
    expect(account(idle, 'youtube').monetized).toBe(0);
  });

  it('makes the algorithm change its mind about a platform for the year, up or down', () => {
    const hit = new Set<string>();
    for (let i = 0; i < 80 && hit.size < 2; i++) {
      const life = withFollowers(open(adult(`step-algo-${i}`), 'tiktok', 'algo_fox'), 'tiktok', 5_000);
      const next = step(life);
      const shift = next.social.algorithm.shifts.tiktok;
      if (shift) hit.add(shift);
    }
    expect([...hit].sort()).toEqual(['down', 'up']);
  });

  it('keeps its records valid over many years of posting', () => {
    let life = open(lifeAtAge('step-many', 15), 'instagram', 'long_fox', 'lifestyle');
    life = open(life, 'tiktok', 'long_fox_two', 'comedy');
    for (let year = 0; year < 12; year++) {
      for (const p of ['instagram', 'tiktok']) {
        for (let i = 0; i < 8 && postBlock(life, p, content) === null; i++) life = performAction(life, 'post', { platformId: p, tone: i % 3 === 0 ? 'bold' : 'safe' }, content);
      }
      life = playYear(life, content);
      ok(life);
    }
    expect(life.social.totals.posts).toBeGreaterThan(0);
  });
});

describe('as a career', () => {
  const creator = (seed: string, age = 20, route = 'after_viral') =>
    apply(adult(seed, age), (d) => {
      d.character.hidden.talent = null;
      enterPath(d, 'social', route, content);
    });

  it('starts with an account on the platform the way in starts at, with a suggested handle', () => {
    const cases: [string, string][] = [['first_posts', 'instagram'], ['streaming', 'twitch'], ['collab', 'youtube'], ['after_viral', 'tiktok']];
    for (const [route, platform] of cases) {
      const life = creator(`career-${route}`, 20, route);
      expect(Object.keys(life.social.accounts), route).toEqual([platform]);
      expect(handleIssue(account(life, platform).handle, content)).toBeNull();
      ok(life);
    }
  });

  it('derives fame from your reach, and the rung climbs when the quality of what you posted allows it', () => {
    let life = creator('career-reach');
    const def = content.famePaths.social!;
    const reach = 700_000;
    life = withFollowers(life, 'tiktok', Math.round(reach / (b.platforms.tiktok!.reach * 1)), { engagement: 50 });
    expect(reachOf(life, content)).toBeGreaterThan(reach * 0.9);
    life = apply(life, (d) => {
      d.social.year.year = d.currentYear;
      d.social.year.posts = { tiktok: 40 };
      d.social.year.quality = { tiktok: 40 * 80 };
      d.fame.paths.social!.recent = [80, 80, 80];
    });
    for (let i = 0; i < 6; i++) life = step(withFollowers(apply(life, (d) => {
      d.social.year.year = d.currentYear;
      d.social.year.posts = { tiktok: 40 };
      d.social.year.quality = { tiktok: 40 * 80 };
    }), 'tiktok', Math.round(reach / b.platforms.tiktok!.reach)));
    const path = life.fame.paths.social!;
    expect(path.fame).toBeGreaterThan(40);
    expect(path.rung).toBeGreaterThanOrEqual(3);
    expect(path.rung).toBeLessThanOrEqual(def.rungs.length);
    ok(life);
    // The same reach with poor posts does not climb past what the quality allows.
    let poor = creator('career-poor');
    poor = withFollowers(poor, 'tiktok', Math.round(reach / b.platforms.tiktok!.reach));
    for (let i = 0; i < 6; i++) poor = step(withFollowers(apply(poor, (d) => {
      d.social.year.year = d.currentYear;
      d.social.year.posts = { tiktok: 40 };
      d.social.year.quality = { tiktok: 40 * 20 };
    }), 'tiktok', Math.round(reach / b.platforms.tiktok!.reach)));
    expect(poor.fame.paths.social!.rung).toBeLessThan(path.rung);
  });

  it('treats a year of posting as a year of work: no fade, and the career is not dropped as dormant', () => {
    let life = creator('career-work');
    life = apply(life, (d) => {
      d.social.year.year = d.currentYear;
      d.social.year.posts = { tiktok: 20 };
      d.social.year.quality = { tiktok: 20 * 60 };
    });
    const next = step(life);
    expect(next.social.workedYear).toBe(next.currentYear);
    expect(next.fame.paths.social!.last).toBe(next.currentYear);
    expect(next.fame.active).toBe(true);
  });

  it('pays the old retainer and projects a smaller share once you have accounts', () => {
    const withAccount = creator('career-legacy');
    const without = apply(withAccount, (d) => void (d.social.accounts = {}));
    const full = fameRetainer(without);
    const reduced = fameRetainer(withAccount);
    expect(reduced).toBeCloseTo(full * b.fame.retainer, -1);
  });

  it('turns a viral post into a big break, and the event follows', () => {
    let hit = 0;
    for (let i = 0; i < 12; i++) {
      let life = withFollowers(creator(`career-viral-${i}`), 'tiktok', 20_000, { engagement: 60 });
      life = apply(life, (d) => {
        d.social.year.year = d.currentYear;
        d.social.year.posts = { tiktok: 30 };
        d.social.year.quality = { tiktok: 30 * 70 };
        d.social.year.viral = ['tiktok'];
        d.fame.paths.social!.recent = [70, 70, 70];
        d.fame.paths.social!.breakYear = 0;
      });
      const next = step(life);
      expect(next.social.happened.triggers).toContain('viral');
      if (next.fame.totals.breaks > 0) hit += 1;
    }
    expect(hit).toBeGreaterThan(0);
  });
});

/** What the social path's retainer is worth (the fame step's, with the platform's share applied). */
function fameRetainer(life: LifeState): number {
  const next = apply(life, (d) => {
    d.fame.income = { year: 0, gross: 0, agent: 0, company: 0, trust: 0, scene: 0, tour: 0 };
    d.currentYear += 1;
    runFame(d, content);
  });
  return next.fame.income.gross;
}

describe('crossover and promotion', () => {
  const musician = (seed: string) => apply(adult(seed, 24), (d) => void enterPath(d, 'music', 'open_mic', content));

  it('gives musicians, actors and athletes followers from their fans', () => {
    let life = apply(open(musician('cross'), 'instagram', 'band_fox'), (d) => void (d.fame.fans = 40_000));
    life = withFollowers(life, 'instagram', 100);
    const next = step(life);
    expect(account(next, 'instagram').followers).toBeGreaterThan(1_000);
    expect(account(next, 'instagram').followers).toBeLessThanOrEqual(Math.round(40_000 * b.platforms.instagram!.cross) + 100);
  });

  it('lets them promote their work to their followers: fans, mood and fame, and it uses a post', () => {
    let life = apply(open(musician('promote'), 'instagram', 'promo_fox'), (d) => {
      d.fame.paths.music!.last = d.currentYear;
    });
    life = withFollowers(life, 'instagram', 20_000);
    expect(isLifeActionAvailable(life, 'promote_work', { platformId: 'instagram' }, content)).toBe(true);
    const fans = life.fame.fans;
    const done = performAction(life, 'promote_work', { platformId: 'instagram' }, content);
    expect(done.fame.fans).toBeGreaterThan(fans);
    expect(done.social.year.posts.instagram).toBe(1);
    expect(done.social.totals.promos).toBe(1);
    expect(isLifeActionAvailable(done, 'promote_work', { platformId: 'instagram' }, content)).toBe(false);
    // Nothing to promote without work: no career at all.
    const none = withFollowers(open(adult('promote-none'), 'instagram', 'no_work_fox'), 'instagram', 20_000);
    expect(isLifeActionAvailable(none, 'promote_work', { platformId: 'instagram' }, content)).toBe(false);
    expect(promoteWork(none, 'instagram', content)).toBe(0);
  });
});

describe('cross-promotion and collaborations', () => {
  it('sends a share of one account’s followers to another, up to three times a year, once for each pair', () => {
    let life = open(open(adult('xpromo'), 'tiktok', 'cross_one'), 'instagram', 'cross_two');
    life = withFollowers(withFollowers(life, 'tiktok', 20_000, { engagement: 50 }), 'instagram', 500);
    const before = account(life, 'instagram').followers;
    const next = performAction(life, 'cross_promote', { fromId: 'tiktok', toId: 'instagram' }, content);
    expect(account(next, 'instagram').followers - before).toBe(Math.round(20_000 * b.cross.share * 1));
    expect(() => performAction(next, 'cross_promote', { fromId: 'tiktok', toId: 'instagram' }, content)).toThrow(InvalidInputError);
    expect(() => performAction(life, 'cross_promote', { fromId: 'tiktok', toId: 'tiktok' }, content)).toThrow(InvalidInputError);
    const priv = withFollowers(life, 'tiktok', 20_000, { private: true });
    expect(() => performAction(priv, 'cross_promote', { fromId: 'tiktok', toId: 'instagram' }, content)).toThrow(InvalidInputError);
    expect(crossPromote(life, 'tiktok', 'tiktok', content)).toBe(0);
  });

  it('finds creators among the people you know, the same ones every time, and never mixes adults and minors', () => {
    let found = 0;
    for (let i = 0; i < 25; i++) {
      const life = lifeAtAge(`collab-find-${i}`, 22);
      const again = collabCandidates(life, content);
      expect(collabCandidates(life, content)).toEqual(again);
      for (const c of again) {
        found += 1;
        expect(creatorFollowers(life, c.id, content)).toBe(c.followers);
        expect(life.currentYear - life.people[c.id]!.birthYear).toBeGreaterThanOrEqual(18);
      }
    }
    expect(found).toBeGreaterThan(0);
    for (let i = 0; i < 25; i++) {
      const teen = lifeAtAge(`collab-teen-${i}`, 15);
      for (const c of collabCandidates(teen, content)) {
        const age = teen.currentYear - teen.people[c.id]!.birthYear;
        expect(age).toBeLessThan(18);
        expect(Math.abs(age - 15)).toBeLessThanOrEqual(b.collab.gap);
      }
    }
  });

  it('brings a share of their following and warms the friendship, twice a year at most', () => {
    let tried = 0;
    for (let i = 0; i < 40 && tried < 3; i++) {
      let life = open(lifeAtAge(`collab-${i}`, 22), 'youtube', 'together_fox');
      const [person] = collabCandidates(life, content);
      if (!person) continue;
      tried += 1;
      life = withFollowers(life, 'youtube', 3_000, { engagement: 50 });
      const rel = life.relationships[person.id]!.affection;
      const next = performAction(life, 'collab', { platformId: 'youtube', personId: person.id }, content);
      expect(account(next, 'youtube').followers - 3_000).toBe(Math.round(person.followers * b.collab.share));
      expect(next.relationships[person.id]!.affection).toBeGreaterThanOrEqual(rel);
      expect(next.social.totals.collabs).toBe(1);
      expect(() => performAction(next, 'collab', { platformId: 'youtube', personId: person.id }, content)).toThrow(InvalidInputError);
      expect(collab(next, 'youtube', person.id, content)).toBe(0);
    }
    expect(tried).toBeGreaterThan(0);
  });
});

describe('posts that reach people they were not meant for', () => {
  /** The same game with every find certain, to see what a find does. */
  const sure = { ...content, balance: { ...content.balance, social: { ...b, casual: { ...b.casual, find: { employer: 1, partner: 1, ex: 1, family: 1 }, maxFinds: 4 } } } } as ContentBundle;
  const withBoss = (life: LifeState, seed = 'boss') =>
    apply(life, (d) => {
      d.career.job = { jobId: Object.keys(content.jobs)[0]!, level: 1, salary: 40_000, since: d.currentYear - 1, yearsAtLevel: 1, performance: 60, employer: 'Test Works' };
      d.people.boss = { ...Object.values(d.people)[0]!, id: 'boss', name: { first: 'Rowan', last: seed }, birthYear: d.birthYear - 15, alive: true };
      d.relationships.boss = { personId: 'boss', kind: 'boss', status: 'active', affection: 50, trust: 50, memories: [], since: d.currentYear - 1 };
    });
  const risky = (life: LifeState, n = 3) =>
    apply(life, (d) => {
      d.social.year.year = d.currentYear;
      d.social.year.risky = { tiktok: n };
    });

  it('reach an employer (the boss), and the gossip web has it', () => {
    const life = risky(withBoss(open(adult('find-boss'))));
    const next = step(life, sure);
    expect(next.social.totals.foundEmployer).toBeGreaterThan(0);
    expect(next.scheduled.some((s) => s.cast.npc === 'boss' && content.registries.social.triggers.foundEmployer.events.includes(s.eventId))).toBe(true);
    const item = next.web.items.find((i) => i.kind === 'onlinePost');
    expect(item?.subject).toBe('you');
    expect(item?.holders.boss).toBeDefined();
    expect(next.social.happened.triggers).toContain('foundEmployer');
    ok(next);
  });

  it('reach a partner, an ex or family; a private account is found far less', () => {
    const base = open(adult('find-people', 28));
    const withPartner = apply(base, (d) => {
      const p = Object.values(d.people)[0]!;
      d.people.partner = { ...p, id: 'partner', birthYear: d.birthYear + 1, alive: true };
      d.relationships.partner = { personId: 'partner', kind: 'partner', status: 'active', affection: 70, trust: 70, memories: [], since: d.currentYear - 2 };
    });
    const next = step(risky(withPartner), sure);
    const kinds = next.scheduled.map((s) => s.cast.npc).filter(Boolean);
    expect(kinds.length).toBeGreaterThan(0);
    const totals = next.social.totals;
    expect(totals.foundEmployer + totals.foundPartner + totals.foundEx + totals.foundFamily).toBeGreaterThan(0);
    let publicFinds = 0;
    let privateFinds = 0;
    for (let i = 0; i < 60; i++) {
      const life = withFollowers(open(withBoss(adult(`find-priv-${i}`)), 'tiktok', 'priv_fox'), 'tiktok', 500);
      publicFinds += step(risky(life, 2)).social.totals.foundEmployer;
      privateFinds += step(risky(withFollowers(life, 'tiktok', 500, { private: true }), 2)).social.totals.foundEmployer;
    }
    expect(privateFinds).toBeLessThan(publicFinds);
  });

  it('never reach a partner or an ex for anyone under 18, and a teen with no job has no employer', () => {
    const teen = apply(open(lifeAtAge('find-teen', 15)), (d) => {
      const p = Object.values(d.people)[0]!;
      d.people.ex = { ...p, id: 'ex', birthYear: d.birthYear, alive: true };
      d.relationships.ex = { personId: 'ex', kind: 'ex', status: 'active', affection: 30, trust: 30, memories: [], since: d.currentYear - 1 };
    });
    const next = step(risky(teen, 6), sure);
    expect(next.social.totals.foundEx).toBe(0);
    expect(next.social.totals.foundPartner).toBe(0);
    expect(next.social.totals.foundEmployer).toBe(0);
  });

  it('are counted by the post: a risky post is rolled when a post is made, bolder ones more often', () => {
    let safe = 0;
    let bold = 0;
    for (let i = 0; i < 60; i++) {
      let life = open(adult(`risky-${i}`), 'tiktok', 'risky_fox');
      life = performAction(performAction(life, 'post', { platformId: 'tiktok', tone: 'safe' }, content), 'post', { platformId: 'tiktok', tone: 'safe' }, content);
      safe += Object.values(life.social.year.risky).reduce((a, n) => a + n, 0);
      let loud = open(adult(`risky-${i}`), 'tiktok', 'risky_fox');
      loud = performAction(performAction(loud, 'post', { platformId: 'tiktok', tone: 'bold' }, content), 'post', { platformId: 'tiktok', tone: 'bold' }, content);
      bold += Object.values(loud.social.year.risky).reduce((a, n) => a + n, 0);
    }
    expect(bold).toBeGreaterThan(safe);
  });
});

describe('controversy, cancellation and sponsorship', () => {
  it('cancels you: followers go, image and mood fall, the tabloids run it for a famous adult, and the web talks', () => {
    let life = apply(adult('cancel', 26), (d) => void enterPath(d, 'social', 'after_viral', content));
    life = withFollowers(life, 'tiktok', 400_000, { engagement: 60 });
    life = apply(life, (d) => {
      d.fame.paths.social!.fame = 45;
      d.fame.image = 60;
    });
    const before = account(life).followers;
    const next = apply(life, (d) => void cancel(d, content, d.rng));
    expect(account(next).followers).toBeLessThan(before * (1 - b.controversy.lose) + 2);
    expect(next.fame.image).toBeLessThan(60);
    expect(next.fame.headlines.some((h) => h.kind === 'social')).toBe(true);
    expect(next.web.items.some((i) => i.kind === 'onlinePost' && i.truth === 'called_out')).toBe(true);
    expect(next.social.controversy?.stage).toBe('cancelled');
    expect(next.social.totals.cancellations).toBe(1);
    // A year later part of it comes back, and the aftermath is an event.
    const later = step(next);
    expect(account(later).followers).toBeGreaterThan(account(next).followers * (1 - 0.5));
    expect(later.social.happened.triggers).toContain('cancelled');
    ok(next);
  });

  it('a minor’s cancellation is not in the tabloids', () => {
    let life = apply(lifeAtAge('cancel-minor', 16), (d) => void enterPath(d, 'social', 'after_viral', content));
    life = withFollowers(life, 'tiktok', 90_000);
    life = apply(life, (d) => void (d.fame.paths.social!.fame = 60));
    const next = apply(life, (d) => void cancel(d, content, d.rng));
    expect(next.fame.headlines.some((h) => h.kind === 'social')).toBe(false);
  });

  it('signs a sponsorship with a fictional brand (a parent signs under 18), and a brand pays for the followers you have', () => {
    let life = apply(adult('sponsor', 26), (d) => void enterPath(d, 'social', 'after_viral', content));
    life = withFollowers(life, 'tiktok', 120_000, { engagement: 60 });
    life = apply(life, (d) => {
      d.fame.paths.social!.rung = 3;
      d.fame.paths.social!.peak = 3;
    });
    expect(sponsorPay(life, account(life), content)).toBe(0);
    const signed = apply(life, (d) => void applySocialEffect(d, { type: 'social', action: 'sponsor', terms: 'standard' }, content, d.rng));
    const company = content.fameCompanies[signed.fame.contract!.company]!;
    expect(company.kind).toBe('brand');
    expect(company.path).toBe('social');
    expect(sponsorPay(signed, account(signed), content)).toBeGreaterThan(0);
    expect(signed.social.totals.sponsorships).toBe(1);
    const parts = yearEarnings(signed, { tiktok: 20 }, signed.currentYear, content);
    expect(parts.byModel.brand_deals).toBeGreaterThan(0);
    // A contract with a network is not a sponsorship.
    const network = apply(signed, (d) => void (d.fame.contract = { ...d.fame.contract!, company: 'nimbus_network' }));
    expect(sponsorPay(network, account(network), content)).toBe(0);
    // Under 18, a parent signs.
    let teen = apply(lifeAtAge('sponsor-teen', 16), (d) => void enterPath(d, 'social', 'after_viral', content));
    teen = apply(withFollowers(teen, 'tiktok', 60_000), (d) => {
      d.fame.paths.social!.rung = 3;
      d.fame.paths.social!.peak = 3;
      applySocialEffect(d, { type: 'social', action: 'sponsor', terms: 'standard' }, content, d.rng);
    });
    expect(teen.fame.contract?.byParent).toBe(true);
    expect(teen.fame.contract?.exclusive).toBe(false);
  });
});

describe('the effects events have', () => {
  it('move followers and engagement, take every account private, open an account (with the age and parent rules) and close one', () => {
    let life = open(adult('effects'));
    life = apply(life, (d) => void applySocialEffect(d, { type: 'social', action: 'followers', delta: 50 }, content, d.rng));
    const f = account(life).followers;
    expect(f).toBeGreaterThan(open(adult('effects')).social.accounts.tiktok!.followers);
    life = apply(life, (d) => void applySocialEffect(d, { type: 'social', action: 'private', value: true }, content, d.rng));
    expect(account(life).private).toBe(true);
    life = apply(life, (d) => void applySocialEffect(d, { type: 'social', action: 'open', platform: 'youtube' }, content, d.rng));
    expect(account(life, 'youtube')).toBeDefined();
    expect(handleIssue(account(life, 'youtube').handle, content)).toBeNull();
    const twelve = apply(lifeAtAge('effects-12', 12), (d) => void applySocialEffect(d, { type: 'social', action: 'open', platform: 'tiktok' }, content, d.rng));
    expect(accountList(twelve)).toEqual([]);
    life = apply(life, (d) => void applySocialEffect(d, { type: 'social', action: 'close', platform: 'youtube' }, content, d.rng));
    expect(account(life, 'youtube')).toBeUndefined();
    ok(life);
  });

  it('restore a demonetized account, and clear a row that was brewing', () => {
    let life = withFollowers(open(adult('effects-restore')), 'tiktok', 20_000, { monetized: 2000, demonetized: 2100 });
    life = apply(life, (d) => void (d.social.controversy = { year: d.currentYear, platform: 'tiktok', stage: 'brewing', lost: {} }));
    life = apply(life, (d) => {
      applySocialEffect(d, { type: 'social', action: 'restore' }, content, d.rng);
      applySocialEffect(d, { type: 'social', action: 'clear' }, content, d.rng);
    });
    expect(account(life).demonetized).toBe(0);
    expect(life.social.controversy).toBeNull();
  });
});

describe('the Social screen’s view', () => {
  it('shows followers in words and numbers, the budget left, and why a platform can’t be joined', () => {
    const life = performAction(withFollowers(open(lifeAtAge('view', 14), 'tiktok', 'view_fox'), 'tiktok', 2500), 'post', { platformId: 'tiktok', tone: 'safe' }, content);
    const view = getSocialView(life, content);
    const a = view.accounts[0]!;
    expect(a.followersText).toBe(String(a.followers).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
    expect(a.followerWords).toBe(followerWords(a.followers, content));
    expect(a.done).toBe(1);
    expect(a.left).toBe(a.budget - 1);
    expect(a.private).toBe(true);
    expect(view.minor).toBe(true);
    expect(view.platforms.length).toBe(6);
    expect(view.platforms.find((p) => p.id === 'tiktok')?.block).toBe('have');
    expect(view.platforms.find((p) => p.id === 'youtube')?.block).toBeNull();
    expect(getSocialView(lifeAtAge('view-12', 12), content).platforms.every((p) => p.block === 'age')).toBe(true);
  });
});

describe('queueing an event', () => {
  it('picks an event of the trigger that fits now, and none otherwise', () => {
    let life = withFollowers(open(adult('queue')), 'tiktok', 5_000);
    expect(queueSocialEvent(life, 'monetized', content)).toBe(false);
    life = apply(life, (d) => {
      d.social.happened = { year: d.currentYear, triggers: ['viralCasual'] };
    });
    const queued = apply(life, (d) => void queueSocialEvent(d, 'viralCasual', content));
    expect(queued.scheduled.some((s) => content.registries.social.triggers.viralCasual.events.includes(s.eventId))).toBe(true);
    expect(cloneRng(queued.rng)).toBeDefined();
  });

  it('opens an account for a creator who has none yet only on a platform that exists', () => {
    const life = apply(adult('start-account'), (d) => void startCreatorAccount(d, 'no_such_route', content));
    expect(accountList(life).length).toBe(1);
    expect(closeAccount).toBeDefined();
    expect(openAccount).toBeDefined();
    expect(post).toBeDefined();
  });
});
