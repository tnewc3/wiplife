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

export const familyWealthSchema = z.enum(['poor', 'working', 'middle', 'affluent', 'rich']);

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

/**
 * A curve through points: the value at `at` is `x`, straight lines between
 * points, flat beyond the ends. Points are listed in increasing `at` order.
 */
export const curveSchema = z
  .array(z.strictObject({ at: z.number(), x: z.number().nonnegative() }))
  .min(1)
  .refine((points) => points.every((p, i) => i === 0 || p.at > points[i - 1]!.at), 'points must be in increasing "at" order');
export type Curve = z.infer<typeof curveSchema>;

/** Aging, life stages and history limits (src/content/balance/aging.yaml). */
export const agingBalanceSchema = z.strictObject({
  /** The age each life stage starts at; early childhood starts at birth. */
  lifeStages: z.strictObject({
    child: z.int().positive(),
    teen: z.int().positive(),
    youngAdult: z.int().positive(),
    adult: z.int().positive(),
    senior: z.int().positive(),
  }),
  /** Health points lost per year, by age. Fractions are rounded up by chance. */
  healthDecline: curveSchema,
  /** Multiplies the yearly health decline, by fitness. */
  fitnessEffect: curveSchema,
  history: z.strictObject({
    /** Most entries one life keeps; past it, the oldest least important entry goes. */
    maxEntries: z.int().min(10).max(5000),
  }),
  archive: z.strictObject({
    /** History entries of at least this importance are kept in the archive. */
    highlightMinImportance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    /** Most highlights kept per archived life. */
    maxHighlights: z.int().min(1).max(1000),
  }),
  /**
   * Obituary version 2 (Stage 10): how the life's tone is judged. Heavy: a
   * life that ended before youngAge, or lifetime Happiness below
   * heavyHappiness; bright: lifetime Happiness of at least brightHappiness;
   * otherwise mixed. At most maxMoments moments and deeds are mentioned.
   */
  obituary: z.strictObject({
    brightHappiness: z.int().min(0).max(100),
    heavyHappiness: z.int().min(0).max(100),
    youngAge: z.int().min(0).max(120),
    maxMoments: z.int().min(0).max(10),
  }),
});
export type AgingBalance = z.infer<typeof agingBalanceSchema>;

/** Chance of death each year (src/content/balance/mortality.yaml). */
export const mortalityBalanceSchema = z.strictObject({
  /** No one lives past this age. */
  maxAge: z.int().min(1).max(150),
  /** Before `untilAge`, the yearly chance is `yearlyChance` instead of the age formula below. */
  childhood: z.strictObject({ untilAge: z.int().min(1), yearlyChance: probabilitySchema }),
  /** Chance of dying each year that does not grow with age. */
  background: probabilitySchema,
  /** Age-related chance each year: base × growth^age. */
  ageCurve: z.strictObject({ base: probabilitySchema, growth: z.number().min(1).max(2) }),
  /** Multiplies the character's chance, by Health. */
  healthMultiplier: curveSchema,
  /** Multiplies the character's chance, by genetic risk. */
  geneticRiskMultiplier: curveSchema,
  /** Multiplies an NPC's chance (NPCs have no Health stat yet). */
  npcMultiplier: z.number().nonnegative(),
  /** Which cause of death is recorded, by age: the first band whose maxAge is at least the age. */
  causes: z.array(z.strictObject({ maxAge: z.int().min(0), weights: weightsSchema(z.string()) })).min(1),
});
export type MortalityBalance = z.infer<typeof mortalityBalanceSchema>;

const budgetSchema = z.strictObject({ min: z.int().min(0).max(6), max: z.int().min(0).max(6) });

/** The pacing director (src/content/balance/pacing.yaml). */
export const pacingBalanceSchema = z.strictObject({
  /** Base events per year by life stage (docs/design.md, section G). */
  budgets: z.strictObject({
    early: budgetSchema,
    child: budgetSchema,
    teen: budgetSchema,
    youngAdult: budgetSchema,
    adult: budgetSchema,
    senior: budgetSchema,
  }),
  /** Extra events when life is volatile: one per sign, up to maxBonus. */
  volatility: z.strictObject({
    maxBonus: z.int().min(0).max(6),
    /** Risk-taking above this is a sign. */
    riskTakingAbove: z.int().min(0).max(100),
    /** A major history entry or a new relationship within this many years is a sign. */
    recentYears: z.int().min(1).max(20),
  }),
  /** Never more events than this in one year. */
  cap: z.int().min(1).max(6),
  /**
   * When the eligible events' weights add up to less than this, the rest is
   * the chance that nothing more happens this year, so a rare event isn't
   * picked just because nothing else fits.
   */
  minTotalWeight: z.number().positive(),
  /** Events in a year are shown in this tone order, so a joke never follows a death. */
  toneOrder: z.array(z.enum(['light', 'neutral', 'serious', 'dark'])).length(4),
});
export type PacingBalance = z.infer<typeof pacingBalanceSchema>;

