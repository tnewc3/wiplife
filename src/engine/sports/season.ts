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
import type { ContentBundle, FamePathDef, SportDef, SportsTrigger } from '../../content/schemas';
import { curveAt } from '../curve';
import { landProject } from '../fame/step';
import { hasTalentFor, rungDef } from '../fame/query';
import { agentTier, aptitude, bandFor, type Roll } from '../fame/work';
import { clampInt, rollNormal, wholeChange } from '../random';
import { chance, pick, type RngState } from '../rng';
import type { FamePlan, FameProject, LifeState, SportsSeason } from '../types';
import { draftSlot, extend, moveToTeam, pickTeamId, releasePlayer, tradePlayer, undraftedOffer } from './contract';
import { agePain, missedShare, rollInjury } from './injury';
import { settleRun } from './playoffs';
import { queueSportsEvent } from './queue';
import { bestPosition, fitFor, injuryNow, levelOfRung, positionOf, recentRating, sportPath } from './query';
import { retireSports } from './retire';
import { amateurTeam, anotherTeam, proTeamsIn } from './team';
import { sportsHistory } from './text';

type SportPath = FamePathDef & { sport: SportDef };

export interface SeasonOut {
  /** The season as a piece of work, when one was played. */
  project?: FameProject;
  /** Pay the season (and any buyout) brought, before anyone's cut. */
  earned: number;
  triggers: SportsTrigger[];
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

/** A season's rating (0–100) and the pieces it was made of. */
export function ratingFor(state: LifeState, path: SportPath, team: { quality: number }, severity: number, content: ContentBundle, rng: RngState): number {
  const q = content.balance.fame.quality;
  const p = content.balance.sports.performance;
  const s = state.sports;
  const pstate = state.fame.paths[path.id]!;
  const position = positionOf(path.sport, s.position) ?? bestPosition(state, path.sport);
  const talent = hasTalentFor(state, path) ? q.talent + (state.character.hidden.talentDiscovered ? q.talentFound : 0) : 0;
  const film = s.focus === 'film' ? p.film * (state.character.stats.smarts - 50) : 0;
  const base =
    q.base +
    q.aptitude * aptitude(state, path) +
    talent +
    pstate.craft * q.craft +
    q.team.agent * agentTier(state, content) +
    (state.character.hidden.luck - 50) * q.luck +
    p.fitness * (state.character.stats.fitness - 50) +
    p.fit * 2 * (fitFor(state, position) - 0.5) +
    p.team * (team.quality - 50) +
    p.form * s.form +
    p.focus[s.focus].rating +
    film +
    curveAt(path.sport.ageCurve, state.character.age) -
    p.injury * severity;
  return clampInt(Math.round(base + rollNormal(rng, { mean: 0, sd: q.noise })), 0, 100);
}

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

/** The team's year: its strength (quality, luck and what you add) against the rest of the league's. */
function standing(state: LifeState, path: SportPath, level: 'youth' | 'school' | 'college' | 'pro', team: { quality: number; id: string | null }, rating: number, played: number, content: ContentBundle, rng: RngState): Standing {
  const L = content.balance.sports.league;
  const position = positionOf(path.sport, state.sports.position);
  const impact = position?.impact ?? 1;
  const own = team.quality + rollNormal(rng, { mean: 0, sd: L.strengthSd }) + (rating - 50) * L.playerShare * impact * played;
  const others: number[] =
    level === 'pro'
      ? proTeamsIn(path.sport, content)
          .filter((t) => t.id !== team.id)
          .map((t) => t.quality + rollNormal(rng, { mean: 0, sd: L.strengthSd }))
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
  const qualified = level === 'pro' ? rank <= path.sport.season.playoffTeams : rank <= Math.ceil(of * L.amateurPlayoffs);
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

  if (!s.contract || !s.team) {
    // A free agent: a team signs you, or the year passes. Shut out too long, the game is over for you.
    if (s.unsigned >= b.contract.unsigned) return { playing: false, earned: -1 };
    if (chance(rng, curveAt(b.contract.freeAgent, rating))) {
      const team = anotherTeam(path.sport, null, content, rng);
      moveToTeam(state, team.id, true, content, rng);
      triggers.push('signed');
      return { playing: true, earned };
    }
    s.unsigned += 1;
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
      const team = chance(rng, curveAt(b.contract.freeAgent, rating)) ? anotherTeam(path.sport, c.teamId, content, rng) : null;
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
  if (s.seasons.length > 0 && deal.since < year && gap > 0 && chance(rng, Math.min(b.release.max, gap * b.release.perPoint))) {
    earned += releasePlayer(state, content);
    triggers.push('released');
    return { playing: false, earned };
  }

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
  if (s.contract && s.contract.until === year && !s.playOut) triggers.push('contractYear');
  s.ask = null;
  return { playing: true, earned };
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
  if (level !== 'pro') {
    const out = path.sport.ageOut[Math.min(path.sport.ageOut.length, pstate.rung) - 1];
    if (out !== undefined && age > out) {
      s.agedOut = year;
      retireSports(state, null, 'aged', content, rng);
      return { earned: 0, triggers: ['agedOut'] };
    }
    if (!s.team || s.team.level !== level) s.team = amateurTeam(state, path.sport, level, recentRating(state), content, rng);
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
  const played = 1 - missed;
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

  const salary = level === 'pro' && s.contract ? s.contract.salary : 0;
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
  };
  s.seasons.push(season);
  if (s.seasons.length > 12) s.seasons.splice(0, s.seasons.length - 12);
  if (row.qualified) {
    s.totals.playoffs += 1;
    s.run = { year, won: 0, alive: true, strength: Math.round(row.own), rival: Math.round(row.rival) };
    triggers.push('playoffs');
  }

  const kind = path.kinds[0]!;
  const plan: FamePlan = { path: path.id, kind: kind.id, style: 'commercial', risk: 'safe', tour: false, press: false };
  const title = pick(rng, content.text.sports.seasons).replace('{year}', String(year)).replace('{team}', team.name);
  const project = landProject(state, content, rng, { plan, def: path, path: pstate, kind, roll, title, earned: salary, assigned: false });

  // What the season says about the year ahead.
  const prev = s.seasons.at(-2);
  if (prev && prev.level === level && rating - prev.rating >= 12) triggers.push('breakout');
  else if (prev && prev.level === level && prev.rating - rating >= 12) triggers.push('slump');
  s.form = 0;
  const focusFitness = b.performance.focus[s.focus].fitness;
  if (focusFitness !== 0) state.character.stats.fitness = clampInt(state.character.stats.fitness + wholeChange(rng, focusFitness), 0, 100);

  // The draft, for a college prospect old enough.
  if (level === 'college' && !s.pro && age >= path.sport.draft.age && s.draft === null) {
    const d = b.draft;
    const score = recentRating(state) * d.score.quality + pstate.fame * d.score.fame + rollNormal(rng, { mean: 0, sd: d.score.noise });
    if (score >= d.declare || age >= path.sport.draft.force) {
      const slot = draftSlot(score, path.sport, content);
      if (slot.pick > 0) {
        s.draft = { year, pick: slot.pick, round: slot.round, teamId: pickTeamId(path.sport, slot.pick, content) };
        triggers.unshift('draft');
      } else {
        s.draft = { year, pick: 0, round: 0, teamId: undraftedOffer(path, recentRating(state), content, rng) };
        triggers.unshift('undrafted');
      }
    }
  }

  // Slowing down, and the thought of stopping.
  if (level === 'pro') {
    const need = rungDef(path, Math.max(pstate.rung, path.sport.proRung)).quality;
    const quit = curveAt(b.retire.quit, age) * (rating < need ? 2 : 1);
    if (age >= 30 && chance(rng, 0.25) && !triggers.includes('released')) triggers.push('declining');
    if (chance(rng, Math.min(0.9, quit))) triggers.push('retirement');
    if (s.totals.proSeasons === 1) triggers.push('rookie');
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
const ORDER: SportsTrigger[] = ['ended', 'draft', 'undrafted', 'agedOut', 'stalled', 'playoffs', 'injury', 'suspended', 'released', 'traded', 'freeAgency', 'signed', 'contractYear', 'retirement', 'rookie', 'breakout', 'slump', 'declining', 'endorsement', 'bigGame', 'locker', 'rivalry'];
/** The ones that must always come (the player has to decide, or the run needs its first series). */
const MUST = new Set<SportsTrigger>(['ended', 'draft', 'undrafted', 'agedOut', 'stalled', 'playoffs']);

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

