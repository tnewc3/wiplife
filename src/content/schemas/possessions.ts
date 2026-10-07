/**
 * Possessions (docs/expansion.md, E5): pets, vehicles and renovations as
 * content (src/content/pets, vehicles, renovations), the pet interactions
 * that join the E1 menu (src/content/petInteractions), the possessions
 * balance numbers (src/content/balance/possessions.yaml), the events the
 * possessions step queues (src/content/registries/possessions.yaml) and the
 * history lines (src/content/text/possessions.yaml).
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import {
  ACCIDENT_KINDS,
  DAMAGE_SEVERITIES,
  PET_PERSONALITIES,
  PET_SOURCES,
  VEHICLE_KINDS,
  type AccidentKind,
} from './belongings';
import { baseDefSchema, dollarsSchema, idSchema } from './common';
import { statEffectsSchema } from './economy';
import { effectSchema } from './events';
import { templateSchema } from './text';

export * from './belongings';
export const petPersonalitySchema = z.enum(PET_PERSONALITIES);
export const vehicleKindSchema = z.enum(VEHICLE_KINDS);
export const damageSeveritySchema = z.enum(DAMAGE_SEVERITIES);
export const petSourceSchema = z.enum(PET_SOURCES);

const yearsRange = z
  .strictObject({ min: z.int().min(1).max(60), max: z.int().min(1).max(60) })
  .refine((r) => r.min <= r.max, 'min must not be greater than max');

/** A kind of pet (src/content/pets): what it costs, how long it lives and how much it needs you. */
export const petSchema = baseDefSchema.extend({
  /** The animal as a noun: "dog". */
  name: z.string().trim().min(1).max(24),
  blurb: z.string().trim().min(1).max(100),
  /** Years it lives (the range its lifespan is rolled in). */
  lifespan: yearsRange,
  /** What a shelter or rescue asks, and what a breeder asks, at the national average (scaled to your city). */
  adoptCost: dollarsSchema,
  buyCost: dollarsSchema,
  /** Food, supplies and routine care each year, at the national average (scaled to your city). */
  yearlyCost: dollarsSchema,
  /** One visit to the vet at the national average (more when the pet is ill). */
  vetCost: dollarsSchema,
  /** Yearly chance of falling ill, before age and bad luck change it (0–1). */
  sickChance: z.number().min(0).max(1),
  /** How much it needs from you: the bond it loses each year you spend no time with it, as a multiple of the usual loss (0–2). */
  attention: z.number().min(0).max(2),
  /** How readily it takes to each personality (relative weights); at least one above 0. */
  personalities: z.strictObject({ playful: z.number().min(0), anxious: z.number().min(0), stubborn: z.number().min(0), lazy: z.number().min(0) }).refine((w) => Object.values(w).some((x) => x > 0), 'needs a positive weight'),
});
export type PetDef = z.infer<typeof petSchema>;

/** A kind of vehicle (src/content/vehicles). */
export const vehicleSchema = baseDefSchema.extend({
  /** As it reads in a sentence: "pickup truck". */
  name: z.string().trim().min(1).max(30),
  blurb: z.string().trim().min(1).max(100),
  kind: vehicleKindSchema,
  /** Price new, at the national average. */
  price: dollarsSchema.positive(),
  /** Fuel, parking, registration and routine upkeep each year, at the national average (scaled to your city). */
  upkeep: dollarsSchema,
  /** A full service (the Belongings action) at the national average. */
  service: dollarsSchema,
  /** Yearly insurance for a driver of 30 with a clean record, at the national average. */
  insurance: dollarsSchema,
  /** Accidents, as a multiple of the usual chance (a motorcycle's is high). */
  risk: z.number().min(0.1).max(5),
  /** Whether it can be bought used. */
  used: z.boolean().default(true),
});
export type VehicleDef = z.infer<typeof vehicleSchema>;

/** A renovation (src/content/renovations): its cost and what it does, as shares of the home's value. */
export const renovationSchema = baseDefSchema.extend({
  /** As it reads on a button: "Kitchen remodel". */
  name: z.string().trim().min(1).max(30),
  blurb: z.string().trim().min(1).max(100),
  /** What it costs, as a share of the home's value. */
  cost: z.number().min(0.001).max(1),
  /** How much it adds to the home's value, as a share of the home's value. */
  value: z.number().min(0).max(1),
  /** How much more comfortable the home is to live in (points; they fade over the years). */
  comfort: z.int().min(0).max(10),
  /** A moment of pride on the day it's done (Happiness points). */
  happiness: z.int().min(0).max(20),
  /** Years before the same renovation makes sense again. */
  cooldownYears: z.int().min(1).max(40),
});
export type RenovationDef = z.infer<typeof renovationSchema>;

