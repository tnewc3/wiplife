/**
 * Organized crime (O1, docs/careers-crime-and-ui.md): the four kinds of criminal organization (street gangs, mafia
 * families, cartels, motorcycle clubs) with their ranks, initiation, jobs and codes (src/content/orgKinds), the
 * member jobs a leader assigns (src/content/orgJobs), the parts fictional organizations are named from
 * (registries/orgs.yaml), every number (balance/orgs.yaml) and the words the yearly recap uses (text/orgs.yaml).
 * Neighborhoods are part of each city (cities/*.yaml).
 *
 * Story and consequences only: odds, takes, heat and fallout. Nothing here, and nothing in an event, says how to
 * do anything. Every organization, club and name is made up and says nothing about race, religion or background.
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { baseDefSchema, idSchema } from './common';
import { jobSizeSchema, KIND_RANKS, orgKindSchema } from './crime';

const probability = z.number().min(0).max(1);
const positive = z.number().positive().max(10_000_000);
const spread = z.strictObject({ mean: z.number().min(0).max(100), sd: z.number().min(0).max(50) });
const range = z.strictObject({ min: z.int().min(0).max(100), max: z.int().min(0).max(100) }).refine((r) => r.min <= r.max, 'min must not be greater than max');

/** What a member job does when it is assigned. */
export const ORG_JOB_EFFECTS = ['earn', 'supply', 'protect', 'launder', 'recruit', 'lie_low'] as const;
export type OrgJobEffect = (typeof ORG_JOB_EFFECTS)[number];
export const DANGERS = ['low', 'medium', 'high'] as const;
export type Danger = (typeof DANGERS)[number];

/** A code of an organization: what it asks, and the standing it costs you when you break it (checked each year). */
export const CODE_CHECKS = ['heat', 'arrest', 'idle'] as const;
const codeSchema = z.strictObject({
  id: idSchema,
  text: z.string().trim().min(8).max(160),
  check: z.enum(CODE_CHECKS),
  /** For heat: the heat above which the code is broken. */
  over: z.int().min(1).max(100).optional(),
  standing: z.int().min(1).max(40),
});
export type OrgCode = z.infer<typeof codeSchema>;

export const orgKindDefSchema = baseDefSchema
  .extend({
    id: orgKindSchema,
    name: z.string().trim().min(3).max(30),
    /** What its members call it in a sentence ("gang"). */
    noun: z.string().trim().min(2).max(20),
    blurb: z.string().trim().min(10).max(200),
    /** Generic rank titles, lowest first (a named organization can use its own). */
    ranks: z.array(z.string().trim().min(2).max(30)).min(4).max(5),
    /** Which of balance/crime.yaml's five rank tiers each rank pays and asks like (1 to 5, rising, ending at 5). */
    tiers: z.array(z.int().min(1).max(5)).min(4).max(5),
    /** The rank that is earned by passing an initiation (an event): what it is called and what it is about. */
    initiation: z.strictObject({ rank: z.int().min(2).max(5), name: z.string().trim().min(3).max(40), blurb: z.string().trim().min(10).max(200) }),
    /** The member jobs this kind does (src/content/orgJobs). */
    jobs: z.array(idSchema).min(3),
    codes: z.array(codeSchema).min(1).max(4),
    /** Cartels supply drugs (D1) to dealers and to gangs and clubs. */
    supplies: z.boolean().optional(),
    /** Gangs and clubs buy their drugs from a cartel. */
    buys: z.boolean().optional(),
  })
  .refine((k) => k.ranks.length === KIND_RANKS[k.id], 'ranks must have the number of ranks the kind has (street gang 4, the others 5)')
  .refine((k) => k.tiers.length === k.ranks.length && k.tiers.at(-1) === 5 && k.tiers.every((t, i) => i === 0 || t > k.tiers[i - 1]!), 'tiers: one per rank, rising, ending at 5')
  .refine((k) => k.initiation.rank <= k.ranks.length - 1, 'initiation.rank must be below the top rank');
export type OrgKindDef = z.infer<typeof orgKindDefSchema>;

