import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { lookSchema } from '../../../engine/looks/schema';
import { changeCategory, initialDraft, surpriseLook, toCustomInput, validateDraft, withBody, type Draft } from './draft';

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

describe('B1: "Attracted to" is an explicit choice', () => {
  it('starts unchosen and is reported until it is chosen, and "No one" (an empty list) is a valid answer', () => {
    const draft = initialDraft(content);
    expect(draft.attractedTo).toBeNull();
    expect(validateDraft(draft, content)['identity.attractedTo']).toBeDefined();
    const noOne = { ...draft, attractedTo: [] };
    expect(validateDraft(noOne, content)['identity.attractedTo']).toBeUndefined();
    expect(toCustomInput(noOne, content).identity.attractedTo).toEqual([]);
    const some = { ...draft, attractedTo: ['woman' as const, 'man' as const] };
    expect(validateDraft(some, content)['identity.attractedTo']).toBeUndefined();
    expect(toCustomInput(some, content).identity.attractedTo).toEqual(['woman', 'man']);
  });
});

describe('P1: the Look step', () => {
  it('starts with a whole, valid look, so the preview always has a portrait', () => {
    const draft = initialDraft(content);
    expect(lookSchema.safeParse(draft.look).success).toBe(true);
    expect(validateDraft(draft, content).look).toBeUndefined();
    expect(toCustomInput(draft, content).look).toEqual(draft.look);
  });

  it('gives a new look for each "Surprise me", the same each time for the same number', () => {
    expect(surpriseLook(content, 1, 'male')).toEqual(surpriseLook(content, 1, 'male'));
    expect(surpriseLook(content, 1, 'male')).not.toEqual(surpriseLook(content, 2, 'male'));
    expect(surpriseLook(content, 3, 'female').body).toBe('female');
  });

  it('moves to the matching body type when a gender category is chosen, and keeps a nonbinary character’s', () => {
    const draft = initialDraft(content);
    expect(choose(draft, 'man').look.body).toBe('male');
    expect(choose(draft, 'woman').look.body).toBe('female');
    const male = { ...draft, look: withBody(draft.look, 'male') };
    expect(choose(male, 'nonbinary').look.body).toBe('male');
  });

  it('keeps a hairstyle the new body offers and replaces one it does not', () => {
    const look = { ...initialDraft(content).look, body: 'male' as const, hairstyle: 'mohawk' as const };
    expect(withBody(look, 'female').hairstyle).not.toBe('mohawk');
    expect(withBody({ ...look, hairstyle: 'side_part' }, 'female').hairstyle).toBe('side_part');
    expect(withBody({ ...look, facialHair: 'short_beard' }, 'female').facialHair).toBe('none');
  });

  it('sends only the player’s own words as appearance text (hair and eyes follow the look)', () => {
    const draft = { ...initialDraft(content), extraDescriptor: 'a scar on one eyebrow' };
    expect(toCustomInput(draft, content).appearance.descriptors).toEqual(['a scar on one eyebrow']);
    expect(toCustomInput(initialDraft(content), content).appearance.descriptors).toEqual([]);
  });
});
