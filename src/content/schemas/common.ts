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
