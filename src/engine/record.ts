/**
 * Which parts of your criminal record count where (Stage 9). From the
 * independence age, offenses from before it stop counting for hiring
 * (including job requirements) and renting; before it, they count. They
 * stay on the record itself, in life history and in event conditions.
 */
import type { ContentBundle } from '../content/schemas';
import type { LegalState, LifeState } from './types';

/** The record employers and landlords see: everything, less offenses from before the independence age once you've reached it. */
export function countedRecord(state: LifeState, content: ContentBundle): LegalState['record'] {
  const age = content.balance.economy.independenceAge;
  if (state.character.age < age) return state.legal.record;
  return state.legal.record.filter((r) => r.year - state.birthYear >= age);
}
