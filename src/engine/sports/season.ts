/**
 * The sports season (E6c), as part of the fame step's year: for someone whose
 * main path is a sport, as the year begins:
 *
 * - An unfinished playoff run from last year is settled.
 * - Playing through pain last year comes due; training focus and form apply.
 * - Below the pros: you age out of a level you did not climb out of, and a
 *   new level gets you a new team. In the pros: a deal that ran out is
 *   renewed or lost, you may be released or traded, and a free agent looks
 *   for a team or is shut out.
 * - The season is played: your rating comes from talent, Fitness, how well you
 *   fit your position, your team's quality, injuries, your age (peak and
 *   decline), form and training; the team's record and standing from the
 *   strengths of the sides; key numbers from the position; the playoffs if the
 *   team qualifies; an all-star nod. The season lands like any work in E6b
 *   (fame, fans, mood, image, the climb, a nomination).
 * - A college prospect old enough goes into the draft.
 * - The events the year calls for are queued.
 *
 * Numbers: balance/sports.yaml (and balance/fame.yaml for what is shared).
 */
import type { ContentBundle, SportRole, SportsTrigger } from '../../content/schemas';
import { curveAt } from '../curve';
import { landProject } from '../fame/step';
import { rungDef } from '../fame/query';
import { bandFor, type Roll } from '../fame/work';
import { clampInt, rollNormal, wholeChange } from '../random';
import { chance, pick, type RngState } from '../rng';
import { spend } from '../finance';
import { scaledAmount } from '../country';
import type { FamePlan, FameProject, LifeState, SportsSeason } from '../types';
import { draftScoreBase, draftSlot, extend, moveToTeam, pickTeamId, releasePlayer, tradePlayer, undraftedOffer } from './contract';
import { divisionOf, hasDivisions, sameLeague, teamById, homeLeagueTeams } from './league';
import { academyIntake, clubStrength, endLoan, loanStep, openWindow, settleLeagues } from './soccer';
import { commuteStrain, worldTriggers } from './world';
import { agePain, missedShare, rollInjury } from './injury';
import { settleRun } from './playoffs';
import { queueSportsEvent } from './queue';
import { bestPosition, injuryNow, levelOfRung, positionOf, recentRating, sportPath } from './query';
import { prospectRating, ratingFor, type SportPath } from './rating';
import { retireSports } from './retire';
import { scholarshipStarting, scholarshipStep } from './scholarship';
import { anotherTeam, tierTeam } from './team';
import { sportsHistory } from './text';
import { autoTeam, campOpen, levelRung } from './tryout';
import { leaveSchoolTeam, seatOnSchoolTeam, sportActivity } from '../teen/activities';

export { ratingFor };

