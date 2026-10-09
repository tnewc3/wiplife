/**
 * The eulogy and the funeral (W1, docs/expansion.md): the balance numbers
 * (src/content/balance/eulogy.yaml) for who speaks and who stays away, and
 * the pieces the eulogy is built from (src/content/text/eulogy.yaml). The
 * engine decides what the speaker knows and feels; the text only says it.
 */
import { z } from 'zod';
import { idSchema } from './common';
import { relationshipKindSchema } from './relationships';
import { templateSchema, variantsSchema } from './text';

const probability = z.number().min(0).max(1);

/** What the speaker is to you, for the words of the opening. */
export const EULOGY_GROUPS = ['spouse', 'child', 'elder', 'sibling', 'friend', 'other'] as const;
export const eulogyGroupSchema = z.enum(EULOGY_GROUPS);
export type EulogyGroup = z.infer<typeof eulogyGroupSchema>;

/** How the speaker feels about you, from their affection and trust. */
export const EULOGY_TONES = ['warm', 'measured', 'cool'] as const;
export const eulogyToneSchema = z.enum(EULOGY_TONES);
export type EulogyTone = z.infer<typeof eulogyToneSchema>;

/** The moments of your life a speaker can mention (the engine knows how to tell each is true). */
export const EULOGY_MILESTONES = [
  'career',
  'retired',
  'marriage',
  'divorce',
  'children',
  'prison',
  'bankruptcy',
  'recovery',
  'tooSoon',
  'longLife',
  'famous',
  'hallOfFame',
] as const;
export type EulogyMilestone = (typeof EULOGY_MILESTONES)[number];
/** The milestones people only know about if they are close to you. */
export const INTIMATE_MILESTONES: readonly EulogyMilestone[] = ['prison', 'bankruptcy', 'recovery', 'divorce'];

/** Why someone chose not to come. */
export const ABSENCE_CAUSES = ['estranged', 'feud', 'ex', 'rumor', 'distrust', 'distant', 'far'] as const;
export type AbsenceCause = (typeof ABSENCE_CAUSES)[number];

/** Why someone could not come (they did not choose). */
export const COULD_NOT_REASONS = ['prison', 'ill', 'care'] as const;
export type CouldNotReason = (typeof COULD_NOT_REASONS)[number];

/** The secrets whose existence a speaker may never have known. */
export const UNKNOWN_KINDS = ['affair', 'unknownCrime', 'hiddenDebt', 'addiction', 'identity', 'mentalHealth'] as const;

const perGroup = <T extends z.ZodType>(value: T) => z.strictObject(Object.fromEntries(EULOGY_GROUPS.map((g) => [g, value])) as Record<EulogyGroup, T>);
const perTone = <T extends z.ZodType>(value: T) => z.strictObject(Object.fromEntries(EULOGY_TONES.map((t) => [t, value])) as Record<EulogyTone, T>);

export const eulogyBalanceSchema = z.strictObject({
  speaker: z.strictObject({
    /** Younger people do not speak (or choose whether to come). */
    minAge: z.int().min(0).max(40),
    /** Affection plus trust (0–200) the closest person needs to speak at all. */
    minCombined: z.int().min(0).max(200),
    /** Kinds that never speak (an ex is not who stands up). */
    excludedKinds: z.array(relationshipKindSchema),
    /** What each kind of relationship is called for the opening. */
    groups: perGroup(z.array(relationshipKindSchema)),
  }),
  tone: z.strictObject({
    /** Affection plus trust at or above this is warm; below `cool` is cool; in between is measured. */
    warm: z.int().min(0).max(200),
    cool: z.int().min(0).max(200),
  }),
  length: z.strictObject({
    memories: z.int().min(1).max(5),
    beliefs: z.int().min(0).max(4),
    milestones: z.int().min(0).max(4),
  }),
  /** How likely a memory is to be told, by what kind of memory it is and the speaker's tone. */
  memoryBias: perTone(z.strictObject({ warm: z.number().min(0), hard: z.number().min(0) })),
  /** The chance the speaker says something about what they never knew, when there is something. */
  unknownChance: probability,
  /** Affection plus trust the speaker needs to know the private milestones, if they are not family or a partner. */
  intimateMin: z.int().min(0).max(200),
  /** Age from which a death is a long life. */
  longLifeAge: z.int().min(60).max(120),
  attendance: z.strictObject({
    /** Family and partners (and an ex you were married to) are always expected. A friend is expected at or above this affection plus trust... */
    friendMinCombined: z.int().min(0).max(200),
    /** ...and everyone else (coworkers, classmates...) at or above this. */
    otherMinCombined: z.int().min(0).max(200),
    /** The chance of staying away for each cause that applies; several combine. */
    causes: z.strictObject(Object.fromEntries(ABSENCE_CAUSES.map((c) => [c, probability])) as Record<AbsenceCause, typeof probability>),
    /** Trust below this is a cause (distrust); affection below this is a cause (distant). */
    distrustBelow: z.int().min(0).max(100),
    distantBelow: z.int().min(0).max(100),
    /** Living in another city only keeps someone away if affection plus trust is below this. */
    farBelow: z.int().min(0).max(200),
    /** An illness or addiction this severe (1-100) keeps someone from coming. */
    unableSeverity: z.int().min(1).max(100),
    /** A reason from a memory the person holds is this many times as likely as a general one. */
    specificWeight: z.int().min(1).max(10),
    /** How many who stayed away are listed; the rest are counted. */
    maxListed: z.int().min(1).max(30),
  }),
});
export type EulogyBalance = z.infer<typeof eulogyBalanceSchema>;

