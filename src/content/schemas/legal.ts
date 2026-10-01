/**
 * Legal (docs/design.md, sections D and E; docs/technical.md, Stage 9):
 * offenses as content (src/content/offenses), the legal balance numbers
 * (src/content/balance/legal.yaml) and the events the legal system queues
 * (src/content/registries/legal.yaml).
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { baseDefSchema, dollarsSchema, idSchema } from './common';
import { statEffectsSchema } from './economy';
import type { RECORD_OUTCOMES } from './events';

export type RecordOutcome = (typeof RECORD_OUTCOMES)[number];

const weight = z.number().nonnegative();
const years = z
  .strictObject({ min: z.int().min(1).max(50), max: z.int().min(1).max(50) })
  .refine((r) => r.min <= r.max, 'min must not be greater than max');

/**
 * An offense (docs/technical.md, OffenseDef): how serious it is and the
 * outcomes a court is likely to hand down, with the fines and the years of
 * probation or prison each can mean.
 */
export const offenseSchema = baseDefSchema
  .extend({
    /** As it reads inside a sentence ("shoplifting"). */
    name: z.string().trim().min(1).max(40),
    class: z.enum(['misdemeanor', 'felony']),
    /** 1 (petty) to 5 (grave). */
    severity: z.int().min(1).max(5),
    /** How likely each outcome is when a court decides (a `sentence`), before your record and age adjust it. */
    outcomes: z
      .strictObject({ warning: weight, fine: weight, probation: weight, jail: weight })
      .refine((o) => Object.values(o).some((w) => w > 0), 'needs a positive weight'),
    /** A fine's range in whole dollars (needed when a fine is possible). */
    fine: z
      .strictObject({ min: dollarsSchema.positive(), max: dollarsSchema.positive() })
      .refine((r) => r.min <= r.max, 'min must not be greater than max')
      .optional(),
    /** Years of probation (needed when probation is possible). */
    probationYears: years.optional(),
    /** Years in prison (needed when jail is possible). */
    jailYears: years.optional(),
  })
  .refine((o) => o.outcomes.fine === 0 || o.fine !== undefined, 'a possible fine needs a fine range')
  .refine((o) => o.outcomes.probation === 0 || o.probationYears !== undefined, 'possible probation needs probationYears')
  .refine((o) => o.outcomes.jail === 0 || o.jailYears !== undefined, 'possible jail needs jailYears');
export type OffenseDef = z.infer<typeof offenseSchema>;

const perOutcome = z.strictObject({ warning: weight, fine: weight, probation: weight, jail: weight });

/** Legal numbers (src/content/balance/legal.yaml). */
export const legalBalanceSchema = z.strictObject({
  sentencing: z.strictObject({
    /** Each entry already on your record multiplies the outcome weights by these (a repeat offender fares worse). */
    priorRecord: perOutcome,
    /** Before the independence age, the weights are multiplied by these. Jail is never possible for a minor: it becomes probation. */
    juvenile: perOutcome,
  }),
  probation: z.strictObject({
    /** Chance each year on probation that a probation event happens (registries/legal.yaml probation), by Risk-taking. */
    eventChance: curveSchema,
  }),
  prison: z.strictObject({
    /** Prison events each year inside (instead of the life stage's budget). */
    budget: z.strictObject({ min: z.int().min(0).max(6), max: z.int().min(0).max(6) }).refine((b) => b.min <= b.max, 'min must not be greater than max'),
    /** Yearly pulls on stats while inside. */
    effects: statEffectsSchema,
  }),
  release: z.strictObject({
    /** Years of probation (parole) after release. 0 for none. */
    paroleYears: z.int().min(0).max(20),
  }),
  record: z.strictObject({
    /** With probation or jail on your record within `recentYears`, a landlord's deposit is multiplied by this. */
    depositMultiplier: z.number().min(1).max(10),
    recentYears: z.int().min(1).max(100),
  }),
});
export type LegalBalance = z.infer<typeof legalBalanceSchema>;

/**
 * The events the legal system queues (registries/legal.yaml): `jailed` (the
 * first year inside), `released` (the year you get out) and `probation` (a
 * year on probation, now and then).
 */
export const LEGAL_TRIGGERS = ['jailed', 'released', 'probation'] as const;
export type LegalTrigger = (typeof LEGAL_TRIGGERS)[number];

export const legalRegistrySchema = z.strictObject({
  triggers: z.strictObject(
    Object.fromEntries(LEGAL_TRIGGERS.map((id) => [id, z.strictObject({ events: z.array(idSchema).min(1) })])) as Record<
      LegalTrigger,
      z.ZodObject<{ events: z.ZodArray<typeof idSchema> }>
    >,
  ),
});
export type LegalRegistry = z.infer<typeof legalRegistrySchema>;
