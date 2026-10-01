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
