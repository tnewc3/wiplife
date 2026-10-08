/**
 * Crime careers (E6a, docs/expansion.md): fictional crews (src/content/crews),
 * the cash businesses money is laundered through (fronts), the balance numbers
 * (src/content/balance/crime.yaml), the events the crime step queues
 * (registries/crime.yaml) and the history lines it writes (text/crime.yaml).
 *
 * Crime stays at the level of story and consequences: odds, payouts, heat and
 * fallout. Nothing here, and nothing in an event, says how to do anything.
 * Crews and businesses are made up, and say nothing about race, religion,
 * background or money (the content build checks it, tools/content/crime.ts).
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { baseDefSchema, idSchema, TRAIT_KEYS } from './common';

const probability = z.number().min(0).max(1);
const positive = z.number().positive().max(1_000_000);
const range = z
  .strictObject({ min: z.int().min(0).max(100), max: z.int().min(0).max(100) })
  .refine((r) => r.min <= r.max, 'min must not be greater than max');
const spread = z.strictObject({ mean: z.number().min(0).max(100), sd: z.number().min(0).max(50) });

/** A crew has this many ranks; the top one is the crew leader. */
export const CREW_RANKS = 5;

/** How big a job's take is (and, with it, its heat and what it does for your standing). */
export const JOB_SIZES = ['petty', 'small', 'solid', 'big', 'major'] as const;
export type JobSize = (typeof JOB_SIZES)[number];
export const jobSizeSchema = z.enum(JOB_SIZES);

const traitKey = z.enum(TRAIT_KEYS);

/**
 * A crew (src/content/crews): a made-up outfit that works in some cities, with
 * a title for each of its five ranks (the last is the one who runs it) and
 * the crews it is at odds with.
 */
export const crewSchema = baseDefSchema.extend({
  /** As it reads in a sentence ("the Cinder Row Outfit"). */
  name: z.string().trim().min(2).max(40),
  blurb: z.string().trim().min(10).max(200),
  /** The cities it works in. */
  cities: z.array(idSchema).min(1),
  /** Rank titles, lowest first, as they read in a sentence without an article ("runner", "crew boss"). */
  ranks: z.array(z.string().trim().min(2).max(30)).length(CREW_RANKS),
  /** The crews it is at odds with (each must work in a city this one does). */
  rivals: z.array(idSchema).min(1),
  /** The personality its members lean toward (added to each member's traits, from 50). */
  traits: z.partialRecord(traitKey, z.int().min(-30).max(30)),
});
export type CrewDef = z.infer<typeof crewSchema>;

/**
 * A cash business money is laundered through (src/content/fronts). Its tier
 * (1–3) says what it charges, how risky it is and how much it can take in a
 * year (balance/crime.yaml laundering.tiers).
 */
export const frontSchema = baseDefSchema.extend({
  name: z.string().trim().min(2).max(40),
  blurb: z.string().trim().min(10).max(160),
  tier: z.int().min(1).max(3),
});
export type FrontDef = z.infer<typeof frontSchema>;

const payoutSizes = z.strictObject({
  petty: positive,
  small: positive,
  solid: positive,
  big: positive,
  major: positive,
});

