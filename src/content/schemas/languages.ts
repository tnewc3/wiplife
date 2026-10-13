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
});
export type LanguagesBalance = z.infer<typeof languagesBalanceSchema>;

export const languagesRegistrySchema = z.strictObject({ classes: z.strictObject({ events: z.array(idSchema).min(1) }) });
