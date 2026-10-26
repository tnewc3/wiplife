/**
 * Social media, simulated and measured (Batch 8). Every player model can have
 * accounts: most of the careful and careless lives open a casual account in
 * their teens or twenties and post a little; the star player who goes after the
 * social media path (or any career) runs accounts as a creator would: opens
 * several, posts its budget, points followers from one account to another,
 * makes things with creators it knows and promotes its work. The watcher
 * compares each year's state before and after `beginYear`, so nothing here
 * touches the engine.
 *
 * Reported: lives with accounts, accounts per life, followers by platform,
 * income by platform and by pay model (through the ledger), viral moments,
 * algorithm changes, demonetization, burnout, controversies and cancellations,
 * collaborations, sponsorships, posts that reached an employer, a partner, an ex
 * or family, how far social media careers get, and the rules that must always
 * hold for anyone under 18.
 */
import type { ContentBundle } from '../../src/content/schemas';
import { isLifeActionAvailable, type LifeActionId, type LifeActionParams } from '../../src/engine/actions';
import { platformBudget, platformList, accountList, bestNiche, collabCandidates, handleSuggestion, platformOf } from '../../src/engine/social/query';
import { chance, pick, type RngState } from '../../src/engine/rng';
import type { LifeState, SocialTotals } from '../../src/engine/types';
import type { SimulationReport, TargetResult } from './run';

type SocialAction = [LifeActionId, LifeActionParams];

/** What a simulated poster is like (rolled once a life): describes the player, not the game. */
export interface SocialProfile {
  /** Whether this life has accounts at all, and the earliest age it opens the first. */
  online: boolean;
  joinAge: number;
  /** How many platforms it ends up on, how much of the yearly budget it uses, how often it says the bold thing, how often it keeps accounts private. */
  platforms: number;
  effort: number;
  bold: number;
  private: number;
}

export function rollSocialProfile(rng: RngState): SocialProfile {
  return {
    online: chance(rng, 0.65),
    joinAge: pick(rng, [13, 14, 15, 16, 18, 20, 25, 35]),
    platforms: pick(rng, [1, 1, 2, 3]),
    effort: pick(rng, [0.2, 0.5, 1]),
    bold: pick(rng, [0.05, 0.2, 0.5]),
    private: pick(rng, [0, 0.2, 0.6]),
  };
}

/** The year's social actions: open accounts, post, point followers around, make something together, promote the work. */
export function chooseSocialActions(life: LifeState, content: ContentBundle, rng: RngState, profile: SocialProfile, creatorMinded: boolean): SocialAction[] {
  const out: SocialAction[] = [];
  const age = life.character.age;
  const s = life.social;
  const creator = life.fame.active && (life.fame.main === 'social' || life.fame.second === 'social');
  if (!profile.online && !creator) return out;
  if (age < profile.joinAge && !creator) return out;
  const ok = (id: LifeActionId, params: LifeActionParams) => isLifeActionAvailable(life, id, params, content);
  const have = accountList(life);
  const wanted = creator ? Math.max(2, profile.platforms) : profile.platforms;
  if (have.length < wanted && chance(rng, 0.6)) {
    const free = platformList(content).filter((p) => !s.accounts[p.id]);
    if (free.length > 0) {
      const platform = pick(rng, free);
      const handle = handleSuggestion(life, content, s.totals.opened + 1);
      const params = { platformId: platform.id, handle, nicheId: bestNiche(life, content).id };
      if (ok('open_account', params)) out.push(['open_account', params]);
    }
  }
  for (const a of have) {
    const platform = platformOf(content, a.platform);
    if (!platform) continue;
    const budget = platformBudget(life, platform, content);
    // A creator posts what it can; anyone else a little.
    const posts = creator || creatorMinded ? Math.round(budget * profile.effort) : Math.min(3, Math.round(budget * profile.effort));
    for (let i = 0; i < posts; i++) out.push(['post', { platformId: a.platform, tone: chance(rng, profile.bold) ? 'bold' : 'safe' }]);
    if (a.private !== chance(rng, profile.private) && chance(rng, 0.1) && ok('set_private', { platformId: a.platform, on: !a.private })) out.push(['set_private', { platformId: a.platform, on: !a.private }]);
    if (ok('promote_work', { platformId: a.platform })) out.push(['promote_work', { platformId: a.platform }]);
  }
  if (have.length > 1 && (creator || chance(rng, 0.2))) {
    const [from, to] = [pick(rng, have), pick(rng, have)];
    if (from.platform !== to.platform) out.push(['cross_promote', { fromId: from.platform, toId: to.platform }]);
  }
  if (have.length > 0 && (creator || chance(rng, 0.15))) {
    const c = collabCandidates(life, content)[0];
    if (c) out.push(['collab', { platformId: pick(rng, have).platform, personId: c.id }]);
  }
  return out;
}

