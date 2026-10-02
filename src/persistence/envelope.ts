import { z } from 'zod';

/**
 * Version of the saved data layout. Bump it whenever the shape of saved data
 * changes, and add a migration from the previous version in migrations.ts.
 */
export const CURRENT_SCHEMA_VERSION = 9;

/** Every save is wrapped in this envelope (docs/technical.md, section M). */
export interface SaveEnvelope<T = unknown> {
  schemaVersion: number;
  contentVersion: string;
  /** ISO 8601 timestamp. */
  savedAt: string;
  data: T;
}

export const envelopeSchema = z.strictObject({
  schemaVersion: z.int().positive(),
  contentVersion: z.string().min(1),
  savedAt: z.iso.datetime({ offset: true }),
  data: z.unknown(),
});

export function makeEnvelope<T>(data: T, contentVersion: string, now: Date = new Date()): SaveEnvelope<T> {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    contentVersion,
    savedAt: now.toISOString(),
    data,
  };
}
