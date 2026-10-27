import { z } from 'zod';
import { baseDefSchema, idSchema, scoreSchema } from './common';

export const TRIP_BUDGETS = ['budget', 'comfortable', 'splurge'] as const;
/** W5 gave the first three; W6 adds permanent residence and living without papers. */
export const STAY_TYPES = ['visitor', 'student', 'temporary_worker', 'permanent_resident', 'undocumented'] as const;
/** How a stay began: W5's trips and temporary stays, W6's legal routes and the ways someone ends up without papers. */
export const STAY_ROUTES = ['vacation', 'semester', 'year', 'working_holiday', 'transfer', 'work_sponsor', 'study_work', 'family', 'investment', 'overstay', 'irregular', 'regularized'] as const;
/** Batch 10: how a trip is taken, what you do there, and what you bring back. */
export const TRIP_STYLES = ['vacation', 'cruise', 'honeymoon', 'group', 'business'] as const;
export const TRIP_ACTIVITIES = ['sightseeing', 'nightlife', 'adventure', 'food', 'immersion'] as const;
export const SOUVENIRS = ['none', 'small', 'keepsake', 'valuable'] as const;
export type TripStyle = (typeof TRIP_STYLES)[number];
export type TripActivity = (typeof TRIP_ACTIVITIES)[number];
export type Souvenir = (typeof SOUVENIRS)[number];
export const destinationSchema = baseDefSchema.extend({
  name: z.string().min(1), country: z.string().min(1), languageId: idSchema,
  cityId: idSchema.optional(), costLevel: z.number().positive(),
  kind: z.enum(['city', 'coast', 'culture', 'outdoors', 'cruise']),
  /** Batch 10: the name pool (names/<pool>.yaml) and heritage the locals met here take, where a fitting one exists. */
  locals: z.strictObject({ pool: idSchema, heritage: idSchema }).optional(),
  /** Batch 10: the valuable a pricey souvenir from here is (src/content/valuables). */
  souvenir: idSchema.optional(),
});
export type DestinationDef = z.infer<typeof destinationSchema>;
const tripEffects = z.strictObject({ happiness: z.int(), stress: z.int() });
export const travelBalanceSchema = z.strictObject({
  minAge: z.int().min(18), maxCompanions: z.int().positive(),
  budgets: z.record(z.enum(TRIP_BUDGETS), z.strictObject({ cost: z.int().positive(), effects: tripEffects })),
  companionCostShare: z.number().nonnegative(), companionAffection: scoreSchema,
  /** Batch 10: the chance a planned trip (a style, an activity or a souvenir) also tells one of the general stories. */
  genericStoryChance: z.number().min(0).max(1),
  tripImmersion: scoreSchema, distanceAffection: scoreSchema,
  exchange: z.strictObject({ cost: z.int().positive(), semesterGain: scoreSchema, yearGain: scoreSchema }),
  work: z.strictObject({ cost: z.int().positive(), holidayMaxAge: z.int().min(18), years: z.int().min(1).max(3) }),
  /** Batch 10: the kinds of trip. `costFactor` multiplies the budget's price; the rest is what each does. */
  styles: z.strictObject({
    vacation: z.strictObject({ costFactor: z.number().positive() }),
    cruise: z.strictObject({ costFactor: z.number().positive(), effects: tripEffects }),
    honeymoon: z.strictObject({ costFactor: z.number().positive(), withinYears: z.int().min(1).max(10), affection: scoreSchema, trust: scoreSchema, effects: tripEffects }),
    group: z.strictObject({ costFactor: z.number().positive(), minFriends: z.int().min(2).max(3), friendAffection: scoreSchema, effects: tripEffects }),
    /** The employer pays the trip; you are paid `perDiem` (at US prices) for the days away, and the work counts toward your standing at the job. */
    business: z.strictObject({ perDiem: z.int().positive(), performance: z.int().min(0).max(30), effects: tripEffects }),
  }),
  /** Batch 10: what you do on a trip. `extra` is added to the booking (at the budget's price level), `stats` change on top of the budget's effects. */
  activities: z.record(z.enum(TRIP_ACTIVITIES), z.strictObject({
    minAge: z.int().min(18), extra: z.int().nonnegative(),
    stats: z.partialRecord(z.enum(['happiness', 'smarts', 'health', 'looks', 'stress']), z.int().min(-20).max(20)),
    languageGain: scoreSchema,
  })),
  /** Batch 10: souvenirs by tier: the price at the destination's cost level and the happiness they bring. */
  souvenirs: z.strictObject({ small: z.strictObject({ cost: z.int().positive(), happiness: z.int() }), keepsake: z.strictObject({ cost: z.int().positive(), happiness: z.int() }), valuable: z.strictObject({ cost: z.int().positive(), happiness: z.int() }) }),
  /** Batch 10: a partner and children coming along on a temporary stay: the share of the stay's price each adds, and the most children. */
  family: z.strictObject({ costShare: z.number().min(0).max(1), maxChildren: z.int().min(1).max(8) }),
  simulation: z.strictObject({ tripChance: z.number().min(0).max(1), companionChance: z.number().min(0).max(1), studyChance: z.number().min(0).max(1), workChance: z.number().min(0).max(1), familyChance: z.number().min(0).max(1), businessChance: z.number().min(0).max(1), cruiseChance: z.number().min(0).max(1), groupChance: z.number().min(0).max(1), souvenirChance: z.number().min(0).max(1) }),
});
export const travelRegistrySchema = z.strictObject({
  trips: z.array(idSchema).min(1), study: z.array(idSchema).min(1), work: z.array(idSchema).min(1),
  /** Batch 10: the story each activity and each kind of trip tells (the generic `trips` stories still apply). */
  activity: z.record(z.enum(TRIP_ACTIVITIES), z.array(idSchema).min(1)),
  style: z.record(z.enum(['cruise', 'honeymoon', 'group', 'business']), z.array(idSchema).min(1)),
  /** Batch 10: the stories of a trip's souvenir, and of a family on a temporary stay. */
  souvenir: z.array(idSchema).min(1),
  family: z.array(idSchema).min(1),
});
export const travelTextSchema = z.strictObject({
  departed: z.array(z.string()).min(1), returned: z.array(z.string()).min(1),
  vacation: z.array(z.string()).min(1),
});