/** What a pet interaction may do. */
export const PET_INTERACTION_EFFECT_TYPES = ['stat', 'cost', 'flag', 'history'] as const;
const petEffectSchema = effectSchema.refine(
  (e) => (PET_INTERACTION_EFFECT_TYPES as readonly string[]).includes(e.type),
  `pet interactions may only use these effects: ${PET_INTERACTION_EFFECT_TYPES.join(', ')}`,
);
const petTierSchema = z.strictObject({
  /** 2–3 wordings, with {pet.name} for the pet. */
  text: z.array(templateSchema).min(2).max(3),
  /** Change to the pet's bond with you. Gains shrink with repeats; losses don't. */
  bond: z.int().min(-30).max(30).default(0),
  /** Change to the pet's health. */
  health: z.int().min(-20).max(20).default(0),
  effects: z.array(petEffectSchema).default([]),
});
export type PetInteractionTier = z.infer<typeof petTierSchema>;

/** A pet interaction (src/content/petInteractions): it joins the E1 menu on a pet's page. */
export const petInteractionSchema = baseDefSchema.extend({
  name: z.string().trim().min(1).max(30),
  blurb: z.string().trim().min(1).max(80),
  /** Which reaction profile in balance/possessions.yaml sets its odds. */
  profile: idSchema,
  outcomes: z.strictObject({
    great: petTierSchema.optional(),
    good: petTierSchema,
    neutral: petTierSchema,
    bad: petTierSchema,
    backfire: petTierSchema.optional(),
  }),
});
export type PetInteractionDef = z.infer<typeof petInteractionSchema>;

const probability = z.number().min(0).max(1);
const share = z.number().min(0).max(1);
const intRange = z
  .strictObject({ min: z.int().min(0).max(100), max: z.int().min(0).max(100) })
  .refine((r) => r.min <= r.max, 'min must not be greater than max');
const shareRange = z
  .strictObject({ min: share, max: share })
  .refine((r) => r.min <= r.max, 'min must not be greater than max');
const perSource = <T extends z.ZodType>(value: T) => z.strictObject({ shelter: value, breeder: value, stray: value });
const perSeverity = <T extends z.ZodType>(value: T) => z.strictObject({ minor: value, major: value, total: value });

