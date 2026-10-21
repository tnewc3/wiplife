/**
 * Teams (E6c): the teams you play for and where they are. A youth team is
 * your city's club, a school team is a school of your city with a nickname,
 * a college team is one of your city's colleges, and a pro team is one of the
 * league's fictional teams in one of the game's cities. A pro player lives
 * where the team plays: joining a team in another city moves you there (the
 * team helps; nothing is charged), and a partner living with you comes along.
 * Numbers: balance/sports.yaml.
 */
import type { ContentBundle, SportDef, SportLevel, SportProTeamDef, TeamTier } from '../../content/schemas';
import { afterMove } from '../career';
import { moveTo, sellHome } from '../housing';
import { createRng, nextInt, pick, type RngState } from '../rng';
import type { Id, LifeState, SportsTeam } from '../types';
import { sameCountry } from '../country';

/**
 * A pick that does not touch the life's generator: the same life and key always give the same item, so a team keeps its
 * nickname however often the list of teams is read.
 */
export function stablePick<T>(state: LifeState, key: string, items: readonly T[]): T {
  return items[nextInt(createRng(`${state.seed}:${key}`), 0, items.length - 1)]!;
}

/** A pro team by id. */
export function proTeamDef(def: SportDef, id: Id | null | undefined): SportProTeamDef | undefined {
  return def.leagues.pro.teams.find((t) => t.id === id);
}

/**
 * The pro teams a player living in `home` can play for: those in cities of the same country (a team abroad would be
 * emigration, W6, and a team in a city nobody can reach would strand a player).
 */
export function proTeamsIn(def: SportDef, home: Id, content: ContentBundle): SportProTeamDef[] {
  return def.leagues.pro.teams.filter((t) => content.cities[t.city] !== undefined && sameCountry(home, t.city, content));
}

export function proTeam(t: SportProTeamDef): SportsTeam {
  return { id: t.id, name: t.name, city: t.city, level: 'pro', quality: t.quality };
}

/** Which college tier takes you, from how good you look: an elite college for a standout, a community college for the rest. */
export function collegeTier(rating: number): 'community' | 'state' | 'elite' {
  return rating >= 62 ? 'elite' : rating >= 48 ? 'state' : 'community';
}

/**
 * The amateur team of this kind in your city (Batch 5): a youth team is the city plus a nickname, a school team is a school of
 * the city plus one, a college team is one of the city's colleges plus one. The nickname is stable for a life, and each kind of
 * team has its own, so the junior varsity is not the varsity.
 */
export function tierTeam(state: LifeState, def: SportDef, tier: TeamTier, content: ContentBundle): SportsTeam {
  const t = content.balance.sports.tryout.tiers[tier];
  const quality = Math.max(0, Math.min(100, content.balance.sports.league.quality[t.base] + t.shift));
  const city = content.cities[state.character.cityId];
  const cityName = city?.name ?? 'Your city';
  const nick = stablePick(state, `team:${def.leagues[t.level] ? t.level : 'youth'}:${tier}:${state.character.cityId}`, def.leagues[t.level].nicknames);
  const suffix = content.text.sports.tiers[tier].suffix;
  const place = t.level === 'youth' ? cityName : t.level === 'school' ? (city?.schools.high ?? cityName) : (city?.schools[t.base as 'community' | 'state' | 'elite'] ?? cityName);
  return { id: null, name: [place, nick, suffix].filter((x) => x !== '').join(' '), city: state.character.cityId, level: t.level, quality, tier };
}

/** The usual team of a level below the pros (a club team, the varsity, or a college program by how good you look). */
export function amateurTeam(state: LifeState, def: SportDef, level: Exclude<SportLevel, 'pro'>, rating: number, content: ContentBundle, _rng?: RngState): SportsTeam {
  return tierTeam(state, def, level === 'youth' ? 'club' : level === 'school' ? 'varsity' : collegeTier(rating), content);
}

/** The pro team that picks at this place in a draft: the weakest side picks first, round after round. */
export function draftingTeam(def: SportDef, pickNumber: number, home: Id, content: ContentBundle): SportProTeamDef {
  const teams = [...proTeamsIn(def, home, content)].sort((a, b) => a.quality - b.quality || (a.id < b.id ? -1 : 1));
  return teams[(pickNumber - 1) % teams.length]!;
}

/**
 * The team that can take you: a draft or an offer is settled while you may have been living elsewhere (a temporary stay
 * abroad), and a team in another country than the one you live in would move you there with no right to stay. Then the
 * weakest side of your own country takes you instead.
 */
export function teamAtHome(def: SportDef, team: SportProTeamDef | undefined, home: Id, content: ContentBundle): SportProTeamDef | undefined {
  if (!team || sameCountry(home, team.city, content)) return team;
  return draftingTeam(def, 1, home, content);
}

/** A pro team other than `not`, picked at random (weighted toward stronger teams for a better player). */
export function anotherTeam(def: SportDef, not: Id | null, home: Id, content: ContentBundle, rng: RngState): SportProTeamDef {
  const options = proTeamsIn(def, home, content).filter((t) => t.id !== not);
  return pick(rng, options.length > 0 ? options : proTeamsIn(def, home, content));
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
