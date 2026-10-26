import { z } from 'zod';
import { baseDefSchema, idSchema, scoreSchema } from './common';
import { countryIdSchema } from './country';

export const languageSchema = baseDefSchema.extend({ name: z.string().trim().min(1).max(40) });
export type LanguageDef = z.infer<typeof languageSchema>;
export const languageSkillSchema = z.strictObject({
  id: idSchema,
  skill: scoreSchema,
  native: z.boolean(),
  lastUsed: z.int(),
});
export type LanguageSkill = z.infer<typeof languageSkillSchema>;
export type LanguageLevel = 'basic' | 'conversational' | 'fluent';
const levels = z.strictObject({ basic: scoreSchema, conversational: scoreSchema, fluent: scoreSchema })
  .refine((v) => v.basic < v.conversational && v.conversational < v.fluent, 'language levels must increase');
const requirements = z.strictObject({
  /** Alternatives: meeting any language is enough. */
  any: z.array(idSchema).min(1),
  level: z.enum(['basic', 'conversational', 'fluent']),
});
export const languagesBalanceSchema = z.strictObject({
  levels,
  nativeSkill: scoreSchema,
  heritageChance: z.number().min(0).max(1),
  heritage: z.record(idSchema, z.array(idSchema)),
  bilingualChance: z.record(idSchema, z.number().min(0).max(1)),
  school: z.strictObject({ minAge: z.int().min(3), gain: scoreSchema, choices: z.record(countryIdSchema, z.array(idSchema).min(1)) }),
  classes: z.strictObject({ minAge: z.int().min(18), gain: scoreSchema, cost: z.int().positive(), interestChance: z.number().min(0).max(1) }),
  immersion: z.strictObject({ minAge: z.int().nonnegative(), gain: scoreSchema, householdGain: scoreSchema }),
  fading: z.strictObject({ graceYears: z.int().nonnegative(), loss: scoreSchema, nativeFloor: scoreSchema }),
  meeting: z.strictObject({ shared: z.number().positive(), barrier: z.number().positive(), affectionPenalty: scoreSchema }),
  interaction: z.strictObject({ sharedBonus: z.number(), barrierPenalty: z.number(), nonverbalFactor: z.number().min(0).max(1), nonverbal: z.array(idSchema) }),
  jobs: z.strictObject({
    byCategory: z.strictObject({ professional: z.enum(['basic', 'conversational', 'fluent']), trade: z.enum(['basic', 'conversational', 'fluent']), gig: z.enum(['basic', 'conversational', 'fluent']) }),
    countries: z.partialRecord(countryIdSchema, z.record(idSchema, requirements)),
    cities: z.record(idSchema, z.record(idSchema, requirements)),
  }),
  eventGain: scoreSchema,
  /** Batch 10: paid ways to learn besides the adult class. An app is cheap and slow, a tutor costs more and is fast; one set of each a year. */
  methods: z.strictObject({
    app: z.strictObject({ cost: z.int().positive(), gain: scoreSchema }),
    tutor: z.strictObject({ cost: z.int().positive(), gain: scoreSchema }),
  }),
  /** Batch 10: practicing with a native speaker you know: skill gained for a good outing (a share of `gain` by how it went), and the most a year. */
  practice: z.strictObject({ gain: scoreSchema, yearlyMax: scoreSchema, great: z.number().positive(), good: z.number().positive(), neutral: z.number().positive() }),
  /** Batch 10: certificate exams. The fee by level; you may sit one when within `margin` points of the level's bar; the odds follow your skill over the bar. */
  exams: z.strictObject({
    minAge: z.int().min(14),
    fee: z.strictObject({ basic: z.int().positive(), conversational: z.int().positive(), fluent: z.int().positive() }),
    margin: scoreSchema,
    odds: z.strictObject({ base: z.number().min(0).max(1), perPoint: z.number().min(0).max(0.1), min: z.number().min(0).max(1), max: z.number().min(0).max(1) }),
    /** The odds as words on the exam button: below `fair` is slim, from `fair` fair, from `good` good, from `strong` strong. */
    words: z.strictObject({ fair: z.number().min(0).max(1), good: z.number().min(0).max(1), strong: z.number().min(0).max(1) }),
  }),
  /** Batch 10: raising a child in a language of your own. A child this young takes it as a first language; each year at home adds skill. */
  home: z.strictObject({ maxAge: z.int().min(1).max(18), nativeAge: z.int().min(0).max(12), start: scoreSchema, yearlyGain: scoreSchema }),
  /** Batch 10: a heritage language coming back: the skill a returning event restores. */
  heritageReturn: z.strictObject({ gain: scoreSchema }),
});
export type LanguagesBalance = z.infer<typeof languagesBalanceSchema>;

export const languagesRegistrySchema = z.strictObject({
  classes: z.strictObject({ events: z.array(idSchema).min(1) }),
  /** Batch 10: the receipts of an app, a tutor and an exam (passed or failed). */
  app: z.strictObject({ events: z.array(idSchema).min(1) }),
  tutor: z.strictObject({ events: z.array(idSchema).min(1) }),
  exam: z.strictObject({ passed: z.array(idSchema).min(1), failed: z.array(idSchema).min(1) }),
});
