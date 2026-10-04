/**
 * Interactions (docs/expansion.md, E1): the things you can do with a person
 * from their page. Each is a content definition (src/content/interactions),
 * with who it's available with, five outcome tiers (great to backfire) with
 * text variants and effects, and optionally a choice inside the outcome
 * card. The odds and every other number live in
 * src/content/balance/interactions.yaml.
 */
import { z } from 'zod';
import { curveSchema, familyWealthSchema } from './balance';
import { baseDefSchema, idSchema, scoreKeySchema, TRAIT_KEYS } from './common';
import { conditionSchema, effectSchema } from './events';
import { FAMILY_CHANCE_KEYS } from './family';
import { relationshipKindSchema, relationshipStatusSchema } from './relationships';
import { templateSchema } from './text';

/** Groups on the Interact sheet. */
export const INTERACTION_GROUPS = ['everyday', 'conflict', 'romance', 'practical', 'parenting'] as const;
export type InteractionGroup = (typeof INTERACTION_GROUPS)[number];

/** Outcome tiers, best first. */
export const OUTCOME_TIERS = ['great', 'good', 'neutral', 'bad', 'backfire'] as const;
export type OutcomeTier = (typeof OUTCOME_TIERS)[number];

/** Gift price tiers (balance/interactions.yaml gifts). */
export const GIFT_TIERS = ['small', 'medium', 'big'] as const;
export type GiftTier = (typeof GIFT_TIERS)[number];

/**
 * Chances named in content (an injury in a fight, a health risk, being found
 * out), whose numbers live in balance/interactions.yaml chances.
 */
export const INTERACTION_CHANCE_KEYS = [
  'fightInjury',
  'fightCharge',
  'fightDiscipline',
  'intimacyTreatable',
  'intimacyChronic',
  'intimacyTreatableCareful',
  'intimacyChronicCareful',
] as const;
export type InteractionChanceKey = (typeof INTERACTION_CHANCE_KEYS)[number];
/** Chances in the interactions balance, and (E2a) those the family rules work out (conceiving, from balance/family.yaml). */
const chanceKeySchema = z.enum([...INTERACTION_CHANCE_KEYS, ...FAMILY_CHANCE_KEYS]);

/** What interactions may do: the effect types that make sense for a moment between two people. */
export const INTERACTION_EFFECT_TYPES = [
  'stat',
  'relationship',
  'memory',
  'flag',
  'history',
  'health',
  'legal',
  'education',
  'innerConflict',
  'schedule',
  'moneyFromPerson',
  'infidelity',
  'pregnancy',
  'parenting',
  'childStat',
  'childTrait',
] as const;

const interactionEffectSchema = effectSchema.refine(
  (e) => (INTERACTION_EFFECT_TYPES as readonly string[]).includes(e.type),
  `interactions may only use these effects: ${INTERACTION_EFFECT_TYPES.join(', ')}`,
);

/** Extra results that happen when a condition holds and/or a named chance comes up. */
const extraSchema = z
  .strictObject({
    if: conditionSchema.optional(),
    chance: chanceKeySchema.optional(),
    effects: z.array(interactionEffectSchema).min(1),
    /** A line added to the outcome card when it happens (an injury, a charge). */
    note: templateSchema.optional(),
  })
  .refine((x) => x.if !== undefined || x.chance !== undefined, 'an extra needs if or chance');

const delta = z.int().min(-40).max(40);

/** What an outcome does: how the person feels about you, their mood, effects and extras. */
const consequenceFields = {
  /** Change to their affection for you. Gains shrink with repeats; losses don't. */
  affection: delta.default(0),
  trust: delta.default(0),
  /** Change to their mood. */
  mood: delta.default(0),
  effects: z.array(interactionEffectSchema).default([]),
  extras: z.array(extraSchema).default([]),
};

/** One option of a choice inside an outcome card. */
const choiceOptionSchema = z.strictObject({
  id: idSchema,
  label: z.string().trim().min(1).max(60),
  text: templateSchema,
  ...consequenceFields,
});

/** One outcome tier: 2–3 wordings, its consequences and, for a big moment, a choice. */
export const interactionTierSchema = z.strictObject({
  text: z.array(templateSchema).min(2).max(3),
  ...consequenceFields,
  choice: z
    .strictObject({
      prompt: templateSchema,
      options: z.array(choiceOptionSchema).min(2).max(3),
    })
    .refine((c) => new Set(c.options.map((o) => o.id)).size === c.options.length, 'choice option ids must be unique')
    .optional(),
});
export type InteractionTier = z.infer<typeof interactionTierSchema>;
export type InteractionChoiceOption = z.infer<typeof choiceOptionSchema>;

const ageRangeSchema = z
  .strictObject({ min: z.int().min(0).max(120).optional(), max: z.int().min(0).max(120).optional() })
  .refine((r) => r.min !== undefined || r.max !== undefined, 'needs min or max');
export type AgeRange = z.infer<typeof ageRangeSchema>;

