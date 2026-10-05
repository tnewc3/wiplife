/**
 * Mental health (M1, docs/expansion.md): the balance numbers
 * (src/content/balance/mental-health.yaml) for how conditions begin, run
 * their course and are named, what each way of caring for them costs and
 * does, how close people notice and react, and how a crisis lands; and the
 * registry (registries/mental.yaml) of the events that answer a therapist.
 * The conditions themselves (depression, anxiety, PTSD, ADHD,
 * neurodivergence) are content in src/content/conditions.
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { dollarsSchema, idSchema, TRAIT_KEYS } from './common';
import { statEffectsSchema } from './economy';

const probability = z.number().min(0).max(1);
const share = z.number().min(0).max(1);
const score = z.int().min(0).max(100);
const range = z
  .strictObject({ min: z.int().min(1).max(100), max: z.int().min(1).max(100) })
  .refine((r) => r.min <= r.max, 'min must not be greater than max');

/** How a person who notices you struggling takes it, from supportive to dismissive. */
export const REACTIONS = ['supportive', 'neutral', 'dismissive'] as const;
export type ReactionId = (typeof REACTIONS)[number];
export const reactionSchema = z.enum(REACTIONS);

/** What a cost item is for: priced here, in whole dollars at a cost of living of 1. */
const costItem = z.strictObject({ amount: dollarsSchema, familyHelp: z.boolean() });

