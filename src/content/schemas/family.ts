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
import { templateSchema, variantsSchema } from './text';

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

const wealthLevels = z.strictObject({ poor: z.int().min(0), working: z.int().min(0), middle: z.int().min(0), affluent: z.int().min(0), rich: z.int().min(0) });
const percent = z.int().min(0).max(100);

/**
 * E2b: how an estate is settled (docs/expansion.md, E2b). Costs come off
 * the estate first, then debts other than the mortgage; a home passes with
 * its mortgage; what is left is shared by the will, or by these default
 * shares. Nothing is ever inherited as debt beyond the home it is attached to.
 */
const estateBalanceSchema = z.strictObject({
  /** The funeral, at the national average (scaled to the city you lived in). */
  funeral: z.int().min(0),
  /** Legal and settlement costs: this share of savings plus the home's value. */
  settlementShare: z.number().min(0).max(0.5),
  /**
   * Estate tax: the share of what is left to share out (cash and the home's equity, after costs and
   * debts) that goes in tax, by the size of that estate (whole dollars): straight lines between the
   * points, flat beyond the ends. Nothing is owed on a small estate, and a very large one can't pass
   * whole from one generation to the next, so family wealth can't snowball.
   */
  tax: curveSchema,
  /** The most one person can put in a will's shares: every share is at least 1%, and the shares add up to 100. */
  maxShares: z.int().min(1).max(20),
  /** Without a will. Percent of the estate (the rest is split by the rules below). */
  default: z.strictObject({
    /** With a spouse and children: the spouse's percent; the children split the rest equally. */
    spouseWithChildren: percent,
    /** With a spouse and no children: the spouse's percent; living parents and siblings split the rest (the spouse takes it all when there are none). */
    spouseOnly: percent,
    /** With no spouse and no children: living parents' percent; living siblings split the rest (whichever exists takes it all). */
    parents: percent,
  }),
});

/**
 * E2b: continuing as an heir (docs/expansion.md, E2b): how the family you
 * left behind is seen from the heir's side, who takes a minor in, how
 * family reputation is earned and carried, and the inheritance dramas that
 * follow.
 */
const heirBalanceSchema = z.strictObject({
  /** An heir's money stays in trust until this age. */
  trustReleaseAge: z.int().min(18).max(30),
  /** Savings an heir of 18 or older has, from a life of their own that isn't played (by their wealth level; before any inheritance). */
  adultSavings: wealthLevels,
  /** A grown heir's job starts at this level if they work, and they hold only a high school diploma. */
  guardian: z.strictObject({
    /** Relatives and older siblings must be at least this old, and no older than maxAge, to take a minor in. */
    minAge: z.int().min(18).max(60),
    maxAge: z.int().min(40).max(100),
    /** And be at least this fond of the heir (a surviving parent always does). */
    minAffection: z.int().min(0).max(100),
  }),
  /** How the heir feels about the family around them at the start. */
  bonds: z.strictObject({
    parent: z.strictObject({ affection: distributionSchema, trust: distributionSchema }),
    stepparent: z.strictObject({ affection: distributionSchema, trust: distributionSchema }),
    sibling: z.strictObject({ affection: distributionSchema, trust: distributionSchema }),
    grandparent: z.strictObject({ affection: distributionSchema, trust: distributionSchema }),
    relative: z.strictObject({ affection: distributionSchema, trust: distributionSchema }),
    /** The foster family. */
    foster: z.strictObject({ affection: distributionSchema, trust: distributionSchema }),
  }),
  /** A grown heir under this age who hadn't moved out lives with a surviving parent, if there is one. */
  livesHomeUntil: z.int().min(18).max(30),
  /** The most memories of how they were raised the childhood recap tells. */
  recapMemories: z.int().min(0).max(8),
  /** The foster carer's age range. */
  fosterAge: z.strictObject({ min: z.int().min(25).max(60), max: z.int().min(25).max(80) }),
  /** Heirs start from their parent's final wealth level and may inherit a home: a minor's is sold into trust, losing this share of its value as selling costs (balance/economy.yaml ownership.sellingCosts). */
  reputation: z.strictObject({
    /** The family's reputation moves this share of the way back to 50 with each generation... */
    retention: z.number().min(0).max(1),
    /** ...before your own life adds to it: points per point your own reputation stands above or below 50. */
    personal: z.number().min(0).max(2),
    /** Points a criminal record adds, by outcome. */
    record: z.strictObject({ warning: z.number().min(-30).max(30), fine: z.number().min(-30).max(30), probation: z.number().min(-30).max(30), jail: z.number().min(-30).max(30) }),
    /** Points from what you left behind: the net worth (whole dollars) points at the left, interpolated. */
    wealth: curveSchema,
    /** Points per percent of the estate you left to a cause, up to max. */
    generosity: z.strictObject({ perPercent: z.number().min(0).max(1), max: z.number().min(0).max(30), deedAt: z.int().min(1).max(100) }),
    /** Notable deeds you did, by the flag that proves them: the points and the deed the family is known for. */
    flags: z.record(idSchema, z.strictObject({ delta: z.number().min(-30).max(30), deed: idSchema })),
    /** Wealth and a record also make the family known for these deeds: from this net worth, and from this many convictions. */
    deedWealth: z.int().min(0),
    deedConvictions: z.int().min(1).max(10),
    /** The most deeds the family is known for. */
    maxDeeds: z.int().min(1).max(10),
    /** The heir's own reputation starts at 50 plus this share of the family's distance from 50. */
    carry: z.number().min(0).max(1),
  }),
  /** How people treat the heir: a new person who joins their life starts this many affection points higher per point of family reputation above 50 (lower below). */
  newPersonAffection: z.number().min(0).max(1),
  /** Chances that a will or its absence leads to a dispute event. */
  drama: z.strictObject({
    /** A sibling disputes the will when it left the heir and a sibling unequal shares. */
    siblingDispute: probability,
    /** A sibling the heir is estranged from contests the estate. */
    estrangedContest: probability,
    /** A person who wasn't family got a share, and turns up. */
    unexpectedBeneficiary: probability,
    /** A cause got a share, and writes. */
    causeLetter: probability,
    /** Without a will: the family settles things badly. */
    noWillDispute: probability,
    /** Years after the death that a dispute or a letter comes. */
    inYears: range,
  }),
  /** Memories of the previous generation: the chance each style memory brings an event, and when. */
  memoryEvent: z.strictObject({ chance: probability, inYears: range, max: z.int().min(0).max(6) }),
});

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

  /** E2b: settling an estate at death. */
  estate: estateBalanceSchema,
  /** E2b: continuing as an heir. */
  heir: heirBalanceSchema,
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



