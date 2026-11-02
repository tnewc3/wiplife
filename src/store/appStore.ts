import { trainingLines, type TrainingLine } from '../engine/selectors';
import { trainingKind } from '../engine/hub/training';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { content } from '../content';
import { COUNTRY_IDS, type ActionId, type ContentBundle, type CountryId, type GiftTier } from '../content/schemas';
import { finishAction, performAction, type LifeActionId, type LifeActionParams } from '../engine/actions';
import type { IdentityEditInput } from '../engine/discovery';
import { ageBounds, checkEdit, EditRefusedError, performEdit, refusal, type AgeBounds, type EditResult } from '../engine/godmode';
import { archiveEntry } from '../engine/archive';
import { continueAsHeir, heirCandidates } from '../engine/estate/heir';
import { getDeathView, type DeathView } from '../engine/estate/views';
import { spendTimeWithEveryone, type GroupTimeRow } from '../engine/interactions/group';
import { closeInteraction, performInteraction, resolveInteractionChoice } from '../engine/interactions/perform';
import { assertInvariants } from '../engine/invariants';
import { beginYear, CONTINUE_CHOICE, createLife, endYear, resolveChoice, type CustomLifeInput } from '../engine/life';
import { canAgeUp, firstUnresolvedEvent, getYearRecap, type YearRecapView } from '../engine/selectors';
import type { ArchivedLife, LifeState } from '../engine/types';
import {
  archiveLife,
  clearAllData,
  db as defaultDb,
  DEFAULT_SETTINGS,
  listArchive,
  loadedLifeSchema,
  loadSettings,
  makeArchiveEnvelope,
  makeEnvelope,
  readSave,
  requestPersistentStorage,
  updateSettings,
  writeSave,
  type ArchiveListing,
  type Settings,
  type Theme,
  type WiplifeDb,
} from '../persistence';
import { moneyDisplayOf } from '../engine/country';
import { isEmptySetup, parseTeamSetup, usableSetup, type TeamSetup } from '../engine/sports/setup';
import { BASE_MONEY_DISPLAY, setMoneyDisplay } from './moneyDisplay';

/** Top-level screens. The age gate is not a screen: it shows until confirmed. */
export type ScreenId =
  | 'title'
  | 'newLife'
  | 'custom'
  | 'game'
  | 'lifeHistory'
  | 'funeral'
  | 'death'
  | 'archive'
  | 'archivedLife'
  | 'settings'
  | 'godEditor';

/** Bottom navigation tabs (docs/design.md, section K). */
/** U2: which part of the Groups page is open. */
export type GroupsFocus = 'club' | 'service' | 'civic' | 'faith' | 'faith_explore';

/** U2: the in-screen tabs of the Assets tab. */
export type AssetsSection = 'money' | 'home' | 'things';

export type TabId = 'home' | 'work' | 'assets' | 'people' | 'activities';

/**
 * The event sheet: which pending event card is showing, then (after a year
 * with events) the recap as the last card. UI state only; the events
 * themselves are in the saved life.
 */
