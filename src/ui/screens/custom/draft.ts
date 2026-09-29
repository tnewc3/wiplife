/**
 * Custom creation draft: what the form holds while the player works through
 * the steps, how it becomes engine input, and which step each error belongs to.
 */
import type { ContentBundle } from '../../../content/schemas';
import { pronounsFromPreset } from '../../../engine/creation/character';
import { customLifeInputSchema, type CustomLifeInput } from '../../../engine/creation/input';
import { getPronounPresets } from '../../../engine/selectors';
import type { FamilyWealth, GenderCategory, Personality, Pronouns, Stats } from '../../../engine/types';

export interface Draft {
  first: string;
  last: string;
  /** Selected option per appearance group id; '' means none. */
  appearance: Record<string, string>;
  extraDescriptor: string;
  genderIdentity: string;
  genderCategory: GenderCategory | null;
  genderExpression: string;
  /** A pronoun preset id, 'custom', or not chosen yet. */
  pronounChoice: string | null;
  customPronouns: Pronouns;
  attractedTo: GenderCategory[];
  parents: 1 | 2;
  siblings: number;
  familyWealth: FamilyWealth | null;
  cityId: string | null;
  stats: Stats;
  personality: Personality;
}

export const STEPS = [
  { id: 'name', title: 'Name and looks', fields: ['name', 'appearance'] },
  { id: 'identity', title: 'Identity', fields: ['identity'] },
  { id: 'family', title: 'Family', fields: ['family', 'familyWealth'] },
  { id: 'city', title: 'City', fields: ['cityId'] },
  { id: 'traits', title: 'Stats and personality', fields: ['stats', 'personality'] },
  { id: 'review', title: 'Review', fields: [] },
] as const;

export type Errors = Record<string, string>;

const MIDDLE = 50;

export function initialDraft(content: ContentBundle): Draft {
  return {
    first: '',
    last: '',
    appearance: Object.fromEntries(content.character.appearance.groups.map((g) => [g.id, ''])),
    extraDescriptor: '',
    genderIdentity: '',
    genderCategory: null,
    genderExpression: '',
    pronounChoice: null,
    customPronouns: { subject: '', object: '', possessive: '', possessivePronoun: '', reflexive: '', verbPlural: false },
    attractedTo: [],
    parents: 2,
    siblings: 0,
    familyWealth: null,
    cityId: null,
    stats: { health: MIDDLE, happiness: MIDDLE, smarts: MIDDLE, looks: MIDDLE, fitness: MIDDLE, stress: MIDDLE },
    personality: {
      ambition: MIDDLE,
      confidence: MIDDLE,
      kindness: MIDDLE,
      riskTaking: MIDDLE,
      discipline: MIDDLE,
      sociability: MIDDLE,
    },
  };
}

/** The most-used pronoun preset for a category, to preselect when it is chosen. */
export function defaultPronounChoice(content: ContentBundle, category: GenderCategory): string | null {
  const weights = content.balance.creation.pronouns[category];
  const presets = getPronounPresets(content).filter((p) => (weights[p.id] ?? 0) > 0);
  presets.sort((a, b) => (weights[b.id] ?? 0) - (weights[a.id] ?? 0));
  return presets[0]?.id ?? null;
}

export function draftPronouns(draft: Draft, content: ContentBundle): Pronouns {
  if (draft.pronounChoice && draft.pronounChoice !== 'custom' && content.pronouns[draft.pronounChoice]) {
    return pronounsFromPreset(content, draft.pronounChoice);
  }
  return draft.customPronouns;
}

/** Builds engine input. Unchosen fields get placeholders; validateDraft reports them. */
export function toCustomInput(draft: Draft, content: ContentBundle): CustomLifeInput {
  const descriptors = content.character.appearance.groups.map((g) => draft.appearance[g.id] ?? '').filter((d) => d !== '');
  if (draft.extraDescriptor.trim() !== '') descriptors.push(draft.extraDescriptor);
  return {
    name: { first: draft.first, last: draft.last },
    identity: {
      genderIdentity: draft.genderIdentity,
      genderCategory: draft.genderCategory ?? 'nonbinary',
      genderExpression: draft.genderExpression,
      pronouns: draftPronouns(draft, content),
      attractedTo: draft.attractedTo,
    },
    appearance: { descriptors },
    cityId: draft.cityId ?? '',
    familyWealth: draft.familyWealth ?? 'middle',
    family: { parents: draft.parents, siblings: draft.siblings },
    stats: draft.stats,
    personality: draft.personality,
  };
}

/** Every problem with the draft, keyed by input path (e.g. "name.first"). */
export function validateDraft(draft: Draft, content: ContentBundle): Errors {
  const errors: Errors = {};
  if (!draft.genderCategory) errors['identity.genderCategory'] = 'Choose the one that fits best';
  if (!draft.pronounChoice) errors['identity.pronouns'] = 'Choose pronouns';
  if (!draft.familyWealth) errors.familyWealth = 'Choose how well off your family is';
  if (!draft.cityId || !content.cities[draft.cityId]) errors.cityId = 'Choose a city';

  const result = customLifeInputSchema.safeParse(toCustomInput(draft, content));
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      const covered = Object.keys(errors).some((k) => path === k || path.startsWith(`${k}.`));
      if (!covered && !errors[path]) errors[path] = issue.message;
    }
  }
  return errors;
}

/** Index of the step an error path belongs to. */
export function stepOf(path: string): number {
  const index = STEPS.findIndex((s) => s.fields.some((f) => path === f || path.startsWith(`${f}.`)));
  return index === -1 ? 0 : index;
}

export function errorsForStep(errors: Errors, step: number): Errors {
  return Object.fromEntries(Object.entries(errors).filter(([path]) => stepOf(path) === step));
}
