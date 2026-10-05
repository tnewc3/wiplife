/**
 * People's own lives (E3, docs/expansion.md): the balance numbers
 * (src/content/balance/people.yaml), the events a change in someone's life can
 * ask of you (registries/people.yaml) and the news lines the yearly feed is
 * made of (text/news.yaml). The lives themselves use the existing content:
 * job tracks, conditions, offenses and cities.
 */
import { z } from 'zod';
import { curveSchema, distributionSchema, familyWealthSchema } from './balance';
import { idSchema } from './common';
import { relationshipKindSchema } from './relationships';
import { templateSchema } from './text';

const probability = z.number().min(0).max(1);

/** How closely a person's life is followed. */
export const LIFE_TIERS = ['close', 'near', 'far'] as const;
export const lifeTierSchema = z.enum(LIFE_TIERS);

/** The parts of a life that change each year. */
export const LIFE_DOMAINS = ['career', 'love', 'moving', 'children', 'growing', 'trouble'] as const;
export const lifeDomainSchema = z.enum(LIFE_DOMAINS);
export type LifeDomain = z.infer<typeof lifeDomainSchema>;

/**
 * The changes in someone's life that can ask something of you (an event card
 * from registries/people.yaml). `moneyTrouble` isn't a change but a yearly
 * chance that someone short of money asks for a loan or a cosigner.
 */
export const REQUEST_TRIGGERS = [
  'engaged',
  'newPartner',
  'wedding',
  'divorce',
  'newBaby',
  'arrest',
  'jailed',
  'released',
  'jobLoss',
  'promotion',
  'moneyTrouble',
  'illness',
  'relapse',
  'intervention',
  'recovered',
  'death',
  'moveAway',
  'moveToYou',
  'careNeeded',
  'cameOfAge',
] as const;
export type RequestTrigger = (typeof REQUEST_TRIGGERS)[number];
export const requestTriggerSchema = z.enum(REQUEST_TRIGGERS);

/**
 * News line kinds (text/news.yaml) and the values each may use besides the
 * person ({npc.name}, {npc.they}...; {npc.job}, {npc.partner}, {npc.city} and
 * {npc.relation} also work): {title} a job title, {employer} where they
 * work, {partner} their partner's first name, {city} a city, {child} a
 * child's first name, {condition} a health condition as it reads in a
 * sentence, {offense} an offense, {years} a length of time. {title} and
 * {npc.job} include their article ("an electrician", "a junior developer").
 */
export const NEWS_VALUES = {
  hired: ['title', 'employer'],
  promoted: ['title'],
  fired: ['title'],
  laid_off: ['title'],
  switched: ['title', 'employer'],
  retired: [],
  started_dating: ['partner'],
  engaged: ['partner'],
  married: ['partner'],
  broke_up: ['partner'],
  divorced: ['partner'],
  widowed: ['partner'],
  moved: ['city'],
  moved_near: ['city'],
  had_child: ['child'],
  child_grew: ['child'],
  came_of_age: [],
  moved_out: ['city'],
  diagnosed: ['condition'],
  worsened: ['condition'],
  recovered_health: ['condition'],
  addiction_started: ['condition'],
  got_clean: ['condition'],
  relapsed: ['condition'],
  arrested: ['offense'],
  warned: ['offense'],
  fined: ['offense'],
  probation: ['offense', 'years'],
  jailed: ['offense', 'years'],
  released: [],
  care_needed: [],
} as const satisfies Record<string, readonly string[]>;
export type NewsKind = keyof typeof NEWS_VALUES;
export const NEWS_KINDS = Object.keys(NEWS_VALUES) as NewsKind[];
export const newsKindSchema = z.enum(NEWS_KINDS as [NewsKind, ...NewsKind[]]);

const perWealth = <T extends z.ZodType>(value: T) => z.strictObject({ poor: value, working: value, middle: value, affluent: value, rich: value });

