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
  sibling: byCategorySchema,
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
  moved: ['title', 'employer'],
  retired: ['years'],
} as const satisfies Record<string, readonly string[]>;
export type CareerHistoryKey = keyof typeof CAREER_HISTORY_VALUES;

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
});
export type HistoryText = z.infer<typeof historyTextSchema>;

const outcomeVariantsSchema = z.strictObject({
  /** Used when the character died. */
  finished: z.array(templateSchema),
  /** Used when the life was set aside unfinished. */
  unfinished: z.array(templateSchema),
});

/**
 * Obituary, version 1. Each section offers variants; the obituary generator
 * (src/engine/obituary.ts) picks one per section and joins them. An empty list
 * skips the section. Later stages add sections here and in the generator.
 */
export const obituaryTextSchema = z.strictObject({
  /** Values: {age}, {year}, {city}, {cause} (finished only). */
  opening: outcomeVariantsSchema,
  /** Values: {birthYear}, {birthCity}, {parents}. */
  origins: variantsSchema,
  /** Relatives alive at the end. Values: {survivors}. Finished lives only. */
  survivedBy: variantsSchema,
  /** Relatives who died first. Values: {predeceased}. Finished lives only. */
  predeceasedBy: variantsSchema,
  /** By lifetime average Happiness: the first band whose minHappiness it reaches. No values. */
  mood: z.array(z.strictObject({ minHappiness: z.int().min(0).max(100), variants: variantsSchema })).min(1),
  /** No values. */
  closing: outcomeVariantsSchema,
  /** One relative in a list. Role: npc. Values: {relation}. */
  relative: templateSchema,
  /** Joining lists of names. Values: {first}, {second} / {items}, {last}. */
  list: z.strictObject({ pair: templateSchema, serial: templateSchema, separator: z.string().min(1).max(5) }),
});
export type ObituaryText = z.infer<typeof obituaryTextSchema>;
