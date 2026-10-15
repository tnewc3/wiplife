/**
 * What the invariants need from the input log: how many years have been lived, and which records were romance
 * interactions. The log only ever grows by appending, and a long life's log has thousands of records, so the
 * summary is kept per life (found through its first record, which every state of the life shares) and extended
 * with only the records added since it was last read.
 */
import type { ContentBundle } from '../content/schemas';
import type { InputRecord } from './types';

export interface LogSummary {
  ageUps: number;
  /** Records of romance interactions, in order. */
  romance: InputRecord[];
}

interface Kept extends LogSummary {
  scanned: number;
  /** The last record scanned: if it is no longer at that place, the log was not appended to, and it is read afresh. */
  last: InputRecord;
}

const kept = new WeakMap<object, WeakMap<ContentBundle, Kept>>();

export function summarizeLog(log: readonly InputRecord[], content: ContentBundle): LogSummary {
  const first = log[0];
  if (first === undefined) return { ageUps: 0, romance: [] };
  let byContent = kept.get(first);
  if (!byContent) kept.set(first, (byContent = new WeakMap()));
  let summary = byContent.get(content);
  if (summary && (summary.scanned > log.length || log[summary.scanned - 1] !== summary.last)) summary = undefined;
  if (!summary) summary = { ageUps: 0, romance: [], scanned: 0, last: first };
  for (let i = summary.scanned; i < log.length; i++) {
    const record = log[i]!;
    if (record.kind === 'ageUp') summary.ageUps++;
    else if (record.kind === 'interact' && content.interactions[String(record.payload.interactionId)]?.romance) summary.romance.push(record);
    summary.last = record;
  }
  summary.scanned = log.length;
  byContent.set(content, summary);
  return summary;
}
