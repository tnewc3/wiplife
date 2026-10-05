import { z } from 'zod';

/** Content IDs are lowercase snake_case and match their file name. */
export const idSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/, 'IDs must be lowercase snake_case (for example "los_angeles")');

/** Fields every content definition shares (see "IDs, retiring and renaming"). */
export const baseDefSchema = z.strictObject({
  id: idSchema,
  /** Shipped content is never deleted; retired content stops appearing. */
  retired: z.boolean().optional(),
  /** Old IDs that should resolve to this definition after a rename. */
  aliases: z.array(idSchema).optional(),
});

/** Whole dollars. */
export const dollarsSchema = z.int().nonnegative();

/** A 0–100 score. */
export const scoreSchema = z.int().min(0).max(100);

export const STAT_KEYS = ['health', 'happiness', 'smarts', 'looks', 'fitness', 'stress'] as const;
export const TRAIT_KEYS = ['ambition', 'confidence', 'kindness', 'riskTaking', 'discipline', 'sociability'] as const;
/** Hidden values events may read or change (genetic risk and inner conflict belong to later systems). */
export const HIDDEN_KEYS = ['luck', 'reputation', 'vice'] as const;

/** A character stat, personality trait or readable hidden value. */
export const scoreKeySchema = z.enum([...STAT_KEYS, ...TRAIT_KEYS, ...HIDDEN_KEYS]);
export type EffectStatKey = z.infer<typeof scoreKeySchema>;

/** Kinds of health condition (Stage 9). */
/** M1: 'mental' conditions (depression, anxiety, PTSD) come and go; 'neuro' ones (ADHD, neurodivergence) are born with you. Both are named only after diagnosis. */
export const CONDITION_KINDS = ['illness', 'chronic', 'injury', 'mental', 'neuro', 'addiction'] as const;
export const conditionKindSchema = z.enum(CONDITION_KINDS);
export type ConditionKind = z.infer<typeof conditionKindSchema>;

/** M1: the ways of caring for a mental health condition. */
export const MENTAL_CARES = ['therapy', 'medication', 'support'] as const;
export type MentalCareId = (typeof MENTAL_CARES)[number];
export const mentalCareSchema = z.enum(MENTAL_CARES);

/**
 * What self-discovery can bring to the surface (Stage 9): who you're
 * attracted to, your gender, how you express it, a personality tendency, or
 * a hidden talent.
 */
export const DISCOVERY_KINDS = ['attraction', 'gender', 'expression', 'personality', 'talent'] as const;
export const discoveryKindSchema = z.enum(DISCOVERY_KINDS);
export type DiscoveryKind = z.infer<typeof discoveryKindSchema>;
/** The discovery kinds that are latent traits (everything but a talent). */
export const LATENT_KINDS = ['attraction', 'gender', 'expression', 'personality'] as const satisfies readonly DiscoveryKind[];
export type LatentKind = (typeof LATENT_KINDS)[number];
