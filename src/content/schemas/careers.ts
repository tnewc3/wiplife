/**
 * Careers (docs/design.md, section I; docs/technical.md, Stage 8): job
 * tracks (src/content/jobs), the careers balance numbers
 * (src/content/balance/careers.yaml) and the work results registry
 * (src/content/registries/work.yaml).
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { jobCategorySchema } from './city';
import { baseDefSchema, idSchema, scoreKeySchema } from './common';
import { chanceModelSchema } from './education';
import { conditionSchema } from './events';

const share = z.number().min(0).max(1);
const salarySchema = z.int().min(1000).max(10_000_000);

/** One rung of a job track. */
export const jobLevelSchema = z.strictObject({
  /** The job title as it reads in a sentence, without an article: "junior developer", "HVAC technician". */
  title: z.string().trim().min(1).max(40),
  /** Yearly base salary at the national average (city salary multiplier 1.0), in whole dollars. */
  salary: salarySchema,
  /** Years at this level before a promotion is possible (balance promotion.minYears when left out). */
  years: z.int().min(1).max(20).optional(),
});
export type JobLevel = z.infer<typeof jobLevelSchema>;

/**
 * A job track (src/content/jobs): what it needs, its levels and base
 * salaries, and the stats that make you good at it.
 */
export const jobSchema = baseDefSchema
  .extend({
    /** Shown in lists: "Software engineering". */
    name: z.string().trim().min(1).max(40),
    category: jobCategorySchema,
    /** One line for job search. */
    blurb: z.string().trim().min(1).max(100),
    /** Who can be hired (condition language): degrees, licenses, a clean record, age. */
    requires: conditionSchema.optional(),
    /** From the first level up; salaries never go down a level. */
    levels: z
      .array(jobLevelSchema)
      .min(3)
      .max(6)
      .refine((levels) => levels.every((l, i) => i === 0 || l.salary >= levels[i - 1]!.salary), 'salaries must not go down a level'),
    /** Yearly performance: weight × (value − 50) points for each of your stats, traits or hidden values. */
    performance: z.array(z.strictObject({ key: scoreKeySchema, weight: z.number().min(-1).max(1) })).min(1),
    /** Fictional employers; one is picked when you're hired. */
    employers: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
  });
export type JobDef = z.infer<typeof jobSchema>;

const perCategory = <T extends z.ZodType>(value: T) => z.strictObject({ professional: value, trade: value, gig: value });
const range = z
  .strictObject({ min: z.int().min(-60).max(100), max: z.int().min(-60).max(100) })
  .refine((r) => r.min <= r.max, 'min must not be greater than max');

/** Careers: the job market, hiring, performance, promotions, raises and job loss (src/content/balance/careers.yaml). */
export const careersBalanceSchema = z.strictObject({
  /** The youngest age you can be hired. */
  minAge: z.int().min(14).max(30),
  /** Most job applications in one year. */
  maxApplications: z.int().min(1).max(10),
  /** Chance each job track is hiring in your city this year, by the city's job market for its category (0–100). */
  openings: curveSchema,
  hiring: z.strictObject({
    /** Your chance of being hired, by job category (percentage points; see ChanceModel). */
    odds: perCategory(chanceModelSchema),
    /** Multiplies the chance (before min and max), by the city's job market for the category. */
    market: curveSchema,
    /** Percentage points per year you've worked in this track before, up to max. */
    experience: z.strictObject({ perYear: z.number().min(0).max(20), max: z.number().min(0).max(50) }),
    /** Percentage points for your best college degree's tier. */
    tier: z.strictObject({ community: z.number().min(-30).max(30), state: z.number().min(-30).max(30), elite: z.number().min(-30).max(30) }),
    /** Percentage points for holding a grad degree. */
    grad: z.number().min(-30).max(30),
    /** Percentage points for any criminal record. */
    record: z.number().min(-60).max(0),
    /** E2b: percentage points per point your family's reputation stands above or below 50. */
    familyReputation: z.number().min(0).max(1),
  }),
  performance: z.strictObject({
    /** Yearly performance aims at base + each of the job's stat weights × (value − 50)... */
    base: z.number().min(0).max(100),
    /** ...minus these points by Stress... */
    stress: curveSchema,
    /** ...minus these points by Health... */
    health: curveSchema,
    /** ...plus a random swing of up to this either way. */
    swing: z.number().min(0).max(50),
    /** The share of last year's performance that carries over (the rest is this year's aim). */
    carry: share,
    /** A new hire starts this many points from the aim (negative: still learning the ropes). */
    start: z.number().min(-50).max(50),
  }),
  promotion: z.strictObject({
    /** Years at a level before a promotion is possible (a level may set its own). */
    minYears: z.int().min(1).max(20),
    /** Yearly chance of a promotion once you've been at the level long enough, by performance. */
    chance: curveSchema,
    /** Multiplies that chance, by Ambition. */
    ambition: curveSchema,
    /** A promotion raises your salary to the new level's pay, and by at least this share. */
    bump: share,
  }),
  raises: z.strictObject({
    /** The yearly raise when you're not promoted, as a share of salary, by performance. */
    merit: curveSchema,
    /** A raise you asked for (and got), as a share of salary. */
    asked: share,
    /** Yearly and asked-for raises never take your salary more than this share above your level's pay. */
    maxAboveLevel: share,
  }),
  /** Yearly chance of being fired, by performance. */
  firing: curveSchema,
  /** Yearly chance of being laid off, by the city's job market for the category. */
  layoffs: curveSchema,
  /**
   * The year you lose a job (as the year begins), you're still paid this
   * share of its salary: the months you worked before it ended, and any severance.
   */
  jobLoss: z.strictObject({ fired: share, laid_off: share }),
  /** The people you work with. */
  workplace: z.strictObject({
    /** Coworkers you get to know when you start a job... */
    coworkers: z.int().min(0).max(10),
    /** ...the chance each year someone new joins while you have fewer than maxCoworkers... */
    newCoworkerChance: share,
    maxCoworkers: z.int().min(0).max(10),
    /** ...their age relative to yours (never under minAge)... */
    coworkerAgeOffset: range,
    /** ...and your boss's age. */
    bossAge: range,
  }),
  /** The youngest age you can retire. */
  retireAge: z.int().min(30).max(100),
});
export type CareersBalance = z.infer<typeof careersBalanceSchema>;

/**
 * Results of work actions (registries/work.yaml): `hired` and `rejected`
 * answer a job application, `raise` answers asking for a raise.
 */
export const WORK_RESULTS = ['hired', 'rejected', 'raise'] as const;
export type WorkResult = (typeof WORK_RESULTS)[number];
/** The role each result casts: your (new) boss, or nobody. */
export const WORK_RESULT_ROLES: Record<WorkResult, readonly string[]> = { hired: ['boss'], rejected: [], raise: ['boss'] };

export const workRegistrySchema = z.strictObject({
  results: z.strictObject({
    hired: z.strictObject({ events: z.array(idSchema).min(1) }),
    rejected: z.strictObject({ events: z.array(idSchema).min(1) }),
    raise: z.strictObject({ events: z.array(idSchema).min(1) }),
  }),
});
export type WorkRegistry = z.infer<typeof workRegistrySchema>;