/** A job a leader can give a member for the year (src/content/orgJobs). */
export const orgJobSchema = baseDefSchema.extend({
  name: z.string().trim().min(3).max(30),
  blurb: z.string().trim().min(10).max(120),
  kinds: z.array(orgKindSchema).min(1),
  effect: z.enum(ORG_JOB_EFFECTS),
  /** How big the take is (earn and supply). */
  size: jobSizeSchema.optional(),
  danger: z.enum(DANGERS),
  /** Needs a neighborhood your organization holds (protect, collect). */
  needsHood: z.boolean().optional(),
  /** Sells or moves drugs (D1): it pays more with a supplier. */
  drug: z.boolean().optional(),
  /** The lowest rank (member's rank) that gets it. */
  minRank: z.int().min(1).max(4).optional(),
  /** The recap's lines: {member} did well; {member} was caught or hurt. {amount} is the take. */
  done: z.string().trim().min(10).max(200),
  bust: z.string().trim().min(10).max(200),
});
export type OrgJobDef = z.infer<typeof orgJobSchema>;

/** A neighborhood of a city: its income value (1 to 5) and how much police attention it draws (0 to 100). */
export const neighborhoodSchema = z.strictObject({
  id: idSchema,
  name: z.string().trim().min(3).max(40),
  income: z.int().min(1).max(5),
  attention: z.int().min(0).max(100),
});
export type Neighborhood = z.infer<typeof neighborhoodSchema>;

const nameParts = z.strictObject({
  patterns: z.array(z.string().trim().min(5).max(40)).min(1),
  first: z.array(z.string().trim().min(2).max(20)).min(4),
  second: z.array(z.string().trim().min(2).max(20)).min(4),
});

/** Parts fictional organizations are named from, by kind (registries/orgs.yaml). {a} and {b} are the two parts. */
export const orgsRegistrySchema = z.strictObject({
  names: z.strictObject({ street_gang: nameParts, mafia: nameParts, cartel: nameParts, motorcycle_club: nameParts }),
});
export type OrgsRegistry = z.infer<typeof orgsRegistrySchema>;

const jobOdds = z.strictObject({ arrest: probability, injury: probability, killed: probability });