/** The possessions numbers (src/content/balance/possessions.yaml). */
export const possessionsBalanceSchema = z.strictObject({
  /** The most you can own of each kind at once. */
  limits: z.strictObject({ pets: z.int().min(1).max(20), vehicles: z.int().min(1).max(10), vacationHomes: z.int().min(1).max(10) }),
  /** The youngest age you can drive (and buy a vehicle for cash). */
  drivingAge: z.int().min(14).max(21),
  pets: z.strictObject({
    /** The youngest age you can adopt or buy a pet yourself (a family pet comes through events). */
    adoptAge: z.int().min(10).max(30),
    /** The age a pet starts at, as a share of its lifespan. */
    startAgeShare: perSource(shareRange),
    startHealth: perSource(z.int().min(1).max(100)),
    startBond: perSource(z.int().min(0).max(100)),
    health: z.strictObject({
      /** Health points lost each year, plus this many more at the end of life (scaled by the share of its life lived). */
      drift: z.number().max(0),
      ageDrift: z.number().max(0),
      vet: z.strictObject({ checkup: z.int().min(0).max(50), cure: z.int().min(0).max(50) }),
      sick: z.strictObject({
        /** Multiplies the species' chance, by the share of its life lived. */
        ageShare: curveSchema,
        severity: intRange,
        /** Extra health lost each year while ill and untreated. */
        untreated: z.int().min(0).max(40),
        /** Chance an ill pet gets better on its own in a year, and the health it must still have for that. */
        recover: probability,
        recoverAbove: z.int().min(0).max(100),
      }),
      /** At or below this health an ill pet's life is cut short. */
      failing: z.int().min(0).max(100),
      /** Years a failing, ill pet's lifespan is cut by (never below the species' shortest). */
      lifespanLoss: z.int().min(0).max(5),
    }),
    bond: z.strictObject({
      /** Points lost a year with no time together, times the species' attention. */
      decay: z.number().min(0).max(40),
      /** Points gained a year just from living with you. */
      companionship: z.number().min(0).max(20),
      /** The most a year of interactions can add. */
      yearlyCap: z.int().min(1).max(100),
    }),
    /** A vet visit for an ill pet costs this many times as much. */
    illVetMult: z.number().min(1).max(10),
    interaction: z.strictObject({
      /** Points per point of bond and of health above 50. */
      bondWeight: z.number().min(0).max(2),
      healthWeight: z.number().min(0).max(2),
      /** Gains shrink by this for each earlier use of the same interaction with this pet this year, and for each earlier interaction of any kind. */
      returnsSame: share,
      returnsTotal: share,
      /** Using the same interaction this many times in a year leaves a pet fed up. */
      annoyedAfter: z.int().min(1).max(50),
      profiles: z.record(
        idSchema,
        z.strictObject({
          base: z.number().min(-60).max(60),
          personality: z.strictObject({ playful: z.number().min(-40).max(40), anxious: z.number().min(-40).max(40), stubborn: z.number().min(-40).max(40), lazy: z.number().min(-40).max(40) }),
          repeat: z.strictObject({ same: z.number().min(0).max(40), total: z.number().min(0).max(10) }),
        }),
      ),
    }),
  }),
  vehicles: z.strictObject({
    /** Fees on a purchase (tax, title, registration) as a share of the price. */
    fees: share,
    /** The share of living costs that already covers getting around; a vehicle's costs replace it. */
    transportShare: share,
    /** A used vehicle: its condition and age when you buy it, and the share of the new price it fetches before condition. */
    used: z.strictObject({ condition: intRange, age: intRange, priceShare: share }),
    depreciation: z.strictObject({
      /** The first year's loss and each later year's, as shares of value; value never falls below `floor` of the new price. */
      first: share,
      yearly: share,
      floor: share,
    }),
    /** Multiplies the value, by condition. */
    conditionValue: curveSchema,
    wear: z.strictObject({
      /** Condition points lost each year, plus these for each year of age... */
      base: z.number().min(0).max(30),
      perAge: z.number().min(0).max(5),
      /** ...and this many more when it wasn't serviced this year, and for a job that needs a vehicle (times how much). */
      unserviced: z.number().min(0).max(30),
      jobUse: z.number().min(0).max(30),
    }),
    /** A full service adds this much condition. */
    serviceGain: z.int().min(0).max(100),
    /** A private sale brings this share of the value. */
    sellShare: share,
    loan: z.strictObject({
      /** The smallest down payment, as a share of the price (with the fees), the term, and the most a year's payments may be of last year's income. */
      minDown: share,
      termYears: z.int().min(1).max(10),
      maxPaymentShare: share,
    }),
    insurance: z.strictObject({
      /** Multiplies the premium, by your age. */
      age: curveSchema,
      /** Each claim in the last `years` years adds this share (at most `max` claims count). */
      claim: z.strictObject({ surcharge: z.number().min(0).max(2), years: z.int().min(1).max(20), max: z.int().min(1).max(10) }),
      /** A drunk-driving offense in the last `years` years adds this share. */
      record: z.strictObject({ offenseId: idSchema, surcharge: z.number().min(0).max(5), years: z.int().min(1).max(20) }),
      /** The premium goes up by this share of how much dearer your city is than average. */
      cityShare: share,
      /** What you pay on a claim. */
      deductible: dollarsSchema,
      /** A total loss pays this share of the value. */
      totalPayout: share,
    }),
    /** What a repair costs, as a share of the new price, and the condition it costs. */
    repair: perSeverity(z.strictObject({ cost: share, condition: z.int().min(0).max(100) })),
    accident: z.strictObject({
      /** Yearly chance of an accident, by your age. */
      base: curveSchema,
      /** The chance rises by this share per point of Risk-taking above 50 (and falls below it), scaled to 50. */
      riskTaking: z.number().min(0).max(3),
      /** Multiplies the chance, by the vehicle's condition. */
      condition: curveSchema,
      /** How bad it is, by relative weight. */
      severity: perSeverity(z.number().min(0)),
      /** A drunk-driving incident: the yearly chance by your Vice, multiplied when you have one of these conditions. */
      drunk: z.strictObject({ vice: curveSchema, conditions: z.array(idSchema).min(1), conditionMult: z.number().min(1).max(20) }),
    }),
  }),
  jobs: z.strictObject({
    /** A job needs a vehicle when its dependence (the job's, times the city's) reaches this. */
    requireAt: share,
    /** Aim points lost when a job where a vehicle helps (below requireAt) has none, times the dependence. */
    helpfulPenalty: z.number().min(0).max(60),
    /** Aim points lost while you have no vehicle at a job that needs one. */
    missingPenalty: z.number().min(0).max(60),
    /** Years without a vehicle before such a job is lost. */
    graceYears: z.int().min(1).max(5),
  }),
  homes: z.strictObject({
    vacation: z.strictObject({
      /** The price, as a share of the city's usual home price. */
      priceShare: z.number().min(0.1).max(5),
      /** Added to the usual mortgage rate. */
      rateExtra: z.number().min(0).max(0.1),
      /** Yearly upkeep and insurance, as shares of the value; and how much its value grows each year. */
      upkeep: share,
      insurance: share,
      appreciation: z.number().min(-0.2).max(0.2),
      /** The most all your housing payments (both mortgages) may be of last year's income. */
      maxPaymentShare: share,
      /** Yearly pulls on stats: a place to get away to. */
      effects: statEffectsSchema,
      /** A damaged home's repair, as a share of its value, by severity (a total loss is gone). */
      repair: perSeverity(share),
      /** A total loss pays this share of the value when insured. */
      totalPayout: share,
    }),
    renovation: z.strictObject({
      /** A renovation's comfort lasts this long at full, then fades over `fadeYears`. */
      lastsYears: z.int().min(1).max(60),
      fadeYears: z.int().min(1).max(60),
      /** Yearly Happiness pull: perPoint × the comfort you have, up to max (never above `limit`). */
      perPoint: z.number().min(0).max(5),
      max: z.number().min(0).max(10),
      limit: z.int().min(0).max(100),
      /** The most renovations one home carries at once (those that haven't faded). */
      maxActive: z.int().min(1).max(20),
    }),
  }),
  estate: z.strictObject({
    /** Who is best placed to take a pet: points for living in the household, in your city, elsewhere. */
    petPresence: z.strictObject({ household: z.number(), city: z.number(), elsewhere: z.number() }),
  }),
});
export type PossessionsBalance = z.infer<typeof possessionsBalanceSchema>;

