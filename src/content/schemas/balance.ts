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
    /** C1: the Happiness each life drifts back toward (aging.yaml happinessDrift). */
    happinessBaseline: distributionSchema,
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
    /**
     * C1: each parent's own two parents. Their ages when that parent was born
     * follow parentAgeAtBirth and partnerAgeGap; whether they are still alive
     * when you are born follows the NPC mortality odds. sameCityChance: a
     * living grandparent lives in your city (otherwise in another one).
     */
    grandparents: z.strictObject({
      sameCityChance: probabilitySchema,
      affection: distributionSchema,
      trust: distributionSchema,
    }),
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
  /**
   * C1: each year Happiness moves this share of the way back toward your
   * personal baseline (a hidden value rolled at birth), so good and bad
   * years fade and Happiness keeps meaning something.
   */
  happinessDrift: z.strictObject({ rate: z.number().min(0).max(1) }),
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
  /**
   * C1: an event not marked recurring that this life already had: its weight
   * is multiplied by this once for every earlier time, so repeats are rare.
   */
  repeatWeight: z.number().min(0).max(1),
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
const numberRangeSchema = z.strictObject({ min: z.number().min(0), max: z.number().min(0) }).refine((r) => r.min <= r.max, 'min must not be greater than max');
/** A range for a measured difference, which can be negative. */
const signedRangeSchema = z.strictObject({ min: z.number(), max: z.number() }).refine((r) => r.min <= r.max, 'min must not be greater than max');
const ratioRangeSchema = z
  .strictObject({ min: z.number().min(0), max: z.number().min(0) })
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
  /** C1: Happiness that means something, and few repeats of events not marked recurring. */
  consistency: z.strictObject({
    lifetimeHappiness: z.strictObject({ min: z.number().min(0).max(100), max: z.number().min(0).max(100) }).refine((r) => r.min <= r.max, 'min must not be greater than max'),
    maxRepeatShare: probabilitySchema,
  }),
  /**
   * E1: interactions. Outcome tiers aren't a grind and aren't a coin toss: the share of
   * interactions that go great or backfire is kept in a range (judged on the careful player),
   * and repeating never takes a neutral relationship to maximum affection within a year.
   */
  interactions: z.strictObject({
    great: z.strictObject({ min: probabilitySchema, max: probabilitySchema }).refine((r) => r.min <= r.max, 'min must not be greater than max'),
    backfire: z.strictObject({ min: probabilitySchema, max: probabilitySchema }).refine((r) => r.min <= r.max, 'min must not be greater than max'),
    /** The most that go well (good or great): interactions that nearly always succeed are a grind. */
    maxGoodShare: probabilitySchema,
  }),
  /**
   * E2a: children and parenting (judged on the careful player). Shares are of
   * lives that reach the age the target is about, or (miscarriage) of
   * pregnancies, (childDeath) of children.
   */
  family: z.strictObject({
    /** Lives that reach 50 and have a child (born, adopted or step) by then. */
    parents: shareRangeSchema,
    /** Lives (reaching 50) in which an adoption, an IVF cycle or a surrogacy was completed or tried. */
    adoption: shareRangeSchema,
    ivf: shareRangeSchema,
    surrogacy: shareRangeSchema,
    /** Share of pregnancies that end in miscarriage. */
    miscarriage: shareRangeSchema,
    /** Share of children (born, adopted, step) who die before their parent. */
    childDeath: shareRangeSchema,
    /** Parenting style measurably shapes children: the difference between children raised at the high and low end of a style line, in each direction. */
    styleEffect: z.strictObject({
      /** Children's grades (0–4 points) at 16–17, warm vs cold, involved vs absent. */
      grades: z.number().min(0).max(4),
      /** Children's personality at 18, in points: kindness (warm vs cold) and discipline (strict vs relaxed). */
      personality: z.number().min(0).max(100),
    }),
    /** The correlation between a child's starting smarts and the mean of their biological parents' (at least). */
    inheritance: z.number().min(0).max(1),
    /** The most (as a share of children) whose starting smarts fall outside the range of their parents' by more than the noise: values sit between the parents with variation. */
    maxOutsideParents: probabilitySchema,
  }),
  /**
   * E2b: heirs and inheritance, judged on the careful player continuing as heirs for several
   * generations (tools/simulate/heirs.ts).
   */
  heirs: z.strictObject({
    /** The generations a run plays (a chain of lives that continue as heirs). */
    generations: z.int().min(1).max(10),
    /** Heirs who are under 18, as a share of all heirs. */
    minors: shareRangeSchema,
    /**
     * Family wealth doesn't snowball or vanish: the median net worth at death of the third generation
     * divided by the first's, over the families that lived three generations.
     */
    familyWealth: z.strictObject({ min: z.number().min(0), max: z.number().min(0) }).refine((r) => r.min <= r.max, 'min must not be greater than max'),
    /** ...and not even for the luckiest families: the 90th percentile of third ÷ first generation is at most this. */
    maxP90Growth: z.number().min(1),
    /** Family reputation reaches the heir: the correlation of the family's reputation with the heir's own at the start (at least). */
    reputationCorrelation: z.number().min(0).max(1),
    /** Of the heirs who begin with a memory of how they were raised, at least this share see an event about it in their life. */
    memoryEvents: probabilitySchema,
  }),
  /**
   * E3: the lives of the people you know (tools/simulate/people.ts), judged on the careful
   * player's lives. Shares are of person-years or people, as each says.
   */
  people: z.strictObject({
    /** Close people of working age (18 to retirement) who have a job, over their person-years. */
    employed: shareRangeSchema,
    /**
     * Rates among the people you know divided by the player's own, in the same run: the range
     * the ratio has to fall in (promotions and firings and layoffs per year worked; the share
     * of people reaching 40 who have married; divorces per married year; moves to another city and
     * arrests (your record's entries) per adult year, 18 to 64).
     */
    ratio: z.strictObject({
      promotion: ratioRangeSchema,
      firing: ratioRangeSchema,
      layoff: ratioRangeSchema,
      marriedBy40: ratioRangeSchema,
      divorce: ratioRangeSchema,
      moves: ratioRangeSchema,
      arrests: ratioRangeSchema,
    }),
    /** Children per person who has married, among those who reach 45 (as far as the people you know show). */
    childrenPerMarried: z.strictObject({ min: z.number().min(0), max: z.number().min(0) }).refine((r) => r.min <= r.max, 'min must not be greater than max'),
    /** Yearly share of adults (18 and up) who start a serious illness. */
    illness: shareRangeSchema,
    /** Of the people you know who reach 40, the share who had an addiction. */
    addiction: shareRangeSchema,
    /** Of the addictions that ended within the run, the share that ended in recovery rather than death. */
    recovery: shareRangeSchema,
    /** Romance among people under 18 (anyone): none, ever. */
    underageRomance: z.int().min(0).max(0),
    /** Requests that reach you each year (those that became event cards), on average. */
    requestsPerYear: z.strictObject({ min: z.number().min(0), max: z.number().min(0) }).refine((r) => r.min <= r.max, 'min must not be greater than max'),
    /** Requests as a share of all events (your own story stays the main thing). */
    maxRequestShare: probabilitySchema,
    /** Lines in the yearly feed, on average, for years that had any news. */
    newsPerYear: z.strictObject({ min: z.number().min(0), max: z.number().min(0) }).refine((r) => r.min <= r.max, 'min must not be greater than max'),
    /** The most milliseconds a year's beginYear takes on average (the full circle simulated), on this machine. */
    maxBeginYearMs: z.number().positive(),
  }),
  /**
   * E4: the social web (tools/simulate/web.ts), judged on the careful player's lives: ties,
   * feuds, what spreads and how, and the events it asks of you.
   */
  web: z.strictObject({
    /** Ties between the people you know, at a time, on average over life-years. */
    tiesAtATime: numberRangeSchema,
    /** Feuds that begin in a life, on average. */
    feudsPerLife: numberRangeSchema,
    /** The share of tie-years in which the tie is feuding ("feuds everywhere" is a failure mode). */
    feudingShare: shareRangeSchema,
    /** Years a feud lasts before it ends, on average (of those that ended in the run). */
    feudYears: numberRangeSchema,
    /** Of the feuds that began, the share that ended within the run. */
    feudsEnded: shareRangeSchema,
    /** Of the secrets, the share that someone heard from another person ("no secret ever lasts" or "none ever matters"). */
    secretsOut: shareRangeSchema,
    /** Years from a secret beginning to its first telling (median). */
    secretYears: numberRangeSchema,
    /** Of the news that isn't secret (a lost job, an arrest...), the share that someone heard from another person. */
    newsOut: shareRangeSchema,
    /** The share of passes from one person to another that change the story. */
    twistRate: shareRangeSchema,
    /** Events from the web that reach you, a year, on average. */
    eventsPerYear: numberRangeSchema,
    /** Events from the web as a share of all events. */
    maxEventShare: probabilitySchema,
    /** The most milliseconds beginYear takes on average (all steps; and with the full circle simulated), and the web step on its own. */
    maxBeginYearMs: z.number().positive(),
    maxWebStepMs: z.number().positive(),
  }),
  /**
   * M1: mental health (tools/simulate/mental.ts), judged on the careful player's lives.
   * Ranges may leave out min or max.
   */
  mental: z.strictObject({
    /** Of lives with a mental health condition (or with ADHD or neurodivergence), the share ever named. */
    namedShare: shareRangeSchema,
    neuroNamedShare: shareRangeSchema,
    /** Years from a mental health condition starting to being named (median). */
    yearsToNaming: numberRangeSchema,
    /** Born with ADHD or neurodivergence: how many times as likely with an affected parent. */
    inheritance: z.strictObject({ min: z.number().min(1) }),
    /** Mental health conditions recovered from, per condition that began; and the share of recoveries that come back. */
    recovered: shareRangeSchema,
    relapse: shareRangeSchema,
    /** Of named lives, the share that ever used professional care. */
    careUptake: shareRangeSchema,
    /** Severity points a year in professional care less with no care (negative: care helps). */
    careEffect: z.strictObject({ max: z.number() }),
    /** Severity a year with supportive noticers less when dismissed (negative: support helps). */
    supportEffect: z.strictObject({ max: z.number() }),
    noticed: shareRangeSchema,
    /** Noticing for someone who lives with you, as a multiple of someone far away. */
    householdNotice: z.strictObject({ min: z.number().min(1) }),
    dismissive: shareRangeSchema,
    crisisLives: shareRangeSchema,
    crisisToCare: shareRangeSchema,
    secretKnown: shareRangeSchema,
    eventShare: z.strictObject({ max: probabilitySchema }),
  }),
  /**
   * E5: pets, vehicles and homes (tools/simulate/possessions.ts), judged on the
   * careful player's lives. Ranges may leave out min or max.
   */
  possessions: z.strictObject({
    /** Of lives reaching 30, the share that ever had a pet; and the share that ever owned a vehicle. */
    petOwners: shareRangeSchema,
    vehicleOwners: shareRangeSchema,
    /** Of the pets that died, the share that died within their species' lifespan range (all of them). */
    petLifespanInRange: shareRangeSchema,
    /** Accidents per 100 vehicle-years. */
    accidentsPer100Years: numberRangeSchema,
    /** The yearly insurance an insured vehicle costs (whole dollars), on average. */
    insurancePerYear: numberRangeSchema,
    /** Vehicle upkeep and insurance together, as a share of income in the years a vehicle is owned. */
    carCostShare: shareRangeSchema,
    /** Of all lives, the share that ever owned a vacation home. */
    vacationHomeLives: shareRangeSchema,
    /** Of the lives that owned a home (or a vacation home), the share that ever renovated one. */
    renovationLives: shareRangeSchema,
    /** The share of pet-years a pet is ill. */
    illShare: shareRangeSchema,
  }),
  /**
   * T1: the teen years (tools/simulate/teen.ts), judged on the careful
   * player's lives, which follow one yearly focus plan each (or none).
   */
  teen: z.strictObject({
    /** Of teens (lives reaching 18): the share who belonged to a crowd; of crowd members, the share who switched and who were in a clash; the people a crowd brings when you join it. */
    crowdMembers: shareRangeSchema,
    switches: shareRangeSchema,
    clashLives: shareRangeSchema,
    peoplePerCrowd: numberRangeSchema,
    /** Licensed by 18; owned a car before 18; had a teen job; belonged to a team or club. */
    licensedBy18: shareRangeSchema,
    carBefore18: shareRangeSchema,
    jobLives: shareRangeSchema,
    activityLives: shareRangeSchema,
    /** House rules: how many a year in a home that sets any; mean level of a strict-style parent's rules minus a relaxed-style parent's. */
    rulesPerHome: numberRangeSchema,
    strictVsRelaxed: signedRangeSchema,
    /** Breaks per teen, and the share of breaks that were caught. */
    breaksPerTeen: numberRangeSchema,
    caughtShare: shareRangeSchema,
    /** When caught: the share who are grounded, strict-style minus relaxed-style parents; the share who get only a talk or chores, close minus distant from the parent. */
    groundedStrictVsRelaxed: signedRangeSchema,
    mildCloseVsDistant: signedRangeSchema,
    /** Teens with a juvenile case; teens who started an addiction before 18. */
    juvenileLives: shareRangeSchema,
    addictionLives: shareRangeSchema,
    /** Focus plans compared: diploma GPA (school minus friends), friend closeness (friends minus school), teen income (work as a multiple of none), talent found (passion minus none). */
    focusGrades: signedRangeSchema,
    focusFriends: signedRangeSchema,
    focusMoney: numberRangeSchema,
    focusTalent: signedRangeSchema,
    /** Romance involving anyone under 18: none, ever. */
    romanceUnder18: numberRangeSchema,
  }),
  /**
   * E6a: crime careers (tools/simulate/crime.ts). The law-abiding careful
   * player must never enter a crew; the criminal player (one who says yes to
   * every offer and plays the crew's life) is judged on how far it gets, what
   * it earns and what it costs, and on crime not paying better than a legal
   * career without matching risk.
   */
  crime: z.strictObject({
    /** Lives of the careful player that entered a crew: none. */
    carefulEntered: numberRangeSchema,
    /** Of the criminal player's lives that reach 30: the share that entered a crew. */
    entered: shareRangeSchema,
    /** Of those who entered: the share who reached the third rank, and the share who ran a crew. */
    reachedRank3: shareRangeSchema,
    leaders: shareRangeSchema,
    /** Of those who entered: the share arrested at least once, the share who went to prison, the share who got out (left, were pushed out or made a deal). */
    arrested: shareRangeSchema,
    prison: shareRangeSchema,
    gotOut: shareRangeSchema,
    /** The mean heat on a crew member (0–100). */
    meanHeat: numberRangeSchema,
    /** Crew lives' median net worth at death (savings, assets and cleaned money, less debt) as a multiple of the careful player's median. */
    netWorthRatio: numberRangeSchema,
    /** Of crew lives in the top quarter of dirty earnings, the share arrested at least once (high pay carries matching risk). */
    richArrested: shareRangeSchema,
    /** Deposits flagged as a share of deposits put through a business. */
    flaggedShare: shareRangeSchema,
    /** Anyone under 18 in a crew, or holding dirty money: none, ever. */
    underAge: numberRangeSchema,
  }),
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
