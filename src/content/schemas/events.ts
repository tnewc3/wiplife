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
  mentalCareSchema,
  type MentalCareId,
  idSchema,
  LATENT_KINDS,
  scoreKeySchema,
  STAT_KEYS,
  TRAIT_KEYS,
} from './common';
import { DAMAGE_SEVERITIES, PET_PERSONALITIES, PET_SOURCES, POSSESSION_EFFECT_ACTIONS, POSSESSION_KINDS, VEHICLE_KINDS } from './belongings';
import { debtKindSchema, housingKindSchema, lifestyleSchema } from './economy';
import { FAMILY_DEEDS, GUARDIAN_KINDS, familyProcessSchema, parentingKeySchema } from './family';
import { credentialTypeSchema, programSchema, tierSchema } from './education';
import { lifeTierSchema } from './people';
import { jobSizeSchema } from './crime';
import { FOCUS_KEYS, LICENSE_STAGE_IDS, ruleDomainSchema, type RuleDomainId, type TeenFocusId } from './teen';
import { relationshipKindSchema, relationshipStatusSchema, romanceStatusSchema } from './relationships';
import { templateSchema } from './text';
import { reactionSchema, type ReactionId } from './mental';
import { knowledgeKindSchema, tieKindSchema, tieStatusSchema, type KnowledgeKindId, type TieKindId, type TieStatusId } from './web';

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
  | { mental: MentalCondition }
  | { legal: LegalCondition }
  | { discovery: DiscoveryCondition }
  | { family: FamilyCondition }
  | { belongings: BelongingsCondition }
  | { teen: TeenCondition }
  | { crime: CrimeCondition }
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
      /** E3: their own life now (job, partner, children, troubles, care). */
      life?: LifeCondition;
      /** E4: what they have heard. */
      heard?: HeardCondition;
      /** M1: they have noticed you struggling (or not), and took it this way. */
      mental?: { noticed?: boolean; reaction?: ReactionId[] };
    }
  | { tie: TieCondition };

/**
 * E3: a cast person's own life. Every field given must hold. tier: how
 * closely their life is followed; employed: they have a job (or not);
 * partner: their partner's status, 'none' for no partner; ended: how their
 * last relationship ended, in the past year (their ex's name is then
 * {role.partner}); children: how many
 * they have; trouble: they have a trouble of one of these kinds right now;
 * serious: an illness or addiction at least as bad as the balance calls
 * serious; crime: a crime case at one of these stages; care: care for them
 * (needed, at your home, paid for by you, left to the family) or 'none';
 * wealth: their wealth level; recovered: they recovered from an addiction
 * within this many years.
 */
export interface LifeCondition {
  tier?: z.infer<typeof lifeTierSchema>[];
  employed?: boolean;
  partner?: ('dating' | 'engaged' | 'married' | 'none')[];
  ended?: ('broke_up' | 'divorced' | 'widowed')[];
  children?: Compare;
  trouble?: ('illness' | 'crime' | 'addiction')[];
  serious?: boolean;
  crime?: ('held' | 'bailed' | 'probation' | 'jail')[];
  care?: ('needed' | 'home' | 'paid' | 'sibling' | 'none')[];
  wealth?: z.infer<typeof familyWealthSchema>[];
  recovered?: number;
}

/**
 * T1, the teen years. Every field given must hold. clique: you belong to a
 * crowd at school (or don't); crowd: it is one of these (an id in
 * src/content/cliques); rival: your crowd has a rival crowd at your school;
 * clash: you are in a clash with one; invited: a crowd has noticed you;
 * standing: your standing at school (0-100); focus: where this year's energy
 * goes ('none': nothing chosen); passion: how far a passion has taken you;
 * license: your stage (none, permit, licensed); lessons: driving lessons and
 * practice so far; job: you have a teen job (or one of these); activity: you
 * belong to a team or club (or one of these); rules: how many
 * house rules there are; rule: a rule of this domain is set, at a level in
 * `level` (0 relaxed, 1 usual, 2 strict); caught: a parent caught you breaking
 * a rule this year (of this domain, if given); grounded: you are grounded;
 * restricted: you have lost this privilege; sealed: your juvenile record was sealed.
 */
