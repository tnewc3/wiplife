/**
 * Event content (docs/technical.md, sections M and N, and the Content
 * Pipeline). Events live in src/content/events/<lifeStage>/<category>/ as one
 * file per event, or as <chain>.chain.yaml holding a chain's events together.
 */
import { z } from 'zod';
import { familyWealthSchema } from './balance';
import {
  baseDefSchema,
  HIDDEN_KEYS,
  idSchema,
  LATENT_KINDS,
  scoreKeySchema,
  STAT_KEYS,
  TRAIT_KEYS,
} from './common';
import { debtKindSchema, housingKindSchema, lifestyleSchema } from './economy';
import { familyProcessSchema, parentingKeySchema } from './family';
import { credentialTypeSchema, programSchema, tierSchema } from './education';
import { relationshipKindSchema, relationshipStatusSchema, romanceStatusSchema } from './relationships';
import { templateSchema } from './text';

export const LIFE_STAGE_IDS = ['early', 'child', 'teen', 'youngAdult', 'adult', 'senior'] as const;
export const lifeStageSchema = z.enum(LIFE_STAGE_IDS);


/** Where a cast person must be (C1, the presence rule). */
export const PRESENCE_VALUES = ['household', 'city', 'nearby', 'elsewhere', 'anywhere'] as const;
export type Presence = (typeof PRESENCE_VALUES)[number];

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
  | { career: CareerCondition }
  | { record: RecordCondition }
  | { health: HealthCondition }
  | { legal: LegalCondition }
  | { discovery: DiscoveryCondition }
  | { family: FamilyCondition }
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
      /** C1: where they are: living with you, elsewhere in your city, or in another city. */
      where?: ('household' | 'city' | 'elsewhere')[];
      /** E2a: a child's grades this school year (0–4). */
      gpa?: Compare;
      /** E2a: your parenting style with this child (each line 0–100). */
      style?: Partial<Record<'warmth' | 'strictness' | 'involvement', Compare>>;
      /** E2a: where a child lives: with you, in shared custody, or with their other parent. */
      custody?: ('you' | 'shared' | 'other')[];
      /** E2a: a grown child has moved out (or not). */
      movedOut?: boolean;
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
  /**
   * You hold a credential in one of these majors, trades or grad programs
   * (Stage 8; of a type in `credential`, when that is given too).
   */
  field?: string[];
  /** You left a program before finishing it (and could go back), or not. */
  left?: boolean;
  /** You have a place to start at next year, or not. */
  admission?: boolean;
}

/** Your work (Stage 8). Every field given must hold. */
export interface CareerCondition {
  /** You have a job (or not). Gig work doesn't count. */
  employed?: boolean;
  /** Your job is in one of these tracks. */
  job?: string[];
  /** Your level in your job (1 is the first). */
  level?: Compare;
  /** Whole years since you were hired. */
  years?: Compare;
  /** Your job performance (0–100). */
  performance?: Compare;
  /** You're retired (or not). */
  retired?: boolean;
  /** You were fired or laid off within this many years. */
  lostWithin?: number;
}

export const RECORD_OUTCOMES = ['warning', 'fine', 'probation', 'jail'] as const;

/**
 * Your criminal record (records themselves arrive in Stage 9): you have an
 * entry on it (with one of these outcomes, from within this many years).
 * `{ record: {} }` is any record at all.
 */
export interface RecordCondition {
  outcome?: (typeof RECORD_OUTCOMES)[number][];
  within?: number;
}

/**
 * Your health (Stage 9): you have one of these conditions (any, when left
 * out), treated or not and of this severity, as given. Every field given
 * must hold for the same condition.
 */
export interface HealthCondition {
  conditions?: string[];
  treated?: boolean;
  severity?: Compare;
}

/** The law (Stage 9): in prison, on probation (or not). */
export interface LegalCondition {
  incarcerated?: boolean;
  probation?: boolean;
}

/**
 * Self-discovery (Stage 9). latent: you have a latent trait of one of these
 * kinds; known: one of these latent traits has surfaced and you haven't
 * accepted it; innerConflict: how much you hold back; talent: a hidden talent
 * you haven't found ('hidden'), one you have ('found') or none at all.
 */
