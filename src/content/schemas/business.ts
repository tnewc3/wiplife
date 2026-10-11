/**
 * Businesses (W3, docs/expansion.md): the six kinds of business as content
 * (src/content/businesses), the fictional chains for sale (src/content/chains),
 * the registry of the events the business step queues and the traits a listing
 * can have (registries/business.yaml), every number (balance/business.yaml) and
 * the words the step and the report use (text/business.yaml). The engine decides
 * what is true; the content says it. All brands, chains and shops are fictional.
 */
import { z } from 'zod';
import { baseDefSchema, dollarsSchema, idSchema, scoreKeySchema } from './common';
import { BUSINESS_KINDS, BUSINESS_STYLES, BUSINESS_TRIGGERS, MARKETING_LEVELS, PAY_LEVELS, PRICE_LEVELS, QUALITY_LEVELS, STAFFING_LEVELS } from './businessIds';

export * from './businessIds';

const probability = z.number().min(0).max(1);
const score = z.number().min(0).max(100);
const phrase = z.string().trim().min(1).max(120);
const perStyle = <T extends z.ZodType>(value: T) => z.strictObject({ budget: value, standard: value, premium: value });
const perWealth = <T extends z.ZodType>(value: T) => z.strictObject({ poor: value, working: value, middle: value, affluent: value, rich: value });
const spread = z.strictObject({ mean: z.number().min(0).max(100), sd: z.number().min(0).max(50) });

/** What one style of a kind of business costs and earns, at the national average (scaled by the city). */
const styleSchema = z.strictObject({
  /** As it reads on the screen ("Coffee counter"). */
  label: z.string().trim().min(1).max(40),
  blurb: phrase,
  /** Fitting out one location (equipment, the lease deposit, the first stock), before the city's cost of living. */
  startup: dollarsSchema.positive(),
  /** Yearly rent of one location. */
  rent: dollarsSchema,
  /** People one location needs to run at its usual size. */
  staff: z.int().min(1).max(30),
  /** Customers (visits, jobs) one fully staffed location can serve in a year. */
  capacity: z.int().min(1),
  /** Customers one location draws in a year in a city that fits it, with a fair name and fair prices. */
  demand: z.int().min(1),
  /** What a customer spends at fair prices. */
  spend: z.number().positive().max(100000),
  /** Share of revenue that goes on supplies (stock, ingredients, parts). */
  supplies: z.number().min(0).max(0.9),
  /** Yearly pay of one worker, before the city's salary multiplier. */
  wage: dollarsSchema.positive(),
  /** The quality a well-run place of this style starts around (0–100). */
  quality: score,
  /** How much a change in price moves demand (higher: shoppers are more sensitive). */
  elasticity: z.number().min(0).max(4),
});

/** A kind of business (one file in src/content/businesses). */
export const businessSchema = baseDefSchema.extend({
  /** As a noun on the screen ("Café"). */
  name: z.string().trim().min(1).max(30),
  /** As it reads in a sentence ("café", "plumbing business"). */
  noun: z.string().trim().min(1).max(30),
  kind: z.enum(BUSINESS_KINDS),
  blurb: phrase,
  /** The job track its staff work in (src/content/jobs), if one fits; they take it as their occupation. */
  occupation: idSchema.optional(),
  /** What a worker is called ("barista"). */
  staffTitle: z.string().trim().min(1).max(30),
  /** What a manager is called. */
  managerTitle: z.string().trim().min(1).max(30),
  /** A trade licence the business cannot run without: held by you (a trade_license credential for `trade`, or work in the job `job`, whose holders are licensed) or by someone on staff (who works in that job). */
  license: z.strictObject({ trade: idSchema, job: idSchema, title: z.string().trim().min(1).max(30) }).optional(),
  /** What running it well takes of you: weight × (value − 50) points each. */
  skills: z.array(z.strictObject({ key: scoreKeySchema, weight: z.number().min(-1).max(1) })).min(1),
  styles: perStyle(styleSchema),
  /** How well each style suits a city: demand is size^size × wealth^wealth (balance/business.yaml cities gives each city's). */
  fit: perStyle(z.strictObject({ size: z.number().min(-1).max(2), wealth: z.number().min(-2).max(3) })),
  /** Fictional names for the ones for sale, and for a name suggestion. */
  names: z.array(z.string().trim().min(3).max(40)).min(8).max(40),
});
export type BusinessDef = z.infer<typeof businessSchema>;

