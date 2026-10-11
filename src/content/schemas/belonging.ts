/**
 * Belonging (W2, docs/expansion.md): the groups a character can belong to
 * (src/content/groups: clubs and hobbies, faith communities, volunteering and
 * causes, neighborhood and civic groups), the faiths (registries/belonging.yaml),
 * the numbers (balance/belonging.yaml) and the words the step and the funeral use
 * (text/belonging.yaml). The engine decides what is true; the content says it.
 *
 * Real religions are real; the congregations, clubs and causes are fictional.
 */
import { z } from 'zod';
import { distributionSchema } from './balance';
import { baseDefSchema, idSchema } from './common';
import { BELONGING_TRIGGERS, GROUP_TYPES, VALUE_IDS } from './belongingIds';

export * from './belongingIds';

const probability = z.number().min(0).max(1);
const score = z.number().min(0).max(100);
const valueMap = z.partialRecord(z.enum(VALUE_IDS), z.number().min(-5).max(5));
const phrase = z.string().trim().min(1).max(120);

const costSchema = z.strictObject({
  /** Dollars a year before the city's cost of living (dues, supplies, collections). */
  flat: z.int().min(0).max(5000),
  /** Share of a year's earned income given (a tithe, a donation); 0 for none. */
  share: z.number().min(0).max(0.15),
});

const commitmentSchema = z.strictObject({
  /** Hours a week this takes (before the group's intensity). */
  hours: z.number().min(0).max(40),
  cost: costSchema,
});

const rungSchema = z.strictObject({
  id: idSchema,
  name: z.string().trim().min(1).max(40),
  /** Years in the group (and at the rung before) before you can rise to it. */
  minYears: z.int().min(0).max(40),
  /** Standing needed (0–100). */
  minStanding: z.int().min(0).max(100),
  /** Only a committed member is asked. */
  committed: z.boolean(),
});

/**
 * A kind of group (one file in src/content/groups). Each city gets its own congregations,
 * clubs and causes of the kinds that exist there, with names and traits of their own.
 */
export const groupSchema = baseDefSchema
  .extend({
    /** What it is called in general ("Book club", "Parish"); each one in a city has its own fictional name. */
    name: z.string().trim().min(1).max(40),
    type: z.enum(GROUP_TYPES),
    /** A faith community's religion (a faith in registries/belonging.yaml); only faith groups have one. */
    religion: idSchema.optional(),
    /** The tradition within the religion, in words ("Sunni", "Reform"), for faith groups. */
    tradition: z.string().trim().min(1).max(40).optional(),
    blurb: phrase,
    minAge: z.int().min(0).max(30),
    /** Youth groups stop at this age (a club for teens). */
    maxAge: z.int().min(10).max(120).optional(),
    /** How likely this kind is to exist in a city, before the city's own multiplier. */
    weight: z.number().min(0).max(10),
    /** City multipliers on `weight` (0 means it doesn't exist there); cities not listed use 1. */
    cities: z.record(idSchema, z.number().min(0).max(5)).default({}),
    /** How many of these a city has when it has any. */
    count: z.strictObject({ min: z.int().min(1).max(5), max: z.int().min(1).max(5) }),
    /** The ranges a group's traits are drawn from: welcoming (0–100), strict, intense. */
    traits: z.strictObject({ welcome: distributionSchema, strict: distributionSchema, intense: distributionSchema }),
    /** What members do together, in words (shown on the groups screen). */
    activities: z.array(z.string().trim().min(1).max(60)).min(1).max(6),
    /** Roles, from the first (a plain member) up; the last is the top. */
    ladder: z.array(rungSchema).min(2).max(5),
    commitment: z.strictObject({ casual: commitmentSchema, committed: commitmentSchema }),
    /** Yearly nudge to each value for a committed member (a casual one gets a share). */
    values: valueMap,
    /** Fictional names for the ones in a city, picked without repeats. */
    names: z.array(z.string().trim().min(3).max(50)).min(2).max(24),
  })
  .refine((g) => (g.type === 'faith') === (g.religion !== undefined), 'a faith group names its religion (and only a faith group does)')
  .refine((g) => g.count.min <= g.count.max, 'count.min must not be greater than count.max')
  .refine((g) => g.ladder[0]!.minYears === 0 && g.ladder[0]!.minStanding === 0, 'the first rung is open to everyone (minYears 0, minStanding 0)')
  .refine((g) => g.ladder.every((r, i) => i === 0 || r.minYears >= g.ladder[i - 1]!.minYears), 'rungs must not ask for fewer years than the rung below')
  .refine((g) => g.commitment.casual.hours <= g.commitment.committed.hours, 'a casual member gives no more time than a committed one');
