import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  clearAllData,
  db as defaultDb,
  DEFAULT_SETTINGS,
  loadSettings,
  updateSettings,
  type Settings,
  type Theme,
  type WiplifeDb,
} from '../persistence';

/** Top-level screens. The age gate is not a screen: it shows until confirmed. */
export type ScreenId = 'title' | 'newLife' | 'settings' | 'shell';

/** Bottom navigation tabs (docs/design.md, section K). */
export type TabId = 'life' | 'people' | 'work' | 'money' | 'more';

export interface AppState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  settings: Settings;
  screen: ScreenId;
  /** Where Settings returns to when closed. */
  settingsReturnTo: Exclude<ScreenId, 'settings'>;
  tab: TabId;

  init: () => Promise<void>;
  confirmAge: () => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
  resetAllData: () => Promise<void>;
  navigate: (screen: Exclude<ScreenId, 'settings'>) => void;
  openSettings: () => void;
  closeSettings: () => void;
  setTab: (tab: TabId) => void;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createAppStore(db: WiplifeDb = defaultDb) {
  return create<AppState>()(
    immer((set, get) => ({
      status: 'loading',
      error: null,
      settings: { ...DEFAULT_SETTINGS },
      screen: 'title',
      settingsReturnTo: 'title',
      tab: 'life',

      init: async () => {
        try {
          const settings = await loadSettings(db);
          set((s) => {
            s.settings = settings;
            s.status = 'ready';
          });
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
        // Apply immediately so the switch feels instant; the write follows.
        const previous = get().settings.theme;
        set((s) => {
          s.settings.theme = theme;
        });
        try {
          const settings = await updateSettings(db, { theme });
          set((s) => {
            s.settings = settings;
          });
        } catch (err) {
          set((s) => {
            s.settings.theme = previous;
          });
          throw err;
        }
      },

      resetAllData: async () => {
        await clearAllData(db);
        set((s) => {
          s.settings = { ...DEFAULT_SETTINGS };
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
    })),
  );
}

export const useAppStore = createAppStore();