/** A fictional chain for sale (one file in src/content/chains). */
export const chainSchema = baseDefSchema.extend({
  name: z.string().trim().min(3).max(40),
  /** The kind of business it runs. */
  type: idSchema,
  style: z.enum(BUSINESS_STYLES),
  blurb: phrase,
  /** How many locations it has when for sale. */
  locations: z.strictObject({ min: z.int().min(2).max(12), max: z.int().min(2).max(12) }),
  /** The cities it has locations in, in the order it opens them; it is for sale in the first. */
  cities: z.array(idSchema).min(1).max(5),
  /** Its reputation when for sale (0–100). */
  reputation: spread,
});
export type ChainDef = z.infer<typeof chainSchema>;

/** A trait a listing can have: what it says and what it does to the business. */
const listingTraitSchema = z.strictObject({
  text: phrase,
  /** Added to the business's quality and reputation when it is bought. */
  quality: z.number().min(-30).max(30),
  reputation: z.number().min(-30).max(30),
  /** Multiplies its earnings in the listing (the price follows). */
  earnings: z.number().min(0.5).max(1.5),
  weight: z.number().min(0).max(20),
});

/** Registry: the events the business step queues, and the traits listings are made from. Every event listed is followUpOnly. */
export const businessRegistrySchema = z.strictObject({
  triggers: z.strictObject(Object.fromEntries(BUSINESS_TRIGGERS.map((t) => [t, z.strictObject({ events: z.array(idSchema).min(1) })])) as Record<(typeof BUSINESS_TRIGGERS)[number], z.ZodObject<{ events: z.ZodArray<z.ZodString> }>>),
  listingTraits: z.record(idSchema, listingTraitSchema),
});
export type BusinessRegistry = z.infer<typeof businessRegistrySchema>;

const levelEffect = z.strictObject({ label: z.string().trim().min(1).max(30) });

