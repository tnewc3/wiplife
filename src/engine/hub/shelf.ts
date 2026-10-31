/**
 * Young players can try anything (C2): a child or teen can quit a sport and take up another with no wait, and
 * switching costs only lost skill growth. The skills of the sport they leave are shelved in the hub (keys
 * `sport.<sport>.<skill>`), where they fade by the shared rules and come back, as faded, if the sport does; the
 * second career beside it (a band), the fans and the season record stay.
 */
import type { ContentBundle } from '../../content/schemas';
import { fadedLevel, idleYears, touchMark } from './skills';
import { pathDef } from '../fame/query';
import type { FamePathState, Id, LifeState, SportsSeason } from '../types';

const shelfKey = (sportId: Id, skillId: Id): string => `sport.${sportId}.${skillId}`;

/** A player under the youth age who plays a sport can switch freely. */
export function youthSwitchable(state: LifeState, content: ContentBundle): boolean {
  return state.character.age < content.balance.careers.hub.youthAge && state.fame.active && state.sports.sport !== null && state.fame.main === state.sports.sport;
}

/** Puts the skills of a sport on the shelf. */
export function shelveSkills(state: LifeState, sportId: Id): void {
  const path = state.fame.paths[sportId];
  if (!path?.skills) return;
  for (const [skillId, level] of Object.entries(path.skills)) {
    const prev = state.hub.skills[shelfKey(sportId, skillId)];
    state.hub.skills[shelfKey(sportId, skillId)] = { level, peak: Math.max(prev?.peak ?? 0, state.hub.marks[`${sportId}.${skillId}`]?.peak ?? level, level), last: state.currentYear };
  }
}

/** Brings the shelved skills of a sport back into the path, as faded by the years since. */
export function restoreSkills(state: LifeState, sportId: Id, content: ContentBundle): void {
  const path = state.fame.paths[sportId];
  const def = pathDef(content, sportId);
  if (!path || !def) return;
  for (const sk of def.skills ?? []) {
    const rec = state.hub.skills[shelfKey(sportId, sk.id)];
    if (!rec) continue;
    let level = rec.level;
    for (let y = 0; y < idleYears(state, rec); y++) level = fadedLevel(level, rec, y + 1, content);
    path.skills = { ...(path.skills ?? {}), [sk.id]: level };
    touchMark(state, `${sportId}.${sk.id}`, level);
    delete state.hub.skills[shelfKey(sportId, sk.id)];
  }
}

export interface Kept {
  sport: Id;
  second: Id | null;
  secondPath: FamePathState | undefined;
  band: LifeState['fame']['band'];
  instrument: Id | null;
  offers: LifeState['fame']['offers'];
  image: number;
  mood: number;
  fans: number;
  burnout: number;
  commitment: LifeState['fame']['commitment'];
  seasons: SportsSeason[];
  /** The path of the sport left behind: what you reached in it (its peak rung, fame) stays on the record. */
  oldPath: FamePathState | undefined;
}

/** Steps out of the sport you play, keeping what belongs to you rather than to the team. Returns what to put back. */
export function leaveForSwitch(state: LifeState): Kept {
  const f = state.fame;
  const old = f.main!;
  shelveSkills(state, old);
  const kept: Kept = {
    sport: old,
    second: f.second,
    secondPath: f.second === null ? undefined : f.paths[f.second],
    band: f.band,
    instrument: f.instrument,
    offers: f.offers,
    image: f.image,
    mood: f.mood,
    fans: f.fans,
    burnout: f.burnout,
    commitment: f.commitment,
    seasons: state.sports.seasons,
    oldPath: f.paths[old],
  };
  f.active = false;
  f.main = null;
  f.second = null;
  f.paths = {};
  f.band = null;
  state.hub.totals.sportSwitches += 1;
  return kept;
}

/** Puts back what a switch kept, around the new sport. */
export function returnAfterSwitch(state: LifeState, kept: Kept, content: ContentBundle): void {
  const f = state.fame;
  if (kept.second !== null && kept.secondPath) {
    f.second = kept.second;
    f.paths[kept.second] = kept.secondPath;
  }
  f.band = kept.band;
  f.instrument = kept.instrument;
  f.offers = kept.offers;
  f.image = kept.image;
  f.mood = kept.mood;
  f.fans = kept.fans;
  f.burnout = kept.burnout;
  f.commitment = kept.commitment;
  state.sports.seasons = [...kept.seasons, ...state.sports.seasons].slice(-40);
  if (kept.oldPath && f.paths[kept.sport] === undefined) f.paths[kept.sport] = kept.oldPath;
  if (f.main !== null) restoreSkills(state, f.main, content);
}

/** Puts back everything after a switch that could not be made (the old sport is the main path again). */
export function undoSwitch(state: LifeState, kept: Kept, oldPath: FamePathState | undefined): void {
  const f = state.fame;
  f.active = true;
  f.main = kept.sport;
  if (oldPath) f.paths[kept.sport] = oldPath;
  if (kept.second !== null && kept.secondPath) {
    f.second = kept.second;
    f.paths[kept.second] = kept.secondPath;
  }
  f.band = kept.band;
}
