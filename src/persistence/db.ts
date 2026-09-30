import Dexie, { type EntityTable } from 'dexie';
import type { SaveEnvelope } from './envelope';
import type { Settings } from './settings';

export const DB_NAME = 'wiplife';

/** The active life. There is only ever one row. */
export interface LifeRow {
  id: string;
  envelope: SaveEnvelope;
}

/** A previous autosave of the active life; the newest two are kept. */
export interface BackupRow {
  seq?: number;
  envelope: SaveEnvelope;
}

/** A finished (or unfinished, replaced) life: an ArchivedLife in its own envelope (see archive.ts). */
export interface ArchiveRow {
  id: string;
  envelope: SaveEnvelope;
}

export interface SettingsRow {
  key: string;
  value: Settings;
}

export type WiplifeDb = Dexie & {
  lives: EntityTable<LifeRow, 'id'>;
  backups: EntityTable<BackupRow, 'seq'>;
  archive: EntityTable<ArchiveRow, 'id'>;
  settings: EntityTable<SettingsRow, 'key'>;
};

/**
 * Opens the WIPlife database. Dexie versions describe the IndexedDB table
 * layout only; the shape of saved game data is versioned separately by the
 * save envelope's schemaVersion (see migrations.ts).
 */
export function createDb(name: string = DB_NAME): WiplifeDb {
  const db = new Dexie(name) as WiplifeDb;
  db.version(1).stores({
    lives: 'id',
    backups: '++seq',
    archive: 'id',
    settings: 'key',
  });
  return db;
}
