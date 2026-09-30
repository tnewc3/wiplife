import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { content } from '../content';
import type { ContentBundle } from '../content/schemas';
import { assertInvariants } from '../engine/invariants';
import { createLife, type CustomLifeInput } from '../engine/life';
import type { LifeState } from '../engine/types';
import {
  clearAllData,
  db as defaultDb,
  DEFAULT_SETTINGS,
  loadedLifeSchema,
  loadSettings,
  makeEnvelope,
  readSave,
  requestPersistentStorage,
  updateSettings,
  writeSave,
  type Settings,
  type Theme,
  type WiplifeDb,
} from '../persistence';

/** Top-level screens. The age gate is not a screen: it shows until confirmed. */
export type ScreenId = 'title' | 'newLife' | 'custom' | 'game' | 'settings';

/** Bottom navigation tabs (docs/design.md, section K). */
export type TabId = 'life' | 'people' | 'work' | 'money' | 'more';

/** What loading the saved life found at startup. */
export type SavedLifeStatus = 'none' | 'ok' | 'recovered' | 'corrupt';

export interface AppState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  settings: Settings;
  screen: ScreenId;
  /** Where Settings returns to when closed. */
  settingsReturnTo: Exclude<ScreenId, 'settings'>;
  tab: TabId;
  /** The active life, if any. */
  life: LifeState | null;
  savedLifeStatus: SavedLifeStatus;
  /** True while a new life is being created and saved. */
  creating: boolean;

  init: () => Promise<void>;
  confirmAge: () => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
  resetAllData: () => Promise<void>;
  navigate: (screen: Exclude<ScreenId, 'settings'>) => void;
  openSettings: () => void;
  closeSettings: () => void;
  setTab: (tab: TabId) => void;
  /** Starts a random life in one step. Ignored while another start is running. */
  startRandomLife: () => Promise<void>;
  /** Starts a custom life. Throws InvalidInputError for bad input. */
  startCustomLife: (custom: CustomLifeInput) => Promise<void>;
  continueLife: () => void;
}

export interface StoreOptions {
  db?: WiplifeDb;
  content?: ContentBundle;
  /** Source of new life seeds. */
  makeSeed?: () => string;
  /** The current calendar year; a new character is born this year. */
  currentYear?: () => number;
  /** Runs assertInvariants after every engine call (on in development and tests). */
  checkInvariants?: boolean;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function randomSeed(): string {
  const words = crypto.getRandomValues(new Uint32Array(2));
  return Array.from(words, (w) => w.toString(16).padStart(8, '0')).join('');
}

export function createAppStore({
  db = defaultDb,
  content: bundle = content,
  makeSeed = randomSeed,
  currentYear = () => new Date().getFullYear(),
  checkInvariants = import.meta.env.DEV,
}: StoreOptions = {}) {
  return create<AppState>()(
    immer((set, get) => {
      /** Autosave: every engine result is saved before the UI moves on. */
      const commit = async (life: LifeState) => {
        if (checkInvariants) assertInvariants(life, bundle);
        await writeSave(db, makeEnvelope(life, bundle.contentVersion));
        set((s) => {
          s.life = life;
          s.savedLifeStatus = 'ok';
        });
      };

      /** Asks the browser to keep saves once, when the first life starts. */
      const requestPersistenceOnce = async () => {
        if (get().settings.persistRequested) return;
        await requestPersistentStorage();
        const settings = await updateSettings(db, { persistRequested: true });
        set((s) => {
          s.settings = settings;
        });
      };

      const start = async (build: () => LifeState) => {
        if (get().creating) return;
        set((s) => {
          s.creating = true;
        });
        try {
          await commit(build());
          set((s) => {
            s.screen = 'game';
            s.tab = 'life';
          });
          void requestPersistenceOnce().catch(() => undefined);
        } finally {
          set((s) => {
            s.creating = false;
          });
        }
      };

      return {
        status: 'loading',
        error: null,
        settings: { ...DEFAULT_SETTINGS },
        screen: 'title',
        settingsReturnTo: 'title',
        tab: 'life',
        life: null,
        savedLifeStatus: 'none',
        creating: false,

        init: async () => {
          try {
            const settings = await loadSettings(db);
            const saved = await readSave(db, loadedLifeSchema(bundle));
            set((s) => {
              s.settings = settings;
              s.savedLifeStatus = saved.status;
              s.life = saved.status === 'ok' || saved.status === 'recovered' ? saved.envelope.data : null;
              s.status = 'ready';
            });
            // Save the restored life as the active one, so the damaged save is
            // not loaded (and the notice not shown) again on the next launch.
            if (saved.status === 'recovered') {
              await writeSave(db, makeEnvelope(saved.envelope.data, bundle.contentVersion)).catch(() => undefined);
            }
          } catch (err) {
            set((s) => {
              s.status = 'error';
              s.error = message(err);
            });
          }
        },

        confirmAge: async () => {
          const settings = await updateSettings(db, { ageConfirmed: true });
          set((s) => {
            s.settings = settings;
          });
        },

        setTheme: async (theme) => {
          // Apply only once saved, so the screen never shows a setting that
          // would be lost on reload. A local write takes milliseconds.
          const settings = await updateSettings(db, { theme });
          set((s) => {
            s.settings = settings;
          });
        },

        resetAllData: async () => {
          await clearAllData(db);
          set((s) => {
            s.settings = { ...DEFAULT_SETTINGS };
            s.life = null;
            s.savedLifeStatus = 'none';
            s.screen = 'title';
            s.settingsReturnTo = 'title';
            s.tab = 'life';
          });
        },

        navigate: (screen) =>
          set((s) => {
            s.screen = screen;
          }),

        openSettings: () =>
          set((s) => {
            if (s.screen !== 'settings') s.settingsReturnTo = s.screen;
            s.screen = 'settings';
          }),

        closeSettings: () =>
          set((s) => {
            s.screen = s.settingsReturnTo;
          }),

        setTab: (tab) =>
          set((s) => {
            s.tab = tab;
          }),

        startRandomLife: () =>
          start(() => createLife({ mode: 'random', seed: makeSeed(), birthYear: currentYear() }, bundle)),

        startCustomLife: (custom) =>
          start(() => createLife({ mode: 'custom', seed: makeSeed(), birthYear: currentYear(), custom }, bundle)),

        continueLife: () =>
          set((s) => {
            if (!s.life) return;
            s.screen = 'game';
            s.tab = 'life';
          }),
      };
    }),
  );
}

export const useAppStore = createAppStore();
