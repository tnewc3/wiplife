/**
 * Your sound and your titles (Batch 4): genres (src/content/genres) and how
 * near they sit to each other (balance/fame.yaml sound), the main genre of
 * a path and the genre of each release, and the titles you type for your
 * work and your band (checked here, so the action, the save check and the
 * screen agree), with suggestions from text/fame.yaml.
 *
 * A release outside your genre is judged by critics as they would judge any
 * work; fans react by how far it sits from your sound: their score and mood
 * fall with the distance, some leave and some new ones come.
 */
import type { ContentBundle, FameGenreDef } from '../../content/schemas';
import { clampInt } from '../random';
import { createRng, nextInt } from '../rng';
import type { Id, LifeState } from '../types';
import { fameHistory } from './ladder';
import { pathDef } from './query';

/** The genres of a path, in a fixed order. */
export function genresOf(content: ContentBundle, pathId: Id): FameGenreDef[] {
  return Object.keys(content.fameGenres)
    .sort()
    .map((id) => content.fameGenres[id]!)
    .filter((g) => !g.retired && g.path === pathId);
}

/** Whether this path has genres (music). */
export function hasGenres(content: ContentBundle, pathId: Id | null): boolean {
  return pathDef(content, pathId)?.genres === true;
}

/** How near two genres sit (1 the same, down to `other` for pairs not listed). */
export function affinity(a: Id, b: Id, content: ContentBundle): number {
  if (a === b) return 1;
  const s = content.balance.fame.sound;
  const pair = s.affinity.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
  return pair ? pair.x : s.other;
}

/** How far a genre sits from your sound (0 on it, up to 1). */
export function genreDistance(main: Id | undefined, genre: Id | undefined, content: ContentBundle): number {
  if (main === undefined || genre === undefined) return 0;
  return 1 - affinity(main, genre, content);
}

/** Whether a genre id is one of this path's. */
export function isGenreOf(content: ContentBundle, pathId: Id, genre: Id): boolean {
  const def = content.fameGenres[genre];
  return def !== undefined && !def.retired && def.path === pathId;
}

export type GenreBlock = 'inactive' | 'path' | 'unknown' | 'same';

/** Why you can't make this your main genre now, or null. */
export function genreBlock(state: LifeState, pathId: Id, genre: Id, content: ContentBundle): GenreBlock | null {
  const f = state.fame;
  if (!f.active) return 'inactive';
  const path = f.paths[pathId];
  if (!path || ![f.main, f.second].includes(pathId) || !hasGenres(content, pathId)) return 'path';
  if (!isGenreOf(content, pathId, genre)) return 'unknown';
  if (path.genre === genre) return 'same';
  return null;
}

/**
 * Makes a genre your main one. The first choice is free; a change of sound
 * costs fans and fan mood by how far it moves, and counts as a switch.
 * Returns whether it was a switch.
 */
export function setMainGenre(state: LifeState, pathId: Id, genre: Id, content: ContentBundle): boolean {
  const f = state.fame;
  const path = f.paths[pathId];
  if (!path) return false;
  const before = path.genre;
  path.genre = genre;
  if (before === undefined || before === genre) return false;
  const s = content.balance.fame.sound;
  const d = genreDistance(before, genre, content);
  f.fans = Math.max(0, Math.round(f.fans * (1 - s.switchLeave * d)));
  f.mood = clampInt(f.mood - s.switchMood * d, 0, 100);
  f.totals.genreSwitches += 1;
  fameHistory(state, 'genre', content);
  return true;
}

/** What a release outside your sound does to how fans take it (points off their score), by distance. */
export function offGenreFanScore(distance: number, content: ContentBundle): number {
  return distance < content.balance.fame.sound.offGenre ? 0 : Math.round(distance * content.balance.fame.sound.fanScore);
}

/** Fans who leave and fans who come after a release outside your sound, and fan mood. */
export function offGenreFans(state: LifeState, distance: number, fanScore: number, content: ContentBundle): void {
  const s = content.balance.fame.sound;
  if (distance < s.offGenre) return;
  const f = state.fame;
  const left = f.fans * s.leave * distance;
  const came = f.fans * s.gain * distance * Math.max(0, (fanScore - 50) / 50);
  f.fans = Math.max(0, Math.round(f.fans - left + came));
  f.mood = clampInt(f.mood - s.mood * distance, 0, 100);
  f.totals.offGenre += 1;
}

// ── Titles ─────────────────────────────────────────────────────────────────

/** The longest title (or band name) you can type, and the most track titles a record can have. */
export const TITLE_MAX = 60;
export const TRACKS_MAX = 20;

/** Letters (any language), digits, spaces and everyday punctuation. */
const ALLOWED = /^[\p{L}\p{M}\p{N} '’!?.,&\-:()/#"]+$/u;
const SOMETHING = /[\p{L}\p{N}]/u;

/** A typed title, tidied (trimmed, single spaces), or null when it can't be one: empty, too long or with characters a title can't have. */
export function parseTitle(raw: unknown, max = TITLE_MAX): string | null {
  if (typeof raw !== 'string') return null;
  const tidy = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (tidy.length < 1 || tidy.length > max || !ALLOWED.test(tidy) || !SOMETHING.test(tidy)) return null;
  return tidy;
}

/** Typed track titles, tidied, or null when one of them can't be a title or there are too many. Empty entries are left out. */
export function parseTracks(raw: unknown, max: number): string[] | null {
  if (!Array.isArray(raw) || raw.length > TRACKS_MAX) return null;
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t === 'string' && t.trim() === '') continue;
    const tidy = parseTitle(t);
    if (tidy === null) return null;
    out.push(tidy);
  }
  return out.length <= max ? out : null;
}

/** The nth suggestion from a list (for the project step and forming a band), never one of `used`, the same for the same life, year and n. */
function suggestion(list: readonly string[], used: ReadonlySet<string>, key: string, n: number): string {
  const fresh = list.filter((t) => !used.has(t));
  const pool = fresh.length > 0 ? fresh : list;
  if (pool.length === 0) return 'Untitled';
  const rng = createRng(key);
  const start = nextInt(rng, 0, pool.length - 1);
  return pool[(start + n) % pool.length]!;
}

/** A title suggestion for a new project in a path (n = 0, 1, 2... for "suggest another"). Reads only. */
export function titleSuggestion(state: LifeState, pathId: Id, n: number, content: ContentBundle): string {
  const used = new Set(state.fame.projects.map((p) => p.title));
  return suggestion(content.text.fame.titles[pathId] ?? [], used, `${state.seed}:title:${pathId}:${state.currentYear}`, n);
}

/** A band name suggestion (n = 0, 1, 2...). Reads only. */
export function bandNameSuggestion(state: LifeState, n: number, content: ContentBundle): string {
  const used = new Set([...state.fame.pastBands.map((b) => b.name), ...state.fame.offers.map((o) => o.name)]);
  if (state.fame.band) used.add(state.fame.band.name);
  return suggestion(content.text.fame.bandNames, used, `${state.seed}:band:${state.currentYear}`, n);
}
