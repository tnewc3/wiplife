/**
 * Activities: leisure and self (docs/post-expansion1-changes.md, Batch 2a).
 * An activity is a content definition (src/content/pastimes; the folder is not
 * `activities`, which holds T1's school teams and clubs): what it is, who can
 * do it and where, whether someone comes along, what it costs, and five
 * outcome tiers (great to backfire) with 2-3 wordings each, the effects of
 * each tier, chances that come up inside it, and the follow-up events it can
 * lead to. One life action, `do_activity`, runs any of them through the
 * finance module, the health and legal systems, the relationships and the
 * event pipeline. Every number (costs, odds, diminishing returns, chances)
 * lives in src/content/balance/pastimes.yaml.
 *
 * Valuables (jewelry, designer goods, art, a boat) are a possession kind
 * (E5 extended): src/content/valuables defines what each is; a Luxury
 * activity that `buys` one acquires it.
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { baseDefSchema, dollarsSchema, idSchema, scoreKeySchema } from './common';
import { VALUABLE_CLASSES } from './belongings';
import { countryIdSchema } from './country';
import { conditionSchema, effectSchema } from './events';
import { OUTCOME_TIERS } from './interactions';
import { templateSchema } from './text';

/** The groups on the Activities screen, in the order they appear. */
export const PASTIME_CATEGORIES = [
  'mind_body', 'health', 'recovery', 'salon_spa', 'surgery', 'shopping', 'movies', 'nightlife', 'outdoor', 'luxury', 'love',
  // A1: parties and get-togethers, and hobbies.
  'social', 'hobby',
  // Batch 2b: risk and legal.
  'crime', 'black_market', 'gambling', 'lawsuits', 'identity', 'loans',
] as const;
export type PastimeCategory = (typeof PASTIME_CATEGORIES)[number];

/** Batch 2b: the categories whose outcomes may move money in (loot, winnings, a settlement, a loan) and that have their own rules. */
export const RISK_CATEGORIES = ['crime', 'black_market', 'gambling', 'lawsuits', 'identity', 'loans'] as const satisfies readonly PastimeCategory[];

/** How an activity is worked out: `roll` (odds profile and tiers), `gamble` (a game's payout table), `lawsuit` (evidence, a lawyer, settle or trial), `loan` (approval, then a debt), `name` (a legal name change). */
export const PASTIME_MECHANICS = ['roll', 'gamble', 'lawsuit', 'loan', 'name'] as const;
export type PastimeMechanic = (typeof PASTIME_MECHANICS)[number];

/** Stakes at the tables (balance/risk.yaml stakes), and how a lawsuit ends (settle or go to trial). */
export const PASTIME_STAKES = ['low', 'medium', 'high'] as const;
export type PastimeStake = (typeof PASTIME_STAKES)[number];
export const PASTIME_ROUTES = ['settle', 'trial'] as const;
export type PastimeRoute = (typeof PASTIME_ROUTES)[number];

/** Which part of a legal name an identity activity changes. */
export const NAME_CHANGES = ['first', 'last', 'both', 'partner', 'former'] as const;
export type NameChange = (typeof NAME_CHANGES)[number];

/** Who can come along: your partner, a friend, or family (and, for a lawsuit, the ex you are suing). */
export const PASTIME_COMPANIONS = ['partner', 'friend', 'family', 'ex'] as const;
export type PastimeCompanionKind = (typeof PASTIME_COMPANIONS)[number];

/** Price tiers of an activity that has them (a surgeon's quality): cheaper means likelier trouble. */
export const PASTIME_QUALITIES = ['budget', 'standard', 'premier'] as const;
export type PastimeQuality = (typeof PASTIME_QUALITIES)[number];

/** The legal ages an activity may need. */
export const PASTIME_LEGAL_AGES = ['drinking', 'gambling', 'driving'] as const;

/**
 * What an activity's effects may do. Nothing here creates money: a money
 * effect, a repayment or dirty money is not allowed (the cost is the only
 * money that moves, through the finance module).
 */
export const PASTIME_EFFECT_TYPES = ['stat', 'memory', 'flag', 'history', 'health', 'legal', 'relationship', 'innerConflict', 'value', 'infidelity', 'crime'] as const;
const pastimeEffectSchema = effectSchema.refine(
  (e) => (PASTIME_EFFECT_TYPES as readonly string[]).includes(e.type),
  `activities may only use these effects: ${PASTIME_EFFECT_TYPES.join(', ')}`,
);

