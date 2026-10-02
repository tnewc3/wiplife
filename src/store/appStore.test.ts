import 'fake-indexeddb/auto';
import { produce } from 'immer';
import { afterEach, describe, expect, it } from 'vitest';
import { InvalidInputError } from '../engine/creation/input';
import { customInput, lifeAtAge } from '../engine/testFixtures';
import { beginYear, CONTINUE_CHOICE } from '../engine/life';
import { getEventCard, getYearRecap } from '../engine/selectors';
import { createDb, DEFAULT_SETTINGS, lifeStateSchema, listArchive, loadSettings, makeEnvelope, readSave, writeSave, type WiplifeDb } from '../persistence';
import { content } from '../content';
import { createAppStore } from './appStore';

let n = 0;
const opened: WiplifeDb[] = [];

/** `seed`: every new life uses it (a seed whose first year has no events, for tests that need a quiet year). */
function setup(seed?: string) {
  const db = createDb(`wiplife-store-test-${++n}`);
  opened.push(db);
  let seeds = 0;
  const options = { db, makeSeed: () => seed ?? `test-seed-${++seeds}`, currentYear: () => 2026, checkInvariants: true };
  return { db, options, store: createAppStore(options) };
}

/** A seed whose first year has no events (so a year runs straight through to its end). */
const QUIET_SEED = 'test-seed-5';

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
    const { db, options, store } = setup(QUIET_SEED);
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
    const { db, options, store } = setup(QUIET_SEED);
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
    const { store } = setup(QUIET_SEED);
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

describe('app store: people and actions', () => {
  /** A saved 30-year-old with a friend ("pal"), loaded by a fresh store. */
  async function withFriend() {
    const { db, options, store } = setup();
    const life = produce(lifeAtAge('store-people', 30), (d) => {
      const template = Object.values(d.people)[0]!;
      d.people.pal = { ...template, id: 'pal', name: { first: 'Pal', last: 'Friend' }, birthYear: d.currentYear - 30, tags: [] };
      d.relationships.pal = { personId: 'pal', kind: 'friend', status: 'active', affection: 60, trust: 60, memories: [], since: d.currentYear - 5 };
    });
    await writeSave(db, makeEnvelope(life, content.contentVersion));
    await store.getState().init();
    store.getState().continueLife();
    return { db, options, store };
  }

  it('opens a person, takes an action, resolves its result and returns to the person', async () => {
    const { db, store } = await withFriend();
    store.getState().setTab('people');
    store.getState().openPerson('pal');
    expect(store.getState().personId).toBe('pal');
    await store.getState().takeAction('cut_contact', 'pal');
    const acting = store.getState();
    expect(acting.life!.phase).toBe('action');
    expect(acting.eventSheet).toEqual({ index: 0, recap: null });
    const card = getEventCard(acting.life!, 0, content)!;
    await store.getState().chooseEvent(card.instanceId, card.choices[0]!.id);
    expect(store.getState().life!.pending[0]!.outcomeText).toBeTruthy();
    await store.getState().continueEvents();
    const done = store.getState();
    expect(done.eventSheet).toBeNull();
    expect(done.life!.phase).toBe('yearStart');
    expect(done.life!.relationships.pal!.status).toBe('estranged');
    expect([done.tab, done.personId]).toEqual(['people', 'pal']);
    const saved = await readSave(db, lifeStateSchema);
    expect(saved.status === 'ok' && saved.envelope.data).toEqual(done.life);
  });

  it('ignores Age Up while an action’s result is waiting, and keeps it across a reload', async () => {
    const { options, store } = await withFriend();
    await store.getState().takeAction('cut_contact', 'pal');
    const acting = store.getState().life!;
    await store.getState().ageUp();
    expect(store.getState().life).toBe(acting);

    const restarted = createAppStore(options);
    await restarted.getState().init();
    restarted.getState().continueLife();
    expect(restarted.getState().life!.phase).toBe('action');
    expect(restarted.getState().eventSheet).toEqual({ index: 0, recap: null });
  });

  it('closes an action whose result was already chosen when the game reopens', async () => {
    const { options, store } = await withFriend();
    await store.getState().takeAction('cut_contact', 'pal');
    const card = getEventCard(store.getState().life!, 0, content)!;
    await store.getState().chooseEvent(card.instanceId, card.choices[0]!.id);
    const restarted = createAppStore(options);
    await restarted.getState().init();
    expect(restarted.getState().life!.phase).toBe('yearStart');
    expect(restarted.getState().life!.relationships.pal!.status).toBe('estranged');
  });

  it('rejects an action that isn’t available without changing anything', async () => {
    const { store } = await withFriend();
    const before = store.getState().life;
    await expect(store.getState().takeAction('divorce', 'pal')).rejects.toThrow(InvalidInputError);
    expect(store.getState().life).toBe(before);
    expect(store.getState().aging).toBe(false);
  });

  it('switching tabs closes the person', async () => {
    const { store } = await withFriend();
    store.getState().setTab('people');
    store.getState().openPerson('pal');
    store.getState().openPerson('nobody');
    expect(store.getState().personId).toBe('pal');
    store.getState().setTab('life');
    expect(store.getState().personId).toBeNull();
  });
});

