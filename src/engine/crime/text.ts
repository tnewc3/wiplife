/**
 * Values crime events can use in their text (E6a): {crew} (the crew you are in,
 * or the one you left), {rivalCrew} (the crew at odds with it) and {rank}
 * (your title in it). The content build checks that an event using one requires
 * what it names (tools/content/crime.ts).
 */
import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';
import { crewName, lastCrewId, rankTitle } from './query';

export const CRIME_TEXT_VALUES = ['crew', 'rivalCrew', 'rank'] as const;

export function crimeTextValues(state: LifeState, content: ContentBundle): Record<string, string> {
  const crew = state.crime.crew;
  const id = lastCrewId(state);
  const past = state.crime.past.at(-1);
  return {
    crew: crewName(content, id),
    rivalCrew: crewName(content, crew?.rival),
    rank: crew ? rankTitle(content, crew.defId, state.crime.rank) : past ? rankTitle(content, past.crewId, past.topRank) : '',
  };
}
