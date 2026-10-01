/**
 * Event content (docs/technical.md, sections M and N, and the Content
 * Pipeline). Events live in src/content/events/<lifeStage>/<category>/ as one
 * file per event, or as <chain>.chain.yaml holding a chain's events together.
 */
import { z } from 'zod';
import { familyWealthSchema } from './balance';
import { baseDefSchema, HIDDEN_KEYS, idSchema, scoreKeySchema, STAT_KEYS, TRAIT_KEYS } from './common';
import { debtKindSchema, housingKindSchema, lifestyleSchema } from './economy';
import { credentialTypeSchema, programSchema, tierSchema } from './education';
import { relationshipKindSchema, relationshipStatusSchema, romanceStatusSchema } from './relationships';
import { templateSchema } from './text';

export const LIFE_STAGE_IDS = ['early', 'child', 'teen', 'youngAdult', 'adult', 'senior'] as const;
export const lifeStageSchema = z.enum(LIFE_STAGE_IDS);


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
  | { romance: z.infer<typeof romanceStatusSchema>[] }
  | { finances: FinancesCondition }
  | { home: HomeCondition }
  | { education: EducationCondition }
  | { memory: { role: string; tag: string } }
  | {
      role: string;
      alive?: boolean;
      age?: Compare;
      affection?: Compare;
      trust?: Compare;
      kind?: z.infer<typeof relationshipKindSchema>[];
      status?: z.infer<typeof relationshipStatusSchema>[];
      /** Years since the relationship took its current kind (dating, married...). */
      years?: Compare;
    };

/** Your money situation. Every field given must hold. */
export interface FinancesCondition {
  /** Total debt balance. */
  debt?: Compare;
  /** Most missed payments in a row on any one debt. */
  missed?: Compare;
  /** True: a debt is in collections; false: none is. */
  collections?: boolean;
  /** You have a debt of one of these kinds. */
  kinds?: z.infer<typeof debtKindSchema>[];
  lifestyle?: z.infer<typeof lifestyleSchema>[];
  /** Doing gig work (or not). */
  gig?: boolean;
  /** Filed for bankruptcy within this many years. */
  bankruptWithin?: number;
  /** Set up a debt plan within this many years. */
  planWithin?: number;
  /** Last year's gross income. */
  income?: Compare;
}

/** Where you live. Every field given must hold. */
export interface HomeCondition {
  kind?: z.infer<typeof housingKindSchema>[];
  /** Years since you moved into this home. */
  years?: Compare;
  /** Sharing a rental with a roommate (or not). */
  roommate?: boolean;
  /** Living in a different city from the one you were born in (or not). */
  relocated?: boolean;
  /** Your partner or spouse lives with you (or not). */
  partner?: boolean;
}

/** School and credentials (Stage 7). Every field given must hold. */
export interface EducationCondition {
  /** The program you're in now; 'none' when you're not in school. */
  program?: (z.infer<typeof programSchema> | 'none')[];
  /** College tier you're in now. */
  tier?: z.infer<typeof tierSchema>[];
  /** Your major now (college). */
  major?: string[];
  /** Your trade now (trade school). */
  trade?: string[];
  /** The year of your current program (1 is the first). */
  year?: Compare;
  /** In (or not in) the final year of your current program. */
  final?: boolean;
  /** GPA in your current program (0–4). */
  gpa?: Compare;
  /** You hold at least one of these credentials. */
  credential?: z.infer<typeof credentialTypeSchema>[];
  /** You left a program before finishing it (and could go back), or not. */
  left?: boolean;
  /** You have a place to start at next year, or not. */
  admission?: boolean;
}

