/**
 * Health (docs/design.md, sections E and F; docs/technical.md, Stage 9):
 * health conditions as content (src/content/conditions), the health balance
 * numbers (src/content/balance/health.yaml) and the events that answer a
 * doctor's visit (src/content/registries/health.yaml).
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { baseDefSchema, conditionKindSchema, dollarsSchema, idSchema, mentalCareSchema, STAT_KEYS, TRAIT_KEYS } from './common';
import { statEffectsSchema } from './economy';
import { conditionSchema } from './events';

/**
 * What onset can depend on besides age: a stat, a trait, vice or genetic risk,
 * and (M1) how much trauma you carry (0–100) and how much support your circle
 * gives you (0–100, from your closest people).
 */
export const ONSET_FACTOR_KEYS = [...STAT_KEYS, ...TRAIT_KEYS, 'vice', 'geneticRisk', 'trauma', 'support'] as const;


const severityRange = z
  .strictObject({ min: z.int().min(1).max(100), max: z.int().min(1).max(100) })
  .refine((r) => r.min <= r.max, 'min must not be greater than max');

/**
 * A health condition (docs/technical.md, ConditionDef): who gets it and how
 * often, how it runs its course, what it does each year, whether a doctor can
 * treat it, and how likely it is to kill. Severity runs from 1 to 100; a
 * condition whose severity falls to 0 is gone.
 */
export const conditionDefSchema = baseDefSchema
  .extend({
    /** As shown on the Health screen ("Type 2 diabetes"). */
    name: z.string().trim().min(1).max(40),
    /** As it reads inside a sentence ("type 2 diabetes"). */
    noun: z.string().trim().min(1).max(40),
    kind: conditionKindSchema,
    /** One line on the Health screen. */
    blurb: z.string().trim().min(1).max(200),
    /**
     * Rolled each year (without it, only events give the condition): a
     * chance by age, times each factor's curve, while `requires` holds.
     */
    onset: z
      .strictObject({
        chance: curveSchema,
        factors: z.array(z.strictObject({ key: z.enum(ONSET_FACTOR_KEYS), curve: curveSchema })).optional(),
        requires: conditionSchema.optional(),
        severity: severityRange,
      })
      .optional(),
    /** Severity change each year, untreated and treated (negative heals). */
    course: z.strictObject({
      untreated: z.number().min(-100).max(100),
      treated: z.number().min(-100).max(100),
    }),
    /** Yearly pulls on stats at full severity (scaled down with severity; treatment softens them, balance/health.yaml). */
    effects: statEffectsSchema,
    /** A doctor can treat it. */
    treatable: z.boolean(),
    /** Money (whole dollars): a doctor's treatment, each treated year (medication), each untreated year (an addiction's cost). */
    costs: z
      .strictObject({
        treatment: dollarsSchema.optional(),
        yearlyTreated: dollarsSchema.optional(),
        yearlyUntreated: dollarsSchema.optional(),
      })
      .optional(),
    /**
     * M1 (kinds mental and neuro): the youngest age a doctor, therapist or
     * school can name it, and which cares apply to it. `strengths` are yearly
     * pulls the condition gives (neurodivergence's gifts: scaled with
     * severity, never softened by care); `strengthNotes` and `challengeNotes`
     * are the words shown once it is diagnosed. Born-with conditions (kind
     * neuro) have no onset, no course and no recovery.
     */
    diagnosableFrom: z.int().min(0).max(30).optional(),
    care: z.array(mentalCareSchema).min(1).optional(),
    strengths: statEffectsSchema.optional(),
    strengthNotes: z.array(z.string().trim().min(1).max(120)).max(5).optional(),
    challengeNotes: z.array(z.string().trim().min(1).max(120)).max(5).optional(),
    /** Extra yearly chance of death at full severity, untreated (treatment lowers it, balance/health.yaml). */
    mortality: z.number().min(0).max(1).default(0),
    /** The cause of death recorded when it kills (src/content/causes); needed when mortality is above 0. */
    cause: idSchema.optional(),
  })
  .refine((c) => c.mortality === 0 || c.cause !== undefined, 'a condition that can kill needs a cause')
  .refine((c) => (c.kind !== 'mental' && c.kind !== 'neuro') || (c.diagnosableFrom !== undefined && c.care !== undefined), 'a mental or neuro condition needs diagnosableFrom and care')
  .refine((c) => c.kind !== 'neuro' || c.onset === undefined, 'a neuro condition is born with you: no onset');
export type ConditionDef = z.infer<typeof conditionDefSchema>;

const share = z.number().min(0).max(1);

/** Health numbers (src/content/balance/health.yaml). */
export const healthBalanceSchema = z.strictObject({
  /** Most conditions you can have at once; no new ones start past it. */
  maxConditions: z.int().min(0).max(20),
  /** Treatment softens a condition: its stat pulls and its chance of killing are multiplied by these. */
  treated: z.strictObject({ effects: share, mortality: share }),
  doctor: z.strictObject({
    /** A visit, times the city's cost of living. */
    visitCost: dollarsSchema,
    /** Chance a treatable condition is treated, by its severity. */
    treatChance: curveSchema,
    /** A checkup with nothing to treat: Health points gained (never past checkupLimit). */
    checkupHealth: z.int().min(0).max(20),
    checkupLimit: z.int().min(0).max(100),
    /** An untreatable condition: severity eased by a visit. */
    manageSeverity: z.int().min(0).max(100),
  }),
  /** Vice escalation: how an addiction feeds the habit, and how treatment starves it. */
  vice: z.strictObject({
    /** Vice gained each year with an untreated addiction. */
    untreatedPerYear: z.int().min(0).max(20),
    /** Vice lost each year with only treated addictions. */
    treatedPerYear: z.int().min(0).max(20),
  }),
});
export type HealthBalance = z.infer<typeof healthBalanceSchema>;

/** Results of seeing a doctor (registries/health.yaml). */
export const DOCTOR_RESULTS = ['clean', 'treated', 'managed', 'diagnosed'] as const;
export type DoctorResult = (typeof DOCTOR_RESULTS)[number];

/**
 * The events that answer a doctor's visit: `clean` (nothing to treat, a
 * checkup), `treated` (at least one condition treated), `managed` (only
 * conditions a doctor can ease, not treat, or treatment didn't take) or
 * (M1) `diagnosed` (a mental health condition or neurodivergence was named).
 */
export const healthRegistrySchema = z.strictObject({
  doctor: z.strictObject(
    Object.fromEntries(DOCTOR_RESULTS.map((id) => [id, z.strictObject({ events: z.array(idSchema).min(1) })])) as Record<
      DoctorResult,
      z.ZodObject<{ events: z.ZodArray<typeof idSchema> }>
    >,
  ),
});
export type HealthRegistry = z.infer<typeof healthRegistrySchema>;
