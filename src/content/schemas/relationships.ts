/**
 * Relationships (docs/design.md, section H; docs/technical.md, Stage 5):
 * relationship kinds and statuses, the relationship balance numbers and the
 * management actions registry.
 */
import { z } from 'zod';
import { curveSchema } from './balance';
import { idSchema, scoreSchema } from './common';

export const RELATIONSHIP_KINDS = [
  'parent',
  'stepparent',
  'sibling',
  'grandparent',
  'relative',
  'child',
  'stepchild',
  'grandchild',
  'friend',
  'partner',
  'fiance',
  'spouse',
  'ex',
  'coworker',
  'boss',
  'classmate',
  'teacher',
  'acquaintance',
] as const;
export const relationshipKindSchema = z.enum(RELATIONSHIP_KINDS);
export type RelationshipKindId = z.infer<typeof relationshipKindSchema>;

export const RELATIONSHIP_STATUSES = ['active', 'estranged', 'ended'] as const;
export const relationshipStatusSchema = z.enum(RELATIONSHIP_STATUSES);

/** The player's romantic situation, for conditions: no partner, dating, engaged or married. */
export const ROMANCE_STATUSES = ['single', 'dating', 'engaged', 'married'] as const;
export const romanceStatusSchema = z.enum(ROMANCE_STATUSES);
export type RomanceStatus = z.infer<typeof romanceStatusSchema>;

/** Management actions on a person's page (docs/design.md, section H). */
export const ACTION_IDS = ['ask_out', 'propose', 'move_in', 'marry', 'break_up', 'divorce', 'cut_contact', 'reconcile', 'try_for_baby'] as const;
export const actionIdSchema = z.enum(ACTION_IDS);
export type ActionId = z.infer<typeof actionIdSchema>;

/** One number per relationship kind. */
const perKind = <T extends z.ZodType>(value: T) =>
  z.strictObject(Object.fromEntries(RELATIONSHIP_KINDS.map((k) => [k, value])) as Record<RelationshipKindId, T>);

/** Relationship drift, pruning, actions and support (src/content/balance/relationships.yaml). */
export const relationshipsBalanceSchema = z.strictObject({
  /**
   * Romance needs both people at least this old. Never below 18: dating and
   * romance are for adults only (AGENTS.md), so the schema refuses lower.
   */
  adultAge: z.int().min(18).max(30),
  drift: z.strictObject({
    /** Affection lost each year without a new memory, by kind. Fractions are lost by chance. */
    perYear: perKind(z.number().min(0).max(20)),
    /** Drift never takes affection below this, by kind. */
    floor: perKind(scoreSchema),
    /** No drift for someone you made a memory with within this many years. */
    graceYears: z.int().min(0).max(20),
    /** Multiplies drift, by your Kindness: kind people keep their people. */
    kindness: curveSchema,
  }),
  prune: z.strictObject({
    /** Acquaintances and classmates with no new memory for this many years drop out of your life. */
    forgetAfterYears: z.int().min(1).max(100),
    /** Batch 3: classmates and teachers who are no longer in your class or school fade after this many years without a new memory. */
    schoolForgetAfterYears: z.int().min(0).max(20),
    /** Friends and other non-family people whose affection falls to this drift apart. */
    driftApartAt: scoreSchema,
    /** Most people outside family and romance who stay in your life; the least close go first. */
    maxPeople: z.int().min(5).max(500),
  }),
  actions: z.strictObject({
    /** Youngest age to cut contact with or reconcile with family, and with anyone else. */
    minAge: z.strictObject({ family: z.int().min(0).max(100), others: z.int().min(0).max(100) }),
    /** Years dating before you can propose. */
    proposeAfterYears: z.int().min(0).max(20),
    /** Years engaged before the wedding. */
    marryAfterYears: z.int().min(0).max(20),
  }),
  /**
   * How much younger and older than you (in years) a new potential partner
   * can be, by your age. Never younger than adultAge.
   */
  meeting: z.strictObject({ younger: curveSchema, older: curveSchema }),
  /** Who steps in during a crisis: someone close whose trust and affection reach these. */
  support: z.strictObject({ minTrust: scoreSchema, minAffection: scoreSchema }),
  /**
   * B1: the "Find a date" life action. Each way has the chance it brings someone new and what it costs (base-currency
   * dollars, scaled by where you live). Each attempt this year multiplies the chance by repeatFactor, and at most
   * yearlyMax attempts a year.
   */
  findDate: z.strictObject({
    app: z.strictObject({ chance: z.number().min(0).max(1), cost: z.number().min(0).max(1000) }),
    friend: z.strictObject({ chance: z.number().min(0).max(1), cost: z.number().min(0).max(1000) }),
    night_out: z.strictObject({ chance: z.number().min(0).max(1), cost: z.number().min(0).max(1000) }),
    repeatFactor: z.number().min(0).max(1),
    yearlyMax: z.int().min(1).max(10),
  }),
});
export type RelationshipsBalance = z.infer<typeof relationshipsBalanceSchema>;

/**
 * Which events answer each management action (registries/actions.yaml). The
 * engine picks one that fits, by weight; the person acted on is cast as
 * `person`.
 */
export const actionRegistrySchema = z.strictObject({
  actions: z.strictObject(
    Object.fromEntries(ACTION_IDS.map((id) => [id, z.strictObject({ events: z.array(idSchema).min(1) })])) as Record<
      ActionId,
      z.ZodObject<{ events: z.ZodArray<typeof idSchema> }>
    >,
  ),
});
export type ActionRegistry = z.infer<typeof actionRegistrySchema>;

/** B1: the ways to look for a date (the "Find a date" life action). */
export const FIND_DATE_WAYS = ['app', 'friend', 'night_out'] as const;
export type FindDateWay = (typeof FIND_DATE_WAYS)[number];

/**
 * Which events answer "Find a date" (registries/love.yaml): one list per way, and the events for a try that brings
 * no one new. A way's events cast a new potential partner (the existing romantic casting) as `date`.
 */
export const loveRegistrySchema = z.strictObject({
  findDate: z.strictObject({
    app: z.array(idSchema).min(1),
    friend: z.array(idSchema).min(1),
    night_out: z.array(idSchema).min(1),
    nobody: z.array(idSchema).min(1),
  }),
});
export type LoveRegistry = z.infer<typeof loveRegistrySchema>;
