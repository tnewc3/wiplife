/**
 * Tryouts for specific teams (Batch 5). At every level you see the teams you could try out for, each with its level and
 * how hard it is to make (its bar), and you choose one. The tryout is a scrimmage, an event with choices (how you play
 * it); the result is your rating going in, plus how you played, plus the luck of the day, against the team's bar. Cut, the
 * next team down at the same level looks at you a little more kindly (the fallback); with none, you are without a team
 * and can try again next year.
 *
 * - Youth: rec, club, travel and (in countries with them) academy teams. Children, and teenagers alongside a school team.
 * - School: junior varsity and varsity: the T1 school team of the sport (one record with the sports career).
 * - College: community, state and elite programs.
 * - Pro: camps, for a player the draft passed by or a pro without a deal.
 *
 * The engine tries out for you when you did not choose (a new level arrives and you have no team): it aims at the best
 * team within reach, and the last team of the level takes anyone who earned the level. Numbers: balance/sports.yaml tryout.
 */
import { TEAM_TIERS, type ContentBundle, type FamePathDef, type SportDef, type SportLevel, type TeamTier, type TryoutApproach } from '../../content/schemas';
import { enterPath, enterBlock } from '../fame/ladder';
import { rungDef } from '../fame/query';
import { isIncarcerated } from '../legal';
import { clampInt, rollNormal } from '../random';
import type { RngState } from '../rng';
import { countryOf, scaledAmount } from '../country';
import { leaveSchoolTeam, schoolTeamBlock, seatOnSchoolTeam, sportActivity } from '../teen/activities';
import type { Id, LifeState, SportsTeam, SportsTryoutRecord } from '../types';
import { spend } from '../finance';
import { signCampDeal } from './contract';
import { levelOfRung, sportPath } from './query';
import { prospectRating } from './rating';
import { tierTeam } from './team';
import { marketTeams, teamById } from './league';
import { abroadAcademyClubs, academyTeam, homeAcademyClub } from './soccer';
import { sportsHistory } from './text';
import { renderText } from '../text';

type SportPath = FamePathDef & { sport: SportDef };
type AmateurLevel = Exclude<SportLevel, 'pro'>;

export type TryoutBlock = 'unknown' | 'busy' | 'prison' | 'age' | 'parent' | 'member' | 'cut' | 'year' | 'pending' | 'level' | 'country' | 'gone';

/** A team you could try out for. */
export interface TeamOption {
  /** 'school:varsity', 'college:elite', 'pro:<team id>'. */
  key: string;
  level: SportLevel;
  tier: TeamTier | null;
  name: string;
  city: Id;
  /** The team's quality (0–100). */
  quality: number;
  /** The rating the team asks of a prospect on a normal day. */
  bar: number;
  /** What a year costs you (whole dollars where you live). */
  fee: number;
  /** A club or travel team you play for alongside a school team (youth teams for teenagers). */
  club: boolean;
  /** A pro team, for a camp; the club of a trial abroad. */
  teamId: Id | null;
  /** Batch 6: a trial at a club's academy in a country the game does not model (a UK child commutes). */
  abroad?: boolean;
  block: TryoutBlock | null;
}

/** The tiers of each level, from the hardest to make to the easiest. */
export function tiersOf(level: AmateurLevel, content: ContentBundle): TeamTier[] {
  const tiers = content.balance.sports.tryout.tiers;
  return TEAM_TIERS.filter((t) => tiers[t].level === level).sort((a, b) => tiers[b].bar - tiers[a].bar);
}

const LEVEL_RUNG: Record<AmateurLevel, number> = { youth: 1, school: 2, college: 3 };

/** Whether a tier is open to this person's age and country. */
function tierOpen(state: LifeState, tier: TeamTier, content: ContentBundle, def?: SportPath): boolean {
  const t = content.balance.sports.tryout.tiers[tier];
  const age = state.character.age;
  // Batch 6: a sport with academies tied to a club (soccer) has them everywhere, for the ages its definition says.
  const academy = tier === 'academy' ? def?.sport.academy : undefined;
  if (age < (academy?.minAge ?? t.minAge) || age > (academy?.maxAge ?? t.maxAge)) return false;
  if (tier === 'academy' && academy === undefined && !countryOf(state, content).athletics.academy) return false;
  return true;
}

/** The sport you are playing now (an active career, not retired), as a definition. */
function playingSport(state: LifeState, def: SportPath): boolean {
  const f = state.fame;
  return f.active && f.main === def.id && state.sports.sport === def.id && state.sports.retired === undefined;
}