export interface TeenCondition {
  clique?: boolean;
  crowd?: string[];
  rival?: boolean;
  clash?: boolean;
  invited?: boolean;
  standing?: Compare;
  focus?: (TeenFocusId | 'none')[];
  passion?: Compare;
  license?: (typeof LICENSE_STAGE_IDS)[number][];
  lessons?: Compare;
  job?: boolean | string[];
  activity?: boolean | string[];
  rules?: Compare;
  rule?: { domain: RuleDomainId; level?: Compare };
  caught?: boolean | RuleDomainId[];
  grounded?: boolean;
  restricted?: RuleDomainId[];
  sealed?: boolean;
}

/**
 * E6a, crime careers. Every field given must hold. member: you are in a crew;
 * former: you were in one and are not now; rank: your rank (1 to 5; 5 runs the
 * crew); leader: you run it; standing: your standing in it (0-100); heat: how
 * much police attention you carry (0-100); investigated: an investigation into
 * you is open; rivalry: how hot things are with the rival crew (0-100); rival:
 * your crew has a rival; informant: someone in your crew is talking to the
 * police; jobs: jobs you have done this year; years: years in the crew (or, for
 * a former member, years since you left); crew: you are in (or were in) one of
 * these crews; arrests: arrests so far in your life of crime. away: you live in
 * another city from your crew (your rank is frozen); awayYears: years you have
 * been away; suspicion: how much your crew suspects you ran or talked (0-100,
 * while you are away); returned: you came back to your crew's city this year;
 * local: a crew works in the city you live in now.
 */
export interface CrimeCondition {
  member?: boolean;
  former?: boolean;
  rank?: Compare;
  leader?: boolean;
  standing?: Compare;
  heat?: Compare;
  investigated?: boolean;
  rivalry?: Compare;
  rival?: boolean;
  informant?: boolean;
  jobs?: Compare;
  years?: Compare;
  crew?: string[];
  arrests?: Compare;
  away?: boolean;
  awayYears?: Compare;
  suspicion?: Compare;
  returned?: boolean;
  local?: boolean;
}

/** Your money situation. Every field given must hold. */
export interface FinancesCondition {
  /** E6a: your dirty money (cash from crime you have not laundered). */
  dirty?: Compare;
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
  /**
   * M1 (mental health and neurodivergence): `named` is true once it has been
   * diagnosed (false while it has shown only in your stats); `within`: the
   * diagnosis was in this year or the last N years; `care`: you care for it
   * in one of these ways now; `uncared`: you care for it in none.
   */
  named?: boolean;
  within?: number;
  care?: MentalCareId[];
  uncared?: boolean;
}

/**
 * M1: how your mind is doing, beyond the conditions. trauma: how much you
 * carry (0–100); support: how much your closest people give you (0–100);
 * crisis: you had a crisis within this many years (true: ever; false: never);
 * recovered: you recovered from one of these conditions (they can come
 * back); noticed: someone has noticed you struggling (or nobody has);
 * sideEffects: medication gave you a side effect in the past year.
 */
export interface MentalCondition {
  trauma?: Compare;
  support?: Compare;
  crisis?: number | boolean;
  recovered?: string[];
  noticed?: boolean;
  sideEffects?: boolean;
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
 * E2b: heir: you carried on from a parent's life; generation: which one in your
 * family line (1 is the first); reputation: your family's reputation (0–100,
 * 50 is unremarkable); deeds: the family is known for one of these; guardian:
 * who a minor lives with (a parent, stepparent, grandparent, relative, older
 * sibling, 'foster' care or 'none'); trust: money is held in trust for you;
 * will: you have written a will.
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
  heir?: boolean;
  generation?: Compare;
  reputation?: Compare;
  deeds?: (typeof FAMILY_DEEDS)[number][];
  guardian?: ((typeof GUARDIAN_KINDS)[number] | 'foster' | 'none')[];
  trust?: boolean;
  will?: boolean;
}

/**
 * E5, what you own. pets, vehicles and vacationHomes count them (a pet that
 * has died doesn't count). The other fields describe one pet, one vehicle or
 * one home: the one the event is about (it binds it, see `bind`), or, in a
 * requirement that doesn't bind, any that fits every field given. species,
 * personality, petAge, petHealth, petBond and petIll are about a pet;
 * vehicleKind, vehicleDef, vehicleAge, vehicleCondition, insured and loan
 * about a vehicle (insured: it is; loan: a car loan is being paid on it);
 * renovated: a home you own has been renovated (the one you live in or a
 * vacation home; bound to one, that one); claims: insurance claims
 * in the years that count toward the premium.
 */
