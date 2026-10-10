import { z } from 'zod';
import { baseDefSchema } from './common';

/** One piece of template text (see src/engine/text.ts for placeholders). */
export const templateSchema = z.string().trim().min(1).max(600);
/** Alternative wordings; one is picked at random. */
export const variantsSchema = z.array(templateSchema).min(1);

const byCategorySchema = z.strictObject({
  man: z.string().trim().min(1).max(40),
  woman: z.string().trim().min(1).max(40),
  nonbinary: z.string().trim().min(1).max(40),
});

/** A cause of death, as it reads after "died of". */
export const causeSchema = baseDefSchema.extend({
  text: z.string().trim().min(1).max(80),
});
export type CauseDef = z.infer<typeof causeSchema>;

/**
 * Words for relatives, partners and friends in story text ("your mother",
 * "your wife"), by relationship kind and gender category. Interface labels
 * live in src/ui/labels.ts instead. A kind listed here gets a history entry
 * when that person dies.
 */
export const relationWordsSchema = z.strictObject({
  parent: byCategorySchema,
  stepparent: byCategorySchema,
  grandparent: byCategorySchema,
  relative: byCategorySchema,
  sibling: byCategorySchema,
  child: byCategorySchema,
  stepchild: byCategorySchema,
  grandchild: byCategorySchema,
  partner: byCategorySchema,
  fiance: byCategorySchema,
  spouse: byCategorySchema,
  ex: byCategorySchema,
  friend: byCategorySchema,
});
export type RelationWords = z.infer<typeof relationWordsSchema>;

/**
 * School milestones in text/history.yaml (education) and the values each may
 * use: {school} is a school's name, {subject} what you study, {grade} a
 * letter grade, {degree} a grad degree and {license} a trade license.
 */
export const EDUCATION_HISTORY_VALUES = {
  startedSchool: [],
  startedMiddle: [],
  startedHigh: [],
  heldBack: [],
  graduatedHigh: ['grade'],
  droppedOut: ['school'],
  expelled: ['school'],
  passedGed: [],
  failedGed: [],
  admitted: ['school'],
  rejected: ['school'],
  withdrawn: ['school'],
  declined: ['school'],
  enrolled: ['school', 'subject'],
  returned: ['school', 'subject'],
  returnedHigh: ['school'],
  changedMajor: ['subject'],
  graduatedAssociate: ['school', 'subject', 'grade'],
  graduatedBachelor: ['school', 'subject', 'grade'],
  graduatedGrad: ['school', 'degree', 'grade'],
  licensed: ['school', 'license'],
} as const satisfies Record<string, readonly string[]>;
export type EducationHistoryKey = keyof typeof EDUCATION_HISTORY_VALUES;

/**
 * Work milestones in text/history.yaml (career, Stage 8) and the values each
 * may use: {title} is a job title ("junior developer"), {employer} where you
 * work, {years} how long you worked.
 */
export const CAREER_HISTORY_VALUES = {
  hired: ['title', 'employer'],
  promoted: ['title', 'employer'],
  fired: ['title', 'employer'],
  laidOff: ['title', 'employer'],
  quit: ['title', 'employer'],
  leftForSchool: ['title', 'employer'],
  fellThrough: ['title', 'employer'],
  moved: ['title', 'employer'],
  /** Lost to a prison sentence (Stage 9). */
  jailed: ['title', 'employer'],
  retired: ['years'],
} as const satisfies Record<string, readonly string[]>;
export type CareerHistoryKey = keyof typeof CAREER_HISTORY_VALUES;

/**
 * Health milestones in text/history.yaml (health, Stage 9): {condition} is a
 * condition as it reads in a sentence ("type 2 diabetes").
 */
export const HEALTH_HISTORY_VALUES = {
  diagnosed: ['condition'],
  treated: ['condition'],
  recovered: ['condition'],
  relapsed: ['condition'],
} as const satisfies Record<string, readonly string[]>;
export type HealthHistoryKey = keyof typeof HEALTH_HISTORY_VALUES;

/**
 * Legal milestones in text/history.yaml (legal, Stage 9): {offense} as it
 * reads in a sentence ("shoplifting"), {amount} a fine, {years} a length of
 * time ("two years").
 */
export const LEGAL_HISTORY_VALUES = {
  warning: ['offense'],
  fine: ['offense', 'amount'],
  probation: ['offense', 'years'],
  jail: ['offense', 'years'],
  released: [],
  probationEnded: [],
} as const satisfies Record<string, readonly string[]>;
export type LegalHistoryKey = keyof typeof LEGAL_HISTORY_VALUES;