/** Event weights, chance checks and casting (src/content/balance/events.yaml). */
export const eventsBalanceSchema = z.strictObject({
  /** Multiplies an event's weight by rarity. */
  rarityWeight: z.strictObject({
    common: z.number().nonnegative(),
    uncommon: z.number().nonnegative(),
    rare: z.number().nonnegative(),
    legendary: z.number().nonnegative(),
  }),
  checks: z.strictObject({
    /** Success chances are clamped to this range, in percent. */
    min: z.number().min(0).max(100),
    max: z.number().min(0).max(100),
    /** Luck adds this × (luck − 50) percentage points to every check. */
    luckWeight: z.number().min(0).max(1),
  }),
  /** People created by casting. */
  newPerson: z.strictObject({
    /** Nobody older than this is introduced. */
    maxAge: z.int().min(1).max(120),
    affection: distributionSchema,
    trust: distributionSchema,
  }),
});
export type EventsBalance = z.infer<typeof eventsBalanceSchema>;

/** A range of shares, from min to max. */
const shareRangeSchema = z
  .strictObject({ min: probabilitySchema, max: probabilitySchema })
  .refine((r) => r.min <= r.max, 'min must not be greater than max');

/**
 * Target numbers simulation runs are judged against (docs/technical.md,
 * section Q, "What the simulation looks for"). Each stage's acceptance
 * criteria point here, so targets change without code changes.
 */
export const targetsBalanceSchema = z.strictObject({
  money: z.strictObject({
    /** At most this share of lives that reach adulthood ever file for bankruptcy. */
    maxBankruptLives: probabilitySchema,
    /** At least this share of lives that reach homeOwnershipAge have owned a home by then. */
    minHomeOwners: probabilitySchema,
    homeOwnershipAge: z.int().min(18).max(120),
    /** The median net worth of lives that reach netWorthAge falls in this range (whole dollars). */
    medianNetWorth: z
      .strictObject({ min: z.int(), max: z.int() })
      .refine((r) => r.min <= r.max, 'min must not be greater than max'),
    netWorthAge: z.int().min(18).max(120),
  }),
  careers: z.strictObject({
    /**
     * Average lifetime earnings of lives with a bachelor's degree, divided by
     * those whose education stopped at high school (a diploma or GED): at least this.
     */
    minBachelorEarningsRatio: z.number().min(1).max(10),
    /**
     * At least this share of bachelor's degree holders earn less over their
     * lifetime than the median high-school-only life: a degree helps, but
     * doesn't guarantee anything.
     */
    minBachelorBelowHighSchoolMedian: probabilitySchema,
    /** Lifetime earnings are compared over lives that reach this age (a full working life). */
    earningsAge: z.int().min(18).max(120),
    /** At least this share of the lives that enter each job track reach its second level (no dead-end careers). */
    minReachLevel2: probabilitySchema,
    /** Promotions per year worked in a job (all tracks together) fall in this range. */
    promotionRate: z.strictObject({ min: probabilitySchema, max: probabilitySchema }),
    /** Firings per year worked in a job fall in this range. */
    firingRate: z.strictObject({ min: probabilitySchema, max: probabilitySchema }),
    /** Layoffs per year worked in a job fall in this range. */
    layoffRate: z.strictObject({ min: probabilitySchema, max: probabilitySchema }),
  }),
  /** The median age at death of all simulated lives falls in this range (Stages 3 and 9). */
  lifespan: z.strictObject({ median: z.strictObject({ min: z.int().min(1), max: z.int().min(1) }) }),
  /** Share of all simulated lives that ever have each health condition (every active condition needs one; Stage 9). */
  health: z.strictObject({ conditions: z.record(z.string(), shareRangeSchema) }),
  /** Share of all simulated lives with each offense on their record (every active offense needs one), and that ever go to prison (Stage 9). */
  legal: z.strictObject({ offenses: z.record(z.string(), shareRangeSchema), jailed: shareRangeSchema }),
  /**
   * Share of all simulated lives in which each kind of discovery surfaced at
   * least once (a latent trait or a hidden talent coming to light; Stage 9).
   */
  discovery: z.strictObject({
    surfaced: z.strictObject({
      attraction: shareRangeSchema,
      gender: shareRangeSchema,
      expression: shareRangeSchema,
      personality: shareRangeSchema,
      talent: shareRangeSchema,
    }),
  }),
  /**
   * The content coverage report (tools/coverage.ts, Stage 10): how much
   * content there is and how well it covers simulated lives.
   */
  coverage: z.strictObject({
    /** At least this many events (not retired). */
    minEvents: z.int().min(1),
    /** Legendary events (not retired): this many in all. */
    legendary: z.strictObject({ min: z.int().min(0), max: z.int().min(0) }).refine((r) => r.min <= r.max, 'min must not be greater than max'),
    /** A year is well covered when at least this many events could happen in it. */
    minEligible: z.int().min(1),
    /** At least this share of simulated years (outside prison) are well covered. */
    minCoveredYears: probabilitySchema,
    /** No event that isn't legendary makes up more than this share of all events fired. */
    maxEventShare: probabilitySchema,
    /** Lives in which each legendary event fires: rare but reachable (judged on the 10,000-life simulation). */
    legendaryLives: shareRangeSchema,
    /**
     * The launch content targets by life stage (docs/design.md, section G):
     * events that can happen in each stage. Reported, not enforced; early
     * childhood and childhood count together.
     */
    launch: z.strictObject({
      childhood: z.int().min(0),
      teen: z.int().min(0),
      youngAdult: z.int().min(0),
      adult: z.int().min(0),
      senior: z.int().min(0),
    }),
  }),
});
export type TargetsBalance = z.infer<typeof targetsBalanceSchema>;