/** Every number the businesses use (src/content/balance/business.yaml). */
export const businessBalanceSchema = z.strictObject({
  limits: z.strictObject({
    /** The most businesses you can own at once, and the most locations one can have. */
    businesses: z.int().min(1).max(10),
    locations: z.int().min(1).max(20),
    /** Named staff (people you know) one business can have, besides a manager and a co-founder. */
    namedStaff: z.int().min(1).max(12),
    /** Youngest age to start, buy or own one (the independence age at least). */
    minAge: z.int().min(16).max(30),
    /** Longest name you can give it. */
    nameLength: z.int().min(3).max(60),
  }),
  /** Each city's size and wealth for demand (1 is the national average). */
  cities: z.record(idSchema, z.strictObject({ size: z.number().positive().max(5), wealth: z.number().positive().max(5), competition: z.number().min(0.5).max(1.5) })),
  levels: z.strictObject({
    price: z.record(z.enum(PRICE_LEVELS), levelEffect.extend({ mult: z.number().positive().max(3) })),
    marketing: z.record(z.enum(MARKETING_LEVELS), levelEffect.extend({ share: z.number().min(0).max(0.3), boost: z.number().min(0).max(1) })),
    quality: z.record(z.enum(QUALITY_LEVELS), levelEffect.extend({ share: z.number().min(0).max(0.3), aim: z.number().min(0).max(40) })),
    pay: z.record(z.enum(PAY_LEVELS), levelEffect.extend({ mult: z.number().positive().max(3), morale: z.number().min(-30).max(30) })),
    staffing: z.record(z.enum(STAFFING_LEVELS), levelEffect.extend({ mult: z.number().positive().max(3), morale: z.number().min(-30).max(30), quality: z.number().min(-30).max(30) })),
  }),
  demand: z.strictObject({
    /** Reputation: demand is (base + slope × reputation ÷ 100). */
    reputation: z.strictObject({ base: z.number().min(0).max(2), slope: z.number().min(0).max(3) }),
    quality: z.strictObject({ base: z.number().min(0).max(2), slope: z.number().min(0).max(2) }),
    /** The share of its full demand a location draws in its 1st, 2nd, 3rd... year (the last repeats). */
    maturity: z.array(z.number().min(0.1).max(1.2)).min(1).max(6),
    /** Each further location of yours in one city takes this share of the demand of the one before. */
    saturation: z.number().min(0.3).max(1),
    /** A year's luck: random swing in demand (a standard deviation), and how far good luck (the hidden stat) leans it. */
    season: z.strictObject({ sd: z.number().min(0).max(0.5), luck: z.number().min(0).max(0.3) }),
    /** The owner's skill (or the manager's) moves demand by this much per point above 50, at full effort. */
    skill: z.number().min(0).max(0.02),
    /** Attention: demand is `floor` plus the rest times the effort put in (an owner who is away, or a manager, draws fewer customers than one who is there). */
    attention: z.strictObject({ floor: z.number().min(0).max(1) }),
    /** A business with nobody licensed (where a licence is needed) serves no one. */
    unlicensed: z.number().min(0).max(1),
  }),
  costs: z.strictObject({
    /** Insurance, utilities, bookkeeping: a share of revenue plus a fixed amount per location (before the city's cost of living). */
    overheadShare: z.number().min(0).max(0.5),
    overheadFixed: dollarsSchema,
    /** The share of the usual supplies spent when the owner is unskilled (more waste) or skilled (less): per point of skill above 50. */
    waste: z.number().min(0).max(0.01),
    /** Crew (unnamed workers) are paid the market wage times this. */
    crewWage: z.number().min(0.5).max(2),
    /** A licensed worker is paid this much more than a plain worker. */
    licensedWage: z.number().min(1).max(3),
    /** A manager is paid this multiple of a worker's wage. */
    managerWage: z.number().min(1).max(5),
    /** Fit-out wears out: the share of its value lost each year. */
    depreciation: z.number().min(0).max(0.5),
    /** What a new location costs, as a share of a fresh start of the same style. */
    newLocation: z.number().min(0.2).max(2),
  }),
  staff: z.strictObject({
    /** The skill of someone hired (0–100), and how much their smarts and discipline lift it. */
    skill: spread,
    smartsLift: z.number().min(0).max(1),
    /** Pay moves with skill: wage = market × (1 + slope × (skill − 50)). */
    skillWage: z.number().min(0).max(0.02),
    /** Hiring costs this share of a year's wage; letting someone go costs this much severance. */
    hiring: z.number().min(0).max(1),
    severance: z.number().min(0).max(1),
    /** Quality: each point of average named-staff skill above 50 moves the aim by this much. */
    skillQuality: z.number().min(0).max(1),
    /** The age range of someone newly hired. */
    ages: z.strictObject({ min: z.int().min(16).max(50), max: z.int().min(18).max(75) }),
    /** The affection and trust a new hire starts with. */
    affection: spread,
    trust: spread,
    morale: z.strictObject({
      /** A new hire's morale, and the level morale settles at with fair pay and normal staffing. */
      start: score,
      base: score,
      /** The share of the gap to its aim closed each year. */
      pull: probability,
      /** Per point your kindness is above 50. */
      kindness: z.number().min(0).max(0.5),
      /** Yearly bounce from a bad or good year for the business (loss: below, profit: above). */
      loss: z.number().min(-30).max(0),
      profit: z.number().min(0).max(30),
      noise: z.number().min(0).max(20),
      /** Staff you know well (affection) stay: per point of affection above 50. */
      bond: z.number().min(0).max(0.5),
      /** Morale added for someone you gave work to when they needed it, and for someone you were there for when family needed them. */
      loyalty: z.strictObject({ work: z.number().min(0).max(20), family: z.number().min(0).max(20) }),
    }),
    /** The yearly chance a named worker quits, by their morale. */
    quit: z.array(z.strictObject({ at: z.number(), x: z.number().min(0).max(1) })).min(2),
    /** How much a raise lifts someone's pay (a share of the market wage) and their morale. */
    raise: z.strictObject({ pay: z.number().min(0).max(0.5), morale: z.number().min(0).max(30) }),
    /** The people you hire from: friends, relatives and acquaintances your age or younger who are free to work. */
    pool: z.strictObject({ minAffection: score, kinds: z.array(z.string()).min(1) }),
  }),
  owner: z.strictObject({
    /** The effort you put in: running it yourself full-time, with a job on the side, from another city. */
    effort: z.strictObject({ self: z.number().min(0).max(1.5), job: z.number().min(0).max(1.5), away: z.number().min(0).max(1.5) }),
    /** Years of experience owning this kind of business add this much skill each (up to the cap). */
    experience: z.strictObject({ perYear: z.number().min(0).max(5), cap: z.number().min(0).max(30) }),
    /** Running it yourself while holding a job pulls on your job performance by this many points. */
    jobDrag: z.number().min(0).max(30),
    /** Stress from running it: this many points a year at full effort, more in a loss. */
    stress: z.strictObject({ run: z.number().min(0).max(10), loss: z.number().min(0).max(10), limit: score }),
  }),
  manager: z.strictObject({
    /** The skill of a manager you hire. */
    skill: spread,
    /** The honesty of a manager (0–100); below the line they may skim. */
    honesty: spread,
    honestyLine: score,
    /** The yearly chance a dishonest manager skims, and the share of profit they take. */
    skimChance: probability,
    skim: z.number().min(0).max(0.5),
    /** A manager's effort: effort = base + slope × (skill − 50) ÷ 100. */
    effort: z.strictObject({ base: z.number().min(0).max(1.5), slope: z.number().min(0).max(2), min: z.number().min(0).max(1), max: z.number().min(0).max(1.5) }),
    /** A manager who is not well liked (affection with you) neglects the place; below this affection. */
    neglectBelow: score,
  }),
  quality: z.strictObject({
    /** The share of last year's quality kept (the rest is this year's aim). */
    carry: probability,
    /** How far the owner's skill lifts the aim per point above 50, at full effort. */
    skill: z.number().min(0).max(1),
    noise: z.number().min(0).max(20),
    /** Lean staffing and an understaffed place drag quality; this much per share short of the need. */
    shortfall: z.number().min(0).max(100),
  }),
  reputation: z.strictObject({
    start: score,
    /** The share of the gap between reputation and quality closed each year. */
    pull: probability,
    noise: z.number().min(0).max(20),
  }),
  cash: z.strictObject({
    /** The business keeps a reserve of this share of a year's costs before it pays out profit. */
    reserve: z.number().min(0).max(1),
    /** A new business starts with working capital of this share of a year's costs. */
    starting: z.number().min(0).max(1),
  }),
  failure: z.strictObject({
    /** The most you can borrow to cover a loss: this multiple of last year's income, plus a floor, less what you owe already. */
    creditIncomeMultiple: z.number().min(0).max(10),
    creditFloor: dollarsSchema,
    /** Of an unpaid shortfall at failure, the share you guaranteed (it becomes a debt of yours). */
    guarantee: probability,
    /** What the fit-out and stock sell for when a business is closed or fails, as a share of their value. */
    liquidation: probability,
    /** Years of losses in a row after which near-failure events begin. */
    nearYears: z.int().min(1).max(5),
    /** Cash below this share of a year's costs counts as near failure. */
    nearCash: z.number().min(0).max(1),
  }),
  funding: z.strictObject({
    loan: z.strictObject({
      rate: z.number().min(0).max(0.5),
      termYears: z.int().min(1).max(30),
      /** The most it lends, as a share of what is needed. */
      maxShare: probability,
      /** You must put in at least this share yourself. */
      minOwn: probability,
      /** It lends at most this multiple of your yearly income, less what you owe already. */
      incomeMultiple: z.number().min(0).max(20),
      /** Income counts at least this much (a first-time owner with a plan). */
      incomeFloor: dollarsSchema,
      /** No loan within this many years of bankruptcy, or with a payment missed. */
      bankruptcyYears: z.int().min(0).max(20),
      /** A trade licence, a degree or a year of experience in the kind of work counts as a plan: the multiple rises by this. */
      planBonus: z.number().min(0).max(10),
      /** A rate surcharge per missed payment on any debt. */
      missedSurcharge: z.number().min(0).max(0.2),
    }),
    investors: z.strictObject({
      /** The most of the business investors can own together, in percent. */
      maxTotal: z.int().min(1).max(90),
      /** The business is valued at this multiple of the money needed when investors buy in. */
      premoney: z.number().min(1).max(5),
      minAffection: score,
      /** What someone can put in, by how well off they are, scaled by how much they like you (affection ÷ 100). */
      capacity: perWealth(dollarsSchema),
      /** The most people who can invest in one business. */
      max: z.int().min(1).max(5),
    }),
    cofounder: z.strictObject({
      /** The shares (percent) a co-founder can ask. */
      shares: z.array(z.int().min(5).max(60)).min(1).max(5),
      minAffection: score,
      minAge: z.int().min(18).max(40),
      /** The share of the money needed a co-founder puts in, per percent of ownership. */
      cashPerShare: z.number().min(0).max(2),
      /** The skill they bring (0–100). */
      skill: spread,
    }),
    /** Anyone investing or co-founding must be living, an adult and in your life. */
    minAge: z.int().min(18).max(40),
  }),
  market: z.strictObject({
    /** The listings of a city are made new every this many years. */
    refreshYears: z.int().min(1).max(10),
    /** Established businesses for sale in a city, and the chance that one of them is of each kind. */
    listings: z.strictObject({ min: z.int().min(1).max(10), max: z.int().min(1).max(12) }),
    /** The years an established business has been running. */
    ages: z.strictObject({ min: z.int().min(1).max(40), max: z.int().min(1).max(60) }),
    /** The price is this multiple of a typical year's profit, plus the fit-out at this share of its cost, plus cash. */
    multiple: z.number().min(0.5).max(10),
    assetShare: probability,
    /** A chain's price per location adds this multiple of its profit; chains are for sale in a city this often. */
    chainChance: probability,
    chainMultiple: z.number().min(0.5).max(10),
    /** Reputation of an established business for sale. */
    reputation: spread,
    quality: spread,
    /** What you get selling: this share of the value (a quick sale), less a broker's fee. */
    sale: z.strictObject({ share: probability, broker: probability }),
    /** The least a business can sell for: its fit-out at this share, plus cash. */
    floorShare: probability,
    /** A business sells for no more than this multiple of the best price its profit allows... (prevents a runaway) */
    maxMultiple: z.number().min(1).max(20),
    /** Years of profit counted in a valuation. */
    history: z.int().min(1).max(5),
  }),
  events: z.strictObject({
    /** Yearly chance of each follow-up trigger, where the situation allows it. */
    expansion: probability,
    manager: probability,
    cofounder: probability,
    license: probability,
    /** Years between follow-ups of one kind. */
    coolOff: z.int().min(1).max(20),
    /** A business needs this many years before an expansion offer, and this much profit (a share of its cost to start). */
    expansionYears: z.int().min(1).max(10),
    expansionProfit: z.number().min(0).max(5),
  }),
  /** The reputation points your standing in the city gains each year per business that does well; and loses when one fails. */
  reputationEffect: z.strictObject({ perYear: z.number().min(0).max(2), failure: z.number().min(-20).max(0), cap: z.number().min(0).max(5) }),
  /** Net worth counts a business at this share of its value. */
  netWorthShare: probability,
  /** Stat pulls on the owner. */
  happiness: z.strictObject({ profit: z.number().min(0).max(3), loss: z.number().min(-5).max(0), limit: score }),
});
export type BusinessBalance = z.infer<typeof businessBalanceSchema>;