export interface SocialReport {
  player: string;
  lives: number;
  /** Lives that ever had an account, and the accounts they opened. */
  withAccount: number;
  accountsOpened: number;
  accountYears: number;
  posts: number;
  /** By platform: lives with an account, followers at death (sum, and the most), and accounts a platform paid. */
  byPlatform: Record<string, { lives: number; followers: number; best: number; monetized: number }>;
  /** What the platforms paid through the ledger, by pay model and by platform. */
  incomeByModel: Record<string, number>;
  incomeByPlatform: Record<string, number>;
  /** Lives that earned anything from the platforms. */
  earnedLives: number;
  totals: SocialTotals;
  /** Lives with at least one: a viral post, a row, a cancellation, a sponsorship, a post found by an employer, a partner, an ex or family. */
  lives_: { viral: number; controversy: number; cancelled: number; sponsored: number; employer: number; partner: number; ex: number; family: number; found: number; demonetized: number; burnout: number };
  /** Careers in the social media path: how many, the highest rung reached, and by 28 for those who began as a teen. */
  creators: { lives: number; peak: number[]; at28: number[]; fameSum: number; earned: number; viral: number; controversy: number; cancelled: number };
  /** The rules for anyone under 18 that must always hold. */
  minors: { accounts: number; openedWithoutParent: number; under13: number; unsignedDeals: number; publicUnder13: number };
  invariantFailures: number;
}

export function emptySocialReport(player: string, content: ContentBundle): SocialReport {
  const rungs = content.famePaths.social?.rungs.length ?? 5;
  return {
    player,
    lives: 0,
    withAccount: 0,
    accountsOpened: 0,
    accountYears: 0,
    posts: 0,
    byPlatform: Object.fromEntries(platformList(content).map((p) => [p.id, { lives: 0, followers: 0, best: 0, monetized: 0 }])),
    incomeByModel: {},
    incomeByPlatform: {},
    earnedLives: 0,
    totals: {
      opened: 0, posts: 0, viral: 0, algorithmUp: 0, algorithmDown: 0, demonetized: 0, monetized: 0, burnouts: 0, controversies: 0, cancellations: 0, collabs: 0,
      crossPromos: 0, promos: 0, sponsorships: 0, foundEmployer: 0, foundPartner: 0, foundEx: 0, foundFamily: 0, earned: 0,
    },
    lives_: { viral: 0, controversy: 0, cancelled: 0, sponsored: 0, employer: 0, partner: 0, ex: 0, family: 0, found: 0, demonetized: 0, burnout: 0 },
    creators: { lives: 0, peak: Array.from({ length: rungs }, () => 0), at28: [], fameSum: 0, earned: 0, viral: 0, controversy: 0, cancelled: 0 },
    minors: { accounts: 0, openedWithoutParent: 0, under13: 0, unsignedDeals: 0, publicUnder13: 0 },
    invariantFailures: 0,
  };
}

export class SocialWatcher {
  private everIn = false;
  private earned = 0;
  private rungAt28: number | null = null;

  constructor(
    private readonly r: SocialReport,
    private readonly content: ContentBundle,
  ) {}

  /** The year that has just begun. */
  observe(_before: LifeState, after: LifeState): void {
    const { r } = this;
    const accounts = accountList(after);
    const independence = this.content.balance.economy.independenceAge;
    if (accounts.length > 0) {
      if (!this.everIn) {
        this.everIn = true;
        r.withAccount++;
      }
      r.accountYears += accounts.length;
    }
    for (const a of accounts) {
      const age = a.since - after.birthYear;
      if (age < 13) r.minors.under13++;
      if (age < independence && !a.byParent) r.minors.openedWithoutParent++;
    }
    const c = after.fame.contract;
    if (c && c.path === 'social' && after.character.age < independence && !c.byParent) r.minors.unsignedDeals++;
    const i = after.social.income;
    if (i.year === after.currentYear && i.gross > 0) {
      this.earned += i.gross;
      for (const [k, v] of Object.entries(i.byModel)) r.incomeByModel[k] = (r.incomeByModel[k] ?? 0) + v;
      for (const [k, v] of Object.entries(i.byPlatform)) r.incomeByPlatform[k] = (r.incomeByPlatform[k] ?? 0) + v;
    }
    const social = after.fame.paths.social;
    if (after.character.age === 28 && social && social.since - after.birthYear < 20) this.rungAt28 = social.rung;
  }

