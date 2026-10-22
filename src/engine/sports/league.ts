/**
 * The world of teams a life plays in (Batch 6). The teams of a sport are in content (src/content/fame); a life changes them with
 * the setup it began with (the player's team settings, copied into the life at creation: renamed, moved and added teams) and the
 * leagues soccer's clubs move between. Everything that asks which teams there are asks here, never the sport's definition, so a
 * life replays exactly whatever the settings say later.
 *
 * - `teamsOf`: every pro team of a sport in this life, with the setup applied.
 * - `homeLeagueTeams`: the teams at home (the country you live in, or a club abroad you commute to): the draft, the camps.
 * - `marketTeams`: the teams you could sign with: home, and (by the sport's market groups) clubs in other countries.
 * - `sameLeague`: the teams a club plays against.
 * - `rivalOf`: a club's derby rival: the same city, or the region.
 *
 * Reads only, except `settleLeagues` and `applyPending`. Numbers: balance/sports.yaml.
 */
import type { ContentBundle, SportDef, SportProTeamDef } from '../../content/schemas';
import { countryIdOfCity } from '../country';
import type { Id, LifeState } from '../types';
import { emptySetup, isEmptySetup, type TeamSetup } from './setup';

/** A pro team as this life sees it: a team of the game's content with the life's setup applied, or one the player added. */
export type ProTeam = SportProTeamDef & { custom?: true };

export const emptyLeague = (): LifeState['league'] => ({ setup: emptySetup(), pending: null, tiers: {}, tierYear: 0 });

const cache = new WeakMap<TeamSetup, Map<Id, readonly ProTeam[]>>();

function applySetup(t: SportProTeamDef, setup: TeamSetup): ProTeam {
  let out: ProTeam = t;
  const rename = setup.renamed[t.id];
  if (rename) out = { ...out, ...(rename.name !== undefined ? { name: rename.name } : {}), ...(rename.nickname !== undefined ? { nickname: rename.nickname } : {}) };
  const city = setup.moved[t.id];
  if (city !== undefined && city !== out.city) {
    // The team plays in a city of the game now: it is no longer away from one.
    const { cityName: _a, nearestCityId: _b, futureCity: _c, futureCountry: _d, country: _e, ...rest } = out;
    out = { ...rest, city };
  }
  return out;
}

/** The pro teams of a sport with a setup applied: the sport's own (renamed and moved as the setup says) and the teams the setup adds. */
export function teamsWithSetup(setup: TeamSetup, sportId: Id, content: ContentBundle): readonly ProTeam[] {
  const def = content.famePaths[sportId]?.sport;
  if (!def) return [];
  const base = def.leagues.pro.teams;
  if (isEmptySetup(setup)) return base;
  let bySport = cache.get(setup);
  if (!bySport) cache.set(setup, (bySport = new Map()));
  const hit = bySport.get(sportId);
  if (hit) return hit;
  const strength = content.balance.sports.world.strength;
  const added: ProTeam[] = setup.added
    .filter((a) => a.sport === sportId)
    .map((a) => ({
      id: a.id,
      name: a.name,
      ...(a.nickname !== undefined ? { nickname: a.nickname } : {}),
      city: setup.moved[a.id] ?? a.city,
      quality: strength[a.strength - 1]!,
      tier: (def.leagues.pro.tiers !== undefined ? (a.tier ?? 1) : 1) as 1 | 2,
      custom: true as const,
    }));
  const all = [...base.map((t) => applySetup(t, setup)), ...added];
  bySport.set(sportId, all);
  return all;
}

/** Every pro team of a sport in this life: the sport's own, with the life's renames and moves, and the teams the player added. */
export function teamsOf(state: LifeState, sportId: Id, content: ContentBundle): readonly ProTeam[] {
  return teamsWithSetup(state.league.setup, sportId, content);
}

/** A pro team by id, or undefined. */
export function teamById(state: LifeState, sportId: Id, id: Id | null | undefined, content: ContentBundle): ProTeam | undefined {
  if (id === null || id === undefined) return undefined;
  return teamsOf(state, sportId, content).find((t) => t.id === id);
}

