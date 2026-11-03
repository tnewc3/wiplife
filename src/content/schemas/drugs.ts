/**
 * Drugs (D1, docs/careers-crime-and-ui.md): the drug definitions (src/content/drugs), the grow operations and labs that
 * make them (src/content/operations, W3), every number (balance/drugs.yaml), the events the drugs step queues
 * (registries/drugs.yaml) and the words it writes (text/drugs.yaml).
 *
 * Story and consequences only: odds, prices, effects on how the character feels and what they cost. Nothing here, and
 * nothing in an event, says how to make, hide, test, dose or get away with anything. Growing and making are business
 * abstractions (capacity, quality, output, risk). Every outfit, lab and name is made up.
 */
import { z } from 'zod';
import { baseDefSchema, idSchema } from './common';

const probability = z.number().min(0).max(1);
const score = z.number().min(0).max(100);
const text = z.string().trim().min(1).max(240);

export const DRUG_CATEGORIES = ['cannabis', 'stimulant', 'opioid', 'sedative', 'party', 'psychedelic', 'enhancer'] as const;
export type DrugCategory = (typeof DRUG_CATEGORIES)[number];

/** Where a drug can be bought: a dealer you know, a friend who knows someone, a night out, or the black market. */
export const DRUG_SOURCES = ['dealer', 'contact', 'nightlife', 'market'] as const;
export type DrugSource = (typeof DRUG_SOURCES)[number];
export const drugSourceSchema = z.enum(DRUG_SOURCES);

/** What a purchase can turn into besides the product. */
export const BUY_OUTCOMES = ['fine', 'ripoff', 'bad', 'robbed', 'arrest'] as const;
export type BuyOutcome = (typeof BUY_OUTCOMES)[number];

/** Kinds of operation (W3 business types): a grow operation or a lab. */
export const OPERATION_KINDS = ['grow', 'lab'] as const;
export type OperationKind = (typeof OPERATION_KINDS)[number];

/** The ways to take a drug: a little, or a lot. */
export const USE_DOSES = ['light', 'heavy'] as const;
export type UseDose = (typeof USE_DOSES)[number];

/** Dealing: how you price what you sell. */
export const DEAL_PRICES = ['low', 'fair', 'high'] as const;
export type DealPrice = (typeof DEAL_PRICES)[number];


const moneyRange = z.strictObject({ min: z.int().min(1).max(1_000_000), max: z.int().min(1).max(1_000_000) }).refine((r) => r.min <= r.max, 'min must not be greater than max');

/** A drug (src/content/drugs). Real drug names are fine; effects are how it feels and what it costs the character. */
export const drugSchema = baseDefSchema.extend({
  name: z.string().trim().min(2).max(40),
  /** As it reads in a sentence ("cocaine", "the pills"). */
  noun: z.string().trim().min(2).max(40),
  category: z.enum(DRUG_CATEGORIES),
  blurb: z.string().trim().min(10).max(200),
  /** What one measure is called (the price is for one). */
  unit: z.strictObject({ one: z.string().trim().min(2).max(20), many: z.string().trim().min(2).max(20) }),
  /** Street price of one unit in a city of average cost (US dollars; scaled by the city's cost of living and the country's price level). */
  price: moneyRange,
  /** Price ranges for particular cities (the rest follow the base range scaled by cost of living). */
  cities: z.record(idSchema, moneyRange).optional(),
  /** Short term, one typical use: changes to Happiness, Stress and Health (before quality and tolerance). */
  effects: z.strictObject({ happiness: z.int().min(-20).max(20), stress: z.int().min(-20).max(20), health: z.int().min(-20).max(5) }),
  /** Long term, for each year of heavy use or dependence: Health lost, points lost at work and in school, and affection lost with the people closest to you. */
  long: z.strictObject({ health: z.number().min(0).max(10), work: z.number().min(0).max(15), school: z.number().min(0).max(1), bonds: z.number().min(0).max(10) }),
  /** How fast it takes hold: dependence gained per use at a vice of 50 (0–100). */
  strength: score,
  /** Tolerance gained per use (0–100). */
  tolerance: z.number().min(0).max(40),
  /** The chance a use goes badly wrong at average tolerance, quality and dose. */
  overdose: probability,
  /** How the law sees it (1: least, 5: most): possession, intent and trafficking offenses escalate from it. */
  severity: z.int().min(1).max(5),
  /** Where it is sold. */
  sources: z.array(drugSourceSchema).min(1),
  /** The operations that can make it (a grow operation, a lab). */
  produce: z.array(z.enum(OPERATION_KINDS)).optional(),
  /** Withdrawal costs this much Stress in a year of dependence (before dependence scales it). */
  withdrawal: z.number().min(0).max(30),
});
export type DrugDef = z.infer<typeof drugSchema>;

