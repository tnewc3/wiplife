/**
 * Validation for new-life options. Every player input passes through these
 * schemas before the engine uses it; they also normalize text (Unicode NFC,
 * trimmed, single spaces).
 */
import { z } from 'zod';
import { genderCategorySchema, idSchema, type ContentBundle } from '../../content/schemas';

const codePoints = (s: string) => [...s].length;

function normalized(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** Letters from any script, plus spaces, hyphens, apostrophes and periods inside. */
const NAME_PATTERN = /^[\p{L}\p{M}](?:[\p{L}\p{M}\p{N}'’. -]*[\p{L}\p{M}\p{N}.])?$/u;
const PRONOUN_PATTERN = /^[\p{L}\p{M}'’-]+$/u;
const NO_CONTROL_CHARS = /^[^\p{Cc}]+$/u;

export const NAME_MAX = 30;
export const PRONOUN_MAX = 20;
export const LABEL_MAX = 40;
export const DESCRIPTOR_COUNT_MAX = 6;
export const SIBLINGS_MAX = 8;

const text = (what: string, max: number, pattern: RegExp, patternMessage: string) =>
  z
    .string()
    .transform(normalized)
    .refine((s) => s.length > 0, `Enter ${what}`)
    .refine((s) => codePoints(s) <= max, `Use ${max} characters or fewer`)
    .refine((s) => s.length === 0 || pattern.test(s), patternMessage);

export const personNameSchema = (what: string) =>
  text(what, NAME_MAX, NAME_PATTERN, 'Use letters, spaces, hyphens, periods or apostrophes');

const pronounFormSchema = (what: string) =>
  text(what, PRONOUN_MAX, PRONOUN_PATTERN, 'Use letters only (hyphens and apostrophes are fine)');

const freeTextSchema = (what: string) => text(what, LABEL_MAX, NO_CONTROL_CHARS, 'Remove special characters');

const scoreSchema = z.int('Must be a whole number').min(0).max(100);

export const pronounsSchema = z.strictObject({
  subject: pronounFormSchema('the subject form (like "they")'),
  object: pronounFormSchema('the object form (like "them")'),
  possessive: pronounFormSchema('the possessive form (like "their")'),
  possessivePronoun: pronounFormSchema('the possessive pronoun (like "theirs")'),
  reflexive: pronounFormSchema('the reflexive form (like "themself")'),
  verbPlural: z.boolean(),
});

export const identityInputSchema = z.strictObject({
  genderIdentity: freeTextSchema('a gender identity'),
  genderCategory: genderCategorySchema,
  genderExpression: freeTextSchema('a gender expression'),
  pronouns: pronounsSchema,
  attractedTo: z
    .array(genderCategorySchema)
    .max(3)
    .refine((a) => new Set(a).size === a.length, 'Each option can be chosen once'),
});

export const statsInputSchema = z.strictObject({
  health: scoreSchema,
  happiness: scoreSchema,
  smarts: scoreSchema,
  looks: scoreSchema,
  fitness: scoreSchema,
  stress: scoreSchema,
});

export const personalityInputSchema = z.strictObject({
  ambition: scoreSchema,
  confidence: scoreSchema,
  kindness: scoreSchema,
  riskTaking: scoreSchema,
  discipline: scoreSchema,
  sociability: scoreSchema,
});

export const familyWealthSchema = z.enum(['poor', 'working', 'middle', 'affluent', 'rich']);

export const customLifeInputSchema = z.strictObject({
  name: z.strictObject({ first: personNameSchema('a first name'), last: personNameSchema('a last name') }),
  identity: identityInputSchema,
  /**
   * E2a: whether you can carry a pregnancy. Women can and men can't, so for
   * them this may be left out (or must say so); a nonbinary character chooses
   * (left out means no).
   */
  canCarry: z.boolean().optional(),
  appearance: z.strictObject({
    descriptors: z.array(freeTextSchema('a description')).max(DESCRIPTOR_COUNT_MAX),
  }),
  cityId: idSchema,
  familyWealth: familyWealthSchema,
  family: z.strictObject({
    parents: z.union([z.literal(1), z.literal(2)]),
    siblings: z.int().min(0).max(SIBLINGS_MAX),
  }),
  stats: statsInputSchema,
  personality: personalityInputSchema,
});

/** What the player chose in custom creation (before normalization). */
export type CustomLifeInput = z.input<typeof customLifeInputSchema>;
/** The same, validated and normalized. */
export type CustomLife = z.output<typeof customLifeInputSchema>;

export const createLifeOptionsSchema = z.discriminatedUnion('mode', [
  z.strictObject({
    mode: z.literal('random'),
    seed: z.string().min(1).max(64),
    birthYear: z.int().min(1800).max(3000),
  }),
  z.strictObject({
    mode: z.literal('custom'),
    seed: z.string().min(1).max(64),
    birthYear: z.int().min(1800).max(3000),
    custom: customLifeInputSchema,
  }),
]);

export type CreateLifeOptions = z.input<typeof createLifeOptionsSchema>;
export type ParsedCreateLifeOptions = z.output<typeof createLifeOptionsSchema>;

export interface InputIssue {
  path: string;
  message: string;
}

export class InvalidInputError extends Error {
  override name = 'InvalidInputError';
  constructor(readonly issues: InputIssue[]) {
    super(`Invalid input: ${issues.map((i) => `${i.path || '(root)'}: ${i.message}`).join('; ')}`);
  }
}

/** The most older siblings content allows at birth. */
export function maxSiblings(content: ContentBundle): number {
  return Math.min(SIBLINGS_MAX, content.balance.creation.family.siblingWeights.length - 1);
}

/**
 * Validates and normalizes new-life options, including checks that depend on
 * content (the city must exist and be active). Throws InvalidInputError.
 */
export function parseCreateLifeOptions(input: unknown, content: ContentBundle): ParsedCreateLifeOptions {
  const result = createLifeOptionsSchema.safeParse(input);
  if (!result.success) {
    throw new InvalidInputError(result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  const options = result.data;
  if (options.mode === 'custom') {
    const issues: InputIssue[] = [];
    const city = content.cities[options.custom.cityId];
    if (!city || city.retired) issues.push({ path: 'custom.cityId', message: 'Choose a city' });
    const category = options.custom.identity.genderCategory;
    if (options.custom.canCarry !== undefined && category !== 'nonbinary' && options.custom.canCarry !== (category === 'woman')) {
      issues.push({ path: 'custom.canCarry', message: 'Who can carry a pregnancy follows from gender category for women and men; only nonbinary characters choose' });
    }
    if (options.custom.family.siblings > maxSiblings(content)) {
      issues.push({ path: 'custom.family.siblings', message: `Choose up to ${maxSiblings(content)} siblings` });
    }
    if (issues.length > 0) throw new InvalidInputError(issues);
  }
  return options;
}