/** People's lives: tiers, yearly rates, the news feed, requests and care (src/content/balance/people.yaml). */
export const peopleBalanceSchema = z.strictObject({
  tiers: z.strictObject({
    /** Family and partners: always close. */
    closeKinds: z.array(relationshipKindSchema).min(1),
    /** Friends this fond of you are close too. */
    closeAffection: z.int().min(0).max(100),
    /** Followed in less detail: the rest of your friends, relatives, exes and the people you work with. Everyone else is far. */
    nearKinds: z.array(relationshipKindSchema).min(1),
  }),
  /** What changes in a life each year, by tier. */
  domains: z.strictObject({ close: z.array(lifeDomainSchema), near: z.array(lifeDomainSchema), far: z.array(lifeDomainSchema) }),
  news: z.strictObject({
    /** The most lines a year's feed keeps (the biggest news first)... */
    maxPerYear: z.int().min(1).max(30),
    /** ...and how many years of feeds are kept. */
    keepYears: z.int().min(1).max(20),
    /** The most lines one person gets in a year. */
    perPerson: z.int().min(1).max(5),
    /** Near and far people only make the news with these. */
    major: z.array(newsKindSchema).min(1),
  }),
  career: z.strictObject({
    /** A year's performance, rolled to find out how it goes (the careers balance turns it into promotions and firings). */
    performance: distributionSchema,
    /** The job market (0–100) the layoff chance is read at. */
    market: z.int().min(0).max(100),
    /** Yearly chance a working-age person without a job finds one, by age. */
    hire: curveSchema,
    /** The level someone is hired at, by age (rounded after a roll around it). */
    hireLevel: curveSchema,
    hireLevelSd: z.number().min(0).max(3),
    /** Yearly chance a working person changes to another track, by age. */
    switch: curveSchema,
    /** Yearly chance someone retires, by age. */
    retire: curveSchema,
    /** A job that needs a degree or license goes only to someone at least this smart. */
    credentialSmarts: z.int().min(0).max(100),
    /** How well a track fits someone's wealth: a weight by how many levels apart its starting pay and their wealth are. */
    trackFit: z.array(z.number().min(0)).min(2),
    /** Losing a job drags wealth toward this level, by the usual occupation weight. */
    unemployedWealth: familyWealthSchema,
  }),
  love: z.strictObject({
    /** Yearly chance a single adult starts dating, by age. */
    meet: curveSchema,
    /** Multiplies it in the years after a breakup, divorce or loss. */
    afterEnd: z.number().min(0).max(1),
    afterEndYears: z.int().min(0).max(20),
    /** Yearly chance of getting engaged after dating this many years... */
    engage: probability,
    engageAfterYears: z.int().min(0).max(20),
    /** Yearly chance of marrying once engaged. */
    marry: probability,
    /** Yearly chance a couple who aren't married break up, by years together... */
    breakup: curveSchema,
    /** ...times this for a couple who are engaged. */
    engagedBreakup: z.number().min(0).max(1),
    /** Yearly chance a married couple divorce, by years married. */
    divorce: curveSchema,
    /** A partner's age minus theirs, rolled between these (never under the adult age). */
    partnerAgeOffset: z.strictObject({ min: z.int().min(-30).max(30), max: z.int().min(-30).max(30) }),
  }),
  moving: z.strictObject({
    /** Yearly chance of moving to another city, by age. */
    rate: curveSchema,
    /** Of those who move, the chance they come to your city (if they're elsewhere). */
    towardYou: probability,
  }),
  /** How likely someone is to talk (0–100; used by the social web, E4): points per point of Sociability, per point of unkindness (100 − Kindness), and a base. */
  gossip: z.strictObject({ sociability: z.number().min(0).max(2), unkindness: z.number().min(0).max(2), base: z.int().min(0).max(100) }),
  children: z.strictObject({
    /** Yearly chance a couple tries for a baby, by how far along they are. */
    tryShare: z.strictObject({ dating: probability, engaged: probability, married: probability }),
    /** Multiplies it for each child they already have. */
    perChild: probability,
    /** The most children a person has. */
    max: z.int().min(0).max(12),
  }),
  growing: z.strictObject({
    /** Of the minors who come of age, the chance they leave for another city (college, work). */
    moveAway: probability,
  }),
  trouble: z.strictObject({
    /** Multiplies the onset chance of every illness and addiction. */
    illnessScale: z.number().min(0).max(5),
    /** The most troubles at once. */
    maxTroubles: z.int().min(1).max(6),
    /** What people's stats count as when a condition's onset reads one. */
    stats: z.strictObject({ stress: z.int().min(0).max(100), health: z.int().min(0).max(100), fitness: z.int().min(0).max(100) }),
    /** Vice from personality: a base, plus these points per point of Risk-taking above 50 and Discipline below 50. */
    vice: z.strictObject({ base: z.int().min(0).max(100), riskTaking: z.number().min(0).max(2), discipline: z.number().min(0).max(2) }),
    /** How easily wealth gets care: multiplies the chance a treatable condition is treated, and rehab. */
    access: perWealth(z.number().min(0).max(3)),
    /** Yearly chance an addiction goes into rehab on its own (times access). */
    rehab: probability,
    /** Years after recovering when a relapse can come, and its yearly chance. */
    relapse: z.strictObject({ years: z.int().min(0).max(30), chance: probability }),
    /** Serious enough to be bad news (and to ask something of you): severity from this up. */
    serious: z.int().min(1).max(100),
    /** Addictions this bad ask for an intervention. */
    intervention: z.int().min(1).max(100),
    /** Share of a condition's death chance that applies to the people you know. */
    deathScale: z.number().min(0).max(2),
    crime: z.strictObject({
      /** Yearly chance an adult is arrested, by age... */
      rate: curveSchema,
      /** ...times this by Risk-taking... */
      riskTaking: curveSchema,
      /** ...and by wealth. */
      wealth: perWealth(z.number().min(0).max(5)),
      /** A young person (under the adult age) is arrested less often: multiplies the chance. */
      juvenile: probability,
      /** Posting bail multiplies the weight of jail when the case is decided. */
      bailJail: z.number().min(0).max(1),
    }),
  }),
  requests: z.strictObject({
    /** The most requests in a year; they count toward the year's event budget. */
    maxPerYear: z.int().min(0).max(6),
    /** Someone you feel less for than this doesn't ask. */
    minAffection: z.int().min(0).max(100),
    /** Years before the same person can ask again. */
    personCooldownYears: z.int().min(0).max(20),
    /** You must be at least this old for any request to reach you. */
    minAge: z.int().min(0).max(30),
    /** Each trigger: the chance a change (or, for moneyTrouble, a year) leads to a request, and who may ask. */
    triggers: z.strictObject(
      Object.fromEntries(REQUEST_TRIGGERS.map((t) => [t, z.strictObject({ chance: probability, tiers: z.array(lifeTierSchema).min(1) })])) as Record<
        RequestTrigger,
        z.ZodObject<{ chance: typeof probability; tiers: z.ZodArray<typeof lifeTierSchema> }>
      >,
    ),
  }),
  care: z.strictObject({
    /** The youngest age someone needs care. */
    age: z.int().min(40).max(100),
    /** Yearly chance an older person needs care, by age. */
    needChance: curveSchema,
    /** Multiplies it for someone with a serious illness. */
    illnessBoost: z.number().min(1).max(10),
    /** What it costs you a year, at the national average (scaled to your city): a relative at your home, and paid care. */
    cost: z.strictObject({ home: z.int().min(0), paid: z.int().min(0) }),
    /** The most care can take of a year's gross income; the family and the public cover the rest. */
    incomeShare: z.number().min(0).max(1),
  }),
});
export type PeopleBalance = z.infer<typeof peopleBalanceSchema>;

