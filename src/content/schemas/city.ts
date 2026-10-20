import { z } from 'zod';
import { weightsSchema } from './balance';
import { baseDefSchema, dollarsSchema, scoreSchema } from './common';
import { cityLegalAgesSchema, countryIdSchema } from './country';
import { citySchoolsSchema, schoolStructureSchema } from './education';
import { countrySchema, schoolWordsSchema } from './country';

/** Job categories (Stage 8): professional work, skilled trades, and gig and service work. */
export const JOB_CATEGORIES = ['professional', 'trade', 'gig'] as const;
export const jobCategorySchema = z.enum(JOB_CATEGORIES);
export type JobCategory = z.infer<typeof jobCategorySchema>;

const wordsOverride = schoolWordsSchema.partial().extend({
  tiers: schoolWordsSchema.shape.tiers.partial().optional(),
  credentials: schoolWordsSchema.shape.credentials.partial().optional(),
  exams: schoolWordsSchema.shape.exams.partial().optional(),
});

/** Batch 3: the parts of a country's school a city can change. */
export const cityEducationSchema = z.strictObject({
  school: schoolStructureSchema.partial().optional(),
  words: wordsOverride.optional(),
  collegeYears: countrySchema.shape.collegeYears.partial().optional(),
  tuition: z.strictObject({ college: countrySchema.shape.tuition.shape.college.partial().optional() }).optional(),
});
export type CityEducation = z.infer<typeof cityEducationSchema>;

/**
 * Per-city numbers (cost multipliers, rent, home price, job market) live here
 * in each city file, as CityDef in docs/technical.md section N specifies, so
 * adding a city stays one file. Tuning shared by every city (tax curve,
 * lifestyle costs, interest rates) goes in src/content/balance.
 */
export const citySchema = baseDefSchema.extend({
  /** The country the city is in (src/content/countries): its laws, schools, money and pay. */
  countryId: countryIdSchema,
  name: z.string().trim().min(1).max(40),
  /** One line shown when choosing a city. */
  blurb: z.string().trim().min(1).max(80),
  /** Living-cost multiplier against the United States average (1.0), in the base currency; it includes the country's price level. */
  costOfLiving: z.number().positive().max(5),
  /** Yearly rent for a typical one-bedroom, in whole dollars. */
  baseRent: dollarsSchema,
  /** Price of a typical starter home, in whole dollars. */
  baseHomePrice: dollarsSchema.positive(),
  /** Salary multiplier against the United States average (1.0), in the base currency; it includes the country's pay level. */
  salaryMultiplier: z.number().positive().max(5),
  /** How strong the job market is for each job category (0–100). */
  jobMarket: z.strictObject({
    professional: scoreSchema,
    trade: scoreSchema,
    gig: scoreSchema,
  }),
  /**
   * E5: how much life in this city depends on a vehicle (0–1): near 0 where
   * transit and walking do (a big dense city), near 1 where everything is far.
   * A job's own need for a vehicle is weighted by it.
   */
  carDependence: z.number().min(0).max(1),
  /** The city's schools (fictional names), by program (Stage 7). */
  schools: citySchoolsSchema,
  /** W4a: ages the law sets differently here than in the country (Quebec's drinking age is 18, Ontario's 19). */
  legalAges: cityLegalAgesSchema.optional(),
  /**
   * Batch 3: school rules that differ here from the country's (Montreal's secondary school ends a year earlier and
   * its CEGEP comes before university). Merged over the country's school, words, college years and tuition.
   */
  education: cityEducationSchema.optional(),
  /** B1: how often each of the country's name heritages starts a person here, when it differs from the country's (Houston leans Hispanic, Montreal French). Ids come from the country's name pool. */
  heritageWeights: weightsSchema(z.string()).optional(),
  /** W4a: the languages spoken here when they differ from the country's (Montreal is French-speaking). Used by W4b. */
  languages: z.strictObject({ official: z.array(z.string()).min(1), common: z.array(z.string()) }).optional(),
});

export type CityDef = z.infer<typeof citySchema>;