/** A grow operation or a lab (src/content/operations): a W3 business type run for the product. A business abstraction: capacity, quality, output and risk, never a process. */
export const operationSchema = baseDefSchema.extend({
  name: z.string().trim().min(2).max(40),
  kind: z.enum(OPERATION_KINDS),
  blurb: z.string().trim().min(10).max(200),
  /** The drugs it can make (each must list this kind in `produce`). */
  drugs: z.array(idSchema).min(1),
  /** Fitting it out, and the yearly upkeep, before the city's cost of living. */
  startup: z.int().min(1000).max(5_000_000),
  upkeep: z.int().min(0).max(1_000_000),
  /** Units a year at full running. */
  capacity: z.int().min(1).max(100_000),
  /** The quality it starts at and the most it can reach (0–100). */
  quality: z.strictObject({ start: score, max: score }),
  /** Yearly risk of a raid (before heat), a fire or a theft. */
  raid: probability,
  fire: probability,
  theft: probability,
  /** The names a new operation takes (made up). */
  names: z.array(z.string().trim().min(3).max(40)).min(4).max(20),
});
export type OperationDef = z.infer<typeof operationSchema>;

const sourceRiskSchema = z.strictObject({
  /** Multiplier on the street price. */
  price: z.number().min(0.3).max(4),
  /** The quality of what you get: mean and spread (0–100). */
  quality: z.strictObject({ mean: score, sd: z.number().min(0).max(50) }),
  /** Chance of each bad outcome (before heat and your record): taken for nothing, bad product, robbed, caught. */
  ripoff: probability,
  bad: probability,
  robbed: probability,
  arrest: probability,
});

const doseSchema = z.strictObject({ units: z.int().min(1).max(10), effect: z.number().min(0.1).max(4), risk: z.number().min(0.1).max(10), dependence: z.number().min(0.1).max(10) });

