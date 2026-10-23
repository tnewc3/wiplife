/**
 * The social step (Batch 8, year pipeline, before the fame step): as each year
 * begins, for anyone with an account:
 *
 * - what you posted last year is counted: engagement follows the quality of
 *   the posts, followers fade (far faster on an account you left alone),
 *   fans of your music, acting or sport follow you, and a cancellation heals;
 * - an account passes its platform's threshold and starts to earn, or is
 *   demonetized; the algorithm changes its mind about a platform;
 * - the platforms pay, by their own models, and a brand sponsorship adds to
 *   it; the pay is set aside for the ledger (income.ts);
 * - as a creator: burnout from a treadmill year after year, a row that may
 *   become a cancellation (an event decides), a viral post that is a big break,
 *   and your reach becoming fame and a rung (the fame step does the rest);
 * - as anyone: a post you would not want certain people to see may reach an
 *   employer, a partner, an ex or family, and the gossip web picks it up;
 *   a parent keeps an eye on an account you are too young to hold alone.
 *
 * It draws nothing from the generator for a life with no account. Numbers:
 * balance/social.yaml. Events: registries/social.yaml.
 */
import type { ContentBundle, SocialTrigger } from '../../content/schemas';
import { curveAt } from '../curve';
import { eventWeight } from '../events/selection';
import { isIncarcerated } from '../legal';
import { clampInt, weightedPick } from '../random';
import { chance, pick, type RngState } from '../rng';
import { writeFromGroup } from '../systems/history';
import { bigBreak, climb, dropRung } from '../fame/ladder';
import { breakCeiling, isMinorStar, pathDef, rungDef } from '../fame/query';
import { RECENT } from '../fame/work';
import { startItem } from '../web/knowledge';
import { ITEM_ROLE } from '../web/query';
import { inCircle } from '../web/ties';
import type { Id, LifeState, SocialAccount } from '../types';
import { hasSponsor, settleSocialIncome, yearEarnings } from './income';
import {
  accountList,
  emptySocialYear,
  followerWords,
  isCreator,
  platformBudget,
  platformOf,
  reachOf,
} from './query';

/** The milestones an account can pass, in followers. */
const MILESTONES = [1_000, 10_000, 100_000, 1_000_000, 10_000_000];

/** Queues one of a trigger's events for this year, picked by weight among those that fit now, unless one of them is already queued. */
export function queueSocialEvent(state: LifeState, trigger: SocialTrigger, content: ContentBundle, cast: Record<string, Id> = {}): boolean {
  const ids = content.registries.social.triggers[trigger].events;
  const options = ids.flatMap((id) => {
    const def = content.events[id];
    if (!def || def.retired) return [];
    const weight = eventWeight(state, def, content);
    return weight > 0 ? [[def, weight] as const] : [];
  });
  if (options.length === 0) return false;
  if (state.scheduled.some((s) => ids.includes(s.eventId) && s.dueYear === state.currentYear)) return false;
  const def = weightedPick(state.rng, options);
  state.scheduled.push({ eventId: def.id, dueYear: state.currentYear, cast });
  return true;
}

interface Pending {
  trigger: SocialTrigger;
  cast?: Record<string, Id>;
  platform?: Id;
}

/** The person closest to you of a kind, alive and in your life (the first by id among equals), or undefined. */
function nearest(state: LifeState, kinds: readonly string[]): Id | undefined {
  return Object.keys(state.relationships)
    .sort()
    .find((id) => kinds.includes(state.relationships[id]!.kind) && state.relationships[id]!.status !== 'ended' && inCircle(state, id));
}

