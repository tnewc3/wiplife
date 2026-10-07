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

const wealthLevel = z.enum(['poor', 'working', 'middle', 'affluent', 'rich']);

// E3: a person's own life.
const outsidePartner = z.strictObject({
  name,
  genderCategory: category,
  birthYear: int,
  canCarry: z.boolean(),
  status: z.enum(['dating', 'engaged', 'married']),
  since: int,
  statusSince: int,
});
const trouble = z.strictObject({
  kind: z.enum(['illness', 'crime', 'addiction']),
  refId: id,
  since: int,
  severity: int.min(0).max(100),
  treated: z.boolean(),
  stage: z.enum(['held', 'bailed', 'probation', 'jail']).exactOptional(),
  until: int.exactOptional(),
});
const personLife = z.strictObject({
  tier: z.enum(['close', 'near', 'far']),
  background: wealthLevel,
  level: int.min(0),
  levelSince: int,
  jobLost: z.strictObject({ year: int, how: z.enum(['fired', 'laid_off']) }).exactOptional(),
  retired: z.literal(true).exactOptional(),
  partner: outsidePartner.nullable(),
  ended: z.strictObject({ year: int, how: z.enum(['broke_up', 'divorced', 'widowed']), partner: filled }).exactOptional(),
  children: z.array(z.strictObject({ first: filled, birthYear: int })),
  troubles: z.array(trouble),
  recovered: z.array(z.strictObject({ refId: id, year: int })),
  care: z.enum(['needed', 'home', 'paid', 'sibling']).exactOptional(),
  careSince: int.exactOptional(),
  gossip: score,
  requestYear: int.exactOptional(),
});
// E4: the social web.
const tie = z.strictObject({
  a: id,
  b: id,
  kind: z.enum(['married', 'dating', 'siblings', 'parentChild', 'inLaw', 'friends']),
  affection: score,
  origin: z.enum(['family', 'partner', 'context', 'introduced']),
  since: int,
  feud: z.strictObject({ since: int, side: id.exactOptional(), neutral: z.literal(true).exactOptional(), aware: z.literal(true).exactOptional() }).exactOptional(),
  kindSince: int.exactOptional(),
  eventYear: int.exactOptional(),
  followed: z.literal(true).exactOptional(),
});
const holder = z.strictObject({
  version: filled,
  since: int,
  from: filled,
  reacted: z.boolean(),
  hushed: int.exactOptional(),
});
const knowledgeItem = z.strictObject({
  id,
  kind: filled,
  subject: filled,
  other: id.exactOptional(),
  year: int,
  truth: filled,
  holders: z.record(z.string(), holder),
  public: z.literal(true).exactOptional(),
});
const web = z.strictObject({
  ties: z.record(z.string(), tie),
  items: z.array(knowledgeItem),
  nextItem: int.min(1),
  seen: z.array(z.string()),
});
const newsYear = z.strictObject({
  year: int,
  lines: z.array(z.strictObject({ personId: id, kind: filled, text: filled })),
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
  wealthLevel,
  canCarry: z.boolean(),
  priorChildren: z.array(int).min(1).exactOptional(),
  child: childData.exactOptional(),
  life: personLife.exactOptional(),
  neuro: z.array(id).min(1).exactOptional(),
});

const relationship = z.strictObject({
  personId: id,
  kind: z.enum([
    'parent',
    'stepparent',
    'sibling',
    'grandparent',
    'relative',
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
      kind: z.enum(['student', 'personal', 'mortgage', 'medical', 'collections', 'auto']),
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
      care: dollars,
      supportPaid: dollars,
      supportReceived: dollars,
      upkeep: dollars,
      insurance: dollars,
      net: dollars,
    })
    .exactOptional(),
  earnings: z.strictObject({ years: int.min(0), total: dollars }),
  hardshipYears: int.min(0),
  trust: z.strictObject({ balance: dollars.min(1), releaseAge: int.min(1) }).exactOptional(),
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
  guardianId: id.exactOptional(),
  foster: z.literal(true).exactOptional(),
  renovations: z.array(z.strictObject({ id, year: int })).exactOptional(),
});

// M1: mental health.
const reaction = z.enum(['supportive', 'neutral', 'dismissive']);
const health = z.strictObject({
  conditions: z.array(
    z.strictObject({
      conditionId: id,
      since: int,
      severity: z.int().min(1).max(100),
      treated: z.boolean(),
      diagnosed: int.exactOptional(),
      diagnosedBy: z.enum(['doctor', 'therapist', 'assessment', 'crisis']).exactOptional(),
      care: z.array(z.enum(['therapy', 'medication', 'support'])).exactOptional(),
    }),
  ),
  lastVisit: int.exactOptional(),
  mental: z.strictObject({
    trauma: score,
    noticed: z.record(z.string(), z.strictObject({ since: int, year: int, reaction, told: z.literal(true).exactOptional() })),
    past: z.record(z.string(), z.strictObject({ year: int, times: int.min(1), diagnosed: z.boolean() })),
    crisisYear: int.exactOptional(),
    crises: int.min(0),
    lastTherapist: int.exactOptional(),
    sideEffectYear: int.exactOptional(),
  }),
});