export const mentalHealthBalanceSchema = z.strictObject({
  /** Born-with conditions (kind neuro): how common, how inherited, how strong, and what they do to who you are. */
  neuro: z.record(
    idSchema,
    z.strictObject({
      /** Chance anyone is born with it. */
      rate: probability,
      /** Added to the chance (as a multiple of `rate`) for each biological parent who has it. */
      inheritMult: z.number().min(0).max(20),
      severity: range,
      /** Points added to personality at birth (a restless, risk-seeking mind; a deep, careful one). */
      traits: z.partialRecord(z.enum(TRAIT_KEYS), z.int().min(-30).max(30)),
    }),
  ),
  /** Trauma carried, from hard events (0–100): it fades by `decay` a year. PTSD's onset reads it. */
  trauma: z.strictObject({ decay: z.int().min(0).max(50) }),
  /** The chance a condition you have is named, by how bad it is (0–100), when a doctor or a therapist looks. */
  diagnosis: z.strictObject({
    doctor: curveSchema,
    therapist: curveSchema,
    /** A doctor or therapist names ADHD or neurodivergence this share as often (it takes a deliberate assessment). */
    neuroMult: z.number().min(0).max(1),
    /** A deliberate assessment for ADHD or neurodivergence (school testing, an adult asking for one). */
    assessment: curveSchema,
  }),
  /** How a year goes: ups and downs, flare-ups, how care and support help, and what ignoring it costs. */
  course: z.strictObject({
    /** Each year's severity moves by up to this much, either way, on top of its course. */
    swing: z.number().min(0).max(30),
    /** A hard year: the chance of a flare-up (less with care) and how much worse things get. */
    flare: z.strictObject({ chance: probability, careMult: z.number().min(0).max(1), severity: range }),
    /** After recovery the condition can come back: onset chance is multiplied by `mult`, fading to 1 over `years`. */
    relapse: z.strictObject({ mult: z.number().min(1).max(30), years: z.int().min(1).max(50) }),
    /** The share of the condition's treated-versus-untreated course each kind of care delivers (both together are capped at 1). */
    share: z.record(idSchema, z.strictObject({ therapy: share, medication: share })),
    /** Severity points a year that full support from the people around you takes off (supportive minus dismissive, 0–1, times this). */
    supportBonus: z.number().min(0).max(30),
    /** Ignoring it costs more later: while severe and not in care, job performance and grades slip a little each year. */
    ignored: z.strictObject({ severity: score, performance: z.int().min(-30).max(0), grades: z.number().min(-1).max(0) }),
  }),
  care: z.strictObject({
    therapy: z.strictObject({
      /** First visit and each year after, in dollars at a cost of living of 1 (scaled by your city). */
      intake: dollarsSchema,
      yearly: dollarsSchema,
      /** The time it takes: job performance and Stress each year (week after week, hours out of the day). */
      performance: z.int().min(-30).max(0),
      stress: z.int().min(-10).max(10),
    }),
    medication: z.strictObject({
      intake: dollarsSchema,
      yearly: dollarsSchema,
      /** The chance of a side effect in a year on medication, and what it does. */
      sideEffectChance: probability,
      sideEffect: statEffectsSchema,
      /** The chance a flare-up comes when you stop (the year you do). */
      stopFlare: probability,
    }),
    /** Leaning on people: it draws on those who have noticed and are on your side, and it can wear on them. */
    support: z.strictObject({
      /** The most people drawn on, and how well they must know you (trust, 0–100). */
      people: z.int().min(1).max(10),
      minTrust: score,
      /** Each year, to each person leaned on at your worst: their mood falls, their affection can slip. */
      strainMood: z.int().min(-30).max(0),
      strainAffection: z.int().min(-10).max(0),
      strainChance: probability,
      /** Leaning on someone who brushed it off (a dismissive person) costs trust. */
      brushedOffTrust: z.int().min(-30).max(0),
    }),
  }),
  /** Close people noticing you struggle (a yearly roll for each, while the condition is at least `minSeverity`). */
  notice: z.strictObject({
    minSeverity: score,
    /** The youngest person who notices. */
    minAge: z.int().min(0).max(30),
    /** Chance before closeness and where they are. */
    base: probability,
    /** Multiplies the chance by where they are: living with you, in your city, far away. */
    presence: z.strictObject({ household: z.number().min(0).max(10), city: z.number().min(0).max(10), elsewhere: z.number().min(0).max(10) }),
    /** The chance is multiplied by curve(closeness), where closeness is their affection and trust averaged (0–100). */
    closeness: curveSchema,
    /** The most people who notice in one year. */
    maxPerYear: z.int().min(1).max(10),
    /** They notice a diagnosis at once if you tell them (events do that); and noticing is forgotten this many years after it was last true. */
    forgetYears: z.int().min(1).max(30),
  }),
  /** How they take it: a score from kindness and sociability and how close you are, with some luck; the bands pick the reaction. */
  reaction: z.strictObject({
    kindness: z.number().min(0).max(2),
    sociability: z.number().min(0).max(2),
    closeness: z.number().min(0).max(2),
    sd: z.number().min(0).max(40),
    /** At or above: supportive; below `dismissiveBelow`: dismissive; between: neutral. */
    supportiveAbove: score,
    dismissiveBelow: score,
  }),
  /** The weight each reaction carries in the support you feel, scaled by how close they are (affection ÷ 100) and where they are. */
  support: z.strictObject({
    weight: z.strictObject({ supportive: z.number().min(0).max(2), neutral: z.number().min(-2).max(2), dismissive: z.number().min(-2).max(0) }),
    presence: z.strictObject({ household: z.number().min(0).max(10), city: z.number().min(0).max(10), elsewhere: z.number().min(0).max(10) }),
    /** The most the people around you can add or take, as a share of full support. */
    cap: z.number().min(0).max(3),
    /** Support before you struggle (for onset): your closest people, by trust and affection, this many of them. */
    circle: z.int().min(1).max(10),
  }),
  /** Telling someone (the `confide` effect): what it does to how they feel about you, by how they take it. */
  confide: z.strictObject({
    supportive: z.strictObject({ affection: z.int().min(-30).max(30), trust: z.int().min(-30).max(30) }),
    neutral: z.strictObject({ affection: z.int().min(-30).max(30), trust: z.int().min(-30).max(30) }),
    dismissive: z.strictObject({ affection: z.int().min(-30).max(30), trust: z.int().min(-30).max(30) }),
  }),
  /** One-time costs (the `pay` effect): a medical cost, so savings pay first and the rest is medical debt; a child's family pays. */
  costs: z.record(idSchema, costItem),
  /** A crisis (a breakdown, a hospital stay): what it does and how soon it can come again. */
  crisis: z.strictObject({
    /** Every mental health condition you have is named, and gets this much worse. */
    severity: z.int().min(0).max(50),
    stress: z.int().min(-50).max(50),
    happiness: z.int().min(-50).max(50),
    /** Years before another crisis chain can start. */
    cooldownYears: z.int().min(1).max(50),
  }),
});
export type MentalHealthBalance = z.infer<typeof mentalHealthBalanceSchema>;

/**
 * The events that answer a therapist (registries/mental.yaml): `talked`
 * when no condition was named (the sessions still help), and the shared
 * `diagnosed` events (registries/health.yaml) when one was.
 */
export const mentalRegistrySchema = z.strictObject({
  therapist: z.strictObject({
    talked: z.strictObject({ events: z.array(idSchema).min(1) }),
    diagnosed: z.strictObject({ events: z.array(idSchema).min(1) }),
  }),
});
export type MentalRegistry = z.infer<typeof mentalRegistrySchema>;
