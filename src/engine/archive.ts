/**
 * Builds the archive entry for a life that ended, or for one set aside
 * unfinished when the player starts a new life. The entry is self-contained:
 * it reads correctly even after the content that produced it changes.
 */
import type { ContentBundle } from '../content/schemas';
import { writeObituary } from './obituary';
import type { ArchivedLife, HistoryEntry, LifeState } from './types';

/** Savings plus home value, minus every debt. */
export function netWorth(life: LifeState): number {
  const debts = life.finances.debts.reduce((sum, d) => sum + d.balance, 0);
  return life.finances.savings + (life.housing.homeValue ?? 0) - debts;
}

/**
 * The history entries kept in the archive: those of at least the balance
 * importance, capped by dropping the oldest least important first.
 */
export function selectHighlights(history: readonly HistoryEntry[], content: ContentBundle): HistoryEntry[] {
  const { highlightMinImportance, maxHighlights } = content.balance.aging.archive;
  const kept = history.filter((e) => e.importance >= highlightMinImportance).map((e) => ({ ...e, tags: [...e.tags] }));
  while (kept.length > maxHighlights) {
    const lowest = Math.min(...kept.map((e) => e.importance));
    kept.splice(
      kept.findIndex((e) => e.importance === lowest),
      1,
    );
  }
  return kept;
}

/** The archive entry for a life: finished if it is in the dead phase, unfinished otherwise. */
export function archiveEntry(life: LifeState, content: ContentBundle): ArchivedLife {
  const c = life.character;
  const finished = life.phase === 'dead';
  const causeId = life.death?.causeId;
  const entry: ArchivedLife = {
    id: life.id,
    name: `${c.name.first} ${c.name.last}`,
    pronouns: { ...c.identity.pronouns },
    birthYear: life.birthYear,
    deathYear: life.currentYear,
    ageAtDeath: c.age,
    causeOfDeath: finished && causeId ? (content.causes[causeId]?.text ?? causeId) : null,
    unfinished: !finished,
    cityId: c.cityId,
    obituary: writeObituary(life, content),
    highlights: selectHighlights(life.history, content),
    finalNetWorth: netWorth(life),
    finalStats: { ...c.stats },
    seed: life.seed,
    generation: life.lineage.generation,
  };
  if (life.lineage.parentLifeId !== undefined) entry.parentLifeId = life.lineage.parentLifeId;
  return entry;
}
