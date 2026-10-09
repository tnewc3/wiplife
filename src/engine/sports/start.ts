/**
 * Starting a sports career (E6c): called when a sport (a fame path) is
 * entered. You get the position that suits you best, a first team in your
 * city and the usual training focus. Nothing here is a choice you can't
 * change later on the Sports screen.
 */
import type { ContentBundle, FamePathDef, SportDef } from '../../content/schemas';
import type { LifeState } from '../types';
import { bestPosition, emptySports, levelOfRung } from './query';
import { amateurTeam } from './team';

export function startSports(state: LifeState, def: FamePathDef & { sport?: SportDef | undefined }, content: ContentBundle): void {
  const sport = def.sport;
  const path = state.fame.paths[def.id];
  if (!sport || !path) return;
  const totals = state.sports.totals;
  state.sports = { ...emptySports(), totals };
  state.sports.sport = def.id;
  state.sports.position = bestPosition(state, sport).id;
  const level = levelOfRung(sport, path.rung);
  if (level !== 'pro') state.sports.team = amateurTeam(state, sport, level, 0, content, state.rng);
}