/** Drug numbers (src/content/balance/drugs.yaml). */
export const drugsBalanceSchema = z.strictObject({
  ages: z.strictObject({
    /** The youngest age that can be offered or take a drug (an offer at a party or a friend's). Never a purchase. */
    use: z.int().min(10).max(30),
    /** Buying, dealing, making and buying for resale are for adults. */
    adult: z.int().min(18).max(30),
  }),
  /** At this dependence (0–100) the addiction shows as a condition on your Health page. */
  threshold: z.int().min(1).max(100),
  /** The drug an addiction belongs to when an old event wrote it down with no drug behind it (pills at a party, leftover prescriptions). */
  legacyDrug: idSchema,
  /** Price is scaled by this much of the city's cost of living (0: not at all, 1: fully). */
  cityPrice: z.number().min(0).max(2),
  sources: z.strictObject({ dealer: sourceRiskSchema, contact: sourceRiskSchema, nightlife: sourceRiskSchema, market: sourceRiskSchema }),
  buy: z.strictObject({
    /** Amounts you can ask for, in units. */
    amounts: z.array(z.int().min(1).max(100)).min(1).max(5),
    /** Each point of heat adds this much to the chance of being caught; each entry of your record (up to `recordMax`) multiplies it by `record`. */
    heat: z.number().min(0).max(0.05),
    record: z.number().min(1).max(3),
    recordMax: z.int().min(0).max(5),
    /** Of the cash on you, this share goes when you are robbed (as well as the purchase). */
    robbedCash: probability,
    /** A bad batch is this quality at most. */
    badQuality: score,
    /** Stock you can hold is capped (a stash is not a warehouse): units per drug. */
    cap: z.int().min(1).max(1000),
    /** Buying for resale: the smallest purchase counted as a resale amount, and the bulk discount at each step of amounts. */
    bulkDiscount: z.number().min(0).max(0.6),
    /** Heat added by buying (from a dealer, a contact, nightlife, the market) and by buying for resale. */
    heatBuy: z.number().min(0).max(20),
    heatResale: z.number().min(0).max(40),
    /** A friend who knows someone: the chance they put you in touch with a dealer, and the dealer's age. */
    introduce: probability,
    dealerAge: z.strictObject({ min: z.int().min(18).max(80), max: z.int().min(18).max(80) }),
    /** How many dealers you can know. */
    dealersMax: z.int().min(1).max(10),
  }),
  stash: z.strictObject({
    /** Keeping it hidden costs this much a year per unit held, and lowers what a search finds by this share. */
    hideCost: z.number().min(0).max(1000),
    hideFind: probability,
    /** Chance a search of your home finds a stash in a year at heat 100 (scaled by heat); and the chance a theft takes it. */
    search: probability,
    theft: probability,
  }),
  use: z.strictObject({
    /** Most uses (by action) in a year across all drugs. */
    perYear: z.int().min(1).max(60),
    doses: z.strictObject({ light: doseSchema, heavy: doseSchema }),
    /** The effects scale with quality: 1 at quality 50, this much less/more at 0/100. */
    quality: z.number().min(0).max(1),
    /** Tolerance cuts effects by up to this share at 100. */
    blunt: probability,
    /** Dependence gained scales with your vice (hidden 0–100): the curve (at, x). */
    vice: z.array(z.strictObject({ at: score, x: z.number().min(0).max(5) })).min(2),
    /** Using a second drug in the same year raises the risk by this much. */
    mixing: z.number().min(1).max(10),
    /** Happiness gained is capped by this share of the drug's effect per repeat in a year (diminishing). */
    repeats: probability,
    /** A first-ever use of a drug: dependence gain is this share, and it can never go badly wrong. */
    first: probability,
    /** Chance the offered/first try is read by people: reputation lost on a heavy use seen. */
    reputation: z.number().min(0).max(20),
  }),
  habit: z.strictObject({
    /** A year of this many uses or more counts as heavy. */
    heavyUses: z.int().min(1).max(60),
    /** Yearly uses of a drug at dependence 100 (scaled down with dependence), when you are using. */
    maxUses: z.int().min(1).max(100),
    /** A year with no use: dependence falls by this much, tolerance by this much. */
    clean: z.strictObject({ dependence: z.number().min(0).max(50), tolerance: z.number().min(0).max(100) }),
    /** Dependence lost every year of use that is not the habit's own pull: use has to keep up with it. */
    decay: z.number().min(0).max(50),
    /** Dependence at/after which your habit costs a year in withdrawals if you go without (Stress), and cravings begin. */
    craving: score,
    /** Dependence makes use more likely: chance of a use in a year without a choice (the habit takes over) per point. */
    drift: z.number().min(0).max(1),
    /** The yearly habit cost: dollars at a dependence of 100 per drug (US prices). */
    cost: z.number().min(0).max(1_000_000),
    /** People notice at this dependence: the chance a year and the affection a close tie loses. */
    notice: z.strictObject({ at: score, chance: probability }),
  }),
  overdose: z.strictObject({
    /** Risk multipliers: tolerance (1 + this × tolerance/100 when the dose is heavy), bad product, dependence, and the share of a bad outcome that is an ER visit. */
    tolerance: z.number().min(0).max(10),
    bad: z.number().min(1).max(20),
    dependence: z.number().min(0).max(10),
    /** Of the bad outcomes: a scare (a warning sign), an ER visit, and (only after warning signs) death. */
    outcomes: z.strictObject({ scare: z.number().min(0).max(1), er: z.number().min(0).max(1), death: z.number().min(0).max(1) }),
    /** The warning signs needed before a death is possible. */
    signsForDeath: z.int().min(1).max(5),
    /** A warning sign fades after this many years clean. */
    signsFade: z.int().min(1).max(20),
    /** An ER visit: Health lost, the bill (US dollars) and the Stress. */
    er: z.strictObject({ health: z.int().min(0).max(40), bill: z.int().min(0).max(100_000), stress: z.int().min(0).max(30) }),
    scare: z.strictObject({ health: z.int().min(0).max(30), stress: z.int().min(0).max(30) }),
    /** The yearly habit rolls once for each this many uses (heavy years). */
    rollEvery: z.int().min(1).max(50),
  }),
  recovery: z.strictObject({
    /** Quitting a drug: dependence lost at once, and the Stress and Happiness of the first weeks. Support groups, counseling and rehab are the Recovery activities (src/content/pastimes) and work through the addiction condition. */
    quit: z.strictObject({ dependence: z.number().min(0).max(100), stress: z.int().min(0).max(30), happiness: z.int().min(-30).max(0) }),
    /** Years clean after which you count as recovered. */
    recoveredYears: z.int().min(1).max(20),
    /** The yearly chance of going back while you are quitting: it starts at `base`, falls by `fall` for each year clean, grows with Stress, never below `floor`, and is cut by `supported` with recovery activities done this year or last. */
    relapse: z.strictObject({ base: probability, fall: z.number().min(0).max(1), stress: z.number().min(0).max(0.1), floor: probability, supported: probability }),
    /** A relapse brings back this share of the dependence you had at your worst. */
    relapseShare: probability,
    /** The first clean year costs this much Stress (withdrawal), scaled by dependence. */
    withdrawalYear: z.int().min(0).max(30),
    /** The Recovery activities (ids in src/content/pastimes) that count as support. */
    activities: z.array(idSchema).min(1),
  }),
  dealing: z.strictObject({
    /** The most stock you can sell in a year and the most customers; customers come with time and reputation. */
    customers: z.strictObject({ start: z.int().min(0).max(100), max: z.int().min(1).max(1000), growth: probability, loss: probability, perUnit: z.number().min(0.1).max(20) }),
    /** Pricing: the share of the street price you charge, how it moves demand, and how a rival reacts. */
    prices: z.strictObject({ low: z.number().min(0.3).max(2), fair: z.number().min(0.3).max(2), high: z.number().min(0.3).max(3) }),
    demand: z.strictObject({ low: z.number().min(0.1).max(3), fair: z.number().min(0.1).max(3), high: z.number().min(0.1).max(3) }),
    /** Heat added a year, by units sold (per 10 units), and the base yearly chance of a robbery or a rival's move. */
    heat: z.strictObject({ base: z.number().min(0).max(30), perTenUnits: z.number().min(0).max(30), high: z.number().min(0).max(30) }),
    trouble: z.strictObject({ robbery: probability, rival: probability, snitch: probability }),
    /** A customer in the grip of it who runs short is a risk: the share of customers who owe you at the end of a year. */
    owed: probability,
    /** Standing in dealing (0–100) rises with sold units and falls with trouble; it opens bigger supply and more customers. */
    standing: z.strictObject({ perYear: z.number().min(0).max(20), loss: z.number().min(0).max(30) }),
    /** Yearly Stress and Kindness cost of the work. */
    stress: z.number().min(0).max(30),
    kindness: z.number().min(0).max(5),
    /** Buying for resale pays this much less than street price per bulk step (the discount is in `buy.bulkDiscount`). */
    resaleMin: z.int().min(2).max(100),
  }),
  production: z.strictObject({
    /** Quality improves by this much a year of running well, falls by this when neglected; running at this share of capacity (0–1). */
    quality: z.strictObject({ up: z.number().min(0).max(30), down: z.number().min(0).max(30) }),
    runs: z.strictObject({ low: probability, full: probability }),
    /** The raid chance rises with heat: x(1 + heat × this/100). Machine size also adds to it. */
    heat: z.number().min(0).max(10),
    /** What a fire or a raid costs: share of the fit-out lost, and share of the output seized. */
    fireLoss: probability,
    seize: probability,
    /** Heat added by running at full. */
    runHeat: z.number().min(0).max(30),
    /** Output counts as stock to sell, to dealers: the share of street price paid for output you sell on at once. */
    wholesale: z.number().min(0.05).max(1),
    /** Yearly Stress of running one. */
    stress: z.number().min(0).max(30),
    /** The most operations you can run at once. */
    max: z.int().min(1).max(10),
  }),
  legal: z.strictObject({
    /** The possession offense for each severity 1 to 5. */
    possession: z.array(idSchema).length(5),
    intent: idSchema,
    dealing: idSchema,
    trafficking: idSchema,
    manufacturing: idSchema,
    /** Units held that make possession "intent to sell" and "trafficking" (by severity, 1 to 5, a multiplier on these). */
    intentAt: z.int().min(2).max(100),
    traffickingAt: z.int().min(3).max(500),
    /** Selling more than this in a year when caught is trafficking. */
    soldTrafficking: z.int().min(3).max(1000),
  }),
  enhancers: z.strictObject({
    /** The drug an athlete's performance enhancers use up, and the units a season takes. */
    drug: idSchema,
    units: z.int().min(1).max(10),
  }),
  /** Events the yearly step queues: the chances (they come from registries/drugs.yaml). */
  events: z.strictObject({
    offered: z.number().min(0).max(1),
    craving: z.number().min(0).max(1),
    withdrawal: z.number().min(0).max(1),
    noticed: z.number().min(0).max(1),
    tempted: z.number().min(0).max(1),
    approach: z.number().min(0).max(1),
    maxQueued: z.int().min(1).max(6),
  }),
});
export type DrugsBalance = z.infer<typeof drugsBalanceSchema>;

