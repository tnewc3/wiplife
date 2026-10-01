import { z } from 'zod';
import {
  agingBalanceSchema,
  creationBalanceSchema,
  eventsBalanceSchema,
  mortalityBalanceSchema,
  pacingBalanceSchema,
} from './balance';
import { actionRegistrySchema, relationshipsBalanceSchema } from './relationships';
import { appearanceOptionsSchema, identityOptionsSchema, namePoolSchema, pronounPresetSchema, talentSchema } from './character';
import { citySchema } from './city';
import { economyBalanceSchema, triggerRegistrySchema } from './economy';
import { educationBalanceSchema, gradProgramSchema, majorSchema, tradeSchema } from './education';
import { categoryRegistrySchema, eventSchema, flagRegistrySchema, memoryRegistrySchema } from './events';
import { causeSchema, historyTextSchema, obituaryTextSchema, relationWordsSchema } from './text';

export * from './balance';
export * from './character';
export * from './city';
export * from './common';
export * from './economy';
export * from './education';
export * from './events';
export * from './relationships';
export * from './text';

/**
 * Collections: a folder under src/content with one YAML file per definition,
 * named after its id. Adding a collection means adding a schema, one entry
 * here and one field in contentBundleSchema.
 */
export const collectionTypes = {
  causes: { folder: 'causes', schema: causeSchema },
  cities: { folder: 'cities', schema: citySchema },
  /** Nested by life stage and category, and chain files hold several events (see compile.ts). */
  events: { folder: 'events', schema: eventSchema },
  gradPrograms: { folder: 'grad', schema: gradProgramSchema },
  majors: { folder: 'majors', schema: majorSchema },
  names: { folder: 'names', schema: namePoolSchema },
  pronouns: { folder: 'pronouns', schema: pronounPresetSchema },
  talents: { folder: 'talents', schema: talentSchema },
  trades: { folder: 'trades', schema: tradeSchema },
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
  'balance/pacing': pacingBalanceSchema,
  'balance/events': eventsBalanceSchema,
  'balance/relationships': relationshipsBalanceSchema,
  'balance/economy': economyBalanceSchema,
  'balance/education': educationBalanceSchema,
  'character/identity': identityOptionsSchema,
  'character/appearance': appearanceOptionsSchema,
  'text/relations': relationWordsSchema,
  'text/history': historyTextSchema,
  'text/obituary': obituaryTextSchema,
  'registries/memories': memoryRegistrySchema,
  'registries/flags': flagRegistrySchema,
  'registries/categories': categoryRegistrySchema,
  'registries/actions': actionRegistrySchema,
  'registries/triggers': triggerRegistrySchema,
} as const;

export type SingletonPath = keyof typeof singletonTypes;

export const contentBundleSchema = z.strictObject({
  contentVersion: z.string().min(1),
  causes: z.record(z.string(), causeSchema),
  cities: z.record(z.string(), citySchema),
  events: z.record(z.string(), eventSchema),
  gradPrograms: z.record(z.string(), gradProgramSchema),
  majors: z.record(z.string(), majorSchema),
  names: z.record(z.string(), namePoolSchema),
  pronouns: z.record(z.string(), pronounPresetSchema),
  talents: z.record(z.string(), talentSchema),
  trades: z.record(z.string(), tradeSchema),
  balance: z.strictObject({
    creation: creationBalanceSchema,
    aging: agingBalanceSchema,
    mortality: mortalityBalanceSchema,
    pacing: pacingBalanceSchema,
    events: eventsBalanceSchema,
    relationships: relationshipsBalanceSchema,
    economy: economyBalanceSchema,
    education: educationBalanceSchema,
  }),
  character: z.strictObject({ identity: identityOptionsSchema, appearance: appearanceOptionsSchema }),
  text: z.strictObject({ relations: relationWordsSchema, history: historyTextSchema, obituary: obituaryTextSchema }),
  registries: z.strictObject({
    memories: memoryRegistrySchema,
    flags: flagRegistrySchema,
    categories: categoryRegistrySchema,
    actions: actionRegistrySchema,
    triggers: triggerRegistrySchema,
  }),
});

/** The compiled, validated content the app loads at runtime. */
export type ContentBundle = z.infer<typeof contentBundleSchema>;