/** The country a club plays in: its own, for a club in a country the game does not model, else the country of its city. */
export function playingCountry(t: ProTeam, content: ContentBundle): string {
  return t.country ?? countryIdOfCity(t.city, content);
}

/** The league a soccer club plays in now (1 is the top league): where it started, unless it has been promoted or relegated. */
export function divisionOf(state: LifeState, t: ProTeam): 1 | 2 {
  return state.league.tiers[t.id] ?? t.tier;
}

/** How far from home a team plays: `city` (a city nearby the game does not model) or `country` (a country it does not model). */
export function awayOf(t: ProTeam): 'city' | 'country' | undefined {
  return t.futureCountry === true ? 'country' : t.futureCity === true ? 'city' : undefined;
}

/** Where a team plays, in words, when that is not simply the city it is in. */
export function placeOf(t: ProTeam, content: ContentBundle): string {
  return t.cityName ?? content.cities[t.city]?.name ?? '';
}

/** The group of countries whose clubs share a market with this country, or just the country. */
export function marketOf(def: SportDef, country: string): readonly string[] {
  return def.leagues.pro.markets?.find((g) => (g as readonly string[]).includes(country)) ?? [country];
}

/** True when the sport plays a league in each country with two divisions (soccer) rather than one league across a market. */
export function hasDivisions(def: SportDef): boolean {
  return def.leagues.pro.tiers !== undefined;
}

/**
 * The teams at home for someone living in `home`: those that play out of the country you live in, which includes teams in
 * cities the game does not model yet (you live in the nearest modeled city), and the clubs of a country it does not model for a
 * UK player (you commute). The draft is drawn from the ones in a country the game models.
 */
export function homeLeagueTeams(state: LifeState, sportId: Id, home: Id, content: ContentBundle, includeCommute = false): ProTeam[] {
  const here = countryIdOfCity(home, content);
  return teamsOf(state, sportId, content).filter(
    (t) => content.cities[t.city] !== undefined && countryIdOfCity(t.city, content) === here && (includeCommute || t.futureCountry !== true),
  );
}

/** The teams you could sign with from `home`: the teams at home (commuting ones included), and the clubs of countries in your sport's market group. */
export function marketTeams(state: LifeState, sportId: Id, home: Id, content: ContentBundle): ProTeam[] {
  const def = content.famePaths[sportId]?.sport;
  if (!def) return [];
  const here = countryIdOfCity(home, content);
  const group = marketOf(def, here);
  return teamsOf(state, sportId, content).filter((t) => {
    if (content.cities[t.city] === undefined) return false;
    return countryIdOfCity(t.city, content) === here || group.includes(playingCountry(t, content));
  });
}

/** The teams a club plays against: its league. Soccer: the country's division. Other sports: the clubs of the market. */
export function sameLeague(state: LifeState, sportId: Id, team: ProTeam, content: ContentBundle): ProTeam[] {
  const def = content.famePaths[sportId]?.sport;
  const all = teamsOf(state, sportId, content);
  if (!def) return [];
  const country = playingCountry(team, content);
  if (hasDivisions(def)) {
    const d = divisionOf(state, team);
    return all.filter((t) => playingCountry(t, content) === country && divisionOf(state, t) === d);
  }
  const group = marketOf(def, country);
  return all.filter((t) => group.includes(playingCountry(t, content)));
}

/** A club's derby rival: another club of its league in the same city, else in the same region (the same nearest modeled city); the closest in strength. */
export function rivalOf(state: LifeState, sportId: Id, team: ProTeam, content: ContentBundle): ProTeam | undefined {
  const mates = sameLeague(state, sportId, team, content).filter((t) => t.id !== team.id);
  const near = (list: ProTeam[]): ProTeam | undefined => [...list].sort((a, b) => Math.abs(a.quality - team.quality) - Math.abs(b.quality - team.quality) || (a.id < b.id ? -1 : 1))[0];
  const city = near(mates.filter((t) => t.city === team.city && (t.cityName ?? null) === (team.cityName ?? null)));
  if (city) return city;
  return near(mates.filter((t) => t.city === team.city && t.nearestCityId !== undefined));
}

/** The team a player added, by id. */
export function isCustom(t: ProTeam | undefined): boolean {
  return t?.custom === true;
}
