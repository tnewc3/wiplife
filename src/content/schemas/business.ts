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
import { BUSINESS_KINDS, BUSINESS_STYLES, BUSINESS_TRIGGERS, ECONOMY_PHASES, LINE_MODES, MARKETING_LEVELS, ORDER_LEVELS, PAY_LEVELS, PRICE_LEVELS, PRODUCT_TYPES, QUALITY_LEVELS, STAFFING_LEVELS, TRAINING_LEVELS } from './businessIds';

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
  /** B2: scales this style's product unit costs so the default lines reproduce `supplies` (the build checks it). */
  costScale: z.number().min(0.3).max(3).default(1),
});

/**
 * B2: a product line. `share` is the line's weight in the style's spend (a style's default lines are normalised to 1, so
 * they reproduce W3's revenue); `price` is the fair price as a multiple of the style's `spend` (units per customer follow
 * from share ÷ price); `costShare` is the unit cost as a share of the fair price (services: set by their supply pool).
 */
const productSchema = z.strictObject({
  id: idSchema,
  name: z.string().trim().min(1).max(40),
  /** The group for sales words and trends. */
  group: idSchema,
  type: z.enum(PRODUCT_TYPES),
  share: z.number().positive().max(2),
  price: z.number().positive().max(10),
  costShare: z.number().min(0).max(0.95),
  /** The supplier category its cost follows (a service follows its pool's). */
  supplier: idSchema.optional(),
  /** A multiplier on the style's price elasticity. */
  elasticity: z.number().min(0.1).max(3),
  /** How much a crowded city takes of it (0–1.5) and how much the economy moves it (0–1.5). */
  competition: z.number().min(0).max(1.5),
  economy: z.number().min(0).max(1.5),
  /** The trend group its demand follows. */
  trend: idSchema,
  /** The share of unsold stock that spoils in a year (0 for durable goods). */
  perishable: z.number().min(0).max(1),
  /** Styles it is sold in (all when omitted). */
  styles: z.array(z.enum(BUSINESS_STYLES)).min(1).optional(),
  /** Always sold (a menu), on from the start (a shop's starter lines, in file order up to the style's limit), or an optional extra. */
  core: z.boolean().optional(),
  start: z.boolean().optional(),
  /** A service: the supply pool it uses and the supply units per job. */
  pool: z.strictObject({ id: idSchema, units: z.number().positive().max(20) }).optional(),
});
export type ProductDef = z.infer<typeof productSchema>;

/** B2: a supply pool a service business draws on. `cost` is a supply unit's cost as a multiple of the style's spend. */
const poolSchema = z.strictObject({
  id: idSchema,
  name: z.string().trim().min(1).max(40),
  supplier: idSchema,
  cost: z.number().positive().max(2),
  perishable: z.number().min(0).max(1),
});
export type PoolDef = z.infer<typeof poolSchema>;

/**
 * B2: a role a kind of business staffs. `share` is the role's share of the style's `staff` (the non-manager shares sum to 1),
 * `weight` how much a head adds to what a location can serve, `wage` a multiplier on the market wage. The location manager
 * role has `manager: true` and no share: it is an extra person on top of the headcount.
 */
const roleSchema = z.strictObject({
  id: idSchema,
  title: z.string().trim().min(1).max(30),
  share: z.number().min(0).max(1),
  weight: z.number().min(0.5).max(1.5),
  wage: z.number().min(0.5).max(2),
  /** A lead (named: a real person, not crew). */
  lead: z.boolean().optional(),
  manager: z.boolean().optional(),
  /** The trade role: named hires in it hold the licence. */
  licensed: z.boolean().optional(),
  /** The role named staff take by default. */
  craft: z.boolean().optional(),
  min: z.int().min(0).max(10),
  max: z.int().min(1).max(40),
});
export type RoleDef = z.infer<typeof roleSchema>;

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
  /** B2: how its lines are chosen, what it sells, what services draw on, and who works there. */
  lineMode: z.enum(LINE_MODES),
  products: z.array(productSchema).min(3).max(20),
  pools: z.array(poolSchema).max(4).default([]),
  roles: z.array(roleSchema).min(2).max(8),
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
  cities: z.array(idSchema).min(1).max(8),
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
const supplierCategorySchema = z.strictObject({
  label: z.string().trim().min(1).max(40),
  /** How far its price index swings (1 is the usual). */
  volatility: z.number().min(0.2).max(3),
  /** Fictional suppliers: events and the report name one. */
  names: z.array(z.string().trim().min(3).max(40)).min(2).max(8),
});

