/**
 * Activities tab (A1, docs/portraits-and-ui.md), rebuilt as a hub by U2 (docs/careers-crime-and-ui.md). The tab lists
 * categories (Health, Mind & body, Outdoors, ... Luxury); a category opens a submenu of activities, split into an
 * Activities and a Shopping section. An activity opens a sheet of options. Most options are the leisure definitions of src/content/pastimes
 * (each names the activity it belongs to with `hub`), worked out by the same engine path; the doctor, a vacation, hobbies
 * and "do your own thing" have a sheet of their own. The numbers (repeats, hobby skill, talent discovery) are in
 * src/content/balance/activities.yaml.
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { idSchema } from './common';

/** How an activity's sheet is built. */
export const ACTIVITY_KINDS = ['options', 'doctor', 'vacation', 'hobbies', 'own_thing', 'link'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** U2: where a `link` activity goes: a page that already does the job (the groups and faith of W2, therapy of M1, trips, ...). */
export const ACTIVITY_LINKS = ['club', 'service', 'civic', 'faith', 'faith_explore', 'therapy', 'migration', 'social', 'teen', 'pets', 'vehicles'] as const;
export type ActivityLink = (typeof ACTIVITY_LINKS)[number];

/** U2: the two sections of a category's submenu. */
export const ACTIVITY_SECTIONS = ['activities', 'shopping'] as const;
export type ActivitySection = (typeof ACTIVITY_SECTIONS)[number];

const activityCategorySchema = z.strictObject({
  id: idSchema,
  label: z.string().trim().min(1).max(30),
  /** An id of registries/icons.yaml. */
  icon: idSchema,
  /** The line under the title on the tab. */
  subtitle: z.string().trim().min(1).max(80),
  /** The youngest age that sees the category at all. */
  minAge: z.int().min(0).max(100).default(0),
  /** The category shows only at this net worth or more: a key of balance/activities.yaml `thresholds` (US prices, scaled to your country). */
  needs: idSchema.optional(),
  /** `gold` draws the category in the gold accent of the tokens (Luxury). */
  accent: z.enum(['gold']).optional(),
});

export const activityHubSchema = z.strictObject({
  id: idSchema,
  category: idSchema,
  /** Activities or Shopping, in the category's submenu. */
  section: z.enum(ACTIVITY_SECTIONS).default('activities'),
  label: z.string().trim().min(1).max(30),
  /** The line under the title on the tab. */
  subtitle: z.string().trim().min(1).max(80),
  /** An id of registries/icons.yaml. */
  icon: idSchema,
  kind: z.enum(ACTIVITY_KINDS),
  /** The youngest age that sees it at all (each option has its own age and legal limits too). */
  minAge: z.int().min(0).max(100),
  /** The most times a year across all its options (each option has its own limit as well). */
  limit: z.int().min(1).max(200),
  /** Adults only: the engine and the content build both hold every option to the adult age. */
  adultsOnly: z.boolean().default(false),
  /**
   * Whether the options share one count of repeats in a year, so each makes the others return less (the gym's light and hard
   * workouts do). An activity that gathers unrelated options (crime, loans) counts them apart.
   */
  sharedRepeats: z.boolean().default(true),
  /** Hidden, not greyed out, while none of its options is on offer to you (rehab when nothing is wrong). */
  hideWhenNothing: z.boolean().default(false),
  /** `link`: the page it opens. */
  opens: z.enum(ACTIVITY_LINKS).optional(),
});
export type ActivityHub = z.infer<typeof activityHubSchema>;

export const activitiesRegistrySchema = z
  .strictObject({
    categories: z.array(activityCategorySchema).min(1),
    activities: z.array(activityHubSchema).min(1),
  })
  .superRefine((r, ctx) => {
    const categories = new Set(r.categories.map((c) => c.id));
    const seen = new Set<string>();
    for (const a of r.activities) {
      if (!categories.has(a.category)) ctx.addIssue({ code: 'custom', message: `${a.id}: unknown category "${a.category}"` });
      if ((a.kind === 'link') !== (a.opens !== undefined)) ctx.addIssue({ code: 'custom', message: `${a.id}: opens goes with kind: link (and only with it)` });
      if (seen.has(a.id)) ctx.addIssue({ code: 'custom', message: `${a.id}: listed twice` });
      seen.add(a.id);
    }
  });
export type ActivityCategory = z.infer<typeof activityCategorySchema>;
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
  /** U2: net worths (US prices, scaled to the country's price level) at which a category appears. */
  thresholds: z.record(idSchema, z.number().min(0)),
  hobbies: z.strictObject({
    /** The skill at which each level begins (the words are interface words, src/ui/labels.ts). Skill is 0 to 100. */
    levels: z.array(z.int().min(1).max(100)).min(2).max(8),
    /** At this skill you are skilled: the flag `skilled_<hobby>` is set, which follow-up events about your craft can require. */
    skilledAt: z.int().min(1).max(100),
    /** The chance a practice brings a hidden talent of the hobby's kind to light: a base, times a curve over the hobby's skill. */
    talent: z.strictObject({ base: share, curve: curveSchema }),
  }),
});
export type ActivitiesBalance = z.infer<typeof activitiesBalanceSchema>;