const atLeastOneField = (c: Record<string, unknown>) => Object.values(c).some((v) => v !== undefined);

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
    z.strictObject({ romance: z.array(romanceStatusSchema).min(1) }),
    z.strictObject({
      finances: z
        .strictObject({
          debt: compareSchema.optional(),
          missed: compareSchema.optional(),
          collections: z.boolean().optional(),
          kinds: z.array(debtKindSchema).min(1).optional(),
          lifestyle: z.array(lifestyleSchema).min(1).optional(),
          gig: z.boolean().optional(),
          bankruptWithin: z.int().min(1).max(100).optional(),
          planWithin: z.int().min(1).max(100).optional(),
          income: compareSchema.optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      home: z
        .strictObject({
          kind: z.array(housingKindSchema).min(1).optional(),
          years: compareSchema.optional(),
          roommate: z.boolean().optional(),
          relocated: z.boolean().optional(),
          partner: z.boolean().optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      education: z
        .strictObject({
          program: z.array(z.union([programSchema, z.literal('none')])).min(1).optional(),
          tier: z.array(tierSchema).min(1).optional(),
          major: z.array(idSchema).min(1).optional(),
          trade: z.array(idSchema).min(1).optional(),
          year: compareSchema.optional(),
          final: z.boolean().optional(),
          gpa: compareSchema.optional(),
          credential: z.array(credentialTypeSchema).min(1).optional(),
          left: z.boolean().optional(),
          admission: z.boolean().optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({ memory: z.strictObject({ role: roleSchema, tag: idSchema }) }),
    z.strictObject({
      role: roleSchema,
      alive: z.boolean().optional(),
      age: compareSchema.optional(),
      affection: compareSchema.optional(),
      trust: compareSchema.optional(),
      kind: z.array(relationshipKindSchema).min(1).optional(),
      status: z.array(relationshipStatusSchema).min(1).optional(),
      years: compareSchema.optional(),
    }),
  ]),
) as z.ZodType<Condition>;

const rangeSchema = z
  .strictObject({ min: z.int(), max: z.int() })
  .refine((r) => r.min <= r.max, 'min must not be greater than max');

/** How an event finds (or creates) the person for one role. */
export const castSpecSchema = z
  .strictObject({
    /** Someone with this relationship to you. Every role needs a kind, unless it is a support role. */
    kind: relationshipKindSchema.optional(),
    /**
     * A support role: the most trusted person who would step in for you
     * (trust and affection from balance/relationships.yaml support), of any
     * close kind. Never creates anyone.
     */
    support: z.boolean().optional(),
    /**
     * A potential partner: an adult you're attracted to who is attracted to
     * you, found or (with createIfMissing) created. Never family.
     */
    romantic: z.boolean().optional(),
    /**
     * When nobody fits, the event still happens with this role empty. The role
     * may then only be used in choices whose visibleIf requires it ({ role: name }).
     */
    optional: z.boolean().optional(),
    /** Their age minus yours, for existing people and new ones. */
    ageOffset: rangeSchema.optional(),
    /** Their age in years, for existing people and new ones. */
    age: rangeSchema.optional(),
    /** Create someone new when nobody fits (friend, classmate or acquaintance only). */
    createIfMissing: z.boolean().optional(),
    /** Chance of creating someone new even when someone fits. */
    newChance: z.number().min(0).max(1).optional(),
  })
  .refine((s) => (s.kind === undefined) !== (s.support !== true), 'a role needs exactly one of kind or support: true')
  .refine(
    (s) => s.support !== true || (!s.createIfMissing && s.newChance === undefined && !s.romantic),
    'a support role finds someone you know: no createIfMissing, newChance or romantic',
  );
export type CastSpec = z.infer<typeof castSpecSchema>;

const statKeySchema = scoreKeySchema;

/** Effect types. Adding one means a schema here and a handler in src/engine/events/effects.ts. */
export const effectSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('stat'), key: statKeySchema, delta: z.int().min(-100).max(100) }),
  /**
   * Savings. Savings never go below zero: from the independence age, a cost
   * larger than your savings leaves the rest as personal debt (a child's
   * family covers it).
   */
  z.strictObject({ type: z.literal('money'), delta: z.int().min(-1_000_000_000).max(1_000_000_000) }),
  /**
   * Debt (adults only; refused before the independence age). add: a new
   * student, personal or medical debt of `amount`. forgive: `share` of every
   * debt of `kinds` (default: all but the mortgage) is written off.
   * bankruptcy: personal, medical and collections debt is cleared. plan: a
   * debt plan (personal, medical and collections debt rolled into one loan).
   */
  z
    .strictObject({
      type: z.literal('debt'),
      action: z.enum(['add', 'forgive', 'bankruptcy', 'plan']),
      kind: z.enum(['student', 'personal', 'medical']).optional(),
      amount: z.int().min(1).max(100_000_000).optional(),
      kinds: z.array(debtKindSchema).min(1).optional(),
      share: z.number().gt(0).max(1).optional(),
    })
    .refine((e) => (e.action === 'add') === (e.kind !== undefined && e.amount !== undefined), 'add needs kind and amount (and only add has them)')
    .refine((e) => (e.action === 'forgive') === (e.share !== undefined), 'forgive needs share (and only forgive has it)')
    .refine((e) => e.kinds === undefined || e.action === 'forgive', 'only forgive takes kinds'),
  /**
   * Where you live (adults only). move_home: back in with a parent who would
   * have you. rent: a rental in your city. homeless: out on the street.
   * roommate / live_alone: share your rental or stop sharing. sell: sell your
   * home and rent. move_in_together: `role` (your partner, fiancé or spouse)
   * moves in with you and pays their share. The engine ignores a move that
   * doesn't fit (no parent to go to, a home you own and haven't sold...).
   */
  z
    .strictObject({
      type: z.literal('housing'),
      action: z.enum(['move_home', 'rent', 'homeless', 'roommate', 'live_alone', 'sell', 'move_in_together']),
      role: roleSchema.optional(),
    })
    .refine((e) => (e.action === 'move_in_together') === (e.role !== undefined), 'move_in_together needs role (and only it has one)'),
  /**
   * School (Stage 7). grades: `value` GPA points (−1 to 1) added to this
   * school year's grade (while you're in school). scholarship: `value`
   * dollars that pay future tuition. drop_out / expel: you leave high school
   * (from the dropout age), college, trade school or grad school; you can go
   * back later. The engine ignores what doesn't fit (no school, too young).
   */
  z
    .strictObject({
      type: z.literal('education'),
      action: z.enum(['grades', 'scholarship', 'drop_out', 'expel']),
      value: z.number().optional(),
    })
    .refine(
      (e) =>
        e.action === 'grades'
          ? e.value !== undefined && e.value >= -1 && e.value <= 1 && e.value !== 0
          : e.action === 'scholarship'
            ? e.value !== undefined && Number.isInteger(e.value) && e.value >= 1 && e.value <= 1_000_000
            : e.value === undefined,
      'grades needs a value from -1 to 1; scholarship a whole-dollar value from 1 to 1,000,000; drop_out and expel take no value',
    ),
  z.strictObject({
    type: z.literal('relationship'),
    role: roleSchema,
    affection: z.int().min(-100).max(100).optional(),
    trust: z.int().min(-100).max(100).optional(),
    status: relationshipStatusSchema.optional(),
    /** Changes the kind (a friend becomes a partner); the engine refuses changes that break the relationship rules. */
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

const checkWeightSchema = z.number().min(-2).max(2);
/** A character stat, trait or hidden value; or how a cast person feels about you. */
export const checkStatSchema = z.union([
  z.strictObject({ key: statKeySchema, weight: checkWeightSchema }),
  z.strictObject({ role: roleSchema, key: z.enum(['affection', 'trust']), weight: checkWeightSchema }),
]);
export type CheckStat = z.infer<typeof checkStatSchema>;

export const checkSchema = z.strictObject({
  /** Success chance in percent before stats. */
  base: z.number().min(0).max(100),
  /** Each stat adds weight × (value − 50) percentage points. */
  stats: z.array(checkStatSchema).min(1),
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
    /**
     * Only happens when scheduled by another event (the later steps of a
     * chain) or queued by a management action (registries/actions.yaml).
     */
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

/**
 * Every memory tag, with readable text (registries/memories.yaml). The text is
 * a template: the person the memory is about is cast as {npc}.
 */
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
      /** Dating, sex and romance: adults only, enforced by the engine and the content build. */
      romance: z.boolean().optional(),
    }),
  ),
});
