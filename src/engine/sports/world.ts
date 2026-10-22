/**
 * The wider world around a season (Batch 6): taking up a change of teams the player made while a life was in progress, the trip to a
 * team that plays far from home, derbies with a club's rival, the national side and its tournament. Numbers: balance/sports.yaml
 * (world, international, events).
 */
import type { ContentBundle, FamePathDef, SportDef, SportsTrigger } from '../../content/schemas';
import { curveAt } from '../curve';
import { clampInt } from '../random';
import { chance, type RngState } from '../rng';
import type { Id, LifeState } from '../types';
import { sportsHistory } from './text';
import { rivalOf, teamById, type ProTeam } from './league';
import { proTeam, relocateForTeam } from './team';
import { addedTeamSchema, type AddedTeam } from './setup';

type SportPath = FamePathDef & { sport: SportDef };

/** Takes up the change of teams the player asked for (a recorded input), from the season it names: moved teams play in their new cities, teams the player removed are gone. */
export function applyPending(state: LifeState, content: ContentBundle): void {
  const L = state.league;
  const p = L.pending;
  if (!p || state.currentYear < p.applyYear) return;
  L.pending = null;
  const before = state.sports.team?.id ?? null;
  const contractTeam = state.sports.contract?.teamId ?? null;
  // Renames already in the life stay; the moves and the added teams are replaced by what was asked for.
  L.setup = { ...L.setup, moved: { ...p.moved }, added: p.added.map((a: AddedTeam) => addedTeamSchema.parse(a)) };
  const s = state.sports;
  const sportId = s.sport;
  if (sportId === null) return;
  // A team that is gone (one the player added and removed): the deal ends with it.
  if (contractTeam !== null && teamById(state, sportId, contractTeam, content) === undefined) {
    s.contract = null;
    s.team = null;
    s.unsigned = 0;
    s.loan = null;
    s.loanOffer = null;
    s.transfer = null;
    s.released = state.currentYear;
    s.totals.releases += 1;
    sportsHistory(state, 'released', content);
    return;
  }
  // Your team moved to another city: the team takes you there.
  const now = before === null ? undefined : teamById(state, sportId, before, content);
  if (now && s.team && s.team.level === 'pro' && now.city !== s.team.city) {
    s.team = proTeam(state, now, sportId, content);
    relocateForTeam(state, now.city, content, s.contract?.until ?? state.currentYear);
  }
}

/** The yearly strain of a commute to a team far from where you live (a city the game does not model, or another country). */
export function commuteStrain(state: LifeState, content: ContentBundle): void {
  const team = state.sports.team;
  if (!team || team.level !== 'pro' || team.away === undefined) return;
  const c = content.balance.sports.world.commute[team.away];
  const stats = state.character.stats;
  stats.stress = clampInt(stats.stress + c.stress, 0, 100);
  stats.happiness = clampInt(stats.happiness + c.happiness, 0, 100);
}

/** The triggers a season's world asks for: the trip to the club's home, a derby, a move to another country, the national side. */
export function worldTriggers(state: LifeState, path: SportPath, rating: number, content: ContentBundle, rng: RngState, triggers: SportsTrigger[]): void {
  const s = state.sports;
  const b = content.balance.sports;
  const year = state.currentYear;
  const team = s.team;
  if (!team || team.level !== 'pro') return;
  if (s.abroadYear === year) triggers.push('abroad');
  if (team.away !== undefined && chance(rng, b.events.commute)) triggers.push('commute');
  const proTeamNow = team.id !== null ? teamById(state, path.id, team.id, content) : undefined;
  if (proTeamNow && rivalOf(state, path.id, proTeamNow, content) && chance(rng, b.events.derby)) triggers.push('derby');
  nationalStep(state, path, rating, content, rng, triggers);
}

/** The national side: a call-up by rating (and the years of fame it takes), and the tournament in its years for a player called up this year or last. */
export function nationalStep(state: LifeState, path: SportPath, rating: number, content: ContentBundle, rng: RngState, triggers: SportsTrigger[]): void {
  const I = content.balance.sports.international;
  const s = state.sports;
  const year = state.currentYear;
  const pstate = state.fame.paths[path.id];
  if (!pstate || state.character.age < I.minAge || pstate.fame < I.fameMin) return;
  const again = s.calledUp === year - 1 ? 1.5 : 1;
  if (chance(rng, Math.min(0.95, curveAt(I.callUp, rating) * again))) {
    s.calledUp = year;
    triggers.push('callUp');
  }
  if (year % path.sport.international.cycle === 0 && s.calledUp >= year - 1 && s.totals.caps >= 1 && s.calledUp > 0) triggers.push('tournament');
}

/** True in a year of the international tournament for someone called up this year or last. */
export function tournamentYear(state: LifeState, path: SportPath): boolean {
  return state.currentYear % path.sport.international.cycle === 0 && state.sports.calledUp >= state.currentYear - 1 && state.sports.totals.caps >= 1 && state.sports.calledUp > 0;
}

/** A team's rival, for the text. */
export function rivalFor(state: LifeState, sportId: Id, content: ContentBundle): ProTeam | undefined {
  const t = state.sports.team?.id ? teamById(state, sportId, state.sports.team.id, content) : undefined;
  return t ? rivalOf(state, sportId, t, content) : undefined;
}

