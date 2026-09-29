import { z } from 'zod';
import type { WiplifeDb } from './db';

export const themeSchema = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof themeSchema>;

export const settingsSchema = z.object({
  ageConfirmed: z.boolean(),
  theme: themeSchema,
  persistRequested: z.boolean(),
  installPromptShown: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  ageConfirmed: false,
  theme: 'system',
  persistRequested: false,
  installPromptShown: false,
};

const SETTINGS_KEY = 'app';

/**
 * Reads settings, falling back to the default for any field that is missing
 * or invalid, so a damaged settings row never blocks the game from starting.
 */
export async function loadSettings(db: WiplifeDb): Promise<Settings> {
  const row = await db.settings.get(SETTINGS_KEY);
  const stored: unknown = row?.value;
  const result: Settings = { ...DEFAULT_SETTINGS };
  if (typeof stored !== 'object' || stored === null) return result;
  const record = stored as Record<string, unknown>;
  const shape = settingsSchema.shape;
  for (const key of Object.keys(shape) as (keyof Settings)[]) {
    const parsed = shape[key].safeParse(record[key]);
    if (parsed.success) Object.assign(result, { [key]: parsed.data });
  }
  return result;
}

/** Merges a change into the stored settings and returns the new settings. */
export async function updateSettings(db: WiplifeDb, patch: Partial<Settings>): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const next = settingsSchema.parse({ ...(await loadSettings(db)), ...patch });
    await db.settings.put({ key: SETTINGS_KEY, value: next });
    return next;
  });
}