export interface SeasonOut {
  /** The season as a piece of work, when one was played. */
  project?: FameProject;
  /** Pay the season (and any buyout) brought, before anyone's cut. */
  earned: number;
  triggers: SportsTrigger[];
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

interface Standing {
  wins: number;
  draws: number;
  losses: number;
  rank: number;
  of: number;
  qualified: boolean;
  own: number;
  rival: number;
}

/**
 * The strengths of the other sides in a pro team's league. Soccer's clubs have a strength in a year that depends on nothing but the
 * life's seed, the club and the year (so the leagues can be settled for every club without drawing from the life's generator); the
 * other sports draw each side's luck as they always did.
 */
function proOthers(state: LifeState, path: SportPath, team: { quality: number; id: string | null }, content: ContentBundle, rng: RngState): number[] {
  const L = content.balance.sports.league;
  const me = team.id !== null ? teamById(state, path.id, team.id, content) : undefined;
  const league = me ? sameLeague(state, path.id, me, content) : homeLeagueTeams(state, path.id, state.character.cityId, content);
  const rivals = league.filter((t) => t.id !== team.id);
  if (hasDivisions(path.sport)) return rivals.map((t) => clubStrength(state, t, state.currentYear, content));
  return rivals.map((t) => t.quality + rollNormal(rng, { mean: 0, sd: L.strengthSd }));
}

/** The team's year: its strength (quality, luck and what you add) against the rest of the league's. */
function standing(state: LifeState, path: SportPath, level: 'youth' | 'school' | 'college' | 'pro', team: { quality: number; id: string | null }, rating: number, played: number, content: ContentBundle, rng: RngState): Standing {
  const L = content.balance.sports.league;
  const position = positionOf(path.sport, state.sports.position);
  const impact = position?.impact ?? 1;
  const own = team.quality + rollNormal(rng, { mean: 0, sd: L.strengthSd }) + (rating - 50) * L.playerShare * impact * played;
  const others: number[] =
    level === 'pro'
      ? proOthers(state, path, team, content, rng)
      : Array.from({ length: L.rivals }, () => team.quality + rollNormal(rng, { mean: 0, sd: 9 }) + rollNormal(rng, { mean: 0, sd: L.strengthSd }));
  const rank = 1 + others.filter((o) => o > own).length;
  const mean = others.reduce((a, b) => a + b, 0) / Math.max(1, others.length);
  const p = logistic((own - mean) / L.winScale);
  const games = level === 'pro' ? path.sport.season.games : L.games[level];
  let wins: number;
  let draws = 0;
  if (path.sport.season.draws) {
    draws = Math.round(games * L.draws * 4 * p * (1 - p));
    const decisive = games - draws;
    wins = clampInt(Math.round(decisive * p + rollNormal(rng, { mean: 0, sd: Math.sqrt(decisive * p * (1 - p)) })), 0, decisive);
  } else {
    wins = clampInt(Math.round(games * p + rollNormal(rng, { mean: 0, sd: Math.sqrt(games * p * (1 - p)) })), 0, games);
  }
  const losses = games - wins - draws;
  const of = others.length + 1;
  // A small league (a country's few teams) sends at most half of its teams to the playoffs.
  const qualified = level === 'pro' ? rank <= Math.min(path.sport.season.playoffTeams, Math.ceil(of / 2)) : rank <= Math.ceil(of * L.amateurPlayoffs);
  const top = [...others].sort((a, b) => b - a).slice(0, 3);
  const rival = top.length === 0 ? mean : top.reduce((a, b) => a + b, 0) / top.length;
  return { wins, draws, losses, rank, of, qualified, own, rival };
}

/** The key numbers for your position: from low (rating 0) to high (rating 100), with a little noise. */
function statsFor(path: SportPath, positionId: string | null, rating: number, rng: RngState): Record<string, number> {
  const position = positionOf(path.sport, positionId) ?? path.sport.positions[0]!;
  const out: Record<string, number> = {};
  for (const s of position.stats) {
    const spec = path.sport.stats.find((x) => x.id === s.id);
    const span = s.high - s.low;
    const value = s.low + span * (rating / 100) + rollNormal(rng, { mean: 0, sd: Math.abs(span) * 0.04 });
    const lo = Math.min(s.low, s.high);
    const hi = Math.max(s.low, s.high);
    const decimals = spec?.decimals ?? 1;
    out[s.id] = Math.round(Math.min(hi * 1.15, Math.max(Math.min(lo, 0), value)) * 10 ** decimals) / 10 ** decimals;
  }
  return out;
}

/** An unfinished run from last year, pain from last year, and the like. Returns nothing; changes the state. */
function housekeeping(state: LifeState, path: SportPath, content: ContentBundle, rng: RngState): 'ended' | null {
  const s = state.sports;
  if (s.run) settleRun(state, content, rng);
  s.rest = false;
  const pain = agePain(state, path.sport, content, rng);
  return pain === 'ended' ? 'ended' : null;
}

/** Pro roster business before the season: free agency, releases, trades. Returns whether you have a team to play for, and what it paid. */
function proMoves(state: LifeState, path: SportPath, content: ContentBundle, rng: RngState, triggers: SportsTrigger[]): { playing: boolean; earned: number } {
  const s = state.sports;
  const b = content.balance.sports;
  const year = state.currentYear;
  const pstate = state.fame.paths[path.id]!;
  const rating = recentRating(state);
  let earned = 0;

  // Batch 6: last year's window is closed, and a loan that has run its season ends (you are back with your own club) before the deal is looked at.
  s.transfer = null;
  if (!s.loan) s.loanOffer = null;
  if (s.loan && (s.loan.until < year || !s.contract)) endLoan(state, path, content);

  if (!s.contract || !s.team) {
    // A free agent: a team signs you, or the year passes. Batch 5: nothing shuts you out while you keep trying (camps, open
    // tryouts, calls); past the age limit in balance the phone stops ringing.
    if (state.character.age > b.contract.chaseAge) return { playing: false, earned: -1 };
    if (chance(rng, curveAt(b.contract.freeAgent, rating))) {
      const team = anotherTeam(state, path.id, null, state.character.cityId, content, rng, hasDivisions(path.sport) ? rating : undefined);
      moveToTeam(state, team.id, true, content, rng);
      triggers.push('signed');
      return { playing: true, earned };
    }
    s.unsigned += 1;
    if (campOpen(state, path, content)) triggers.push('camp');
    return { playing: false, earned };
  }

  const c = s.contract;
  // A deal that has run out: your team keeps you, or you are on the market.
  if (c.until < year) {
    const tested = s.playOut;
    const kept = tested ? chance(rng, 0.5) : rating >= b.contract.keep.rating || chance(rng, b.contract.keep.chance);
    if (kept) {
      if (extend(state, 'fair', content, rng)) triggers.push(tested ? 'freeAgency' : 'signed');
    } else {
      const team = chance(rng, curveAt(b.contract.freeAgent, rating)) ? anotherTeam(state, path.id, c.teamId, state.character.cityId, content, rng, hasDivisions(path.sport) ? rating : undefined) : null;
      if (team) {
        s.contract = null;
        moveToTeam(state, team.id, true, content, rng);
        triggers.push('freeAgency');
      } else {
        s.contract = null;
        s.team = null;
        s.unsigned = 1;
        triggers.push('released');
        return { playing: false, earned };
      }
    }
  }

  const deal = s.contract;
  if (!deal) return { playing: false, earned };

  // A player who asked for a new deal pushes for it.
  if (s.ask === 'contract') {
    extend(state, 'rich', content, rng);
    triggers.push('signed');
  }

  // Cut: when the rating has fallen short of the rung.
  const need = rungDef(path, Math.max(pstate.rung, path.sport.proRung)).quality;
  const gap = need - rating - b.release.slack;
  if (!s.loan && s.seasons.length > 0 && deal.since < year && gap > 0 && chance(rng, Math.min(b.release.max, gap * b.release.perPoint))) {
    earned += releasePlayer(state, content);
    triggers.push('released');
    return { playing: false, earned };
  }

  if (hasDivisions(path.sport)) {
    // Batch 6, soccer: no trades. The club holds your contract and may send you on loan; each year the transfer window brings offers.
    if (loanStep(state, path, content, rng)) triggers.push('loan');
    if (!s.loan && openWindow(state, path, content, rng) > 0) triggers.push('window');
    s.ask = s.ask === 'trade' ? null : s.ask;
  } else {
    // Traded, or refused when you asked (asking decides it: the team gives in, or does not).
    const asked = s.ask === 'trade';
    if (deal.since < year || asked) {
      if (asked) {
        if (chance(rng, b.trade.grant)) {
          if (tradePlayer(state, content, rng)) triggers.push('traded');
        } else {
          state.fame.mood = clampInt(state.fame.mood - b.trade.refusedMood, 0, 100);
        }
      } else if (chance(rng, b.trade.chance) && tradePlayer(state, content, rng)) {
        triggers.push('traded');
      }
    }
  }
  if (s.contract && s.contract.until === year && !s.playOut) triggers.push('contractYear');
  if (s.ask !== 'loan') s.ask = null;
  return { playing: true, earned };
}

/** Seasons in a row you have played for this team. */
export function seasonsWithTeam(state: LifeState, teamName: string): number {
  let n = 0;
  for (let i = state.sports.seasons.length - 1; i >= 0 && state.sports.seasons[i]!.team === teamName; i--) n += 1;
  return n;
}

/**
 * Your place on the team this year (Batch 5): your rating against the team's quality sets where you should be, and a place
 * moves one step a year toward it (a new team starts you at it). Role events move you a step as well.
 */
function roleFor(state: LifeState, path: SportPath, team: { quality: number; name: string }, content: ContentBundle): SportRole {
  const s = state.sports;
  const R = content.balance.sports.role;
  const rating = s.seasons.length === 0 ? prospectRating(state, path, content) : recentRating(state);
  const gap = rating - team.quality;
  const target: SportRole = gap >= R.starter ? 'starter' : gap >= R.rotation ? 'rotation' : 'reserve';
  if (seasonsWithTeam(state, team.name) === 0) return target;
  const order: SportRole[] = ['reserve', 'rotation', 'starter'];
  const now = order.indexOf(s.role);
  const want = order.indexOf(target);
  return order[now + Math.sign(want - now)] ?? target;
}

/** Plays the year's season for someone whose main path is a sport; null otherwise. */
export function playSeason(state: LifeState, content: ContentBundle, rng: RngState): SeasonOut | null {
  const f = state.fame;
  const path = sportPath(content, f.main);
  if (!f.active || !path) return null;
  const s = state.sports;
  const pstate = f.paths[path.id];
  if (!pstate || s.sport !== path.id) return null;
  const year = state.currentYear;
  const b = content.balance.sports;
  const triggers: SportsTrigger[] = [];
  let earned = 0;

  if (housekeeping(state, path, content, rng) === 'ended') {
    state.flags.sports_career_ended_by_injury = true;
    retireSports(state, null, 'injury', content, rng);
    return { earned: 0, triggers: ['ended'] };
  }

  const level = levelOfRung(path.sport, pstate.rung);
  const age = state.character.age;
  // Batch 5: a club or travel team alongside a school team is for the young; a school team is also a team in your teams and clubs (one record).
  if (s.club && age >= content.balance.relationships.adultAge) s.club = null;
  if (s.team?.level === 'school' && age < content.balance.relationships.adultAge) {
    const act = sportActivity(content, path.id);
    if (act && !state.teen.activities.some((a) => a.id === act.id)) seatOnSchoolTeam(state, act, s.team.tier === 'jv' ? 'jv' : 'varsity');
  }
  if (level !== 'pro') {
    const out = path.sport.ageOut[Math.min(path.sport.ageOut.length, pstate.rung) - 1];
    if (out !== undefined && age > out) {
      s.agedOut = year;
      retireSports(state, null, 'aged', content, rng);
      return { earned: 0, triggers: ['agedOut'] };
    }
    // Batch 5: a scholarship you hold is a place on that program's team (recruited, no tryout) once you are going there.
    if (s.scholarship && scholarshipStarting(state) && (!s.team || s.team.tier !== s.scholarship.tier)) {
      const want = levelRung('college');
      if (pstate.rung < want) {
        pstate.rung = want;
        pstate.peak = Math.max(pstate.peak, want);
        pstate.fame = Math.max(pstate.fame, rungDef(path, want).fame + content.balance.sports.tryout.fameFloor);
      }
      s.team = tierTeam(state, path.sport, s.scholarship.tier, content, path.id);
      s.teamless = false;
      leaveSchoolTeam(state, path.id, content);
    }
    const here = levelOfRung(path.sport, pstate.rung);
    // Batch 6: an academy player who moves up a level keeps the academy alongside the school team.
    if (s.academy && s.team?.tier === 'academy' && here !== 'youth' && s.team.level === 'youth') s.club = s.team;
    // The engine tries out for you when you reach a level with no team (not when you left your team yourself).
    if ((!s.team || s.team.level !== here) && !s.teamless && !autoTeam(state, path, here as Exclude<typeof here, 'pro'>, content, rng)) {
      s.team = null;
      s.teamless = true;
    }
    if (s.teamless) {
      // No team, no season. You can still train and try out.
      s.form = 0;
      return { earned, triggers };
    }
    if (!s.pro && s.passed > 0 && campOpen(state, path, content)) triggers.push('camp');
  } else {
    const moves = proMoves(state, path, content, rng, triggers);
    if (moves.earned === -1) {
      retireSports(state, null, 'stalled', content, rng);
      return { earned: 0, triggers: ['stalled'] };
    }
    earned += moves.earned;
    if (!moves.playing) return { earned, triggers };
  }

  // Suspended: no season, and the money is held back.
  if (s.suspended === year) {
    s.form = 0;
    triggers.push('suspended');
    return { earned, triggers };
  }

  const team = s.team!;
  const position = positionOf(path.sport, s.position) ?? bestPosition(state, path.sport);
  s.position = position.id;

  // Batch 5: a new team means a new number and no captain's band; a club or travel team alongside a school team costs and teaches.
  if (seasonsWithTeam(state, team.name) === 0) {
    s.captain = false;
    s.number = null;
  }
  s.role = roleFor(state, path, team, content);
  if (s.club) {
    const tier = s.club.tier;
    const fee = tier ? scaledAmount(state, content.balance.sports.tryout.tiers[tier].fee, content) : 0;
    if (fee > 0) spend(state, fee, content);
    if (pstate.craft < 100) pstate.craft = Math.min(100, pstate.craft + b.training.club.craft);
  }

  // Injury: one you carry, and a new one.
  const hurt = rollInjury(state, path, level, content, rng);
  // A very bad injury can end a career on the spot.
  if (hurt && hurt.severity >= b.injury.catastrophic.from && chance(rng, Math.min(1, b.injury.catastrophic.chance * path.sport.hazard))) {
    state.flags.sports_career_ended_by_injury = true;
    retireSports(state, null, 'injury', content, rng);
    return { earned, triggers: ['ended'] };
  }
  if (hurt) triggers.push('injury');
  const worst = injuryNow(state, path.sport);
  const severity = worst?.severity ?? 0;
  const missed = Math.min(0.9, missedShare(state, path.sport, content) * (hurt ? 0.6 : 1));
  const played = (1 - missed) * b.role.played[s.role];
  s.pain = false;

  const rating = ratingFor(state, path, team, severity, content, rng);
  const row = standing(state, path, level, team, rating, played, content, rng);
  const games = row.wins + row.draws + row.losses;
  const winShare = (row.wins + row.draws / 2) / Math.max(1, games);

  const r = content.balance.fame.reception;
  const rec = content.balance.sports.league.reception;
  const critics = clampInt(Math.round(rating + rec.critics * (winShare - 0.5) * 100 + rollNormal(rng, { mean: 0, sd: r.noise })), 0, 100);
  const fans = clampInt(
    Math.round(rating + rec.fans * (winShare - 0.5) * 100 + (f.mood - 50) * r.mood + (f.image - 50) * r.image + rollNormal(rng, { mean: 0, sd: r.noise })),
    0,
    100,
  );
  const roll: Roll = { quality: rating, critics, fans, band: bandFor(critics, fans, path.criticWeight, content) };

  // Skill incentives (a rookie deal's): paid by how well you played.
  const inc = b.contract.incentive;
  const incentive = level === 'pro' && s.contract?.incentive ? Math.round(s.contract.incentive * Math.max(0, Math.min(1, (rating - inc.from) / Math.max(1, inc.full - inc.from)))) : 0;
  const salary = level === 'pro' && s.contract ? s.contract.salary + incentive : 0;
  earned += salary;
  s.totals.earned += salary;
  s.totals.seasons += 1;
  if (level === 'pro') s.totals.proSeasons += 1;
  s.totals.bestRating = Math.max(s.totals.bestRating, rating);

  const allStar = level === 'pro' && rating >= b.league.allStar && played >= 0.5;
  if (allStar) {
    s.totals.allStars += 1;
    if (s.totals.allStars === 1) sportsHistory(state, 'allStar', content);
  }
  const season: SportsSeason = {
    year,
    sport: path.id,
    level,
    team: team.name,
    position: position.id,
    rating,
    played: Math.round(played * 100),
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    rank: row.rank,
    of: row.of,
    result: row.qualified ? 'out' : 'missed',
    stats: statsFor(path, position.id, rating, rng),
    salary,
    allStar,
    ...(worst ? { injury: worst.conditionId } : {}),
    ...(team.division !== undefined ? { division: team.division } : {}),
    ...(s.loan ? { loan: true } : {}),
  };
  s.seasons.push(season);
  if (s.seasons.length > 12) s.seasons.splice(0, s.seasons.length - 12);
  if (row.qualified) {
    s.totals.playoffs += 1;
    s.run = { year, won: 0, alive: true, strength: Math.round(row.own), rival: Math.round(row.rival) };
    triggers.push('playoffs');
  }

  const kind = path.kinds[0]!;
  const plan: FamePlan = { path: path.id, kind: kind.id, style: 'commercial', risk: 'safe', press: false };
  const title = pick(rng, content.text.sports.seasons).replace('{year}', String(year)).replace('{team}', team.name);
  const project = landProject(state, content, rng, { plan, def: path, path: pstate, kind, roll, title, earned: salary, assigned: false });

  // What the season says about the year ahead.
  const prev = s.seasons.at(-2);
  if (prev && prev.level === level && rating - prev.rating >= 12) triggers.push('breakout');
  else if (prev && prev.level === level && prev.rating - rating >= 12) triggers.push('slump');
  s.form = 0;
  const focusFitness = b.performance.focus[s.focus].fitness;
  if (focusFitness !== 0) state.character.stats.fitness = clampInt(state.character.stats.fitness + wholeChange(rng, focusFitness), 0, 100);

  // Batch 6: an academy graduate old enough is offered a first-team deal by the club, or let go.
  if (s.academy && !s.pro && s.draft === null && age >= path.sport.draft.age) {
    const d = b.draft;
    const score = draftScoreBase(state, pstate.fame, content) + rollNormal(rng, { mean: 0, sd: d.score.noise });
    const out = academyIntake(state, path, score, content, draftSlot(state, path.id, score, state.character.cityId, content));
    if (out !== null) triggers.unshift(out);
  }

  // The draft, for a college prospect old enough. Batch 5: scouts see your rating, fame, the combine and the league's need for your position.
  if (level === 'college' && !s.pro && age >= path.sport.draft.age && s.draft === null) {
    const d = b.draft;
    const score = draftScoreBase(state, pstate.fame, content) + rollNormal(rng, { mean: 0, sd: d.score.noise });
    if (score >= d.declare || age >= path.sport.draft.force) {
      const slot = draftSlot(state, path.id, score, state.character.cityId, content);
      if (slot.pick > 0) {
        s.draft = { year, pick: slot.pick, round: slot.round, teamId: pickTeamId(state, path.id, slot.pick, state.character.cityId, content) };
        triggers.unshift('draft');
      } else {
        s.draft = { year, pick: 0, round: 0, teamId: undraftedOffer(state, path, recentRating(state), state.character.cityId, content, rng) };
        s.passed = year;
        triggers.unshift('undrafted');
      }
      s.combine = 0;
    }
  }
  if (level === 'college' && !s.pro && s.draft === null && age >= path.sport.draft.age - 1 && chance(rng, b.events.combine)) triggers.push('combine');

  // Batch 5: scholarships (offers, the grade floor, eligibility).
  scholarshipStep(state, path, content, rng, triggers);

  // The choices a season brings: where you stand, a number, the captain's band, the summer.
  if (s.team) {
    const withTeam = seasonsWithTeam(state, team.name);
    if (s.number === null) triggers.push('number');
    if (!s.captain && withTeam > b.role.captain.after && s.role === 'starter' && rating >= team.quality && chance(rng, b.events.captain)) triggers.push('captain');
    if (s.captain) state.fame.mood = clampInt(state.fame.mood + b.role.captain.mood, 0, 100);
    if (s.seasons.length >= 2 && chance(rng, s.role === 'starter' ? b.events.role.starter : b.events.role.other)) triggers.push('role');
    if (chance(rng, b.events.offseason)) triggers.push('offseason');
  }

  // Slowing down, and the thought of stopping.
  if (level === 'pro') {
    const need = rungDef(path, Math.max(pstate.rung, path.sport.proRung)).quality;
    const quit = curveAt(b.retire.quit, age) * (rating < need ? 2 : 1);
    if (age >= 30 && chance(rng, 0.25) && !triggers.includes('released')) triggers.push('declining');
    if (chance(rng, Math.min(0.9, quit))) triggers.push('retirement');
    if (s.totals.proSeasons === 1) triggers.push('rookie');
  }

  // Batch 6: the leagues are settled (soccer), the trip to a team far from home, a derby, the national side.
  if (level === 'pro' && hasDivisions(path.sport) && s.team?.id) {
    const moved = settleLeagues(state, path.id, content, { teamId: s.team.id, strength: row.own });
    if (moved) {
      const t = teamById(state, path.id, s.team.id, content);
      if (t) s.team = { ...s.team, division: divisionOf(state, t) };
      s.moved = { year, dir: moved };
      if (moved === 'up') s.totals.goneUp += 1;
      else s.totals.goneDown += 1;
      state.fame.mood = clampInt(state.fame.mood + (moved === 'up' ? content.balance.sports.soccer.tiers.promotedMood : content.balance.sports.soccer.tiers.relegatedMood), 0, 100);
      sportsHistory(state, moved === 'up' ? 'goingUp' : 'goingDown', content);
      triggers.push(moved === 'up' ? 'goingUp' : 'goingDown');
    }
  }
  if (level === 'pro') {
    commuteStrain(state, content);
    worldTriggers(state, path, rating, content, rng, triggers);
  }

  // Colour: a big game, the locker room, a rival, a deal.
  if (level !== 'youth' || age >= 10) {
    if (chance(rng, 0.3)) triggers.push('bigGame');
    if (chance(rng, 0.22)) triggers.push('locker');
    if (chance(rng, 0.1)) triggers.push('rivalry');
  }
  if (level === 'pro' && !f.contract && pstate.fame >= 30 && chance(rng, 0.15)) triggers.push('endorsement');
  return { project, earned, triggers };
}

/** Priority of the sports events a year can ask for, most pressing first. */
const ORDER: SportsTrigger[] = ['ended', 'draft', 'academy', 'academyReleased', 'undrafted', 'agedOut', 'stalled', 'playoffs', 'recruited', 'scholarshipLost', 'probation', 'camp', 'combine', 'injury', 'suspended', 'released', 'traded', 'loan', 'window', 'abroad', 'goingUp', 'goingDown', 'freeAgency', 'signed', 'tournament', 'callUp', 'contractYear', 'retirement', 'rookie', 'breakout', 'slump', 'declining', 'endorsement', 'captain', 'role', 'number', 'offseason', 'derby', 'commute', 'bigGame', 'locker', 'rivalry'];
/** The ones that must always come (the player has to decide, or the run needs its first series). */
const MUST = new Set<SportsTrigger>(['ended', 'draft', 'academy', 'academyReleased', 'undrafted', 'agedOut', 'stalled', 'playoffs', 'recruited', 'scholarshipLost']);

/** Queues the season's events, most pressing first, up to the cap (the ones that need a decision always come). */
export function queueSeasonEvents(state: LifeState, content: ContentBundle, triggers: SportsTrigger[], _break: boolean): void {
  let room = content.balance.sports.events.maxQueued;
  const seen = new Set<SportsTrigger>();
  for (const trigger of ORDER.filter((t) => triggers.includes(t))) {
    if (seen.has(trigger)) continue;
    seen.add(trigger);
    if (room <= 0 && !MUST.has(trigger)) continue;
    if (queueSportsEvent(state, trigger, content) && !MUST.has(trigger)) room -= 1;
  }
}

/** A retired athlete's years go on: the Hall of Fame ballot comes round once. */
export function runSportsRetired(state: LifeState, content: ContentBundle): void {
  const s = state.sports;
  const r = s.retired;
  if (!r || state.fame.active) return;
  const b = content.balance.sports.retire;
  const def = sportPath(content, s.sport);
  if (!def) return;
  const peak = state.fame.paths[def.id]?.peak ?? 0;
  if (state.currentYear === r.year + b.hallYears && (peak >= b.hallRung || (s.totals.titles >= 2 && s.totals.allStars >= 5))) queueSportsEvent(state, 'hall', content);
}

