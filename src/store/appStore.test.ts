import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { InvalidInputError } from '../engine/creation/input';
import { customInput } from '../engine/testFixtures';
import { beginYear, CONTINUE_CHOICE } from '../engine/life';
import { getEventCard } from '../engine/selectors';
import { createDb, DEFAULT_SETTINGS, lifeStateSchema, listArchive, loadSettings, makeEnvelope, readSave, writeSave, type WiplifeDb } from '../persistence';
import { content } from '../content';
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
    // Aging up autosaves twice (after beginYear and endYear), so the newest
    // backup is the life in the middle of its first year.
    await store.getState().ageUp();
    const aged = store.getState().life;
    expect(aged?.character.age).toBe(1);

    // Damage the active save so it is well-formed but impossible.
    const active = (await db.lives.get('active'))!;
    const data = active.envelope.data as { character: { age: number } };
    data.character.age = 40;
    await db.lives.put(active);

    // The mid-year backup loads and its year finishes exactly as before.
    const restarted = createAppStore(options);
    await restarted.getState().init();
    expect(restarted.getState().savedLifeStatus).toBe('recovered');
    expect(restarted.getState().life).toEqual(aged);

    // The restored life is saved again, so the next launch loads it normally.
    const again = createAppStore(options);
    await again.getState().init();
    expect(again.getState().savedLifeStatus).toBe('ok');
    expect(again.getState().life).toEqual(aged);
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

/** Plays one year through the store: Age Up, then the first choice on every event card. */
async function playYear(store: ReturnType<typeof setup>['store']): Promise<void> {
  await store.getState().ageUp();
  while (store.getState().eventSheet) {
    const { life, eventSheet } = store.getState();
    const card = !eventSheet!.recap && life ? getEventCard(life, eventSheet!.index, content) : null;
    if (card && !card.resolved) await store.getState().chooseEvent(card.instanceId, card.choices[0]!.id);
    else await store.getState().continueEvents();
  }
}

/** Plays years until the life ends (at most the maximum age). */
async function liveToDeath(store: ReturnType<typeof setup>['store']): Promise<void> {
  for (let i = 0; i <= content.balance.mortality.maxAge && store.getState().life; i++) await playYear(store);
}

/** Ages up until a year with events begins (the event sheet opens). */
async function ageUpToEvents(store: ReturnType<typeof setup>['store']): Promise<void> {
  for (let i = 0; i < 30 && store.getState().life && !store.getState().eventSheet; i++) await store.getState().ageUp();
  expect(store.getState().eventSheet).not.toBeNull();
}

describe('app store: aging', () => {
  it('ages up one year and autosaves', async () => {
    const { db, store } = setup();
    await store.getState().init();
    await store.getState().startRandomLife();
    await store.getState().ageUp();

    const life = store.getState().life!;
    expect([life.character.age, life.currentYear]).toEqual([1, 2027]);
    // A quiet year ends at once; a year with events waits in the event sheet.
    expect(life.phase).toBe(store.getState().eventSheet ? 'events' : 'yearStart');
    expect(store.getState().aging).toBe(false);
    const saved = await readSave(db, lifeStateSchema);
    expect(saved.status === 'ok' && saved.envelope.data).toEqual(life);
  });

  it('advances only one year when Age Up is tapped rapidly', async () => {
    const { store } = setup();
    await store.getState().init();
    await store.getState().startRandomLife();
    await Promise.all([store.getState().ageUp(), store.getState().ageUp(), store.getState().ageUp()]);
    expect(store.getState().life!.character.age).toBe(1);
    expect(store.getState().life!.inputLog.filter((r) => r.kind === 'ageUp')).toHaveLength(1);
  });

  it('finishes a year that was saved in the middle when the game reopens', async () => {
    const { db, options, store } = setup();
    await store.getState().init();
    await store.getState().startRandomLife();
    const midYear = beginYear(store.getState().life!, content);
    await writeSave(db, makeEnvelope(midYear, content.contentVersion));

    const restarted = createAppStore(options);
    await restarted.getState().init();
    const life = restarted.getState().life;
    if (life) {
      expect([life.character.age, life.phase]).toEqual([1, 'yearStart']);
      expect(restarted.getState().savedLifeStatus).toBe('ok');
    } else {
      expect(restarted.getState().screen).toBe('death');
    }
  });

  it('finishes an interrupted year on Age Up instead of starting another', async () => {
    const { store } = setup();
    await store.getState().init();
    await store.getState().startRandomLife();
    store.setState({ life: beginYear(store.getState().life!, content) });
    await store.getState().ageUp();
    const life = store.getState().life;
    if (life) expect([life.character.age, life.phase]).toEqual([1, 'yearStart']);
  });

  it('moves a life that ends into the archive and shows the Death screen', async () => {
    const { db, options, store } = setup();
    await store.getState().init();
    await store.getState().startRandomLife();
    const name = store.getState().life!.character.name;
    await liveToDeath(store);

    const state = store.getState();
    expect(state.life).toBeNull();
    expect(state.screen).toBe('death');
    expect(state.lastDeath).toMatchObject({ name: `${name.first} ${name.last}`, unfinished: false, seed: 'test-seed-1' });
    expect(state.lastDeath!.causeOfDeath).toBeTruthy();
    expect((await readSave(db, lifeStateSchema)).status).toBe('none');
    expect(await db.backups.count()).toBe(0);

    // The archive survives a restart; there is nothing left to continue.
    const restarted = createAppStore(options);
    await restarted.getState().init();
    expect(restarted.getState().life).toBeNull();
    await restarted.getState().openArchive();
    expect(restarted.getState().screen).toBe('archive');
    expect(restarted.getState().archive?.lives).toEqual([state.lastDeath]);
  });

  it('archives the old life as unfinished when a new one starts over it', async () => {
    const { db, store } = setup();
    await store.getState().init();
    await store.getState().startRandomLife();
    await store.getState().ageUp();
    const old = store.getState().life!;
    await store.getState().startRandomLife();

    expect(store.getState().life?.seed).toBe('test-seed-2');
    const { lives } = await listArchive(db);
    expect(lives).toHaveLength(1);
    expect(lives[0]).toMatchObject({ id: old.id, unfinished: true, causeOfDeath: null, ageAtDeath: old.character.age });
    const saved = await readSave(db, lifeStateSchema);
    expect(saved.status === 'ok' && saved.envelope.data.seed).toBe('test-seed-2');
    expect(await db.backups.count()).toBe(0);
  });

  it('grows the archive with each life', async () => {
    const { db, store } = setup();
    await store.getState().init();
    await store.getState().startRandomLife();
    await liveToDeath(store);
    await store.getState().startRandomLife();
    await store.getState().startRandomLife();
    const { lives } = await listArchive(db);
    // (Both may be archived in the same millisecond, so compare without order.)
    expect(lives.map((l) => [l.seed, l.unfinished]).sort()).toEqual([
      ['test-seed-1', false],
      ['test-seed-2', true],
    ]);
  });

  it('opens and closes the life history and an archived life', async () => {
    const { store } = setup();
    await store.getState().init();
    await store.getState().startRandomLife();
    store.getState().openLifeHistory();
    expect(store.getState().screen).toBe('lifeHistory');
    store.getState().closeLifeHistory();
    expect(store.getState().screen).toBe('game');
    store.getState().openArchivedLife('life_x');
    expect([store.getState().screen, store.getState().archiveSelection]).toEqual(['archivedLife', 'life_x']);
  });
});