export interface EventSheetState {
  index: number;
  /** Set once the year has ended: the sheet shows the recap. */
  recap: YearRecapView | null;
}

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
  /** True while the engine is working (a year advancing, a choice resolving); further taps are ignored. */
  aging: boolean;
  /** Open while the year's events (and then its recap) are showing. */
  eventSheet: EventSheetState | null;
  /** C2: the short card after a practice, training session, rehearsal, study session or gym visit (null when none is showing). */
  training: { kind: 'practice' | 'rehearsal' | 'training' | 'study' | 'gym'; lines: TrainingLine[] } | null;
  /** The archive entry of the life that just ended, for the Death screen. */
  lastDeath: ArchivedLife | null;
  /**
   * E2b: the life that just ended while it has living children who could carry on. It is
   * kept saved (not yet in the archive) until the player chooses an heir or leaves the Death screen.
   */
  deadLife: LifeState | null;
  /** E2b: how the estate of the life that just ended was settled, and who could carry on, for the Death screen. */
  deathView: DeathView | null;
  /** The archive, loaded when the Archive screen opens. */
  archive: ArchiveListing | null;
  /** The archived life open on the Archived life screen. */
  archiveSelection: string | null;
  /** The person open on the People tab, if any (E5: or a pet, by its possession id). */
  personId: string | null;
  /** U1: a page open over the current tab (Assets → Properties, Profile → Health, Activities → Social media...), if any; Back returns to the tab. */
  moreView: 'home' | 'health' | 'family' | 'will' | 'belongings' | 'teen' | 'later' | 'groups' | 'travel' | 'migration' | 'social' | null;
  /** U2: the part of the Groups page that is open: the clubs, the causes, the civic groups, your faith, or other faiths to explore (Activities → Groups and Faith). */
  groupsFocus: GroupsFocus;
  /** U2: the in-screen tab of the Assets tab that is open (it survives a page opened over it). */
  assetsSection: AssetsSection;
  /** U2: the category of the Activities hub that is open (an id of registries/activities.yaml), if any; Back returns to the list of categories. */
  activityCategory: string | null;
  /** G1: who the god mode editor is open on: 'self' or a person's id. */
  editorTarget: string | null;
  /** E1: the Interact sheet open on a person's page: the grouped menu, or the gift price tiers. */
  /** The Interact sheet: the menu, a gift's price tiers, or (E4) the picker for an interaction that needs another person or a story first. */
  /** U1: what "Spend time with everyone" just did, one row per person, until the player closes it. */
  groupTime: GroupTimeRow[] | null;
  interactSheet: { personId: string; view: 'menu' | 'gift' | 'pick'; /** The interaction a picker is for. */ pick?: string } | null;
  /** A1: the activity of the Activities tab whose sheet of options is open (an id of registries/activities.yaml). */
  activitySheet: string | null;
  /** A1: a model is connected (X1), so "Do your own thing" shows on the Activities tab. Nothing connects one yet. */
  modelConnected: boolean;

  init: () => Promise<void>;
  confirmAge: () => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
  /** G1: the god mode switch in Settings. The engine never sees it; it only shows or hides the Edit buttons. */
  setGodMode: (on: boolean) => Promise<void>;
  /** G1: opens the god mode editor on you ('self') or a person; ignored unless the switch is on and the life is between years. */
  openEditor: (target: string) => void;
  closeEditor: () => void;
  /** G1: whether an edit would pass the gate, the payload schema and the content rules. Changes nothing. */
  previewEdit: (payload: unknown) => EditResult;
  /** G1: whose age can be edited, and between which birth years. */
  ageBoundsOf: (personId: string) => AgeBounds | null;
  /**
   * G1: makes an edit to the active life: every check, then the save schema pass, then commit and save. Resolves with the
   * refusals (nothing changed, nothing saved) rather than throwing.
   */
  editLife: (payload: unknown) => Promise<EditResult>;
  /** Batch 6: saves the player's team settings (renamed, moved and added teams) for every new life. Throws SetupError for input that fails the checks. */
  saveTeams: (setup: TeamSetup) => Promise<void>;
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
  /**
   * Resolves one pending event with the player's choice and autosaves. The
   * card then shows the outcome. Ignored while the engine is working.
   */
  chooseEvent: (instanceId: string, choiceId: string) => Promise<void>;
  /**
   * Moves the event sheet on: to the next event, then (once every event is
   * resolved) ends the year and shows the recap, then closes the sheet. A
   * death ends the life and opens the Death screen instead of the recap.
   */
  continueEvents: () => Promise<void>;
  /**
   * Advances one year: begins it, and (with no events pending) ends it.
   * Autosaves after each step. A death moves the life into the archive and
   * opens the Death screen. Ignored while a year is already advancing.
   */
  ageUp: () => Promise<void>;
  openLifeHistory: () => void;
  closeLifeHistory: () => void;
  /** Loads the archive and opens the Archive screen. */
  openArchive: () => Promise<void>;
  openArchivedLife: (id: string) => void;
  /** Opens a person's page on the People tab. */
  openPerson: (id: string) => void;
  /** E5: opens a pet's page on the People tab. */
  openPet: (id: string) => void;
  /** Back from a person's page to the People list. */
  closePerson: () => void;
  /**
   * Takes a management action with a person (between years) and opens its
   * result event in the event sheet; Continue after the outcome returns to
   * the person's page. Ignored while the engine is working.
   */
  takeAction: (actionId: ActionId, personId: string) => Promise<void>;
  /**
   * Takes a money, home, school or work action (lifestyle, gig work, paying a
   * debt, moving, buying or selling a home, applying to school or for a job,
   * asking for a raise, quitting, retiring) between years and autosaves. An
   * action that answers with an event (a job application, a raise request)
   * opens it in the event sheet. Ignored while the engine is working or
   * outside 'yearStart'.
   */
  takeLifeAction: (actionId: LifeActionId, params?: LifeActionParams) => Promise<void>;
  /** U1: Activities → Plan a trip. */
  openTravel: () => void;
  /** U1: Activities → Move abroad and citizenship. */
  openMigration: () => void;
  /** U1: Assets → Properties (your housing). */
  openHome: () => void;
  /** Back from a page opened over a tab to that tab. */
  closeHome: () => void;
  /** U1: Profile → Health (Stage 9). */
  openHealth: () => void;
  /** U1: People → Family planning (E2a). */
  openFamily: () => void;
  /** U1: Assets → Your will (E2b). */
  openWill: () => void;
  /** U1: Profile → Later life (L1). */
  openLater: () => void;
  /** U2: Activities → Groups or Faith (W2, moved from People): opens the Groups page on the part named. */
  openGroups: (focus: GroupsFocus) => void;
  /** U2: opens a category of the Activities hub, or (null) goes back to the list. */
  openActivityCategory: (id: string | null) => void;
  /** U2: switches the in-screen tab of the Assets tab. */
  setAssetsSection: (section: AssetsSection) => void;
  /** U2: opens or closes a collapsible group, and remembers it (settings.openGroups). */
  setGroupOpen: (id: string, open: boolean) => Promise<void>;
  /** Batch 8: opens the Social screen (Activities, and Job for creators). */
  openSocial: () => void;
  /** U1: Assets → Possessions (E5). */
  openBelongings: () => void;
  /** U1: Activities → Teen years (T1). */
  openTeen: () => void;
  /**
   * E2b: continues as one of the dead life's children (any age) and archives the dead life in the
   * same step. Ignored while the engine is working or when no life is waiting for an heir.
   */
  chooseHeir: (heirId: string) => Promise<void>;
  /** E2b: leaves the Death screen; a life still waiting for an heir goes into the archive first. */
  leaveDeath: (to: 'newLife' | 'archive' | 'title') => Promise<void>;
  /** W1: leaves the funeral for the Death screen (the obituary, the estate and who carries on). */
  continueFromFuneral: () => void;
  /** E1: opens the Interact sheet for a person. */
  openInteractions: (personId: string) => void;
  /** E1: from the Interact sheet to the gift price tiers, and back. */
  setInteractView: (view: 'menu' | 'gift' | 'pick', pick?: string) => void;
  closeInteractions: () => void;
  /** A1: opens the sheet of an activity of the Activities tab, and closes it. */
  openActivity: (activityId: string) => void;
  closeActivity: () => void;
  /** C2: dismisses the training card (a tap skips it). */
  closeTraining: () => void;
  /** E5: opens the Interact sheet for a pet. */
  openPetInteractions: (petId: string) => void;
  /** E5: spends time with a pet (between years) and autosaves; the outcome card opens like any interaction's. */
  interactPet: (interactionId: string, petId: string) => Promise<void>;
  /**
   * E1: does an interaction with a person (between years) and autosaves. The
   * outcome card then shows from the saved life, so it is still there after a
   * reload. Ignored while the engine is working.
   */
  /** `extra`: who to introduce them to, or which story the interaction is about (E4). */
  /** U1: the People tab's group interaction; opens the results. Ignored unless between years with nothing else open. */
  spendTimeWithEveryone: () => Promise<void>;
  closeGroupTime: () => void;
  interact: (interactionId: string, personId: string, giftTier?: GiftTier, extra?: { otherId?: string; itemId?: string }) => Promise<void>;
  /** E1: answers the choice an outcome card opened (walk away, keep going) and autosaves. */
  chooseInteractionOption: (choiceId: string) => Promise<void>;
  /** E1: closes the outcome card and autosaves. */
  dismissInteraction: () => Promise<void>;
  /**
   * Edits your identity from the Profile sheet (between years) and autosaves.
   * Throws InvalidInputError for an edit that isn't valid. Ignored while the
   * engine is working.
   */
  editIdentity: (edit: IdentityEditInput) => Promise<void>;
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