/**
 * The events each trigger can queue (registries/people.yaml). The engine casts
 * the person whose life changed as `npc`; the event's requirements decide
 * whether it fits (their kind, your age and money, their situation).
 */
export const peopleRegistrySchema = z.strictObject({
  /** When several people ask in a year, the most pressing trigger first; every trigger exactly once. */
  priority: z
    .array(requestTriggerSchema)
    .refine((list) => new Set(list).size === REQUEST_TRIGGERS.length && list.length === REQUEST_TRIGGERS.length, 'list every trigger exactly once'),
  requests: z.strictObject(
    Object.fromEntries(REQUEST_TRIGGERS.map((t) => [t, z.strictObject({ events: z.array(idSchema).min(1) })])) as Record<
      RequestTrigger,
      z.ZodObject<{ events: z.ZodArray<typeof idSchema> }>
    >,
  ),
});
export type PeopleRegistry = z.infer<typeof peopleRegistrySchema>;

/** News lines (text/news.yaml): alternative wordings for each kind of change. */
export const newsTextSchema = z.strictObject({
  lines: z.strictObject(Object.fromEntries(NEWS_KINDS.map((k) => [k, z.array(templateSchema).min(1)])) as Record<NewsKind, z.ZodArray<typeof templateSchema>>),
});
export type NewsText = z.infer<typeof newsTextSchema>;
