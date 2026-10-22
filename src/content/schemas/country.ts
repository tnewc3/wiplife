/**
 * Countries (W4a, docs/expansion.md): the rules a country sets for the life
 * lived in it. One file per country in src/content/countries; the cities
 * point at their country (`countryId`). Money everywhere in the game is kept
 * in one base currency (the US dollar) and shown in the country's currency
 * at the rate in src/content/balance/countries.yaml.
 *
 * Every number a system used to take as "the United States" lives here:
 * legal ages, school structure and words, tuition and student finance, how
 * much of a medical bill you pay, taxes, the pension, how pay differs by kind
 * of work, how courts sentence, languages, name pools and family wealth.
 * Amounts are in the base currency.
 */
import { z } from 'zod';
import { curveSchema, familyWealthSchema, weightsSchema } from './balance';
import { baseDefSchema, dollarsSchema, idSchema } from './common';
import { scholarshipsSchema, schoolStructureSchema } from './education';
import { examIdSchema, schoolPathWordsSchema } from './schoolIds';

/** The countries the game has. Adding one means adding its id here, its file in src/content/countries and its name pool. */
export const COUNTRY_IDS = ['us', 'ca', 'uk', 'mx'] as const;
export const countryIdSchema = z.enum(COUNTRY_IDS);
export type CountryId = z.infer<typeof countryIdSchema>;

const share = z.number().min(0).max(1);
const rate = z.number().min(0).max(1);
const wordSchema = z.string().trim().min(1).max(60);
const age = z.int().min(3).max(30);

/** The currency a country's money is shown in. The rate (units per base-currency unit) is in balance/countries.yaml. */
export const currencySchema = z.strictObject({
  /** ISO 4217 code: "USD". */
  code: z.string().regex(/^[A-Z]{3}$/),
  /** Written before the amount: "$", "£". */
  symbol: z.string().trim().min(1).max(4),
  /** Singular and plural, for text: "dollar", "dollars". */
  name: wordSchema,
  plural: wordSchema,
  /** The locale that groups digits: "en-US". */
  locale: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/),
});
export type Currency = z.infer<typeof currencySchema>;

/** The ages the law sets. A city can override any of them (cities/*.yaml legalAges). */
export const legalAgesSchema = z.strictObject({
  /** Buying and drinking alcohol. */
  drinking: age,
  /** Casinos and betting. */
  gambling: age,
  /** A driving licence. */
  driving: age,
  /** A learner's permit. */
  permit: age,
  /** Marrying without anyone's consent. Romance is for adults only whatever this says (the game's adult age still applies). */
  marriage: age,
});
export type LegalAges = z.infer<typeof legalAgesSchema>;
export const cityLegalAgesSchema = legalAgesSchema.partial();

/** The three kinds of automatic school, and the words each country uses for school and what it awards. */
export const schoolWordsSchema = z.strictObject({
  /** In a sentence, lowercase: "elementary school", "primary school". */
  elementary: wordSchema,
  middle: wordSchema,
  high: wordSchema,
  /** The place after school: "college", "university". */
  college: wordSchema,
  /** The heads of a school: "principal", "headteacher". */
  principal: wordSchema,
  /** A school year's grade: "GPA", "average". */
  gradeWord: wordSchema,
  /** How a year's grade is shown: letters (A–F), a percentage, or a ten-point average. */
  gradeDisplay: z.enum(['letters', 'percent', 'tenPoint']),
  /** The college tiers as a list shows them. */
  tiers: z.strictObject({ community: wordSchema, state: wordSchema, elite: wordSchema }),
  /** What finishing school and later programs award. */
  credentials: z.strictObject({
    hs_diploma: wordSchema,
    ged: wordSchema,
    associate: wordSchema,
    bachelor: wordSchema,
    trade_license: wordSchema,
    grad: wordSchema,
  }),
  /** The exams that matter: entrance (for a place after school) and leaving (the end of school). */
  exams: z.strictObject({ entrance: wordSchema, leaving: wordSchema }),
  /** The name of each automatic school year, in order from the first; one per year of school. */
  gradeLabels: z.array(wordSchema).min(1),
  /** Batch 3: the form or homeroom teacher and the person who looks after students, as the country calls them ("homeroom teacher", "form tutor"). */
  homeroom: wordSchema,
  support: wordSchema,
  /** The years after the choice at 16 ("sixth form"), where the country has them. */
  upper: wordSchema.optional(),
  /** What the choices at the end of compulsory school are called. */
  choices: schoolPathWordsSchema.optional(),
  /** The exams by name ("GCSEs", "SAT or ACT"). */
  examNames: z.partialRecord(examIdSchema, wordSchema),
});
export type SchoolWords = z.infer<typeof schoolWordsSchema>;

