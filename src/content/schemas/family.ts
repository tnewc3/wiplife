/**
 * Children and parenting (docs/expansion.md, E2a): the balance numbers
 * (src/content/balance/family.yaml) and the registry of events the family
 * system queues by itself (src/content/registries/family.yaml): births,
 * miscarriages, adoption, IVF, surrogacy, custody hearings and a child's
 * death. Tuning numbers live in YAML, never in code.
 */
import { z } from 'zod';
import { curveSchema, distributionSchema } from './balance';
import { idSchema, TRAIT_KEYS } from './common';

const probability = z.number().min(0).max(1);
const traitKey = z.enum(TRAIT_KEYS);

/** Chances named in interaction content (an extra's `chance`) that the family rules work out, not a number in interactions.yaml. */
export const FAMILY_CHANCE_KEYS = ['conceiveCareful', 'conceiveCarefree'] as const;
export type FamilyChanceKey = (typeof FAMILY_CHANCE_KEYS)[number];

/** The three lines of a parenting style (0–100, 50 is even). */
export const PARENTING_KEYS = ['warmth', 'strictness', 'involvement'] as const;
export type ParentingKey = (typeof PARENTING_KEYS)[number];
export const parentingKeySchema = z.enum(PARENTING_KEYS);

/** Ways a family grows through a process that takes time and money. */
export const FAMILY_PROCESSES = ['adoption', 'ivf', 'surrogacy'] as const;
export type FamilyProcessKind = (typeof FAMILY_PROCESSES)[number];
export const familyProcessSchema = z.enum(FAMILY_PROCESSES);

/** How a pregnancy began. */
export const PREGNANCY_HOWS = ['trying', 'unplanned', 'ivf', 'surrogacy'] as const;
export type PregnancyHow = (typeof PREGNANCY_HOWS)[number];

/** Per-trait or per-stat contributions of the three style lines (points a year at the extreme of the style, before age weighting). */
const styleEffect = z.partialRecord(parentingKeySchema, z.number().min(-60).max(60));

const range = z
  .strictObject({ min: z.int().min(0).max(120), max: z.int().min(0).max(120) })
  .refine((r) => r.min <= r.max, 'min must not be greater than max');