export const DRUG_TRIGGERS = [
  'offered', 'craving', 'withdrawal', 'noticed', 'tempted', 'approach', 'scare', 'er', 'ripoff', 'robbed', 'arrest',
  'customer', 'rival', 'snitch', 'raid', 'fire', 'theft',
] as const;
export type DrugTrigger = (typeof DRUG_TRIGGERS)[number];

/** The events the drugs step queues (registries/drugs.yaml); each must be followUpOnly. */
export const drugsRegistrySchema = z.strictObject({
  triggers: z.strictObject(Object.fromEntries(DRUG_TRIGGERS.map((t) => [t, z.strictObject({ events: z.array(idSchema).min(1) })])) as Record<(typeof DRUG_TRIGGERS)[number], z.ZodObject<{ events: z.ZodArray<z.ZodString> }, z.core.$strict>>),
  /** Causes of death a drug life can end in (src/content/causes). */
  deathCauses: z.array(idSchema).min(1),
});
export type DrugsRegistry = z.infer<typeof drugsRegistrySchema>;

const group = z.strictObject({ importance: z.union([z.literal(1), z.literal(2), z.literal(3)]), variants: z.array(text).min(1) });

export const DRUG_HISTORY_KEYS = [
  'bought', 'boughtResale', 'ripoff', 'badBatch', 'robbed', 'caught', 'used', 'firstTry', 'scare', 'er', 'overdose', 'hooked',
  'craving', 'withdrawal', 'quit', 'relapsed', 'recovered', 'dealerMet', 'dealingStarted',
  'dealingStopped', 'dealingYear', 'dealingTrouble', 'opened', 'closed', 'raided', 'fire', 'stolen', 'stashFound', 'stashStolen', 'enhancersOut',
] as const;
export type DrugHistoryKey = (typeof DRUG_HISTORY_KEYS)[number];

