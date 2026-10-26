/** God mode (G1) in the store: the switch, opening the editor, and the checked edit action. */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { content } from '../content';
import { editable } from '../engine/godmode/fixtures';
import { createDb, lifeStateSchema, makeEnvelope, readSave, writeSave, type WiplifeDb } from '../persistence';
import { createAppStore } from './appStore';

let n = 0;
const opened: WiplifeDb[] = [];

async function started() {
  const db = createDb(`wiplife-godmode-store-${++n}`);
  opened.push(db);
  await writeSave(db, makeEnvelope(editable(), content.contentVersion));
  const options = { db, makeSeed: () => 'seed', currentYear: () => 2030, checkInvariants: true };
  const store = createAppStore(options);
  await store.getState().init();
  await store.getState().confirmAge();
  store.getState().continueLife();
  return { db, options, store };
}

afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});

describe('the god mode switch', () => {
  it('is off, turns on and off, and is remembered across a restart', async () => {
    const { options, store } = await started();
    expect(store.getState().settings.godMode).toBe(false);
    await store.getState().setGodMode(true);
    expect(store.getState().settings.godMode).toBe(true);
    const { createAppStore: make } = await import('./appStore');
    const restarted = make(options);
    await restarted.getState().init();
    expect(restarted.getState().settings.godMode).toBe(true);
    await restarted.getState().setGodMode(false);
    expect(restarted.getState().settings.godMode).toBe(false);
  });

  it('opens the editor only while it is on and the life is between years, and turning it off closes the editor', async () => {
    const { store } = await started();
    store.getState().openEditor('self');
    expect(store.getState().screen).toBe('game');
    await store.getState().setGodMode(true);
    store.getState().openEditor('nobody');
    expect(store.getState().screen).toBe('game');
    store.getState().openEditor('pal');
    expect(store.getState()).toMatchObject({ screen: 'godEditor', editorTarget: 'pal' });
    store.getState().closeEditor();
    expect(store.getState()).toMatchObject({ screen: 'game', editorTarget: null });
    store.getState().openEditor('self');
    await store.getState().setGodMode(false);
    expect(store.getState()).toMatchObject({ screen: 'game', editorTarget: null });
  });
});

describe('editLife', () => {
  it('commits and saves an accepted edit, with an edit record, and the saved life loads', async () => {
    const { db, store } = await started();
    const before = store.getState().life!;
    const result = await store.getState().editLife({ target: 'self', stats: { happiness: 7 }, looks: 99 });
    expect(result).toEqual({ ok: true });
    const life = store.getState().life!;
    expect(life.character.stats).toMatchObject({ happiness: 7, looks: 99 });
    expect(life.inputLog).toHaveLength(before.inputLog.length + 1);
    const saved = await readSave(db, lifeStateSchema);
    expect(saved.status === 'ok' && saved.envelope.data).toEqual(life);
  });

  it('refuses with every reason and changes and saves nothing', async () => {
    const { db, store } = await started();
    const before = store.getState().life!;
    const savedBefore = await readSave(db, lifeStateSchema);
    const result = await store.getState().editLife({ target: { person: 'kid' }, relationship: { kind: 'partner' } });
    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error('expected a refusal');
    expect(result.refusals.map((r) => r.code)).toEqual(['minor_romance']);
    expect(store.getState().life).toBe(before);
    expect(await readSave(db, lifeStateSchema)).toEqual(savedBefore);
    expect(store.getState().aging).toBe(false);
  });

  it('previews without changing anything, and reports the age bounds of a friend', async () => {
    const { store } = await started();
    const before = store.getState().life!;
    expect(store.getState().previewEdit({ target: 'self', looks: 1 })).toEqual({ ok: true });
    expect(store.getState().previewEdit({ target: 'self', stats: { health: 0 } })).toMatchObject({ ok: false });
    expect(store.getState().life).toBe(before);
    expect(store.getState().ageBoundsOf('pal')?.editable).toBe(true);
    expect(store.getState().ageBoundsOf('p1')?.editable).toBe(false);
    expect(store.getState().ageBoundsOf('nobody')).toBeNull();
  });

  it('refuses while an event sheet is open or the year is under way', async () => {
    const { store } = await started();
    const result = await store.getState().editLife({ target: 'self', looks: 4 });
    expect(result.ok).toBe(true);
    await store.getState().ageUp();
    const during = await store.getState().editLife({ target: 'self', looks: 5 });
    if (store.getState().life?.phase === 'yearStart' && !store.getState().eventSheet) expect(during.ok).toBe(true);
    else expect(during).toMatchObject({ ok: false });
  });
});
