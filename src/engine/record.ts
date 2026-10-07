/**
 * Which parts of your criminal record count where (Stage 9). From the
 * independence age, offenses from before it stop counting for hiring
 * (including job requirements) and renting; before it, they count. T1: at
 * that age the juvenile entries are also marked sealed (./teen/trouble.ts),
 * which takes them out of event conditions and of what a court counts. They
 * stay on the record itself and in life history.
 */
import type { ContentBundle } from '../content/schemas';
import type { LegalState, LifeState } from './types';

/** The record employers and landlords see: everything, less offenses from before the independence age once you've reached it. */
export function countedRecord(state: LifeState, content: ContentBundle): LegalState['record'] {
  const age = content.balance.economy.independenceAge;
  if (state.character.age < age) return state.legal.record;
  return state.legal.record.filter((r) => !r.sealed && r.year - state.birthYear >= age);
}

/** T1: the entries that count against you in a court: everything not sealed. */
export function unsealedRecord(state: LifeState): LegalState['record'] {
  return state.legal.record.filter((r) => !r.sealed);
}
