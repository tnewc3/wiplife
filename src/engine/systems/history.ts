/**
 * Life history: milestone entries written by the yearly systems (and, from
 * Stage 4, by events). The log is capped so a long life never grows it
 * without limit.
 */
import type { ContentBundle } from '../../content/schemas';
import { pick } from '../rng';
import { renderText, type TextContext } from '../text';
import type { HistoryEntry, LifeState } from '../types';

/**
 * Adds an entry for the current year. Past the balance limit, the oldest
 * entry of the lowest importance is dropped, so major moments are kept.
 */
export function addHistory(state: LifeState, entry: Omit<HistoryEntry, 'year' | 'age'>, content: ContentBundle): void {
  state.history.push({ year: state.currentYear, age: state.character.age, ...entry });
  const max = content.balance.aging.history.maxEntries;
  while (state.history.length > max) {
    const lowest = Math.min(...state.history.map((e) => e.importance));
    state.history.splice(
      state.history.findIndex((e) => e.importance === lowest),
      1,
    );
  }
}

/** Picks one variant from a content group and renders it (uses the life's rng). */
export function writeFromGroup(
  state: LifeState,
  group: { importance: 1 | 2 | 3; variants: readonly string[] },
  tags: string[],
  context: TextContext,
  content: ContentBundle,
): void {
  const text = renderText(pick(state.rng, group.variants), context);
  addHistory(state, { text, tags, importance: group.importance }, content);
}
