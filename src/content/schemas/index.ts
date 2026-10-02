import { z } from 'zod';
import {
  agingBalanceSchema,
  creationBalanceSchema,
  eventsBalanceSchema,
  mortalityBalanceSchema,
  pacingBalanceSchema,
  targetsBalanceSchema,
} from './balance';
import { actionRegistrySchema, relationshipsBalanceSchema } from './relationships';
import { careersBalanceSchema, jobSchema, workRegistrySchema } from './careers';
import { appearanceOptionsSchema, identityOptionsSchema, namePoolSchema, pronounPresetSchema, talentSchema } from './character';
import { citySchema } from './city';
import { economyBalanceSchema, triggerRegistrySchema } from './economy';
import { educationBalanceSchema, gradProgramSchema, majorSchema, tradeSchema } from './education';
import { categoryRegistrySchema, eventSchema, flagRegistrySchema, memoryRegistrySchema } from './events';
import { causeSchema, historyTextSchema, legalTextSchema, obituaryTextSchema, relationWordsSchema, timeTextSchema } from './text';
import { conditionDefSchema, healthBalanceSchema, healthRegistrySchema } from './health';
import { legalBalanceSchema, legalRegistrySchema, offenseSchema } from './legal';
import { discoveryBalanceSchema, discoveryRegistrySchema, discoveryTextSchema } from './discovery';

export * from './balance';
export * from './careers';
export * from './character';
export * from './city';
export * from './common';
export * from './economy';
export * from './education';
export * from './events';
export * from './relationships';
export * from './text';
export * from './health';
export * from './legal';
export * from './discovery';

/**
 * Collections: a folder under src/content with one YAML file per definition,
 * named after its id. Adding a collection means adding a schema, one entry
 * here and one field in contentBundleSchema.
 */
export const collectionTypes = {
  causes: { folder: 'causes', schema: causeSchema },
  cities: { folder: 'cities', schema: citySchema },
  conditions: { folder: 'conditions', schema: conditionDefSchema },
  /** Nested by life stage and category, and chain files hold several events (see compile.ts). */
  events: { folder: 'events', schema: eventSchema },
  gradPrograms: { folder: 'grad', schema: gradProgramSchema },
  jobs: { folder: 'jobs', schema: jobSchema },
  majors: { folder: 'majors', schema: majorSchema },
  names: { folder: 'names', schema: namePoolSchema },
  offenses: { folder: 'offenses', schema: offenseSchema },
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
  'balance/careers': careersBalanceSchema,
  'balance/health': healthBalanceSchema,
  'balance/legal': legalBalanceSchema,
  'balance/discovery': discoveryBalanceSchema,
  'balance/targets': targetsBalanceSchema,
  'character/identity': identityOptionsSchema,
  'character/appearance': appearanceOptionsSchema,
  'text/relations': relationWordsSchema,
  'text/history': historyTextSchema,
  'text/obituary': obituaryTextSchema,
  'text/legal': legalTextSchema,
  'text/discovery': discoveryTextSchema,
  'text/time': timeTextSchema,
  'registries/memories': memoryRegistrySchema,
  'registries/flags': flagRegistrySchema,
  'registries/categories': categoryRegistrySchema,
  'registries/actions': actionRegistrySchema,
  'registries/triggers': triggerRegistrySchema,
  'registries/work': workRegistrySchema,
  'registries/health': healthRegistrySchema,
  'registries/legal': legalRegistrySchema,
  'registries/discovery': discoveryRegistrySchema,
} as const;

export type SingletonPath = keyof typeof singletonTypes;

export const contentBundleSchema = z.strictObject({
  contentVersion: z.string().min(1),
  causes: z.record(z.string(), causeSchema),
  cities: z.record(z.string(), citySchema),
  conditions: z.record(z.string(), conditionDefSchema),
  events: z.record(z.string(), eventSchema),
  gradPrograms: z.record(z.string(), gradProgramSchema),
  jobs: z.record(z.string(), jobSchema),
  majors: z.record(z.string(), majorSchema),
  names: z.record(z.string(), namePoolSchema),
  offenses: z.record(z.string(), offenseSchema),
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
    careers: careersBalanceSchema,
    health: healthBalanceSchema,
    legal: legalBalanceSchema,
    discovery: discoveryBalanceSchema,
    targets: targetsBalanceSchema,
  }),
  character: z.strictObject({ identity: identityOptionsSchema, appearance: appearanceOptionsSchema }),
  text: z.strictObject({
    relations: relationWordsSchema,
    history: historyTextSchema,
    obituary: obituaryTextSchema,
    legal: legalTextSchema,
    discovery: discoveryTextSchema,
    time: timeTextSchema,
  }),
  registries: z.strictObject({
    memories: memoryRegistrySchema,
    flags: flagRegistrySchema,
    categories: categoryRegistrySchema,
    actions: actionRegistrySchema,
    triggers: triggerRegistrySchema,
    work: workRegistrySchema,
    health: healthRegistrySchema,
    legal: legalRegistrySchema,
    discovery: discoveryRegistrySchema,
  }),
});

/** The compiled, validated content the app loads at runtime. */
export type ContentBundle = z.infer<typeof contentBundleSchema>;
