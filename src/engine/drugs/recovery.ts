/**
 * Recovery (D1): quitting a drug on purpose. The support groups, counseling and rehab are the Recovery activities
 * (src/content/pastimes) and work through the addiction condition, which the habits follow (./habit.ts); here is the
 * rest: the decision to stop, with its first weeks, and the record of years clean, recovery and relapse that the yearly
 * step keeps (./year.ts). Story and consequences only. Numbers: balance/drugs.yaml (recovery).
 */
import type { ContentBundle } from '../../content/schemas';
import { isIncarcerated } from '../legal';
import { clampInt } from '../random';
import type { Id, LifeState } from '../types';
import { syncAddiction } from './habit';
import { drugDef, rollYear } from './query';
import { note, say } from './text';

export type QuitBlock = 'drug' | 'jail' | 'never' | 'already';

export function quitBlock(state: LifeState, drugId: Id, content: ContentBundle): QuitBlock | null {
  if (!drugDef(content, drugId)) return 'drug';
  if (isIncarcerated(state)) return 'jail';
  const h = state.drugs.habits[drugId];
  if (!h || h.total === 0 || (h.dependence <= 0 && h.tolerance <= 0)) return 'never';
  if (h.quitYear > 0) return 'already';
  return null;
}

/** You stop using a drug: the stash you had goes, dependence drops, and the first weeks are hard. */
export function quitDrug(state: LifeState, drugId: Id, content: ContentBundle): boolean {
  if (quitBlock(state, drugId, content) !== null) return false;
  const q = content.balance.drugs.recovery.quit;
  const def = drugDef(content, drugId)!;
  const h = state.drugs.habits[drugId]!;
  rollYear(state);
  const wasAddicted = h.dependence >= content.balance.drugs.threshold;
  h.quitYear = state.currentYear;
  h.clean = 0;
  h.recovered = false;
  h.dependence = Math.max(0, Math.round((h.dependence - q.dependence) * 10) / 10);
  delete state.drugs.stock[drugId];
  const s = state.character.stats;
  if (wasAddicted) {
    s.stress = clampInt(s.stress + q.stress, 0, 100);
    s.happiness = clampInt(s.happiness + q.happiness, 0, 100);
  }
  state.drugs.totals.quits += 1;
  say(state, 'quit', { drug: def.noun }, content);
  syncAddiction(state, content);
  state.drugs.last = { action: 'quit', kind: 'quit', drugId, amount: 0, balance: state.finances.savings, note: note('quit', { drug: def.noun }, content) };
  return true;
}
