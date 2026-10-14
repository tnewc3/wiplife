/**
 * Emigration and citizenship (W6, docs/expansion.md): what each country asks of someone who moves there for good,
 * what it costs, how long it takes and the odds; naturalization; life without papers; remittances; and the events the
 * migration step queues. The engine decides what is true; the content says it. Money is in the base currency.
 * The game models each country's rules at a high level and takes no political position.
 */
import { z } from 'zod';
import { CREDENTIAL_TYPES } from './education';
import { idSchema } from './common';
import { COUNTRY_IDS } from './country';
import { BIRTHRIGHTS, REMIT_LEVELS } from './immigrationIds';

export * from './immigrationIds';

const share = z.number().min(0).max(1);
const years = z.int().min(0).max(40);
const money = z.int().min(0).max(100_000_000);
const delta = z.int().min(-30).max(30);

/** What a route costs and how it goes in one country. */
const terms = z.strictObject({ available: z.boolean(), fee: money, wait: z.int().min(1).max(5), odds: share });
const countryRules = z.strictObject({
  birthright: z.enum(BIRTHRIGHTS),
  descent: z.boolean(),
  dual: z.boolean(),
  work_sponsor: terms.extend({ stayYears: z.int().min(1).max(8) }),
  study_work: terms.extend({ tuitionFactor: z.number().min(1).max(4), graduateYears: z.int().min(1).max(5) }),
  family: terms,
  investment: terms.extend({ amount: money }),
  permanent: terms.extend({ afterYears: years }),
  naturalization: terms.extend({ years, marriedYears: years, language: z.int().min(0).max(100), cleanYears: years }),
  undocumented: z.strictObject({
    deportation: share,
    marriage: terms,
    longResidence: terms.extend({ years }),
  }),
});

export const immigrationBalanceSchema = z.strictObject({
  minAge: z.int().min(18),
  /** Years a ban on returning lasts after a removal. */
  banYears: years,
  /** Years you have to use an approval. */
  approvedWindow: z.int().min(1).max(5),
  eligibility: z.strictObject({
    /** A prison sentence within this many years blocks every route. */
    recordYears: years,
    work_sponsor: z.strictObject({ minAge: z.int(), maxAge: z.int(), credentials: z.array(z.enum(CREDENTIAL_TYPES)).min(1), experienceYears: years, language: z.int().min(0).max(100), categories: z.array(z.string()).min(1) }),
    study_work: z.strictObject({ minAge: z.int(), maxAge: z.int(), language: z.int().min(0).max(100) }),
    family: z.strictObject({ minAge: z.int(), kinds: z.array(z.string()).min(1) }),
    investment: z.strictObject({ minAge: z.int() }),
  }),
  odds: z.strictObject({
    min: share, max: share,
    education: z.partialRecord(z.enum(CREDENTIAL_TYPES), z.number().min(0).max(0.5)),
    languagePerPoint: z.number().min(0).max(0.02), languageCap: share,
    smartsPerPoint: z.number().min(0).max(0.02),
    experiencePerYear: z.number().min(0).max(0.1), experienceCap: share,
    record: z.number().min(-1).max(0),
    prepare: share,
    married: share,
  }),
  /** Arriving: the first years in a new country. */
  settle: z.strictObject({
    arrival: z.strictObject({ happiness: delta, stress: delta }),
    firstYears: years,
    yearly: z.strictObject({ happiness: z.number().min(-10).max(10), stress: z.number().min(-10).max(10) }),
    ties: z.int().min(0).max(20),
    homesickChance: share,
  }),
  remit: z.strictObject({
    levels: z.record(z.enum(REMIT_LEVELS), share),
    maxShare: share,
    affection: z.int().min(0).max(10),
    happiness: z.int().min(0).max(10),
  }),
  visits: z.strictObject({ affection: z.int().min(0).max(20), returnCost: money }),
  undocumented: z.strictObject({
    informalPay: share,
    /** Yearly chance an employer takes advantage. */
    exploitation: share,
    stolenShare: share,
    stress: z.strictObject({ perYear: z.number().min(0).max(10), limit: z.int().min(0).max(100) }),
    happiness: z.number().min(-10).max(0),
    deportation: z.strictObject({
      policeContact: share, record: share, applying: share, denied: share,
      /** The risk falls this much a year of residence, to a floor share of the base. */
      yearsDecay: z.number().min(0).max(0.2), floor: share,
      /** Multiplier when you belong to a community group that backs newcomers. */
      community: share, communityStanding: z.int().min(0).max(100),
      serious: share,
    }),
    entry: z.strictObject({ cost: money, turnedBack: share, hardship: delta }),
    ruleChange: z.strictObject({ yearlyChance: share, window: z.int().min(1).max(5), minYears: years, odds: share, fee: money }),
    supportGroups: z.array(idSchema).min(1),
    closeCall: z.strictObject({ chance: share }),
  }),
  /** People you know emigrate. */
  people: z.strictObject({
    yearlyChance: share, undocumentedShare: share, towardYourCountry: share,
    naturalizeYears: years, naturalizeChance: share, askChance: share,
  }),
  /** The cities that a country's newcomers' network can be found in come from the groups content. */
  simulation: z.strictObject({
    explore: share, applyChance: share, entryChance: share, undocumentedEntryChance: share,
    remitChance: share, visitChance: share, returnChance: share, naturalizeChance: share,
  }),
  countries: z.strictObject(Object.fromEntries(COUNTRY_IDS.map((id) => [id, countryRules])) as Record<(typeof COUNTRY_IDS)[number], typeof countryRules>),
});
export type ImmigrationBalance = z.infer<typeof immigrationBalanceSchema>;
export type CountryRules = z.infer<typeof countryRules>;

/** The events the migration step queues (all follow-ups): `groups` map to the situations below. */
export const immigrationRegistrySchema = z.strictObject({
  /**
   * Follow-up events the actions and the step queue. Each is picked, by weight, among those that fit what is true now
   * (an event's requirements say which application, route or status it is about). Receipt groups (applied, arrived,
   * turnedBack, returned) answer an action: their first event is a cast-free automatic receipt.
   */
  triggers: z.strictObject({
    applied: z.array(idSchema).min(1),
    waiting: z.array(idSchema).min(1),
    approved: z.array(idSchema).min(1),
    denied: z.array(idSchema).min(1),
    arrived: z.array(idSchema).min(1),
    visaEnding: z.array(idSchema).min(1),
    deported: z.array(idSchema).min(1),
    ruleChange: z.array(idSchema).min(1),
    turnedBack: z.array(idSchema).min(1),
    returned: z.array(idSchema).min(1),
  }),
  /** Drawn from each year by what is true. */
  yearly: z.strictObject({
    exploitation: z.array(idSchema).min(1),
    closeCall: z.array(idSchema).min(1),
    undocumented: z.array(idSchema).min(1),
    abroad: z.array(idSchema).min(1),
  }),
});

export const immigrationTextSchema = z.strictObject({
  arrived: z.array(z.string()).min(1),
  returned: z.array(z.string()).min(1),
  deported: z.array(z.string()).min(1),
  overstay: z.array(z.string()).min(1),
  entry: z.array(z.string()).min(1),
  permanent: z.array(z.string()).min(1),
  citizen: z.array(z.string()).min(1),
  regularized: z.array(z.string()).min(1),
  applied: z.array(z.string()).min(1),
  turnedBack: z.array(z.string()).min(1),
  unlicensed: z.array(z.string()).min(1),
});