/** The level of play you are at in this sport now, or null with no career in it. */
function levelHere(state: LifeState, def: SportPath): SportLevel | null {
  return playingSport(state, def) ? levelOfRung(def.sport, state.fame.paths[def.id]!.rung) : null;
}

/** The rung a team of this level is: a youth team the first, a school team the second, a college team the third. */
export function levelRung(level: AmateurLevel): number {
  return LEVEL_RUNG[level];
}

/** Whether a player at the pro or the college door can go to a camp now: the draft passed them by, or a pro has no deal. */
export function campOpen(state: LifeState, def: SportPath, content: ContentBundle): boolean {
  const s = state.sports;
  const age = state.character.age;
  if (!playingSport(state, def) || age < def.sport.draft.age || age > content.balance.sports.contract.chaseAge) return false;
  if (s.pro) return s.contract === null;
  return s.passed > 0 && levelHere(state, def) === 'college' && s.draft === null;
}

/** The yearly fee for a team, scaled to where you live (a pro camp's is the camp fee). */
function feeOf(state: LifeState, tier: TeamTier | null, content: ContentBundle): number {
  const base = tier === null ? content.balance.sports.tryout.camp.fee : content.balance.sports.tryout.tiers[tier].fee;
  return base === 0 ? 0 : scaledAmount(state, base, content);
}

/** One amateur team as an option (no blocks checked). */
function amateurOption(state: LifeState, def: SportPath, tier: TeamTier, club: boolean, content: ContentBundle): TeamOption {
  const t = content.balance.sports.tryout.tiers[tier];
  const team = tierTeam(state, def.sport, tier, content, def.id);
  return { key: `${t.level}:${tier}`, level: t.level, tier, name: team.name, city: team.city, quality: team.quality, bar: t.bar, fee: feeOf(state, tier, content), club, teamId: null, block: null };
}

/** The trials a UK child can take at the academies of clubs in a country the game does not model (Batch 6). */
function abroadOptions(state: LifeState, def: SportPath, club: boolean, content: ContentBundle): TeamOption[] {
  const a = def.sport.academy;
  const age = state.character.age;
  if (!a || age < a.abroadMinAge || age > a.maxAge) return [];
  const T = content.balance.sports.soccer.academy.abroad;
  const t = content.balance.sports.tryout.tiers.academy;
  return abroadAcademyClubs(state, def.id, content).map((c) => {
    const team = academyTeam(state, c, def.id, Math.max(0, Math.min(100, content.balance.sports.league.quality[t.base] + t.shift)), content);
    return { key: `academy:${c.country!}`, level: 'youth' as const, tier: 'academy' as const, name: team.name, city: team.city, quality: team.quality, bar: T.bar, fee: scaledAmount(state, T.fee, content), club, teamId: c.id, abroad: true, block: null };
  });
}

/** A pro camp as an option (no blocks checked). */
function campOption(state: LifeState, def: SportPath, teamId: Id, content: ContentBundle): TeamOption | null {
  const team = teamById(state, def.id, teamId, content);
  if (!team) return null;
  const c = content.balance.sports.tryout.camp;
  return { key: `pro:${team.id}`, level: 'pro', tier: null, name: team.name, city: team.city, quality: team.quality, bar: clampInt(Math.round(c.bar + c.perQuality * (team.quality - 50) + c.perYear * Math.max(0, state.character.age - c.ageFrom)), 0, 100), fee: feeOf(state, null, content), club: false, teamId: team.id, block: null };
}

/** The year's tryouts so far (chosen or about to be played). */
function triesThisYear(state: LifeState): number {
  return state.sports.tried.filter((t) => t.year === state.currentYear).length + (state.sports.tryout ? 1 : 0);
}

/** A tier's place among its level's tiers: higher is harder. A team of the same level at or below the one you are on is not offered. */
function rank(tier: TeamTier, content: ContentBundle): number {
  return content.balance.sports.tryout.tiers[tier].bar;
}

/**
 * The teams you could try out for now, each with its level, its bar and, when you can't try out for it, why not. Reads only.
 * With no career: the youth, school and college teams your age allows. With one: the level you are at and the next one up;
 * club and travel teams alongside a school team; and pro camps for a player the draft passed by or a pro without a deal.
 */
