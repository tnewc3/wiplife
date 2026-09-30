/**
 * Event content (docs/technical.md, sections M and N, and the Content
 * Pipeline). Events live in src/content/events/<lifeStage>/<category>/ as one
 * file per event, or as <chain>.chain.yaml holding a chain's events together.
 */
import { z } from 'zod';
import { familyWealthSchema } from './balance';
import { baseDefSchema, idSchema } from './common';
import { templateSchema } from './text';

export const LIFE_STAGE_IDS = ['early', 'child', 'teen', 'youngAdult', 'adult', 'senior'] as const;
export const lifeStageSchema = z.enum(LIFE_STAGE_IDS);

export const STAT_KEYS = ['health', 'happiness', 'smarts', 'looks', 'fitness', 'stress'] as const;
export const TRAIT_KEYS = ['ambition', 'confidence', 'kindness', 'riskTaking', 'discipline', 'sociability'] as const;
/** Hidden values events may read or change (genetic risk and inner conflict belong to later systems). */
export const HIDDEN_KEYS = ['luck', 'reputation', 'vice'] as const;

export const relationshipKindSchema = z.enum([
  'parent',
  'stepparent',
  'sibling',
  'grandparent',
  'friend',
  'partner',
  'spouse',
  'ex',
  'coworker',
  'boss',
  'classmate',
  'acquaintance',
]);
/** Kinds casting may create; family, partners and work relationships come from other systems. */
export const CREATABLE_KINDS = ['friend', 'classmate', 'acquaintance'] as const;

export const toneSchema = z.enum(['light', 'neutral', 'serious', 'dark']);
export type Tone = z.infer<typeof toneSchema>;
export const raritySchema = z.enum(['common', 'uncommon', 'rare', 'legendary']);
export type Rarity = z.infer<typeof raritySchema>;

/** A role name in an event's cast, used in placeholders as {role.name}. */
const roleSchema = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'role names are lowerCamelCase, e.g. "npc" or "oldFriend"');

/** Comparison against a number; at least one bound. */
export const compareSchema = z
  .strictObject({
    gt: z.number().optional(),
    gte: z.number().optional(),
    lt: z.number().optional(),
    lte: z.number().optional(),
    eq: z.number().optional(),
  })
  .refine((c) => Object.keys(c).length > 0, 'needs at least one of gt, gte, lt, lte, eq');
export type Compare = z.infer<typeof compareSchema>;

const compareFields = {
  gt: z.number().optional(),
  gte: z.number().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  eq: z.number().optional(),
};
const hasBound = (c: Record<string, unknown>) => ['gt', 'gte', 'lt', 'lte', 'eq'].some((k) => c[k] !== undefined);

const flagValueSchema = z.union([z.number(), z.boolean(), z.string()]);

/**
 * Structured conditions (docs/technical.md, "Condition language"). Adding a
 * condition type means adding a case here and in src/engine/conditions.ts.
 */
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { age: Compare }
  | { lifeStage: (typeof LIFE_STAGE_IDS)[number][] }
  | ({ stat: (typeof STAT_KEYS)[number] } & Compare)
  | ({ trait: (typeof TRAIT_KEYS)[number] } & Compare)
  | ({ hidden: (typeof HIDDEN_KEYS)[number] } & Compare)
  | { money: Compare }
  | { city: string }
  | { familyWealth: z.infer<typeof familyWealthSchema>[] }
  | { flag: string; eq?: number | boolean | string }
  | { fired: string }
  | { relative: { kind: z.infer<typeof relationshipKindSchema>; alive?: boolean } }
  | { memory: { role: string; tag: string } }
  | { role: string; alive?: boolean; age?: Compare; affection?: Compare; trust?: Compare };

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(conditionSchema).min(1) }),
    z.strictObject({ any: z.array(conditionSchema).min(1) }),
    z.strictObject({ not: conditionSchema }),
    z.strictObject({ age: compareSchema }),
    z.strictObject({ lifeStage: z.array(lifeStageSchema).min(1) }),
    z.strictObject({ stat: z.enum(STAT_KEYS), ...compareFields }).refine(hasBound, 'needs a bound'),
    z.strictObject({ trait: z.enum(TRAIT_KEYS), ...compareFields }).refine(hasBound, 'needs a bound'),
    z.strictObject({ hidden: z.enum(HIDDEN_KEYS), ...compareFields }).refine(hasBound, 'needs a bound'),
    z.strictObject({ money: compareSchema }),
    z.strictObject({ city: idSchema }),
    z.strictObject({ familyWealth: z.array(familyWealthSchema).min(1) }),
    z.strictObject({ flag: idSchema, eq: flagValueSchema.optional() }),
    z.strictObject({ fired: idSchema }),
    z.strictObject({ relative: z.strictObject({ kind: relationshipKindSchema, alive: z.boolean().optional() }) }),
    z.strictObject({ memory: z.strictObject({ role: roleSchema, tag: idSchema }) }),
    z.strictObject({
      role: roleSchema,
      alive: z.boolean().optional(),
      age: compareSchema.optional(),
      affection: compareSchema.optional(),
      trust: compareSchema.optional(),
    }),
  ]),
) as z.ZodType<Condition>;

const rangeSchema = z
  .strictObject({ min: z.int(), max: z.int() })
  .refine((r) => r.min <= r.max, 'min must not be greater than max');

