import { useCallback, useMemo } from 'react';
import { content } from '../content';
import { teamRenames, withTeamNames } from '../engine/selectors';
import { useAppStore } from '../store/appStore';

/**
 * Batch 6: the player's current team names for text a life wrote with the names it began with. A rename during a life is
 * display-only: the life is never changed, and its replay is exact; only what is shown follows the settings.
 */
export function useTeamText(): (text: string) => string {
  const setup = useAppStore((s) => s.life?.league.setup);
  const teams = useAppStore((s) => s.settings.teams);
  const renames = useMemo(() => (setup ? teamRenames(setup, teams, content) : []), [setup, teams]);
  return useCallback((text: string) => (renames.length === 0 ? text : withTeamNames(text, renames)), [renames]);
}

/** A copy of a view with every string run through the renamer (numbers, booleans and shapes are kept). */
export function renameDeep<T>(value: T, fix: (text: string) => string): T {
  if (typeof value === 'string') return fix(value) as T;
  if (Array.isArray(value)) return value.map((v) => renameDeep(v, fix)) as T;
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renameDeep(v, fix)])) as T;
  return value;
}