describe('app store: events', () => {
  it('shows each event, resolves choices, then shows the recap as the last card', async () => {
    const { db, store } = setup();
    await store.getState().init();
    await store.getState().startRandomLife();
    await ageUpToEvents(store);

    const count = store.getState().life!.pending.length;
    for (let i = 0; i < count; i++) {
      const { life, eventSheet } = store.getState();
      expect(eventSheet).toEqual({ index: i, recap: null });
      const card = getEventCard(life!, i, content)!;
      // Continue does nothing until the card is answered.
      await store.getState().continueEvents();
      expect(store.getState().eventSheet!.index).toBe(i);
      await store.getState().chooseEvent(card.instanceId, card.choices[0]!.id);
      // Each choice is saved at once.
      const saved = await readSave(db, lifeStateSchema);
      const current = store.getState().life;
      if (current) expect(saved.status === 'ok' && saved.envelope.data).toEqual(current);
      // An event without choices and without outcome text moves on by itself.
      const autoAdvanced = card.choices[0]!.id === CONTINUE_CHOICE && !current?.pending[i]?.outcomeText;
      if (!autoAdvanced) {
        expect(current!.pending[i]!.resolvedChoiceId).toBe(card.choices[0]!.id);
        await store.getState().continueEvents();
      }
      if (!store.getState().life || store.getState().eventSheet?.recap) break;
    }
    const state = store.getState();
    if (state.life) {
      expect(state.life.phase).toBe('yearStart');
      expect(state.eventSheet?.recap).toMatchObject({ year: state.life.currentYear, age: state.life.character.age });
      await store.getState().continueEvents();
      expect(store.getState().eventSheet).toBeNull();
    } else {
      expect(state.screen).toBe('death');
    }
  });

  it('resolves only one choice when tapped twice at once', async () => {
    const { store } = setup();
    await store.getState().init();
    await store.getState().startRandomLife();
    await ageUpToEvents(store);
    const { life, eventSheet } = store.getState();
    const card = getEventCard(life!, eventSheet!.index, content)!;
    await Promise.all([
      store.getState().chooseEvent(card.instanceId, card.choices[0]!.id),
      store.getState().chooseEvent(card.instanceId, card.choices.at(-1)!.id),
    ]);
    expect(store.getState().life!.inputLog.filter((r) => r.kind === 'choice')).toHaveLength(1);
  });

  it('keeps the same events after a reload in the middle of a year', async () => {
    const { options, store } = setup();
    await store.getState().init();
    await store.getState().startRandomLife();
    await ageUpToEvents(store);
    const pending = store.getState().life!.pending;

    const restarted = createAppStore(options);
    await restarted.getState().init();
    expect(restarted.getState().life!.pending).toEqual(pending);
    restarted.getState().continueLife();
    expect(restarted.getState().eventSheet).toEqual({ index: 0, recap: null });
  });

  it('ignores Age Up while the event sheet is open', async () => {
    const { store } = setup();
    await store.getState().init();
    await store.getState().startRandomLife();
    await ageUpToEvents(store);
    const age = store.getState().life!.character.age;
    await store.getState().ageUp();
    expect(store.getState().life!.character.age).toBe(age);
  });
});