/** Crime numbers (src/content/balance/crime.yaml). */
export const crimeBalanceSchema = z.strictObject({
  entry: z.strictObject({
    /** Crew members you can know (besides you), made when you join. */
    members: range,
    /** Their ages. */
    memberAge: z.strictObject({ min: z.int().min(18).max(90), max: z.int().min(18).max(90) }),
    /** How they feel about you at the start, and about each other (friends). */
    memberAffection: spread,
    tieAffection: spread,
    /** People of a rival crew an event brings into your life (their affection for you starts low). */
    rivalAffection: spread,
    /** Standing in the crew when you join (0–100). */
    standing: z.int().min(0).max(100),
    /** Heat you carry in with you from the first day. */
    heat: z.int().min(0).max(100),
    /** The first rival feeling (0–100). */
    rivalry: z.int().min(0).max(100),
  }),
  /** Per rank, lowest first: the multiplier on what a job pays you, and what reaching it asks for. */
  ranks: z
    .array(
      z.strictObject({
        payout: z.number().min(0.1).max(20),
        /** Standing and whole years at the rank below needed to be offered this rank, and the chance each year you qualify that it is offered (rank 1 has none). */
        reach: z.strictObject({ standing: z.int().min(0).max(100), years: z.int().min(0).max(20), chance: probability }).optional(),
        /** Yearly pulls on you at this rank. */
        stress: z.number().min(0).max(20),
        /** The yearly cut of the crew's business paid to this rank (dollars at a city pay level of 1) and the heat it adds. Only the top two ranks have one. */
        cut: z.strictObject({ amount: positive, heat: z.number().min(0).max(50) }).optional(),
      }),
    )
    .length(CREW_RANKS),
  jobs: z.strictObject({
    /** Jobs queued each year, by rank (rank 1 first). */
    perYear: z.array(range).length(CREW_RANKS),
    /** Most events the crime step queues in a year, jobs included. */
    maxQueued: z.int().min(1).max(6),
    /** What a job of this size pays (dollars at a city's pay level of 1, before the rank), the heat it adds, and the standing it earns. */
    sizes: z.strictObject({
      petty: z.strictObject({ payout: positive, heat: z.number().min(0).max(100), standing: z.number().min(0).max(100) }),
      small: z.strictObject({ payout: positive, heat: z.number().min(0).max(100), standing: z.number().min(0).max(100) }),
      solid: z.strictObject({ payout: positive, heat: z.number().min(0).max(100), standing: z.number().min(0).max(100) }),
      big: z.strictObject({ payout: positive, heat: z.number().min(0).max(100), standing: z.number().min(0).max(100) }),
      major: z.strictObject({ payout: positive, heat: z.number().min(0).max(100), standing: z.number().min(0).max(100) }),
    }),
    /** A payout varies by up to this share either way. */
    variation: probability,
    /** What paying out of your dirty money costs (hush money, a bribe) by size, at a city's pay level of 1. */
    costs: payoutSizes,
  }),
  heat: z.strictObject({
    /** Each year heat falls by this share of itself plus this much... */
    decay: z.strictObject({ share: probability, flat: z.number().min(0).max(50) }),
    /** ...and by this much more of its share after a year with no job (lying low). */
    quietShare: probability,
    /** Heat that stays after you leave the crew falls this much faster (a multiplier on the decay share). */
    formerDecay: z.number().min(1).max(5),
    /** Words (labels.ts): the first heat each band starts at, above the lowest. */
    bands: z.array(z.int().min(1).max(100)).length(4),
  }),
  standing: z.strictObject({
    /** Every year the crew's trust slips by this much: it has to be earned again. */
    slide: z.number().min(0).max(50),
    /** A year without a job costs this much more standing. */
    idleLoss: z.number().min(0).max(100),
    /** At or below this for `lowYears` years in a row, you're pushed out. */
    lowAt: z.int().min(0).max(100),
    lowYears: z.int().min(1).max(10),
    /** Words (labels.ts): where each band starts, above the lowest. */
    bands: z.array(z.int().min(1).max(100)).length(4),
  }),
  /** Moving away from your crew's city: what happens to your place, your standing, what the crew thinks of you, and how a new crew or the old one takes you. */
  away: z.strictObject({
    /** Standing lost each year away (to the floor). Your rank stays where it was. */
    standingLoss: z.number().min(0).max(50),
    floor: z.int().min(0).max(100),
    suspicion: z.strictObject({
      start: z.int().min(0).max(100),
      perYear: z.number().min(0).max(50),
      /** Plus this much for each point of heat over 50, and this much a year with an investigation open. */
      perHeat: z.number().min(0).max(5),
      investigated: z.number().min(0).max(50),
      /** Words (labels.ts): where each band starts, above the lowest. */
      bands: z.array(z.int().min(1).max(100)).length(3),
    }),
    /** Chance each year away that the crew reaches out, by how much it suspects you. */
    reachChance: curveSchema,
    /** The crew writes you off after this many years away (an event, never silently). */
    cutLooseYears: z.int().min(1).max(30),
    /** Coming back: the share of the standing you left with that returns, less this share of the suspicion. */
    back: z.strictObject({ standing: probability, suspicionWeight: probability }),
    /** A new crew in the city you moved to: ranks lost from the best you held, standing gained, and for each point of reputation above 50 and for a record. */
    transfer: z.strictObject({ rankDrop: z.int().min(0).max(4), standing: z.int().min(0).max(50), reputation: z.number().min(0).max(2), record: z.int().min(0).max(30) }),
    /** Rejoining a crew you were in before, by how you left it: ranks lost from the best you held, and standing gained (or lost). */
    rejoin: z.strictObject({
      left: z.strictObject({ rankDrop: z.int().min(0).max(4), standing: z.int().min(-40).max(40) }),
      moved: z.strictObject({ rankDrop: z.int().min(0).max(4), standing: z.int().min(-40).max(40) }),
      drifted: z.strictObject({ rankDrop: z.int().min(0).max(4), standing: z.int().min(-40).max(40) }),
      pushed: z.strictObject({ rankDrop: z.int().min(0).max(4), standing: z.int().min(-40).max(40) }),
      deal: z.strictObject({ rankDrop: z.int().min(0).max(4), standing: z.int().min(-40).max(40) }),
    }),
  }),
  rivalry: z.strictObject({
    /** Each year the rival feeling drifts toward this (0–100) by this share. */
    settle: z.strictObject({ at: z.int().min(0).max(100), share: probability }),
    /** Each job of this size or bigger raises it by this much. */
    perJob: z.number().min(0).max(50),
    /** Chance of a rival event this year, by the rival feeling. */
    eventChance: curveSchema,
    /** Words (labels.ts): where each band starts, above the lowest. */
    bands: z.array(z.int().min(1).max(100)).length(3),
  }),
  /** The police: odds, by heat, of an investigation opening and of an arrest (legal.ts reads these). */
  police: z.strictObject({
    investigation: curveSchema,
    arrest: curveSchema,
    /** Years an investigation stays open without being refreshed. */
    openYears: range,
    /** An open investigation goes cold, by chance, in a year heat is below this. */
    coldBelow: z.int().min(0).max(100),
    coldChance: probability,
    /** Multipliers on the arrest odds: an open investigation, an informant in the crew, each entry on your record (up to `recordMax`), probation. */
    investigated: z.number().min(1).max(10),
    informant: z.number().min(1).max(10),
    record: z.number().min(1).max(3),
    recordMax: z.int().min(0).max(10),
    probation: z.number().min(1).max(10),
    /** Chance in a year with an open investigation, and a crew of this many, that a member turns informant. */
    informantChance: probability,
  }),
  /** Dirty money: spending it and laundering it. */
  dirty: z.strictObject({
    /** Spending it in one go adds this much heat for each $1,000 (at a city pay level of 1), up to `max` a time. */
    spend: z.strictObject({ perThousand: z.number().min(0).max(50), max: z.number().min(0).max(100), minimum: z.int().min(1).max(100_000), happiness: z.number().min(0).max(20), happinessMax: z.int().min(0).max(30) }),
    /** Chance each year, once you hold more than `above`, that a stash is raided or taken (queues an event), rising with heat. */
    stash: z.strictObject({ above: z.int().min(0).max(10_000_000), raid: curveSchema, theft: probability }),
    laundering: z.strictObject({
      minimum: z.int().min(1).max(100_000),
      /** By tier (1–3, in order): what it charges, how often it's flagged, how much it takes in a year, and the rank you need (0: anyone with dirty money). */
      tiers: z
        .array(z.strictObject({ fee: probability, risk: probability, capacity: positive, rank: z.int().min(0).max(5) }))
        .length(3),
      /** Risk is multiplied by 1 + heat × this ÷ 100; and by `over` for the part past a business's yearly capacity. */
      heatRisk: z.number().min(0).max(10),
      over: z.number().min(1).max(10),
      /** Words (labels.ts): the risk each of two bands starts at, above the lowest. */
      riskBands: z.array(probability).length(2),
      /** A flagged amount: the share that is lost, the heat it adds, and the chance it opens an investigation. */
      lost: probability,
      flaggedHeat: z.number().min(0).max(100),
      investigates: probability,
    }),
  }),
  /** The yearly pull on you of life in a crew, and a legal job's performance (points). */
  life: z.strictObject({
    stress: z.number().min(0).max(20),
    stressLimit: z.int().min(0).max(100),
    performance: z.number().min(-50).max(0),
  }),
  /** Getting out: heat that still follows you, and the chance each year that the past does (queues an event), by years since you left. */
  past: z.strictObject({
    eventChance: curveSchema,
    heatLimit: z.int().min(0).max(100),
  }),
});
export type CrimeBalance = z.infer<typeof crimeBalanceSchema>;