const legal = z.strictObject({
  record: z.array(
    z.strictObject({
      offenseId: id,
      year: int,
      outcome: z.enum(['warning', 'fine', 'probation', 'jail']),
      amount: dollars.exactOptional(),
      years: int.min(1).exactOptional(),
      sealed: z.literal(true).exactOptional(),
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

const will = z.strictObject({
  shares: z.array(z.strictObject({ kind: z.enum(['person', 'cause']), id, percent: int.min(1).max(100) })).min(1),
  year: int,
});

const relationKind = z.enum([
  'parent', 'stepparent', 'sibling', 'grandparent', 'relative', 'child', 'stepchild', 'friend', 'partner', 'fiance', 'spouse', 'ex', 'coworker', 'boss', 'classmate', 'acquaintance',
]);

// E5: what you own.
const renovation = z.strictObject({ id, year: int });
const possession = z.strictObject({
  id,
  kind: z.enum(['pet', 'vehicle', 'home']),
  defId: id,
  acquired: int,
  value: dollars,
  condition: score,
  name: z.string().min(1).max(20).exactOptional(),
  pet: z
    .strictObject({
      personality: z.enum(['playful', 'anxious', 'stubborn', 'lazy']),
      bond: score,
      startAge: int.min(0),
      lifespan: int.min(1),
      ill: z.boolean(),
      vetYear: int.exactOptional(),
      died: int.exactOptional(),
      interactions: z
        .strictObject({ year: int, counts: z.record(z.string(), int.min(1)), gained: int.min(0), annoyed: z.boolean() })
        .exactOptional(),
    })
    .exactOptional(),
  vehicle: z.strictObject({ startAge: int.min(0), insured: z.boolean(), serviceYear: int.exactOptional(), loanDebtId: id.exactOptional() }).exactOptional(),
  home: z.strictObject({ cityId: id, insured: z.boolean(), mortgageDebtId: id.exactOptional(), renovations: z.array(renovation) }).exactOptional(),
});
const possessions = z.strictObject({ items: z.array(possession), nextId: int.min(1), claims: z.array(int), noVehicleYears: int.min(0) });

// T1: the teen years.
const ruleDomain = z.enum(['curfew', 'chores', 'grades', 'screens', 'friends', 'parties', 'car', 'check_in', 'money']);
const teen = z.strictObject({
  school: z.strictObject({ key: id, cityId: id, program: z.enum(['middle', 'high']), since: int }).nullable(),
  cliques: z.array(z.strictObject({ id, defId: id, members: z.array(id), standing: score, rival: id.exactOptional() })),
  nextClique: int.min(1),
  member: z.strictObject({ cliqueId: id, since: int, rank: score }).nullable(),
  turnedAway: z.record(z.string(), int),
  invite: id.exactOptional(),
  clash: z.strictObject({ cliqueId: id, since: int, until: int }).exactOptional(),
  standing: score,
  focus: z.strictObject({ year: int, id: z.enum(['school', 'friends', 'work', 'passion']) }).nullable(),
  focusYears: z.strictObject({ school: int.min(0), friends: int.min(0), work: int.min(0), passion: int.min(0) }),
  passion: score,
  license: z.strictObject({ stage: z.enum(['none', 'permit', 'licensed']), since: int.exactOptional(), lessons: int.min(0), fails: int.min(0), testYear: int.exactOptional() }),
  job: z.strictObject({ jobId: id, employer: z.string().min(1), since: int }).nullable(),
  activities: z.array(z.strictObject({ id, since: int })),
  home: z
    .strictObject({
      styles: z.record(z.string(), z.strictObject({ warmth: score, strictness: score, involvement: score })),
      rules: z.array(
        z.strictObject({ ruleId: ruleDomain, by: id, level: z.union([z.literal(0), z.literal(1), z.literal(2)]), since: int, negotiated: int.exactOptional(), broken: int.min(0), caught: int.min(0) }),
      ),
      year: int,
    })
    .nullable(),
  penalties: z.array(z.strictObject({ kind: z.enum(['grounded', 'privilege']), until: int, domain: ruleDomain.exactOptional() })),
  caught: z.strictObject({ year: int, ruleId: ruleDomain, by: id }).exactOptional(),
  totals: z.strictObject({ broken: int.min(0), caught: int.min(0), negotiated: int.min(0), won: int.min(0) }),
  seenRecords: int.min(0),
  sealed: z.literal(true).exactOptional(),
});

const settlement = z.strictObject({
  year: int,
  source: z.enum(['will', 'default']),
  savings: dollars.min(0),
  homeValue: dollars.min(0),
  mortgage: dollars.min(0),
  costs: dollars.min(0),
  debtsPaid: dollars.min(0),
  tax: dollars.min(0),
  writtenOff: dollars.min(0),
  home: z.enum(['none', 'passes', 'sold', 'surrendered']),
  mortgagePaid: dollars.min(0),
  saleCosts: dollars.min(0),
  netEstate: dollars.min(0),
  lines: z.array(
    z.strictObject({
      kind: z.enum(['person', 'cause']),
      id,
      name: filled,
      relation: z.union([relationKind, z.literal('cause')]),
      percent: int.min(1).max(100),
      cash: dollars.min(0),
      property: z.strictObject({ value: dollars.min(0), mortgage: dollars.min(0) }).exactOptional(),
    }),
  ),
  unclaimed: dollars.min(0),
  possessions: z.array(z.strictObject({ possessionId: id, toPersonId: id, item: possession, loan: dollars.min(0) })),
  possessionSales: dollars.min(0),
});

const lineage = z.strictObject({
  generation: int.min(1),
  parentLifeId: id.exactOptional(),
  lineId: id,
  familyName: filled,
  reputation: score,
  deeds: z.array(z.string()),
  previously: z.strictObject({ parentName: filled, lines: z.array(filled).min(1) }).exactOptional(),
});

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
  pet: z.literal(true).exactOptional(),
  otherId: id.exactOptional(),
  itemId: z.string().min(1).exactOptional(),
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
      card: z.object({ title: z.string(), text: z.string() }).strict().exactOptional(),
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
  will: will.nullable(),
  estate: settlement.nullable(),
  lineage,
  news: z.array(newsYear),
  web,
  possessions,
  teen,
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
