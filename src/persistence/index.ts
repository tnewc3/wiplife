import { createDb } from './db';

export {
  ARCHIVE_SCHEMA_VERSION,
  archiveLife,
  archiveMigrations,
  archivedLifeSchema,
  listArchive,
  makeArchiveEnvelope,
  readArchivedLife,
  type ArchiveListing,
} from './archive';
export { createDb, DB_NAME, type WiplifeDb } from './db';
export { CURRENT_SCHEMA_VERSION, envelopeSchema, makeEnvelope, type SaveEnvelope } from './envelope';
export { assertMigrationChain, migrateEnvelope, MigrationError, migrations, type Migration } from './migrations';
export { lifeStateSchema, loadedLifeSchema } from './lifeSchema';
export { clearAllData } from './reset';
export { requestPersistentStorage } from './storage';
export { readSave, writeSave, type LoadResult } from './saves';
export {
  DEFAULT_SETTINGS,
  loadSettings,
  settingsSchema,
  themeSchema,
  updateSettings,
  type Settings,
  type Theme,
} from './settings';

/** The app's database. Tests create their own with createDb(). */
export const db = createDb();
