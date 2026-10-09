/**
 * Sports (E6c): small read-only helpers every part of the engine shares:
 * whether you play a sport, which one and at what level, your position and
 * how well you fit it, your latest season, and the words for places in the
 * order of things. Numbers: balance/sports.yaml; sports and their teams:
 * src/content/fame (a sport is a fame path with a `sport` block).
 */
import type { ContentBundle, FamePathDef, SportDef, SportLevel, SportPositionDef } from '../../content/schemas';
import type { Id, LifeState, SportsSeason, SportsState } from '../types';

export const emptySports = (): SportsState => ({
  sport: null,
  position: null,
  pro: false,
  team: null,
  contract: null,
  unsigned: 0,
  focus: 'skills',
  form: 0,
  pain: false,
  rest: false,
  ask: null,
  playOut: false,
  seasons: [],
  run: null,
  draft: null,
  suspended: 0,
  traded: 0,
  released: 0,
  agedOut: 0,
  totals: { seasons: 0, proSeasons: 0, playoffs: 0, finals: 0, titles: 0, allStars: 0, injuries: 0, serious: 0, playedThrough: 0, trades: 0, releases: 0, suspensions: 0, earned: 0, bestRating: 0 },
});

/** A sport's fame path, or undefined for anything that is not a sport. */
export function sportPath(content: ContentBundle, id: Id | null | undefined): (FamePathDef & { sport: SportDef }) | undefined {
  if (id === null || id === undefined) return undefined;
  const def = content.famePaths[id];
  return def && !def.retired && def.sport ? (def as FamePathDef & { sport: SportDef }) : undefined;
}

/** Every sport, in id order. */
export function allSports(content: ContentBundle): (FamePathDef & { sport: SportDef })[] {
  return Object.keys(content.famePaths)
    .sort()
    .map((id) => content.famePaths[id]!)
    .filter((d): d is FamePathDef & { sport: SportDef } => !d.retired && d.sport !== undefined);
}

/** Your main path is a sport, you have a career and you haven't retired from it. */
export function inSports(state: LifeState, content: ContentBundle): boolean {
  return state.fame.active && sportPath(content, state.fame.main) !== undefined;
}

/** The sport you play (or last played), as a definition. */
export function mySport(state: LifeState, content: ContentBundle): (FamePathDef & { sport: SportDef }) | undefined {
  return sportPath(content, state.sports.sport);
}

/** The level of play at a rung of a sport. */
export function levelOfRung(def: SportDef, rung: number): SportLevel {
  if (rung >= def.proRung) return 'pro';
  return (['youth', 'school', 'college'] as const)[Math.max(0, Math.min(2, rung - 1))]!;
}

/** The level you play at now, or null when you don't play. */
export function levelNow(state: LifeState, content: ContentBundle): SportLevel | null {
  const def = inSports(state, content) ? mySport(state, content) : undefined;
  const path = def ? state.fame.paths[def.id] : undefined;
  return def && path ? levelOfRung(def.sport, path.rung) : null;
}

export function positionOf(def: SportDef, id: Id | null): SportPositionDef | undefined {
  return def.positions.find((p) => p.id === id);
}

/** How well your traits and stats fit a position (0–1, 0.5 is an average fit). */
export function fitFor(state: LifeState, position: SportPositionDef): number {
  const c = state.character;
  let total = 0;
  let weights = 0;
  for (const [key, weight] of Object.entries(position.fit)) {
    if (weight === undefined) continue;
    const value = key in c.stats ? c.stats[key as keyof typeof c.stats] : c.personality[key as keyof typeof c.personality];
    total += weight * value;
    weights += weight;
  }
  return weights === 0 ? 0.5 : total / weights / 100;
}

/** The position that suits you best (first in file order on a tie). */
export function bestPosition(state: LifeState, def: SportDef): SportPositionDef {
  let best = def.positions[0]!;
  for (const p of def.positions) if (fitFor(state, p) > fitFor(state, best) + 1e-9) best = p;
  return best;
}

/** This year's season, if one was played. */
export function thisSeason(state: LifeState): SportsSeason | undefined {
  const s = state.sports.seasons.at(-1);
  return s && s.year === state.currentYear ? s : undefined;
}

export function lastSeason(state: LifeState): SportsSeason | undefined {
  return state.sports.seasons.at(-1);
}

/** Whether a sports injury is keeping you from your best (a condition of the sport's injury list). */
export function injuryNow(state: LifeState, def: SportDef): { conditionId: Id; severity: number } | null {
  let worst: { conditionId: Id; severity: number } | null = null;
  for (const c of state.health.conditions) {
    if (!def.injuries.some((i) => i.id === c.conditionId)) continue;
    if (!worst || c.severity > worst.severity) worst = { conditionId: c.conditionId, severity: c.severity };
  }
  return worst;
}

/** "1st", "2nd", "3rd"... for a draft pick. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** Contract years left, counting this one (0 without a contract). */
export function contractYearsLeft(state: LifeState): number {
  const c = state.sports.contract;
  return c ? Math.max(0, c.until - state.currentYear + 1) : 0;
}

/** Your average rating over the last three seasons (0 with none). */
export function recentRating(state: LifeState): number {
  const last = state.sports.seasons.slice(-3);
  return last.length === 0 ? 0 : last.reduce((a, s) => a + s.rating, 0) / last.length;
}
