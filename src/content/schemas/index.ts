import { z } from 'zod';
import { agingBalanceSchema, creationBalanceSchema, mortalityBalanceSchema } from './balance';
import { appearanceOptionsSchema, identityOptionsSchema, namePoolSchema, pronounPresetSchema, talentSchema } from './character';
import { citySchema } from './city';
import { causeSchema, historyTextSchema, obituaryTextSchema, relationWordsSchema } from './text';

export * from './balance';
export * from './character';
export * from './city';
export * from './common';
export * from './text';

/**
 * Collections: a folder under src/content with one YAML file per definition,
 * named after its id. Adding a collection means adding a schema, one entry
 * here and one field in contentBundleSchema.
 */
export const collectionTypes = {
  causes: { folder: 'causes', schema: causeSchema },
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
  'balance/aging': agingBalanceSchema,
  'balance/mortality': mortalityBalanceSchema,
  'character/identity': identityOptionsSchema,
  'character/appearance': appearanceOptionsSchema,
  'text/relations': relationWordsSchema,
  'text/history': historyTextSchema,
  'text/obituary': obituaryTextSchema,
} as const;

export type SingletonPath = keyof typeof singletonTypes;

export const contentBundleSchema = z.strictObject({
  contentVersion: z.string().min(1),
  causes: z.record(z.string(), causeSchema),
  cities: z.record(z.string(), citySchema),
  names: z.record(z.string(), namePoolSchema),
  pronouns: z.record(z.string(), pronounPresetSchema),
  talents: z.record(z.string(), talentSchema),
  balance: z.strictObject({
    creation: creationBalanceSchema,
    aging: agingBalanceSchema,
    mortality: mortalityBalanceSchema,
  }),
  character: z.strictObject({ identity: identityOptionsSchema, appearance: appearanceOptionsSchema }),
  text: z.strictObject({ relations: relationWordsSchema, history: historyTextSchema, obituary: obituaryTextSchema }),
});

/** The compiled, validated content the app loads at runtime. */
export type ContentBundle = z.infer<typeof contentBundleSchema>;
