/**
 * Economy and housing (docs/design.md, section J; docs/technical.md, Stage 6):
 * debt kinds, housing kinds and lifestyle tiers, the economy balance numbers
 * (src/content/balance/economy.yaml) and the money triggers registry
 * (src/content/registries/triggers.yaml).
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { dollarsSchema, idSchema, scoreSchema } from './common';

export const DEBT_KINDS = ['student', 'personal', 'mortgage', 'medical', 'collections'] as const;
export const debtKindSchema = z.enum(DEBT_KINDS);
export type DebtKind = z.infer<typeof debtKindSchema>;

export const HOUSING_KINDS = ['with_parents', 'renting', 'owned', 'homeless', 'incarcerated'] as const;
export const housingKindSchema = z.enum(HOUSING_KINDS);
export type HousingKind = z.infer<typeof housingKindSchema>;

export const LIFESTYLES = ['frugal', 'comfortable', 'lavish'] as const;
export const lifestyleSchema = z.enum(LIFESTYLES);
export type Lifestyle = z.infer<typeof lifestyleSchema>;

/**
 * Money trouble the economy step reacts to by queueing one of the trigger's
 * events (registries/triggers.yaml), most serious first.
 */
export const TRIGGER_IDS = ['foreclosure', 'eviction', 'collections', 'garnishment', 'missed_payment'] as const;
export const triggerIdSchema = z.enum(TRIGGER_IDS);
export type TriggerId = z.infer<typeof triggerIdSchema>;

const share = z.number().min(0).max(1);
const rate = z.number().min(0).max(1);
const years = z.int().min(1).max(100);

/**
 * A yearly pull on one stat: `perYear` points (a fraction happens by chance),
 * never past `limit` (a floor when perYear is negative, a ceiling when positive).
 */
export const statPullSchema = z.strictObject({ perYear: z.number().min(-20).max(20), limit: scoreSchema });
export type StatPull = z.infer<typeof statPullSchema>;

/** Yearly pulls on stats; stats left out are not touched. */
export const statEffectsSchema = z.strictObject({
  health: statPullSchema.optional(),
  happiness: statPullSchema.optional(),
  smarts: statPullSchema.optional(),
  looks: statPullSchema.optional(),
  fitness: statPullSchema.optional(),
  stress: statPullSchema.optional(),
});
export type StatEffects = z.infer<typeof statEffectsSchema>;

const perWealth = <T extends z.ZodType>(value: T) =>
  z.strictObject({ poor: value, working: value, middle: value, affluent: value, rich: value });
const perDebtKind = <T extends z.ZodType>(value: T) =>
  z.strictObject({ student: value, personal: value, mortgage: value, medical: value, collections: value });

const lifestyleTierSchema = z.strictObject({
  /** Multiplies living costs. */
  living: z.number().positive().max(10),
  effects: statEffectsSchema,
});

