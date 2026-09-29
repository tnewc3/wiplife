import type { WiplifeDb } from './db';

/** Deletes every life, backup, archive entry and setting on this device. */
export async function clearAllData(db: WiplifeDb): Promise<void> {
  await db.transaction('rw', [db.lives, db.backups, db.archive, db.settings], async () => {
    await Promise.all([db.lives.clear(), db.backups.clear(), db.archive.clear(), db.settings.clear()]);
  });
}