export const interactionSchema = baseDefSchema
  .extend({
    /** On the Interact sheet. */
    name: z.string().trim().min(1).max(30),
    /** One line under the name. */
    blurb: z.string().trim().min(1).max(80),
    group: z.enum(INTERACTION_GROUPS),
    /** Which reaction profile in balance/interactions.yaml sets its odds. */
    profile: idSchema,
    /** Romance: adults only, never with family (the engine and the content build both enforce it). */
    romance: z.literal(true).optional(),
    /** Being intimate: health risks and cheating (suggestive, never graphic). */
    intimate: z.literal(true).optional(),
    /** Takes a gift price tier (small, medium or big) and spends real money. */
    gift: z.literal(true).optional(),
    /** Needs the person to live in your city; otherwise it works anywhere. */
    inPerson: z.boolean(),
    /** Possible from prison: a visit, a call or a letter. */
    visit: z.literal(true).optional(),
    availability: z.strictObject({
      kinds: z.array(relationshipKindSchema).min(1),
      /** Relationship statuses it works with (active by default; apologize also works when estranged). */
      status: z.array(relationshipStatusSchema).min(1).default(['active']),
      /** Your age. */
      you: ageRangeSchema,
      /** Their age. */
      them: ageRangeSchema,
      /** Anything more, with the person cast as `person` (affection, your romance status...). */
      requires: conditionSchema.optional(),
    }),
    outcomes: z.strictObject({
      great: interactionTierSchema.optional(),
      good: interactionTierSchema,
      neutral: interactionTierSchema,
      bad: interactionTierSchema,
      backfire: interactionTierSchema.optional(),
    }),
  })
  .refine((d) => d.group !== 'romance' || d.romance === true, 'an interaction in the romance group must be marked romance: true')
  .refine((d) => d.intimate !== true || d.romance === true, 'an intimate interaction must be marked romance: true');
export type InteractionDef = z.infer<typeof interactionSchema>;

const probability = z.number().min(0).max(1);
const traitMap = z.partialRecord(z.enum(TRAIT_KEYS), z.number().min(-1).max(1));
const youMap = z.partialRecord(scoreKeySchema, z.number().min(-1).max(1));

/** A reaction profile: the odds of an interaction's tiers. */
export const reactionProfileSchema = z.strictObject({
  /** Starting score (about 0 is a coin flip between neutral and good). */
  base: z.number().min(-60).max(60),
  /** Their personality: points per point of the trait above 50. */
  their: traitMap,
  /** Your stats, traits and hidden values: points per point above 50. */
  you: youMap,
  /** Points lost for each earlier use of this interaction with this person this year, and for each earlier interaction of any kind. */
  repeat: z.strictObject({ same: z.number().min(0).max(40), total: z.number().min(0).max(10) }),
  /** Trust lost for each earlier use this year, whatever the outcome (asking again and again costs trust). */
  repeatTrust: z.number().min(0).max(20).default(0),
  /** Memory tags that change how this goes (points, within the memory window). */
  memories: z.record(idSchema, z.number().min(-40).max(40)).default({}),
});
export type ReactionProfile = z.infer<typeof reactionProfileSchema>;

const moneyRange = z
  .strictObject({ min: z.int().min(1).max(1_000_000), max: z.int().min(1).max(1_000_000) })
  .refine((r) => r.min <= r.max, 'min must not be greater than max');