export const familyBalanceSchema = z.strictObject({
  /** Who can carry a pregnancy: women can, men can't; nonbinary random characters and relatives roll this chance (custom characters choose). */
  carrying: z.strictObject({ nonbinaryChance: probability }),

  /** A year of trying for a baby. Chance = tryChance × carrier's age factor × the other parent's age factor × health factor (+ planBonus when you plan around it). */
  fertility: z.strictObject({
    tryChance: probability,
    carrierAge: curveSchema,
    otherAge: curveSchema,
    /** By the carrier's Health (0–100): you, from your stat; other people count as npcHealth. */
    health: curveSchema,
    npcHealth: z.number().min(0).max(100),
    /** "Try for a baby" is offered only when a year of trying has at least this chance. */
    minTryChance: probability,
    /** Added to the chance when you plan around it (the stress of it lands in the event). */
    planBonus: probability,
  }),

  /** Unplanned pregnancy from an intimate night: the chance for a fertile pair, by the protection choice, times the age and health factors above. */
  unplanned: z.strictObject({ carefree: probability, careful: probability }),

  pregnancy: z.strictObject({
    /** The chance a pregnancy ends in miscarriage: base × the age factor × the health factor. */
    miscarriage: z.strictObject({
      base: probability,
      carrierAge: curveSchema,
      health: curveSchema,
    }),
  }),

  ivf: z.strictObject({
    /** The carrier must be at least this old and no older than maxAge. */
    minAge: z.int().min(18).max(60),
    maxAge: z.int().min(18).max(70),
    /** Chance a cycle works, by the carrier's age. */
    success: curveSchema,
    /** A cycle takes this many years to answer. */
    waitYears: z.int().min(1).max(5),
  }),

  surrogacy: z.strictObject({
    minAge: z.int().min(18).max(60),
    maxAge: z.int().min(18).max(80),
    /** Chance the match comes through. */
    success: probability,
    waitYears: z.int().min(1).max(5),
  }),

  adoption: z.strictObject({
    minAge: z.int().min(18).max(60),
    maxAge: z.int().min(18).max(90),
    waitYears: range,
    /** Chance a placement falls through when a match is made. */
    declineChance: probability,
    /** Weights by the child's age (index = age in years). */
    childAgeWeights: z.array(z.number().nonnegative()).min(1).max(18),
    /** A conviction (probation or prison) within this many years rules you out. */
    recordYears: z.int().min(0).max(50),
    /** Savings left after the fees must be at least this (national average dollars, scaled to your city). */
    reserve: z.int().min(0),
  }),

  genetics: z.strictObject({
    /** Spread of the roll around the biological parents' mean for stats and personality. */
    noiseSd: z.number().min(0).max(40),
    /** Spread of genetic health risk around its parents' mean. */
    riskSd: z.number().min(0).max(40),
    /** A child inherits a parent's hidden talent with this chance; otherwise the usual odds apply (creation.yaml talentChance). */
    talentInherit: probability,
    /** How far a newborn's starting Health, Happiness, Fitness and Stress sit (fitness follows the parents' mean). */
    newborn: z.strictObject({ health: distributionSchema, happiness: distributionSchema, stress: distributionSchema }),
    /** The share of a stepchild's or adopted child's values drawn from the general population rather than their parents. */
    populationShare: probability,
  }),

  parenting: z.strictObject({
    /** A new parent-child relationship starts here. */
    start: z.strictObject({ warmth: z.int().min(0).max(100), strictness: z.int().min(0).max(100), involvement: z.int().min(0).max(100) }),
    /** Each year the style moves this share of the way to its baseline: it reflects how you've been lately. */
    drift: probability,
    /** Where involvement settles if you do nothing, by where the child lives. */
    involvementBaseline: z.strictObject({ household: z.int().min(0).max(100), shared: z.int().min(0).max(100), other: z.int().min(0).max(100) }),
    /** A year with no interaction at all with the child costs this much involvement. */
    inactivity: z.int().min(0).max(30),
    /** Stepchildren feel your style this much as strongly (1 for your own). */
    stepShare: probability,
    /** How a child feels about you when they arrive: affection and trust, by how they came to you (stepchildren: stepchildren.affection and trust). */
    bond: z.strictObject({
      birth: z.strictObject({ affection: distributionSchema, trust: distributionSchema }),
      adopted: z.strictObject({ affection: distributionSchema, trust: distributionSchema }),
    }),
    /** Style words: at or above this a line reads high (warm, strict, involved), at or below `low` it reads low (cold, relaxed, absent). */
    words: z.strictObject({ high: z.int().min(50).max(100), low: z.int().min(0).max(50) }),
    /** A notable year leaves a memory on the child's side: a line at or above `high` (or at or below `low`) for the year, and not the same one again for `years` years. */
    memories: z.strictObject({ high: z.int().min(50).max(100), low: z.int().min(0).max(50), years: z.int().min(1).max(20) }),
  }),

  children: z.strictObject({
    /** How much each parenting line weighs on a child's growth, by the child's age. */
    ageWeight: curveSchema,
    /** Points of personality moved each year per line: value × (line − 50) ÷ 50 × age weight. Fractions happen by chance. */
    personality: z.partialRecord(traitKey, styleEffect),
    /** Smarts moved each year the same way. */
    smarts: styleEffect,
    /** Grades (0–4) for the school year: base plus these per point above 50 (or the style line's extreme), plus noise. */
    grades: z.strictObject({
      base: z.number().min(0).max(4),
      smarts: z.number().min(0).max(0.1),
      discipline: z.number().min(0).max(0.1),
      happiness: z.number().min(0).max(0.1),
      style: styleEffect,
      noiseSd: z.number().min(0).max(2),
    }),
    /** The child's Happiness target and how quickly it follows; Stress likewise. */
    happiness: z.strictObject({ base: z.number().min(0).max(100), style: styleEffect, rate: probability, noiseSd: z.number().min(0).max(30) }),
    stress: z.strictObject({ base: z.number().min(0).max(100), style: styleEffect, rate: probability, noiseSd: z.number().min(0).max(30) }),
    /** Health and Fitness each year move this share of the way to their base, with noise. */
    health: z.strictObject({ base: z.number().min(0).max(100), fitnessBase: z.number().min(0).max(100), noiseSd: z.number().min(0).max(20), rate: probability }),
    /** The affection target from your style and how quickly affection follows it; trust moves with these points a year. */
    affection: z.strictObject({ base: z.number().min(0).max(100), style: styleEffect, rate: probability }),
    trust: z.strictObject({ style: styleEffect }),
    /** Points added to a child's mood baseline per point of warmth above 50 (E1 moods). */
    moodWarmth: z.number().min(0).max(1),
    /** Moving out: from this age each year, with this chance; by `latest` they have. */
    leaving: z.strictObject({ age: z.int().min(16).max(30), chance: probability, latest: z.int().min(16).max(40), elsewhere: probability }),
    /** Grown children: from this age they may have a job, with this chance. */
    career: z.strictObject({ age: z.int().min(16).max(40), employed: probability }),
    /** Yearly chance a child dies, by age. From `usualFrom`, the usual NPC odds apply instead. */
    death: z.strictObject({ byAge: curveSchema, usualFrom: z.int().min(10).max(100) }),
  }),

  costs: z.strictObject({
    /** What a child costs each year at the national average, by age. */
    perChild: curveSchema,
    /** Multiplied by your lifestyle. */
    lifestyle: z.strictObject({ frugal: z.number().nonnegative(), comfortable: z.number().nonnegative(), lavish: z.number().nonnegative() }),
    /** Your share when the child's other parent lives with you. */
    partnerShare: probability,
    /** Your share of a child in shared custody. */
    sharedShare: probability,
  }),

  /** How strong your case is in a custody hearing (0–100): involvement and warmth with the children, and how steady your home and work are. Weights sum to 1. */
  custody: z.strictObject({
    case: z.strictObject({ involvement: probability, warmth: probability, housing: probability, work: probability }),
  }),

  support: z.strictObject({
    /** What you pay if the children live with the other parent: this share of your gross income, by how many (1, 2, 3 or more). */
    pay: z.array(probability).min(1).max(3),
    /** Never less than this (national average, scaled to your city) when you pay. */
    payMin: z.int().min(0),
    /** Multiplies what you receive for two and for three or more children living with you. */
    receiveMore: z.array(z.number().min(1).max(10)).length(2),
    /** What you receive if the children live with you, by the other parent's wealth level (national average, per year, scaled to your city). */
    receive: z.strictObject({ poor: z.int().min(0), working: z.int().min(0), middle: z.int().min(0), affluent: z.int().min(0), rich: z.int().min(0) }),
    /** Payments stop at this age of the youngest child involved. */
    untilAge: z.int().min(16).max(25),
  }),

  /** Stepchildren: potential partners may have children from before. */
  stepchildren: z.strictObject({
    /** The chance someone you meet as a potential partner has children, by their age. */
    chance: curveSchema,
    /** Weights for 1, 2, 3 children. */
    count: z.array(z.number().nonnegative()).min(1).max(3),
    /** Their youngest child is at least this many years younger than they are minus the adult age; never more than `maxAge`. */
    maxAge: z.int().min(1).max(30),
    /** Starting affection and trust of a stepchild. */
    affection: distributionSchema,
    trust: distributionSchema,
  }),
});
export type FamilyBalance = z.infer<typeof familyBalanceSchema>;