/** Everyone a post could reach who was not meant to see it: who they are to you, and the person. */
function audiences(state: LifeState): { kind: 'employer' | 'partner' | 'ex' | 'family'; id: Id }[] {
  const age = state.character.age;
  const out: { kind: 'employer' | 'partner' | 'ex' | 'family'; id: Id }[] = [];
  const boss = age >= 16 && state.career.job !== null ? nearest(state, ['boss']) : undefined;
  if (boss) out.push({ kind: 'employer', id: boss });
  const partner = age >= 18 ? nearest(state, ['partner', 'fiance', 'spouse']) : undefined;
  if (partner) out.push({ kind: 'partner', id: partner });
  const ex = age >= 18 ? nearest(state, ['ex']) : undefined;
  if (ex) out.push({ kind: 'ex', id: ex });
  const family = nearest(state, ['parent', 'stepparent', 'sibling', 'grandparent']);
  if (family) out.push({ kind: 'family', id: family });
  return out;
}

/** Step: the social year. */
export function runSocial(state: LifeState, content: ContentBundle): void {
  const s = state.social;
  const year = state.currentYear;
  const last = s.year;
  const accounts = accountList(state);
  s.year = emptySocialYear(year);
  s.focus = null;
  if (s.happened.year !== year) s.happened = { year, triggers: [] };
  if (accounts.length === 0) {
    s.streak = 0;
    s.controversy = null;
    return;
  }
  const b = content.balance.social;
  const rng = state.rng;
  const f = state.fame;
  const prison = isIncarcerated(state);
  const creator = isCreator(state);
  // What was done between years is last year's record (an older one means nothing was done).
  const postsOf: Record<Id, number> = last.year === year - 1 ? last.posts : {};
  const qualityOf: Record<Id, number> = last.year === year - 1 ? last.quality : {};
  const boldLast = last.year === year - 1 ? last.bold : 0;
  const riskyLast: Record<Id, number> = last.year === year - 1 ? last.risky : {};
  const viralLast: Id[] = last.year === year - 1 ? last.viral : [];
  const collabsLast: Id[] = last.year === year - 1 ? last.collabs : [];
  const pending: Pending[] = [];
  const mark = (trigger: SocialTrigger) => {
    if (!s.happened.triggers.includes(trigger)) s.happened.triggers.push(trigger);
  };

  // A cancellation heals: a share of what was lost comes back each year.
  if (s.controversy?.stage === 'cancelled') {
    let any = false;
    for (const [id, lost] of Object.entries(s.controversy.lost)) {
      const a = s.accounts[id];
      if (!a || lost < 1) {
        delete s.controversy.lost[id];
        continue;
      }
      const back = Math.round(lost * b.controversy.recover);
      a.followers += back;
      s.controversy.lost[id] = lost - back;
      any = any || lost - back >= 1;
    }
    if (!any || year - s.controversy.year >= 5) s.controversy = null;
  } else if (s.controversy && s.controversy.year < year) {
    s.controversy = null;
  }

  // Each account's year.
  let postedTotal = 0;
  let budgetTotal = 0;
  let qualitySum = 0;
  const milestones: { platform: Id }[] = [];
  for (const a of accounts) {
    const platform = platformOf(content, a.platform);
    if (!platform) continue;
    const g = b.growth[platform.growth];
    const n = postsOf[a.platform] ?? 0;
    const budget = platformBudget(state, platform, content);
    const activity = Math.min(1, n / budget);
    postedTotal += n;
    budgetTotal += budget;
    qualitySum += qualityOf[a.platform] ?? 0;
    const peakBefore = a.peak;
    if (n > 0) {
      const avg = (qualityOf[a.platform] ?? 0) / n;
      a.engagement = clampInt(Math.round(a.engagement + (avg - a.engagement) * b.engagement.follow), 0, 100);
    } else {
      a.engagement = clampInt(a.engagement - b.engagement.idle, 0, 100);
    }
    a.followers = Math.max(0, Math.round(a.followers * (1 - (n === 0 ? g.idleFade : g.fade * (1 - activity)))));
    // Fans of your music, acting or sport follow you here.
    if (f.active && f.main !== 'social' && f.fans >= b.crossover.minFans && !a.private) {
      const floor = Math.round(f.fans * (b.platforms[a.platform]?.cross ?? 0) * b.crossover.share);
      if (a.followers < floor) a.followers += Math.round((floor - a.followers) * b.crossover.follow);
    }
    a.peak = Math.max(a.peak, a.followers);
    const crossed = MILESTONES.find((m) => peakBefore < m && a.peak >= m);
    if (crossed !== undefined) milestones.push({ platform: a.platform });

    if (prison) continue;
    // The platform starts paying.
    const pay = b.pay[platform.pay];
    if (a.monetized === 0 && !a.private && a.followers >= pay.threshold && n >= pay.minPosts) {
      a.monetized = year;
      s.totals.monetized += 1;
      writeFromGroup(state, content.text.social.history.monetized, ['social', 'monetized'], { values: { platform: platform.name, handle: a.handle } }, content);
      pending.push({ trigger: 'monetized', platform: a.platform });
      mark('monetized');
    }
    // ... or stops: a rule you had not read.
    if (a.monetized > 0 && a.demonetized < year && chance(rng, b.demonetize.chance + b.demonetize.bold * Math.min(boldLast, 5))) {
      a.demonetized = year + b.demonetize.years - 1;
      s.totals.demonetized += 1;
      writeFromGroup(state, content.text.social.history.demonetized, ['social', 'demonetized'], { values: { platform: platform.name, handle: a.handle } }, content);
      pending.push({ trigger: 'demonetized', platform: a.platform });
      mark('demonetized');
    }
    // The algorithm changes its mind about the platform for the year that has begun.
    if (a.followers >= b.algorithm.minFollowers && chance(rng, b.algorithm.chance)) {
      const up = chance(rng, b.algorithm.up);
      s.algorithm.shifts[a.platform] = up ? 'up' : 'down';
      if (up) s.totals.algorithmUp += 1;
      else s.totals.algorithmDown += 1;
      pending.push({ trigger: up ? 'algorithmUp' : 'algorithmDown', platform: a.platform });
      mark(up ? 'algorithmUp' : 'algorithmDown');
    }
  }
  s.algorithm.year = year;
  // (Shifts rolled this year are for this year; older ones are gone.)
  for (const id of Object.keys(s.algorithm.shifts)) if (!accounts.some((a) => a.platform === id)) delete s.algorithm.shifts[id];

  if (prison) {
    s.streak = 0;
    return;
  }

  // The platforms pay.
  const parts = yearEarnings(state, postsOf, year, content);
  settleSocialIncome(state, parts, content);

  // The treadmill: most of the budget used, year after year, wears a creator down.
  if (creator && budgetTotal > 0 && postedTotal / budgetTotal >= b.burnout.share) s.streak += 1;
  else s.streak = 0;
  const top = [...accounts].sort((x, y) => y.followers - x.followers || (x.platform < y.platform ? -1 : 1))[0]!;
  if (s.streak >= b.burnout.streak && chance(rng, b.burnout.chance)) {
    s.streak = 0;
    s.totals.burnouts += 1;
    f.burnout = clampInt(f.burnout + b.burnout.burnout, 0, 100);
    state.character.stats.stress = clampInt(state.character.stats.stress + b.burnout.stress, 0, 100);
    writeFromGroup(state, content.text.social.history.burnout, ['social', 'burnout'], { values: { platform: platformOf(content, top.platform)?.name ?? '', handle: top.handle } }, content);
    pending.push({ trigger: 'burnout', platform: top.platform });
    mark('burnout');
  }

  // A row: the bigger you are, the more people there are to take offence, and the bold thing you said last year did not help.
  if (s.controversy === null && top.followers >= b.controversy.minFollowers) {
    const heat = content.niches[top.niche]?.heat ?? 1;
    const p = Math.min(0.5, (b.controversy.chance + b.controversy.bold * Math.min(boldLast, 8)) * heat);
    if (chance(rng, p)) {
      s.controversy = { year, platform: top.platform, stage: 'brewing', lost: {} };
      s.totals.controversies += 1;
      pending.push({ trigger: 'controversy', platform: top.platform });
      mark('controversy');
    }
  }

  // The year after a cancellation: what it left behind.
  if (s.controversy?.stage === 'cancelled' && s.controversy.year === year - 1) {
    pending.push({ trigger: 'cancelled', platform: s.controversy.platform });
    mark('cancelled');
  }

  // A viral post: for a creator a big break, for anyone else a strange week.
  if (viralLast.length > 0) {
    const platform = viralLast[0]!;
    const path = f.paths.social;
    if (creator && path) {
      const def = pathDef(content, 'social');
      const cool = path.breakYear > 0 && year - path.breakYear < content.balance.fame.bigBreak.cooldown;
      if (def && !cool && path.rung < breakCeiling(state, def, content)) {
        // The break carries you only as high as your reach can hold.
        const before = path.rung;
        const peak = path.peak;
        if (bigBreak(state, 'social', content, rng) > 0) {
          const hold = curveAt(b.fame.at, reachOf(state, content)) + b.fame.breakMargin;
          let allowed = before;
          for (let r = before + 1; r <= path.rung; r++) if (rungDef(def, r).fame <= hold) allowed = r;
          path.rung = allowed;
          path.peak = Math.max(peak, allowed);
        }
      }
      writeFromGroup(state, content.text.social.history.viral, ['social', 'viral'], { values: { platform: platformOf(content, platform)?.name ?? '', handle: s.accounts[platform]?.handle ?? '', followerWords: followerWords(s.accounts[platform]?.followers ?? 0, content) } }, content);
      pending.push({ trigger: 'viral', platform });
      mark('viral');
    } else {
      writeFromGroup(state, content.text.social.history.viral, ['social', 'viral'], { values: { platform: platformOf(content, platform)?.name ?? '', handle: s.accounts[platform]?.handle ?? '', followerWords: followerWords(s.accounts[platform]?.followers ?? 0, content) } }, content);
      pending.push({ trigger: 'viralCasual', platform });
      mark('viralCasual');
    }
  } else if (milestones.length > 0) {
    pending.push({ trigger: 'milestone', platform: milestones[0]!.platform });
    mark('milestone');
  }

  // Posts you would not want certain people to see.
  const audience = audiences(state);
  const risky = Object.entries(riskyLast).sort(([x], [y]) => (x < y ? -1 : 1));
  let finds = 0;
  if (audience.length > 0) {
    for (const [platformId, count] of risky) {
      const a = s.accounts[platformId];
      if (!a) continue;
      const reach = a.private ? b.private.find : 1 + Math.min(b.casual.cap, (a.followers / 1000) * b.casual.perThousand);
      for (let k = 0; k < Math.min(count, b.casual.max) && finds < b.casual.maxFinds; k++) {
        const found = audience.find((x) => chance(rng, Math.min(1, b.casual.find[x.kind] * reach)));
        if (!found) continue;
        finds += 1;
        const key = `found${found.kind[0]!.toUpperCase()}${found.kind.slice(1)}` as 'foundEmployer' | 'foundPartner' | 'foundEx' | 'foundFamily';
        s.totals[key] += 1;
        writeFromGroup(state, content.text.social.history.found, ['social', 'found'], { values: {} }, content);
        pending.push({ trigger: key, cast: { npc: found.id }, platform: platformId });
        mark(key);
        // The gossip web picks it up; the one who found it already knows.
        const item = startItem({ cur: state, web: state.web, content, rng, year }, 'onlinePost', 'you', 'post_out', found.id);
        if (item) {
          item.holders[found.id] = { version: item.truth, since: year, from: 'saw', reacted: true };
          pending[pending.length - 1]!.cast = { npc: found.id, [ITEM_ROLE]: item.id };
        }
      }
    }
  }

  // The career: reach becomes fame, and the quality of what you posted decides how far it can climb.
  const path = f.paths.social;
  if (creator && path) {
    if (postedTotal > 0) {
      path.recent = [...path.recent, Math.round(qualitySum / postedTotal)].slice(-RECENT);
      path.last = year;
      s.workedYear = year;
    }
    const target = curveAt(b.fame.at, reachOf(state, content));
    path.fame = Math.max(0, Math.min(100, path.fame + (target - path.fame) * (target > path.fame ? b.fame.up : b.fame.down)));
    climb(state, 'social', content);
    // A rung you were carried to (a viral break) is held by the reach to keep it: when the followers don't follow, it goes.
    const socialDef = pathDef(content, 'social');
    while (socialDef && dropRung(state, socialDef, path, content)) continue;
  } else if (postedTotal > 0) {
    s.workedYear = year;
  }

  // Under 18: a parent keeps an eye on it.
  if (isMinorStar(state, content) && chance(rng, 0.2)) {
    const parent = nearest(state, ['parent', 'stepparent']);
    if (parent) pending.push({ trigger: 'minor', cast: { npc: parent }, platform: top.platform });
  }
  // A fan base from somewhere else finds you online.
  if (f.active && f.main !== 'social' && f.fans >= b.crossover.minFans && chance(rng, 0.15)) pending.push({ trigger: 'crossover', platform: top.platform });
  // Someone you know who makes content asks you to make something with them, or you made something last year.
  if (collabsLast.length > 0 && chance(rng, 0.6)) pending.push({ trigger: 'collab', cast: { npc: pick(rng, collabsLast) } });
  if (hasSponsor(state, content) && chance(rng, 0.12)) pending.push({ trigger: 'sponsor', platform: top.platform });

  // Queue the events, up to the cap, all about the same platform (the words name it).
  let room = b.events.maxQueued;
  for (const p of pending) {
    if (room <= 0) break;
    const where = p.platform ?? top.platform;
    if (s.focus && s.focus.year === year && p.platform !== undefined && s.focus.platform !== where) continue;
    const prior = s.focus;
    if (p.platform !== undefined && !s.focus) s.focus = { year, platform: where };
    if (queueSocialEvent(state, p.trigger, content, p.cast)) room -= 1;
    else s.focus = prior;
  }
}

