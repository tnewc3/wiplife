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
import { eulogyBalanceSchema, eulogyTextSchema } from './eulogy';
import { laterBalanceSchema, laterRegistrySchema, laterTextSchema, reviewTextSchema } from './later';
import { mentalHealthBalanceSchema, mentalRegistrySchema } from './mental';
import { petInteractionSchema, petSchema, possessionsBalanceSchema, possessionsRegistrySchema, possessionsTextSchema, renovationSchema, vehicleSchema } from './possessions';
import { crewSchema, crimeBalanceSchema, crimeRegistrySchema, crimeTextSchema, frontSchema } from './crime';
import { sportsBalanceSchema, sportsRegistrySchema, sportsTextSchema } from './sports';
import { fameAgentSchema, fameAwardSchema, fameBalanceSchema, fameCompanySchema, famePathSchema, fameRegistrySchema, fameTextSchema } from './fame';
import { activitySchema, cliqueSchema, houseRuleSchema, teenBalanceSchema, teenJobSchema, teenRegistrySchema, teenTextSchema } from './teen';
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
export * from './teen';
export * from './crime';
export * from './fame';
export * from './sports';
export * from './eulogy';
export * from './later';

/**
 * Collections: a folder under src/content with one YAML file per definition,
 * named after its id. Adding a collection means adding a schema, one entry
 * here and one field in contentBundleSchema.
 */
export const collectionTypes = {
  activities: { folder: 'activities', schema: activitySchema },
  fameAgents: { folder: 'agents', schema: fameAgentSchema },
  fameAwards: { folder: 'awards', schema: fameAwardSchema },
  famePaths: { folder: 'fame', schema: famePathSchema },
  fameCompanies: { folder: 'studios', schema: fameCompanySchema },
  causes: { folder: 'causes', schema: causeSchema },
  cliques: { folder: 'cliques', schema: cliqueSchema },
  crews: { folder: 'crews', schema: crewSchema },
  cities: { folder: 'cities', schema: citySchema },
  conditions: { folder: 'conditions', schema: conditionDefSchema },
  /** Nested by life stage and category, and chain files hold several events (see compile.ts). */
  events: { folder: 'events', schema: eventSchema },
  fronts: { folder: 'fronts', schema: frontSchema },
  gradPrograms: { folder: 'grad', schema: gradProgramSchema },
  houseRules: { folder: 'houseRules', schema: houseRuleSchema },
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
  teenJobs: { folder: 'teenJobs', schema: teenJobSchema },
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
  'balance/eulogy': eulogyBalanceSchema,
  'balance/later': laterBalanceSchema,
  'balance/mental-health': mentalHealthBalanceSchema,
  'balance/possessions': possessionsBalanceSchema,
  'balance/teen': teenBalanceSchema,
  'balance/crime': crimeBalanceSchema,
  'balance/fame': fameBalanceSchema,
  'balance/sports': sportsBalanceSchema,
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
  'text/eulogy': eulogyTextSchema,
  'text/later': laterTextSchema,
  'text/review': reviewTextSchema,
  'text/news': newsTextSchema,
  'text/possessions': possessionsTextSchema,
  'text/teen': teenTextSchema,
  'text/crime': crimeTextSchema,
  'text/fame': fameTextSchema,
  'text/sports': sportsTextSchema,
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
  'registries/teen': teenRegistrySchema,
  'registries/crime': crimeRegistrySchema,
  'registries/fame': fameRegistrySchema,
  'registries/sports': sportsRegistrySchema,
  'registries/later': laterRegistrySchema,
} as const;

export type SingletonPath = keyof typeof singletonTypes;

export const contentBundleSchema = z.strictObject({
  contentVersion: z.string().min(1),
  activities: z.record(z.string(), activitySchema),
  fameAgents: z.record(z.string(), fameAgentSchema),
  fameAwards: z.record(z.string(), fameAwardSchema),
  famePaths: z.record(z.string(), famePathSchema),
  fameCompanies: z.record(z.string(), fameCompanySchema),
  causes: z.record(z.string(), causeSchema),
  cliques: z.record(z.string(), cliqueSchema),
  crews: z.record(z.string(), crewSchema),
  cities: z.record(z.string(), citySchema),
  conditions: z.record(z.string(), conditionDefSchema),
  events: z.record(z.string(), eventSchema),
  fronts: z.record(z.string(), frontSchema),
  gradPrograms: z.record(z.string(), gradProgramSchema),
  houseRules: z.record(z.string(), houseRuleSchema),
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
  teenJobs: z.record(z.string(), teenJobSchema),
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
    eulogy: eulogyBalanceSchema,
    later: laterBalanceSchema,
    mentalHealth: mentalHealthBalanceSchema,
    possessions: possessionsBalanceSchema,
    teen: teenBalanceSchema,
    crime: crimeBalanceSchema,
    fame: fameBalanceSchema,
    sports: sportsBalanceSchema,
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
    eulogy: eulogyTextSchema,
    later: laterTextSchema,
    review: reviewTextSchema,
    news: newsTextSchema,
    possessions: possessionsTextSchema,
    teen: teenTextSchema,
    crime: crimeTextSchema,
    fame: fameTextSchema,
    sports: sportsTextSchema,
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
    teen: teenRegistrySchema,
    crime: crimeRegistrySchema,
    fame: fameRegistrySchema,
    sports: sportsRegistrySchema,
    later: laterRegistrySchema,
  }),
});

/** The compiled, validated content the app loads at runtime. */
export type ContentBundle = z.infer<typeof contentBundleSchema>;
