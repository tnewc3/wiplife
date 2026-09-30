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
 * Words for relatives in story text ("your mother"), by relationship kind and
 * gender category. Interface labels live in src/ui/labels.ts instead.
 */
export const relationWordsSchema = z.strictObject({
  parent: byCategorySchema,
  stepparent: byCategorySchema,
  grandparent: byCategorySchema,
  sibling: byCategorySchema,
});
export type RelationWords = z.infer<typeof relationWordsSchema>;

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
  /** A relative dies. Role: npc. Values: {relation}, {age}. */
  familyDeath: historyGroupSchema,
  /** The character dies. Values: {age}, {cause}. */
  death: historyGroupSchema,
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
  /** By Happiness: the first band whose minHappiness it reaches. No values. */
  mood: z.array(z.strictObject({ minHappiness: z.int().min(0).max(100), variants: variantsSchema })).min(1),
  /** No values. */
  closing: outcomeVariantsSchema,
  /** One relative in a list. Role: npc. Values: {relation}. */
  relative: templateSchema,
  /** Joining lists of names. Values: {first}, {second} / {items}, {last}. */
  list: z.strictObject({ pair: templateSchema, serial: templateSchema, separator: z.string().min(1).max(5) }),
});
export type ObituaryText = z.infer<typeof obituaryTextSchema>;
