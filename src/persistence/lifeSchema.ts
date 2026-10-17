import { languageSkillSchema } from '../content/schemas/languages';
import { APPLICATION_KINDS, APPLICATION_STATUSES, COUNTRY_IDS, REGULARIZATION_BASES, REMIT_LEVELS, ROUTES, STAY_ROUTES, STAY_TYPES } from '../content/schemas';
/**
 * Validates a saved LifeState when it is loaded. Typed against the engine's
 * LifeState, so TypeScript reports any drift between the two. Strict objects:
 * an unexpected field means the save needs a migration, not silent dropping.
 */
import { z } from 'zod';
import { BUSINESS_STYLES, MARKETING_LEVELS, OWNER_ROLES, PAY_LEVELS, PRICE_LEVELS, QUALITY_LEVELS, STAFFING_LEVELS, type ContentBundle } from '../content/schemas';
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
      kind: z.enum(['student', 'personal', 'mortgage', 'medical', 'collections', 'auto', 'business']),
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
      giving: dollars,
      remittances: dollars.exactOptional(),
      business: dollars,
      net: dollars,
    })
    .exactOptional(),
  earnings: z.strictObject({ years: int.min(0), total: dollars }),
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
  'parent', 'stepparent', 'sibling', 'grandparent', 'relative', 'child', 'stepchild', 'grandchild', 'friend', 'partner', 'fiance', 'spouse', 'ex', 'coworker', 'boss', 'classmate', 'acquaintance',
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

// E6b: fame in arts and media.
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
});
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
    .strictObject({ path: id, kind: id, style: z.enum(['commercial', 'artistic']), risk: z.enum(['safe', 'bold']), tour: z.boolean(), press: z.boolean() })
    .nullable(),
  projects: z.array(fameProjectSchema).max(12),
  awards: z.array(z.strictObject({ awardId: id, year: int, path: id, project: z.string(), won: z.boolean() })).max(30),
  nominated: z.strictObject({ awardId: id, project: z.string(), due: int, score: z.number() }).exactOptional(),
  ceremony: z.strictObject({ year: int, awardId: id, project: z.string(), result: z.enum(['won', 'lost']) }).exactOptional(),
  people: z.strictObject({ super: z.array(id), hater: z.array(id), critic: z.array(id) }),
  stalker: z.strictObject({ id, since: int, stage: z.enum(['watching', 'reported', 'ordered', 'charged']) }).nullable(),
  headlines: z.array(z.strictObject({ year: int, text: z.string(), kind: z.string() })).max(20),
  income: z.strictObject({ year: int, gross: dollars.min(0), agent: dollars.min(0), company: dollars.min(0), trust: dollars.min(0), scene: dollars.min(0) }),
  fadedFrom: int.exactOptional(),
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
  }),
});

// E6c: sports.
const sportsLevel = z.enum(['youth', 'school', 'college', 'pro']);
const sports = z.strictObject({
  sport: id.nullable(),
  position: id.nullable(),
  pro: z.boolean(),
  team: z.strictObject({ id: id.nullable(), name: z.string(), city: id, level: sportsLevel, quality: score }).nullable(),
  contract: z
    .strictObject({
      teamId: id,
      since: int,
      until: int,
      salary: dollars.min(0),
      kind: z.enum(['minimum', 'rookie', 'standard', 'star']),
      option: z.enum(['none', 'team', 'player']),
    })
    .nullable(),
  unsigned: int.min(0),
  focus: z.enum(['skills', 'conditioning', 'film']),
  form: z.number().min(-10).max(10),
  pain: z.boolean(),
  rest: z.boolean(),
  ask: z.enum(['trade', 'contract']).nullable(),
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
      }),
    )
    .max(12),
  run: z.strictObject({ year: int, won: int.min(0).max(3), alive: z.boolean(), strength: z.number(), rival: z.number() }).nullable(),
  draft: z.strictObject({ year: int, pick: int.min(0), round: int.min(0), teamId: id.nullable() }).nullable(),
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
  }),
});

// W3: businesses.
const levelOf = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values);
const locationResult = z.strictObject({ year: int, demand: int.min(0), customers: int.min(0), revenue: dollars, rent: dollars, wages: dollars, supplies: dollars, other: dollars, profit: int });
const business = z.strictObject({
  id: filled,
  defId: id,
  name: filled,
  cityId: id,
  style: levelOf(BUSINESS_STYLES),
  founded: int,
  how: z.enum(['started', 'bought', 'inherited']),
  chainId: id.exactOptional(),
  locations: z.array(z.strictObject({ id: filled, cityId: id, style: levelOf(BUSINESS_STYLES), opened: int, result: locationResult.exactOptional() })).min(1),
  staff: z.array(
    z.strictObject({
      personId: id,
      locationId: filled.nullable(),
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
  shocks: z.array(z.strictObject({ kind: z.enum(['buzz', 'rival']), mult: z.number().min(0.1).max(5), until: int })),
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
    })
    .nullable(),
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
  residence: z.strictObject({ country: filled, destinationId: id, type: z.enum(STAY_TYPES), startYear: int, endYear: int, homeCityId: id, homeHousing: housing.exactOptional(), route: z.enum(STAY_ROUTES), settled: z.literal(true).exactOptional() }).nullable(),
  active: z.strictObject({ kind: z.enum(['trip', 'study', 'work']), destinationId: id, companions: z.array(id), encounterId: id.nullable(), romanceId: id.nullable() }).nullable(),
  tripYear: int.nullable(),
  totals: z.strictObject({ trips: int.nonnegative(), spent: dollars, encounters: int.nonnegative(), romances: int.nonnegative(), study: int.nonnegative(), work: int.nonnegative(), returns: int.nonnegative(), immersion: int.nonnegative(), distanceLost: int.nonnegative(), happiness: int, stress: int, destinations: z.record(id, int.nonnegative()) }),
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
  languages: z.strictObject({ schoolId: id.nullable(), classId: id.nullable(), classYear: int.nullable(), totals: z.strictObject({ school: int.nonnegative(), classes: int.nonnegative(), immersion: int.nonnegative(), faded: int.nonnegative() }) }),
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
  crime,
  fame,
  sports,
  later,
  belonging,
  business: businessState,
  pastimes,
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