export const orgsBalanceSchema = z.strictObject({
  world: z.strictObject({
    /** Organizations generated for a city (fictional names), besides the named crews that work there. */
    generated: range,
    /** How likely each kind is to be the next one generated. */
    kindWeights: z.strictObject({ street_gang: positive, mafia: positive, cartel: positive, motorcycle_club: positive }),
    strength: spread,
    /** Neighborhoods each organization starts with, by kind (and the share of a city's neighborhoods that start unheld). */
    startHoods: z.strictObject({ street_gang: z.int().min(0).max(3), mafia: z.int().min(0).max(3), cartel: z.int().min(0).max(3), motorcycle_club: z.int().min(0).max(3) }),
    unheld: probability,
    /** How an organization feels about you at first (-100 to 100), and how its strength drifts each year. */
    attitude: z.strictObject({ mean: z.number().min(-100).max(100), sd: z.number().min(0).max(50) }),
    drift: z.number().min(0).max(30),
  }),
  roster: z.strictObject({
    skill: spread,
    loyalty: spread,
    /** The most members, by kind (people you know in it). */
    cap: z.strictObject({ street_gang: z.int().min(3).max(30), mafia: z.int().min(3).max(30), cartel: z.int().min(3).max(30), motorcycle_club: z.int().min(3).max(30) }),
    /** A member's skill grows by this a year they work, and their loyalty falls this much a year with no job. */
    grow: z.number().min(0).max(10),
    idleLoyalty: z.number().min(0).max(30),
    /** Ranks a member can hold are 1 up to the rank below yours. */
    recruitSkill: spread,
  }),
  jobs: z.strictObject({
    /** The chance a job succeeds: base, plus per point of skill and loyalty, minus per point of the member's own heat. */
    success: z.strictObject({ base: probability, skill: z.number().min(0).max(0.02), loyalty: z.number().min(0).max(0.02), heat: z.number().min(0).max(0.02), min: probability, max: probability }),
    /** The odds of what goes wrong on a job, by danger; they rise with the member's heat and with an open war. */
    danger: z.strictObject({ low: jobOdds, medium: jobOdds, high: jobOdds }),
    heatScale: z.number().min(0).max(5),
    warScale: z.number().min(0).max(5),
    /** A failed job pays this share. */
    failShare: probability,
    /** Without a supplier, a drug job pays this share. */
    noSupplier: probability,
    /** Heat a job adds to the organization (and to you as its leader), by size share of the E6a size heat. */
    leaderHeat: z.number().min(0).max(1),
    /** A member's heat: gained on a job (by danger), lost each year. */
    memberHeat: z.strictObject({ low: z.number().min(0).max(50), medium: z.number().min(0).max(50), high: z.number().min(0).max(50), decay: z.number().min(0).max(50) }),
    /** Lying low: the heat it takes off you and the member. */
    lieLow: z.strictObject({ you: z.number().min(0).max(50), member: z.number().min(0).max(50) }),
    /** Laundering: the share of a launder job's dirty money (the take of its size) that reaches your savings through the ledger, and the share it keeps. */
    launder: z.strictObject({ keep: probability }),
    recruit: z.strictObject({ chance: probability, loyalty: z.number().min(0).max(50) }),
    /** Default job for a member without one (by kind it falls back to the first earn job of the kind). */
    unassignedLoyalty: z.number().min(0).max(30),
    /** Your standing as a leader: gained for each job that works, lost for each that goes wrong (up to this much a year). */
    standing: z.strictObject({ done: z.number().min(0).max(20), bust: z.number().min(0).max(20), max: z.number().min(0).max(50) }),
  }),
  /** Your cut: the share of a job's take you keep, and what members feel about it (loyalty each year). */
  cut: z.strictObject({
    low: z.strictObject({ keep: probability, loyalty: z.number().min(-30).max(30) }),
    fair: z.strictObject({ keep: probability, loyalty: z.number().min(-30).max(30) }),
    high: z.strictObject({ keep: probability, loyalty: z.number().min(-30).max(30) }),
  }),
  territory: z.strictObject({
    /** What a neighborhood pays the organization a year by its income value 1 to 5 (dollars at a city pay level of 1). */
    income: z.array(positive).length(5),
    /** The share of that reaching you as leader, and the heat each held neighborhood adds per 10 points of its attention. */
    leaderShare: probability,
    heatPer10: z.number().min(0).max(10),
    /** Strength each held neighborhood adds to its owner. */
    strengthPerHood: z.number().min(0).max(30),
    /** Your organization's strength: from members (each, by skill), from hoods, and the most. */
    strengthPerMember: z.number().min(0).max(30),
    /** The chance a rival attacks one of your neighborhoods in a year, by how hostile it is and how strong, and doubled in a war. */
    attack: z.strictObject({ base: probability, hostile: z.number().min(0).max(10), war: z.number().min(1).max(10), cap: probability }),
    /** Defence: each member on protection adds their skill times this; a fight is decided by strengths with this much luck. */
    protect: z.number().min(0).max(5),
    luck: z.number().min(0).max(100),
    /** Expanding: the attack you order on a neighborhood and what it costs you in dirty money (at a city pay level of 1). */
    expandCost: positive,
    /** In a lost or won fight: members hurt or killed, the heat, and war intensity added. */
    fight: z.strictObject({ winHeat: z.number().min(0).max(100), loseHeat: z.number().min(0).max(100), warWin: z.number().min(0).max(100), warLose: z.number().min(0).max(100), hurt: probability, killed: probability, killedCap: z.int().min(0).max(5) }),
  }),
  war: z.strictObject({
    /** War is at this intensity or over (0 to 100); it rises with fights and falls each year without one. */
    at: z.int().min(1).max(100),
    decay: z.number().min(0).max(50),
    /** Years a truce holds before it can lapse, and the chance it lapses after. */
    truceYears: z.int().min(1).max(10),
    truceBreak: probability,
    /** Odds that an offer of a truce, or of an alliance, is taken, by how the other feels (attitude -100 to 100). */
    truceOdds: curveSchema,
    allianceOdds: curveSchema,
    /** Betrayal: the chance each year an ally turns, by how strong it is compared with you. */
    betrayal: probability,
    /** An alliance adds this much strength, a truce takes this much off war. */
    allyStrength: z.number().min(0).max(30),
    truceWar: z.number().min(0).max(100),
    /** How attitude moves: a fight, a truce, an alliance, a year of peace. */
    attitude: z.strictObject({ fight: z.number().min(-100).max(0), truce: z.number().min(0).max(100), alliance: z.number().min(0).max(100), peace: z.number().min(0).max(30), betrayal: z.number().min(-100).max(0) }),
  }),
  supply: z.strictObject({
    /** A cartel's supplier deal for a gang or a club: the share of a drug job's take it keeps, and the loyalty to refuse costs. */
    cartelShare: probability,
    /** A supply job moves this many units of a drug (D1) a year, at this share of the street price, and sells to dealers. */
    units: z.strictObject({ low: z.int().min(1).max(500), medium: z.int().min(1).max(500), high: z.int().min(1).max(500) }),
    wholesale: probability,
    /** The drugs a cartel supplies (D1 ids), by weight. */
    drugs: z.array(idSchema).min(1),
    /** Dealers a supply job reaches: players' dealing in this city counts. A cartel supplier gives a D1 dealer this price share. */
    dealerPrice: probability,
  }),
  /** How the world's organizations act on their own in a year. */
  decisions: z.strictObject({
    promote: z.strictObject({ loyalty: z.number().min(0).max(50), standing: z.number().min(0).max(50) }),
    discipline: z.strictObject({ loyalty: z.number().min(-50).max(50), skill: z.number().min(-50).max(50), standing: z.number().min(-50).max(50), quitChance: probability }),
    cutLoose: z.strictObject({ loyalty: z.number().min(-50).max(0), heat: z.number().min(0).max(50) }),
    /** An informant in your organization: confronting the member, dealing with it quietly. */
    informant: z.strictObject({ confront: z.number().min(0).max(100), heat: z.number().min(0).max(50), silenceLoyalty: z.number().min(-50).max(0) }),
    /** A leader's year: standing and stress. */
    leaderStress: z.number().min(0).max(20),
    /** A member drifts to the police on their own, by chance in a year with an investigation, rising when loyalty is low (loyalty under this). */
    informantLoyalty: z.int().min(0).max(100),
  }),
  /** The kinds' own pulls: the starting heat, who dies and where. */
  initiation: z.strictObject({
    /** Standing you start with in each kind, and what a failed initiation costs. */
    standing: z.int().min(0).max(100),
    failStanding: z.int().min(0).max(100),
  }),
  /** Youth crews: the age a teen can join or found one (never below 14), and the ages of the other kids in one (never under the joining age). */
  youth: z.strictObject({ minAge: z.int().min(14).max(17), memberAge: z.strictObject({ min: z.int().min(14).max(17), max: z.int().min(17).max(19) }) }),
  /** Words (labels.ts): where each band starts above the lowest, for an organization's strength, how it feels about you, and a member's skill and loyalty. */
  bands: z.strictObject({
    strength: z.array(z.int().min(1).max(100)).length(4),
    attitude: z.array(z.int().min(-99).max(99)).length(4),
    member: z.array(z.int().min(1).max(100)).length(3),
  }),
  /** Events the org year queues (chances per year). */
  events: z.strictObject({
    contest: probability,
    war: probability,
    truce: probability,
    betrayal: probability,
    discipline: probability,
    supply: probability,
    maxQueued: z.int().min(1).max(5),
  }),
});
export type OrgsBalance = z.infer<typeof orgsBalanceSchema>;