export interface BelongingsCondition {
  pets?: Compare;
  vehicles?: Compare;
  vacationHomes?: Compare;
  species?: string[];
  personality?: (typeof PET_PERSONALITIES)[number][];
  petAge?: Compare;
  petHealth?: Compare;
  petBond?: Compare;
  petIll?: boolean;
  vehicleKind?: (typeof VEHICLE_KINDS)[number][];
  vehicleDef?: string[];
  vehicleAge?: Compare;
  vehicleCondition?: Compare;
  insured?: boolean;
  loan?: boolean;
  renovated?: boolean;
  claims?: Compare;
}

const atLeastOneField = (c: Record<string, unknown>) => Object.values(c).some((v) => v !== undefined);
const lifeConditionSchema = z
  .strictObject({
    tier: z.array(lifeTierSchema).min(1).optional(),
    employed: z.boolean().optional(),
    partner: z.array(z.enum(['dating', 'engaged', 'married', 'none'])).min(1).optional(),
    ended: z.array(z.enum(['broke_up', 'divorced', 'widowed'])).min(1).optional(),
    children: compareSchema.optional(),
    trouble: z.array(z.enum(['illness', 'crime', 'addiction'])).min(1).optional(),
    serious: z.boolean().optional(),
    crime: z.array(z.enum(['held', 'bailed', 'probation', 'jail'])).min(1).optional(),
    care: z.array(z.enum(['needed', 'home', 'paid', 'sibling', 'none'])).min(1).optional(),
    wealth: z.array(familyWealthSchema).min(1).optional(),
    recovered: z.int().min(1).max(50).optional(),
  })
  .refine(atLeastOneField, 'needs at least one field');
/** E4: what a person has heard about you (or about someone else): a kind of knowledge, a version, how they came to know it. */
const heardConditionSchema = z
  .strictObject({
    kinds: z.array(knowledgeKindSchema).min(1).optional(),
    versions: z.array(idSchema).min(1).optional(),
    /** They believe a version that isn't the true one (or, false, the true one). */
    distorted: z.boolean().optional(),
    /** The item is a secret kind. */
    secret: z.boolean().optional(),
    /** The version they heard is a funny one. */
    light: z.boolean().optional(),
    /** Who told them: you, nobody (they saw it), or another person (gossip). */
    learned: z.array(z.enum(['you', 'saw', 'gossip'])).min(1).optional(),
    /** They haven't reacted to it yet. */
    fresh: z.boolean().optional(),
  })
  .refine(atLeastOneField, 'needs at least one field');
export interface HeardCondition {
  kinds?: KnowledgeKindId[];
  versions?: string[];
  distorted?: boolean;
  secret?: boolean;
  light?: boolean;
  learned?: ('you' | 'saw' | 'gossip')[];
  fresh?: boolean;
}

/** E4: the tie between two cast people. */
const tieConditionSchema = z
  .strictObject({
    a: roleSchema,
    b: roleSchema,
    kind: z.array(tieKindSchema).min(1).optional(),
    status: z.array(tieStatusSchema).min(1).optional(),
    /** Years the feud has lasted. */
    feudYears: compareSchema.optional(),
    /** You have taken a side (true), or haven't (false). */
    sided: z.boolean().optional(),
    /** You said you would stay out of it. */
    neutral: z.boolean().optional(),
  })
  .refine((t) => t.a !== t.b, 'a tie is between two different roles');