/**
 * What each family result needs from its events: `required` roles are always
 * cast by the engine, `allowed` roles may also appear (an optional role can
 * be missing). Anything else in the cast is an error in the content.
 */
export const FAMILY_RESULT_ROLES = {
  /** You carried (or no one did): the baby, and the other parent if there is one. */
  birthYou: { required: ['baby'], allowed: ['baby', 'other'] },
  /** A partner carried: the baby and the partner who carried. */
  birthPartner: { required: ['baby', 'carrier'], allowed: ['baby', 'carrier'] },
  /** Someone who isn't your partner carried: the baby and the carrier. */
  birthCoparent: { required: ['baby', 'carrier'], allowed: ['baby', 'carrier'] },
  birthSurrogate: { required: ['baby'], allowed: ['baby', 'other'] },
  /** Placed for adoption: you carried (nobody else cast, other parent optional)... */
  placedYou: { required: [], allowed: ['other'] },
  /** ...or someone else did. */
  placedOther: { required: ['carrier'], allowed: ['carrier'] },
  miscarriageYou: { required: [], allowed: ['other'] },
  miscarriageCarried: { required: ['carrier'], allowed: ['carrier'] },
  miscarriageSurrogate: { required: [], allowed: ['other'] },
  /** The decision on an unplanned pregnancy: the other parent. */
  decision: { required: ['other'], allowed: ['other'] },
  adoptionMatch: { required: ['child'], allowed: ['child'] },
  adoptionDeclined: { required: [], allowed: [] },
  ivfSuccess: { required: [], allowed: ['other'] },
  ivfFailed: { required: [], allowed: ['other'] },
  surrogacyMatch: { required: [], allowed: ['other'] },
  surrogacyFellThrough: { required: [], allowed: ['other'] },
  /** The child who has died (a deceased role). */
  childDeath: { required: ['child'], allowed: ['child'] },
  /** The other parent of children whose custody is undecided. */
  custody: { required: ['other'], allowed: ['other'] },
  /** What an action asking to start a process answers with (the action casts nobody). */
  start: { required: [], allowed: ['other'] },
} as const;
export type FamilyResultId = keyof typeof FAMILY_RESULT_ROLES;

