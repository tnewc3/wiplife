/**
 * Builds the archive entry for a life that ended, or for one set aside
 * unfinished when the player starts a new life. The entry is self-contained:
 * it reads correctly even after the content that produced it changes.
 */
import type { ContentBundle } from '../content/schemas';
import { writeFuneral } from './eulogy';
import { netWorth } from './finance';
import { writeObituary } from './obituary';
import type { ArchivedLife, HistoryEntry, LifeState } from './types';

export { netWorth } from './finance';

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

/**
 * The archive entry for a life: finished if it is in the dead phase,
 * unfinished otherwise. `heirName` (E2b): the heir who carried on from it.
 */
export function archiveEntry(life: LifeState, content: ContentBundle, heirName?: string): ArchivedLife {
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
    birthCityId: c.birthCityId,
    obituary: writeObituary(life, content),
    funeral: writeFuneral(life, content),
    highlights: selectHighlights(life.history, content),
    finalNetWorth: netWorth(life),
    finalStats: { ...c.stats },
    seed: life.seed,
    generation: life.lineage.generation,
    lineId: life.lineage.lineId,
    familyName: life.lineage.familyName,
    familyReputation: life.lineage.reputation,
  };
  if (life.lineage.parentLifeId !== undefined) entry.parentLifeId = life.lineage.parentLifeId;
  if (heirName !== undefined) entry.heirName = heirName;
  return entry;
}