export interface TieCondition {
  a: string;
  b: string;
  kind?: TieKindId[];
  status?: TieStatusId[];
  feudYears?: Compare;
  sided?: boolean;
  neutral?: boolean;
}

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
          dirty: compareSchema.optional(),
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
          named: z.boolean().optional(),
          within: z.int().min(0).max(100).optional(),
          care: z.array(mentalCareSchema).min(1).optional(),
          uncared: z.boolean().optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      mental: z
        .strictObject({
          trauma: compareSchema.optional(),
          support: compareSchema.optional(),
          crisis: z.union([z.int().min(1).max(100), z.boolean()]).optional(),
          recovered: z.array(idSchema).min(1).optional(),
          noticed: z.boolean().optional(),
          sideEffects: z.boolean().optional(),
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
          heir: z.boolean().optional(),
          generation: compareSchema.optional(),
          reputation: compareSchema.optional(),
          deeds: z.array(z.enum(FAMILY_DEEDS)).min(1).optional(),
          guardian: z.array(z.enum([...GUARDIAN_KINDS, 'foster', 'none'])).min(1).optional(),
          trust: z.boolean().optional(),
          will: z.boolean().optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      teen: z
        .strictObject({
          clique: z.boolean().optional(),
          crowd: z.array(idSchema).min(1).optional(),
          rival: z.boolean().optional(),
          clash: z.boolean().optional(),
          invited: z.boolean().optional(),
          standing: compareSchema.optional(),
          focus: z.array(z.enum(FOCUS_KEYS)).min(1).optional(),
          passion: compareSchema.optional(),
          license: z.array(z.enum(LICENSE_STAGE_IDS)).min(1).optional(),
          lessons: compareSchema.optional(),
          job: z.union([z.boolean(), z.array(idSchema).min(1)]).optional(),
          activity: z.union([z.boolean(), z.array(idSchema).min(1)]).optional(),
          rules: compareSchema.optional(),
          rule: z.strictObject({ domain: ruleDomainSchema, level: compareSchema.optional() }).optional(),
          caught: z.union([z.boolean(), z.array(ruleDomainSchema).min(1)]).optional(),
          grounded: z.boolean().optional(),
          restricted: z.array(ruleDomainSchema).min(1).optional(),
          sealed: z.boolean().optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
    }),
    z.strictObject({
      crime: z
        .strictObject({
          member: z.boolean().optional(),
          former: z.boolean().optional(),
          rank: compareSchema.optional(),
          leader: z.boolean().optional(),
          standing: compareSchema.optional(),
          heat: compareSchema.optional(),
          investigated: z.boolean().optional(),
          rivalry: compareSchema.optional(),
          rival: z.boolean().optional(),
          informant: z.boolean().optional(),
          jobs: compareSchema.optional(),
          years: compareSchema.optional(),
          crew: z.array(idSchema).min(1).optional(),
          arrests: compareSchema.optional(),
          away: z.boolean().optional(),
          awayYears: compareSchema.optional(),
          suspicion: compareSchema.optional(),
          returned: z.boolean().optional(),
          local: z.boolean().optional(),
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
      life: lifeConditionSchema.optional(),
      heard: heardConditionSchema.optional(),
      mental: z
        .strictObject({ noticed: z.boolean().optional(), reaction: z.array(reactionSchema).min(1).optional() })
        .refine(atLeastOneField, 'needs at least one field')
        .optional(),
    }),
    z.strictObject({ tie: tieConditionSchema }),
    z.strictObject({
      belongings: z
        .strictObject({
          pets: compareSchema.optional(),
          vehicles: compareSchema.optional(),
          vacationHomes: compareSchema.optional(),
          species: z.array(idSchema).min(1).optional(),
          personality: z.array(z.enum(PET_PERSONALITIES)).min(1).optional(),
          petAge: compareSchema.optional(),
          petHealth: compareSchema.optional(),
          petBond: compareSchema.optional(),
          petIll: z.boolean().optional(),
          vehicleKind: z.array(z.enum(VEHICLE_KINDS)).min(1).optional(),
          vehicleDef: z.array(idSchema).min(1).optional(),
          vehicleAge: compareSchema.optional(),
          vehicleCondition: compareSchema.optional(),
          insured: z.boolean().optional(),
          loan: z.boolean().optional(),
          renovated: z.boolean().optional(),
          claims: compareSchema.optional(),
        })
        .refine(atLeastOneField, 'needs at least one field'),
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
     * M1: someone who has noticed you struggling and took it one of these
     * ways (supportive, neutral, dismissive), closest first. It may also name
     * a `kind` (the parent who noticed); on its own it needs no kind. It never creates anyone.
     */
    noticed: z.array(reactionSchema).min(1).optional(),
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
    /**
     * T1: someone from a crowd at your school: your own crowd (yours) or the
     * crowd it is at odds with (rival). The person is one of its members (a
     * friend or classmate of yours), found only, never created.
     */
    crowd: z.enum(['yours', 'rival']).optional(),
    /**
     * E6a: someone from a crew: your own crew (yours), the person who runs it
     * above you (boss), the member who is talking to the police (informant),
     * or a person from the rival crew (rival, who may be created: they are met, not known).
     */
    crew: z.enum(['yours', 'boss', 'informant', 'rival']).optional(),
  })
  .refine((s) => (s.kind !== undefined && s.support === true) === false && (s.kind !== undefined || s.support === true || s.noticed !== undefined), 'a role needs one of kind or support: true (or noticed, alone or with a kind)')
  .refine((s) => s.deceased !== true || (s.presence === 'anywhere' && s.support !== true && !s.romantic && !s.admirer && !s.createIfMissing && s.newChance === undefined), 'a deceased role has presence anywhere and is only passed in')
  .refine(
    (s) => (s.support !== true && s.noticed === undefined) || (!s.createIfMissing && s.newChance === undefined && !s.romantic && !s.admirer),
    'a support or noticed role finds someone you know: no createIfMissing, newChance, romantic or admirer',
  )
  .refine((s) => !(s.romantic && s.admirer), 'a role is romantic or an admirer, not both')
  .refine(
    (s) => s.crowd === undefined || ((s.kind === 'friend' || s.kind === 'classmate') && !s.support && !s.noticed && !s.romantic && !s.admirer && !s.createIfMissing && s.newChance === undefined),
    'a crowd role is a friend or classmate who is found, never created, and not a support, noticed, romantic or admirer role',
  )
  .refine(
    (s) => s.crew === undefined || (!s.crowd && !s.support && !s.noticed && !s.romantic && !s.admirer && (s.crew === 'rival' ? s.kind === 'acquaintance' : s.kind === 'friend') && (s.crew === 'rival' || (!s.createIfMissing && s.newChance === undefined))),
    'a crew role is a friend (your crew, boss or informant: found, never created) or an acquaintance (rival), and not a crowd, support, noticed, romantic or admirer role',
  );
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
      /** E3: instead of `amount`, a cost item from balance/economy.yaml costs (scaled by your city): what you owe if someone you cosigned for defaults. */
      item: idSchema.optional(),
      kinds: z.array(debtKindSchema).min(1).optional(),
      share: z.number().gt(0).max(1).optional(),
    })
    .refine(
      (e) => (e.action === 'add') === (e.kind !== undefined && (e.amount !== undefined) !== (e.item !== undefined)),
      'add needs kind and either amount or item (and only add has them)',
    )
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
   * M1, mental health. trauma: you carry `amount` more trauma (accidents,
   * violence, mistreatment; it fades, and PTSD's onset reads it). diagnose: a
   * condition you have is named (`conditionId`; without one, every condition
   * not named yet that you're old enough for), through an `assessment`
   * (default), a `doctor` or a `therapist`. start / stop: you begin or stop
   * caring for a named condition (`conditionId`; without one, each that
   * takes it) with `care`: therapy and medication pay their first visit,
   * leaning on people reaches out to the people you can lean on. pay: a
   * one-time medical cost `item` from balance/mental-health.yaml costs
   * (savings, then medical debt; a child's family pays). crisis: a crisis
   * happens: what you carry is named and gets worse before it gets better.
   * confide: you tell the person cast in `role` you are struggling; they take
   * it by who they are, and `then` names the follow-up event for each way
   * (it comes the next year). The engine ignores what doesn't fit.
   */
  z
    .strictObject({
      type: z.literal('mental'),
      action: z.enum(['trauma', 'diagnose', 'start', 'stop', 'pay', 'crisis', 'confide']),
      amount: z.int().min(1).max(100).optional(),
      conditionId: idSchema.optional(),
      care: mentalCareSchema.optional(),
      via: z.enum(['assessment', 'doctor', 'therapist']).optional(),
      item: idSchema.optional(),
      role: roleSchema.optional(),
      then: z.partialRecord(reactionSchema, idSchema).optional(),
    })
    .refine((e) => (e.action === 'trauma') === (e.amount !== undefined), 'trauma needs amount (and only trauma has one)')
    .refine((e) => (e.action === 'start' || e.action === 'stop') === (e.care !== undefined), 'start and stop need care (and only they have one)')
    .refine((e) => (e.action === 'pay') === (e.item !== undefined), 'pay needs item (and only pay has one)')
    .refine((e) => (e.action === 'confide') === (e.role !== undefined), 'confide needs role (and only confide has one)')
    .refine((e) => e.then === undefined || e.action === 'confide', 'only confide takes then')
    .refine((e) => e.via === undefined || e.action === 'diagnose', 'only diagnose takes via')
    .refine((e) => e.conditionId === undefined || e.action === 'diagnose' || e.action === 'start' || e.action === 'stop', 'only diagnose, start and stop take conditionId'),
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
  /**
   * E6a, a life in a crew (adults only; the engine and the content build both
   * say so). join: you are taken in by a crew that works in your city (the
   * rest of the life is the same as before). leave: you leave (how: left by
   * choice, pushed out, caught, drifted, or a deal); the people stay in your
   * life, the heat stays on you. heat / standing / rivalry: move by `delta`.
   * promote / demote: one rank up or down (to the top you run the crew).
   * job: you did a job of this size (its heat, its standing, and your count
   * for the year). investigate: an investigation into you opens; close: it
   * ends. remove: the person in `role` is no longer in the crew. join may
   * bring the person in `role` (whoever brought you in) into the crew too.
   * suspicion: what the crew you moved away from suspects of you moves by
   * `delta`. transfer: while you are away, you leave that crew (how: moved) and
   * join one that works where you live now, below your best rank. leave's how
   * can also be moved.
   */
  z
    .strictObject({
      type: z.literal('crime'),
      action: z.enum(['join', 'leave', 'heat', 'standing', 'rivalry', 'suspicion', 'promote', 'demote', 'job', 'investigate', 'close', 'remove', 'transfer']),
      delta: z.int().min(-100).max(100).optional(),
      size: jobSizeSchema.optional(),
      how: z.enum(['left', 'pushed', 'drifted', 'deal', 'moved']).optional(),
      role: roleSchema.optional(),
    })
    .refine((e) => (e.action === 'heat' || e.action === 'standing' || e.action === 'rivalry' || e.action === 'suspicion') === (e.delta !== undefined && e.delta !== 0), 'heat, standing, rivalry and suspicion need a non-zero delta (and only they have one)')
    .refine((e) => (e.action === 'job') === (e.size !== undefined), 'job needs size (and only job has it)')
    .refine((e) => (e.action === 'leave') || e.how === undefined, 'only leave takes how')
    .refine((e) => (e.action === 'remove' ? e.role !== undefined : e.action === 'join' || e.role === undefined), 'remove needs role; join may bring a person with it; no other action has one'),
  /**
   * E6a, dirty money (cash from crime you have not laundered). gain: a job's
   * take of this size, times your rank's multiplier and your city's pay level,
   * varying a little. pay: you hand over this size of cost out of it
   * (hush money, a bribe; no more than you hold). lose: a share of what you
   * hold is seized, stolen or burned.
   */
  z
    .strictObject({
      type: z.literal('dirtyMoney'),
      gain: jobSizeSchema.optional(),
      pay: jobSizeSchema.optional(),
      lose: z.number().gt(0).max(1).optional(),
      /** Your yearly cut of the crew's business (the top two ranks), with the little heat it adds. */
      cut: z.literal(true).optional(),
    })
    .refine((e) => [e.gain, e.pay, e.lose, e.cut].filter((v) => v !== undefined).length === 1, 'needs exactly one of gain, pay, lose or cut'),
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
  /**
   * E3: you step in for the person cast in `role`, through the systems that
   * already exist (the money for it is a separate cost effect). bail: they
   * are out on bail until their case is decided (legal); rehab: an addiction
   * goes into treatment; treatment: an illness is treated; job_lead: they
   * find work (a job in a track they fit); move_in: someone who needs care
   * moves into your home; pay_care: you pay for their care; leave_care: you
   * leave their care to the family. The engine ignores what doesn't fit.
   */
  z.strictObject({
    type: z.literal('lifeHelp'),
    role: roleSchema,
    action: z.enum(['bail', 'rehab', 'treatment', 'job_lead', 'move_in', 'pay_care', 'leave_care']),
  }),
  /**
   * E3: money paid back to you: `share` of what the cost item costs in your
   * city (balance/economy.yaml costs), such as a loan coming back.
   */
  z.strictObject({ type: z.literal('repay'), item: idSchema, share: z.number().gt(0).max(2) }),
  /**
   * E4: something between two people you know (cast as `a` and `b`). side:
   * you take `with`'s side (a feud you said you'd stay out of is no longer
   * neutral); neutral: you stay out of it (it costs you with both, each
   * year); mend / worsen: their affection for each other moves by `delta`
   * (a feud ends when it climbs far enough); reconcile: the feud is over.
   * Changes to how they feel about you are relationship effects beside this one.
   */
  z
    .strictObject({
      type: z.literal('tie'),
      a: roleSchema,
      b: roleSchema,
      action: z.enum(['side', 'neutral', 'mend', 'worsen', 'reconcile']),
      with: roleSchema.optional(),
      delta: z.int().min(1).max(40).optional(),
    })
    .refine((e) => (e.action === 'side') === (e.with !== undefined), 'side needs with (and only side has it)')
    .refine((e) => (e.action === 'mend' || e.action === 'worsen') === (e.delta !== undefined), 'mend and worsen need delta (and only they have it)')
    .refine((e) => e.with === undefined || e.with === e.a || e.with === e.b, 'with is one of a and b'),
  /**
   * E4: what the person in `role` has heard about you. correct: they now
   * believe the true version; confirm: you admit it (the true version, and
   * they have reacted); hush: they keep it quiet for a while; leak: they tell
   * one person they know; tell: you tell them yourself (they learn the true
   * version, and it isn't gossip). Without `kind`, it is the item the event
   * or interaction is about.
   */
  z
    .strictObject({
      type: z.literal('knowledge'),
      /** Who it is about; announce has no one: everyone you know hears it. */
      role: roleSchema.optional(),
      action: z.enum(['correct', 'confirm', 'hush', 'leak', 'tell', 'announce']),
      kind: knowledgeKindSchema.optional(),
    })
    .refine((e) => (e.action === 'announce') === (e.role === undefined), 'announce has no role (everyone hears it), and every other action needs one')
    .refine((e) => e.action !== 'announce' || e.kind !== undefined, 'announce needs kind'),
  /**
   * E4: you introduce the person in `role` to the person in `with`. friends,
   * rivalry and feud start a tie of that feeling; romance starts a couple if
   * both are single, unrelated adults who are attracted to each other (and
   * friends otherwise). The engine refuses what doesn't fit.
   */
  z.strictObject({
    type: z.literal('introduce'),
    role: roleSchema,
    with: roleSchema,
    result: z.enum(['friends', 'romance', 'rivalry', 'feud']),
  }),
  /**
   * E5, what you own (the event must bind what it acts on, except pet_adopt).
   * vehicle_damage / home_damage: your vehicle (or vacation home) is damaged
   * by `severity`: you pay the repair (insured, you pay the deductible and a
   * claim is made, which raises premiums; a total loss is paid out by the
   * insurer, or lost). vehicle_stolen: it is gone (paid out when insured).
   * vehicle_sell: you sell it at its market price (its loan paid first).
   * vehicle_condition: its condition moves by `delta` (a repair, a breakdown).
   * pet_adopt: a pet of `species` joins you from `source` (a stray, a family
   * pet), if you have room. pet_health / pet_bond: the pet's health or bond
   * moves by `delta`. pet_vet: a vet visit, paid. pet_leaves: it goes
   * somewhere else (rehomed, left with the family you've parted from). pet_dies: it
   * dies (only an old or failing pet; the engine ignores it otherwise).
   * insure: your vehicles' insurance is cancelled (`insured: false`) or restored.
   */
  z
    .strictObject({
      type: z.literal('possession'),
      action: z.enum(POSSESSION_EFFECT_ACTIONS),
      severity: z.enum(DAMAGE_SEVERITIES).optional(),
      delta: z.int().min(-100).max(100).optional(),
      species: idSchema.optional(),
      source: z.enum(PET_SOURCES).optional(),
      insured: z.boolean().optional(),
    })
    .refine((e) => (e.action === 'vehicle_damage' || e.action === 'home_damage') === (e.severity !== undefined), 'vehicle_damage and home_damage need severity (and only they have one)')
    .refine((e) => (e.action === 'pet_health' || e.action === 'pet_bond' || e.action === 'vehicle_condition') === (e.delta !== undefined && e.delta !== 0), 'pet_health, pet_bond and vehicle_condition need a non-zero delta (and only they have one)')
    .refine((e) => (e.action === 'pet_adopt') === (e.species !== undefined && e.source !== undefined), 'pet_adopt needs species and source (and only it has them)')
    .refine((e) => (e.action === 'insure') === (e.insured !== undefined), 'insure needs insured (and only it has it)'),
  /**
   * T1, the teen years. standing: your standing at school moves by `delta`.
   * rank: your place in your crowd moves by `delta`. join: you join the crowd
   * that has noticed you (nothing without an invitation). leave: you leave
   * your crowd. clash: your crowd and its rival fall out (nothing without a
   * rival). settle: the clash is over. break: you break the house rule of
   * `rule` (if there is one): you may be caught, and the parent answers as
   * they would. ground: you are grounded for `years` (1 by default). loosen /
   * tighten: the rule of `rule` goes one level looser or stricter. practice:
   * driving practice adds a lesson. license: your stage becomes `stage`
   * (permit or licensed; revoke takes the license away). passion: your passion
   * moves by `delta`. hire: you take the teen job `jobId` (if you may). quit:
   * you leave your teen job. enroll: you try out for (or sign up to) the
   * team or club `activityId`; withdraw: you leave it. The engine ignores what doesn't fit, and never
   * what would break a rule (an under-18 romance, a license below the age).
   */
  z
    .strictObject({
      type: z.literal('teen'),
      action: z.enum(['standing', 'rank', 'join', 'leave', 'clash', 'settle', 'break', 'ground', 'loosen', 'tighten', 'practice', 'license', 'passion', 'hire', 'quit', 'enroll', 'withdraw']),
      delta: z.int().min(-100).max(100).optional(),
      rule: ruleDomainSchema.optional(),
      years: z.int().min(1).max(3).optional(),
      stage: z.enum(['permit', 'licensed', 'revoke']).optional(),
      jobId: idSchema.optional(),
      activityId: idSchema.optional(),
    })
    .refine((e) => (e.action === 'standing' || e.action === 'rank' || e.action === 'passion') === (e.delta !== undefined && e.delta !== 0), 'standing, rank and passion need a non-zero delta (and only they have one)')
    .refine((e) => (e.action === 'break' || e.action === 'loosen' || e.action === 'tighten') === (e.rule !== undefined), 'break, loosen and tighten need rule (and only they have one)')
    .refine((e) => e.years === undefined || e.action === 'ground', 'only ground takes years')
    .refine((e) => (e.action === 'license') === (e.stage !== undefined), 'license needs stage (and only license has it)')
    .refine((e) => (e.action === 'hire') === (e.jobId !== undefined), 'hire needs jobId (and only hire has it)')
    .refine((e) => (e.action === 'enroll' || e.action === 'withdraw') === (e.activityId !== undefined), 'enroll and withdraw need activityId (and only they have it)'),
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
  /** E6a: your standing in the crew, your rank (1 to 5, centred on 3 at 50) or the heat on you, each 0-100. */
  z.strictObject({ crime: z.enum(['standing', 'rank', 'heat']), weight: checkWeightSchema }),
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
      .strictObject({ time: z.string().trim().min(10).optional(), money: z.string().trim().min(10).optional(), past: z.string().trim().min(10).optional(), safety: z.string().trim().min(10).optional() })
      .optional(),
    /**
     * Only happens when scheduled by another event (the later steps of a
     * chain) or queued by a management action (registries/actions.yaml).
     */
    followUpOnly: z.boolean().optional(),
    cast: z.record(roleSchema, castSpecSchema).optional(),
    /**
     * E5: the possessions the event is about: a pet, a vehicle, a vacation
     * home. One of each is picked among those that fit the requirements, and
     * the event's text can name them ({pet.name}, {vehicle}, {homeCity}).
     */
    bind: z.array(z.enum(POSSESSION_KINDS)).min(1).optional(),
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
