/**
 * Later life (L1, docs/expansion.md): the balance numbers
 * (src/content/balance/later.yaml) for grandchildren, late-life care, a
 * foreseen death and amends; the events and sources the later-life step
 * queues (registries/later.yaml); the words the funeral and your history use
 * (text/later.yaml); and the templates the life review of regrets and proud
 * moments is built from (text/review.yaml). The engine decides what is true;
 * the content only says it.
 */
import { z } from 'zod';
import { curveSchema, distributionSchema } from './balance';
import { idSchema, STAT_KEYS } from './common';
import { compareSchema, conditionSchema } from './events';
import { CARE_OPTIONS, HOSPICE_CHOICES, SERVICE_STYLES } from './laterIds';
import { relationshipKindSchema, relationshipStatusSchema } from './relationships';
import { templateSchema } from './text';

export { AMENDS_RESULTS, CARE_OPTIONS, HOSPICE_CHOICES, LATER_ACTIONS, SERVICE_STYLES, TEACH_KEYS } from './laterIds';
export type { AmendsResult, CareOptionId, HospiceChoiceId, LaterAction, ServiceStyleId, TeachKey } from './laterIds';

const probability = z.number().min(0).max(1);
const eventList = z.array(idSchema).min(1);
/** Yearly stat changes, in whole points. */
const statDeltas = z.partialRecord(z.enum(STAT_KEYS), z.int().min(-10).max(10));

export const laterBalanceSchema = z.strictObject({
  grandchildren: z.strictObject({
    /** How a new grandchild feels about you to start with. */
    bond: z.strictObject({ affection: distributionSchema, trust: distributionSchema }),
    /** How much of a grandchild's traits, looks and smarts come from their parent (the rest from the population). */
    parentShare: probability,
    noiseSd: z.number().min(0).max(40),
    /** Playing favorites: how long a favorite is remembered, what each year costs with the others, and with the parents. */
    favorite: z.strictObject({
      years: z.int().min(1).max(10),
      others: z.int().min(-20).max(0),
      parentTrust: z.int().min(-20).max(0),
    }),
    /** What helping out, or spoiling, does with a grandchild's parent. */
    help: z.strictObject({
      babysitParentAffection: z.int().min(0).max(20),
      babysitParentTrust: z.int().min(0).max(20),
      spoilParentTrust: z.int().min(-20).max(0),
    }),
    /** A parent who asks for a grandchild back has to be doing better than this (trouble severity). */
    parentRecovered: z.int().min(0).max(100),
  }),
  care: z.strictObject({
    minAge: z.int().min(50).max(100),
    /** The chance of needing care in a year, by age, times the health factor and the conditions you have. */
    chance: curveSchema,
    healthFactor: curveSchema,
    conditions: z.record(idSchema, z.number().min(0).max(10)),
    /** Years care can wait for you to arrange it before the family (or paid care) steps in. */
    defaultAfterYears: z.int().min(1).max(10),
    /** Years between reminders while nothing is arranged. */
    reminderYears: z.int().min(1).max(10),
    /** A year of paid care and a year in assisted living, at the national average (scaled by your city). */
    cost: z.strictObject({ paid: z.int().min(0), assisted: z.int().min(0) }),
    assisted: z.strictObject({ livingShare: probability }),
    family: z.strictObject({
      /** Who can step up, in the order they are asked; ties go to whoever feels closest. */
      kinds: z.array(relationshipKindSchema).min(1),
      /** Affection plus trust someone needs to offer. */
      minCombined: z.int().min(0).max(200),
      minAge: z.int().min(16).max(40),
      maxAge: z.int().min(50).max(100),
      /** An estranged relative comes back with this chance if they still feel at least this much. */
      estranged: z.strictObject({ minAffection: z.int().min(0).max(100), chance: probability }),
      /** The chance a relative who looks after you gives out in a year. */
      givesOut: probability,
      /** What a year of looking after you does for how they feel about you. */
      provider: z.strictObject({ affection: z.int().min(0).max(10), trust: z.int().min(0).max(10) }),
    }),
    /** What a year under each kind of care does for you. */
    effects: z.strictObject(Object.fromEntries(CARE_OPTIONS.map((o) => [o, statDeltas])) as Record<(typeof CARE_OPTIONS)[number], typeof statDeltas>),
  }),
  terminal: z.strictObject({
    minAge: z.int().min(30).max(100),
    /** A condition with at least this mortality can be the one that takes you. */
    conditionMortality: probability,
    condition: z.strictObject({ minSeverity: z.int().min(1).max(100), chance: curveSchema }),
    decline: z.strictObject({ minAge: z.int().min(60).max(110), healthBelow: z.int().min(1).max(100), chance: curveSchema }),
    /** The chance of dying in the year it begins, and in each year after. The last entry is the longest anyone lasts. */
    deathChance: z.array(probability).min(2).max(8),
    hospice: z.strictObject(
      Object.fromEntries(HOSPICE_CHOICES.map((h) => [h, z.strictObject({ cost: z.int().min(0), deltas: statDeltas })])) as Record<(typeof HOSPICE_CHOICES)[number], z.ZodObject<{ cost: z.ZodInt; deltas: typeof statDeltas }, z.core.$strict>>,
    ),
    /** The service: what it costs next to a traditional funeral, and how likely guests are to stay away (a multiple of their usual chance). */
    service: z.strictObject(
      Object.fromEntries(SERVICE_STYLES.map((s) => [s, z.strictObject({ cost: z.number().min(0).max(3), stayAway: z.number().min(0).max(3) })])) as Record<(typeof SERVICE_STYLES)[number], z.ZodObject<{ cost: z.ZodNumber; stayAway: z.ZodNumber }, z.core.$strict>>,
    ),
    maxVisitors: z.int().min(1).max(8),
    maxLetters: z.int().min(0).max(8),
    visit: z.strictObject({
      /** The chance someone invited comes: affection plus trust over 200, scaled by this. */
      scale: z.number().min(0).max(2),
      /** An estranged person comes with this multiple of that chance. */
      estranged: probability,
      /** Someone in another city comes with this multiple of it. */
      far: probability,
      /** Each year a visitor who came is with you: what it does for how they feel. */
      affection: z.int().min(0).max(10),
      trust: z.int().min(0).max(10),
    }),
    letter: z.strictObject({
      affection: z.int().min(0).max(20),
      trust: z.int().min(0).max(20),
      /** An estranged person who gets a letter makes peace with this chance. */
      reconcile: probability,
    }),
    /** At the funeral: a visitor who came stays away with this multiple of their usual chance; someone who got your letter, this one. */
    attend: z.strictObject({ visited: z.number().min(0).max(1), letter: z.number().min(0).max(1) }),
    /** Years between the diagnosis and the death after which a will prompt is no longer shown. */
    willPromptYears: z.int().min(0).max(5),
  }),
  amends: z.strictObject({
    minAge: z.int().min(18).max(90),
    /** The chance in a year that a chance to make amends comes, if any history calls for one. */
    yearlyChance: probability,
    /** Years before the same source and person can come up again. */
    cooldownYears: z.int().min(1).max(30),
    /** Years between any two chances, and the most chances one life is offered. */
    gapYears: z.int().min(0).max(30),
    maxPerLife: z.int().min(1).max(30),
  }),
  review: z.strictObject({
    maxRegrets: z.int().min(0).max(8),
    maxProud: z.int().min(0).max(8),
  }),
});
export type LaterBalance = z.infer<typeof laterBalanceSchema>;