const tuitionSchema = z.strictObject({
  college: z.strictObject({ community: dollarsSchema, state: dollarsSchema, elite: dollarsSchema }),
  trade: z.record(idSchema, dollarsSchema),
  grad: z.record(idSchema, dollarsSchema),
});

/** How much of each kind of medical bill you pay yourself (the rest is the health system's). */
const healthShareSchema = z.strictObject({
  visit: share,
  treatment: share,
  therapy: share,
  medication: share,
  /** Long-term care, hospice and rehabilitation. */
  care: share,
});

const outcomeMultipliers = z.strictObject({
  warning: z.number().nonnegative().max(10),
  fine: z.number().nonnegative().max(10),
  probation: z.number().nonnegative().max(10),
  jail: z.number().nonnegative().max(10),
});

const slices = (what: string) =>
  z
    .array(z.strictObject({ from: dollarsSchema, rate }))
    .min(1)
    .refine((b) => b[0]!.from === 0, `the first ${what} starts from 0`)
    .refine((b) => b.every((x, i) => i === 0 || x.from > b[i - 1]!.from), `${what}s must be in increasing "from" order`);

/** A country definition (src/content/countries). */
export const countrySchema = baseDefSchema.extend({
  id: countryIdSchema,
  /** "Canada". */
  name: wordSchema,
  /** "Canadian": for text ("a Canadian winter"). */
  adjective: wordSchema,
  /** One line shown when choosing where to be born. */
  blurb: z.string().trim().min(1).max(100),
  currency: currencySchema,
  /**
   * National price level against the base currency's home (the United States is 1.0). Amounts in event text and
   * effects are written at US prices and scaled by this; each city's costOfLiving already includes it.
   */
  priceLevel: z.number().positive().max(5),
  /** National average pay against the United States (1.0); each city's salaryMultiplier already includes it. */
  salaryMultiplier: z.number().positive().max(5),
  legalAges: legalAgesSchema,
  school: schoolStructureSchema,
  words: schoolWordsSchema,
  /** College: years of each tier, and the yearly tuition by tier, trade and grad program. */
  collegeYears: z.strictObject({ community: z.int().min(1).max(6), state: z.int().min(1).max(6), elite: z.int().min(1).max(6) }),
  tuition: tuitionSchema,
  /** Student finance: aid taking a share of tuition off, the rate on a student loan, and what applying costs. */
  studentFinance: z.strictObject({
    scholarships: scholarshipsSchema,
    loanRate: rate,
    applicationFee: dollarsSchema,
    /** One line: how students pay, for the school screen. */
    blurb: z.string().trim().min(1).max(160),
  }),
  /**
   * Batch 5: sport at school and college. `scholarships`: whether colleges here give athletic scholarships, the most of
   * tuition one pays (a full ride is 1), the words for it and the programs that recruit (`word` is "athletic
   * scholarship", "sport scholarship", "beca deportiva"). `academy`: club academies take promising young players.
   * `system` names the kind of school sport: a college team (the United States, Canada) or a university team.
   */
  athletics: z.strictObject({
    scholarships: z.strictObject({
      available: z.boolean(),
      maxShare: share,
      word: wordSchema,
      tiers: z.array(z.enum(['community', 'state', 'elite'])).max(3),
    }),
    academy: z.boolean(),
    system: z.enum(['college', 'university']),
    /** Batch 6: what the country calls soccer, and the other football ("football" in the United States and Canada, "American football" elsewhere). */
    soccerWord: z.enum(['soccer', 'football']),
    footballWord: z.enum(['football', 'American football']),
  }),
  /** Buying a home: the mortgage rate, the smallest down payment (a share of the price) and how home values move each year. */
  housing: z.strictObject({ mortgageRate: rate, downPayment: share, appreciation: z.number().min(-0.2).max(0.2) }),
  healthcare: z.strictObject({
    model: z.enum(['private', 'public', 'mixed']),
    /** "Mostly employer insurance and out-of-pocket costs": for the health screen. */
    blurb: z.string().trim().min(1).max(160),
    shares: healthShareSchema,
  }),
  tax: z.strictObject({
    /** What the one tax line stands for: "income tax and payroll taxes". */
    blurb: z.string().trim().min(1).max(120),
    /** Marginal rates on yearly gross income (base currency). */
    brackets: slices('bracket'),
  }),
  /**
   * What dying costs in tax: the share of the estate (cash and the home's equity, after costs and debts) that goes in
   * tax or probate, by the size of the estate in the base currency: straight lines between the points.
   */
  estateTax: curveSchema,
  /** The retirement benefit: paid every year from `age` to anyone with `minYears` of earned income. */
  pension: z.strictObject({
    name: wordSchema,
    age: z.int().min(40).max(100),
    minYears: z.int().min(1).max(60),
    fullYears: z.int().min(1).max(60),
    creditIncome: dollarsSchema.positive(),
    earningsCap: dollarsSchema.positive(),
    formula: slices('slice'),
  }),
  /** Pay by kind of work against the national average, and for particular jobs. */
  jobs: z.strictObject({
    salaryByCategory: z.strictObject({ professional: z.number().positive().max(5), trade: z.number().positive().max(5), gig: z.number().positive().max(5) }),
    salaryByJob: z.record(idSchema, z.number().positive().max(5)).default({}),
  }),
  sentencing: z.strictObject({
    /** Multiplies each outcome's weight (on top of the offense's own and the prior-record multipliers). */
    outcomes: outcomeMultipliers,
    /** Multiplies years in jail and on probation (the ones a court rolls), and the fine. */
    termYears: z.number().positive().max(5),
    fines: z.number().positive().max(5),
    /** Years of parole after release. */
    paroleYears: z.int().min(0).max(20),
  }),
  /** Languages (ids): the official ones, and others commonly spoken. Used by W4b. */
  languages: z.strictObject({ official: z.array(idSchema).min(1), common: z.array(idSchema) }),
  /** The name pool is names/<id>.yaml; how often each of its heritages starts a family. */
  names: z.strictObject({ heritageWeights: weightsSchema(z.string()), sameHeritageParentsChance: share }),
  /** How family wealth is spread among new lives. */
  familyWealth: weightsSchema(familyWealthSchema),
});
export type CountryDef = z.infer<typeof countrySchema>;

