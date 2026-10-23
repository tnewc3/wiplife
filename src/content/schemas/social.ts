/**
 * Social media (Batch 8, docs/post-expansion1-changes.md): the platforms
 * (src/content/platforms), the niches an account can be about
 * (src/content/niches), the balance numbers (balance/social.yaml), the events
 * the social step queues (registries/social.yaml) and the lines it writes
 * (text/social.yaml).
 *
 * This is the one place in the game that uses real names, and only for the
 * platforms (decided 2026-10-15, see docs/expansion.md). The names are content,
 * so they can be swapped; there are no logos and no claim of partnership with or
 * endorsement by any platform, and no real people. The brands that sponsor you,
 * the networks and the awards are made up. Nothing here is romantic or sexual
 * for anyone under 18, and nothing a minor can meet is suggestive (the content
 * build checks it, tools/content/social.ts).
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { baseDefSchema, idSchema } from './common';

const probability = z.number().min(0).max(1);

/** What a platform is for. */
export const SOCIAL_CONTENT_KINDS = ['photo', 'short_video', 'text', 'long_video', 'live', 'audio'] as const;
/** How an account grows: one model for each kind of platform. */
export const SOCIAL_GROWTH_MODELS = ['photo_feed', 'short_video', 'text_feed', 'long_video', 'live_stream', 'audio_show'] as const;
export type SocialGrowthModel = (typeof SOCIAL_GROWTH_MODELS)[number];
/** How a platform pays: a share of ad money at a threshold, subscriptions and donations, a creator fund, ad reads, brand deals, a premium share. */
export const SOCIAL_PAY_MODELS = ['ad_share', 'subscriptions', 'creator_fund', 'ad_reads', 'brand_deals', 'premium_share'] as const;
export type SocialPayModel = (typeof SOCIAL_PAY_MODELS)[number];
/** How a post is made: safely, or by saying the bold thing. */
export const SOCIAL_TONES = ['safe', 'bold'] as const;
export type SocialTone = (typeof SOCIAL_TONES)[number];

/** A platform (src/content/platforms). */
export const socialPlatformSchema = baseDefSchema.extend({
  name: z.string().trim().min(2).max(24),
  blurb: z.string().trim().min(10).max(200),
  contentKind: z.enum(SOCIAL_CONTENT_KINDS),
  /** The button: "Post a photo". `noun` is the thing in a sentence ("photo"), `plural` more than one. */
  verb: z.string().trim().min(4).max(32),
  noun: z.string().trim().min(2).max(24),
  plural: z.string().trim().min(2).max(24),
  /** The youngest age to join (the country's rule can ask for more, balance/social.yaml age). */
  minAge: z.int().min(13).max(18),
  growth: z.enum(SOCIAL_GROWTH_MODELS),
  pay: z.enum(SOCIAL_PAY_MODELS),
  /** The ways into the social media career (src/content/fame/social.yaml routes) that start here. */
  routes: z.array(idSchema).default([]),
});
export type SocialPlatformDef = z.infer<typeof socialPlatformSchema>;

/** A niche an account is about (src/content/niches). */
export const socialNicheSchema = baseDefSchema.extend({
  name: z.string().trim().min(2).max(24),
  /** In a sentence ("gaming", "comedy"). */
  noun: z.string().trim().min(2).max(24),
  blurb: z.string().trim().min(10).max(160),
  /** What helps in it: your traits and stats, weighted (0–1). */
  fit: z.partialRecord(z.enum(['ambition', 'confidence', 'kindness', 'riskTaking', 'discipline', 'sociability', 'smarts', 'looks', 'fitness']), z.number().min(0).max(1)),
  /** A hidden talent that fits it. */
  talents: z.array(idSchema).default([]),
  /** How big the audience is (a multiplier on growth), how brands see it (on sponsorships) and how often it ends in a row (on controversy). */
  demand: z.number().min(0.4).max(2),
  brands: z.number().min(0.2).max(3),
  heat: z.number().min(0.2).max(3),
});
export type SocialNicheDef = z.infer<typeof socialNicheSchema>;

