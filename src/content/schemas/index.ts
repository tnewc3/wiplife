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
import { interactionRegistrySchema, interactionSchema, interactionsBalanceSchema } from './interactions';
import { newsTextSchema, peopleBalanceSchema, peopleRegistrySchema } from './people';
import { webBalanceSchema, webRegistrySchema } from './web';
import { mentalHealthBalanceSchema, mentalRegistrySchema } from './mental';
import { petInteractionSchema, petSchema, possessionsBalanceSchema, possessionsRegistrySchema, possessionsTextSchema, renovationSchema, vehicleSchema } from './possessions';
import { estateRegistrySchema, familyBalanceSchema, familyRegistrySchema, heirRegistrySchema, heirTextSchema } from './family';

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
export * from './interactions';
export * from './family';
export * from './people';
export * from './web';
export * from './mental';
export * from './possessions';

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
  interactions: { folder: 'interactions', schema: interactionSchema },
  jobs: { folder: 'jobs', schema: jobSchema },
  majors: { folder: 'majors', schema: majorSchema },
  names: { folder: 'names', schema: namePoolSchema },
  offenses: { folder: 'offenses', schema: offenseSchema },
  petInteractions: { folder: 'petInteractions', schema: petInteractionSchema },
  pets: { folder: 'pets', schema: petSchema },
  pronouns: { folder: 'pronouns', schema: pronounPresetSchema },
  renovations: { folder: 'renovations', schema: renovationSchema },
  talents: { folder: 'talents', schema: talentSchema },
  trades: { folder: 'trades', schema: tradeSchema },
  vehicles: { folder: 'vehicles', schema: vehicleSchema },
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
  'balance/interactions': interactionsBalanceSchema,
  'balance/family': familyBalanceSchema,
  'balance/people': peopleBalanceSchema,
  'balance/web': webBalanceSchema,
  'balance/mental-health': mentalHealthBalanceSchema,
  'balance/possessions': possessionsBalanceSchema,
  'balance/targets': targetsBalanceSchema,
  'character/identity': identityOptionsSchema,
  'character/appearance': appearanceOptionsSchema,
  'text/relations': relationWordsSchema,
  'text/history': historyTextSchema,
  'text/obituary': obituaryTextSchema,
  'text/legal': legalTextSchema,
  'text/discovery': discoveryTextSchema,
  'text/time': timeTextSchema,
  'text/heir': heirTextSchema,
  'text/news': newsTextSchema,
  'text/possessions': possessionsTextSchema,
  'registries/memories': memoryRegistrySchema,
  'registries/flags': flagRegistrySchema,
  'registries/categories': categoryRegistrySchema,
  'registries/actions': actionRegistrySchema,
  'registries/triggers': triggerRegistrySchema,
  'registries/work': workRegistrySchema,
  'registries/health': healthRegistrySchema,
  'registries/legal': legalRegistrySchema,
  'registries/discovery': discoveryRegistrySchema,
  'registries/interactions': interactionRegistrySchema,
  'registries/family': familyRegistrySchema,
  'registries/estate': estateRegistrySchema,
  'registries/heir': heirRegistrySchema,
  'registries/people': peopleRegistrySchema,
  'registries/web': webRegistrySchema,
  'registries/mental': mentalRegistrySchema,
  'registries/possessions': possessionsRegistrySchema,
} as const;

export type SingletonPath = keyof typeof singletonTypes;

export const contentBundleSchema = z.strictObject({
  contentVersion: z.string().min(1),
  causes: z.record(z.string(), causeSchema),
  cities: z.record(z.string(), citySchema),
  conditions: z.record(z.string(), conditionDefSchema),
  events: z.record(z.string(), eventSchema),
  gradPrograms: z.record(z.string(), gradProgramSchema),
  interactions: z.record(z.string(), interactionSchema),
  jobs: z.record(z.string(), jobSchema),
  majors: z.record(z.string(), majorSchema),
  names: z.record(z.string(), namePoolSchema),
  offenses: z.record(z.string(), offenseSchema),
  petInteractions: z.record(z.string(), petInteractionSchema),
  pets: z.record(z.string(), petSchema),
  pronouns: z.record(z.string(), pronounPresetSchema),
  renovations: z.record(z.string(), renovationSchema),
  talents: z.record(z.string(), talentSchema),
  trades: z.record(z.string(), tradeSchema),
  vehicles: z.record(z.string(), vehicleSchema),
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
    interactions: interactionsBalanceSchema,
    family: familyBalanceSchema,
    people: peopleBalanceSchema,
    web: webBalanceSchema,
    mentalHealth: mentalHealthBalanceSchema,
    possessions: possessionsBalanceSchema,
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
    heir: heirTextSchema,
    news: newsTextSchema,
    possessions: possessionsTextSchema,
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
    interactions: interactionRegistrySchema,
    family: familyRegistrySchema,
    estate: estateRegistrySchema,
    heir: heirRegistrySchema,
    people: peopleRegistrySchema,
    web: webRegistrySchema,
    mental: mentalRegistrySchema,
    possessions: possessionsRegistrySchema,
  }),
});

/** The compiled, validated content the app loads at runtime. */
export type ContentBundle = z.infer<typeof contentBundleSchema>;