/** Where an amends chance comes from: a tie (strained, or marked by a memory you regret) or a goal you gave up. */
export const AMENDS_KINDS = ['tie', 'goal'] as const;

const amendsSourceSchema = z
  .strictObject({
    label: z.string().trim().min(1).max(80),
    kind: z.enum(AMENDS_KINDS),
    /** How likely this source is picked next to the others that apply. */
    weight: z.number().min(0.1).max(10),
    /** tie: who (their relationship to you). */
    kinds: z.array(relationshipKindSchema).min(1).optional(),
    /** tie: their status (default: any that is still in your life). */
    status: z.array(relationshipStatusSchema).min(1).optional(),
    /** tie: strained when affection or trust is below these. */
    below: z.strictObject({ affection: z.int().min(0).max(100).optional(), trust: z.int().min(0).max(100).optional() }).optional(),
    /** tie: they hold any of these memories of you. */
    memories: z.array(idSchema).min(1).optional(),
    /** tie: they were your spouse. */
    wasSpouse: z.boolean().optional(),
    /** goal: the part of your history that is unfinished. */
    when: conditionSchema.optional(),
    /** The events that can answer it (each requires what it is about; a tie casts the person as `npc`). */
    events: eventList,
  })
  .refine((s) => s.kind !== 'tie' || s.kinds !== undefined, 'a tie source names the kinds of relationship')
  .refine((s) => s.kind !== 'tie' || s.status !== undefined || s.below !== undefined || s.memories !== undefined, 'a tie source needs a status, a strain or a memory (something unresolved)')
  .refine((s) => s.kind !== 'goal' || s.when !== undefined, 'a goal source needs `when`');

export const laterRegistrySchema = z.strictObject({
  grandchildren: z.strictObject({
    /** Your first grandchild (cast: `kid`, and their parent as `parent`). */
    first: eventList,
    /** A grandchild whose parent can't raise them (cast `kid` and `parent`), whose parent has died (cast `kid`), and a parent asking for them back (cast `kid` and `parent`). */
    parentCannot: eventList,
    parentGone: eventList,
    parentBack: eventList,
    /** Playing favorites comes to light (cast `kid`, a grandchild who isn't the favorite, and their parent as `parent`). */
    favorite: eventList,
  }),
  care: z.strictObject({
    /** Care is needed and a relative steps up (cast `carer`); nobody can; an estranged relative comes back (cast `carer`). */
    offer: eventList,
    alone: eventList,
    returns: eventList,
    /** Whoever looked after you can't any more; a reminder while nothing is arranged; a year of family care (cast `carer`); the first weeks in assisted living. */
    providerGone: eventList,
    reminder: eventList,
    year: eventList,
    assisted: eventList,
  }),
  terminal: z.strictObject({
    /** The diagnosis, by the condition behind it; `decline` is a long decline, `other` anything else. */
    diagnosis: z.record(idSchema, eventList),
    /** The will prompt, for someone with no will or one that is out of date. */
    will: eventList,
    /** The chosen visitors come (cast `visitor`), once a year. */
    visit: eventList,
  }),
  amends: z.strictObject({
    sources: z.record(idSchema, amendsSourceSchema),
  }),
});
export type LaterRegistry = z.infer<typeof laterRegistrySchema>;
export type AmendsSource = z.infer<typeof amendsSourceSchema>;