export const DRUG_NOTE_KEYS = ['ripoff', 'badBatch', 'robbed', 'caught', 'fine', 'usedLight', 'usedHeavy', 'scare', 'er', 'quit', 'relapse', 'noDealer', 'dealerMet', 'sentenceJail', 'sentenceProbation', 'sentenceFine', 'sentenceWarning', 'sourceDealer', 'sourceContact', 'sourceNightlife', 'sourceMarket', 'dealStarted', 'dealStopped', 'dealYear', 'opened', 'closed', 'stashHidden', 'stashOpen', 'enhancersNeed'] as const;
export type DrugNoteKey = (typeof DRUG_NOTE_KEYS)[number];

/** The words the drugs engine writes (text/drugs.yaml): history lines (with {drug}, {units}, {amount}, {source}, {name}) and the one-line notes of an action's result. */
export const drugsTextSchema = z.strictObject({
  history: z.strictObject(Object.fromEntries(DRUG_HISTORY_KEYS.map((k) => [k, group])) as Record<DrugHistoryKey, typeof group>),
  notes: z.strictObject(Object.fromEntries(DRUG_NOTE_KEYS.map((k) => [k, text])) as Record<DrugNoteKey, typeof text>),
});
export type DrugsText = z.infer<typeof drugsTextSchema>;
