import type { z } from 'zod';
import type { WiplifeDb } from './db';
import { CURRENT_SCHEMA_VERSION, envelopeSchema, type SaveEnvelope } from './envelope';
import { migrateEnvelope, migrations as shippedMigrations, type Migration } from './migrations';

const ACTIVE_SLOT = 'active';
const BACKUPS_KEPT = 2;

/**
 * Writes the active life. The save it replaces becomes a backup; only the
 * newest BACKUPS_KEPT backups are kept.
 */
export async function writeSave(db: WiplifeDb, envelope: SaveEnvelope): Promise<void> {
  await db.transaction('rw', db.lives, db.backups, () => writeSaveIn(db, envelope));
}

/** writeSave's body, for use inside a transaction that already covers lives and backups. */
export async function writeSaveIn(db: WiplifeDb, envelope: SaveEnvelope): Promise<void> {
  const previous = await db.lives.get(ACTIVE_SLOT);
  if (previous) {
    await db.backups.add({ envelope: previous.envelope });
    const keys = await db.backups.orderBy('seq').primaryKeys();
    const excess = keys.slice(0, Math.max(0, keys.length - BACKUPS_KEPT));
    if (excess.length > 0) await db.backups.bulkDelete(excess);
  }
  await db.lives.put({ id: ACTIVE_SLOT, envelope });
}

export type LoadResult<T> =
  /** No saved life exists. */
  | { status: 'none' }
  /** The active save loaded (after any migrations). */
  | { status: 'ok'; envelope: SaveEnvelope<T> }
  /** The active save was unreadable; a backup loaded instead. */
  | { status: 'recovered'; envelope: SaveEnvelope<T>; errors: string[] }
  /** Nothing could be loaded. `raw` is kept so the player can export it. */
  | { status: 'corrupt'; errors: string[]; raw: unknown[] };

function decode<T>(
  raw: unknown,
  dataSchema: z.ZodType<T>,
  list: readonly Migration[],
  targetVersion: number,
): SaveEnvelope<T> {
  const envelope: SaveEnvelope = envelopeSchema.parse(raw);
  const migrated = migrateEnvelope(envelope, list, targetVersion);
  return { ...migrated, data: dataSchema.parse(migrated.data) };
}

/**
 * Loads the active life, validating it with `dataSchema`. If it is invalid,
 * tries each backup, newest first. Older saves are migrated first; the
 * migration list and target version are parameters only so tests can supply
 * their own chain.
 */
export async function readSave<T>(
  db: WiplifeDb,
  dataSchema: z.ZodType<T>,
  list: readonly Migration[] = shippedMigrations,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): Promise<LoadResult<T>> {
  const active = await db.lives.get(ACTIVE_SLOT);
  const backups = await db.backups.orderBy('seq').reverse().toArray();
  if (!active && backups.length === 0) return { status: 'none' };

  const candidates: { label: string; raw: unknown }[] = [
    ...(active ? [{ label: 'autosave', raw: active.envelope as unknown }] : []),
    ...backups.map((b, i) => ({ label: `backup ${i + 1}`, raw: b.envelope as unknown })),
  ];
  const errors: string[] = [];
  for (const [index, candidate] of candidates.entries()) {
    try {
      const envelope = decode(candidate.raw, dataSchema, list, targetVersion);
      if (index === 0 && active) return { status: 'ok', envelope };
      return { status: 'recovered', envelope, errors };
    } catch (err) {
      errors.push(`${candidate.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { status: 'corrupt', errors, raw: candidates.map((c) => c.raw) };
}
