/**
 * Activities: leisure and self (docs/post-expansion1-changes.md, Batch 2a).
 * An activity is a content definition (src/content/pastimes; the folder is not
 * `activities`, which holds T1's school teams and clubs): what it is, who can
 * do it and where, whether someone comes along, what it costs, and five
 * outcome tiers (great to backfire) with 2-3 wordings each, the effects of
 * each tier, chances that come up inside it, and the follow-up events it can
 * lead to. One life action, `do_activity`, runs any of them through the
 * finance module, the health and legal systems, the relationships and the
 * event pipeline. Every number (costs, odds, diminishing returns, chances)
 * lives in src/content/balance/pastimes.yaml.
 *
 * Valuables (jewelry, designer goods, art, a boat) are a possession kind
 * (E5 extended): src/content/valuables defines what each is; a Luxury
 * activity that `buys` one acquires it.
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { baseDefSchema, dollarsSchema, idSchema, scoreKeySchema } from './common';
import { VALUABLE_CLASSES } from './belongings';
import { countryIdSchema } from './country';
import { conditionSchema, effectSchema } from './events';
import { OUTCOME_TIERS } from './interactions';
import { templateSchema } from './text';

/** The groups on the Activities screen, in the order they appear. */
export const PASTIME_CATEGORIES = ['mind_body', 'salon_spa', 'surgery', 'shopping', 'movies', 'nightlife', 'outdoor', 'luxury', 'love'] as const;
export type PastimeCategory = (typeof PASTIME_CATEGORIES)[number];

/** Who can come along: your partner, a friend, or family. */
export const PASTIME_COMPANIONS = ['partner', 'friend', 'family'] as const;
export type PastimeCompanionKind = (typeof PASTIME_COMPANIONS)[number];

/** Price tiers of an activity that has them (a surgeon's quality): cheaper means likelier trouble. */
export const PASTIME_QUALITIES = ['budget', 'standard', 'premier'] as const;
export type PastimeQuality = (typeof PASTIME_QUALITIES)[number];

/** The legal ages an activity may need. */
export const PASTIME_LEGAL_AGES = ['drinking', 'gambling', 'driving'] as const;

/**
 * What an activity's effects may do. Nothing here creates money: a money
 * effect, a repayment or dirty money is not allowed (the cost is the only
 * money that moves, through the finance module).
 */
export const PASTIME_EFFECT_TYPES = ['stat', 'memory', 'flag', 'history', 'health', 'legal', 'relationship', 'innerConflict', 'value', 'infidelity'] as const;
const pastimeEffectSchema = effectSchema.refine(
  (e) => (PASTIME_EFFECT_TYPES as readonly string[]).includes(e.type),
  `activities may only use these effects: ${PASTIME_EFFECT_TYPES.join(', ')}`,
);

const wordings = z.array(templateSchema).min(2).max(3);

/** A chance inside a tier: the key names an entry in balance/pastimes.yaml chances. */
const pastimeExtraSchema = z.strictObject({
  chance: idSchema,
  /** Only when this holds (conditions about you; the companion is the role `companion`). */
  if: conditionSchema.optional(),
  effects: z.array(pastimeEffectSchema).min(1),
  /** A line added to the outcome when it happens. */
  note: templateSchema.optional(),
});

export const pastimeTierSchema = z.strictObject({
  /** Wordings when you go alone (2-3). */
  text: wordings.optional(),
  /** Wordings when someone comes along (2-3); the companion is {companion.name}, {companion.they}... */
  together: wordings.optional(),
  effects: z.array(pastimeEffectSchema).default([]),
  /** What it does between you and the companion (gains shrink with repeats). */
  companion: z.strictObject({ affection: z.int().min(-30).max(30), trust: z.int().min(-30).max(30).default(0) }).optional(),
  extras: z.array(pastimeExtraSchema).default([]),
  /** Follow-up events: if one of these fits and can be cast, it opens after the outcome (with the chance named in `eventChance`, always when absent). */
  events: z.array(idSchema).default([]),
  eventChance: idSchema.optional(),
  /**
   * A drunk drive home (E5): with the chance named here, and only if you own a vehicle, hold a license and are of driving age,
   * the drunk-driving event of the possessions registry opens after the outcome. It comes before any follow-up event.
   */
  drunkDrive: idSchema.optional(),
});
export type PastimeTier = z.infer<typeof pastimeTierSchema>;

