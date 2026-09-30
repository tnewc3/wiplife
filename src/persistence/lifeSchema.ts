/**
 * Validates a saved LifeState when it is loaded. Typed against the engine's
 * LifeState, so TypeScript reports any drift between the two. Strict objects:
 * an unexpected field means the save needs a migration, not silent dropping.
 */
import { z } from 'zod';
import type { ContentBundle } from '../content/schemas';
import { checkInvariants } from '../engine/invariants';
import { isRngState, type RngState } from '../engine/rng';
import type { LifeState } from '../engine/types';

const int = z.int();
const score = z.int().min(0).max(100);
const dollars = z.int().refine(Number.isSafeInteger, 'must be a safe integer');
const id = z.string().min(1);
const category = z.enum(['man', 'woman', 'nonbinary']);
/** Text that must hold more than spaces (names, pronoun forms). */
const filled = z.string().refine((s) => s.trim().length > 0, 'must not be empty');

/** Like .partial(), but keys may be absent, never present as undefined. */
function exactPartial<S extends Record<string, z.ZodType>>(schema: z.ZodObject<S>) {
  const shape = Object.fromEntries(Object.entries(schema.shape).map(([k, v]) => [k, v.exactOptional()])) as {
    [K in keyof S]: z.ZodExactOptional<S[K]>;
  };
  return z.strictObject(shape);
}

const pronouns = z.strictObject({
  subject: filled,
  object: filled,
  possessive: filled,
  possessivePronoun: filled,
  reflexive: filled,
  verbPlural: z.boolean(),
});

const identity = z.strictObject({
  genderIdentity: z.string(),
  genderCategory: category,
  genderExpression: z.string(),
  pronouns,
  attractedTo: z.array(category),
});

const personality = z.strictObject({
  ambition: score,
  confidence: score,
  kindness: score,
  riskTaking: score,
  discipline: score,
  sociability: score,
});

const stats = z.strictObject({
  health: score,
  happiness: score,
  smarts: score,
  looks: score,
  fitness: score,
  stress: score,
});

const name = z.strictObject({ first: filled, last: filled });

const character = z.strictObject({
  name,
  age: int,
  lifeStage: z.enum(['early', 'child', 'teen', 'youngAdult', 'adult', 'senior']),
  identity,
  latent: z.strictObject({
    identity: exactPartial(identity).exactOptional(),
    personality: exactPartial(personality).exactOptional(),
  }),
  appearance: z.strictObject({ descriptors: z.array(z.string()) }),
  stats,
  personality,
  hidden: z.strictObject({
    luck: score,
    reputation: score,
    geneticRisk: score,
    vice: score,
    innerConflict: score,
    talent: id.nullable(),
    talentDiscovered: z.boolean(),
  }),
  cityId: id,
  familyWealth: z.enum(['poor', 'working', 'middle', 'affluent', 'rich']),
  custom: z.boolean(),
});

const person = z.strictObject({
  id,
  name,
  birthYear: int,
  alive: z.boolean(),
  deathYear: int.exactOptional(),
  identity,
  traits: exactPartial(personality),
  looks: score,
  smarts: score,
  cityId: id,
  occupation: z.string().exactOptional(),
  tags: z.array(z.string()),
});

const relationship = z.strictObject({
  personId: id,
  kind: z.enum([
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
  ]),
  status: z.enum(['active', 'estranged', 'ended']),
  affection: score,
  trust: score,
  memories: z.array(z.strictObject({ tag: z.string(), year: int })),
  since: int,
});

const education = z.strictObject({
  current: z
    .strictObject({
      program: z.enum(['elementary', 'middle', 'high', 'college', 'trade', 'grad']),
      tier: z.enum(['community', 'state', 'elite']).exactOptional(),
      majorId: id.exactOptional(),
      tradeId: id.exactOptional(),
      gradProgramId: id.exactOptional(),
      year: int,
      lengthYears: int,
      gpa: z.number(),
    })
    .nullable(),
  credentials: z.array(
    z.strictObject({
      type: z.enum(['hs_diploma', 'ged', 'associate', 'bachelor', 'trade_license', 'grad']),
      refId: id.exactOptional(),
      year: int,
    }),
  ),
});

