/**
 * Asks the browser to keep this site's data even when storage runs low, so
 * saved lives are not cleared automatically. Returns whether it was granted.
 * Browsers may decide silently (Chrome) or never grant it (some Safari
 * versions); the game works either way.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