/** A1: what you choose to change in your portrait at the salon or when shopping. */
export const PASTIME_LOOKS = ['hairstyle', 'dye', 'outfit', 'clothing', 'eyewear', 'earrings', 'hat'] as const;
export type PastimeLook = (typeof PASTIME_LOOKS)[number];

/** A1: how a hobby grows. `skill` is the points each outcome adds before repeats shrink it; `talent` is the hidden talent practicing it can bring to light. */
const hobbySchema = z.strictObject({
  talent: idSchema.optional(),
  skill: z.strictObject({
    great: z.int().min(0).max(30),
    good: z.int().min(0).max(30),
    neutral: z.int().min(0).max(30),
    bad: z.int().min(0).max(30),
    backfire: z.int().min(0).max(30),
  }),
});
export type HobbyDef = z.infer<typeof hobbySchema>;

const wordings = z.array(templateSchema).min(2).max(3);

/** A chance inside a tier: the key names an entry in balance/pastimes.yaml chances. */
const pastimeExtraSchema = z.strictObject({
  chance: idSchema,
  /** Only when this holds (conditions about you; the companion is the role `companion`). */
  if: conditionSchema.optional(),
  effects: z.array(pastimeEffectSchema).min(1),
  /** A line added to the outcome when it happens. */
  note: templateSchema.optional(),
});

/**
 * Batch 2b: money that comes in or goes out because of this outcome (loot, a sale, a settlement, court costs).
 * `key` names an entry in balance/risk.yaml amounts (US prices, scaled to your country and city); `share` multiplies it.
 * `earn` pays into savings, `dirty` into dirty money (cash from crime, E6a), `loss` is spent through the finance module.
 */
const pastimeMoneySchema = z.strictObject({
  key: idSchema,
  share: z.number().min(0).max(3).default(1),
  mode: z.enum(['earn', 'dirty', 'loss']).default('earn'),
});

export const pastimeTierSchema = z.strictObject({
  /** Wordings when you go alone (2-3). */
  text: wordings.optional(),
  /** Wordings when someone comes along (2-3); the companion is {companion.name}, {companion.they}... */
  together: wordings.optional(),
  /** Lawsuits: wordings when you settle instead of going to trial (2-3; with the ex you are suing as {companion.name} when one is involved). */
  settle: wordings.optional(),
  money: pastimeMoneySchema.optional(),
  effects: z.array(pastimeEffectSchema).default([]),
  /** What it does between you and the companion (gains shrink with repeats). */
  companion: z.strictObject({ affection: z.int().min(-30).max(30), trust: z.int().min(-30).max(30).default(0) }).optional(),
  extras: z.array(pastimeExtraSchema).default([]),
  /** Follow-up events: if one of these fits and can be cast, it opens after the outcome (with the chance named in `eventChance`, always when absent). */
  events: z.array(idSchema).default([]),
  eventChance: idSchema.optional(),
  /**
   * A drunk drive home (E5): with the chance named here, and only if you own a vehicle, hold a license and are of driving age,
   * the drunk-driving event of the possessions registry opens after the outcome. It comes before any follow-up event.
   */
  drunkDrive: idSchema.optional(),
});
export type PastimeTier = z.infer<typeof pastimeTierSchema>;

