import Dexie, { type EntityTable } from 'dexie';

/** Portrait thumbnails (P1) live in a database of their own: they are a cache, and losing them loses nothing. */
export const THUMBNAIL_DB_NAME = 'wiplife-portraits';

export interface ThumbnailRow {
  /** `${asset revision}:${size}:${hash of the rendered settings}`. */
  key: string;
  blob: Blob;
  /** The last time it was used (a timestamp the caller passes in), for dropping the least recently used. */
  usedAt: number;
}

export type ThumbnailDb = Dexie & { thumbnails: EntityTable<ThumbnailRow, 'key'> };

export function createThumbnailDb(name: string = THUMBNAIL_DB_NAME): ThumbnailDb {
  const db = new Dexie(name) as ThumbnailDb;
  db.version(1).stores({ thumbnails: 'key, usedAt' });
  return db;
}

/** The cache key for a thumbnail: the same settings at the same size and asset revision always share a row. */
export function thumbnailKey(revision: number, size: number, hash: string): string {
  return `${revision}:${size}:${hash}`;
}

/** Reads and writes thumbnails. Every call resolves quietly when storage is unavailable: a missing cache only means drawing again. */
export class ThumbnailStore {
  constructor(
    private readonly db: ThumbnailDb,
    private readonly revision: number,
    private readonly maxRows: number,
  ) {}

  async get(key: string, now: number): Promise<Blob | null> {
    try {
      const row = await this.db.thumbnails.get(key);
      if (!row) return null;
      void this.db.thumbnails.update(key, { usedAt: now }).catch(() => undefined);
      return row.blob;
    } catch {
      return null;
    }
  }

  async put(key: string, blob: Blob, now: number): Promise<void> {
    try {
      await this.db.thumbnails.put({ key, blob, usedAt: now });
      const extra = (await this.db.thumbnails.count()) - this.maxRows;
      if (extra > 0) {
        const oldest = await this.db.thumbnails.orderBy('usedAt').limit(extra).primaryKeys();
        await this.db.thumbnails.bulkDelete(oldest);
      }
    } catch {
      // A full or blocked database only costs a redraw.
    }
  }

  /** Drops thumbnails drawn from an older version of the art. */
  async dropStale(): Promise<void> {
    try {
      const prefix = `${this.revision}:`;
      const stale = (await this.db.thumbnails.toCollection().primaryKeys()).filter((k) => !k.startsWith(prefix));
      if (stale.length > 0) await this.db.thumbnails.bulkDelete(stale);
    } catch {
      // See get().
    }
  }

  async clear(): Promise<void> {
    try {
      await this.db.thumbnails.clear();
    } catch {
      // See get().
    }
  }
}