const growthModelSchema = z.strictObject({
  /** The yearly budget of posts, uploads, streams or episodes for a creator. */
  posts: z.int().min(1).max(200),
  /** Followers one average post wins from nothing, and the share of your followers it adds on top. */
  base: z.number().min(0).max(100_000),
  compound: z.number().min(0).max(0.5),
  /** An account under `newBelow` followers gets `newBoost` times the growth (how much the algorithm favours new accounts). */
  newBelow: z.int().min(0).max(1_000_000),
  newBoost: z.number().min(1).max(10),
  /** The share of followers lost in a year you posted all your budget and in a year you posted nothing. */
  fade: probability,
  idleFade: probability,
  /** A viral post multiplies your followers by this (at least `viralMin` are gained). */
  viral: z.number().min(1).max(20),
  viralMin: z.int().min(0).max(10_000_000),
  /** The most followers an account here can have: growth slows as it nears the number of people the platform can reach. */
  cap: z.int().min(1000).max(2_000_000_000),
});

const payModelSchema = z.strictObject({
  /** Followers you need before the platform pays. */
  threshold: z.int().min(0).max(100_000_000),
  /** Posts a year you need to make to keep earning. */
  minPosts: z.int().min(0).max(100),
  /** Dollars a year for each follower, for each post (when perPost) or at full activity; the engagement curve and your city's pay level scale it. */
  rate: z.number().min(0).max(100),
  perPost: z.boolean(),
});

const platformTuningSchema = z.strictObject({
  /** How much a follower here counts toward your reach, toward brand money, and how many of your fans from music, acting or sport follow you here (0–1). */
  reach: z.number().min(0).max(3),
  brand: z.number().min(0).max(3),
  cross: probability,
});

const findSchema = z.strictObject({ employer: probability, partner: probability, ex: probability, family: probability });

