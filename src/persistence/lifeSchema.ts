import { lookSchema } from '../engine/looks/schema';
import { languageSkillSchema } from '../content/schemas/languages';
import { APPLICATION_KINDS, APPLICATION_STATUSES, COUNTRY_IDS, REGULARIZATION_BASES, REMIT_LEVELS, ROUTES, SOUVENIRS, STAY_ROUTES, STAY_TYPES, TRIP_ACTIVITIES, TRIP_STYLES } from '../content/schemas';
/**
 * Validates a saved LifeState when it is loaded. Typed against the engine's
 * LifeState, so TypeScript reports any drift between the two. Strict objects:
 * an unexpected field means the save needs a migration, not silent dropping.
 */
import { z } from 'zod';
import { BUSINESS_STYLES, MARKETING_LEVELS, ORDER_LEVELS, OWNER_ROLES, PAY_LEVELS, PRICE_LEVELS, QUALITY_LEVELS, STAFFING_LEVELS, TRAINING_LEVELS, type ContentBundle } from '../content/schemas';
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

const languages = z.array(languageSkillSchema).min(1).refine((ls) => new Set(ls.map((l) => l.id)).size === ls.length, "duplicate language").refine((ls) => ls.some((l) => l.native), "needs a native language");
// (Duplicates are an invariant, checked once per life with the rest of the migration rules.)
const citizenships = z.array(z.enum(COUNTRY_IDS)).min(1);
const character = z.strictObject({
  look: lookSchema.exactOptional(),
  languages,
  citizenships,
  name,
  age: int,
  lifeStage: z.enum(['early', 'child', 'teen', 'youngAdult', 'adult', 'senior']),
  identity,
  latent: z.strictObject({
    identity: exactPartial(identity).exactOptional(),
    personality: exactPartial(personality).exactOptional(),
    faith: z.strictObject({ id: id.nullable() }).exactOptional(),
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
  heritage: z.string().min(1).max(40).exactOptional(),
  formerNames: z.array(z.strictObject({ first: filled, last: filled, year: int })).max(20).exactOptional(),
});

const childData = z.strictObject({
  origin: z.enum(['birth', 'adopted', 'ivf', 'surrogacy', 'step', 'grandchild']),
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
  children: z.array(z.strictObject({ first: filled, birthYear: int, id: id.exactOptional() })),
  troubles: z.array(trouble),
  recovered: z.array(z.strictObject({ refId: id, year: int })),
  care: z.enum(['needed', 'home', 'paid', 'sibling']).exactOptional(),
  careSince: int.exactOptional(),
  gossip: score,
  requestYear: int.exactOptional(),
  emigrated: z.strictObject({ year: int, countryId: z.enum(COUNTRY_IDS), from: id, papers: z.boolean() }).exactOptional(),
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
  look: lookSchema.exactOptional(),
  languages,
  citizenships,
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
  heritage: z.string().min(1).max(40).exactOptional(),
  priorChildren: z.array(int).min(1).exactOptional(),
  child: childData.exactOptional(),
  life: personLife.exactOptional(),
  neuro: z.array(id).min(1).exactOptional(),
  grandchild: z.strictObject({ parentId: id }).exactOptional(),
  faith: z.strictObject({ id: id.nullable(), strength: score }).exactOptional(),
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

const examId = z.enum(['gcse', 'alevels', 'sat', 'provincial', 'mx_placement', 'mx_entrance']);
const schoolLife = z.strictObject({
  key: z.string().nullable(),
  classmates: z.array(id),
  staff: z.strictObject({ homeroom: id.exactOptional(), head: id.exactOptional(), support: id.exactOptional() }),
  spread: z.record(id, z.number().min(-2).max(2)),
  year: z.strictObject({
    year: int,
    effort: z.enum(['study', 'slack']).nullable(),
    subject: id.exactOptional(),
    tutor: dollars.min(0),
    cheated: int.min(0),
    skipped: int.min(0),
    caught: z.boolean(),
  }),
  exams: z.array(z.strictObject({ id: examId, year: int, score: z.number().min(0).max(100), band: z.enum(['top', 'pass', 'fail']) })),
  choice: z.strictObject({ path: z.enum(['stay', 'college', 'apprenticeship', 'work']), tradeId: id.exactOptional(), year: int }).nullable(),
  shift: z.number().min(-1).max(1),
  chosen: z.boolean(),
});

const education = z.strictObject({
  current: z.strictObject({ ...enrollmentFields, venue: z.literal('college').exactOptional(), apprentice: z.literal(true).exactOptional() }).nullable(),
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
      conditional: z.strictObject({ exam: examId, min: z.number().min(0).max(100) }).exactOptional(),
    })
    .nullable(),
  left: z.strictObject({ ...enrollmentFields, venue: z.literal('college').exactOptional(), apprentice: z.literal(true).exactOptional(), leftYear: int }).nullable(),
  applied: z.array(z.strictObject({ option: z.string().min(1), accepted: z.boolean() })),
  fund: dollars.min(0),
  lastBill: z
    .strictObject({ year: int, tuition: dollars, scholarship: dollars, family: dollars, fund: dollars, loan: dollars })
    .exactOptional(),
  school: schoolLife,
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
  work: z.strictObject({ year: int, effort: z.enum(['hard', 'slack']).nullable(), socialized: int.min(0), party: z.boolean(), reported: int.min(0) }),
});

const finances = z.strictObject({
  savings: dollars,
  debts: z.array(
    z.strictObject({
      id,
      kind: z.enum(['student', 'personal', 'mortgage', 'medical', 'collections', 'auto', 'business', 'bank', 'payday', 'shark']),
      balance: dollars,
      annualRate: z.number().min(0).max(3),
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
      giving: dollars,
      remittances: dollars.exactOptional(),
      business: dollars,
      net: dollars,
    })
    .exactOptional(),
  earnings: z.strictObject({ years: int.min(0), total: dollars, byCountry: z.record(id, z.strictObject({ years: int.min(0), total: dollars })) }),
  hardshipYears: int.min(0),
  trust: z.strictObject({ balance: dollars.min(1), releaseAge: int.min(1) }).exactOptional(),
  bankruptcyYear: int.exactOptional(),
  debtPlanYear: int.exactOptional(),
  dirty: dollars.min(0),
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
  assisted: z.strictObject({ since: int }).exactOptional(),
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
    faith: surfacedEntry.exactOptional(),
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
  'parent', 'stepparent', 'sibling', 'grandparent', 'relative', 'child', 'stepchild', 'grandchild', 'friend', 'partner', 'fiance', 'spouse', 'ex', 'coworker', 'boss', 'classmate', 'teacher', 'acquaintance',
]);

// E5: what you own.
const renovation = z.strictObject({ id, year: int });
const possession = z.strictObject({
  id,
  kind: z.enum(['pet', 'vehicle', 'home', 'valuable']),
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
  valuable: z.strictObject({ insured: z.boolean() }).exactOptional(),
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
  activities: z.array(z.strictObject({ id, since: int, tier: z.enum(['jv', 'varsity']).exactOptional() })),
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

// E6a: a crime career.
const crimeCrew = z.strictObject({
  defId: id,
  cityId: id,
  since: int,
  members: z.array(id),
  leader: id.exactOptional(),
  rival: id.exactOptional(),
  rivalMembers: z.array(id),
  informant: id.exactOptional(),
  away: z.strictObject({ since: int, standing: score, suspicion: score }).exactOptional(),
  returned: int.exactOptional(),
});
const crime = z.strictObject({
  crew: crimeCrew.nullable(),
  rank: int.min(0),
  peak: int.min(0),
  rankSince: int,
  standing: score,
  lowYears: int.min(0),
  awayYears: int.min(0),
  heat: score,
  rivalry: score,
  investigation: z.strictObject({ since: int, until: int }).exactOptional(),
  jobs: z.strictObject({ year: int, count: int.min(0), last: int.min(0) }),
  past: z.array(z.strictObject({ crewId: id, fromYear: int, toYear: int, topRank: int.min(1), how: z.enum(['left', 'pushed', 'drifted', 'deal', 'moved']) })),
  laundered: z.strictObject({ year: int, byFront: z.record(z.string(), dollars.min(0)) }),
  totals: z.strictObject({ jobs: int.min(0), earned: dollars.min(0), cleaned: dollars.min(0), fees: dollars.min(0), lost: dollars.min(0), spent: dollars.min(0), arrests: int.min(0), years: int.min(0) }),
});

// E6b: fame in arts and media. Batch 4: a title or a band name the player typed (checked again by the action that takes it).
const fameTitle = z.string().min(1).max(60);
const fameProjectSchema = z.strictObject({
  year: int,
  path: id,
  kind: id,
  title: z.string(),
  style: z.enum(['commercial', 'artistic']),
  risk: z.enum(['safe', 'bold']),
  tour: z.boolean(),
  press: z.boolean(),
  quality: score,
  critics: score,
  fans: score,
  band: z.enum(['flop', 'solid', 'hit', 'acclaimed', 'cult', 'crowd']),
  gain: z.number(),
  earned: dollars.min(0),
  assigned: z.literal(true).exactOptional(),
  genre: id.exactOptional(),
  offGenre: z.number().min(0).max(1).exactOptional(),
  tracks: z.array(fameTitle).max(20).exactOptional(),
  bandName: fameTitle.exactOptional(),
});
const showResult = z.strictObject({
  venue: id,
  outcome: z.enum(['great', 'good', 'rough']),
  pay: dollars.min(0),
  fans: int.min(0),
  fame: z.number(),
});
const tourSize = z.enum(['local', 'regional', 'national', 'world']);
const fame = z.strictObject({
  active: z.boolean(),
  retired: int.exactOptional(),
  main: id.nullable(),
  second: id.nullable(),
  paths: z.record(
    z.string(),
    z.strictObject({
      rung: int.min(1),
      peak: int.min(1),
      fame: z.number().min(0).max(100),
      craft: z.number().min(0).max(100),
      since: int,
      last: int,
      recent: z.array(score).max(3),
      breakYear: int.min(0),
      route: id.exactOptional(),
      genre: id.exactOptional(),
      skills: z.record(z.string(), z.number().min(0).max(100)).exactOptional(),
    }),
  ),
  image: score,
  fans: int.min(0),
  mood: score,
  burnout: score,
  commitment: z.enum(['back', 'steady', 'all']),
  scene: z.enum(['low', 'social', 'entourage', 'lavish']),
  agent: z.strictObject({ agentId: id, since: int }).nullable(),
  contract: z
    .strictObject({
      company: id,
      path: id,
      since: int,
      until: int,
      advance: dollars.min(0),
      share: z.number().min(0).max(1),
      terms: z.enum(['standard', 'tough', 'generous']),
      exclusive: z.boolean(),
      byParent: z.boolean(),
    })
    .nullable(),
  plan: z
    .strictObject({
      path: id,
      kind: id,
      style: z.enum(['commercial', 'artistic']),
      risk: z.enum(['safe', 'bold']),
      press: z.boolean(),
      genre: id.exactOptional(),
      title: fameTitle.exactOptional(),
      tracks: z.array(fameTitle).max(20).exactOptional(),
    })
    .nullable(),
  projects: z.array(fameProjectSchema).max(12),
  awards: z.array(z.strictObject({ awardId: id, year: int, path: id, project: z.string(), won: z.boolean() })).max(30),
  nominated: z.strictObject({ awardId: id, project: z.string(), due: int, score: z.number() }).exactOptional(),
  ceremony: z.strictObject({ year: int, awardId: id, project: z.string(), result: z.enum(['won', 'lost']) }).exactOptional(),
  people: z.strictObject({ super: z.array(id), hater: z.array(id), critic: z.array(id) }),
  stalker: z.strictObject({ id, since: int, stage: z.enum(['watching', 'reported', 'ordered', 'charged']) }).nullable(),
  headlines: z.array(z.strictObject({ year: int, text: z.string(), kind: z.string() })).max(20),
  income: z.strictObject({ year: int, gross: dollars.min(0), agent: dollars.min(0), company: dollars.min(0), trust: dollars.min(0), scene: dollars.min(0), tour: dollars.min(0) }),
  fadedFrom: int.exactOptional(),
  band: z
    .strictObject({
      name: fameTitle,
      path: id,
      leader: z.union([z.literal('you'), id]),
      members: z.array(z.strictObject({ id, part: id, skill: score, since: int })).max(8),
      part: id,
      chemistry: score,
      since: int,
      how: z.enum(['formed', 'route', 'joined']),
    })
    .nullable(),
  pastBands: z.array(z.strictObject({ name: fameTitle, from: int, to: int, how: z.enum(['left', 'solo', 'split']) })).max(12),
  offers: z.array(z.strictObject({ name: fameTitle, genre: id, size: int.min(1).max(8), skill: score, part: id, year: int })).max(3),
  instrument: id.nullable(),
  grind: z.strictObject({
    year: int,
    shows: int.min(0),
    showPay: dollars.min(0),
    tour: z.strictObject({ path: id, size: tourSize, cost: dollars.min(0) }).nullable(),
    practice: int.min(0),
    bySkill: z.record(z.string(), int.min(0)),
    lastShow: showResult.exactOptional(),
  }),
  played: z.strictObject({ year: int, shows: int.min(0), tour: tourSize.nullable(), lastShow: showResult.exactOptional() }),
  best: z.strictObject({ title: fameTitle, path: id, kind: id, year: int, score: z.number(), bandName: fameTitle.exactOptional() }).exactOptional(),
  totals: z.strictObject({
    projects: int.min(0),
    hits: int.min(0),
    flops: int.min(0),
    breaks: int.min(0),
    fades: int.min(0),
    comebacks: int.min(0),
    nominations: int.min(0),
    wins: int.min(0),
    scandals: int.min(0),
    tours: int.min(0),
    burnouts: int.min(0),
    crossovers: int.min(0),
    stalkers: int.min(0),
    earned: dollars.min(0),
    shows: int.min(0),
    practice: int.min(0),
    bandsFormed: int.min(0),
    bandsJoined: int.min(0),
    bandSplits: int.min(0),
    memberChanges: int.min(0),
    genreSwitches: int.min(0),
    offGenre: int.min(0),
  }),
});

// E6c: sports.
const sportsLevel = z.enum(['youth', 'school', 'college', 'pro']);
const division = z.union([z.literal(1), z.literal(2)]);
const sportsTeam = z.strictObject({
  id: id.nullable(),
  name: z.string(),
  city: id,
  level: sportsLevel,
  quality: score,
  tier: z.enum(['rec', 'club', 'travel', 'academy', 'jv', 'varsity', 'community', 'state', 'elite']).exactOptional(),
  // Batch 6: where the team plays when it is away from the city you live in, how far, the league and the country of a club the game does not model.
  place: z.string().max(60).exactOptional(),
  away: z.enum(['city', 'country']).exactOptional(),
  division: division.exactOptional(),
  country: z.enum(['es', 'it', 'de', 'fr']).exactOptional(),
});
const teamSetupShape = z.strictObject({
  renamed: z.record(id, z.strictObject({ name: z.string().min(2).max(40).exactOptional(), nickname: z.string().min(2).max(30).exactOptional() })),
  moved: z.record(id, id),
  added: z
    .array(z.strictObject({ id: z.string().min(1).max(40), sport: id, name: z.string().min(2).max(40), nickname: z.string().min(2).max(30).exactOptional(), city: id, strength: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]), tier: division.exactOptional() }))
    .max(40),
});
// Batch 6: the teams this life plays with.
const league = z.strictObject({
  setup: teamSetupShape,
  pending: z.strictObject({ applyYear: int, moved: z.record(id, id), added: teamSetupShape.shape.added }).nullable(),
  tiers: z.record(id, division),
  tierYear: int.min(0),
});
const sports = z.strictObject({
  sport: id.nullable(),
  position: id.nullable(),
  pro: z.boolean(),
  team: sportsTeam.nullable(),
  contract: z
    .strictObject({
      teamId: id,
      since: int,
      until: int,
      salary: dollars.min(0),
      kind: z.enum(['minimum', 'rookie', 'standard', 'star']),
      option: z.enum(['none', 'team', 'player']),
      incentive: dollars.min(0).exactOptional(),
      release: dollars.min(0).exactOptional(),
    })
    .nullable(),
  unsigned: int.min(0),
  focus: z.enum(['skills', 'conditioning', 'film']),
  form: z.number().min(-10).max(10),
  pain: z.boolean(),
  rest: z.boolean(),
  ask: z.enum(['trade', 'contract', 'loan']).nullable(),
  playOut: z.boolean(),
  seasons: z
    .array(
      z.strictObject({
        year: int,
        sport: id,
        level: sportsLevel,
        team: z.string(),
        position: id,
        rating: score,
        played: score,
        wins: int.min(0),
        draws: int.min(0),
        losses: int.min(0),
        rank: int.min(1),
        of: int.min(1),
        result: z.enum(['missed', 'out', 'final', 'champion']),
        stats: z.record(z.string(), z.number()),
        salary: dollars.min(0),
        allStar: z.boolean(),
        injury: id.exactOptional(),
        division: division.exactOptional(),
        loan: z.boolean().exactOptional(),
      }),
    )
    .max(12),
  run: z.strictObject({ year: int, won: int.min(0).max(3), alive: z.boolean(), strength: z.number(), rival: z.number() }).nullable(),
  draft: z.strictObject({ year: int, pick: int.min(0), round: int.min(0), teamId: id.nullable(), academy: z.literal(true).exactOptional() }).nullable(),
  suspended: int.min(0),
  traded: int.min(0),
  released: int.min(0),
  agedOut: int.min(0),
  retired: z.strictObject({ year: int, route: z.enum(['coaching', 'broadcast', 'normal']).nullable() }).exactOptional(),
  totals: z.strictObject({
    seasons: int.min(0),
    proSeasons: int.min(0),
    playoffs: int.min(0),
    finals: int.min(0),
    titles: int.min(0),
    allStars: int.min(0),
    injuries: int.min(0),
    serious: int.min(0),
    playedThrough: int.min(0),
    trades: int.min(0),
    releases: int.min(0),
    suspensions: int.min(0),
    earned: dollars.min(0),
    bestRating: score,
    tryouts: int.min(0),
    tryoutsMade: int.min(0),
    scholarships: int.min(0),
    scholarshipsLost: int.min(0),
    trainedTeam: int.min(0),
    trainedGym: int.min(0),
    trainedCoach: int.min(0),
    signedAfterUndrafted: int.min(0),
    loans: int.min(0),
    transfers: int.min(0),
    fees: int.min(0),
    graduates: int.min(0),
    abroad: int.min(0),
    caps: int.min(0),
    tournaments: int.min(0),
    tournamentTitles: int.min(0),
    goneUp: int.min(0),
    goneDown: int.min(0),
  }),
  // Batch 5: tryouts, training, scholarships, the draft's combine, and your place on a team.
  tryout: z.strictObject({ sport: id, key: z.string().min(1).max(60), year: int }).nullable(),
  tried: z
    .array(z.strictObject({ year: int, key: z.string().min(1).max(60), name: z.string().max(120), landedName: z.string().max(120).nullable(), level: sportsLevel, made: z.boolean(), landed: z.string().min(1).max(60).nullable(), rating: z.number(), bar: z.number() }))
    .max(10),
  cut: z.record(z.string(), int),
  teamless: z.boolean(),
  club: sportsTeam.nullable(),
  training: z.strictObject({ year: int, team: int.min(0), gym: int.min(0), coach: int.min(0), member: z.boolean(), spent: dollars.min(0) }),
  offers: z.array(z.strictObject({ year: int, tier: z.enum(['community', 'state', 'elite']), share: z.number().min(0).max(1) })).max(3),
  scholarship: z.strictObject({ tier: z.enum(['community', 'state', 'elite']), share: z.number().min(0).max(1), since: int, warned: int.min(0) }).nullable(),
  combine: z.number().min(-30).max(30),
  passed: int.min(0),
  role: z.enum(['starter', 'rotation', 'reserve']),
  number: int.min(0).max(99).nullable(),
  captain: z.boolean(),
  // Batch 6 (soccer): the academy you belong to, a loan or an offer of one, the window's offers, the national side, the year an academy let you go, a move abroad and your club's last move between leagues.
  academy: z.strictObject({ clubId: id, since: int, abroad: z.boolean() }).nullable(),
  loan: z.strictObject({ parentId: id, hostId: id, since: int, until: int }).nullable(),
  loanOffer: z.strictObject({ hostId: id, year: int }).nullable(),
  transfer: z
    .strictObject({
      year: int,
      offers: z.array(z.strictObject({ id: z.string().min(1).max(20), clubId: id, fee: dollars.min(0), wage: dollars.min(0), years: int.min(1).max(10), clause: dollars.min(0) })).max(6),
    })
    .nullable(),
  calledUp: int.min(0),
  academyOut: int.min(0),
  abroadYear: int.min(0),
  moved: z.strictObject({ year: int, dir: z.enum(['up', 'down']) }).nullable(),
});

// W3: businesses.
const levelOf = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values);
const lineResult = z.strictObject({ productId: id, demand: int.min(0), sold: int.min(0), lost: int.min(0), spoiled: int.min(0), revenue: dollars, cost: dollars });
const locationResult = z.strictObject({
  year: int,
  demand: int.min(0),
  customers: int.min(0),
  revenue: dollars,
  rent: dollars,
  wages: dollars,
  supplies: dollars,
  other: dollars,
  profit: int,
  goodsCost: dollars.exactOptional(),
  waste: dollars.exactOptional(),
  lostSales: dollars.exactOptional(),
  hiring: dollars.exactOptional(),
  training: dollars.exactOptional(),
  lines: z.array(lineResult).exactOptional(),
});
const units = z.number().min(0).max(1e9);
const business = z.strictObject({
  id: filled,
  defId: id,
  name: filled,
  cityId: id,
  style: levelOf(BUSINESS_STYLES),
  founded: int,
  how: z.enum(['started', 'bought', 'inherited']),
  chainId: id.exactOptional(),
  locations: z
    .array(z.strictObject({ id: filled, cityId: id, style: levelOf(BUSINESS_STYLES), opened: int, result: locationResult.exactOptional(), stock: z.record(z.string(), units), forecast: z.record(z.string(), units), manager: id.exactOptional() }))
    .min(1),
  staff: z.array(
    z.strictObject({
      personId: id,
      locationId: filled.nullable(),
      roleId: filled,
      title: filled,
      skill: score,
      morale: score,
      since: int,
      licensed: z.boolean(),
      raise: z.number().min(1).max(10),
      manager: z.literal(true).exactOptional(),
      honesty: score.exactOptional(),
      wage: dollars,
    }),
  ),
  owners: z
    .array(z.strictObject({ id: filled, name: filled, share: int.min(1).max(100), put: dollars, year: int, paid: dollars, role: z.enum(['you', 'investor', 'cofounder']) }))
    .min(1),
  prices: levelOf(PRICE_LEVELS),
  marketing: levelOf(MARKETING_LEVELS),
  qualityInvest: levelOf(QUALITY_LEVELS),
  pay: levelOf(PAY_LEVELS),
  staffing: levelOf(STAFFING_LEVELS),
  role: levelOf(OWNER_ROLES),
  quality: score,
  reputation: score,
  morale: score,
  cash: dollars,
  assets: dollars,
  loanIds: z.array(filled),
  profits: z.array(int),
  lossYears: int.min(0),
  skimmed: dollars,
  auditedYear: int.exactOptional(),
  shocks: z.array(z.strictObject({ kind: z.enum(['buzz', 'rival', 'shortage', 'deal']), mult: z.number().min(0.1).max(5), until: int, category: id.exactOptional() })),
  report: z
    .strictObject({
      year: int,
      customers: int.min(0),
      customersBefore: int.min(0),
      demand: int.min(0),
      revenue: dollars,
      rent: dollars,
      wages: dollars,
      supplies: dollars,
      marketing: dollars,
      quality: dollars,
      other: dollars,
      profit: int,
      loanPayments: dollars,
      paidOut: dollars,
      draw: dollars,
      injected: dollars,
      cash: dollars,
      morale: score,
      reputation: score,
      qualityScore: score,
      quit: int.min(0),
      notes: z.array(filled),
      locations: z.array(locationResult),
      goodsCost: dollars.exactOptional(),
      waste: dollars.exactOptional(),
      lostSales: dollars.exactOptional(),
      hiring: dollars.exactOptional(),
      training: dollars.exactOptional(),
      royalties: int.exactOptional(),
      support: dollars.exactOptional(),
      turnover: int.min(0).exactOptional(),
      heads: int.min(0).exactOptional(),
      economy: filled.exactOptional(),
      lines: z.array(lineResult).exactOptional(),
      supplierMoves: z.array(z.tuple([id, z.number()])).exactOptional(),
    })
    .nullable(),
  lines: z.array(z.strictObject({ productId: id, on: z.boolean(), price: levelOf(PRICE_LEVELS) })),
  orders: z.record(z.string(), levelOf(ORDER_LEVELS)),
  headcount: z.record(z.string(), z.record(z.string(), int.min(0))),
  crew: z.array(z.strictObject({ locationId: filled, roleId: filled, count: int.min(0), skill: z.number().min(0).max(100), morale: z.number().min(0).max(100) })),
  training: levelOf(TRAINING_LEVELS),
  stockValue: dollars,
  franchises: z.array(
    z.strictObject({
      id: filled,
      cityId: id,
      style: levelOf(BUSINESS_STYLES),
      personId: id.nullable(),
      skill: score,
      since: int,
      fee: dollars,
      royalty: z.number().min(0.001).max(0.5),
      revenue: dollars,
      royaltyPaid: dollars,
      support: dollars,
      profit: int,
      lossYears: int.min(0),
      risk: score,
    }),
  ),
  focus: z.strictObject({ productId: id.optional(), category: id.optional(), locationId: id.optional() }).optional(),
});
const businessState = z.strictObject({
  items: z.array(business),
  nextBusiness: int.min(1),
  nextLocation: int.min(1),
  taken: z.array(filled),
  past: z.array(
    z.strictObject({
      name: filled,
      defId: id,
      style: levelOf(BUSINESS_STYLES),
      cityId: id,
      fromYear: int,
      toYear: int,
      end: z.enum(['sold', 'closed', 'failed', 'passed']),
      totalProfit: int,
      net: int,
    }),
  ),
  offered: z.record(z.string(), int),
  year: z.strictObject({ year: int, draw: dollars, inject: dollars }),
  experience: z.record(z.string(), int.min(0)),
  worth: dollars,
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
  businesses: z.array(z.strictObject({ businessId: id, toPersonId: id, item: business, loan: dollars.min(0) })),
  businessSales: dollars.min(0),
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
  dirty: z.strictObject({ change: int, balance: int.min(0) }).exactOptional(),
});

const pendingInteraction = z.strictObject({
  interactionId: id,
  personId: id,
  pet: z.literal(true).exactOptional(),
  otherId: id.exactOptional(),
  itemId: z.string().min(1).exactOptional(),
  tier: z.enum(['great', 'good', 'neutral', 'bad', 'backfire']),
  declined: z.literal(true).exactOptional(),
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

// Batch 2a: activities this year.
const pastimeReceipt = z.strictObject({
  year: int,
  pastimeId: id,
  tier: z.enum(['great', 'good', 'neutral', 'bad', 'backfire']),
  text: filled,
  notes: z.array(filled),
  money: moneyChange.exactOptional(),
  companion: z.strictObject({ id, name: filled, affection: int }).exactOptional(),
  changes: z.strictObject({
    health: int.exactOptional(),
    happiness: int.exactOptional(),
    smarts: int.exactOptional(),
    looks: int.exactOptional(),
    fitness: int.exactOptional(),
    stress: int.exactOptional(),
  }),
});
const pastimes = z.strictObject({ year: int, counts: z.record(z.string(), int.min(1)), receipts: z.array(pastimeReceipt) });

// Batch 8: social media. A handle is what the player typed, kept in its tidy form (checked again by the action that takes it and by the invariants).
const socialAccount = z.strictObject({
  platform: id,
  handle: z.string().min(2).max(60),
  niche: id,
  followers: int.min(0),
  engagement: score,
  since: int,
  private: z.boolean(),
  byParent: z.boolean(),
  posts: int.min(0),
  quality: score,
  monetized: int.min(0),
  demonetized: int.min(0),
  earned: int.min(0),
  peak: int.min(0),
});
const counts = z.record(z.string(), int.min(0));
const social = z.strictObject({
  accounts: z.record(z.string(), socialAccount),
  year: z.strictObject({ year: int, posts: counts, quality: z.record(z.string(), z.number().min(0)), bold: int.min(0), risky: counts, viral: z.array(id), crossed: z.array(z.string().max(130)), collabs: z.array(id), promoted: z.array(id) }),
  income: z.strictObject({ year: int, gross: int.min(0), agent: int.min(0), trust: int.min(0), byPlatform: counts, byModel: counts }),
  last: z.strictObject({ year: int, platform: id, outcome: z.enum(['flat', 'steady', 'strong', 'viral']), gained: int.min(0), bold: z.boolean() }).exactOptional(),
  algorithm: z.strictObject({ year: int, shifts: z.record(z.string(), z.enum(['up', 'down'])) }),
  controversy: z.strictObject({ year: int, platform: id, stage: z.enum(['brewing', 'cancelled']), lost: counts }).nullable(),
  happened: z.strictObject({ year: int, triggers: z.array(z.string().max(40)) }),
  focus: z.strictObject({ year: int, platform: id }).nullable(),
  streak: int.min(0),
  workedYear: int.min(0),
  totals: z.strictObject({
    opened: int.min(0),
    posts: int.min(0),
    viral: int.min(0),
    algorithmUp: int.min(0),
    algorithmDown: int.min(0),
    demonetized: int.min(0),
    monetized: int.min(0),
    burnouts: int.min(0),
    controversies: int.min(0),
    cancellations: int.min(0),
    collabs: int.min(0),
    crossPromos: int.min(0),
    promos: int.min(0),
    sponsorships: int.min(0),
    foundEmployer: int.min(0),
    foundPartner: int.min(0),
    foundEx: int.min(0),
    foundFamily: int.min(0),
    earned: int.min(0),
  }),
});

// L1: later life.
const careOption = z.enum(['family', 'paid', 'assisted']);
const later = z.strictObject({
  care: z
    .strictObject({
      since: int,
      option: careOption.nullable(),
      optionSince: int.exactOptional(),
      providerId: id.exactOptional(),
      declined: z.array(id),
    })
    .nullable(),
  terminal: z
    .strictObject({
      since: int,
      causeId: id,
      conditionId: id.exactOptional(),
      hospice: z.enum(['hospice', 'home', 'hospital']).nullable(),
      service: z.enum(['traditional', 'simple', 'celebration', 'private']).nullable(),
      speakerId: id.exactOptional(),
      letters: z.array(id),
      visitors: z.array(id),
      visits: z.array(z.strictObject({ id, came: z.boolean() })),
      wishesYear: int.exactOptional(),
      willPrompted: z.literal(true).exactOptional(),
    })
    .nullable(),
  amends: z.array(z.strictObject({ year: int, source: id, personId: id.exactOptional(), result: z.enum(['made', 'declined', 'refused']) })),
  offered: z.record(z.string(), int),
});

// W2: belonging.
const valueSet = z.strictObject({ community: score, compassion: score, tradition: score, independence: score, civic: score });
const belonging = z.strictObject({
  household: z.strictObject({ faith: id.nullable(), devotion: score }),
  faith: z.strictObject({ id: id.nullable(), strength: score, raised: id.nullable(), since: int.nullable(), changes: int.min(0) }),
  values: valueSet,
  temperament: valueSet,
  groups: z.record(
    z.string(),
    z.strictObject({ id: filled, defId: id, cityId: id, name: filled, welcome: score, strict: score, intense: score, people: z.array(id) }),
  ),
  cities: z.record(z.string(), z.array(filled)),
  memberships: z.array(
    z.strictObject({
      groupId: filled,
      since: int,
      commitment: z.enum(['casual', 'committed']),
      rung: int.min(0),
      rungSince: int,
      standing: score,
      family: z.literal(true).exactOptional(),
    }),
  ),
  past: z.array(
    z.strictObject({
      groupId: filled,
      defId: id,
      name: filled,
      cityId: id,
      fromYear: int,
      toYear: int,
      topRung: int.min(0),
      how: z.enum(['left', 'moved', 'drifted']),
    }),
  ),
  nextGroup: int.min(1),
  community: score,
  repCarry: z.number(),
  offered: z.record(z.string(), int),
  upgrade: z.literal(true).exactOptional(),
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


const travelState = z.strictObject({
  residence: z.strictObject({ country: filled, destinationId: id, type: z.enum(STAY_TYPES), startYear: int, endYear: int, homeCityId: id, homeHousing: housing.exactOptional(), route: z.enum(STAY_ROUTES), settled: z.literal(true).exactOptional(), family: z.strictObject({ partnerId: id.nullable(), childIds: z.array(id) }).exactOptional() }).nullable(),
  active: z.strictObject({ kind: z.enum(['trip', 'study', 'work']), style: z.enum(TRIP_STYLES).exactOptional(), activity: z.enum(TRIP_ACTIVITIES).exactOptional(), souvenir: z.enum(SOUVENIRS).exactOptional(), destinationId: id, companions: z.array(id), encounterId: id.nullable(), romanceId: id.nullable() }).nullable(),
  tripYear: int.nullable(),
  businessYear: int.nullable(),
  totals: z.strictObject({ trips: int.nonnegative(), spent: dollars, encounters: int.nonnegative(), romances: int.nonnegative(), study: int.nonnegative(), work: int.nonnegative(), returns: int.nonnegative(), immersion: int.nonnegative(), distanceLost: int.nonnegative(), happiness: int, stress: int, destinations: z.record(id, int.nonnegative()), styles: z.record(id, int.nonnegative()), activities: z.record(id, int.nonnegative()), souvenirs: z.record(id, int.nonnegative()), perDiem: dollars, familyStays: int.nonnegative(), familyMembers: int.nonnegative() }),
});

const application = z.strictObject({
  kind: z.enum(APPLICATION_KINDS),
  route: z.enum(ROUTES).exactOptional(),
  basis: z.enum(REGULARIZATION_BASES).exactOptional(),
  countryId: z.enum(COUNTRY_IDS),
  cityId: id.exactOptional(),
  sinceYear: int,
  decisionYear: int,
  status: z.enum(APPLICATION_STATUSES),
  decidedYear: int.exactOptional(),
  expiresYear: int.exactOptional(),
  fee: dollars,
  odds: z.number().min(0).max(1),
  jobId: id.exactOptional(),
  majorId: id.exactOptional(),
  tier: z.enum(['community', 'state', 'elite']).exactOptional(),
  sponsorId: id.exactOptional(),
  invested: dollars.exactOptional(),
  prepared: z.boolean().exactOptional(),
});
const migrationState = z.strictObject({
  application: application.nullable(),
  denied: z.record(z.string(), int),
  arrivedYear: int.nullable(),
  undocumented: z.strictObject({ sinceYear: int, origin: z.enum(['overstay', 'irregular']), closeCalls: int.nonnegative() }).nullable(),
  removed: z.record(z.string(), int),
  ruleChangeUntil: int.nullable(),
  remit: z.strictObject({ level: z.enum(REMIT_LEVELS), sent: dollars }),
  testFails: int.nonnegative(),
  exposure: z.number().min(0).max(1),
  year: z.strictObject({ year: int, risk: z.number().min(0).max(1), closeCall: z.boolean(), policeContact: z.boolean(), stolen: dollars }),
  counts: z.record(z.string(), int.nonnegative()),
});

export const lifeStateSchema: z.ZodType<LifeState> = z.strictObject({
  id,
  seed: z.string().min(1),
  rng: z.custom<RngState>(isRngState, 'invalid generator state'),
  birthYear: int,
  currentYear: int,
  phase: z.enum(['yearStart', 'events', 'yearEnd', 'dead', 'action']),
  character,
  travel: travelState,
  migration: migrationState,
  languages: z.strictObject({
    schoolId: id.nullable(), classId: id.nullable(), classYear: int.nullable(),
    totals: z.strictObject({ school: int.nonnegative(), classes: int.nonnegative(), immersion: int.nonnegative(), faded: int.nonnegative(), app: int.nonnegative(), tutor: int.nonnegative(), practice: int.nonnegative(), home: int.nonnegative(), trip: int.nonnegative() }),
    // Batch 10: the other ways of studying, practice, certificates, exams and languages spoken with children at home.
    methodYear: z.strictObject({ app: int.nullable(), tutor: int.nullable() }),
    practice: z.strictObject({ year: int, points: int.nonnegative() }),
    certificates: z.record(id, z.enum(['basic', 'conversational', 'fluent'])),
    examYear: z.record(id, int),
    recentExam: z.strictObject({ id, level: z.enum(['basic', 'conversational', 'fluent']), passed: z.boolean() }).nullable(),
    exams: z.strictObject({ sat: int.nonnegative(), passed: int.nonnegative() }),
    home: z.record(id, id),
  }),
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
      kind: z.enum(['create', 'ageUp', 'choice', 'action', 'interact', 'interactChoice', 'interactClose', 'edit']),
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
  crime,
  fame,
  sports,
  league,
  later,
  belonging,
  business: businessState,
  pastimes,
  social,
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