export const businessRegistrySchema = z.strictObject({
  suppliers: z.record(idSchema, supplierCategorySchema),
  trends: z.record(idSchema, z.strictObject({ label: z.string().trim().min(1).max(40) })),
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
    /** Locations one business can have, and all your businesses together. */
    locations: z.int().min(1).max(40),
    totalLocations: z.int().min(1).max(80),
    /** Franchises one business can have. */
    franchises: z.int().min(1).max(60),
    /** Named people (real people with ties) one location can have, and all your businesses together; the crew are counted, not named. */
    namedPerLocation: z.int().min(1).max(12),
    namedTotal: z.int().min(1).max(100),
    /** Youngest age to start, buy or own one (the independence age at least). */
    minAge: z.int().min(16).max(30),
    /** Longest name you can give it. */
    nameLength: z.int().min(3).max(60),
  }),
  /** Each city's size and wealth for demand (1 is the national average). */
  cities: z.record(idSchema, z.strictObject({ size: z.number().positive().max(5), wealth: z.number().positive().max(5), competition: z.number().min(0.5).max(1.5) })),
  levels: z.strictObject({
    price: z.record(z.enum(PRICE_LEVELS), levelEffect.extend({ mult: z.number().positive().max(3), reputation: z.number().min(-10).max(10) })),
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
    /** B2: every other business you run yourself takes this share of your effort (down to `floor`). */
    attention: z.strictObject({ perExtraBusiness: z.number().min(0).max(0.5), floor: z.number().min(0.1).max(1) }),
    /** B2: whoever runs several locations (you or a general manager) loses this share of effort per further location (down to `floor`). */
    span: z.strictObject({ perLocation: z.number().min(0).max(0.3), floor: z.number().min(0.1).max(1) }),
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
  /** B2: products, orders and stock. */
  products: z.strictObject({
    /** Order = forecast × cover − stock carried in. */
    cover: z.record(z.enum(ORDER_LEVELS), z.number().min(0.3).max(3)),
    /** Lines a shop can carry, by style. */
    maxLines: perStyle(z.int().min(1).max(12)),
    /** Durable stock carried over costs this share of its value a year to hold. */
    holding: z.number().min(0).max(0.5),
    /** Perishables: a floor of waste on what was ordered, as a share of the spoilage rate. */
    wasteFloor: z.number().min(0).max(0.5),
    /** A line losing more than `line` of its demand to an empty shelf costs reputation (`perShare` points per share lost, at most `cap` a year). */
    stockout: z.strictObject({ line: probability, perShare: z.number().min(0).max(100), cap: z.number().min(0).max(20) }),
    /** Customers who cannot get a core line leave without buying this share of their other lines. */
    walkout: probability,
    /** Waste above this share of the cost of goods asks something of you. */
    wasteLine: probability,
    /** Switching a line on costs this share of a year's supplies for it, or a flat floor. */
    switchFee: z.number().min(0).max(1),
    switchFloor: dollarsSchema,
    /** The forecast grows with the location's maturity (the next year's over this one's), at most this much. */
    growthCap: z.number().min(1).max(2),
    /** The build check: default lines reproduce W3's revenue and supplies within this share. */
    parity: z.number().min(0).max(0.2),
  }),
  /** B2: a crowded city takes trade, more from easy-to-get products; quality wins some back. */
  competition: z.strictObject({ weight: z.number().min(0).max(1), edge: z.number().min(0).max(2) }),
  /** B2: the yearly economy. */
  economy: z.strictObject({
    phases: z.record(
      z.enum(ECONOMY_PHASES),
      z.strictObject({
        label: z.string().trim().min(1).max(30),
        /** Multiplies demand (by each line's sensitivity), lifts supplier drift, and scales what banks lend. */
        demand: z.number().min(0.5).max(1.5),
        drift: z.number().min(-0.2).max(0.2),
        bank: z.number().min(0.3).max(1.5),
      }),
    ),
    /** Transition weights from each phase to the next. */
    transitions: z.record(z.enum(ECONOMY_PHASES), z.record(z.enum(ECONOMY_PHASES), z.number().min(0).max(20))),
    start: z.record(z.enum(ECONOMY_PHASES), z.number().min(0).max(20)),
    /** The series restart (from the start weights) every `window` years, so a phase is a pure function of the seed and the year. */
    window: z.int().min(2).max(30),
  }),
  /** B2: supplier price indices. */
  suppliers: z.strictObject({
    volatility: z.number().min(0).max(0.5),
    reversion: probability,
    min: z.number().min(0.3).max(1),
    max: z.number().min(1).max(3),
    /** The share of a supplier move that shows up in the going rate customers pay. */
    passThrough: probability,
    /** A rise this large in one year asks something of you. */
    riseThreshold: z.number().min(0).max(1),
    /** Yearly chance, per category you buy, of a shortage (this share of an order arrives) and of a better deal (this discount, for `deal.years`). */
    shortage: z.strictObject({ chance: probability, supply: probability, years: z.int().min(1).max(5) }),
    deal: z.strictObject({ chance: probability, discount: probability, years: z.int().min(1).max(10) }),
    window: z.int().min(2).max(40),
  }),
  /** B2: trend groups. */
  trends: z.strictObject({ volatility: z.number().min(0).max(0.5), reversion: probability, min: z.number().min(0.3).max(1), max: z.number().min(1).max(3), window: z.int().min(2).max(40) }),
  /** B2: headcount you choose per location and role. */
  headcount: z.strictObject({
    /** A location holds at most this multiple of its style's `staff`. */
    maxMultiple: z.number().min(1).max(5),
    /** Each role counts at most this share over its need. */
    roleCap: z.number().min(1).max(2),
    /** Customers per head above this multiple of the usual wears morale down (points per 0.1 over). */
    workload: z.strictObject({ limit: z.number().min(0.5).max(3), morale: z.number().min(0).max(20) }),
  }),
  /** B2: the crew, counted per location and role. */
  crew: z.strictObject({
    /** Refilling a head costs this share of a year's wage. */
    refill: z.number().min(0).max(1),
    /** Skill of a new head. */
    skill: spread,
    /** Skill training can reach. */
    ceiling: score,
    /** Pull of crew morale on its aim each year. */
    pull: probability,
  }),
  /** B2: training, a yearly decision. */
  training: z.record(z.enum(TRAINING_LEVELS), z.strictObject({ label: z.string().trim().min(1).max(30), share: z.number().min(0).max(0.2), skill: z.number().min(0).max(10), morale: z.number().min(0).max(15) })),
  /** B2: managers of one location. */
  locationManagers: z.strictObject({
    appointFee: z.number().min(0).max(1),
    /** Moving a person between locations: the same city, and another city (a share of a year's wage). */
    transfer: z.strictObject({ sameCity: z.number().min(0).max(1), otherCity: z.number().min(0).max(3), morale: z.number().min(-20).max(0) }),
    /** Willingness to move to another city: base + morale and affection weights; at or above `likely` they go, below `unlikely` they won't. */
    willing: z.strictObject({ base: z.number().min(-100).max(100), morale: z.number().min(0).max(2), affection: z.number().min(0).max(2), ties: z.number().min(0).max(10), likely: z.number().min(0).max(200), unlikely: z.number().min(0).max(200) }),
    /** A bad one drags quality and morale at their location. */
    drag: z.strictObject({ quality: z.number().min(0).max(30), morale: z.number().min(0).max(30), below: score }),
  }),
  /** B2: franchising out. */
  franchise: z.strictObject({
    minYears: z.int().min(1).max(30),
    minLocations: z.int().min(1).max(24),
    minQuality: score,
    minReputation: score,
    /** No loss in this many years. */
    cleanYears: z.int().min(0).max(10),
    /** One-off fee: this multiple of the fit-out of the style in the city, scaled by reputation. */
    feeMultiple: z.number().min(0).max(5),
    /** Royalty rates a franchise can be sold at (a share of its revenue), and the brand's support cost (a share of its nominal revenue). */
    royalties: z.array(z.number().min(0.01).max(0.3)).min(1).max(5),
    support: z.number().min(0).max(0.2),
    /** The franchisee's skill when not someone you know. */
    skill: spread,
    /** Brand risk (0–100): yearly drift per skill point under 50, what a franchisee's failure adds, and what risk above `line` costs. */
    risk: z.strictObject({ perSkill: z.number().min(0).max(2), recovery: z.number().min(0).max(20), failure: z.number().min(0).max(50), line: score, reputation: z.number().min(0).max(10), quality: z.number().min(0).max(10) }),
    /** A franchisee losing money this many years in a row leaves. */
    exitYears: z.int().min(1).max(5),
    /** The value of the net royalty, as a multiple. */
    valueMultiple: z.number().min(0).max(10),
    /** Yearly chance a franchise is asked about, when eligible. */
    inquiry: probability,
    /** Franchisees need to be at least this old. */
    minAge: z.int().min(18).max(50),
  }),
  quality: z.strictObject({
    /** The share of last year's quality kept (the rest is this year's aim). */
    carry: probability,
    /** How far the owner's skill lifts the aim per point above 50, at full effort. */
    skill: z.number().min(0).max(1),
    /** Staff morale lifts or drags the aim: per point above or below 55. */
    morale: z.number().min(0).max(1),
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
    /** B2: yearly chance a key employee asks for something, where there is one. */
    staffRequest: probability,
    /** B2: yearly chance of something happening in the market, across your places, and among the people. */
    market: probability,
    places: probability,
    people: probability,
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
    z.enum(['started', 'bought', 'sold', 'closed', 'failed', 'inherited', 'expanded', 'managerHired', 'cofounder', 'investorPaid', 'lostMoney', 'franchised', 'franchiseEnded', 'transferred', 'locationManager']),
    z.strictObject({ importance: z.union([z.literal(1), z.literal(2), z.literal(3)]), variants: z.array(z.string().trim().min(1).max(300)).min(1) }),
  ),
  /** The yearly report in words: how customers went, how money went, how the staff are. */
  report: z.strictObject({
    customers: z.strictObject({ boom: phrase, up: phrase, steady: phrase, down: phrase, slump: phrase }),
    money: z.strictObject({ strong: phrase, profit: phrase, thin: phrase, loss: phrase, deep: phrase }),
    staff: z.strictObject({ happy: phrase, fine: phrase, tense: phrase, ready_to_quit: phrase }),
    quality: z.strictObject({ high: phrase, fine: phrase, slipping: phrase }),
    notes: z.strictObject({
      unlicensed: phrase,
      understaffed: phrase,
      newLocation: phrase,
      quit: phrase,
      managerSlip: phrase,
      rival: phrase,
      buzz: phrase,
      skimmed: phrase,
      // B2
      ranOut: phrase,
      leftover: phrase,
      spoiled: phrase,
      supplierUp: phrase,
      supplierDown: phrase,
      shortage: phrase,
      deal: phrase,
      economyBoom: phrase,
      economySlowdown: phrase,
      economyRecession: phrase,
      turnover: phrase,
      overworked: phrase,
      brandRisk: phrase,
      royalties: phrase,
    }),
    /** B2: words for the economy, by phase, and for a supplier's price moving. */
    economy: z.strictObject({ boom: phrase, steady: phrase, slowdown: phrase, recession: phrase }),
    suppliers: z.strictObject({ up: phrase, down: phrase, steady: phrase }),
  }),
});
export type BusinessText = z.infer<typeof businessTextSchema>;
