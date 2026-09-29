import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createDb, DEFAULT_SETTINGS, loadSettings, type WiplifeDb } from '../persistence';
import { createAppStore } from './appStore';

let n = 0;
const opened: WiplifeDb[] = [];

function setup() {
  const db = createDb(`wiplife-store-test-${++n}`);
  opened.push(db);
  return { db, store: createAppStore(db) };
}

afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});

describe('app store', () => {
  it('loads default settings on first launch', async () => {
    const { store } = setup();
    expect(store.getState().status).toBe('loading');
    await store.getState().init();
    expect(store.getState().status).toBe('ready');
    expect(store.getState().settings).toEqual(DEFAULT_SETTINGS);
  });

  it('remembers age confirmation and theme across a restart', async () => {
    const { db, store } = setup();
    await store.getState().init();
    await store.getState().confirmAge();
    await store.getState().setTheme('dark');

    const restarted = createAppStore(db);
    await restarted.getState().init();
    expect(restarted.getState().settings.ageConfirmed).toBe(true);
    expect(restarted.getState().settings.theme).toBe('dark');
  });

  it('reset clears stored data and returns to the title screen', async () => {
    const { db, store } = setup();
    await store.getState().init();
    await store.getState().confirmAge();
    store.getState().navigate('shell');
    await store.getState().resetAllData();

    expect(store.getState().settings).toEqual(DEFAULT_SETTINGS);
    expect(store.getState().screen).toBe('title');
    expect(await loadSettings(db)).toEqual(DEFAULT_SETTINGS);
  });

  it('settings returns to the screen it was opened from', () => {
    const { store } = setup();
    store.getState().navigate('shell');
    store.getState().openSettings();
    expect(store.getState().screen).toBe('settings');
    store.getState().closeSettings();
    expect(store.getState().screen).toBe('shell');
  });
});