/** A cancellation: your followers go, public image and fan mood fall, the tabloids may run it and the web talks. */
export function cancel(state: LifeState, content: ContentBundle, rng: RngState): void {
  const s = state.social;
  const b = content.balance.social.controversy;
  const lost: Record<Id, number> = {};
  for (const a of accountList(state)) {
    const gone = Math.round(a.followers * b.lose);
    a.followers -= gone;
    lost[a.platform] = gone;
  }
  const top = [...accountList(state)].sort((x, y) => y.followers - x.followers)[0];
  s.controversy = { year: state.currentYear, platform: s.controversy?.platform ?? top?.platform ?? '', stage: 'cancelled', lost };
  s.totals.cancellations += 1;
  const f = state.fame;
  if (f.active) {
    f.image = clampInt(f.image - b.image, 0, 100);
    f.mood = clampInt(f.mood - b.mood, 0, 100);
    const path = f.main === null ? undefined : f.paths[f.main];
    if (path) path.fame = Math.max(0, path.fame - b.fame);
    const tabloids = content.balance.fame.tabloids;
    if (path && path.fame >= tabloids.minFame && state.character.age >= tabloids.minAge) {
      const lines = content.text.social.tabloid.cancelled;
      const name = `${state.character.name.first} ${state.character.name.last}`;
      f.headlines.push({ year: state.currentYear, text: pick(rng, lines).replace('{name}', name), kind: 'social' });
      if (f.headlines.length > content.balance.fame.tabloids.keep) f.headlines.splice(0, f.headlines.length - content.balance.fame.tabloids.keep);
      f.totals.scandals += 1;
    }
  }
  const platform = platformOf(content, s.controversy.platform);
  writeFromGroup(state, content.text.social.history.cancelled, ['social', 'cancelled'], { values: { platform: platform?.name ?? '', handle: s.accounts[s.controversy.platform]?.handle ?? '' } }, content);
  startItem({ cur: state, web: state.web, content, rng, year: state.currentYear }, 'onlinePost', 'you', 'called_out');
}

export type { SocialAccount };
