/**
 * The edit payload (G1, docs/expansion.md): a patch of areas for one target, you or one person. An area holds only the
 * fields that change; a list (conditions, debts, languages, citizenships, troubles) is given as the wanted list, so a replay
 * never depends on the order of small steps. The stored payload is the parsed one (names tidied, no unknown keys).
 */
import { z } from 'zod';
import { countryIdSchema, idSchema, TRAIT_KEYS } from '../../content/schemas';
import { debtKindSchema } from '../../content/schemas/economy';
import { genderCategorySchema } from '../../content/schemas/character';
import { familyWealthSchema, freeTextSchema, identityInputSchema, personNameSchema, pronounsSchema } from '../creation/input';

const score = z.int('Must be a whole number').min(0).max(100);
const positiveScore = z.int('Must be a whole number').min(1).max(100);
const personId = z.string().min(1).max(60);

const traits = z.strictObject(Object.fromEntries(TRAIT_KEYS.map((k) => [k, score.nullable().optional()])) as Record<(typeof TRAIT_KEYS)[number], z.ZodOptional<z.ZodNullable<typeof score>>>);

const latentSchema = z.strictObject({
  /** Who they are attracted to, deep down; null clears it. */
  attractedTo: z.array(genderCategorySchema).max(3).nullable().optional(),
  /** A gender waiting to surface; null clears it. */
  gender: z.strictObject({ genderCategory: genderCategorySchema, genderIdentity: identityInputSchema.shape.genderIdentity, pronouns: pronounsSchema }).nullable().optional(),
  expression: identityInputSchema.shape.genderExpression.nullable().optional(),
  personality: traits.optional(),
  /** A pull toward another faith (null id: toward none); null clears it. */
  faith: z.strictObject({ id: idSchema.nullable() }).nullable().optional(),
});

export const editPayloadSchema = z.strictObject({
  target: z.union([z.literal('self'), z.strictObject({ person: personId })]),
  name: z.strictObject({ first: personNameSchema('a first name'), last: personNameSchema('a last name') }).optional(),
  identity: identityInputSchema.extend({ canCarry: z.boolean() }).partial().optional(),
  latent: latentSchema.optional(),
  looks: score.optional(),
  appearance: z.strictObject({ descriptors: z.array(freeTextSchema('a description')).max(8) }).optional(),
  stats: z
    .strictObject({
      health: positiveScore,
      happiness: score,
      smarts: score,
      fitness: score,
      stress: score,
      mood: score,
      moodBase: score,
    })
    .partial()
    .optional(),
  personality: traits.optional(),
  values: z
    .strictObject({
      luck: score,
      reputation: score,
      geneticRisk: score,
      vice: score,
      innerConflict: score,
      happinessBaseline: score,
      talent: idSchema.nullable(),
      talentDiscovered: z.boolean(),
    })
    .partial()
    .optional(),
  /** Your health conditions, as the wanted list. `named`: a mental or neuro condition has a name (a diagnosis). */
  conditions: z.array(z.strictObject({ conditionId: idSchema, severity: positiveScore, treated: z.boolean(), named: z.boolean().optional() })).max(40).optional(),
  /** A person's illnesses and addictions, as the wanted list (crimes are not editable). */
  troubles: z.array(z.strictObject({ kind: z.enum(['illness', 'addiction']), refId: idSchema, severity: positiveScore, treated: z.boolean() })).max(10).optional(),
  /** A person's born-with conditions. */
  neuro: z.array(idSchema).max(10).optional(),
  relationship: z
    .strictObject({
      kind: z.enum(['friend', 'acquaintance', 'partner', 'fiance', 'spouse', 'ex', 'coworker', 'boss', 'classmate']),
      affection: score,
      trust: score,
      status: z.enum(['active', 'estranged', 'ended']),
      wasSpouse: z.boolean(),
    })
    .partial()
    .optional(),
  /** A job track and the level in it, or no job (jobId null). */
  work: z.strictObject({ jobId: idSchema.nullable(), level: z.int().min(1).max(20) }).optional(),
  wealth: familyWealthSchema.optional(),
  cityId: idSchema.optional(),
  faith: z.strictObject({ id: idSchema.nullable(), strength: score }).optional(),
  languages: z.array(z.strictObject({ id: idSchema, skill: score, native: z.boolean() })).max(20).optional(),
  citizenships: z.array(countryIdSchema).max(10).optional(),
  money: z
    .strictObject({
      savings: z.int('Must be a whole number').min(-1_000_000_000_000).max(1_000_000_000_000),
      /** The debts of the kinds an edit can change, as the wanted list; an id names one you have, none adds a new one. */
      debts: z.array(z.strictObject({ id: idSchema.optional(), kind: debtKindSchema, balance: z.int('Must be a whole number').min(-1_000_000_000_000).max(1_000_000_000_000) })).max(20),
    })
    .partial()
    .optional(),
  birthYear: z.int().min(1000).max(5000).optional(),
  /**
   * C2: your careers beyond a job. Sports: position, Greatness (craft), skills, salary, the season history. Music: buzz, the band's
   * chemistry and members' playing, releases. Fame: fame, image, fans, fan mood, agent, contract. Yours only.
   */
  career: z
    .strictObject({
      sports: z
        .strictObject({
          position: idSchema,
          greatness: score,
          skills: z.record(idSchema, score),
          salary: z.int('Must be a whole number').min(0).max(1_000_000_000),
          history: z.literal('clear'),
        })
        .partial()
        .optional(),
      music: z
        .strictObject({
          buzz: score,
          chemistry: score,
          members: z.array(z.strictObject({ id: personId, skill: score })).max(8),
          releases: z.literal('clear'),
        })
        .partial()
        .optional(),
      fame: z
        .strictObject({
          fame: score,
          image: score,
          fans: z.int('Must be a whole number').min(0).max(2_000_000_000),
          mood: score,
          agent: idSchema.nullable(),
          contract: z.literal('end'),
        })
        .partial()
        .optional(),
    })
    .optional(),
});

export type EditPayload = z.infer<typeof editPayloadSchema>;
export type EditArea = Exclude<keyof EditPayload, 'target'>;

export const EDIT_AREAS: readonly EditArea[] = [
  'name', 'identity', 'latent', 'looks', 'appearance', 'stats', 'personality', 'values', 'conditions', 'troubles', 'neuro',
  'relationship', 'work', 'wealth', 'cityId', 'faith', 'languages', 'citizenships', 'money', 'birthYear', 'career',
];

/** The person an edit is about, or null for you. */
export function targetPersonId(payload: EditPayload): string | null {
  return payload.target === 'self' ? null : payload.target.person;
}

/** How many fields an edit changes: one for each value, and one for each entry of a list. */
export function fieldCount(payload: EditPayload): number {
  const count = (value: unknown): number => {
    if (Array.isArray(value)) return value.length === 0 ? 1 : value.length;
    if (value !== null && typeof value === 'object') return Object.values(value).reduce<number>((n, v) => n + count(v), 0);
    return 1;
  };
  return EDIT_AREAS.reduce((n, area) => (payload[area] === undefined ? n : n + count(payload[area])), 0);
}

