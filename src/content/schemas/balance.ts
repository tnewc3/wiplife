import { z } from 'zod';
import { genderCategorySchema } from './character';

const weightSchema = z.number().nonnegative();
/** Relative weights keyed by option; at least one must be positive. */
const weightsSchema = <K extends z.ZodType<string>>(key: K) =>
  z.record(key, weightSchema).refine((w) => Object.values(w).some((v) => (v as number) > 0), 'needs a positive weight');

const probabilitySchema = z.number().min(0).max(1);

/** A roll around a mean: sd is the spread; results are clamped to 0–100. */
export const distributionSchema = z.strictObject({
  mean: z.number().min(0).max(100),
  sd: z.number().min(0).max(50),
});
export type Distribution = z.infer<typeof distributionSchema>;

const familyWealthSchema = z.enum(['poor', 'working', 'middle', 'affluent', 'rich']);

/** Numbers used when a new life is created (src/content/balance/creation.yaml). */
export const creationBalanceSchema = z.strictObject({
  genderCategory: weightsSchema(genderCategorySchema),
  /** Pronoun preset weights for random characters and NPCs, by gender category. */
  pronouns: z.strictObject({
    man: weightsSchema(z.string()),
    woman: weightsSchema(z.string()),
    nonbinary: weightsSchema(z.string()),
  }),
  /** Who random characters are attracted to, by their gender category. */
  attraction: z.strictObject({
    man: z.array(z.strictObject({ to: z.array(genderCategorySchema), weight: weightSchema })).min(1),
    woman: z.array(z.strictObject({ to: z.array(genderCategorySchema), weight: weightSchema })).min(1),
    nonbinary: z.array(z.strictObject({ to: z.array(genderCategorySchema), weight: weightSchema })).min(1),
  }),
  stats: z.strictObject({
    health: distributionSchema,
    happiness: distributionSchema,
    smarts: distributionSchema,
    looks: distributionSchema,
    fitness: distributionSchema,
    stress: distributionSchema,
  }),
  /** Every personality trait of a random character. */
  personality: distributionSchema,
  hidden: z.strictObject({
    luck: distributionSchema,
    reputation: distributionSchema,
    geneticRisk: distributionSchema,
    vice: distributionSchema,
  }),
  /** Chance a character has a hidden talent at all. */
  talentChance: probabilitySchema,
  familyWealth: weightsSchema(familyWealthSchema),
  names: z.strictObject({
    /** How often each heritage in the name pools starts a family. */
    heritageWeights: weightsSchema(z.string()),
    /** Chance two parents share a heritage. */
    sameHeritageParentsChance: probabilitySchema,
  }),
  appearance: z.strictObject({
    /** Chance of one extra distinguishing feature. */
    featureChance: probabilitySchema,
  }),
  /** Chances of a latent trait that differs from the starting one (random and custom alike). */
  latent: z.strictObject({
    orientationChance: probabilitySchema,
    genderChance: probabilitySchema,
    expressionChance: probabilitySchema,
    personalityChance: probabilitySchema,
    /** How far a latent personality trait sits from the visible one. */
    personalityShift: z.strictObject({ min: z.int().min(1).max(100), max: z.int().min(1).max(100) }),
  }),
  family: z.strictObject({
    singleParentChance: probabilitySchema,
    /** Chance two parents share a gender category. */
    sameGenderParentsChance: probabilitySchema,
    /** Parent age when the character is born. */
    parentAgeAtBirth: z.strictObject({
      min: z.int().min(12).max(60),
      max: z.int().min(12).max(70),
      mean: z.number(),
      sd: z.number().nonnegative(),
    }),
    /** Years between the two parents' ages. */
    partnerAgeGap: z.strictObject({ sd: z.number().nonnegative(), max: z.int().nonnegative() }),
    /** Chance both parents share a last name. */
    sharedLastNameChance: probabilitySchema,
    /** Weight of having 0, 1, 2... older siblings at birth (index = count). */
    siblingWeights: z.array(weightSchema).min(1).max(8),
    /** Years between consecutive children. */
    siblingSpacing: z.strictObject({ min: z.int().min(1), max: z.int().min(1) }),
    parentAffection: distributionSchema,
    parentTrust: distributionSchema,
    siblingAffection: distributionSchema,
    siblingTrust: distributionSchema,
    /** How many personality traits are rolled for each relative. */
    relativeTraitCount: z.int().min(0).max(6),
    relativeLooks: distributionSchema,
    relativeSmarts: distributionSchema,
  }),
});
export type CreationBalance = z.infer<typeof creationBalanceSchema>;