export function teamOptions(state: LifeState, def: SportPath, content: ContentBundle): TeamOption[] {
  const s = state.sports;
  const f = state.fame;
  const age = state.character.age;
  const sport = def.sport;
  const here = levelHere(state, def);
  const out: TeamOption[] = [];
  const busy = f.active && !playingSport(state, def);
  const levels: AmateurLevel[] = [];
  if (here === null) {
    levels.push('youth', 'school', 'college');
  } else if (here === 'youth') {
    levels.push('youth', 'school');
  } else if (here === 'school') {
    levels.push('school', 'college');
  } else if (here === 'college') {
    levels.push('college');
  }
  const mine = s.team?.tier;
  for (const level of levels) {
    // A child's youth team: the youth level ends at the age you age out of it, so a teenager's only youth teams are alongside a school team.
    const asClub = level === 'youth' && here !== null && here !== 'youth';
    for (const tier of tiersOf(level, content).reverse()) {
      if (!tierOpen(state, tier, content, def)) continue;
      if (level === 'youth' && here !== 'youth' && here !== null) continue;
      if (level === 'youth' && here === null && age > (sport.ageOut[0] ?? 14) - 1) continue;
      if (level === 'youth' && here === 'youth' && age > (sport.ageOut[0] ?? 14) - 1) continue;
      if (mine !== undefined && s.team?.level === level && !asClub && rank(tier, content) < rank(mine, content)) continue;
      out.push(amateurOption(state, def, tier, false, content));
    }
  }
  // Batch 6: a trial at an academy abroad, for a child who lives in the UK (the club is in a country the game does not model).
  if (here === null || here === 'youth' || (here === 'school' && age <= content.balance.relationships.adultAge - 1)) {
    out.push(...abroadOptions(state, def, here === 'school', content).filter((o) => !(s.academy && s.academy.abroad === true && o.teamId === s.academy.clubId)));
  }
  // A club or travel team alongside a school or college team.
  if (here !== null && here !== 'youth' && here !== 'pro' && age <= content.balance.relationships.adultAge - 1) {
    for (const tier of tiersOf('youth', content).reverse()) {
      if (!tierOpen(state, tier, content, def) || rank(tier, content) === 0) continue;
      if (s.club?.tier !== undefined && rank(tier, content) < rank(s.club.tier, content)) continue;
      out.push(amateurOption(state, def, tier, true, content));
    }
  }
  if (campOpen(state, def, content)) {
    for (const team of marketTeams(state, def.id, state.character.cityId, content)) {
      const o = campOption(state, def, team.id, content);
      if (o) out.push(o);
    }
  }
  return out.map((o) => ({ ...o, block: optionBlock(state, def, o, busy, content) }));
}

/** Why you can't try out for this team now, or null. */
function optionBlock(state: LifeState, def: SportPath, o: TeamOption, busy: boolean, content: ContentBundle): TryoutBlock | null {
  const s = state.sports;
  const B = content.balance.sports.tryout;
  if (busy) return 'busy';
  if (isIncarcerated(state)) return 'prison';
  if (s.tryout) return 'pending';
  if (triesThisYear(state) >= B.perYear) return 'year';
  const cutIn = s.cut[o.key];
  if (cutIn !== undefined && state.currentYear - cutIn < B.cutWait) return 'cut';
  const t = o.tier;
  if (t !== null) {
    if (s.team?.tier === t && s.team.level === o.level && !o.club) return 'member';
    if (o.club && s.club?.tier === t) return 'member';
    if (o.level === 'school') {
      const act = sportActivity(content, def.id);
      if (!act) return 'unknown';
      if (schoolTeamBlock(state, act, content) !== null) return 'age';
    }
  }
  if (!playingSport(state, def)) {
    const route = routeFor(def, o.level as AmateurLevel);
    const eb = enterBlock(state, def.id, route?.id, content);
    if (eb === 'parent') return 'parent';
    if (eb !== null) return eb === 'age' ? 'age' : eb === 'prison' ? 'prison' : 'busy';
  } else if (o.level === 'pro' && !campOpen(state, def, content)) {
    return 'level';
  }
  return null;
}

/** The way in whose rung is that of a level (it gives the head start in craft). */
function routeFor(def: SportPath, level: AmateurLevel) {
  return def.routes.find((r) => (r.rung ?? 1) === LEVEL_RUNG[level]);
}

/** The option for a key, or undefined. */
export function optionFor(state: LifeState, def: SportPath, key: string, content: ContentBundle): TeamOption | undefined {
  return teamOptions(state, def, content).find((o) => o.key === key);
}

/** Why a tryout for this team can't be started now (null: it can). */
export function tryoutBlock(state: LifeState, sportId: Id, key: string, content: ContentBundle): TryoutBlock | null {
  const def = sportPath(content, sportId);
  if (!def) return 'unknown';
  const o = optionFor(state, def, key, content);
  if (!o) return 'gone';
  return o.block;
}