/**
 * Self-discovery milestones in text/history.yaml (discovery, Stage 9):
 * accepting a change, or editing your identity in the Profile sheet.
 * {people} who you're attracted to now ("men and women"), {gender} your
 * gender identity, {expression} your gender expression, {pronouns} your
 * pronouns ("she/her"), {trait} the personality tendency you found, {talent}
 * your talent ("music").
 */
export const DISCOVERY_HISTORY_VALUES = {
  attraction: ['people'],
  gender: ['gender'],
  expression: ['expression'],
  pronouns: ['pronouns'],
  personality: ['trait'],
  talent: ['talent'],
} as const satisfies Record<string, readonly string[]>;
export type DiscoveryHistoryKey = keyof typeof DISCOVERY_HISTORY_VALUES;

const importanceSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const historyGroupSchema = z.strictObject({ importance: importanceSchema, variants: variantsSchema });

/** Milestone entries the yearly systems write to a life's history. */
export const historyTextSchema = z.strictObject({
  /** Entering a life stage. Values: {age}. */
  lifeStage: z.strictObject({
    child: historyGroupSchema,
    teen: historyGroupSchema,
    youngAdult: historyGroupSchema,
    adult: historyGroupSchema,
    senior: historyGroupSchema,
  }),
  /** A relative, partner or friend dies. Role: npc. Values: {relation}, {age}. */
  familyDeath: historyGroupSchema,
  /** The character dies. Values: {age}, {cause}. */
  death: historyGroupSchema,
  /** Changes of home (Stage 6). Values: {city}; relocated also {from}. */
  home: z.strictObject({
    /** Moved out of the family home into a rental. */
    movedOut: historyGroupSchema,
    /** Moved back in with a parent. */
    movedHome: historyGroupSchema,
    /** Moved to another city. Values: {city}, {from}. */
    relocated: historyGroupSchema,
    boughtHome: historyGroupSchema,
    soldHome: historyGroupSchema,
    /** No parent left to live with: you rent a place of your own. */
    familyHomeGone: historyGroupSchema,
    evicted: historyGroupSchema,
    foreclosed: historyGroupSchema,
    /** A partner who lived with you moves out after a breakup or divorce. Role: npc; no values. */
    movedApart: historyGroupSchema,
  }),
  /** Money milestones (Stage 6). No values. */
  money: z.strictObject({
    /** A debt went to collections. */
    collections: historyGroupSchema,
    mortgagePaidOff: historyGroupSchema,
    /** Started doing gig work. */
    startedGig: historyGroupSchema,
  }),
  /** School milestones (Stage 7). The values each one may use are in EDUCATION_HISTORY_VALUES. */
  education: z.strictObject(
    Object.fromEntries(Object.keys(EDUCATION_HISTORY_VALUES).map((k) => [k, historyGroupSchema])) as Record<
      EducationHistoryKey,
      typeof historyGroupSchema
    >,
  ),
  /** Work milestones (Stage 8). The values each one may use are in CAREER_HISTORY_VALUES. */
  career: z.strictObject(
    Object.fromEntries(Object.keys(CAREER_HISTORY_VALUES).map((k) => [k, historyGroupSchema])) as Record<
      CareerHistoryKey,
      typeof historyGroupSchema
    >,
  ),
  /** Health milestones (Stage 9). The values each one may use are in HEALTH_HISTORY_VALUES. */
  health: z.strictObject(
    Object.fromEntries(Object.keys(HEALTH_HISTORY_VALUES).map((k) => [k, historyGroupSchema])) as Record<
      HealthHistoryKey,
      typeof historyGroupSchema
    >,
  ),
  /** Legal milestones (Stage 9). The values each one may use are in LEGAL_HISTORY_VALUES. */
  legal: z.strictObject(
    Object.fromEntries(Object.keys(LEGAL_HISTORY_VALUES).map((k) => [k, historyGroupSchema])) as Record<
      LegalHistoryKey,
      typeof historyGroupSchema
    >,
  ),
  /** Your children (E2a). Role: npc, the child. No values. */
  family: z.strictObject({
    /** A grown child moves out. */
    childMovedOut: historyGroupSchema,
  }),
  /** Self-discovery milestones (Stage 9). The values each one may use are in DISCOVERY_HISTORY_VALUES. */
  discovery: z.strictObject(
    Object.fromEntries(Object.keys(DISCOVERY_HISTORY_VALUES).map((k) => [k, historyGroupSchema])) as Record<
      DiscoveryHistoryKey,
      typeof historyGroupSchema
    >,
  ),
});
export type HistoryText = z.infer<typeof historyTextSchema>;