export const pastimeSchema = baseDefSchema
  .extend({
    category: z.enum(PASTIME_CATEGORIES),
    /** The button: "Go to the gym". */
    label: z.string().trim().min(1).max(40),
    blurb: z.string().trim().min(1).max(120),
    /** The youngest age. Nightlife, plastic surgery, luxury and love are adults only (the content build checks). */
    minAge: z.int().min(0).max(100),
    /** Also needs the legal age for this where you live now (a city or country may set its own). */
    legalAge: z.enum(PASTIME_LEGAL_AGES).optional(),
    /** Only in these countries or cities (all when absent). */
    countries: z.array(countryIdSchema).min(1).optional(),
    cities: z.array(idSchema).min(1).optional(),
    /** You are there in person: a companion must be in your city or home, and a hospital or venue is in your own city. */
    inPerson: z.boolean(),
    /** Whether someone can come along: not at all, if you like, or it is a night for two (love). */
    companion: z.enum(['none', 'optional', 'required']),
    companionKinds: z.array(z.enum(PASTIME_COMPANIONS)).min(1).optional(),
    /** The price: a key of balance/pastimes.yaml costs (US prices, scaled to the country's price level and your city). */
    cost: idSchema,
    /** The odds of each tier: a key of balance/pastimes.yaml profiles (roll and lawsuit activities). */
    profile: idSchema.optional(),
    /** How it is worked out (roll by default). */
    mechanic: z.enum(PASTIME_MECHANICS).default('roll'),
    /** Gambling: the game, a key of balance/risk.yaml games (its payout table and house edge). */
    game: idSchema.optional(),
    /** Loans: the lender's terms, a key of balance/risk.yaml loans. */
    loan: idSchema.optional(),
    /** Lawsuits: what you have to go on. Each one that holds raises your odds; at least one must hold for the lawsuit to be on offer. The ex you are suing is the role `companion`. */
    evidence: z.array(conditionSchema).min(1).optional(),
    /** Loans: who lends, as it reads in your life history ("the bank", "a loan shark"). */
    lender: z.string().trim().min(1).max(30).optional(),
    /** Identity: which part of your legal name this changes. */
    nameChange: z.enum(NAME_CHANGES).optional(),
    /** It has price tiers (budget, standard, premier): you choose one, and it changes the price and the odds. */
    quality: z.boolean().optional(),
    /** The most times a year. */
    yearlyLimit: z.int().min(1).max(12),
    /**
     * A1: the activity of the Activities tab this is an option of (a key of registries/activities.yaml). Repeats count across all of
     * an activity's options, so the gym's light and hard workouts share their diminishing returns. Absent: it stands alone.
     */
    hub: idSchema.optional(),
    /** A1: salon and shopping. You choose what changes in your portrait (a hairstyle, a dye, an outfit, glasses, earrings, a hat). */
    look: z.enum(PASTIME_LOOKS).optional(),
    /** A1: a hobby. Practicing it grows its skill, and a hidden talent of this kind can come to light. */
    hobby: hobbySchema.optional(),
    /** Other things that must hold (about you; evaluated like an event's requires). */
    requires: conditionSchema.optional(),
    /** Luxury: buying this activity acquires the valuable of this id (the price is the cost). */
    buys: idSchema.optional(),
    tiers: z.strictObject({
      great: pastimeTierSchema.optional(),
      good: pastimeTierSchema,
      neutral: pastimeTierSchema.optional(),
      bad: pastimeTierSchema.optional(),
      backfire: pastimeTierSchema.optional(),
    }),
    /** Why a wording is allowed to say something the checks can't judge (as an event's `justified`). */
    justified: z.string().trim().min(1).max(200).optional(),
  })
  .superRefine((def, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    if ((def.companion === 'none') !== (def.companionKinds === undefined)) issue('companionKinds goes with companion: optional or required (and only with it)');
    const m = def.mechanic;
    if (m === 'roll' && def.profile === undefined) issue('profile is needed (an odds profile of balance/pastimes.yaml)');
    if (m === 'roll' && def.tiers.neutral === undefined) issue('tiers.neutral is needed');
    if ((m === 'gamble') !== (def.game !== undefined)) issue('game goes with mechanic: gamble (and only with it)');
    if ((m === 'loan') !== (def.loan !== undefined)) issue('loan goes with mechanic: loan (and only with it)');
    if ((m === 'loan') !== (def.lender !== undefined)) issue('lender goes with mechanic: loan (and only with it)');
    if ((m === 'lawsuit') !== (def.evidence !== undefined)) issue('evidence goes with mechanic: lawsuit (and only with it)');
    if ((m === 'name') !== (def.nameChange !== undefined)) issue('nameChange goes with mechanic: name (and only with it)');
    if (m === 'lawsuit') {
      if (!def.quality) issue('a lawsuit has lawyer tiers: quality: true');
      for (const t of ['good', 'neutral'] as const) if (def.tiers[t]?.settle === undefined) issue(`tiers.${t}.settle is needed (a lawsuit can be settled)`);
    } else {
      for (const t of OUTCOME_TIERS) if (def.tiers[t]?.settle !== undefined) issue(`tiers.${t}.settle is for lawsuits`);
    }
    if (m === 'gamble' && def.legalAge !== 'gambling') issue('gambling follows the legal gambling age: legalAge: gambling');
    if (def.companion !== 'none' && !def.inPerson && def.mechanic !== 'lawsuit') issue('a companion needs inPerson: true (a lawsuit may be against someone far away)');
    for (const tier of OUTCOME_TIERS) {
      const t = def.tiers[tier];
      if (!t) continue;
      const alone = def.companion !== 'required';
      const together = def.companion !== 'none';
      if (alone && t.text === undefined) issue(`tiers.${tier}.text is needed (you can go alone)`);
      if (!alone && t.text !== undefined) issue(`tiers.${tier}.text is not used (a companion is required): write together`);
      if (together && t.together === undefined) issue(`tiers.${tier}.together is needed (someone can come along)`);
      if (!together && t.together !== undefined) issue(`tiers.${tier}.together is not used (nobody can come along)`);
      if (t.companion && def.companion === 'none') issue(`tiers.${tier}.companion is for an activity someone can join`);
      if (t.settle !== undefined && def.companion === 'required' && t.text !== undefined) issue(`tiers.${tier}.text is not used (a companion is required): write together`);
    }
  });