const historyLine = z.strictObject({ importance: z.union([z.literal(1), z.literal(2), z.literal(3)]), variants: z.array(z.string().trim().min(1)).min(1) });

/** The yearly recap lines the organization writes (text/orgs.yaml). Values: {crew} {member} {amount} {hood} {rival} {job} {balance} {count}. */
export const ORG_TEXT_KEYS = [
  'yearTake',
  'yearQuiet',
  'hoodsPay',
  'hoodGained',
  'hoodLost',
  'fightWon',
  'fightLost',
  'warStarted',
  'warEnded',
  'truceMade',
  'truceLapsed',
  'allied',
  'betrayed',
  'memberArrested',
  'memberHurt',
  'memberKilled',
  'memberTurned',
  'memberPromoted',
  'memberCut',
  'memberDisciplined',
  'memberQuit',
  'recruited',
  'supplied',
  'laundered',
  'codeBroken',
  'initiated',
] as const;
export type OrgTextKey = (typeof ORG_TEXT_KEYS)[number];

export const orgsTextSchema = z.strictObject({
  history: z.strictObject(Object.fromEntries(ORG_TEXT_KEYS.map((k) => [k, historyLine])) as Record<OrgTextKey, typeof historyLine>),
});
export type OrgsText = z.infer<typeof orgsTextSchema>;