/** You choose a team to try out for. Returns whether the tryout is lined up (the scrimmage is next). */
export function startTryout(state: LifeState, sportId: Id, key: string, content: ContentBundle): boolean {
  if (tryoutBlock(state, sportId, key, content) !== null) return false;
  state.sports.tryout = { sport: sportId, key, year: state.currentYear };
  return true;
}

// ── How a tryout is decided ────────────────────────────────────────────────

/** Points on your rating for how you play the scrimmage. */
export function approachBonus(state: LifeState, approach: TryoutApproach, content: ContentBundle): number {
  const B = content.balance.sports.tryout;
  const c = state.character;
  return B.approach[approach].bonus + (approach === 'hustle' ? B.hustleDiscipline * (c.personality.discipline - 50) : 0) + (approach === 'listen' ? B.listenSmarts * (c.stats.smarts - 50) : 0);
}

export interface TryoutResult {
  made: boolean;
  /** The team you ended up on (the one you tried for, a fallback), or none. */
  landed: TeamOption | null;
  option: TeamOption;
  rating: number;
}

/** Puts you on a team. Starts the career if you had none; promotes you to the team's level; links the school team. Returns whether you are on it. */
function landOn(state: LifeState, def: SportPath, o: TeamOption, content: ContentBundle, rng: RngState): boolean {
  const B = content.balance.sports.tryout;
  if (o.level === 'pro') return o.teamId !== null && signCampDeal(state, o.teamId, content, rng);
  const level = o.level as AmateurLevel;
  if (!playingSport(state, def)) {
    if (!enterPath(state, def.id, routeFor(def, level)?.id, content, rng)) return false;
  }
  // Starting a career replaces the sports record: read it from here on.
  const s = state.sports;
  const path = state.fame.paths[def.id]!;
  const abroadClub = o.abroad === true && o.teamId !== null ? teamById(state, def.id, o.teamId, content) : undefined;
  const team: SportsTeam = abroadClub ? academyTeam(state, abroadClub, def.id, o.quality, content) : tierTeam(state, def.sport, o.tier!, content, def.id);
  // Batch 6: an academy is a club's: remember which club, so it can promote you.
  const academyClub = o.tier === 'academy' && def.sport.academy !== undefined ? (abroadClub ?? homeAcademyClub(state, def.id, content)) : undefined;
  if (academyClub) s.academy = { clubId: academyClub.id, since: state.currentYear, abroad: abroadClub !== undefined };
  if (o.club) {
    s.club = team;
    if (o.fee > 0) spend(state, o.fee, content);
    return true;
  }
  const want = LEVEL_RUNG[level];
  if (path.rung < want) {
    path.rung = want;
    path.peak = Math.max(path.peak, want);
    path.fame = Math.max(path.fame, rungDef(def, want).fame + B.fameFloor);
  }
  s.team = team;
  s.teamless = false;
  // A school team is the school team of the sport (one record); a different level leaves it.
  const act = sportActivity(content, def.id);
  if (level === 'school' && act) seatOnSchoolTeam(state, act, o.tier === 'jv' ? 'jv' : 'varsity');
  else leaveSchoolTeam(state, def.id, content);
  if (level === 'youth' && o.fee > 0) spend(state, o.fee, content);
  return true;
}

/** The sentence that says how a tryout went (from the content text). */
export function tryoutSentence(state: LifeState, rec: SportsTryoutRecord, content: ContentBundle): string {
  const T = content.text.sports.tryout;
  const group = rec.made ? (rec.level === 'pro' ? T.signed : T.made) : rec.landed !== null ? T.fallback : rec.level === 'pro' ? T.camp : T.cut;
  const line = group[(rec.year + Math.round(rec.rating) + rec.key.length) % group.length]!;
  const tier = rec.key.startsWith('pro:') ? '' : (content.text.sports.tiers[rec.key.split(':')[1] as TeamTier]?.label ?? '');
  return renderText(line, { values: { team: rec.made ? rec.name : rec.name, fallback: rec.landedName ?? '', tier, sport: sportPath(content, state.sports.sport)?.noun ?? '' } });
}

/**
 * Plays the chosen tryout: the day's score is your rating going in plus how you played plus the luck of the day. At or above
 * the bar, you make the team. Under it, the fallback at the same level (a little easier, by `fallbackEase`) may take you;
 * with none, you have no team. Records the tryout and writes the history. Returns null when nothing was lined up.
 */
