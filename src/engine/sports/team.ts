/**
 * Teams (E6c): the teams you play for and where they are. A youth team is
 * your city's club, a school team is a school of your city with a nickname,
 * a college team is one of your city's colleges, and a pro team is one of the
 * league's fictional teams in one of the game's cities. A pro player lives
 * where the team plays: joining a team in another city moves you there (the
 * team helps; nothing is charged), and a partner living with you comes along.
 * Numbers: balance/sports.yaml.
 */
import type { ContentBundle, SportDef, SportLevel, TeamTier } from '../../content/schemas';
import { afterMove } from '../career';
import { moveTo, sellHome } from '../housing';
import { createRng, nextInt, pick, type RngState } from '../rng';
import type { Id, LifeState, SportsTeam } from '../types';
import { countryIdOfCity } from '../country';
import { weightedPick } from '../random';
import { settleForClub } from '../migration/move';
import { awayOf, divisionOf, hasDivisions, homeLeagueTeams, marketTeams, teamById, type ProTeam } from './league';
import { academyTeam, homeAcademyClub } from './soccer';
import { sportsHistory } from './text';

/**
 * A pick that does not touch the life's generator: the same life and key always give the same item, so a team keeps its
 * nickname however often the list of teams is read.
 */
export function stablePick<T>(state: LifeState, key: string, items: readonly T[]): T {
  return items[nextInt(createRng(`${state.seed}:${key}`), 0, items.length - 1)]!;
}

/** A pro team by id. */
export function proTeamDef(state: LifeState, sportId: Id, id: Id | null | undefined, content: ContentBundle): ProTeam | undefined {
  return teamById(state, sportId, id, content);
}

/**
 * The pro teams a player living in `home` can play for from the draft: those at home. Batch 6: teams in cities the game does not
 * model yet are at home too (you live in the nearest modeled city and commute to them).
 */
export function proTeamsIn(state: LifeState, sportId: Id, home: Id, content: ContentBundle): ProTeam[] {
  return homeLeagueTeams(state, sportId, home, content);
}

