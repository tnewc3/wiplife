/**
 * Teen trouble (T1): what the law and the people at home do with it. The
 * offenses, sentences, probation and health effects all run through the
 * existing legal, health and addiction systems (events and `legal`/`health`
 * effects); this adds the juvenile handling: your parents answer a new case,
 * and what happened before you were an adult is sealed when you become one.
 * (Employers and landlords already stop seeing it at that age: ../record.ts.)
 * Numbers: balance/teen.yaml (trouble).
 */
import type { ContentBundle } from '../../content/schemas';
import { clampInt } from '../random';
import { chance } from '../rng';
import type { LifeState } from '../types';
import { queueTeenEvent, teenHistory } from './cliques';
import { householdParents, inTeenYears } from './query';

/** An entry on your record made before you were an adult: a juvenile case. */
export function isJuvenileEntry(state: LifeState, entry: LifeState['legal']['record'][number], content: ContentBundle): boolean {
  return entry.year - state.birthYear < content.balance.relationships.adultAge;
}

/** The yearly part: a new juvenile case is answered at home (once), and at the adult age the juvenile record is sealed (once). */
export function runTrouble(state: LifeState, content: ContentBundle): void {
  const t = state.teen;
  const record = state.legal.record;
  const b = content.balance.teen.trouble;
  if (inTeenYears(state, content) && t.seenRecords < record.length) {
    const parents = householdParents(state, content);
    for (let i = t.seenRecords; i < record.length; i++) {
      if (!isJuvenileEntry(state, record[i]!, content) || parents.length === 0) continue;
      for (const p of parents) {
        const rel = state.relationships[p.id];
        if (!rel) continue;
        rel.affection = clampInt(rel.affection + b.parents.affection, 0, 100);
        rel.trust = clampInt(rel.trust + b.parents.trust, 0, 100);
      }
      const closest = [...parents].sort((x, y) => (state.relationships[y.id]?.affection ?? 0) - (state.relationships[x.id]?.affection ?? 0) || (x.id < y.id ? -1 : 1))[0]!;
      if (chance(state.rng, b.eventChance)) queueTeenEvent(state, 'juvenile', { parent: closest.id }, content);
    }
  }
  t.seenRecords = record.length;
  if (state.character.age >= content.balance.relationships.adultAge && !t.sealed && record.some((e) => isJuvenileEntry(state, e, content))) {
    t.sealed = true;
    for (const e of record) if (isJuvenileEntry(state, e, content)) e.sealed = true;
    teenHistory(state, 'sealed', {}, content);
  }
}
