import { z } from 'zod';
import { baseDefSchema, dollarsSchema, scoreSchema } from './common';

export const countryIdSchema = z.enum(['us']);

export const jobCategorySchema = z.enum(['professional', 'trade', 'gig']);
export type JobCategory = z.infer<typeof jobCategorySchema>;

export const citySchema = baseDefSchema.extend({
  /** Always "us" for now; kept so more countries can be added later. */
  countryId: countryIdSchema,
  name: z.string().trim().min(1).max(40),
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
});

export type CityDef = z.infer<typeof citySchema>;