  finish(life: LifeState): void {
    const { r } = this;
    r.lives++;
    const t = life.social.totals;
    if (t.opened > 0) {
      r.accountsOpened += t.opened;
      r.posts += t.posts;
      for (const k of Object.keys(t) as (keyof SocialTotals)[]) r.totals[k] += t[k];
      if (t.viral > 0) r.lives_.viral++;
      if (t.controversies > 0) r.lives_.controversy++;
      if (t.cancellations > 0) r.lives_.cancelled++;
      if (t.sponsorships > 0) r.lives_.sponsored++;
      if (t.foundEmployer > 0) r.lives_.employer++;
      if (t.foundPartner > 0) r.lives_.partner++;
      if (t.foundEx > 0) r.lives_.ex++;
      if (t.foundFamily > 0) r.lives_.family++;
      if (t.foundEmployer + t.foundPartner + t.foundEx + t.foundFamily > 0) r.lives_.found++;
      if (t.demonetized > 0) r.lives_.demonetized++;
      if (t.burnouts > 0) r.lives_.burnout++;
    }
    for (const a of accountList(life)) {
      const row = r.byPlatform[a.platform];
      if (!row) continue;
      row.lives++;
      row.followers += a.followers;
      row.best = Math.max(row.best, a.peak);
      if (a.monetized > 0) row.monetized++;
      if (a.byParent) r.minors.accounts++;
      if (a.since - life.birthYear < 13 && !a.private) r.minors.publicUnder13++;
    }
    if (this.earned > 0) r.earnedLives++;
    const path = life.fame.paths.social;
    if (path) {
      r.creators.lives++;
      r.creators.peak[Math.min(r.creators.peak.length, path.peak) - 1]!++;
      r.creators.fameSum += path.fame;
      if (this.earned > 0) r.creators.earned++;
      if (t.viral > 0) r.creators.viral++;
      if (t.controversies > 0) r.creators.controversy++;
      if (t.cancellations > 0) r.creators.cancelled++;
      if (this.rungAt28 !== null) r.creators.at28.push(this.rungAt28);
    }
  }
}