const group = z.strictObject({ importance: z.union([z.literal(1), z.literal(2), z.literal(3)]), variants: z.array(templateSchema).min(1) });
const lines = z.array(templateSchema).min(1);

/**
 * The words of later life. History lines are written to your history when
 * something happens; the last-days lines make up the funeral's account of how
 * it ended (roles: {self} is you, {npc} a person; values {years}, {names}).
 */
export const laterTextSchema = z.strictObject({
  history: z.strictObject({
    /** {kid.name} was born to {parent.name}. */
    grandchild: group,
    /** You took {kid.name} in. */
    raised: group,
    returned: group,
    careNeeded: group,
    careFamily: group,
    carePaid: group,
    careAssisted: group,
    /** A diagnosis or a decline that gave you warning. */
    terminal: group,
    amends: group,
  }),
  lastDays: z.strictObject({
    /** How long you knew, as {years}. */
    foreseen: z.strictObject({ short: lines, long: lines }),
    hospice: z.strictObject(Object.fromEntries(HOSPICE_CHOICES.map((h) => [h, lines])) as Record<(typeof HOSPICE_CHOICES)[number], typeof lines>),
    service: z.strictObject(Object.fromEntries(SERVICE_STYLES.map((s) => [s, lines])) as Record<(typeof SERVICE_STYLES)[number], typeof lines>),
    /** {names} is the people who came to your bedside. */
    bedside: z.strictObject({ some: lines, none: lines }),
    /** {names} is the people you wrote to. */
    letters: lines,
    /** The speaker you asked for ({npc}) spoke / could not be there. */
    speaker: z.strictObject({ spoke: lines, absent: lines }),
    /** The fee note when you asked for a service ({cost} is the whole funeral). */
    paid: lines,
    /** What a chosen visitor who came is listed as having done ({npc} is them). */
    bedsideReason: lines,
    /** Why someone you invited, who didn't come, is listed as staying away ({npc} is them). */
    declinedReason: lines,
  }),
  /**
   * What a speaker can say about your last days (roles {self}, {npc}; value {known}):
   * you asked them to speak, they were at your bedside, they got your letter, or you had
   * time before the end ({years}).
   */
  eulogy: z.strictObject({ asked: lines, bedside: lines, letter: lines, time: lines }),
});
export type LaterText = z.infer<typeof laterTextSchema>;

/** Who a review line is about, among the people in your life. */
const reviewWhoSchema = z
  .strictObject({
    kinds: z.array(relationshipKindSchema).min(1).optional(),
    status: z.array(relationshipStatusSchema).min(1).optional(),
    memory: idSchema.optional(),
    alive: z.boolean().optional(),
    affection: compareSchema.optional(),
    trust: compareSchema.optional(),
  })
  .refine((w) => Object.values(w).some((v) => v !== undefined), 'needs at least one field');

const reviewTemplateSchema = z
  .strictObject({
    id: idSchema,
    /** How likely this line is picked next to the others that apply. */
    weight: z.number().min(0.1).max(10).default(1),
    /** A person in your life it is about, cast as {npc}. */
    who: reviewWhoSchema.optional(),
    /** What must be true of your life (evaluated at the end, with the person cast as `npc`). */
    when: conditionSchema.optional(),
    text: templateSchema,
  })
  .refine((t) => t.who !== undefined || t.when !== undefined, 'a line about your life has to say what proves it (who or when)');

export const reviewTextSchema = z.strictObject({
  regrets: z.array(reviewTemplateSchema).min(1),
  proud: z.array(reviewTemplateSchema).min(1),
});
export type ReviewText = z.infer<typeof reviewTextSchema>;
export type ReviewTemplate = z.infer<typeof reviewTemplateSchema>;

/** Every list of events the later-life registry names, with where it is in the registry (for the content build and coverage). */
export function laterResults(r: LaterRegistry): { where: string; events: readonly string[] }[] {
  return [
    ...Object.entries(r.grandchildren).map(([k, events]) => ({ where: `grandchildren.${k}`, events })),
    ...Object.entries(r.care).map(([k, events]) => ({ where: `care.${k}`, events })),
    ...Object.entries(r.terminal.diagnosis).map(([k, events]) => ({ where: `terminal.diagnosis.${k}`, events })),
    { where: 'terminal.will', events: r.terminal.will },
    { where: 'terminal.visit', events: r.terminal.visit },
    ...Object.entries(r.amends.sources).map(([k, s]) => ({ where: `amends.sources.${k}`, events: s.events })),
  ];
}
