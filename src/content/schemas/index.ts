import { z } from 'zod';
import { creationBalanceSchema } from './balance';
import { appearanceOptionsSchema, identityOptionsSchema, namePoolSchema, pronounPresetSchema, talentSchema } from './character';
import { citySchema } from './city';

export * from './balance';
export * from './character';
export * from './city';
export * from './common';

/**
 * Collections: a folder under src/content with one YAML file per definition,
 * named after its id. Adding a collection means adding a schema, one entry
 * here and one field in contentBundleSchema.
 */
export const collectionTypes = {
  cities: { folder: 'cities', schema: citySchema },
  names: { folder: 'names', schema: namePoolSchema },
  pronouns: { folder: 'pronouns', schema: pronounPresetSchema },
  talents: { folder: 'talents', schema: talentSchema },
} as const;

export type CollectionKey = keyof typeof collectionTypes;

/**
 * Single files with a fixed path (without ".yaml") and their schemas. The
 * path's folder and file name become the bundle keys: "balance/creation"
 * is bundle.balance.creation.
 */
export const singletonTypes = {
  'balance/creation': creationBalanceSchema,
  'character/identity': identityOptionsSchema,
  'character/appearance': appearanceOptionsSchema,
} as const;

export type SingletonPath = keyof typeof singletonTypes;

export const contentBundleSchema = z.strictObject({
  contentVersion: z.string().min(1),
  cities: z.record(z.string(), citySchema),
  names: z.record(z.string(), namePoolSchema),
  pronouns: z.record(z.string(), pronounPresetSchema),
  talents: z.record(z.string(), talentSchema),
  balance: z.strictObject({ creation: creationBalanceSchema }),
  character: z.strictObject({ identity: identityOptionsSchema, appearance: appearanceOptionsSchema }),
});

/** The compiled, validated content the app loads at runtime. */
export type ContentBundle = z.infer<typeof contentBundleSchema>;