/** E2b: what a family can be known for (text/heir.yaml deeds, balance family.yaml heir.reputation.flags). */
export const FAMILY_DEEDS = ['wealth', 'conviction', 'bankruptcy', 'scandal', 'honored', 'generous'] as const;
export type FamilyDeed = (typeof FAMILY_DEEDS)[number];

/** E2b: the memories of how an heir was raised that can bring an event later (the E2a parenting style memories). */
export const HEIR_MEMORY_TAGS = ['parent_warm_home', 'parent_cold_home', 'parent_always_there', 'parent_never_around', 'parent_strict_rules', 'parent_no_rules'] as const;
export type HeirMemoryTag = (typeof HEIR_MEMORY_TAGS)[number];
/**
 * The same memories from the heir's side: what the parent who died did, on the
 * heir's relationship with them (the E2a tags are the child's memories, on the
 * parent's side, and read "Remembers a warm home").
 */
export const HEIR_MEMORY_MAP: Record<HeirMemoryTag, string> = {
  parent_warm_home: 'heir_warm_home',
  parent_cold_home: 'heir_cold_home',
  parent_always_there: 'heir_always_there',
  parent_never_around: 'heir_never_around',
  parent_strict_rules: 'heir_strict_rules',
  parent_no_rules: 'heir_no_rules',
};

/** E2b: who takes a minor heir in. 'foster' is the foster care path (a foster carer is created). */
export const GUARDIAN_KINDS = ['parent', 'stepparent', 'grandparent', 'relative', 'sibling'] as const;
export type GuardianKind = (typeof GUARDIAN_KINDS)[number];

/** E2b: causes a will can name (registries/estate.yaml). */
export const estateRegistrySchema = z.strictObject({
  causes: z.record(
    idSchema,
    z.strictObject({ name: z.string().trim().min(1).max(60), blurb: z.string().trim().min(1).max(120) }),
  ),
});
export type EstateRegistry = z.infer<typeof estateRegistrySchema>;

/**
 * E2b: the events the heir system schedules when a life continues as an
 * heir (registries/heir.yaml). Each is followUpOnly. The engine picks one
 * from each list that applies and schedules it, passing the parent who died
 * as the `parent` role (a deceased role) where an event casts one; every other
 * role is cast when the event comes due, so an event whose people aren't
 * there any more simply doesn't happen.
 */