export type GroupDef = z.infer<typeof groupSchema>;

export const faithSchema = z.strictObject({
  name: z.string().trim().min(1).max(40),
  /** What a person of this faith is called ("Catholic", "Muslim"): after "a" or "an" or "your". */
  adherent: z.string().trim().min(1).max(40),
  /** The tradition it belongs to in the broad (Christian, ...); for grouping in lists. */
  family: z.string().trim().min(1).max(30),
  /** How often a family has it (relative weights). */
  birthWeight: z.number().min(0).max(100),
});
export type FaithDef = z.infer<typeof faithSchema>;

/** Registry: the faiths and the events the belonging step queues. Every event listed is followUpOnly. */
export const belongingRegistrySchema = z.strictObject({
  /** Real religions, with the broad share of families that follow each. */
  faiths: z.record(idSchema, faithSchema),
  /** Families with no faith, as a weight beside the faiths' `birthWeight`. */
  noneWeight: z.number().min(0).max(100),
  /** Words for no faith in the sentence "{they} are ..." / lists. */
  noneName: z.string().trim().min(1).max(40),
  triggers: z.strictObject(Object.fromEntries(BELONGING_TRIGGERS.map((t) => [t, z.strictObject({ events: z.array(idSchema).min(1) })])) as Record<(typeof BELONGING_TRIGGERS)[number], z.ZodObject<{ events: z.ZodArray<z.ZodString> }>>),
});
export type BelongingRegistry = z.infer<typeof belongingRegistrySchema>;

