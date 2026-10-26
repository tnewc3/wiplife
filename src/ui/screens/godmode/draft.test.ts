import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { getEditView } from '../../../engine/editView';
import { checkEdit } from '../../../engine/godmode';
import { editable } from '../../../engine/godmode/fixtures';
import { changeCount, cloneView, parseDollars, toPayload } from './draft';

const life = editable();

describe('the god mode draft', () => {
  it('sends nothing when nothing changed', () => {
    const base = getEditView(life, 'self', content)!;
    expect(toPayload(base, cloneView(base))).toBeNull();
    expect(changeCount(null)).toBe(0);
  });

  it('sends only the fields that differ, for you', () => {
    const base = getEditView(life, 'self', content)!;
    const draft = cloneView(base);
    draft.stats.happiness = 12;
    draft.looks = 77;
    draft.money!.savings = 500;
    draft.money!.debts.push({ id: '', kind: 'personal', balance: 300 });
    const added = Object.keys(content.languages).sort().find((id) => !base.languages.some((l) => l.id === id))!;
    draft.languages.push({ id: added, skill: 30, native: false });
    const payload = toPayload(base, draft)!;
    expect(payload).toEqual({
      target: 'self',
      stats: { happiness: 12 },
      looks: 77,
      languages: [...base.languages, { id: added, skill: 30, native: false }],
      money: { savings: 500, debts: [{ kind: 'personal', balance: 300 }] },
    });
    expect(changeCount(payload)).toBe(4);
    expect(checkEdit(life, payload, content)).toEqual({ ok: true });
  });

  it('sends only the fields that differ, for a person, and the engine accepts it', () => {
    const base = getEditView(life, 'pal', content)!;
    expect(base.relationship).toMatchObject({ kind: 'friend', status: 'active' });
    const draft = cloneView(base);
    draft.identity.attractedTo = ['man', 'woman'];
    draft.relationship!.affection = 3;
    draft.personality.kindness = null;
    draft.birthYear = base.birthYear - 4;
    const payload = toPayload(base, draft)!;
    expect(payload).toEqual({ target: { person: 'pal' }, identity: { attractedTo: ['man', 'woman'] }, relationship: { affection: 3 }, birthYear: base.birthYear - 4 });
    expect(checkEdit(life, payload, content)).toEqual({ ok: true });
  });

  it('shows what a person can and can’t have edited', () => {
    expect(getEditView(life, 'nobody', content)).toBeNull();
    const self = getEditView(life, 'self', content)!;
    expect(self).toMatchObject({ self: true, latent: expect.anything(), relationship: null });
    expect(self.money).toMatchObject({ savings: life.finances.savings, locked: 0 });
    const pal = getEditView(life, 'pal', content)!;
    expect(pal).toMatchObject({ self: false, money: null, latent: null, appearance: [] });
    expect(Object.keys(pal.stats).sort()).toEqual(['mood', 'moodBase', 'smarts']);
  });

  it('reads whole dollars as typed', () => {
    expect(parseDollars('12,500')).toBe(12500);
    expect(parseDollars('$ 7')).toBe(7);
    expect(parseDollars('-3')).toBe(-3);
    expect(parseDollars('1.5')).toBeNaN();
    expect(parseDollars('abc')).toBeNaN();
    expect(parseDollars('')).toBeNaN();
  });
});