/** The events the crime step queues (registries/crime.yaml). */
export const CRIME_TRIGGERS = ['promotion', 'pushedOut', 'investigation', 'arrest', 'rival', 'informant', 'raid', 'theft', 'laundering', 'past', 'cut', 'away', 'awayCut', 'back'] as const;
export type CrimeTrigger = (typeof CRIME_TRIGGERS)[number];

export const crimeRegistrySchema = z.strictObject({
  /** The jobs a year can bring; each is picked by weight among those whose requirements fit (rank, standing, heat...). */
  jobs: z.array(idSchema).min(1),
  /** The causes of death a crew life can end in (src/content/causes); the simulation counts them. */
  deathCauses: z.array(idSchema).min(1),
  triggers: z.strictObject(
    Object.fromEntries(CRIME_TRIGGERS.map((id) => [id, z.strictObject({ events: z.array(idSchema).min(1) })])) as Record<
      CrimeTrigger,
      z.ZodObject<{ events: z.ZodArray<typeof idSchema> }>
    >,
  ),
});
export type CrimeRegistry = z.infer<typeof crimeRegistrySchema>;

const historyLine = z.strictObject({ importance: z.union([z.literal(1), z.literal(2), z.literal(3)]), variants: z.array(z.string().trim().min(1)).min(1) });

/** The history lines the crime systems write (text/crime.yaml). Values: {crew}, {rank}. */
export const CRIME_HISTORY_KEYS = ['joined', 'promoted', 'leader', 'left', 'pushedOut', 'drifted', 'investigationOpened', 'investigationCold', 'flagged'] as const;
export type CrimeHistoryKey = (typeof CRIME_HISTORY_KEYS)[number];

export const crimeTextSchema = z.strictObject({
  history: z.strictObject(Object.fromEntries(CRIME_HISTORY_KEYS.map((k) => [k, historyLine])) as Record<CrimeHistoryKey, typeof historyLine>),
});
export type CrimeText = z.infer<typeof crimeTextSchema>;