/** The yearly ledger, debt, housing and gig work (src/content/balance/economy.yaml). */
export const economyBalanceSchema = z.strictObject({
  /** From this age you pay your own way: living costs, debt, and housing and lifestyle choices. */
  independenceAge: z.int().min(16).max(30),
  /** Estimated tax: marginal rates on yearly gross income, each from its `from` amount up to the next. */
  tax: z.strictObject({
    brackets: z
      .array(z.strictObject({ from: dollarsSchema, rate }))
      .min(1)
      .refine((b) => b[0]!.from === 0, 'the first bracket starts from 0')
      .refine((b) => b.every((x, i) => i === 0 || x.from > b[i - 1]!.from), 'brackets must be in increasing "from" order'),
  }),
  /** Yearly living costs for a comfortable life at the national average (city cost of living 1.0). */
  livingCost: dollarsSchema.positive(),
  lifestyle: z.strictObject({
    frugal: lifestyleTierSchema,
    comfortable: lifestyleTierSchema,
    lavish: lifestyleTierSchema,
  }),
  /** An adult living with parents pays these shares; the family covers the rest. */
  withParents: z.strictObject({
    /** Share of the city's base rent you chip in. */
    rentShare: perWealth(share),
    /** Share of your own living costs you pay. */
    livingShare: perWealth(share),
  }),
  homeless: z.strictObject({
    /** Share of normal living costs you still spend. */
    livingShare: share,
    effects: statEffectsSchema,
  }),
  interest: z.strictObject({
    /** Yearly interest on savings. */
    savings: rate,
    /** Yearly interest by debt kind. */
    debts: perDebtKind(rate),
  }),
  debts: z.strictObject({
    /** Years a debt's minimum payment would take to pay it off, by kind. */
    termYears: perDebtKind(years),
    /** The smallest yearly minimum payment on any debt. */
    minPayment: dollarsSchema,
  }),
  missed: z.strictObject({
    /** Missed payments in a row before a debt goes to collections. */
    collectionsAfter: years,
    /** Added to a debt when it goes to collections, as a share of its balance. */
    collectionsFee: share,
    /** Share of gross income garnished while a collections debt is behind. */
    garnishShare: share,
    /** Missed mortgage payments in a row before the bank forecloses. */
    foreclosureAfter: years,
    /** A foreclosure sale brings in this share of the home's value. */
    foreclosureSale: share,
    /** Years in a row behind on rent before you are evicted. */
    evictionAfter: years,
    /** A year counts as behind on rent when the costs you had to borrow for reach this share of the year's housing cost. */
    evictionShare: share,
    /** A year with a missed payment. */
    effects: statEffectsSchema,
  }),
  bankruptcy: z.strictObject({
    /** No mortgage for this many years after filing. */
    noMortgageYears: years,
  }),
  /** A debt plan rolls personal, medical and collections debt into one loan. */
  debtPlan: z.strictObject({
    rate,
    /** Added to the plan's balance, as a share. */
    fee: share,
    termYears: years,
    /** Years before another plan is possible. */
    cooldownYears: years,
  }),
  housing: z.strictObject({
    /** Moving within a city. */
    movingCost: dollarsSchema,
    /** Moving to another city. */
    relocationCost: dollarsSchema,
    /** Up-front deposit when you rent, as a share of a year's rent. */
    deposit: share,
    /** Share of the rent you pay when you live with a roommate. */
    roommateShare: share,
    /** Share of the housing cost you pay when you live with your partner or spouse (they pay the rest). */
    partnerShare: share,
    /**
     * C1: rent changes are a share of your current rent and last while you
     * stay in the home; the rent stays within these multiples of the city's
     * base rent.
     */
    rentFactor: z
      .strictObject({ min: z.number().positive().max(1), max: z.number().min(1).max(10) })
      .refine((r) => r.min <= r.max, 'min must not be greater than max'),
  }),
  /**
   * C1: big one-time costs events charge through the finance module (the cost
   * effect): amount at the national average, times the city's cost of
   * living; familyHelp: your family may chip in.
   */
  costs: z.record(idSchema, z.strictObject({ amount: dollarsSchema.positive(), familyHelp: z.boolean() })),
  /**
   * C1: how much of a cost your family covers: share by family wealth, times
   * how close you are to your closest living parent (affection ÷ 100), and
   * nothing below minAffection.
   */
  familyHelp: z.strictObject({ share: perWealth(share), minAffection: scoreSchema }),
  /**
   * The retirement benefit (like Social Security): paid every year from `age`
   * once you have `minYears` years with earned income, from your average
   * yearly earnings over those years. Every kind of earned income counts
   * (gig pay and salaries).
   */
  retirement: z.strictObject({
    age: z.int().min(40).max(100),
    /** Years with earned income needed to qualify. */
    minYears: z.int().min(1).max(60),
    /** The full benefit needs this many years; fewer years pay a share (years ÷ fullYears). */
    fullYears: z.int().min(1).max(60),
    /** A year counts when earned income reaches this. */
    creditIncome: dollarsSchema.positive(),
    /** Earnings above this in one year don't count toward the average. */
    earningsCap: dollarsSchema.positive(),
    /** The yearly benefit: these rates on slices of average yearly earnings (like the tax brackets). */
    formula: z
      .array(z.strictObject({ from: dollarsSchema, rate }))
      .min(1)
      .refine((b) => b[0]!.from === 0, 'the first slice starts from 0')
      .refine((b) => b.every((x, i) => i === 0 || x.from > b[i - 1]!.from), 'slices must be in increasing "from" order'),
  }),
  ownership: z.strictObject({
    /** Smallest down payment, as a share of the price. */
    downPayment: share,
    /** Closing costs when buying, as a share of the price. */
    closingCosts: share,
    /** Costs of selling, as a share of the home's value. */
    sellingCosts: share,
    /** Yearly property tax and upkeep, as a share of the home's value. */
    upkeep: rate,
    /** Yearly change in home values. */
    appreciation: z.number().min(-0.2).max(0.2),
    /** The bank's limit: the yearly mortgage payment at most this share of last year's gross income. */
    maxPaymentShare: share,
    /** Savings kept back when putting down more than the smallest down payment. */
    cashReserve: dollarsSchema,
  }),
  gig: z.strictObject({
    /** Youngest age for gig work. */
    minAge: z.int().min(10).max(30),
    /** Full-time gig pay per year at the national average. */
    pay: dollarsSchema.positive(),
    /** Multiplies pay, by the city's gig job market (0–100). */
    market: curveSchema,
    /** Each year's pay is multiplied by a random amount in this range. */
    swing: z
      .strictObject({ min: z.number().positive().max(5), max: z.number().positive().max(5) })
      .refine((s) => s.min <= s.max, 'min must not be greater than max'),
    /** Multiplies pay, by age (part-time around school, slowing down later). */
    byAge: curveSchema,
  }),
});
export type EconomyBalance = z.infer<typeof economyBalanceSchema>;

/**
 * Which events answer each kind of money trouble (registries/triggers.yaml).
 * The economy step queues one that fits, by weight, for the same year.
 */
export const triggerRegistrySchema = z.strictObject({
  triggers: z.strictObject(
    Object.fromEntries(TRIGGER_IDS.map((id) => [id, z.strictObject({ events: z.array(idSchema).min(1) })])) as Record<
      TriggerId,
      z.ZodObject<{ events: z.ZodArray<typeof idSchema> }>
    >,
  ),
});
export type TriggerRegistry = z.infer<typeof triggerRegistrySchema>;

