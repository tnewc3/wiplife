/**
 * Teams (E6c): the teams you play for and where they are. A youth team is
 * your city's club, a school team is a school of your city with a nickname,
 * a college team is one of your city's colleges, and a pro team is one of the
 * league's fictional teams in one of the game's cities. A pro player lives
 * where the team plays: joining a team in another city moves you there (the
 * team helps; nothing is charged), and a partner living with you comes along.
 * Numbers: balance/sports.yaml.
 */
import type { ContentBundle, SportDef, SportLevel, SportProTeamDef } from '../../content/schemas';
import { afterMove } from '../career';
import { moveTo, sellHome } from '../housing';
import { pick, type RngState } from '../rng';
import type { Id, LifeState, SportsTeam } from '../types';

/** A pro team by id. */
export function proTeamDef(def: SportDef, id: Id | null | undefined): SportProTeamDef | undefined {
  return def.leagues.pro.teams.find((t) => t.id === id);
}

/** The pro teams in a city that the game has (a team in a city nobody can reach would strand a player). */
export function proTeamsIn(def: SportDef, content: ContentBundle): SportProTeamDef[] {
  return def.leagues.pro.teams.filter((t) => content.cities[t.city] !== undefined);
}

export function proTeam(t: SportProTeamDef): SportsTeam {
  return { id: t.id, name: t.name, city: t.city, level: 'pro', quality: t.quality };
}

/** Which college tier takes you, from how good you look: an elite college for a standout, a community college for the rest. */
export function collegeTier(rating: number): 'community' | 'state' | 'elite' {
  return rating >= 62 ? 'elite' : rating >= 48 ? 'state' : 'community';
}

/** A team in your city at a level below pro, named from the city's schools or the city itself. */
export function amateurTeam(state: LifeState, def: SportDef, level: Exclude<SportLevel, 'pro'>, rating: number, content: ContentBundle, rng: RngState): SportsTeam {
  const city = content.cities[state.character.cityId];
  const q = content.balance.sports.league.quality;
  const nick = pick(rng, def.leagues[level].nicknames);
  const cityName = city?.name ?? 'Your city';
  if (level === 'youth') return { id: null, name: `${cityName} ${nick}`, city: state.character.cityId, level, quality: q.youth };
  if (level === 'school') return { id: null, name: `${city?.schools.high ?? cityName} ${nick}`, city: state.character.cityId, level, quality: q.high };
  const tier = collegeTier(rating);
  const school = city?.schools[tier] ?? cityName;
  return { id: null, name: `${school} ${nick}`, city: state.character.cityId, level, quality: q[tier] };
}

/** The pro team that picks at this place in a draft: the weakest side picks first, round after round. */
export function draftingTeam(def: SportDef, pickNumber: number, content: ContentBundle): SportProTeamDef {
  const teams = [...proTeamsIn(def, content)].sort((a, b) => a.quality - b.quality || (a.id < b.id ? -1 : 1));
  return teams[(pickNumber - 1) % teams.length]!;
}

/** A pro team other than `not`, picked at random (weighted toward stronger teams for a better player). */
export function anotherTeam(def: SportDef, not: Id | null, content: ContentBundle, rng: RngState): SportProTeamDef {
  const options = proTeamsIn(def, content).filter((t) => t.id !== not);
  return pick(rng, options.length > 0 ? options : proTeamsIn(def, content));
}

/**
 * A pro team takes you to its city: you move there (a home you own is sold, a
 * rental is left, a partner living with you comes along). The team pays for the
 * move. Nothing happens in the city you already live in.
 */
export function relocateForTeam(state: LifeState, cityId: Id, content: ContentBundle): void {
  if (state.character.cityId === cityId || state.housing.kind === 'incarcerated' || !content.cities[cityId]) return;
  const from = state.character.cityId;
  if (state.housing.kind === 'owned') sellHome(state, content);
  moveTo(state, 'renting', cityId, content);
  afterMove(state, from, content);
}
