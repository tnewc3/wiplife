import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { changeCategory, initialDraft, type Draft } from './draft';

/** Applies a category change the way the screen does. */
function choose(draft: Draft, category: Draft['genderCategory'] & string): Draft {
  return { ...draft, ...changeCategory(draft, category, content) };
}

describe('changing gender category in custom creation', () => {
  const man = content.character.identity.categories.man;
  const woman = content.character.identity.categories.woman;

  it('fills identity, expression and pronouns on the first choice', () => {
    const draft = choose(initialDraft(content), 'man');
    expect(draft.genderIdentity).toBe(man.identities[0]);
    expect(draft.genderExpression).toBe(man.defaultExpression);
    expect(draft.pronounChoice).toBe('he_him');
  });

  it('replaces values that are still the auto-filled ones', () => {
    const draft = choose(choose(initialDraft(content), 'man'), 'woman');
    expect(draft.genderCategory).toBe('woman');
    expect(draft.genderIdentity).toBe(woman.identities[0]);
    expect(draft.genderExpression).toBe(woman.defaultExpression);
    expect(draft.pronounChoice).toBe('she_her');
  });

  it('keeps anything the player changed', () => {
    const edited: Draft = {
      ...choose(initialDraft(content), 'man'),
      genderIdentity: 'trans man',
      genderExpression: 'fluid',
      pronounChoice: 'they_them',
    };
    const draft = choose(edited, 'nonbinary');
    expect(draft.genderCategory).toBe('nonbinary');
    expect(draft.genderIdentity).toBe('trans man');
    expect(draft.genderExpression).toBe('fluid');
    expect(draft.pronounChoice).toBe('they_them');
  });

  it('keeps custom pronouns and updates only the untouched fields', () => {
    const edited: Draft = { ...choose(initialDraft(content), 'woman'), genderIdentity: 'genderqueer', pronounChoice: 'custom' };
    const draft = choose(edited, 'man');
    expect(draft.genderIdentity).toBe('genderqueer');
    expect(draft.genderExpression).toBe(man.defaultExpression);
    expect(draft.pronounChoice).toBe('custom');
  });

  it('fills fields the player cleared', () => {
    const cleared: Draft = { ...choose(initialDraft(content), 'woman'), genderIdentity: '', genderExpression: '' };
    const draft = choose(cleared, 'man');
    expect(draft.genderIdentity).toBe(man.identities[0]);
    expect(draft.genderExpression).toBe(man.defaultExpression);
  });
});
