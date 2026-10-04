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
    happinessBaseline: score,
    talent: id.nullable(),
    talentDiscovered: z.boolean(),
  }),
  cityId: id,
  birthCityId: id,
  familyWealth: z.enum(['poor', 'working', 'middle', 'affluent', 'rich']),
  custom: z.boolean(),
  canCarry: z.boolean(),
});

const childData = z.strictObject({
  origin: z.enum(['birth', 'adopted', 'ivf', 'surrogacy', 'step']),
  otherParentId: id.exactOptional(),
  custody: z.enum(['you', 'shared', 'other']),
  custodyDecided: z.boolean(),
  health: score,
  happiness: score,
  fitness: score,
  stress: score,
  geneticRisk: score,
  talent: id.nullable(),
  gpa: z.number().min(0).max(4),
  latent: z.strictObject({
    identity: exactPartial(identity).exactOptional(),
    personality: exactPartial(personality).exactOptional(),
  }),
  movedOutYear: int.exactOptional(),
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
  mood: score,
  moodBase: score,
  wealthLevel: z.enum(['poor', 'working', 'middle', 'affluent', 'rich']),
  canCarry: z.boolean(),
  priorChildren: z.array(int).min(1).exactOptional(),
  child: childData.exactOptional(),
});

const relationship = z.strictObject({
  personId: id,
  kind: z.enum([
    'parent',
    'stepparent',
    'sibling',
    'grandparent',
    'child',
    'stepchild',
    'friend',
    'partner',
    'fiance',
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
  kindSince: int.exactOptional(),
  lastActionYear: int.exactOptional(),
  wasSpouse: z.literal(true).exactOptional(),
  interactions: z
    .strictObject({
      year: int,
      counts: z.record(z.string(), int.min(1)),
      gained: z.strictObject({ affection: int.min(0), trust: int.min(0) }),
      annoyed: z.boolean(),
    })
    .exactOptional(),
  parenting: z.strictObject({ warmth: score, strictness: score, involvement: score }).exactOptional(),
});

const program = z.enum(['elementary', 'middle', 'high', 'college', 'trade', 'grad']);
const tier = z.enum(['community', 'state', 'elite']);
const gpa = z.number().min(0).max(4);
const share = z.number().min(0).max(1);
const placeFields = {
  program,
  tier: tier.exactOptional(),
  majorId: id.exactOptional(),
  tradeId: id.exactOptional(),
  gradProgramId: id.exactOptional(),
};
const enrollmentFields = {
  ...placeFields,
  year: int.min(1),
  lengthYears: int.min(1),
  gpa,
  boost: z.number().min(-2).max(2),
  repeats: int.min(0),
  scholarship: share,
  since: int,
};

const education = z.strictObject({
  current: z.strictObject(enrollmentFields).nullable(),
  credentials: z.array(
    z.strictObject({
      type: z.enum(['hs_diploma', 'ged', 'associate', 'bachelor', 'trade_license', 'grad']),
      refId: id.exactOptional(),
      year: int,
      gpa: gpa.exactOptional(),
      tier: tier.exactOptional(),
    }),
  ),
  admission: z
    .strictObject({
      ...placeFields,
      scholarship: share,
      decided: int,
      resume: z.strictObject({ year: int.min(1), lengthYears: int.min(1), gpa, repeats: int.min(0) }).exactOptional(),
    })
    .nullable(),
  left: z.strictObject({ ...enrollmentFields, leftYear: int }).nullable(),
  applied: z.array(z.strictObject({ option: z.string().min(1), accepted: z.boolean() })),
  fund: dollars.min(0),
  lastBill: z
    .strictObject({ year: int, tuition: dollars, scholarship: dollars, family: dollars, fund: dollars, loan: dollars })
    .exactOptional(),
});

const career = z.strictObject({
  job: z
    .strictObject({
      jobId: id,
      level: int.min(1),
      yearsAtLevel: int.min(0),
      performance: score,
      salary: dollars,
      since: int,
      employer: filled,
      raiseYear: int.exactOptional(),
    })
    .nullable(),
  gig: z.boolean(),
  retired: z.boolean(),
  history: z.array(
    z.strictObject({
      jobId: id,
      employer: filled,
      fromYear: int,
      toYear: int,
      level: int.min(1),
      salary: dollars,
      endedBy: z.enum(['quit', 'fired', 'laid_off', 'retired', 'moved', 'jailed']),
    }),
  ),
  applied: z.array(z.strictObject({ jobId: id, hired: z.boolean() })),
  openings: z.array(id),
});

const finances = z.strictObject({
  savings: dollars,
  debts: z.array(
    z.strictObject({
      id,
      kind: z.enum(['student', 'personal', 'mortgage', 'medical', 'collections']),
      balance: dollars,
      annualRate: z.number().min(0).max(1),
      minPayment: dollars,
      missed: int.min(0),
    }),
  ),
  lifestyle: z.enum(['frugal', 'comfortable', 'lavish']),
  lastLedger: z
    .strictObject({
      year: int,
      gross: dollars,
      retirement: dollars,
      tax: dollars,
      housing: dollars,
      living: dollars,
      debtPayments: dollars,
      interest: dollars,
      debtInterest: dollars,
      borrowed: dollars,
      support: dollars,
      children: dollars,
      supportPaid: dollars,
      supportReceived: dollars,
      net: dollars,
    })
    .exactOptional(),
  earnings: z.strictObject({ years: int.min(0), total: dollars }),
  hardshipYears: int.min(0),
  bankruptcyYear: int.exactOptional(),
  debtPlanYear: int.exactOptional(),
});

const housing = z.strictObject({
  kind: z.enum(['with_parents', 'renting', 'owned', 'homeless', 'incarcerated']),
  cityId: id,
  annualCost: dollars,
  homeValue: dollars.exactOptional(),
  mortgageDebtId: id.exactOptional(),
  since: int,
  roommate: z.literal(true).exactOptional(),
  partnerId: id.exactOptional(),
  rentFactor: z.number().positive().max(10).exactOptional(),
});

const health = z.strictObject({
  conditions: z.array(z.strictObject({ conditionId: id, since: int, severity: z.int().min(1).max(100), treated: z.boolean() })),
  lastVisit: int.exactOptional(),
});

const legal = z.strictObject({
  record: z.array(
    z.strictObject({
      offenseId: id,
      year: int,
      outcome: z.enum(['warning', 'fine', 'probation', 'jail']),
      amount: dollars.exactOptional(),
      years: int.min(1).exactOptional(),
    }),
  ),
  probationUntil: int.exactOptional(),
  incarceratedUntil: int.exactOptional(),
});

const surfacedEntry = z.strictObject({ year: int, times: int.min(1) });
const discovery = z.strictObject({
  surfaced: z.strictObject({
    attraction: surfacedEntry.exactOptional(),
    gender: surfacedEntry.exactOptional(),
    expression: surfacedEntry.exactOptional(),
    personality: surfacedEntry.exactOptional(),
    talent: surfacedEntry.exactOptional(),
  }),
  crisisYear: int.exactOptional(),
});

const family = z.strictObject({
  pregnancy: z
    .strictObject({
      startYear: int,
      how: z.enum(['trying', 'unplanned', 'ivf', 'surrogacy']),
      carrier: id,
      otherParentId: id.exactOptional(),
      decision: z.enum(['pending', 'keep', 'adoption']),
    })
    .nullable(),
  process: z
    .strictObject({
      kind: z.enum(['adoption', 'ivf', 'surrogacy']),
      startYear: int,
      dueYear: int,
      carrier: id.exactOptional(),
      otherParentId: id.exactOptional(),
    })
    .nullable(),
  support: z.strictObject({ direction: z.enum(['pay', 'receive']), personId: id }).nullable(),
  attempts: int.min(0),
  lostChildren: int.min(0),
  miscarriages: int.min(0),
});

const cast = z.record(z.string(), id);

const moneyChange = z.strictObject({
  change: int,
  balance: int.min(0),
  debtChange: int,
  familyHelp: int.min(1).exactOptional(),
  housing: z.strictObject({ change: int, annual: int.min(0) }).exactOptional(),
});

const pendingInteraction = z.strictObject({
  interactionId: id,
  personId: id,
  tier: z.enum(['great', 'good', 'neutral', 'bad', 'backfire']),
  giftTier: z.enum(['small', 'medium', 'big']).exactOptional(),
  text: filled,
  notes: z.array(filled),
  changes: z.strictObject({ affection: int, trust: int, mood: int }),
  annoyed: z.boolean(),
  money: moneyChange.exactOptional(),
  choice: z
    .strictObject({
      prompt: filled,
      options: z.array(z.strictObject({ id, label: filled })).min(2),
      chosen: id.exactOptional(),
      result: filled.exactOptional(),
    })
    .exactOptional(),
});

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
  phase: z.enum(['yearStart', 'events', 'yearEnd', 'dead', 'action']),
  character,
  people: z.record(z.string(), person),
  relationships: z.record(z.string(), relationship),
  education,
  career,
  finances,
  housing,
  health,
  legal,
  discovery,
  flags: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])),
  eventLog: z.record(z.string(), z.strictObject({ count: int, lastYear: int })),
  scheduled: z.array(z.strictObject({ eventId: id, dueYear: int, cast, since: int.exactOptional() })),
  pending: z.array(
    z.strictObject({
      instanceId: id,
      eventId: id,
      cast,
      resolvedChoiceId: id.exactOptional(),
      outcomeText: z.string().exactOptional(),
      since: int.exactOptional(),
      money: moneyChange.exactOptional(),
    }),
  ),
  pendingInteraction: pendingInteraction.nullable(),
  family,
  history: z.array(historyEntry),
  inputLog: z.array(
    z.strictObject({
      year: int,
      kind: z.enum(['create', 'ageUp', 'choice', 'action', 'interact', 'interactChoice', 'interactClose']),
      payload: z.record(z.string(), z.unknown()),
    }),
  ),
  recap: z
    .strictObject({ year: int, age: int, statsBefore: stats, statsAfter: stats.nullable() })
    .nullable(),
  death: z.strictObject({ year: int, age: int, causeId: id }).nullable(),
  lifetime: z.strictObject({ happinessTotal: int.min(0), years: int.min(0) }),
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