/** Variants by how the life went (src/engine/obituary.ts lifeTone; thresholds in balance/aging.yaml obituary). */
export const OBITUARY_TONES = ['bright', 'mixed', 'heavy'] as const;
export type ObituaryTone = (typeof OBITUARY_TONES)[number];
const tonedSchema = z.strictObject({ bright: variantsSchema, mixed: variantsSchema, heavy: variantsSchema });

/** The highest credential, as the obituary words it. */
export const OBITUARY_EDUCATION_KEYS = ['none', 'highSchool', 'ged', 'trade', 'associate', 'bachelor', 'grad'] as const;
export type ObituaryEducationKey = (typeof OBITUARY_EDUCATION_KEYS)[number];

/**
 * Obituary, version 2 (Stage 10). Each section offers variants; the obituary
 * generator (src/engine/obituary.ts) picks one per section and joins them.
 * Tone-matched sections have bright, mixed and heavy variants.
 */
export const obituaryTextSchema = z.strictObject({
  /** Values: {age}, {year}, {city}, {cause} (finished only). */
  opening: z.strictObject({ finished: tonedSchema, unfinished: variantsSchema }),
  /** Values: {birthYear}, {birthCity}, {parents}. */
  origins: variantsSchema,
  /** The highest credential. Values: {subject}, {license} (trade), {degree} (grad). */
  education: z.strictObject(
    Object.fromEntries(OBITUARY_EDUCATION_KEYS.map((k) => [k, variantsSchema])) as Record<ObituaryEducationKey, typeof variantsSchema>,
  ),
  /** peak (above a first level) and worked (a first level): values {title}, {employer}, {years}. retired: {years}. never: none. */
  career: z.strictObject({ peak: tonedSchema, worked: variantsSchema, retired: variantsSchema, never: variantsSchema }),
  /** married and widowed: role npc, values {year}. divorced: {exes}. single: none. */
  love: z.strictObject({ married: tonedSchema, widowed: variantsSchema, divorced: variantsSchema, single: variantsSchema }),
  /** Notable events by event id, one line each. No values. */
  moments: z.record(z.string(), templateSchema),
  /** Things the life did, by flag, one line each. No values. */
  deeds: z.record(z.string(), templateSchema),
  /** prison: values {years}. bankrupt: values {year}. */
  hardship: z.strictObject({ prison: variantsSchema, bankrupt: variantsSchema }),
  /** Relatives alive at the end. Values: {survivors}. Finished lives only. */
  survivedBy: variantsSchema,
  /** Relatives who died first. Values: {predeceased}. Finished lives only. */
  predeceasedBy: variantsSchema,
  /** By lifetime average Happiness: the first band whose minHappiness it reaches. No values. */
  mood: z.array(z.strictObject({ minHappiness: z.int().min(0).max(100), variants: variantsSchema })).min(1),
  /** No values. */
  closing: z.strictObject({ finished: tonedSchema, unfinished: variantsSchema }),
  /** One relative in a list. Role: npc. Values: {relation}. */
  relative: templateSchema,
  /** Joining lists of names. Values: {first}, {second} / {items}, {last}. */
  list: z.strictObject({ pair: templateSchema, serial: templateSchema, separator: z.string().min(1).max(5) }),
});
export type ObituaryText = z.infer<typeof obituaryTextSchema>;

/**
 * Words for the law (text/legal.yaml, Stage 9): a sentence as it reads inside
 * event outcome text ({sentence}: "a $500 fine", "two years in prison"),
 * with {amount} and {years}; and a number of years ({n}).
 */
export const legalTextSchema = z.strictObject({
  sentence: z.strictObject({ warning: templateSchema, fine: templateSchema, probation: templateSchema, jail: templateSchema }),
  years: z.strictObject({ one: templateSchema, many: templateSchema }),
});
export type LegalText = z.infer<typeof legalTextSchema>;

/** Elapsed time in follow-up text, {since} (C1). Small numbers are written out. */
export const timeTextSchema = z.strictObject({
  since: z.strictObject({ one: templateSchema, many: templateSchema, unknown: templateSchema }),
  numbers: z.array(z.string().min(1)).min(2),
});
export type TimeText = z.infer<typeof timeTextSchema>;