export const socialBalanceSchema = z.strictObject({
  handle: z.strictObject({ min: z.int().min(2).max(10), max: z.int().min(10).max(60) }),
  /** Who may join: 13, or more in a country that asks for more (the platform's own age counts too). */
  age: z.strictObject({ default: z.int().min(13).max(18), byCountry: z.record(idSchema, z.int().min(13).max(18)) }),
  /** A new account: followers from the people who know you (a base and a share of your Sociability), and where its quality and engagement begin. */
  start: z.strictObject({ followers: z.int().min(0).max(1000), perSociability: z.number().min(0).max(5), quality: z.int().min(0).max(100), engagement: z.int().min(0).max(100) }),
  budget: z.strictObject({
    /** A casual account (not on the social media career) gets this share of the platform's budget; so does anyone under 18 (a parent keeps an eye on it). */
    casualShare: probability,
    minorShare: probability,
    /** Each post this year on a platform counts this much of the one before it. */
    repeat: z.number().min(0.5).max(1),
    crossPromos: z.int().min(0).max(12),
    collabs: z.int().min(0).max(12),
    promos: z.int().min(0).max(12),
  }),
  quality: z.strictObject({
    base: z.number().min(0).max(60),
    aptitude: z.number().min(0).max(60),
    fit: z.number().min(0).max(30),
    craft: z.number().min(0).max(1),
    talent: z.number().min(0).max(30),
    noise: z.number().min(0).max(30),
    /** A bold post: quality moves by this and the roll spreads wider (× the noise). */
    bold: z.strictObject({ quality: z.number().min(-10).max(10), spread: z.number().min(1).max(3) }),
    /** An account's quality follows its posts by this share. */
    follow: probability,
    /** The kind of outcome a post had, by the reach multiplier it earned. */
    outcome: z.strictObject({ flat: z.number().min(0).max(2), strong: z.number().min(0).max(5) }),
  }),
  gain: z.strictObject({
    /** Reach multiplier by quality. */
    quality: curveSchema,
    /** A bold post's reach multiplier. */
    bold: z.number().min(0.5).max(3),
    /** Followers beyond this win less from the people you already have: the compounding term is divided by 1 + followers / knee. */
    knee: z.int().min(1000).max(100_000_000),
  }),
  viral: z.strictObject({
    /** The chance a post goes viral, by quality, and a bold post's multiplier. */
    chance: curveSchema,
    bold: z.number().min(1).max(5),
  }),
  growth: z.strictObject(Object.fromEntries(SOCIAL_GROWTH_MODELS.map((m) => [m, growthModelSchema])) as Record<SocialGrowthModel, typeof growthModelSchema>),
  engagement: z.strictObject({
    /** Engagement follows the average quality of the year's posts by this share; a year with none loses `idle` points. */
    follow: probability,
    idle: z.number().min(0).max(100),
    /** What engagement does to pay, brand money and reach (the multiplier by engagement). */
    factor: curveSchema,
  }),
  private: z.strictObject({ growth: probability, find: probability }),
  pay: z.strictObject(Object.fromEntries(SOCIAL_PAY_MODELS.map((m) => [m, payModelSchema])) as Record<SocialPayModel, typeof payModelSchema>),
  /** Sponsorships (a contract with a brand): money a year for each follower, by the terms and the rung of the brand. */
  sponsor: z.strictObject({
    rate: z.number().min(0).max(100),
    minFollowers: z.int().min(0).max(10_000_000),
    terms: z.strictObject({ standard: z.number().min(0).max(5), tough: z.number().min(0).max(5), generous: z.number().min(0).max(5) }),
    tier: z.array(z.number().min(0).max(5)).length(3),
  }),
  /** Platform-specific numbers, keyed by platform id (the content build checks every platform has them). */
  platforms: z.record(idSchema, platformTuningSchema),
  /** The career: reach, weighted by platform and engagement, becomes fame. */
  fame: z.strictObject({
    at: curveSchema,
    up: probability,
    down: probability,
    /** A viral break lifts you no higher than the rung your reach supports plus this many points of fame. */
    breakMargin: z.number().min(0).max(50),
    /** The scale legacy pay (the old retainer and releases of the social path) is cut to once you have accounts. */
    retainer: probability,
    project: probability,
  }),
  algorithm: z.strictObject({ chance: probability, minFollowers: z.int().min(0).max(1_000_000), up: probability, boost: z.number().min(1).max(5), drop: probability }),
  demonetize: z.strictObject({ chance: probability, bold: probability, years: z.int().min(1).max(5) }),
  burnout: z.strictObject({ share: probability, streak: z.int().min(1).max(10), chance: probability, burnout: z.number().min(0).max(100), stress: z.number().min(0).max(50) }),
  controversy: z.strictObject({
    minFollowers: z.int().min(0).max(10_000_000),
    chance: probability,
    bold: probability,
    /** What a cancellation costs: the share of followers lost, public image, fan mood and fame. */
    lose: probability,
    image: z.number().min(0).max(60),
    mood: z.number().min(0).max(60),
    fame: z.number().min(0).max(40),
    /** The share of followers that comes back each year after one, and a row you answer well. */
    recover: probability,
    cleared: probability,
  }),
  casual: z.strictObject({
    /** The chance a post is one you would not want certain people to see, a bold post's multiplier, and how many a year can count. */
    risky: probability,
    bold: z.number().min(1).max(10),
    max: z.int().min(1).max(30),
    /** The chance a risky post reaches each kind of person (public accounts; a private one is multiplied by private.find). */
    find: findSchema,
    /** More followers means more eyes: the extra chance for each thousand followers, and the most it adds. */
    perThousand: z.number().min(0).max(0.2),
    cap: z.number().min(0).max(2),
    /** The most posts found in a year. */
    maxFinds: z.int().min(0).max(5),
  }),
  crossover: z.strictObject({ follow: probability, minFans: z.int().min(0).max(1_000_000), share: z.number().min(0).max(2) }),
  promo: z.strictObject({ fans: z.number().min(0).max(1), mood: z.number().min(0).max(30), fame: z.number().min(0).max(10), minFollowers: z.int().min(0).max(1_000_000) }),
  cross: z.strictObject({ share: z.number().min(0).max(1), engagement: z.number().min(0).max(30), minFollowers: z.int().min(0).max(1_000_000) }),
  collab: z.strictObject({
    /** The share of the people you know who make content, and how many followers they have (by a roll of 0 to 100). */
    creators: probability,
    followers: curveSchema,
    share: z.number().min(0).max(1),
    affection: z.int().min(0).max(30),
    drama: probability,
    minAge: z.int().min(13).max(40),
    /** How far apart in age two people can be to make something together when one is under 18 (everyone else is an adult). */
    gap: z.int().min(0).max(10),
  }),
  events: z.strictObject({ maxQueued: z.int().min(0).max(6) }),
});
export type SocialBalance = z.infer<typeof socialBalanceSchema>;

