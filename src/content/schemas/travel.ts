import { z } from 'zod';
import { baseDefSchema, idSchema, scoreSchema } from './common';

export const TRIP_BUDGETS = ['budget', 'comfortable', 'splurge'] as const;
/** W5 gave the first three; W6 adds permanent residence and living without papers. */
export const STAY_TYPES = ['visitor', 'student', 'temporary_worker', 'permanent_resident', 'undocumented'] as const;
/** How a stay began: W5's trips and temporary stays, W6's legal routes and the ways someone ends up without papers. */
export const STAY_ROUTES = ['vacation', 'semester', 'year', 'working_holiday', 'transfer', 'work_sponsor', 'study_work', 'family', 'investment', 'overstay', 'irregular', 'regularized'] as const;
export const destinationSchema = baseDefSchema.extend({
  name: z.string().min(1), country: z.string().min(1), languageId: idSchema,
  cityId: idSchema.optional(), costLevel: z.number().positive(),
  kind: z.enum(['city', 'coast', 'culture', 'outdoors']),
});
export type DestinationDef = z.infer<typeof destinationSchema>;
const tripEffects = z.strictObject({ happiness: z.int(), stress: z.int() });
export const travelBalanceSchema = z.strictObject({
  minAge: z.int().min(18), maxCompanions: z.int().positive(),
  budgets: z.record(z.enum(TRIP_BUDGETS), z.strictObject({ cost: z.int().positive(), effects: tripEffects })),
  companionCostShare: z.number().nonnegative(), companionAffection: scoreSchema,
  tripImmersion: scoreSchema, distanceAffection: scoreSchema,
  exchange: z.strictObject({ cost: z.int().positive(), semesterGain: scoreSchema, yearGain: scoreSchema }),
  work: z.strictObject({ cost: z.int().positive(), holidayMaxAge: z.int().min(18), years: z.int().min(1).max(3) }),
  simulation: z.strictObject({ tripChance: z.number().min(0).max(1), companionChance: z.number().min(0).max(1), studyChance: z.number().min(0).max(1), workChance: z.number().min(0).max(1) }),
});
export const travelRegistrySchema = z.strictObject({
  trips: z.array(idSchema).min(1), study: z.array(idSchema).min(1), work: z.array(idSchema).min(1),
});
export const travelTextSchema = z.strictObject({
  departed: z.array(z.string()).min(1), returned: z.array(z.string()).min(1),
  vacation: z.array(z.string()).min(1),
});