const career = z.strictObject({
  job: z
    .strictObject({ jobId: id, level: int, yearsAtLevel: int, performance: score, salary: dollars })
    .nullable(),
  gig: z.boolean(),
  retired: z.boolean(),
  history: z.array(
    z.strictObject({
      jobId: id,
      fromYear: int,
      toYear: int,
      endedBy: z.enum(['quit', 'fired', 'laid_off', 'retired', 'moved']),
    }),
  ),
});

const finances = z.strictObject({
  savings: dollars,
  debts: z.array(
    z.strictObject({
      id,
      kind: z.enum(['student', 'personal', 'mortgage', 'medical', 'collections']),
      balance: dollars,
      annualRate: z.number(),
      minPayment: dollars,
      missed: int,
    }),
  ),
  lifestyle: z.enum(['frugal', 'comfortable', 'lavish']),
  lastLedger: z
    .strictObject({
      year: int,
      gross: dollars,
      tax: dollars,
      housing: dollars,
      living: dollars,
      debtPayments: dollars,
      net: dollars,
    })
    .exactOptional(),
});

const housing = z.strictObject({
  kind: z.enum(['with_parents', 'renting', 'owned', 'homeless', 'incarcerated']),
  cityId: id,
  annualCost: dollars,
  homeValue: dollars.exactOptional(),
  mortgageDebtId: id.exactOptional(),
});

const health = z.strictObject({
  conditions: z.array(z.strictObject({ conditionId: id, since: int, severity: z.number(), treated: z.boolean() })),
});

const legal = z.strictObject({
  record: z.array(
    z.strictObject({ offenseId: id, year: int, outcome: z.enum(['warning', 'fine', 'probation', 'jail']) }),
  ),
  probationUntil: int.exactOptional(),
  incarceratedUntil: int.exactOptional(),
});

const cast = z.record(z.string(), id);

export const historyEntrySchema = z.strictObject({
  year: int,
  age: int,
  text: z.string(),
  tags: z.array(z.string()),
  importance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  legendary: z.boolean().exactOptional(),
});
const historyEntry = historyEntrySchema;

export { pronouns as pronounsSchema, stats as statsSchema };

export const lifeStateSchema: z.ZodType<LifeState> = z.strictObject({
  id,
  seed: z.string().min(1),
  rng: z.custom<RngState>(isRngState, 'invalid generator state'),
  birthYear: int,
  currentYear: int,
  phase: z.enum(['yearStart', 'events', 'yearEnd', 'dead']),
  character,
  people: z.record(z.string(), person),
  relationships: z.record(z.string(), relationship),
  education,
  career,
  finances,
  housing,
  health,
  legal,
  flags: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])),
  eventLog: z.record(z.string(), z.strictObject({ count: int, lastYear: int })),
  scheduled: z.array(z.strictObject({ eventId: id, dueYear: int, cast })),
  pending: z.array(
    z.strictObject({
      instanceId: id,
      eventId: id,
      cast,
      resolvedChoiceId: id.exactOptional(),
      outcomeText: z.string().exactOptional(),
    }),
  ),
  history: z.array(historyEntry),
  inputLog: z.array(
    z.strictObject({
      year: int,
      kind: z.enum(['create', 'ageUp', 'choice', 'action']),
      payload: z.record(z.string(), z.unknown()),
    }),
  ),
  recap: z
    .strictObject({ year: int, age: int, statsBefore: stats, statsAfter: stats.nullable() })
    .nullable(),
  death: z.strictObject({ year: int, age: int, causeId: id }).nullable(),
  lineage: z.strictObject({ generation: int.min(1), parentLifeId: id.exactOptional() }),
});

/**
 * The schema used when loading a life: the shape above plus every engine
 * invariant. A save that fails either is treated as damaged, so loading falls
 * back to a backup.
 */
export function loadedLifeSchema(content: ContentBundle): z.ZodType<LifeState> {
  return lifeStateSchema.superRefine((life, ctx) => {
    for (const failure of checkInvariants(life, content)) ctx.addIssue({ code: 'custom', message: failure });
  });
}