export interface DiscoveryCondition {
  latent?: (typeof LATENT_KINDS)[number][];
  known?: (typeof LATENT_KINDS)[number][];
  innerConflict?: Compare;
  talent?: 'hidden' | 'found' | 'none';
}

/**
 * Children and family (E2a). Every field given must hold. pregnant: you or
 * someone carrying your child is pregnant; children counts your living
 * children (not stepchildren), minors those under 18; youngest and oldest
 * their ages; process the adoption, IVF or surrogacy under way ('none': no
 * process); attempts the years of trying that haven't worked yet; canCarry
 * you can carry a pregnancy; support child support you 'pay' or 'receive'
 * (or 'none'); steps your living stepchildren; lost: you have lost a child.
 */
export interface FamilyCondition {
  pregnant?: boolean;
  children?: Compare;
  minors?: Compare;
  youngest?: Compare;
  oldest?: Compare;
  steps?: Compare;
  process?: (z.infer<typeof familyProcessSchema> | 'none')[];
  attempts?: Compare;
  canCarry?: boolean;
  support?: ('pay' | 'receive' | 'none')[];
  lost?: boolean;
}

const atLeastOneField = (c: Record<string, unknown>) => Object.values(c).some((v) => v !== undefined);
const latentKindSchema = z.enum(LATENT_KINDS);

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
          field: z.array(idSchema).min(1).optional(),
          left: z.boolean().optional(),
          admission: z.boolean().optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      career: z
        .strictObject({
          employed: z.boolean().optional(),
          job: z.array(idSchema).min(1).optional(),
          level: compareSchema.optional(),
          years: compareSchema.optional(),
          performance: compareSchema.optional(),
          retired: z.boolean().optional(),
          lostWithin: z.int().min(1).max(100).optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      record: z.strictObject({
        outcome: z.array(z.enum(RECORD_OUTCOMES)).min(1).optional(),
        within: z.int().min(1).max(120).optional(),
      }),
    }),
    z.strictObject({
      health: z
        .strictObject({
          conditions: z.array(idSchema).min(1).optional(),
          treated: z.boolean().optional(),
          severity: compareSchema.optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      legal: z
        .strictObject({ incarcerated: z.boolean().optional(), probation: z.boolean().optional() })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      discovery: z
        .strictObject({
          latent: z.array(latentKindSchema).min(1).optional(),
          known: z.array(latentKindSchema).min(1).optional(),
          innerConflict: compareSchema.optional(),
          talent: z.enum(['hidden', 'found', 'none']).optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      family: z
        .strictObject({
          pregnant: z.boolean().optional(),
          children: compareSchema.optional(),
          minors: compareSchema.optional(),
          youngest: compareSchema.optional(),
          oldest: compareSchema.optional(),
          steps: compareSchema.optional(),
          process: z.array(z.union([familyProcessSchema, z.literal('none')])).min(1).optional(),
          attempts: compareSchema.optional(),
          canCarry: z.boolean().optional(),
          support: z.array(z.enum(['pay', 'receive', 'none'])).min(1).optional(),
          lost: z.boolean().optional(),
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
      where: z.array(z.enum(['household', 'city', 'elsewhere'])).min(1).optional(),
      gpa: compareSchema.optional(),
      style: z.partialRecord(parentingKeySchema, compareSchema).optional(),
      custody: z.array(z.enum(['you', 'shared', 'other'])).min(1).optional(),
      movedOut: z.boolean().optional(),
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
     * Someone who is attracted to you, of a gender you're not (yet) attracted
     * to: the other person in a "try it and decide" moment (Stage 9). An
     * adult, never family; found or (with createIfMissing) created, leaning
     * toward a gender your latent attraction includes. A romance role: the
     * event is adults only.
     */
    admirer: z.boolean().optional(),
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
    /**
     * Where the person must be (C1, the presence rule): living with you
     * (household), in your city but not with you (city), either of those
     * (nearby, for in-person moments), in another city (elsewhere), or
     * anywhere at all. Casting picks only people who fit,
     * a scheduled follow-up whose person no longer fits doesn't happen, and
     * someone new is created in your city (so never for elsewhere or household).
     */
    presence: z.enum(PRESENCE_VALUES),
    /**
     * E2a: someone who has died (a child, in the events about losing them).
     * Never found by casting: the engine (or a scheduled follow-up) passes
     * them in. Needs presence anywhere, and the role can't be used in the
     * conditions or choices of someone alive.
     */
    deceased: z.literal(true).optional(),
  })
  .refine((s) => (s.kind === undefined) !== (s.support !== true), 'a role needs exactly one of kind or support: true')
  .refine((s) => s.deceased !== true || (s.presence === 'anywhere' && s.support !== true && !s.romantic && !s.admirer && !s.createIfMissing && s.newChance === undefined), 'a deceased role has presence anywhere and is only passed in')
  .refine(
    (s) => s.support !== true || (!s.createIfMissing && s.newChance === undefined && !s.romantic && !s.admirer),
    'a support role finds someone you know: no createIfMissing, newChance, romantic or admirer',
  )
  .refine((s) => !(s.romantic && s.admirer), 'a role is romantic or an admirer, not both');
export type CastSpec = z.infer<typeof castSpecSchema>;

const statKeySchema = scoreKeySchema;

/** What an identity effect can change (Stage 9). */
export const IDENTITY_FIELDS = ['attraction', 'gender', 'expression', 'pronouns', 'personality'] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number];

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
   * C1: money that scales with your rent: `months` months of your current
   * yearly housing cost (negative to pay, positive to get back), through
   * savings like money. Nothing when you pay no rent.
   */
  z.strictObject({ type: z.literal('rentMonths'), months: z.number().min(-24).max(24).refine((n) => n !== 0, 'months must not be 0') }),
  /**
   * C1: a one-time cost from balance/economy.yaml costs (a wedding), scaled
   * by your city; your family may chip in; savings pay first and the rest
   * becomes personal debt.
   */
  z.strictObject({ type: z.literal('cost'), item: idSchema }),
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
   * rent_change (C1): your rent changes by `percent` of the current rent
   * from now on (renting only).
   */
  z
    .strictObject({
      type: z.literal('housing'),
      action: z.enum(['move_home', 'rent', 'homeless', 'roommate', 'live_alone', 'sell', 'move_in_together', 'rent_change']),
      role: roleSchema.optional(),
      /** rent_change (C1): the rent goes up (or down) by this percentage of your current rent, for as long as you stay. */
      percent: z.number().min(-50).max(100).refine((n) => n !== 0, 'percent must not be 0').optional(),
    })
    .refine((e) => (e.action === 'move_in_together') === (e.role !== undefined), 'move_in_together needs role (and only it has one)')
    .refine((e) => (e.action === 'rent_change') === (e.percent !== undefined), 'rent_change needs percent (and only it has one)'),
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
  /**
   * Work (Stage 8), while you have a job (offer: also without one).
   * performance: `value` points (−50 to 50) on your job performance. raise:
   * the raise you'd get for asking (balance careers.yaml raises.asked).
   * promote: up a level (not past the top). fire: you're fired. quit: you
   * walk away. offer: you take a job in track `jobId`, if you're old enough,
   * out of school and meet its requirements (leaving any job you have).
   */
  z
    .strictObject({
      type: z.literal('job'),
      action: z.enum(['performance', 'raise', 'promote', 'fire', 'quit', 'offer']),
      value: z.int().min(-50).max(50).optional(),
      jobId: idSchema.optional(),
    })
    .refine((e) => (e.action === 'performance') === (e.value !== undefined && e.value !== 0), 'performance needs a non-zero value (and only it has one)')
    .refine((e) => (e.action === 'offer') === (e.jobId !== undefined), 'offer needs jobId (and only it has one)'),
  z.strictObject({
    type: z.literal('relationship'),
    role: roleSchema,
    affection: z.int().min(-100).max(100).optional(),
    trust: z.int().min(-100).max(100).optional(),
    /** E1: their mood (0–100) moves by this much. */
    mood: z.int().min(-100).max(100).optional(),
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
  /**
   * The law (Stage 9): an entry on your record for `offenseId`. `sentence`
   * lets the court decide (the offense's likely outcomes, your record, your
   * age); warning, fine, probation and jail hand down that outcome. `years`
   * sets the years of probation or prison (otherwise the offense's range).
   * Before the independence age, jail becomes probation.
   */
  z
    .strictObject({
      type: z.literal('legal'),
      offenseId: idSchema,
      outcome: z.enum([...RECORD_OUTCOMES, 'sentence']),
      years: z.int().min(1).max(50).optional(),
    })
    .refine((e) => e.years === undefined || e.outcome === 'probation' || e.outcome === 'jail', 'only probation and jail take years'),
  /**
   * Health (Stage 9): `severity` points on a condition (a positive change
   * gives it to you if you don't have it; it is gone at 0). `treated` marks
   * it treated or not (rehab, stopping your medication).
   */
  z
    .strictObject({
      type: z.literal('health'),
      conditionId: idSchema,
      severity: z.int().min(-100).max(100).optional(),
      treated: z.boolean().optional(),
    })
    .refine((e) => (e.severity !== undefined && e.severity !== 0) || e.treated !== undefined, 'needs a non-zero severity or treated'),
  /**
   * Who you are (Stage 9). field: attraction, gender (identity and
   * category), expression, pronouns or personality. value 'fromLatent'
   * takes your latent trait (and clears it; nothing happens without one).
   * Attraction can also take value 'withRole' and a role: you're attracted
   * to their gender too (a "try it and decide" moment). Pronouns can take a
   * pronoun preset id; 'fromLatent' takes the usual pronouns of your latent
   * gender. Expression can take a free-text value.
   */
  z
    .strictObject({
      type: z.literal('identity'),
      field: z.enum(IDENTITY_FIELDS),
      value: z.string().trim().min(1).max(40),
      role: roleSchema.optional(),
    })
    .refine((e) => (e.value === 'withRole') === (e.role !== undefined), "value 'withRole' needs a role (and only it has one)")
    .refine((e) => e.value !== 'withRole' || e.field === 'attraction', "only attraction takes value 'withRole'")
    .refine(
      (e) => e.value === 'fromLatent' || e.value === 'withRole' || e.field === 'pronouns' || e.field === 'expression',
      "attraction, gender and personality take value 'fromLatent' (attraction also 'withRole')",
    ),
  /** Inner conflict (Stage 9): pushing something down raises it; making peace lowers it. */
  z.strictObject({ type: z.literal('innerConflict'), delta: z.int().min(-100).max(100) }),
  /** You discover your hidden talent, if you have one you haven't found (Stage 9). */
  z.strictObject({ type: z.literal('talent') }),
  /**
   * C1: the person cast in `role` moves to another city (a friend moving
   * across the country). Nobody who lives with you moves this way.
   */
  z.strictObject({ type: z.literal('moveAway'), role: roleSchema }),
  /**
   * E1: the person cast in `role` gives or lends you money when you ask
   * (interactions only). The amount comes from their wealth level
   * (balance/interactions.yaml money), scaled to your city. A gift is yours;
   * a loan is a personal debt through the finance module (a child is always
   * given it). It leaves a memory of the loan.
   */
  z.strictObject({ type: z.literal('moneyFromPerson'), role: roleSchema, mode: z.enum(['gift', 'loan']) }),
  /**
   * E1: an act with the person cast in `role` that is unfaithful when you
   * have a partner who isn't them (interactions only): the partner gets a
   * memory of it, it may be found out later (registries/interactions.yaml),
   * and the `cheated` flag is set. Nothing happens when you're single or the
   * person is your partner.
   */
  z.strictObject({ type: z.literal('infidelity'), role: roleSchema, act: z.enum(['flirt', 'intimate']) }),
  /**
   * E2a: a pregnancy. begin: one begins, how 'trying' (from a try-for-a-baby
   * moment) or 'unplanned' (from an intimate night), with `role` the other
   * parent; the carrier is whichever of you two can carry (the engine
   * ignores it when neither or both can, or when someone is already
   * pregnant). decide (the unplanned pregnancy event): keep it, place the
   * baby for adoption, or end the pregnancy. attempt: a year of trying that
   * didn't work.
   */
  z
    .strictObject({
      type: z.literal('pregnancy'),
      action: z.enum(['begin', 'decide', 'attempt']),
      how: z.enum(['trying', 'unplanned']).optional(),
      role: roleSchema.optional(),
      choice: z.enum(['keep', 'adoption', 'end']).optional(),
    })
    .refine((e) => (e.action === 'begin') === (e.how !== undefined && e.role !== undefined), 'begin needs how and role (and only begin has them)')
    .refine((e) => (e.action === 'decide') === (e.choice !== undefined), 'decide needs choice (and only decide has it)'),
  /** E2a: your parenting style with a child moves (each line by up to ±50; style lines stay 0–100). */
  z
    .strictObject({
      type: z.literal('parenting'),
      role: roleSchema,
      warmth: z.int().min(-50).max(50).optional(),
      strictness: z.int().min(-50).max(50).optional(),
      involvement: z.int().min(-50).max(50).optional(),
    })
    .refine((e) => e.warmth !== undefined || e.strictness !== undefined || e.involvement !== undefined, 'needs at least one style line'),
  /** E2a: a child's own stat or personality trait moves (the person cast in `role` must be your child or stepchild). */
  z.strictObject({ type: z.literal('childStat'), role: roleSchema, key: z.enum(STAT_KEYS), delta: z.int().min(-30).max(30) }),
  z.strictObject({ type: z.literal('childTrait'), role: roleSchema, key: z.enum(TRAIT_KEYS), delta: z.int().min(-30).max(30) }),
  /**
   * E2a: custody of the children you had with the person cast in `role` (the
   * other parent): they live with you (full), you share (shared) or they
   * live with that parent (other). Sets child support to match.
   */
  z.strictObject({ type: z.literal('custody'), role: roleSchema, choice: z.enum(['full', 'shared', 'other']) }),
  /** E2a: start an adoption, IVF or surrogacy process (its fees are a separate cost effect). */
  z.strictObject({ type: z.literal('process'), action: z.literal('start'), process: familyProcessSchema }),
]);
export type Effect = z.infer<typeof effectSchema>;

export const outcomeSchema = z.strictObject({
  text: templateSchema.optional(),
  effects: z.array(effectSchema).default([]),
});
export type Outcome = z.infer<typeof outcomeSchema>;

const checkWeightSchema = z.number().min(-2).max(2);
/** A character stat, trait or hidden value; how a cast person feels about you; or your job performance (50 without a job). */
export const checkStatSchema = z.union([
  z.strictObject({ key: statKeySchema, weight: checkWeightSchema }),
  z.strictObject({ role: roleSchema, key: z.enum(['affection', 'trust']), weight: checkWeightSchema }),
  z.strictObject({ job: z.literal('performance'), weight: checkWeightSchema }),
  /**
   * E2a: your chance of having a baby with the person in `role` this year
   * (fertility, or fertilityPlanned when you plan around it: from the ages
   * and health of you both, in percent; each point above 50 adds weight), or
   * how strong your custody case is for the children you had with them
   * (custody: 0–100).
   */
  z.strictObject({ family: z.enum(['fertility', 'fertilityPlanned', 'custody']), role: roleSchema, weight: checkWeightSchema }),
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
     * C1: meant to come back in the same life (a holiday, a checkup, a
     * yearly ritual). Repeats of events not marked recurring are kept rare
     * (balance/targets.yaml consistency.maxRepeatShare); a recurring event
     * can't also be once.
     */
    recurring: z.literal(true).optional(),
    /**
     * C1: content-build warnings that were reviewed and kept, with the reason
     * (tools/content/consistency.ts; docs/consistency-review.md).
     */
    justified: z
      .strictObject({ time: z.string().trim().min(10).optional(), money: z.string().trim().min(10).optional(), past: z.string().trim().min(10).optional() })
      .optional(),
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
  .refine((e) => !e.choices || new Set(e.choices.map((c) => c.id)).size === e.choices.length, 'choice ids must be unique')
  .refine((e) => !(e.recurring && e.once), 'a recurring event can’t also be once');
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
      /**
       * Prison (Stage 9): events of this category happen only while you're
       * in prison, and while you are, only these happen.
       */
      prison: z.boolean().optional(),
      /**
       * C1, the category contract: conditions every event of this category
       * must require. The content build rejects an event whose requirements
       * don't include them, and an event that fires without them is an
       * invariant failure.
       */
      requires: conditionSchema.optional(),
      /**
       * Home, health and wellbeing (C1, the household rule): a partner who
       * lives with you is preferred for the event's support and partner roles.
       */
      household: z.boolean().optional(),
    }),
  ),
});