/** Interactions: the reaction roll, diminishing returns, moods, wealth, gifts, money and linked chances (src/content/balance/interactions.yaml). */
export const interactionsBalanceSchema = z.strictObject({
  reaction: z.strictObject({
    /** Spread of the roll added to the score, so the same situation doesn't always go the same way. */
    noiseSd: z.number().min(0).max(60),
    /** The score a roll must reach for each tier from the bottom up: below backfire it backfires; bad, neutral, good and great as it climbs. */
    thresholds: z
      .strictObject({ backfire: z.number(), bad: z.number(), good: z.number(), great: z.number() })
      .refine((t) => t.backfire < t.bad && t.bad < t.good && t.good < t.great, 'thresholds must rise: backfire < bad < good < great'),
    /** Points per point of affection, trust and mood above 50. */
    weights: z.strictObject({ affection: z.number().min(0).max(2), trust: z.number().min(0).max(2), mood: z.number().min(0).max(2) }),
    /** Memories count for this many years, at most `cap` points either way. */
    memory: z.strictObject({ years: z.int().min(1).max(50), cap: z.number().min(0).max(100) }),
    /** Using the same interaction this many times in a year (before this one) leaves them annoyed with you. */
    annoyedAfter: z.int().min(1).max(50),
  }),
  profiles: z.record(idSchema, reactionProfileSchema),
  returns: z.strictObject({
    /** Gains (affection, trust, mood, and your own stat gains) are multiplied by this for each earlier use of the same interaction with this person this year. */
    same: z.number().min(0).max(1),
    /** ...and by this for each earlier interaction of any kind. */
    total: z.number().min(0).max(1),
    /**
     * Gains in affection and trust are also multiplied by this, by how high
     * it already is: the closer a relationship is to the top, the harder
     * interactions push it (a few more points of "maximum" take a lifetime).
     */
    byLevel: curveSchema,
    /** The most affection and trust one person can gain from your interactions in a year. */
    yearlyCap: z.strictObject({ affection: z.int().min(1).max(100), trust: z.int().min(1).max(100) }),
  }),
  mood: z.strictObject({
    baseline: z.strictObject({
      base: z.number().min(0).max(100),
      /** Points per point of their trait above 50. */
      traits: traitMap,
      /** Points by their wealth level. */
      wealth: z.strictObject({ poor: z.number(), working: z.number(), middle: z.number(), affluent: z.number(), rich: z.number() }),
      /** Points by their age. */
      age: z.array(z.strictObject({ at: z.number(), x: z.number() })).min(1),
      /** Points when you're estranged. */
      estranged: z.number(),
      /** Points when you're in prison (it weighs on the people who love you). */
      yourPrison: z.number(),
      /** Points per point of their affection for you above 50. */
      affection: z.number().min(0).max(1),
      /** Spread of the swing each year brings (work, health, weather of life). */
      noiseSd: z.number().min(0).max(40),
    }),
    /** Each year their mood closes this share of the gap to their baseline. */
    drift: z.number().min(0).max(1),
    /** Friends (and other non-family) at this affection or more show a mood word; family and your partner always do. */
    closeAffection: z.int().min(0).max(100),
    /** Mood at or above each of these is that band; below `low`, it's `bad`. */
    bands: z.strictObject({ great: z.int().min(0).max(100), good: z.int().min(0).max(100), okay: z.int().min(0).max(100), low: z.int().min(0).max(100) }),
  }),
  wealth: z.strictObject({
    /** How much their occupation counts against their family background (0–1). */
    occupationWeight: probability,
    /** A job track's pay at its start level, to wealth: the first bracket whose upTo it's under. */
    salaryBrackets: z.array(z.strictObject({ upTo: z.int().min(1).optional(), level: familyWealthSchema })).min(2),
    /** Share of adults you meet (not family) who have a job. */
    employedShare: probability,
    /** Chance someone you meet has your family background, otherwise it's rolled from the usual odds. */
    peerChance: probability,
  }),
  gifts: z.strictObject({
    /** Price at the national average, how well it lands (points added to the score) and how much it adds to their feelings (multiplies positive affection, trust and mood). */
    tiers: z.strictObject({
      small: z.strictObject({ price: z.int().min(1), score: z.number(), warmth: z.number().min(0).max(5) }),
      medium: z.strictObject({ price: z.int().min(1), score: z.number(), warmth: z.number().min(0).max(5) }),
      big: z.strictObject({ price: z.int().min(1), score: z.number(), warmth: z.number().min(0).max(5) }),
    }),
    /** What a gift means to them, by their wealth level: multiplies the points. */
    wealthValue: z.strictObject({ poor: z.number(), working: z.number(), middle: z.number(), affluent: z.number(), rich: z.number() }),
    /** Before the independence age, prices are multiplied by this. */
    childShare: z.number().min(0).max(1),
    /** How far past your savings you may go (as debt) on a gift once independent. */
    maxBorrow: z.int().min(0).max(100_000),
  }),
  money: z.strictObject({
    /** What a person gives or lends when you ask, by their wealth level (whole dollars at the national average, scaled to your city's cost of living). */
    ask: z.strictObject({ poor: moneyRange, working: moneyRange, middle: moneyRange, affluent: moneyRange, rich: moneyRange }),
    /** Before the independence age, what you're given is multiplied by this (pocket money). */
    childShare: z.number().min(0).max(1),
    /** A loan is a personal debt at this yearly rate, paid back over this many years. */
    loan: z.strictObject({ annualRate: z.number().min(0).max(1), termYears: z.int().min(1).max(30) }),
  }),
  chances: z.strictObject(Object.fromEntries(INTERACTION_CHANCE_KEYS.map((k) => [k, probability])) as Record<InteractionChanceKey, typeof probability>),
  /** Being unfaithful: the chance each kind of act is found out, and when. */
  infidelity: z.strictObject({
    discovery: z.strictObject({ flirt: probability, intimate: probability }),
    inYears: z
      .strictObject({ min: z.int().min(1), max: z.int().min(1) })
      .refine((r) => r.min <= r.max, 'min must not be greater than max'),
  }),
});
export type InteractionsBalance = z.infer<typeof interactionsBalanceSchema>;

/**
 * Interaction registry (registries/interactions.yaml): the follow-up events
 * that answer being unfaithful. The engine picks one that fits for each act,
 * by weight; every event listed must be followUpOnly.
 */
export const interactionRegistrySchema = z.strictObject({
  infidelity: z.strictObject({
    flirt: z.strictObject({ events: z.array(idSchema).min(1) }),
    intimate: z.strictObject({ events: z.array(idSchema).min(1) }),
  }),
});
export type InteractionRegistry = z.infer<typeof interactionRegistrySchema>;
