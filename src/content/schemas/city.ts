import { z } from 'zod';
import { baseDefSchema, dollarsSchema, scoreSchema } from './common';
import { citySchoolsSchema } from './education';

export const countryIdSchema = z.enum(['us']);

/** Job categories (Stage 8): professional work, skilled trades, and gig and service work. */
export const JOB_CATEGORIES = ['professional', 'trade', 'gig'] as const;
export const jobCategorySchema = z.enum(JOB_CATEGORIES);
export type JobCategory = z.infer<typeof jobCategorySchema>;

/**
 * Per-city numbers (cost multipliers, rent, home price, job market) live here
 * in each city file, as CityDef in docs/technical.md section N specifies, so
 * adding a city stays one file. Tuning shared by every city (tax curve,
 * lifestyle costs, interest rates) goes in src/content/balance.
 */
export const citySchema = baseDefSchema.extend({
  /** Always "us" for now; kept so more countries can be added later. */
  countryId: countryIdSchema,
  name: z.string().trim().min(1).max(40),
  /** One line shown when choosing a city. */
  blurb: z.string().trim().min(1).max(80),
  /** Living-cost multiplier; 1.0 is the national average. */
  costOfLiving: z.number().positive().max(5),
  /** Yearly rent for a typical one-bedroom, in whole dollars. */
  baseRent: dollarsSchema,
  /** Price of a typical starter home, in whole dollars. */
  baseHomePrice: dollarsSchema.positive(),
  /** Salary multiplier; 1.0 is the national average. */
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
});

export type CityDef = z.infer<typeof citySchema>;