/** How an event finds (or creates) the person for one role. */
export const castSpecSchema = z.strictObject({
  kind: relationshipKindSchema,
  /** Their age minus yours, for existing people and new ones. */
  ageOffset: rangeSchema.optional(),
  /** Their age in years, for existing people and new ones. */
  age: rangeSchema.optional(),
  /** Create someone new when nobody fits (friend, classmate or acquaintance only). */
  createIfMissing: z.boolean().optional(),
  /** Chance of creating someone new even when someone fits. */
  newChance: z.number().min(0).max(1).optional(),
});
export type CastSpec = z.infer<typeof castSpecSchema>;

const statKeySchema = z.enum([...STAT_KEYS, ...TRAIT_KEYS, ...HIDDEN_KEYS]);
export type EffectStatKey = z.infer<typeof statKeySchema>;

/** Effect types. Adding one means a schema here and a handler in src/engine/events/effects.ts. */
export const effectSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('stat'), key: statKeySchema, delta: z.int().min(-100).max(100) }),
  /** Savings only until Stage 6; savings never go below zero. */
  z.strictObject({ type: z.literal('money'), delta: z.int().min(-1_000_000_000).max(1_000_000_000) }),
  z.strictObject({
    type: z.literal('relationship'),
    role: roleSchema,
    affection: z.int().min(-100).max(100).optional(),
    trust: z.int().min(-100).max(100).optional(),
    status: z.enum(['active', 'estranged', 'ended']).optional(),
    kind: relationshipKindSchema.optional(),
  }),
  z.strictObject({ type: z.literal('memory'), role: roleSchema, tag: idSchema }),
  z.strictObject({ type: z.literal('flag'), key: idSchema, value: flagValueSchema }),
  z.strictObject({
    type: z.literal('schedule'),
    eventId: idSchema,
    /** Years from now; at least 1, so the follow-up comes in a later year. */
    inYears: z.tuple([z.int().min(1), z.int().min(1)]).refine(([a, b]) => a <= b, 'inYears must be [min, max]'),
    /** Roles carried over to the follow-up (same role names). */
    cast: z.array(roleSchema).optional(),
  }),
  z.strictObject({ type: z.literal('history'), text: templateSchema, importance: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
  z.strictObject({ type: z.literal('death'), cause: idSchema }),
]);
export type Effect = z.infer<typeof effectSchema>;

export const outcomeSchema = z.strictObject({
  text: templateSchema.optional(),
  effects: z.array(effectSchema).default([]),
});
export type Outcome = z.infer<typeof outcomeSchema>;

export const checkSchema = z.strictObject({
  /** Success chance in percent before stats. */
  base: z.number().min(0).max(100),
  /** Each stat adds weight × (value − 50) percentage points. */
  stats: z.array(z.strictObject({ key: statKeySchema, weight: z.number().min(-2).max(2) })).min(1),
  success: outcomeSchema,
  failure: outcomeSchema,
});
export type Check = z.infer<typeof checkSchema>;

export const choiceSchema = z
  .strictObject({
    id: idSchema,
    label: z.string().trim().min(1).max(60),
    visibleIf: conditionSchema.optional(),
    outcome: outcomeSchema.optional(),
    check: checkSchema.optional(),
  })
  .refine((c) => (c.outcome === undefined) !== (c.check === undefined), 'a choice needs exactly one of outcome or check');
export type ChoiceDef = z.infer<typeof choiceSchema>;

export const eventSchema = baseDefSchema
  .extend({
    title: z.string().trim().min(1).max(60),
    text: templateSchema,
    tone: toneSchema,
    category: idSchema,
    rarity: raritySchema,
    lifeStages: z.array(lifeStageSchema).min(1),
    requires: conditionSchema.optional(),
    weight: z.strictObject({
      base: z.number().positive(),
      modifiers: z.array(z.strictObject({ if: conditionSchema, x: z.number().nonnegative() })).optional(),
    }),
    cooldownYears: z.int().min(1).optional(),
    once: z.boolean().optional(),
    /** Only happens when scheduled by another event (the later steps of a chain). */
    followUpOnly: z.boolean().optional(),
    cast: z.record(roleSchema, castSpecSchema).optional(),
    choices: z.array(choiceSchema).min(2).max(4).optional(),
    autoOutcome: outcomeSchema.optional(),
  })
  .refine((e) => (e.choices === undefined) !== (e.autoOutcome === undefined), 'an event needs either choices or autoOutcome')
  .refine((e) => !e.choices || new Set(e.choices.map((c) => c.id)).size === e.choices.length, 'choice ids must be unique');
export type EventDef = z.infer<typeof eventSchema>;

/** A chain file: several events written together. */
export const chainFileSchema = z.strictObject({
  chain: idSchema,
  events: z.array(eventSchema).min(2),
});

/** Every memory tag, with readable text (registries/memories.yaml). */
export const memoryRegistrySchema = z.strictObject({ tags: z.record(idSchema, z.string().trim().min(1).max(120)) });
/** Every flag, with a one-line description (registries/flags.yaml). */
export const flagRegistrySchema = z.strictObject({ flags: z.record(idSchema, z.string().trim().min(1).max(200)) });
/** Event categories (registries/categories.yaml). */
export const categoryRegistrySchema = z.strictObject({
  categories: z.record(
    idSchema,
    z.strictObject({
      label: z.string().trim().min(1).max(40),
      /** After an event of this category, others of it wait this many years. */
      cooldownYears: z.int().min(1).optional(),
    }),
  ),
});
