/**
 * God mode (G1, docs/expansion.md): the limits an edit stays within (src/content/balance/godmode.yaml). Everything an edit
 * can choose from (cities, jobs, conditions, talents, languages, faiths, countries, appearance words) is read from the
 * rest of the content; only these numbers are new.
 */
import { z } from 'zod';
import { debtKindSchema } from './economy';

export const godmodeBalanceSchema = z.strictObject({
  money: z.strictObject({
    /** The most savings an edit can set (whole dollars). */
    savingsMax: z.int().positive(),
    /** The largest balance one edited debt can have. */
    debtMax: z.int().positive(),
    /** The kinds of debt an edit can add, change or forgive; a mortgage, an auto loan or a business loan belongs to the thing it paid for. */
    debtKinds: z.array(debtKindSchema).min(1),
  }),
  edit: z.strictObject({
    /** The most fields one edit can change. */
    maxFields: z.int().min(1).max(200),
    /** The largest edit payload (bytes of JSON). */
    maxPayloadBytes: z.int().min(256),
  }),
  mood: z.strictObject({
    /** How far one tap of a mood slider's − or + moves it. */
    step: z.int().min(1).max(25),
  }),
});
export type GodmodeBalance = z.infer<typeof godmodeBalanceSchema>;