const TEST_SEED = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * End-to-end test builds only (VITE_TEST_HOOKS=true): `?seed=abc` in the URL
 * makes the next new life use that seed. The parameter is removed once used,
 * so a reload can't start a second life with the same seed. In normal builds
 * this check is compiled away and every seed is random.
 */
function testHookSeed(): string {
  if (import.meta.env.VITE_TEST_HOOKS === 'true') {
    const url = new URL(window.location.href);
    const seed = url.searchParams.get('seed');
    const country = url.searchParams.get('country');
    if (country !== null) {
      url.searchParams.delete('country');
      if (COUNTRY_IDS.includes(country as CountryId)) testCountry = country as CountryId;
    }
    if (seed !== null) {
      url.searchParams.delete('seed');
      window.history.replaceState(window.history.state, '', url);
      // A seeded test life is a US life unless ?country= says otherwise (a random start would pick any country).
      if (TEST_SEED.test(seed)) {
        testCountry ??= 'us';
        return seed;
      }
    }
  }
  return randomSeed();
}

/** The country a seeded test life starts in (test builds only; left unset, a random life picks one by the start weights). */
let testCountry: CountryId | undefined;

export function createAppStore({
  db = defaultDb,
  content: bundle = content,
  makeSeed = testHookSeed,
  currentYear = () => new Date().getFullYear(),
  checkInvariants = import.meta.env.DEV,
}: StoreOptions = {}) {
  const store = create<AppState>()(
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

      /**
       * Moves the active life into the archive (finished if dead, unfinished
       * otherwise) in the same transaction that saves `next` as the new
       * active life, if given.
       */
      const archive = async (life: LifeState, next?: LifeState, heirName?: string): Promise<ArchivedLife> => {
        if (checkInvariants) {
          assertInvariants(life, bundle);
          if (next) assertInvariants(next, bundle);
        }
        const entry = archiveEntry(life, bundle, heirName);
        await archiveLife(
          db,
          makeArchiveEnvelope(entry, bundle.contentVersion),
          next && makeEnvelope(next, bundle.contentVersion),
        );
        set((s) => {
          s.archive = null;
        });
        return entry;
      };

      /**
       * A dead life goes into the archive and the Death screen shows its entry, or (E2b), when it
       * has living children who could carry on, it stays saved until an heir is chosen.
       */
      const endLife = async (dead: LifeState) => {
        if (heirCandidates(dead).length > 0) {
          if (checkInvariants) assertInvariants(dead, bundle);
          await writeSave(db, makeEnvelope(dead, bundle.contentVersion));
          set((s) => {
            s.life = null;
            s.deadLife = dead;
            s.savedLifeStatus = 'none';
            s.lastDeath = archiveEntry(dead, bundle);
            s.deathView = getDeathView(dead, bundle);
            s.screen = 'funeral';
            s.eventSheet = null;
          });
          return;
        }
        const entry = await archive(dead);
        set((s) => {
          s.life = null;
          s.deadLife = null;
          s.savedLifeStatus = 'none';
          s.lastDeath = entry;
          s.deathView = getDeathView(dead, bundle);
          s.screen = 'funeral';
        });
      };

      /** Ends a year whose events are all resolved. Returns the new life, or null if it ended. */
      const finishYear = async (life: LifeState): Promise<LifeState | null> => {
        const next = endYear(life, bundle);
        if (next.phase === 'dead') {
          await endLife(next);
          return null;
        }
        await commit(next);
        return next;
      };

      /** Runs one engine step while blocking further taps. */
      const busy = async (work: () => Promise<void>) => {
        if (get().aging) return;
        set((s) => {
          s.aging = true;
        });
        try {
          await work();
        } finally {
          set((s) => {
            s.aging = false;
          });
        }
      };

      /**
       * Moves the sheet past the current (resolved) card: to the next event, or
       * once every event is resolved, ends the year and shows the recap (or,
       * after a death, the Death screen).
       */
      const advanceEvents = async () => {
        const { life, eventSheet } = get();
        if (!life || !eventSheet || eventSheet.recap) return;
        if (life.pending[eventSheet.index]?.resolvedChoiceId === undefined) return;
        const next = eventSheet.index + 1;
        if (next < life.pending.length) {
          set((s) => {
            s.eventSheet = { index: next, recap: null };
          });
          return;
        }
        // A management action's result: close it, no recap (the year goes on).
        if (life.phase === 'action') {
          await commit(finishAction(life));
          set((s) => {
            s.eventSheet = null;
          });
          return;
        }
        const ended = await finishYear(life);
        set((s) => {
          s.eventSheet = ended ? { index: next, recap: getYearRecap(ended, bundle) } : null;
        });
      };

      /** Opens the event sheet at the first event still waiting, if any. */
      const openEvents = (life: LifeState) => {
        const index = firstUnresolvedEvent(life);
        set((s) => {
          s.eventSheet = index === null ? null : { index, recap: null };
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

      // Batch 6: the player's team settings go into a new life (a snapshot: the life replays whatever the settings say later).
      const teamOption = (): { teamSetup?: TeamSetup } => {
        const setup = usableSetup(get().settings.teams, bundle);
        return isEmptySetup(setup) ? {} : { teamSetup: setup };
      };
      const start = async (build: () => LifeState) => {
        if (get().creating) return;
        set((s) => {
          s.creating = true;
        });
        try {
          const current = get().life;
          const life = build();
          if (current) {
            // Starting over never discards a life: it goes into the archive, unfinished.
            await archive(current, life);
            set((s) => {
              s.life = life;
              s.savedLifeStatus = 'ok';
            });
          } else {
            await commit(life);
          }
          set((s) => {
            s.screen = 'game';
            s.tab = 'home';
            s.eventSheet = null;
            s.personId = null;
            s.moreView = null;
            s.interactSheet = null;
            s.activitySheet = null;
            s.groupTime = null;
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
        tab: 'home',
        life: null,
        savedLifeStatus: 'none',
        creating: false,
        aging: false,
        eventSheet: null,
        training: null,
        lastDeath: null,
        deadLife: null,
        deathView: null,
        archive: null,
        archiveSelection: null,
        personId: null,
        editorTarget: null,
        moreView: null,
        groupsFocus: 'club',
        assetsSection: 'money',
        activityCategory: null,
        interactSheet: null,
        activitySheet: null,
        modelConnected: false,
        groupTime: null,

        init: async () => {
          let loaded: SavedLifeStatus;
          try {
            const settings = await loadSettings(db);
            const saved = await readSave(db, loadedLifeSchema(bundle));
            loaded = saved.status;
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
            return;
          }

          // A save from the middle of a year finishes that year now (and an
          // action whose result was already chosen is closed); if that fails,
          // the loaded life is kept and the next Age Up tries again.
          const life = get().life;
          try {
            if (life?.phase === 'yearEnd') await finishYear(life);
            else if (life?.phase === 'dead') await endLife(life);
            else if (life?.phase === 'action' && firstUnresolvedEvent(life) === null) await commit(finishAction(life));
          } catch {
            // Keep the loaded life as it is.
          }
          // The title screen keeps reporting how the save loaded.
          if (get().life) {
            set((s) => {
              s.savedLifeStatus = loaded;
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

        setGodMode: async (on) => {
          const settings = await updateSettings(db, { godMode: on });
          set((s) => {
            s.settings = settings;
            // Turning it off hides every Edit button, and closes an editor that is open.
            if (!on && s.screen === 'godEditor') s.screen = 'game';
            if (!on) s.editorTarget = null;
          });
        },

        openEditor: (target) => {
          const { settings, life } = get();
          if (!settings.godMode || !life || life.phase !== 'yearStart' || get().eventSheet) return;
          if (target !== 'self' && !life.people[target]) return;
          set((s) => {
            s.editorTarget = target;
            s.screen = 'godEditor';
            s.interactSheet = null;
            s.activitySheet = null;
            s.groupTime = null;
          });
        },

        closeEditor: () =>
          set((s) => {
            s.editorTarget = null;
            s.screen = s.life ? 'game' : 'title';
          }),

        previewEdit: (payload) => {
          const life = get().life;
          return life ? checkEdit(life, payload, bundle) : { ok: false, refusals: [refusal('life_over', 'target')] };
        },

        ageBoundsOf: (personId) => {
          const life = get().life;
          return life?.people[personId] ? ageBounds(life, personId, bundle) : null;
        },

        editLife: async (payload) => {
          const life = get().life;
          if (!life) return { ok: false, refusals: [refusal('life_over', 'target')] };
          if (get().eventSheet || get().aging) return { ok: false, refusals: [refusal('card_open', 'target')] };
          let result: EditResult = { ok: true };
          await busy(async () => {
            let candidate: LifeState;
            try {
              candidate = performEdit(life, payload, bundle);
            } catch (err) {
              if (err instanceof EditRefusedError) {
                result = { ok: false, refusals: err.refusals };
                return;
              }
              throw err;
            }
            // The schema pass: an accepted edit must satisfy exactly what loading a save demands.
            const parsed = loadedLifeSchema(bundle).safeParse(candidate);
            if (!parsed.success) {
              result = { ok: false, refusals: [refusal('internal', 'target', { facts: { message: parsed.error.issues.map((i) => i.message).join('; ') } })] };
              return;
            }
            try {
              await commit(candidate);
            } catch (err) {
              result = { ok: false, refusals: [refusal('internal', 'target', { facts: { message: message(err) } })] };
            }
          });
          return result as EditResult;
        },

        saveTeams: async (setup) => {
          // Validated against the content before anything is stored; a setting that fails never reaches the database.
          const valid = parseTeamSetup(setup, bundle);
          const settings = await updateSettings(db, { teams: valid });
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
            s.tab = 'home';
            s.lastDeath = null;
            s.deadLife = null;
            s.deathView = null;
            s.archive = null;
            s.archiveSelection = null;
            s.eventSheet = null;
            s.personId = null;
            s.moreView = null;
            s.interactSheet = null;
            s.activitySheet = null;
            s.groupTime = null;
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
            s.personId = null;
            s.moreView = null;
            s.activityCategory = null;
            // Tapping a tab opens its first page; coming back from a page opened over it (closeHome) keeps the in-screen tab you were on.
            s.assetsSection = 'money';
            s.interactSheet = null;
            s.activitySheet = null;
            s.groupTime = null;
          }),

        startRandomLife: () =>
          start(() => {
            const seed = makeSeed();
            return createLife({ mode: 'random', seed, birthYear: currentYear(), ...(testCountry ? { countryId: testCountry } : {}), ...teamOption() }, bundle);
          }),

        startCustomLife: (custom) =>
          start(() => createLife({ mode: 'custom', seed: makeSeed(), birthYear: currentYear(), custom, ...teamOption() }, bundle)),

        continueLife: () => {
          const life = get().life;
          if (!life) return;
          set((s) => {
            s.screen = 'game';
            s.tab = 'home';
            s.personId = null;
            s.moreView = null;
          });
          if (life.phase === 'events' || life.phase === 'action') openEvents(life);
        },

        ageUp: () => {
          const life = get().life;
          if (!life || !(canAgeUp(life) || life.phase === 'yearEnd') || get().eventSheet) return Promise.resolve();
          return busy(async () => {
            // E2a: close an outcome card that began an unplanned pregnancy first: its decision comes before the year.
            if (life.phase === 'yearStart' && life.family.pregnancy?.decision === 'pending' && life.pendingInteraction) {
              const closed = closeInteraction(life, bundle);
              await commit(closed);
              if (closed.phase === 'action') openEvents(closed);
              return;
            }
            // A year interrupted before it ended is finished instead.
            if (life.phase === 'yearEnd') {
              await finishYear(life);
              return;
            }
            const begun = beginYear(life, bundle);
            await commit(begun);
            if (begun.phase === 'events') openEvents(begun);
            else await finishYear(begun);
          });
        },

        chooseEvent: (instanceId, choiceId) =>
          busy(async () => {
            const life = get().life;
            if (!life || (life.phase !== 'events' && life.phase !== 'action')) return;
            const next = resolveChoice(life, instanceId, choiceId, bundle);
            await commit(next);
            // An event without choices and nothing more to say moves straight on.
            const resolved = next.pending.find((p) => p.instanceId === instanceId);
            if (choiceId === CONTINUE_CHOICE && !resolved?.outcomeText) await advanceEvents();
          }),

        continueEvents: () =>
          busy(async () => {
            const { life, eventSheet } = get();
            if (!eventSheet) return;
            if (eventSheet.recap || !life) {
              set((s) => {
                s.eventSheet = null;
              });
              return;
            }
            await advanceEvents();
          }),

        openLifeHistory: () =>
          set((s) => {
            if (s.life) s.screen = 'lifeHistory';
          }),

        closeLifeHistory: () =>
          set((s) => {
            s.screen = s.life ? 'game' : 'title';
          }),

        openArchive: async () => {
          const listing = await listArchive(db);
          set((s) => {
            s.archive = listing;
            s.screen = 'archive';
          });
        },

        openArchivedLife: (id) =>
          set((s) => {
            s.archiveSelection = id;
            s.screen = 'archivedLife';
          }),

        openPerson: (id) =>
          set((s) => {
            if (s.life?.people[id]) s.personId = id;
          }),

        openPet: (id) =>
          set((s) => {
            if (s.life?.possessions.items.some((p) => p.id === id && p.kind === 'pet')) s.personId = id;
          }),

        closePerson: () =>
          set((s) => {
            s.personId = null;
            s.interactSheet = null;
            s.activitySheet = null;
            s.groupTime = null;
          }),

        takeAction: (actionId, personId) =>
          busy(async () => {
            const life = get().life;
            if (!life || life.phase !== 'yearStart' || get().eventSheet) return;
            const next = performAction(life, actionId, { personId }, bundle);
            await commit(next);
            openEvents(next);
          }),

        takeLifeAction: (actionId, params = {}) =>
          busy(async () => {
            const life = get().life;
            if (!life || life.phase !== 'yearStart' || get().eventSheet) return;
            const next = performAction(life, actionId, params, bundle);
            await commit(next);
            // C2: a practice, training session, rehearsal, study session or gym visit shows what it did.
            const kind = trainingKind(actionId, params, bundle);
            if (kind) {
              const lines = trainingLines(life, next, bundle);
              if (lines.length > 0) set((s) => void (s.training = { kind, lines }));
            }
            // A job application or a raise request answers with an event.
            if (next.phase === 'action') openEvents(next);
          }),

        openPetInteractions: (petId) =>
          set((s) => {
            if (s.life?.phase === 'yearStart' && s.life.possessions.items.some((p) => p.id === petId && p.kind === 'pet')) s.interactSheet = { personId: petId, view: 'menu' };
          }),

        interactPet: (interactionId, petId) =>
          busy(async () => {
            const life = get().life;
            if (!life || life.phase !== 'yearStart' || get().eventSheet) return;
            const next = performInteraction(life, { interactionId, petId }, bundle);
            await commit(next);
            set((s) => {
              s.interactSheet = null;
              s.groupTime = null;
            });
          }),

        openActivity: (activityId) =>
          set((s) => {
            if (s.life && s.life.phase === 'yearStart' && s.life.housing.kind !== 'incarcerated' || activityId === 'doctor') s.activitySheet = activityId;
          }),

        closeTraining: () =>
          set((s) => {
            s.training = null;
          }),

        closeActivity: () =>
          set((s) => {
            s.activitySheet = null;
          }),

        openInteractions: (personId) =>
          set((s) => {
            if (s.life?.people[personId] && s.life.phase === 'yearStart') s.interactSheet = { personId, view: 'menu' };
          }),

        setInteractView: (view, pick) =>
          set((s) => {
            if (!s.interactSheet) return;
            s.interactSheet.view = view;
            if (pick !== undefined) s.interactSheet.pick = pick;
            else delete s.interactSheet.pick;
          }),

        closeInteractions: () =>
          set((s) => {
            s.interactSheet = null;
            s.activitySheet = null;
            s.groupTime = null;
          }),

        spendTimeWithEveryone: () =>
          busy(async () => {
            const life = get().life;
            if (!life || life.phase !== 'yearStart' || get().eventSheet || life.pendingInteraction) return;
            const done = spendTimeWithEveryone(life, bundle);
            if (done.rows.length === 0) return;
            await commit(done.state);
            set((s) => {
              s.groupTime = done.rows;
            });
          }),

        closeGroupTime: () =>
          set((s) => {
            s.groupTime = null;
          }),

        interact: (interactionId, personId, giftTier, extra) =>
          busy(async () => {
            const life = get().life;
            if (!life || life.phase !== 'yearStart' || get().eventSheet) return;
            const next = performInteraction(life, { interactionId, personId, ...(giftTier ? { giftTier } : {}), ...(extra?.otherId ? { otherId: extra.otherId } : {}), ...(extra?.itemId ? { itemId: extra.itemId } : {}) }, bundle);
            await commit(next);
            set((s) => {
              s.interactSheet = null;
              s.groupTime = null;
            });
          }),

        chooseInteractionOption: (choiceId) =>
          busy(async () => {
            const life = get().life;
            if (!life) return;
            await commit(resolveInteractionChoice(life, choiceId, bundle));
          }),

        dismissInteraction: () =>
          busy(async () => {
            const life = get().life;
            if (!life?.pendingInteraction) return;
            const next = closeInteraction(life, bundle);
            await commit(next);
            // E2a: an unplanned pregnancy opens its decision right after the card closes.
            if (next.phase === 'action') openEvents(next);
          }),

        openTravel: () => set((s) => { if (s.life) s.moreView = 'travel'; }),
        openMigration: () => set((s) => { if (s.life) s.moreView = 'migration'; }),

        openHome: () =>
          set((s) => {
            if (s.life) s.moreView = 'home';
          }),

        openHealth: () =>
          set((s) => {
            if (s.life) s.moreView = 'health';
          }),

        openFamily: () =>
          set((s) => {
            if (s.life) s.moreView = 'family';
          }),

        openWill: () =>
          set((s) => {
            if (s.life) s.moreView = 'will';
          }),

        openLater: () =>
          set((s) => {
            if (s.life) s.moreView = 'later';
          }),

        openBelongings: () =>
          set((s) => {
            if (s.life) s.moreView = 'belongings';
          }),

        openGroups: (focus) =>
          set((s) => {
            if (s.life) {
              s.moreView = 'groups';
              s.groupsFocus = focus;
            }
          }),

        setAssetsSection: (section) =>
          set((s) => {
            s.assetsSection = section;
          }),

        openActivityCategory: (id) =>
          set((s) => {
            s.activityCategory = id;
            s.activitySheet = null;
          }),

        setGroupOpen: async (id, open) => {
          // Shown at once; saved after. A refused write (a bad id) leaves the screen as it was.
          const before = get().settings.openGroups;
          const next = { ...before, [id]: open };
          set((s) => {
            s.settings.openGroups = next;
          });
          try {
            const settings = await updateSettings(db, { openGroups: next });
            set((s) => {
              s.settings = settings;
            });
          } catch {
            set((s) => {
              s.settings.openGroups = before;
            });
          }
        },

        openSocial: () =>
          set((s) => {
            if (s.life) s.moreView = 'social';
          }),

        openTeen: () =>
          set((s) => {
            if (s.life) s.moreView = 'teen';
          }),

        chooseHeir: (heirId) =>
          busy(async () => {
            const dead = get().deadLife;
            if (!dead) return;
            const heir = continueAsHeir(dead, heirId, bundle);
            const person = dead.people[heirId]!;
            await archive(dead, heir, `${person.name.first} ${person.name.last}`);
            set((s) => {
              s.life = heir;
              s.savedLifeStatus = 'ok';
              s.deadLife = null;
              s.deathView = null;
              s.lastDeath = null;
              s.screen = 'game';
              s.tab = 'home';
              s.eventSheet = null;
              s.personId = null;
              s.moreView = null;
              s.interactSheet = null;
              s.groupTime = null;
            });
          }),

        continueFromFuneral: () =>
          set((s) => {
            if (s.screen === 'funeral') s.screen = 'death';
          }),

        leaveDeath: (to) =>
          busy(async () => {
            const dead = get().deadLife;
            if (dead) {
              await archive(dead);
              set((s) => {
                s.deadLife = null;
              });
            }
            if (to === 'archive') {
              const listing = await listArchive(db);
              set((s) => {
                s.archive = listing;
                s.screen = 'archive';
              });
            } else {
              set((s) => {
                s.screen = to;
              });
            }
          }),

        editIdentity: (edit) =>
          busy(async () => {
            const life = get().life;
            if (!life || life.phase !== 'yearStart' || get().eventSheet) return;
            await commit(performAction(life, 'edit_identity', edit, bundle));
          }),

        closeHome: () =>
          set((s) => {
            s.moreView = null;
          }),
      };
    }),
  );
  // W4a: money is shown in the currency of the country the active life is lived in.
  store.subscribe((state) => setMoneyDisplay(state.life ? moneyDisplayOf(state.life, bundle) : BASE_MONEY_DISPLAY));
  return store;
}

export const useAppStore = createAppStore();