/** Every number belonging uses (src/content/balance/belonging.yaml). */
export const belongingBalanceSchema = z.strictObject({
  faith: z.strictObject({
    /** The chance a child takes the faith their household has. */
    inherit: probability,
    /** How devout a household is (0–100); a child's belief starts near it. */
    household: distributionSchema,
    childShare: z.number().min(0).max(1.2),
    childNoise: z.number().min(0).max(40),
    /** The strength of belief someone gets who chooses a faith in custom creation. */
    chosen: distributionSchema,
    /** Yearly change in strength by age, before membership (growing up questions things; later life often returns to them). */
    drift: z.strictObject({ byAge: z.array(z.strictObject({ at: z.number(), x: z.number().min(-5).max(5) })).min(1), noise: z.number().min(0).max(5) }),
    /** Yearly change from belonging to a congregation of your religion, by commitment, and the loss without one. */
    community: z.strictObject({ casual: z.number().min(0).max(5), committed: z.number().min(0).max(8), without: z.number().min(-5).max(0), fromAge: z.int().min(10).max(40) }),
    /** Strength a faith starts at when you convert, find it, or return to it. */
    start: z.strictObject({ convert: score, find: score, return: score }),
    /** Below this, belief is wavering (questioning, doubts); at or above `devout`, it is strong. */
    wavering: score,
    devout: score,
    /** A child in a household at least this devout is taken along to its congregation. */
    takenAlong: score,
    takenAlongAge: z.int().min(0).max(14),
    /** A hidden pull toward another faith or none, to be found or lost later. */
    latent: z.strictObject({ chance: probability, noneWeight: z.number().min(0).max(100) }),
    /** The chance an adult's faith differs from a family member's when we derive theirs (not given by birth). */
    strangerNoneShare: probability,
    /** How much of a person's strength is drawn from the household's when we derive theirs. */
    strengthNoise: z.number().min(0).max(40),
  }),
  values: z.strictObject({
    /** A starting value is `base` plus the weights times how far each trait is from 50. */
    base: z.record(z.enum(VALUE_IDS), score),
    weights: z.record(z.enum(VALUE_IDS), z.record(z.string(), z.number().min(-1).max(1))),
    /** Belief adds to tradition and community by its strength. */
    faithPull: z.record(z.enum(VALUE_IDS), z.number().min(-0.5).max(0.5)),
    /** The share of the gap to your own temperament closed each year. */
    regress: z.number().min(0).max(1),
    /** A committed member's yearly nudge is multiplied by this for a casual one. */
    casualShare: z.number().min(0).max(1),
    /** Choices made in events move a value, and this share of it sticks to your temperament. */
    sticks: z.number().min(0).max(1),
  }),
  groups: z.strictObject({
    /** The most groups you can belong to at once. */
    max: z.int().min(1).max(10),
    /** Standing starts here, then moves each year toward a target (higher for a committed member, a little higher in a welcoming group). */
    standing: z.strictObject({
      start: score,
      target: z.strictObject({ committed: score, casual: score }),
      welcome: z.number().min(0).max(0.5),
      pull: z.number().min(0).max(1),
      noise: z.number().min(0).max(10),
      floor: score,
      ceiling: score,
      firstYear: z.number().min(0).max(1),
    }),
    /** Members who come with a group: how many, how old, how they feel about you and each other. */
    members: z.strictObject({
      count: z.strictObject({ min: z.int().min(1).max(8), max: z.int().min(1).max(8) }),
      max: z.int().min(2).max(20),
      adultAges: z.strictObject({ below: z.int().min(0).max(40), above: z.int().min(0).max(40) }),
      youthAge: z.int().min(0).max(5),
      affection: distributionSchema,
      tieAffection: distributionSchema,
      /** How many of the people already in a group a new member is tied to (the rest they only know of). */
      tiesPerMember: z.number().int().min(1).max(8),
      growChance: probability,
      affectionGain: z.number().min(0).max(5),
      /** When you leave a group, the friends you made there who you are not close to (affection below this) and share no memory with fade from your life. */
      keepAffection: score,
    }),
    /** Offers: a yearly chance to be invited, more for someone with a faith and no congregation of it. */
    invite: z.strictObject({ base: probability, sociability: z.number().min(0).max(0.5), faith: probability, coolOff: z.int().min(1).max(20), minAge: z.int().min(5).max(30), perYearMax: z.int().min(1).max(3) }),
    /** Rising: the yearly chance a committed member who qualifies is asked, and the standing and value a new role brings. */
    rise: z.strictObject({ chance: probability, standing: z.int().min(0).max(30), coolOff: z.int().min(1).max(20), community: z.number().min(0).max(10) }),
    /** Drifting away: the yearly chance a member who gives a lot, or little, comes to a decision (a casual one at a share of it). */
    drift: z.strictObject({ chance: probability, stress: z.number().min(0).max(1), standing: score, coolOff: z.int().min(1).max(20), casualShare: probability }),
    /** Life gets in the way: the yearly chance a member simply stops going, by commitment, and how much more when stressed. */
    attrition: z.strictObject({ casual: probability, committed: probability, stressed: z.number().min(1).max(5), stressLine: score }),
    /** Cost of living and wealth scale what a group costs; a group never takes more than this share of a year's income. */
    cost: z.strictObject({ incomeCap: z.number().min(0).max(1), wealth: z.record(z.enum(['poor', 'working', 'middle', 'affluent', 'rich']), z.number().min(0).max(5)) }),
    /** Gossip: a role's rise is sometimes news. */
    news: z.strictObject({ honorChance: probability }),
    /** The time a group takes lightly changes the rest of your life. */
    load: z.strictObject({
      free: z.number().min(0).max(40),
      stress: z.number().min(0).max(2),
      stressLimit: score,
      belonging: z.number().min(0).max(5),
      belongingLimit: score,
      school: z.strictObject({ over: z.number().min(0).max(40), gpa: z.number().min(0).max(1) }),
      work: z.strictObject({ over: z.number().min(0).max(40), performance: z.number().min(0).max(20) }),
      home: z.strictObject({ over: z.number().min(0).max(40), affection: z.number().min(0).max(10) }),
    }),
  }),
  reputation: z.strictObject({
    /** Points of reputation a year at full standing (above 50) in a committed membership; the same, negative, for low standing. */
    standing: z.number().min(0).max(5),
    community: z.number().min(0).max(5),
    maxPerYear: z.number().min(0).max(5),
  }),
  community: z.strictObject({
    start: score,
    /** A committed member's yearly gain by group type; the loss when you belong to nothing. */
    gain: z.record(z.enum(GROUP_TYPES), z.number().min(0).max(5)),
    /** The share of the gap to the starting level closed each year. */
    pull: z.number().min(0).max(1),
  }),
});
export type BelongingBalance = z.infer<typeof belongingBalanceSchema>;

/** Lines of text: history entries the step writes (roles: {group}, {role}, {religion}). */
export const belongingTextSchema = z.strictObject({
  history: z.record(
    z.enum(['joined', 'left', 'moved', 'rose', 'stepped_down', 'converted', 'lostFaith', 'foundFaith', 'returnedFaith', 'family_took_along']),
    z.strictObject({ importance: z.union([z.literal(1), z.literal(2), z.literal(3)]), variants: z.array(z.string().trim().min(1).max(300)).min(1) }),
  ),
  /** The words for a group's traits on the groups screen. */
  traits: z.strictObject({
    welcome: z.strictObject({ high: phrase, low: phrase }),
    strict: z.strictObject({ high: phrase, low: phrase }),
    intense: z.strictObject({ high: phrase, low: phrase }),
  }),
});
export type BelongingText = z.infer<typeof belongingTextSchema>;