const pct = (n: number, d: number) => (d === 0 ? '0.0%' : `${((100 * n) / d).toFixed(1)}%`);
const per = (n: number, d: number, digits = 2) => (d === 0 ? '0' : (n / d).toFixed(digits));
const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function formatSocial(r: SocialReport, content: ContentBundle): string[] {
  const t = r.totals;
  const lines = [`  Social media (Batch 8, ${r.player}):`];
  lines.push(`    lives with an account ${pct(r.withAccount, r.lives)} (${r.accountsOpened} accounts opened, ${per(r.accountsOpened, r.withAccount)} each); ${per(r.posts, r.accountYears)} posts an account year`);
  for (const p of platformList(content)) {
    const row = r.byPlatform[p.id]!;
    lines.push(`    ${p.name}: ${row.lives} accounts at death, ${per(row.followers, row.lives, 0)} followers on average (best ${row.best.toLocaleString('en-US')}), ${row.monetized} paid (${p.pay})`);
  }
  const models = Object.entries(r.incomeByModel).sort(([a], [b]) => (a < b ? -1 : 1));
  lines.push(`    income through the ledger by pay model: ${models.length === 0 ? 'none' : models.map(([k, v]) => `${k} ${dollars(v)}`).join(', ')}; ${r.earnedLives} lives earned anything`);
  lines.push(`    by platform: ${Object.entries(r.incomeByPlatform).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k} ${dollars(v)}`).join(', ') || 'none'}`);
  lines.push(`    viral moments ${t.viral} (${r.lives_.viral} lives); algorithm changes ${t.algorithmUp} up, ${t.algorithmDown} down; platforms that started paying ${t.monetized}, stopped paying ${t.demonetized}; burnout ${t.burnouts}`);
  lines.push(`    controversies ${t.controversies}, cancellations ${t.cancellations} (${r.lives_.cancelled} lives); sponsorships ${t.sponsorships}; collaborations ${t.collabs}, cross-promotions ${t.crossPromos}, promoted work ${t.promos}`);
  lines.push(`    posts that reached an employer ${t.foundEmployer} (${r.lives_.employer} lives), a partner ${t.foundPartner} (${r.lives_.partner}), an ex ${t.foundEx} (${r.lives_.ex}), family ${t.foundFamily} (${r.lives_.family})`);
  const c = r.creators;
  lines.push(`    careers in the social media path ${c.lives}; highest rung reached: ${c.peak.map((n, i) => `${i + 1}: ${n}`).join(', ')}; begun as a teen, rung at 28: ${c.at28.length === 0 ? 'none' : `median ${[...c.at28].sort((a, b) => a - b)[Math.floor(c.at28.length / 2)]} of ${c.at28.length}`}`);
  const m = r.minors;
  lines.push(`    under 18 (must be none): accounts under 13 ${m.under13}, opened without a parent ${m.openedWithoutParent}, sponsorships not signed by a parent ${m.unsignedDeals}; invariant failures about social media ${r.invariantFailures}`);
  return lines;
}

export function socialTargets(report: SimulationReport, content: ContentBundle): TargetResult[] {
  const t = content.balance.targets.social;
  const r = report.social;
  const out: TargetResult[] = [];
  const range = (label: string, value: number, goal: { min?: number | undefined; max?: number | undefined }, fmt: (n: number) => string = (n) => n.toFixed(3)) => {
    const met = (goal.min === undefined || value >= goal.min) && (goal.max === undefined || value <= goal.max);
    out.push({ label, value: fmt(value), short: fmt(value), goal: `${goal.min !== undefined ? fmt(goal.min) : ''}–${goal.max !== undefined ? fmt(goal.max) : ''}`, met });
  };
  const share = (n: number, d: number) => (d === 0 ? 0 : n / d);
  range('accounts under 13, or opened under 18 without a parent', r.minors.under13 + r.minors.openedWithoutParent, t.minorsBroken, (n) => n.toFixed(0));
  range('sponsorships of someone under 18 not signed by a parent', r.minors.unsignedDeals, t.minorsBroken, (n) => n.toFixed(0));
  range('invariant failures about social media', r.invariantFailures, t.minorsBroken, (n) => n.toFixed(0));
  range('lives with an account', share(r.withAccount, r.lives), report.player === 'star' ? t.withAccountStar : t.withAccount);
  range('accounts per life with one', share(r.accountsOpened, r.withAccount), t.accountsPerLife, (n) => n.toFixed(2));
  range('posts an account year', share(r.posts, r.accountYears), report.player === 'star' ? t.postsPerYearStar : t.postsPerYear, (n) => n.toFixed(2));
  range('lives with a post that reached an employer, a partner, an ex or family', share(r.lives_.found, r.withAccount), t.foundLives);
  range('lives with an account whose post reached an employer', share(r.lives_.employer, r.withAccount), t.employerLives);
  range('lives with an account whose post reached a partner', share(r.lives_.partner, r.withAccount), t.partnerLives);
  if (report.player !== 'star') return out;
  range('careers in the social media path among star lives', share(r.creators.lives, r.lives), t.creatorLives);
  range('creators that earned from a platform', share(r.creators.earned, Math.max(1, r.creators.lives)), t.creatorEarned);
  range('creators with a viral moment (lives)', share(r.creators.viral, Math.max(1, r.creators.lives)), t.viralLives);
  range('creators with a row (lives)', share(r.creators.controversy, Math.max(1, r.creators.lives)), t.controversyLives);
  range('creators cancelled (lives)', share(r.creators.cancelled, Math.max(1, r.creators.lives)), t.cancelledLives);
  range('creators that went past the middle of the ladder (rung 4 or higher)', share(r.creators.peak.slice(3).reduce((a, n) => a + n, 0), Math.max(1, r.creators.lives)), t.creatorPastMiddle);
  range('creators that reached the top rung', share(r.creators.peak[r.creators.peak.length - 1]!, Math.max(1, r.creators.lives)), t.creatorTop);
  const at28 = r.creators.at28;
  range('begun as a teen: reached rung 3 by 28', share(at28.filter((x) => x >= 3).length, Math.max(1, at28.length)), t.teenRung3By28);
  return out;
}