const range = z.strictObject({ min: z.number(), max: z.number() }).refine((r) => r.min <= r.max, 'min must not be greater than max');

/**
 * What the simulation judges one country's lives by (npm run simulate -- --country). Money is in the base currency.
 * A run for a country uses these in place of the shared money and lifespan targets.
 */
export const countryTargetsSchema = z.strictObject({
  lifespanMedian: range,
  maxBankruptLives: z.number().min(0).max(1),
  /** At least this share of lives that reach 50 have owned a home by then. */
  minHomeOwners: z.number().min(0).max(1),
  /** A diploma or its equivalent by 19, of lives that reach 20. */
  minDiplomaBy19: z.number().min(0).max(1),
  /** A college degree (associate or better) by 30, of lives that reach 30. */
  degreeBy30: range,
  /** The median gross pay in the year they turned 40. */
  grossAt40: range,
  /** The share of gross pay that goes in tax over working years. */
  taxShare: range,
  /** The median net worth of lives that reach 65. */
  medianNetWorth: range,
});
export type CountryTargets = z.infer<typeof countryTargetsSchema>;

/** Numbers every country shares: exchange rates, where random lives start and what each country is judged by (src/content/balance/countries.yaml). */
export const countriesBalanceSchema = z.strictObject({
  /** Units of each currency per one unit of the base currency (the US dollar). */
  exchangeRates: z.record(z.string().regex(/^[A-Z]{3}$/), z.number().positive()),
  /** How often a random life starts in each country. */
  startWeights: weightsSchema(countryIdSchema),
  /** The simulation's targets for each country. */
  targets: z.record(countryIdSchema, countryTargetsSchema),
});
export type CountriesBalance = z.infer<typeof countriesBalanceSchema>;