/** The ages a child's death is told in. */
export const CHILD_DEATH_STAGES = ['infant', 'young', 'teen', 'adult'] as const;
export type ChildDeathStage = (typeof CHILD_DEATH_STAGES)[number];

const eventList = z.array(idSchema).min(1);

/**
 * The events the family system queues itself (registries/family.yaml). Each
 * is followUpOnly and casts only the roles FAMILY_RESULT_ROLES allows; the
 * engine picks one that fits, by weight.
 */
export const familyRegistrySchema = z.strictObject({
  birth: z.strictObject({ you: eventList, partner: eventList, coparent: eventList, surrogate: eventList, placedYou: eventList, placedOther: eventList }),
  miscarriage: z.strictObject({ you: eventList, carried: eventList, surrogate: eventList }),
  decision: eventList,
  adoption: z.strictObject({ start: eventList, match: eventList, declined: eventList }),
  ivf: z.strictObject({ start: eventList, success: eventList, failed: eventList }),
  surrogacy: z.strictObject({ start: eventList, match: eventList, fellThrough: eventList }),
  childDeath: z.strictObject({ infant: eventList, young: eventList, teen: eventList, adult: eventList }),
  custody: eventList,
});
export type FamilyRegistry = z.infer<typeof familyRegistrySchema>;

/** Every family result with its registry events, for the content build. */
export function familyResults(r: FamilyRegistry): { id: FamilyResultId; where: string; events: readonly string[] }[] {
  return [
    { id: 'birthYou', where: 'birth.you', events: r.birth.you },
    { id: 'birthPartner', where: 'birth.partner', events: r.birth.partner },
    { id: 'birthCoparent', where: 'birth.coparent', events: r.birth.coparent },
    { id: 'birthSurrogate', where: 'birth.surrogate', events: r.birth.surrogate },
    { id: 'placedYou', where: 'birth.placedYou', events: r.birth.placedYou },
    { id: 'placedOther', where: 'birth.placedOther', events: r.birth.placedOther },
    { id: 'miscarriageYou', where: 'miscarriage.you', events: r.miscarriage.you },
    { id: 'miscarriageCarried', where: 'miscarriage.carried', events: r.miscarriage.carried },
    { id: 'miscarriageSurrogate', where: 'miscarriage.surrogate', events: r.miscarriage.surrogate },
    { id: 'decision', where: 'decision', events: r.decision },
    { id: 'start', where: 'adoption.start', events: r.adoption.start },
    { id: 'adoptionMatch', where: 'adoption.match', events: r.adoption.match },
    { id: 'adoptionDeclined', where: 'adoption.declined', events: r.adoption.declined },
    { id: 'start', where: 'ivf.start', events: r.ivf.start },
    { id: 'ivfSuccess', where: 'ivf.success', events: r.ivf.success },
    { id: 'ivfFailed', where: 'ivf.failed', events: r.ivf.failed },
    { id: 'start', where: 'surrogacy.start', events: r.surrogacy.start },
    { id: 'surrogacyMatch', where: 'surrogacy.match', events: r.surrogacy.match },
    { id: 'surrogacyFellThrough', where: 'surrogacy.fellThrough', events: r.surrogacy.fellThrough },
    ...CHILD_DEATH_STAGES.map((s) => ({ id: 'childDeath' as const, where: `childDeath.${s}`, events: r.childDeath[s] })),
    { id: 'custody', where: 'custody', events: r.custody },
  ];
}

