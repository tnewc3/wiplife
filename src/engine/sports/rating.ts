/**
 * A player's rating (E6c, 0–100) and what scouts and coaches would say of you today (Batch 5).
 *
 * The rating is the E6b quality roll's base: traits and stats, a hidden talent that fits, craft, the agent, luck, Fitness,
 * how well you fit your position, the team's quality, form, the training focus, film study, the skills you have trained
 * (Batch 5), a captain's lift, an age curve, less an injury you play with, and noise. A tryout, a recruiter and the
 * draft look at the same thing without the noise: `prospectRating`. Numbers: balance/sports.yaml, balance/fame.yaml.
 */
import type { ContentBundle, FamePathDef, SportDef } from '../../content/schemas';
import { curveAt } from '../curve';
import { skillLevel, skillsOf } from '../fame/grind';
import { hasTalentFor } from '../fame/query';
import { agentTier, aptitude } from '../fame/work';
import { clampInt, rollNormal } from '../random';
import type { RngState } from '../rng';
import type { FamePathState, LifeState } from '../types';
import { bestPosition, fitFor, injuryNow, positionOf } from './query';

export type SportPath = FamePathDef & { sport: SportDef };

/** The mean of the skills a sport registers for you (where skills start when none is registered or touched). */
export function skillMean(path: FamePathState | undefined, def: SportPath, content: ContentBundle): number {
  const skills = skillsOf(def);
  if (skills.length === 0) return content.balance.fame.practice.start;
  return skills.reduce((sum, s) => sum + skillLevel(path, s.id, content), 0) / skills.length;
}

/** Everything in a rating but the day's noise: for a season, with the team you play for and the severity of any injury you play with. */
export function ratingBase(state: LifeState, def: SportPath, craft: number, pstate: FamePathState | undefined, teamQuality: number, severity: number, content: ContentBundle): number {
  const q = content.balance.fame.quality;
  const p = content.balance.sports.performance;
  const T = content.balance.sports.training;
  const s = state.sports;
  const position = positionOf(def.sport, s.position) ?? bestPosition(state, def.sport);
  const talent = hasTalentFor(state, def) ? q.talent + (state.character.hidden.talentDiscovered ? q.talentFound : 0) : 0;
  const film = s.focus === 'film' ? p.film * (state.character.stats.smarts - 50) : 0;
  const captain = s.captain ? content.balance.sports.role.captain.rating : 0;
  return (
    q.base +
    q.aptitude * aptitude(state, def) +
    talent +
    craft * q.craft +
    q.team.agent * agentTier(state, content) +
    (state.character.hidden.luck - 50) * q.luck +
    p.fitness * (state.character.stats.fitness - 50) +
    p.fit * 2 * (fitFor(state, position) - 0.5) +
    p.team * (teamQuality - 50) +
    p.form * s.form +
    p.focus[s.focus].rating +
    film +
    T.rating * (skillMean(pstate, def, content) - content.balance.fame.practice.start) +
    captain +
    curveAt(def.sport.ageCurve, state.character.age) -
    p.injury * severity
  );
}

/** A season's rating (0–100). */
export function ratingFor(state: LifeState, def: SportPath, team: { quality: number }, severity: number, content: ContentBundle, rng: RngState): number {
  const pstate = state.fame.paths[def.id];
  const base = ratingBase(state, def, pstate?.craft ?? 0, pstate, team.quality, severity, content);
  return clampInt(Math.round(base + rollNormal(rng, { mean: 0, sd: content.balance.fame.quality.noise })), 0, 100);
}

/**
 * What a coach or a scout would rate you today (no noise): the same pieces as a season on an average team (quality 50),
 * with any injury you carry. Someone with no career yet has the craft of a way in's head start.
 */
export function prospectRating(state: LifeState, def: SportPath, content: ContentBundle): number {
  const pstate = state.fame.paths[def.id];
  const injured = injuryNow(state, def.sport);
  const craft = pstate?.craft ?? content.balance.fame.entry.craft;
  return Math.max(0, Math.min(100, ratingBase(state, def, craft, pstate, 50, injured?.severity ?? 0, content)));
}