export type PastimeDef = z.infer<typeof pastimeSchema>;

/** A valuable (src/content/valuables): jewelry, designer goods, art or a boat. The price is the cost of the activity that buys it. */
export const valuableSchema = baseDefSchema.extend({
  /** As it reads in a sentence: "pearl necklace". */
  name: z.string().trim().min(1).max(30),
  blurb: z.string().trim().min(1).max(100),
  class: z.enum(VALUABLE_CLASSES),
});
export type ValuableDef = z.infer<typeof valuableSchema>;

const share = z.number().min(0).max(1);
const weight = z.number().min(0).max(100);

const qualityRow = z.strictObject({ price: z.number().min(0.1).max(10), complication: z.number().min(0).max(20), odds: z.number().min(0.1).max(10) });

/** The activity numbers (src/content/balance/pastimes.yaml). */
export const pastimesBalanceSchema = z.strictObject({
  /** What it costs when someone comes along and you pay for both: the price is multiplied by this. */
  companionCost: z.number().min(1).max(3),
  /** What each activity costs, by key, at US prices. */
  costs: z.record(idSchema, dollarsSchema),
  /** Price tiers: the price, how often it goes wrong (complication chances multiply by it) and how often it goes well (great and good odds multiply by it). */
  quality: z.strictObject({ budget: qualityRow, standard: qualityRow, premier: qualityRow }),
  /** The relative odds of each tier, and the traits that tilt them (value 50 is neutral; a higher one favors the good side). */
  profiles: z.record(
    idSchema,
    z.strictObject({
      great: weight,
      good: weight,
      neutral: weight,
      bad: weight,
      backfire: weight,
      tilt: z.array(z.strictObject({ key: scoreKeySchema, weight: z.number().min(-2).max(2) })).default([]),
    }),
  ),
  /** Chances inside an outcome: a base, curves over your stats or traits that multiply it, and how it changes with repeats and a price tier. */
  chances: z.record(
    idSchema,
    z.strictObject({
      base: share,
      factors: z.array(z.strictObject({ key: scoreKeySchema, curve: curveSchema })).default([]),
      repeat: z.number().min(0).max(5).default(1),
      quality: z.boolean().default(false),
      /** Gambling: multiplied by this when you are chasing a loss. */
      chase: z.number().min(0).max(10).default(1),
      /** Gambling: multiplied by the stake's `addiction` factor (balance/risk.yaml stakes). */
      stake: z.boolean().default(false),
    }),
  ),
  /** The receipts kept for the Activities screen: this many of this year's, newest last. */
  receipts: z.int().min(1).max(50),
});
export type PastimesBalance = z.infer<typeof pastimesBalanceSchema>;


const amountRange = z.strictObject({ min: dollarsSchema, max: dollarsSchema }).refine((r) => r.min <= r.max, 'min must not be greater than max');
const tierWeights = z.strictObject({ great: weight, good: weight, neutral: weight, bad: weight, backfire: weight });

/** One payout of a game: the tier it is shown as, how likely it is, and what the stake is multiplied by (0 loses it). */
const gameOutcomeSchema = z.strictObject({ tier: z.enum(OUTCOME_TIERS), chance: z.number().gt(0).max(1), multiple: z.number().min(0).max(1000) });

/** A lender's terms (balance/risk.yaml loans). Rates and terms by debt kind are in balance/economy.yaml. */
const loanProductSchema = z.strictObject({
  kind: z.enum(['bank', 'payday', 'shark']),
  /** What you borrow: this share of last year's income, between these amounts (US prices, scaled). */
  incomeShare: z.number().min(0).max(5),
  amount: amountRange,
  /** The lender wants this much income last year (US prices, scaled); 0 asks nothing. */
  minIncome: dollarsSchema,
  /** The most entries a counted criminal record can have; a jail entry within the recent years of balance/legal.yaml record counts as `jailCounts` more. */
  maxRecord: z.int().min(0).max(50),
  /** Turned down for this many years after filing for bankruptcy (0: not asked). */
  bankruptcyYears: z.int().min(0).max(50),
  /** Turned down when what you already owe is more than this share of last year's income (0: not asked). */
  maxDebtShare: z.number().min(0).max(20),
  /** The most loans of this kind you can have at once. */
  maxOpen: z.int().min(1).max(10),
  /** The fee paid when the loan is made, as a share of what you borrow. */
  fee: z.number().min(0).max(1),
  /** A loan shark: you need to know someone who lends this way (you are in a crew, have heat, or a crew works in your city). */
  contacts: z.boolean().default(false),
});
export type LoanProduct = z.infer<typeof loanProductSchema>;

