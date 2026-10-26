import { z } from 'zod';
import { emptySetup, teamSetupSchema } from '../engine/sports/setup';
import type { WiplifeDb } from './db';

export const themeSchema = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof themeSchema>;

export const settingsSchema = z.object({
  ageConfirmed: z.boolean(),
  theme: themeSchema,
  persistRequested: z.boolean(),
  installPromptShown: z.boolean(),
  /** Batch 6: the player's changes to the world of teams (renamed, moved and added teams), copied into every new life. */
  teams: teamSetupSchema,
  /** G1: god mode is on (the Edit buttons show). Read by the screens only; the engine never sees it. */
  godMode: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  ageConfirmed: false,
  theme: 'system',
  persistRequested: false,
  installPromptShown: false,
  teams: emptySetup(),
  godMode: false,
};

/** The version of the settings row (Batch 6, then G1). A row without one is version 1: it has no teams. Version 2 has no god mode switch. */
export const SETTINGS_VERSION = 3;

/**
 * Brings a stored settings row up to the current version: version 1 (a row from before the teams setting) gains an empty set of
 * team changes, and version 2 (before god mode) gains the switch, off. A row from a newer version is left as it is (fields this
 * version does not know are ignored).
 */
export function migrateSettings(stored: unknown): Record<string, unknown> {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
  const row = { ...(stored as Record<string, unknown>) };
  const version = typeof row.version === 'number' ? row.version : 1;
  if (version < 2) {
    row.teams = emptySetup();
    row.version = 2;
  }
  if (version < 3) {
    row.godMode = false;
    row.version = 3;
  }
  return row;
}

const SETTINGS_KEY = 'app';

/**
 * Reads settings, falling back to the default for any field that is missing
 * or invalid, so a damaged settings row never blocks the game from starting.
 */
export async function loadSettings(db: WiplifeDb): Promise<Settings> {
  const row = await db.settings.get(SETTINGS_KEY);
  const stored: unknown = row?.value;
  const result: Settings = { ...DEFAULT_SETTINGS, teams: emptySetup() };
  if (typeof stored !== 'object' || stored === null) return result;
  const record = migrateSettings(stored);
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
    await db.settings.put({ key: SETTINGS_KEY, value: { ...next, version: SETTINGS_VERSION } });
    return next;
  });
}