const tonedVariants = perTone(variantsSchema);

/**
 * The eulogy's pieces. Roles: `self` (you, who died) and `npc` (the speaker,
 * with {npc.relation}, what they were to you); beliefs may also use `other` (the second person in
 * the story). Values: {known} ("41
 * years"), {since} (when a memory happened, "three years ago"), and the
 * milestone values named in the schema notes below.
 */
export const eulogyTextSchema = z.strictObject({
  /** How it begins: by what the speaker is to you and how they feel. */
  opening: perGroup(tonedVariants),
  /** When the speaker has no memory the text can use. */
  bare: variantsSchema,
  /**
   * One line for each memory a relationship can hold (a tag in
   * registries/memories.yaml), spoken by the person who holds it. Only told
   * when the speaker holds the memory.
   */
  memories: z.record(idSchema, z.strictObject({ valence: z.enum(['warm', 'hard']), line: templateSchema })),
  beliefs: z.strictObject({
    /** The speaker believes what happened: one line for each kind of story (registries/web.yaml). */
    true: z.record(z.string().min(1), templateSchema),
    /** The speaker believes a twisted version: one line for each version that is not a truth. */
    twisted: z.record(idSchema, templateSchema),
  }),
  /** What the speaker never knew: a secret they were not told (one line for each secret kind). */
  unknown: z.strictObject(Object.fromEntries(UNKNOWN_KINDS.map((k) => [k, templateSchema])) as Record<(typeof UNKNOWN_KINDS)[number], typeof templateSchema>),
  /** Moments of your life. Values: career {title}, {employer}; retired {years}; marriage {partner}; divorce {partner}; children {children}; prison {years}; bankruptcy {year}; tooSoon and longLife {age}. */
  milestones: z.strictObject(Object.fromEntries(EULOGY_MILESTONES.map((m) => [m, templateSchema])) as Record<EulogyMilestone, typeof templateSchema>),
  closing: tonedVariants,
  /** "a child" and "{n} children", for {children}. */
  children: z.strictObject({ one: templateSchema, many: templateSchema }),
  /** Why someone chose not to come, from what keeps them away. Role: `npc` (the one who stayed away); values: {heard}, {speaker}. */
  absent: z.strictObject({
    estranged: z.strictObject({
      generic: variantsSchema,
      /** By a memory they hold (a tag in registries/memories.yaml). */
      memory: z.record(idSchema, templateSchema),
    }),
    feud: z.strictObject({ sided: variantsSchema, speaker: variantsSchema, generic: variantsSchema }),
    ex: z.strictObject({ generic: variantsSchema, memory: z.record(idSchema, templateSchema) }),
    rumor: variantsSchema,
    distrust: variantsSchema,
    distant: variantsSchema,
    far: variantsSchema,
  }),
  /** Why someone could not come. Role: `npc`. */
  couldNot: z.strictObject(Object.fromEntries(COULD_NOT_REASONS.map((r) => [r, variantsSchema])) as Record<CouldNotReason, typeof variantsSchema>),
});
export type EulogyText = z.infer<typeof eulogyTextSchema>;