/** Risk and legal activities (balance/risk.yaml; Batch 2b). */
export const riskBalanceSchema = z.strictObject({
  /** Crime and the black market: the worse odds of getting caught. Heat, a record and being in a crew multiply the chance of the two bad tiers. */
  exposure: z.strictObject({ heat: z.number().min(0).max(1), record: z.number().min(0).max(5), recordMax: z.int().min(1).max(20), crew: z.number().min(0).max(5) }),
  /** A crew member who works alone: the heat it adds is multiplied by `heat`, and it costs standing in the crew. */
  crew: z.strictObject({ heat: z.number().min(1).max(5), standing: z.int().min(0).max(50) }),
  /** Money that comes in or goes out of an outcome, by key (US prices; a range is rolled, then scaled to your country and city). */
  amounts: z.record(idSchema, amountRange),
  /** Gambling: the payout table of each game. The chances add up to 1 and the house always keeps at least `minEdge` of the stakes on average. */
  games: z.record(
    idSchema,
    z.strictObject({ minEdge: z.number().min(0.005).max(0.9), outcomes: z.array(gameOutcomeSchema).min(2) }).refine((g) => Math.abs(g.outcomes.reduce((s, o) => s + o.chance, 0) - 1) < 1e-9, 'the chances must add up to 1'),
  ),
  /** The stakes: what the base price is multiplied by, and how much likelier a gambling problem is. */
  stakes: z.record(z.enum(PASTIME_STAKES), z.strictObject({ price: z.number().min(0.05).max(100), addiction: z.number().min(0).max(10) })),
  /** Chasing a loss: the stake is this share of the last loss (never less than the stake chosen), at most `cap`; you can borrow up to `borrow` to cover it. */
  chase: z.strictObject({ share: z.number().min(0.1).max(5), cap: dollarsSchema, borrow: dollarsSchema }),
  /** Lawsuits: the route's odds and payout, and what each piece of evidence does for you. */
  lawsuits: z.strictObject({
    /** Each piece of evidence multiplies the good tiers' odds by 1 + step (and divides the bad tiers' by it). */
    evidenceStep: z.number().min(0).max(5),
    routes: z.record(z.enum(PASTIME_ROUTES), z.strictObject({ weights: tierWeights, share: z.number().min(0).max(1) })),
  }),
  /** A fake ID: how likely each use is to be caught (the offense and flag are fixed by the content build). */
  fakeId: z.strictObject({ caught: z.number().min(0).max(1), offense: idSchema }),
  /** A legal name change. */
  identity: z.strictObject({
    /** The youngest age with a parent's agreement (an adult needs nobody's). */
    minorAge: z.int().min(0).max(17),
    /** A parent agrees when they care at least this much about you. */
    consentAffection: z.int().min(0).max(100),
    /** Your closest people's answer: parents when you change your first or last name away from theirs, and a partner when you take their name. */
    reactions: z.strictObject({ parents: z.int().min(-30).max(30), partnerTakes: z.int().min(-30).max(30), partnerOther: z.int().min(-30).max(30) }),
    /** Names kept: the most former names remembered. */
    formerMax: z.int().min(1).max(20),
  }),
  /** Lenders. */
  loans: z.record(idSchema, loanProductSchema),
  /**
   * A loan shark's collectors: the chance each year with a missed payment that they come (an event), and what happens when payments
   * have been missed `settleAfter` years in a row: they settle it their own way. The debt is gone, they take this share of your
   * savings, and you are hurt (these points of health, and of stress and happiness).
   */
  collectors: z.strictObject({
    visit: z.number().min(0).max(1),
    settleAfter: z.int().min(1).max(10),
    /** A loan that has grown past this (US prices) is not waited on: a shark settles it, a bank or payday lender sends it to collections. */
    settleAbove: dollarsSchema,
    savings: z.number().min(0).max(1),
    health: z.int().min(0).max(80),
    stress: z.int().min(0).max(80),
    happiness: z.int().min(0).max(80),
  }),
});
export type RiskBalance = z.infer<typeof riskBalanceSchema>;
