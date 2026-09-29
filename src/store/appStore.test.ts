import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { InvalidInputError } from '../engine/creation/input';
import { customInput } from '../engine/testFixtures';
import { createDb, DEFAULT_SETTINGS, lifeStateSchema, loadSettings, readSave, type WiplifeDb } from '../persistence';
import { createAppStore } from './appStore';

let n = 0;
const opened: WiplifeDb[] = [];

function setup() {
  const db = createDb(`wiplife-store-test-${++n}`);
  opened.push(db);
  let seeds = 0;
  const options = { db, makeSeed: () => `test-seed-${++seeds}`, currentYear: () => 2026, checkInvariants: true };
  return { db, options, store: createAppStore(options) };
}

afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});

describe('app store: settings', () => {
  it('loads default settings on first launch', async () => {
    const { store } = setup();
    expect(store.getState().status).toBe('loading');
    await store.getState().init();
    expect(store.getState().status).toBe('ready');
    expect(store.getState().settings).toEqual(DEFAULT_SETTINGS);
    expect(store.getState().savedLifeStatus).toBe('none');
  });

  it('remembers age confirmation and theme across a restart', async () => {
    const { options, store } = setup();
    await store.getState().init();
    await store.getState().confirmAge();
    await store.getState().setTheme('dark');

    const restarted = createAppStore(options);
    await restarted.getState().init();
    expect(restarted.getState().settings.ageConfirmed).toBe(true);
    expect(restarted.getState().settings.theme).toBe('dark');
  });

  it('settings returns to the screen it was opened from', () => {
    const { store } = setup();
    store.getState().navigate('game');
    store.getState().openSettings();
    expect(store.getState().screen).toBe('settings');
    store.getState().closeSettings();
    expect(store.getState().screen).toBe('game');
  });
});

describe('app store: lives', () => {
  it('starts a random life, autosaves it and shows the game', async () => {
    const { db, store } = setup();
    await store.getState().init();
    await store.getState().startRandomLife();

    const { life, screen, tab } = store.getState();
    expect(life?.seed).toBe('test-seed-1');
    expect(life?.birthYear).toBe(2026);
    expect([screen, tab]).toEqual(['game', 'life']);
    const saved = await readSave(db, lifeStateSchema);
    expect(saved.status === 'ok' && saved.envelope.data).toEqual(life);
  });

  it('records the create input in the input log', async () => {
    const { store } = setup();
    await store.getState().init();
    await store.getState().startCustomLife(customInput());
    const log = store.getState().life!.inputLog;
    expect(log).toHaveLength(1);
    expect(log[0]!.kind).toBe('create');
    expect(log[0]!.payload).toMatchObject({ mode: 'custom', custom: { name: { first: 'Robin' } } });
  });

  it('offers the saved life to continue after a restart, unchanged', async () => {
    const { options, store } = setup();
    await store.getState().init();
    await store.getState().startRandomLife();
    const life = store.getState().life;

    const restarted = createAppStore(options);
    await restarted.getState().init();
    expect(restarted.getState().savedLifeStatus).toBe('ok');
    expect(restarted.getState().screen).toBe('title');
    restarted.getState().continueLife();
    expect(restarted.getState().screen).toBe('game');
    expect(restarted.getState().life).toEqual(life);
  });

  it('restores the backup when the saved life breaks an invariant', async () => {
    const { db, options, store } = setup();
    await store.getState().init();
    await store.getState().startRandomLife();
    const first = store.getState().life;
    await store.getState().startRandomLife();

    // Damage the active save so it is well-formed but impossible.
    const active = (await db.lives.get('active'))!;
    const data = active.envelope.data as { character: { age: number } };
    data.character.age = 40;
    await db.lives.put(active);

    const restarted = createAppStore(options);
    await restarted.getState().init();
    expect(restarted.getState().savedLifeStatus).toBe('recovered');
    expect(restarted.getState().life).toEqual(first);

    // The restored life is saved again, so the next launch loads it normally.
    const again = createAppStore(options);
    await again.getState().init();
    expect(again.getState().savedLifeStatus).toBe('ok');
    expect(again.getState().life).toEqual(first);
  });

  it('ignores a second start while the first is still running', async () => {
    const { db, store } = setup();
    await store.getState().init();
    await Promise.all([store.getState().startRandomLife(), store.getState().startRandomLife()]);
    expect(store.getState().life?.seed).toBe('test-seed-1');
    expect(await db.backups.count()).toBe(0);
  });

  it('rejects invalid custom input without changing anything', async () => {
    const { db, store } = setup();
    await store.getState().init();
    const bad = customInput({ name: { first: '', last: 'Lee' } });
    await expect(store.getState().startCustomLife(bad)).rejects.toThrow(InvalidInputError);
    expect(store.getState().life).toBeNull();
    expect(store.getState().creating).toBe(false);
    expect(await db.lives.count()).toBe(0);
  });

  it('asks the browser to keep data when the first life starts', async () => {
    const { db, store } = setup();
    await store.getState().init();
    await store.getState().startRandomLife();
    await expect.poll(async () => (await loadSettings(db)).persistRequested).toBe(true);
  });

  it('reset clears the life and returns to the title screen', async () => {
    const { db, store } = setup();
    await store.getState().init();
    await store.getState().confirmAge();
    await store.getState().startRandomLife();
    await store.getState().resetAllData();

    expect(store.getState().life).toBeNull();
    expect(store.getState().screen).toBe('title');
    expect(store.getState().settings).toEqual(DEFAULT_SETTINGS);
    expect(await loadSettings(db)).toEqual(DEFAULT_SETTINGS);
    expect((await readSave(db, lifeStateSchema)).status).toBe('none');
  });
});