export const pastimeSchema = baseDefSchema
  .extend({
    category: z.enum(PASTIME_CATEGORIES),
    /** The button: "Go to the gym". */
    label: z.string().trim().min(1).max(40),
    blurb: z.string().trim().min(1).max(120),
    /** The youngest age. Nightlife, plastic surgery, luxury and love are adults only (the content build checks). */
    minAge: z.int().min(0).max(100),
    /** Also needs the legal age for this where you live now (a city or country may set its own). */
    legalAge: z.enum(PASTIME_LEGAL_AGES).optional(),
    /** Only in these countries or cities (all when absent). */
    countries: z.array(countryIdSchema).min(1).optional(),
    cities: z.array(idSchema).min(1).optional(),
    /** You are there in person: a companion must be in your city or home, and a hospital or venue is in your own city. */
    inPerson: z.boolean(),
    /** Whether someone can come along: not at all, if you like, or it is a night for two (love). */
    companion: z.enum(['none', 'optional', 'required']),
    companionKinds: z.array(z.enum(PASTIME_COMPANIONS)).min(1).optional(),
    /** The price: a key of balance/pastimes.yaml costs (US prices, scaled to the country's price level and your city). */
    cost: idSchema,
    /** The odds of each tier: a key of balance/pastimes.yaml profiles. */
    profile: idSchema,
    /** It has price tiers (budget, standard, premier): you choose one, and it changes the price and the odds. */
    quality: z.boolean().optional(),
    /** The most times a year. */
    yearlyLimit: z.int().min(1).max(12),
    /** Other things that must hold (about you; evaluated like an event's requires). */
    requires: conditionSchema.optional(),
    /** Luxury: buying this activity acquires the valuable of this id (the price is the cost). */
    buys: idSchema.optional(),
    tiers: z.strictObject({
      great: pastimeTierSchema.optional(),
      good: pastimeTierSchema,
      neutral: pastimeTierSchema,
      bad: pastimeTierSchema.optional(),
      backfire: pastimeTierSchema.optional(),
    }),
    /** Why a wording is allowed to say something the checks can't judge (as an event's `justified`). */
    justified: z.string().trim().min(1).max(200).optional(),
  })
  .superRefine((def, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    if ((def.companion === 'none') !== (def.companionKinds === undefined)) issue('companionKinds goes with companion: optional or required (and only with it)');
    if (def.companion !== 'none' && !def.inPerson) issue('a companion needs inPerson: true');
    for (const tier of OUTCOME_TIERS) {
      const t = def.tiers[tier];
      if (!t) continue;
      const alone = def.companion !== 'required';
      const together = def.companion !== 'none';
      if (alone && t.text === undefined) issue(`tiers.${tier}.text is needed (you can go alone)`);
      if (!alone && t.text !== undefined) issue(`tiers.${tier}.text is not used (a companion is required): write together`);
      if (together && t.together === undefined) issue(`tiers.${tier}.together is needed (someone can come along)`);
      if (!together && t.together !== undefined) issue(`tiers.${tier}.together is not used (nobody can come along)`);
      if (t.companion && def.companion === 'none') issue(`tiers.${tier}.companion is for an activity someone can join`);
    }
  });
export type PastimeDef = z.infer<typeof pastimeSchema>;

/** A valuable (src/content/valuables): jewelry, designer goods, art or a boat. The price is the cost of the activity that buys it. */
export const valuableSchema = baseDefSchema.extend({
  /** As it reads in a sentence: "pearl necklace". */
  name: z.string().trim().min(1).max(30),
  blurb: z.string().trim().min(1).max(100),
  class: z.enum(VALUABLE_CLASSES),
});
export type ValuableDef = z.infer<typeof valuableSchema>;

const share = z.number().min(0).max(1);
const weight = z.number().min(0).max(100);

const qualityRow = z.strictObject({ price: z.number().min(0.1).max(10), complication: z.number().min(0).max(20), odds: z.number().min(0.1).max(10) });

/** The activity numbers (src/content/balance/pastimes.yaml). */
export const pastimesBalanceSchema = z.strictObject({
  returns: z.strictObject({
    /** Gains (stats, a companion's affection) are multiplied by this for each earlier time you did the same activity this year. */
    repeat: share,
    /** The great and good outcomes' odds are multiplied by this for each earlier time. */
    tierShift: share,
    /** The least a gain is multiplied down to. */
    floor: share,
  }),
  /** What it costs when someone comes along and you pay for both: the price is multiplied by this. */
  companionCost: z.number().min(1).max(3),
  /** What each activity costs, by key, at US prices. */
  costs: z.record(idSchema, dollarsSchema),
  /** Price tiers: the price, how often it goes wrong (complication chances multiply by it) and how often it goes well (great and good odds multiply by it). */
  quality: z.strictObject({ budget: qualityRow, standard: qualityRow, premier: qualityRow }),
  /** The relative odds of each tier, and the traits that tilt them (value 50 is neutral; a higher one favors the good side). */
  profiles: z.record(
    idSchema,
    z.strictObject({
      great: weight,
      good: weight,
      neutral: weight,
      bad: weight,
      backfire: weight,
      tilt: z.array(z.strictObject({ key: scoreKeySchema, weight: z.number().min(-2).max(2) })).default([]),
    }),
  ),
  /** Chances inside an outcome: a base, curves over your stats or traits that multiply it, and how it changes with repeats and a price tier. */
  chances: z.record(
    idSchema,
    z.strictObject({
      base: share,
      factors: z.array(z.strictObject({ key: scoreKeySchema, curve: curveSchema })).default([]),
      repeat: z.number().min(0).max(5).default(1),
      quality: z.boolean().default(false),
    }),
  ),
  /** The receipts kept for the Activities screen: this many of this year's, newest last. */
  receipts: z.int().min(1).max(50),
});
export type PastimesBalance = z.infer<typeof pastimesBalanceSchema>;