/** Lines of text: history entries the step writes, and the words the yearly report uses. */
export const businessTextSchema = z.strictObject({
  history: z.record(
    z.enum(['started', 'bought', 'sold', 'closed', 'failed', 'inherited', 'expanded', 'managerHired', 'cofounder', 'investorPaid', 'lostMoney']),
    z.strictObject({ importance: z.union([z.literal(1), z.literal(2), z.literal(3)]), variants: z.array(z.string().trim().min(1).max(300)).min(1) }),
  ),
  /** The yearly report in words: how customers went, how money went, how the staff are. */
  report: z.strictObject({
    customers: z.strictObject({ boom: phrase, up: phrase, steady: phrase, down: phrase, slump: phrase }),
    money: z.strictObject({ strong: phrase, profit: phrase, thin: phrase, loss: phrase, deep: phrase }),
    staff: z.strictObject({ happy: phrase, fine: phrase, tense: phrase, ready_to_quit: phrase }),
    quality: z.strictObject({ high: phrase, fine: phrase, slipping: phrase }),
    notes: z.strictObject({ unlicensed: phrase, understaffed: phrase, newLocation: phrase, quit: phrase, managerSlip: phrase, rival: phrase, buzz: phrase, skimmed: phrase }),
  }),
});
export type BusinessText = z.infer<typeof businessTextSchema>;
