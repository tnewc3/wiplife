/**
 * The life archive: one entry per life that ended (or was set aside
 * unfinished). Entries are stored in their own envelope with their own
 * schema version, separate from the active life's.
 */
import { z } from 'zod';
import { eulogyGroupSchema, eulogyToneSchema } from '../content/schemas';
import type { ArchivedLife } from '../engine/types';
import type { WiplifeDb } from './db';
import { envelopeSchema, makeEnvelope, type SaveEnvelope } from './envelope';
import { historyEntrySchema, pronounsSchema, statsSchema } from './lifeSchema';
import { migrateEnvelope, type Migration } from './migrations';
import { writeSaveIn } from './saves';

/** Version of the archive entry layout. Bump it with a migration below when ArchivedLife changes. */
export const ARCHIVE_SCHEMA_VERSION = 5;

/** Every archive migration ever shipped, oldest first. Never edit or remove one. */
export const archiveMigrations: readonly Migration[] = [
  {
    from: 1,
    description: 'Stage 6: the birth city. Nobody could move before, so it is the city the life ended in.',
    migrate: (data) =>
      typeof data === 'object' && data !== null && !Array.isArray(data) ? { ...data, birthCityId: (data as { cityId?: unknown }).cityId } : data,
  },
  {
    from: 2,
    description:
      'E2b: family lines. An older life is a line of its own (its id), named after the last word of its name, with an ' +
      'unremarkable reputation (50); no heir carried on from it.',
    migrate: (data) => {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return data;
      const entry = data as { id?: unknown; name?: unknown };
      const words = typeof entry.name === 'string' ? entry.name.trim().split(/\s+/) : [];
      return { ...data, lineId: entry.id, familyName: words.at(-1) ?? 'Family', familyReputation: 50 };
    },
  },
  {
    from: 3,
    description:
      'W1: the funeral. A life archived before W1 has no funeral on record (null): the people who would have spoken ' +
      'or stayed away are no longer known, so none is invented.',
    migrate: (data) => (typeof data === 'object' && data !== null && !Array.isArray(data) ? { ...data, funeral: null } : data),
  },
  {
    from: 4,
    description:
      'L1: the life review. A life archived before L1 has no review on record (null): its regrets and proud moments ' +
      'would be built from a life that is no longer there, so none is invented. Its funeral has no account of the last days.',
    migrate: (data) => (typeof data === 'object' && data !== null && !Array.isArray(data) ? { ...data, review: null } : data),
  },
];

const text = z.string().min(1);
const guestSchema = z.strictObject({ name: text, relation: text, reason: text });
const reviewLineSchema = z.strictObject({ id: text, text });
export const reviewSchema = z.strictObject({ regrets: z.array(reviewLineSchema), proud: z.array(reviewLineSchema) });
const lastDaysSchema = z.strictObject({
  foreseen: z.boolean(),
  hospice: z.enum(['hospice', 'home', 'hospital']).nullable(),
  service: z.enum(['traditional', 'simple', 'celebration', 'private']).nullable(),
  lines: z.array(text),
  bedside: z.array(guestSchema),
});
export const funeralSchema = z.strictObject({
  eulogy: z
    .strictObject({
      speakerName: text,
      relation: text,
      group: eulogyGroupSchema,
      tone: eulogyToneSchema,
      paragraphs: z.array(text).min(1),
      pieces: z.array(text),
    })
    .nullable(),
  notAttending: z.array(guestSchema),
  moreNotAttending: z.int().min(0),
  couldNotAttend: z.array(guestSchema),
  lastDays: lastDaysSchema.nullable().exactOptional(),
});

export const archivedLifeSchema: z.ZodType<ArchivedLife> = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  pronouns: pronounsSchema,
  birthYear: z.int(),
  deathYear: z.int(),
  ageAtDeath: z.int().min(0),
  causeOfDeath: z.string().min(1).nullable(),
  unfinished: z.boolean(),
  cityId: z.string().min(1),
  birthCityId: z.string().min(1),
  obituary: z.string().min(1),
  funeral: funeralSchema.nullable(),
  review: reviewSchema.nullable(),
  highlights: z.array(historyEntrySchema),
  finalNetWorth: z.int().refine(Number.isSafeInteger, 'must be a safe integer'),
  finalStats: statsSchema,
  seed: z.string().min(1),
  generation: z.int().min(1),
  parentLifeId: z.string().min(1).exactOptional(),
  lineId: z.string().min(1),
  familyName: z.string().min(1),
  familyReputation: z.int().min(0).max(100),
  heirName: z.string().min(1).exactOptional(),
});

export interface ArchiveListing {
  /** Valid entries, most recently archived first. */
  lives: ArchivedLife[];
  /** Entries that failed validation; they are kept in the database, just not shown. */
  damaged: number;
}

export function makeArchiveEnvelope(entry: ArchivedLife, contentVersion: string, now?: Date): SaveEnvelope<ArchivedLife> {
  return { ...makeEnvelope(entry, contentVersion, now), schemaVersion: ARCHIVE_SCHEMA_VERSION };
}

function decodeEntry(raw: unknown): SaveEnvelope<ArchivedLife> {
  const envelope = migrateEnvelope(envelopeSchema.parse(raw), archiveMigrations, ARCHIVE_SCHEMA_VERSION);
  return { ...envelope, data: archivedLifeSchema.parse(envelope.data) };
}

/**
 * Moves a life into the archive in one transaction: writes the entry and
 * removes the active life and its backups, so the archived life can never be
 * loaded again as active. With `next`, that life becomes the active one
 * (starting a new life over one in progress).
 */
export async function archiveLife(
  db: WiplifeDb,
  entry: SaveEnvelope<ArchivedLife>,
  next?: SaveEnvelope,
): Promise<void> {
  archivedLifeSchema.parse(entry.data);
  await db.transaction('rw', [db.archive, db.lives, db.backups], async () => {
    await db.archive.put({ id: entry.data.id, envelope: entry });
    await db.lives.clear();
    await db.backups.clear();
    if (next) await writeSaveIn(db, next);
  });
}

/** Every archived life, validated, most recently archived first. */
export async function listArchive(db: WiplifeDb): Promise<ArchiveListing> {
  const rows = await db.archive.toArray();
  const valid: SaveEnvelope<ArchivedLife>[] = [];
  let damaged = 0;
  for (const row of rows) {
    try {
      valid.push(decodeEntry(row.envelope));
    } catch {
      damaged++;
    }
  }
  valid.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
  return { lives: valid.map((e) => e.data), damaged };
}

/** One archived life, or null if it is missing or damaged. */
export async function readArchivedLife(db: WiplifeDb, id: string): Promise<ArchivedLife | null> {
  const row = await db.archive.get(id);
  if (!row) return null;
  try {
    return decodeEntry(row.envelope).data;
  } catch {
    return null;
  }
}