/** The team as the season record keeps it: where it plays, how far from home that is, and its league. */
export function proTeam(state: LifeState, t: ProTeam, sportId: Id, content: ContentBundle): SportsTeam {
  const away = awayOf(t);
  const def = content.famePaths[sportId]?.sport;
  return {
    id: t.id,
    name: t.name,
    city: t.city,
    level: 'pro',
    quality: t.quality,
    ...(t.cityName !== undefined ? { place: t.cityName } : {}),
    ...(away !== undefined ? { away } : {}),
    ...(t.country !== undefined ? { country: t.country } : {}),
    ...(def && hasDivisions(def) ? { division: divisionOf(state, t) } : {}),
  };
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
export function tierTeam(state: LifeState, def: SportDef, tier: TeamTier, content: ContentBundle, sportId?: Id): SportsTeam {
  const t = content.balance.sports.tryout.tiers[tier];
  // Batch 6: a youth academy is a pro club's: it carries the club's name (the club your city has, a stable pick for the life).
  if (tier === 'academy' && def.academy !== undefined && sportId !== undefined) {
    const club = homeAcademyClub(state, sportId, content);
    if (club) return academyTeam(state, club, sportId, Math.max(0, Math.min(100, content.balance.sports.league.quality[t.base] + t.shift)), content);
  }
  const quality = Math.max(0, Math.min(100, content.balance.sports.league.quality[t.base] + t.shift));
  const city = content.cities[state.character.cityId];
  const cityName = city?.name ?? 'Your city';
  const nick = stablePick(state, `team:${def.leagues[t.level] ? t.level : 'youth'}:${tier}:${state.character.cityId}`, def.leagues[t.level].nicknames);
  const suffix = content.text.sports.tiers[tier].suffix;
  const place = t.level === 'youth' ? cityName : t.level === 'school' ? (city?.schools.high ?? cityName) : (city?.schools[t.base as 'community' | 'state' | 'elite'] ?? cityName);
  return { id: null, name: [place, nick, suffix].filter((x) => x !== '').join(' '), city: state.character.cityId, level: t.level, quality, tier };
}

/** The usual team of a level below the pros (a club team, the varsity, or a college program by how good you look). */
export function amateurTeam(state: LifeState, def: SportDef, level: Exclude<SportLevel, 'pro'>, rating: number, content: ContentBundle, _rng?: RngState, sportId?: Id): SportsTeam {
  return tierTeam(state, def, level === 'youth' ? 'club' : level === 'school' ? 'varsity' : collegeTier(rating), content, sportId);
}

/** The pro team that picks at this place in a draft: the weakest side picks first, round after round (an intake: the strongest club). */
export function draftingTeam(state: LifeState, sportId: Id, pickNumber: number, home: Id, content: ContentBundle): ProTeam {
  const def = content.famePaths[sportId]!.sport!;
  const strongest = def.draft.order === 'strongest';
  const teams = [...proTeamsIn(state, sportId, home, content)].sort((a, b) => (strongest ? b.quality - a.quality : a.quality - b.quality) || (a.id < b.id ? -1 : 1));
  return teams[(pickNumber - 1) % teams.length]!;
}

/**
 * The team that can take you: a draft or an offer is settled while you may have been living elsewhere (a temporary stay
 * abroad), and a team in a market you are not part of would move you there with no right to stay. Then the weakest side of your
 * own country takes you instead.
 */
export function teamAtHome(state: LifeState, sportId: Id, team: ProTeam | undefined, home: Id, content: ContentBundle): ProTeam | undefined {
  if (!team) return team;
  if (marketTeams(state, sportId, home, content).some((t) => t.id === team.id)) return team;
  return draftingTeam(state, sportId, 1, home, content);
}

/**
 * A pro team other than `not` that could take you, picked at random: a team at home, or (a club abroad is a move to another
 * country) one in your sport's market, less likely. With a `rating` (soccer), the clubs whose strength is near yours are likelier.
 */
export function anotherTeam(state: LifeState, sportId: Id, not: Id | null, home: Id, content: ContentBundle, rng: RngState, rating?: number): ProTeam {
  const W = content.balance.sports.world.abroad;
  const here = countryIdOfCity(home, content);
  const adult = state.character.age >= W.minAge;
  const all = marketTeams(state, sportId, home, content).filter((t) => adult || countryIdOfCity(t.city, content) === here);
  let options = all.filter((t) => t.id !== not);
  if (options.length === 0) options = homeLeagueTeams(state, sportId, home, content);
  const weights = options.map((t) => {
    const abroad = countryIdOfCity(t.city, content) !== here ? W.weight : 1;
    const fit = rating === undefined ? 1 : 1 / (1 + Math.abs(t.quality - rating) / 15);
    return [t, abroad * fit] as const;
  });
  // Without weights to tell teams apart this is the plain pick it always was (the generator is read once either way).
  return rating === undefined && weights.every(([, w]) => w === 1) ? pick(rng, options) : weightedPick(rng, weights);
}

/**
 * A pro team takes you to its city: you move there (a home you own is sold, a rental is left, a partner living with you comes
 * along). The team pays for the move. Nothing happens in the city you already live in. Batch 6: a team in another country moves
 * you there on a work permit the club arranges (it runs a little past the end of the deal, `untilYear`); the permit is the one
 * W6 keeps, so a permit that lapses is handled as any other.
 */
export function relocateForTeam(state: LifeState, cityId: Id, content: ContentBundle, untilYear: number = state.currentYear): void {
  if (state.character.cityId === cityId || state.housing.kind === 'incarcerated' || !content.cities[cityId]) return;
  // A temporary stay abroad (study or work) is tied to its city: the move waits until you are home.
  const stay = state.travel.residence;
  if (stay && !stay.settled) return;
  const from = state.character.cityId;
  const crossing = countryIdOfCity(from, content) !== countryIdOfCity(cityId, content);
  if (state.housing.kind === 'owned') sellHome(state, content);
  moveTo(state, 'renting', cityId, content);
  afterMove(state, from, content);
  if (crossing) {
    settleForClub(state, from, untilYear, content);
    state.sports.abroadYear = state.currentYear;
    state.sports.totals.abroad += 1;
    sportsHistory(state, 'abroad', content);
  }
}