export const heirRegistrySchema = z.strictObject({
  /** You left a will: it is read. */
  will: eventList,
  /** You left no will. */
  noWill: eventList,
  /** The will left the heir and a sibling unequal shares. Cast: sibling. */
  siblingDispute: eventList,
  /** No will: the family settles things badly. Cast: sibling. */
  noWillDispute: eventList,
  /** A sibling the heir is estranged from contests the estate. Cast: sibling. */
  estrangedContest: eventList,
  /** Someone who wasn't family was named in the will. Cast: stranger (an acquaintance, created if needed). */
  unexpectedBeneficiary: eventList,
  /** A cause was named in the will. */
  causeLetter: eventList,
  /** The will left the heir out. */
  leftOut: eventList,
  /** A minor heir's first year with whoever took them in. Cast: guardian. */
  guardian: z.strictObject({ parent: eventList, stepparent: eventList, grandparent: eventList, relative: eventList, sibling: eventList }),
  /** A minor heir with no one to live with: foster care. Cast: guardian (the foster carer). */
  foster: eventList,
  /** A memory of how the heir was raised, years later. Cast: parent (deceased). */
  memories: z.strictObject(Object.fromEntries(HEIR_MEMORY_TAGS.map((t) => [t, eventList])) as Record<HeirMemoryTag, typeof eventList>),
});
export type HeirRegistry = z.infer<typeof heirRegistrySchema>;

/** Every heir result with its events and the roles the engine passes in (a deceased `parent`, or nobody), for the content build. */
export function heirResults(r: HeirRegistry): { where: string; events: readonly string[]; passes: readonly string[] }[] {
  return [
    { where: 'will', events: r.will, passes: ['parent'] },
    { where: 'noWill', events: r.noWill, passes: ['parent'] },
    { where: 'siblingDispute', events: r.siblingDispute, passes: ['parent', 'sibling'] },
    { where: 'noWillDispute', events: r.noWillDispute, passes: ['parent', 'sibling'] },
    { where: 'estrangedContest', events: r.estrangedContest, passes: ['parent', 'sibling'] },
    { where: 'unexpectedBeneficiary', events: r.unexpectedBeneficiary, passes: ['parent'] },
    { where: 'causeLetter', events: r.causeLetter, passes: ['parent'] },
    { where: 'leftOut', events: r.leftOut, passes: ['parent'] },
    ...GUARDIAN_KINDS.map((k) => ({ where: `guardian.${k}`, events: r.guardian[k], passes: [] as string[] })),
    { where: 'foster', events: r.foster, passes: [] },
    ...HEIR_MEMORY_TAGS.map((t) => ({ where: `memories.${t}`, events: r.memories[t], passes: ['parent'] })),
  ];
}

/**
 * E2b: the words an heir's start is written in (text/heir.yaml). Roles: parent
 * (the parent who died: {parent.name}, {parent.they}...), guardian (who took
 * the heir in: {guardian.name}...). Values: {age} (the parent's age at death),
 * {year}, {cause}, {heirAge}, {amount}, {value}, {city}, {releaseAge}.
 */
export const heirTextSchema = z.strictObject({
  previously: z.strictObject({
    /** Values: {age}, {year}, {cause}. */
    died: variantsSchema,
    /** Who took a minor heir in (role guardian). */
    guardian: z.strictObject({
      parent: variantsSchema,
      stepparent: variantsSchema,
      grandparent: variantsSchema,
      relative: variantsSchema,
      sibling: variantsSchema,
      foster: variantsSchema,
    }),
    /** A grown heir on their own: values {heirAge}. */
    grown: variantsSchema,
    /** What was inherited. cash: {amount}; trust: {amount}, {releaseAge}; home: {value}, {city}. */
    inherited: z.strictObject({ cash: templateSchema, trust: templateSchema, home: templateSchema, nothing: variantsSchema, leftOut: variantsSchema }),
  }),
  /** Childhood recap entries for the start of the heir's life history. Role: parent. */
  recap: z.strictObject({
    /** Values: {age} (how old the heir was when they joined, for an adopted child). */
    origin: z.strictObject({ birth: variantsSchema, adopted: variantsSchema, grandchild: variantsSchema }),
    /** One line for each memory of how the heir was raised. */
    memories: z.strictObject(Object.fromEntries(HEIR_MEMORY_TAGS.map((t) => [t, templateSchema])) as Record<HeirMemoryTag, typeof templateSchema>),
    /** The heir had moved out before the death. */
    movedOut: variantsSchema,
    /** The parent's death: values {age}, {heirAge}. */
    loss: variantsSchema,
    /** Foster care begins and ends. */
    foster: z.strictObject({ began: variantsSchema, ended: variantsSchema }),
  }),
  /** What a family is known for, as a phrase: "a family known for {deed}". */
  deeds: z.strictObject(Object.fromEntries(FAMILY_DEEDS.map((d) => [d, templateSchema])) as Record<FamilyDeed, typeof templateSchema>),
});
export type HeirText = z.infer<typeof heirTextSchema>;