describe('app store: money and home', () => {
  it('takes money and home actions between years and autosaves them', async () => {
    const { db, store } = setup();
    await store.getState().init();
    await store.getState().startRandomLife();
    const grown = produce(lifeAtAge('store-money', 25, content), (d) => {
      d.finances.savings = 100_000;
      d.housing = { kind: 'with_parents', cityId: d.character.cityId, annualCost: 0, since: d.birthYear };
      for (const p of Object.values(d.people)) p.cityId = d.character.cityId;
    });
    await writeSave(db, makeEnvelope(grown, content.contentVersion));
    const reopened = createAppStore({ db, makeSeed: () => 'x', currentYear: () => 2026, checkInvariants: true });
    await reopened.getState().init();
    reopened.getState().continueLife();

    await reopened.getState().takeLifeAction('set_lifestyle', { lifestyle: 'lavish' });
    await reopened.getState().takeLifeAction('start_gig');
    await reopened.getState().takeLifeAction('rent_home');
    const life = reopened.getState().life!;
    expect([life.finances.lifestyle, life.career.gig, life.housing.kind]).toEqual(['lavish', true, 'renting']);
    const saved = await readSave(db, lifeStateSchema);
    expect(saved.status === 'ok' && saved.envelope.data).toEqual(life);

    // More → Home opens and closes; switching tabs closes it.
    reopened.getState().setTab('more');
    reopened.getState().openHome();
    expect(reopened.getState().moreView).toBe('home');
    reopened.getState().setTab('money');
    expect(reopened.getState().moreView).toBeNull();

    // The next year's recap has a money line.
    await reopened.getState().ageUp();
    while (reopened.getState().eventSheet && !reopened.getState().eventSheet!.recap) {
      const l = reopened.getState().life!;
      const card = getEventCard(l, reopened.getState().eventSheet!.index, content)!;
      if (!card.resolved) await reopened.getState().chooseEvent(card.instanceId, card.choices[0]!.id);
      else await reopened.getState().continueEvents();
    }
    const after = reopened.getState().life;
    if (after && after.phase === 'yearStart') {
      const recap = getYearRecap(after, content)!;
      expect(recap.money).not.toBeNull();
      expect(recap.money!.savings).toBe(after.finances.savings);
    }
  });
});

describe('app store: work', () => {
  it('opens a job application’s interview in the event sheet, and closes it back to the year', async () => {
    const { db, store } = setup();
    await store.getState().init();
    await store.getState().startRandomLife();
    const grown = produce(lifeAtAge('store-work', 25, content), (d) => {
      d.education.credentials = [{ type: 'hs_diploma', year: d.birthYear + 18 }];
      d.career.openings = ['retail_associate'];
    });
    await writeSave(db, makeEnvelope(grown, content.contentVersion));
    const reopened = createAppStore({ db, makeSeed: () => 'x', currentYear: () => 2026, checkInvariants: true });
    await reopened.getState().init();
    reopened.getState().continueLife();

    await reopened.getState().takeLifeAction('apply_job', { jobId: 'retail_associate' });
    expect(reopened.getState().life!.phase).toBe('action');
    expect(reopened.getState().eventSheet).toEqual({ index: 0, recap: null });
    while (reopened.getState().eventSheet) {
      const l = reopened.getState().life!;
      const card = getEventCard(l, reopened.getState().eventSheet!.index, content)!;
      if (!card.resolved) await reopened.getState().chooseEvent(card.instanceId, card.choices[0]!.id);
      else await reopened.getState().continueEvents();
    }
    const life = reopened.getState().life!;
    expect(life.phase).toBe('yearStart');
    expect(life.career.applied).toHaveLength(1);
    expect(life.career.job?.jobId ?? null).toBe(life.career.applied[0]!.hired ? 'retail_associate' : null);
  });
});
