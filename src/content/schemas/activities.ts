/**
 * Activities tab (A1, docs/portraits-and-ui.md). The tab lists activities in groups (Mind & body, Social, Money & luck,
 * Leisure). An activity opens a sheet of options. Most options are the leisure definitions of src/content/pastimes
 * (each names the activity it belongs to with `hub`), worked out by the same engine path; the doctor, a vacation, hobbies
 * and "do your own thing" have a sheet of their own. The numbers (repeats, hobby skill, talent discovery) are in
 * src/content/balance/activities.yaml.
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { idSchema } from './common';

/** How an activity's sheet is built. */
export const ACTIVITY_KINDS = ['options', 'doctor', 'vacation', 'hobbies', 'own_thing'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

const activityGroupSchema = z.strictObject({ id: idSchema, label: z.string().trim().min(1).max(30) });

export const activityHubSchema = z.strictObject({
  id: idSchema,
  group: idSchema,
  label: z.string().trim().min(1).max(30),
  /** The line under the title on the tab. */
  subtitle: z.string().trim().min(1).max(80),
  /** An id of registries/icons.yaml. */
  icon: idSchema,
  kind: z.enum(ACTIVITY_KINDS),
  /** The youngest age that sees it at all (each option has its own age and legal limits too). */
  minAge: z.int().min(0).max(100),
  /** The most times a year across all its options (each option has its own limit as well). */
  limit: z.int().min(1).max(40),
  /** Adults only: the engine and the content build both hold every option to the adult age. */
  adultsOnly: z.boolean().default(false),
});
export type ActivityHub = z.infer<typeof activityHubSchema>;

export const activitiesRegistrySchema = z
  .strictObject({
    groups: z.array(activityGroupSchema).min(1),
    activities: z.array(activityHubSchema).min(1),
  })
  .superRefine((r, ctx) => {
    const groups = new Set(r.groups.map((g) => g.id));
    const seen = new Set<string>();
    for (const a of r.activities) {
      if (!groups.has(a.group)) ctx.addIssue({ code: 'custom', message: `${a.id}: unknown group "${a.group}"` });
      if (seen.has(a.id)) ctx.addIssue({ code: 'custom', message: `${a.id}: listed twice` });
      seen.add(a.id);
    }
  });
export type ActivitiesRegistry = z.infer<typeof activitiesRegistrySchema>;

const share = z.number().min(0).max(1);

/** The numbers of the Activities tab (src/content/balance/activities.yaml). */
export const activitiesBalanceSchema = z.strictObject({
  returns: z.strictObject({
    /** Each earlier time you did any option of the same activity this year, gains (a stat that rises, stress that falls, a companion's affection) are multiplied by this ... */
    repeat: share,
    /** ... the great and good outcomes' odds by this ... */
    tierShift: share,
    /** ... and the bad and backfire outcomes' odds by 1 plus this ... */
    badRise: z.number().min(0).max(2),
    /** ... down to this least multiplier on a gain. */
    floor: share,
  }),
  hobbies: z.strictObject({
    /** The skill at which each level begins (the words are interface words, src/ui/labels.ts). Skill is 0 to 100. */
    levels: z.array(z.int().min(1).max(100)).min(2).max(8),
    /** At this skill you are skilled: the flag `skilled_<hobby>` is set, which follow-up events about your craft can require. */
    skilledAt: z.int().min(1).max(100),
    /** The chance a practice brings a hidden talent of the hobby's kind to light: a base, times a curve over the hobby's skill. */
    talent: z.strictObject({ base: share, curve: curveSchema }),
    /** Skill lost each year you don't practice. */
    decay: z.int().min(0).max(20),
  }),
});
export type ActivitiesBalance = z.infer<typeof activitiesBalanceSchema>;