export function resolveTryout(state: LifeState, approach: TryoutApproach, content: ContentBundle, rng: RngState): TryoutResult | null {
  const pending = state.sports.tryout;
  if (!pending) return null;
  state.sports.tryout = null;
  const def = sportPath(content, pending.sport);
  if (!def) return null;
  const option = optionFor(state, def, pending.key, content);
  if (!option) return null;
  const B = content.balance.sports.tryout;
  const rating = prospectRating(state, def, content);
  const score = rating + approachBonus(state, approach, content) + rollNormal(rng, { mean: 0, sd: B.luck * B.approach[approach].spread });
  let landed: TeamOption | null = null;
  const cuts: string[] = [];
  const made = score >= option.bar;
  if (made && landOn(state, def, option, content, rng)) landed = option;
  else if (option.tier !== null && !option.club) {
    // The fallback: the next tier down at the same level, each a little easier.
    let tier = B.tiers[option.tier].fallback;
    while (tier !== null && landed === null) {
      const lower = amateurOption(state, def, tier, false, content);
      if (score + B.fallbackEase >= lower.bar && landOn(state, def, lower, content, rng)) landed = lower;
      else cuts.push(lower.key);
      tier = B.tiers[tier].fallback;
    }
  }
  const ok = landed === option;
  if (!ok) cuts.push(option.key);
  // Starting a career replaces the sports record (landOn), so everything below is written to the record as it stands now.
  const s = state.sports;
  for (const key of cuts) s.cut[key] = state.currentYear;
  const record: SportsTryoutRecord = { year: state.currentYear, key: option.key, name: option.name, landedName: landed && landed !== option ? landed.name : null, level: option.level, made: ok, landed: landed ? landed.key : null, rating: Math.round(rating), bar: option.bar };
  s.tried.push(record);
  if (s.tried.length > 10) s.tried.splice(0, s.tried.length - 10);
  s.totals.tryouts += 1;
  if (landed) s.totals.tryoutsMade += 1;
  if (option.level !== 'pro') {
    if (landed) sportsHistory(state, 'madeTeam', content, { team: landed.name });
    else sportsHistory(state, 'cutTeam', content);
  }
  return { made: ok, landed, option, rating };
}

// ── The engine tries out for you ───────────────────────────────────────────

/**
 * Finds you a team at this level when you did not choose one (you reached it, or your team ended): the best team within reach,
 * with the last team of the level taking you if you earned the level. Returns whether you are on a team now. Not a tryout you
 * took, so nothing is recorded.
 */
export function autoTeam(state: LifeState, def: SportPath, level: AmateurLevel, content: ContentBundle, rng: RngState): boolean {
  const B = content.balance.sports.tryout;
  // The level was earned (a big break can put a young player there): age does not close the bottom team of it.
  const tiers = tiersOf(level, content).filter((t) => t !== 'academy' || countryOf(state, content).athletics.academy || def.sport.academy !== undefined);
  if (tiers.length === 0) return false;
  const rating = prospectRating(state, def, content);
  const score = rating + rollNormal(rng, { mean: 0, sd: B.luck });
  let aim = tiers.find((t) => B.tiers[t].bar <= rating + B.autoSlack) ?? tiers[tiers.length - 1]!;
  while (true) {
    const o = amateurOption(state, def, aim, false, content);
    const bottom = B.tiers[aim].fallback === null || tiers.indexOf(aim) === tiers.length - 1;
    if (score + (o.tier === tiers[0] ? 0 : B.fallbackEase) >= o.bar || bottom) return landOn(state, def, o, content, rng);
    aim = B.tiers[aim].fallback!;
  }
}

/**
 * A school team of the sport takes you without a tryout of its own (an event had its say: a check passed, a coach asked): you
 * are on the varsity, which starts the sports career or continues it. Returns whether you are on it.
 */
export function enrollSchoolTeam(state: LifeState, sportId: Id, content: ContentBundle, rng: RngState): boolean {
  const def = sportPath(content, sportId);
  if (!def) return false;
  const o = optionFor(state, def, 'school:varsity', content);
  if (!o || (o.block !== null && o.block !== 'cut' && o.block !== 'year')) return false;
  return landOn(state, def, o, content, rng);
}

/** The standard normal cumulative distribution (Abramowitz and Stegun 7.1.26). */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/** Your chance of making a team playing the scrimmage steadily, going by your rating today. Reads only. */
export function tryoutOdds(state: LifeState, def: SportPath, option: TeamOption, content: ContentBundle): number {
  const B = content.balance.sports.tryout;
  const rating = prospectRating(state, def, content);
  const sd = Math.max(0.5, B.luck * B.approach.steady.spread);
  return normalCdf((rating + approachBonus(state, 'steady', content) - option.bar) / sd);
}