/**
 * The events the possessions step queues (registries/possessions.yaml): an
 * accident of each kind, and a pet that has died. Every event listed must be
 * followUpOnly and bind the possession it is about.
 */
export const possessionsRegistrySchema = z.strictObject({
  accidents: z.strictObject(
    Object.fromEntries(ACCIDENT_KINDS.map((k) => [k, z.strictObject({ events: z.array(idSchema).min(1) })])) as Record<AccidentKind, z.ZodObject<{ events: z.ZodArray<typeof idSchema> }>>,
  ),
  petDied: z.strictObject({ events: z.array(idSchema).min(1) }),
});
export type PossessionsRegistry = z.infer<typeof possessionsRegistrySchema>;

const historyLine = z.strictObject({ importance: z.union([z.literal(1), z.literal(2), z.literal(3)]), variants: z.array(templateSchema).min(1) });

/** The history lines the possessions systems write (src/content/text/possessions.yaml). Values: {pet}, {species}, {vehicle}, {city}, {renovation}. */
export const POSSESSION_HISTORY_KEYS = [
  'petAdopted',
  'petDied',
  'petLeft',
  'vehicleBought',
  'vehicleSold',
  'vehicleLost',
  'vacationBought',
  'vacationSold',
  'vacationForeclosed',
  'renovated',
  'noVehicleJobLost',
] as const;
export type PossessionHistoryKey = (typeof POSSESSION_HISTORY_KEYS)[number];
export const possessionsTextSchema = z.strictObject({
  /** Names for a pet that turns up through an event. Plain names: letters only. */
  petNames: z.array(z.string().regex(/^[\p{L}][\p{L}' -]{0,19}$/u, 'a pet name is letters, spaces, hyphens and apostrophes')).min(12),
  history: z.strictObject(Object.fromEntries(POSSESSION_HISTORY_KEYS.map((k) => [k, historyLine])) as Record<PossessionHistoryKey, typeof historyLine>),
});
export type PossessionsText = z.infer<typeof possessionsTextSchema>;