/** What the social step queues (registries/social.yaml): one list of events for each. */
export const SOCIAL_TRIGGERS = [
  'monetized',
  'viral',
  'viralCasual',
  'algorithmUp',
  'algorithmDown',
  'demonetized',
  'burnout',
  'controversy',
  'cancelled',
  'foundEmployer',
  'foundPartner',
  'foundEx',
  'foundFamily',
  'collab',
  'sponsor',
  'crossover',
  'minor',
  'milestone',
] as const;
export type SocialTrigger = (typeof SOCIAL_TRIGGERS)[number];

export const socialRegistrySchema = z.strictObject({
  triggers: z.strictObject(
    Object.fromEntries(SOCIAL_TRIGGERS.map((id) => [id, z.strictObject({ events: z.array(idSchema).min(1) })])) as Record<SocialTrigger, z.ZodObject<{ events: z.ZodArray<typeof idSchema> }>>,
  ),
});
export type SocialRegistry = z.infer<typeof socialRegistrySchema>;

const historyLine = z.strictObject({ importance: z.union([z.literal(1), z.literal(2), z.literal(3)]), variants: z.array(z.string().trim().min(1)).min(1) });

export const SOCIAL_HISTORY_KEYS = ['opened', 'monetized', 'viral', 'demonetized', 'burnout', 'cancelled', 'sponsor', 'found'] as const;
export type SocialHistoryKey = (typeof SOCIAL_HISTORY_KEYS)[number];

/** The words the social media systems use (text/social.yaml). */
export const socialTextSchema = z.strictObject({
  history: z.strictObject(Object.fromEntries(SOCIAL_HISTORY_KEYS.map((k) => [k, historyLine])) as Record<SocialHistoryKey, typeof historyLine>),
  /** How many followers read in words, from the smallest count that reads that way. Values: none. */
  followers: z.array(z.strictObject({ from: z.int().min(0), text: z.string().trim().min(3).max(60) })).min(4),
  /** How engaged an audience reads, from the smallest engagement. */
  engagement: z.array(z.strictObject({ from: z.int().min(0).max(100), text: z.string().trim().min(3).max(60) })).min(3),
  /** What a post's outcome reads as: {platform}, {handle}. */
  outcomes: z.strictObject({ flat: z.array(z.string().trim().min(8)).min(2), steady: z.array(z.string().trim().min(8)).min(2), strong: z.array(z.string().trim().min(8)).min(2), viral: z.array(z.string().trim().min(8)).min(2) }),
  /** Handle suggestions: a word from each list, in either order, with a number or without. */
  handleWords: z.strictObject({ first: z.array(z.string().trim().regex(/^[a-z]+$/)).min(10), second: z.array(z.string().trim().regex(/^[a-z]+$/)).min(10) }),
  /** Handles nobody may take: the platforms' own words and the like (whole handles), and words no handle may contain. */
  reserved: z.array(z.string().trim().regex(/^[a-z0-9_.]+$/)).min(3),
  blocked: z.array(z.string().trim().regex(/^[a-z]+$/)).min(3),
  /** The headlines the tabloids run about a creator (Values: {name}). */
  tabloid: z.strictObject({ cancelled: z.array(z.string().trim().min(8)).min(2), post: z.array(z.string().trim().min(8)).min(2) }),
});
export type SocialText = z.infer<typeof socialTextSchema>;

/** The text values social events can use: see src/engine/social/text.ts. */
export const SOCIAL_TEXT_VALUES = ['platform', 'handle', 'followerWords', 'niche', 'postNoun'] as const;
