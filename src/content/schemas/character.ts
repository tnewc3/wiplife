import { z } from 'zod';
import { baseDefSchema, idSchema, scoreKeySchema } from './common';

export const genderCategorySchema = z.enum(['man', 'woman', 'nonbinary']);
export type GenderCategory = z.infer<typeof genderCategorySchema>;
export const GENDER_CATEGORIES = genderCategorySchema.options;

const nameSchema = z.string().trim().min(1).max(30);

/** First names by gender category, plus last names, for one heritage. */
export const heritageNamesSchema = z.strictObject({
  first: z.strictObject({
    man: z.array(nameSchema).min(1),
    woman: z.array(nameSchema).min(1),
    nonbinary: z.array(nameSchema).min(1),
  }),
  last: z.array(nameSchema).min(1),
});
export type HeritageNames = z.infer<typeof heritageNamesSchema>;

/** One pool per country, grouped by heritage so a family's names fit together. */
export const namePoolSchema = baseDefSchema.extend({
  heritages: z
    .record(idSchema, heritageNamesSchema)
    .refine((h) => Object.keys(h).length > 0, 'needs at least one heritage'),
});
export type NamePool = z.infer<typeof namePoolSchema>;

const pronounFormSchema = z.string().trim().min(1).max(20);

/** A pronoun set the player can pick; every form is required. */
export const pronounPresetSchema = baseDefSchema.extend({
  /** Shown on the picker, e.g. "she/her". */
  label: z.string().trim().min(1).max(20),
  subject: pronounFormSchema,
  object: pronounFormSchema,
  possessive: pronounFormSchema,
  possessivePronoun: pronounFormSchema,
  reflexive: pronounFormSchema,
  /** True when verbs take the plural form ("they are"). */
  verbPlural: z.boolean(),
});
export type PronounPreset = z.infer<typeof pronounPresetSchema>;

/** A hidden talent area, discovered through events later. */
export const talentSchema = baseDefSchema.extend({
  name: z.string().trim().min(1).max(40),
  /** As it reads inside a sentence ("music"), for {talent} in event text (Stage 9). */
  noun: z.string().trim().min(1).max(40),
  description: z.string().trim().min(1).max(200),
  /**
   * What finding it does (Stage 9): stat changes once, when you discover it,
   * and a performance bonus (balance/discovery.yaml talent) in these job tracks.
   */
  boost: z.strictObject({
    stats: z.array(z.strictObject({ key: scoreKeySchema, delta: z.int().min(-20).max(20) })).default([]),
    jobs: z.array(idSchema).default([]),
  }),
});
export type TalentDef = z.infer<typeof talentSchema>;

const labelSchema = z.string().trim().min(1).max(40);

const categoryOptionsSchema = z.strictObject({
  /** Shown when choosing the category in custom creation. */
  label: labelSchema,
  /** Identity words a random character of this category can start with. */
  identities: z.array(labelSchema).min(1),
  /** The usual expression for a random character of this category. */
  defaultExpression: labelSchema,
});

/** Identity words: defaults for random characters and suggestions for custom ones. */
export const identityOptionsSchema = z.strictObject({
  categories: z.strictObject({
    man: categoryOptionsSchema,
    woman: categoryOptionsSchema,
    nonbinary: categoryOptionsSchema,
  }),
  /** Suggestions offered for the free-text identity field. */
  identitySuggestions: z.array(labelSchema).min(1),
  /** Expressions offered for the free-text expression field and latent rolls. */
  expressions: z.array(labelSchema).min(2),
});
export type IdentityOptions = z.infer<typeof identityOptionsSchema>;

/** Appearance descriptors, one pick per group plus optional features. */
export const appearanceOptionsSchema = z.strictObject({
  groups: z
    .array(
      z.strictObject({
        id: idSchema,
        label: labelSchema,
        options: z.array(labelSchema).min(1),
      }),
    )
    .min(1),
  features: z.array(labelSchema).min(1),
});
export type AppearanceOptions = z.infer<typeof appearanceOptionsSchema>;
