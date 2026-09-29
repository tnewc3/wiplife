/**
 * Saved game state (docs/technical.md, section N). Everything here is plain
 * JSON: no classes, no Dates, no functions. Money is whole dollars; stats are
 * integers from 0 to 100.
 */
import type { GenderCategory } from '../content/schemas';
import type { RngState } from './rng';

export type { GenderCategory } from '../content/schemas';

export type Id = string;

export type LifeStage = 'early' | 'child' | 'teen' | 'youngAdult' | 'adult' | 'senior';
export type FamilyWealth = 'poor' | 'working' | 'middle' | 'affluent' | 'rich';
export type LifePhase = 'yearStart' | 'events' | 'yearEnd' | 'dead';

export interface Pronouns {
  subject: string;
  object: string;
  possessive: string;
  possessivePronoun: string;
  reflexive: string;
  /** True for "they are". */
  verbPlural: boolean;
}

export interface Identity {
  /** Free text, e.g. "woman", "genderfluid". */
  genderIdentity: string;
  /** Used for attraction matching. */
  genderCategory: GenderCategory;
  /** Free text. */
  genderExpression: string;
  pronouns: Pronouns;
  /** Empty means not attracted to anyone. */
  attractedTo: GenderCategory[];
}

export interface Personality {
  ambition: number;
  confidence: number;
  kindness: number;
  riskTaking: number;
  discipline: number;
  sociability: number;
}

export type PersonalityTrait = keyof Personality;

export interface Stats {
  health: number;
  happiness: number;
  smarts: number;
  looks: number;
  fitness: number;
  stress: number;
}

export type StatKey = keyof Stats;

export interface HiddenValues {
  luck: number;
  reputation: number;
  geneticRisk: number;
  vice: number;
  innerConflict: number;
  talent: Id | null;
  talentDiscovered: boolean;
}

export interface Character {
  name: { first: string; last: string };
  age: number;
  lifeStage: LifeStage;
  identity: Identity;
  /** Hidden traits that may surface through play. */
  latent: {
    identity?: Partial<Identity>;
    personality?: Partial<Personality>;
  };
  appearance: { descriptors: string[] };
  stats: Stats;
  personality: Personality;
  hidden: HiddenValues;
  cityId: Id;
  familyWealth: FamilyWealth;
  custom: boolean;
}

export interface Person {
  id: Id;
  name: { first: string; last: string };
  birthYear: number;
  alive: boolean;
  deathYear?: number;
  identity: Identity;
  traits: Partial<Personality>;
  looks: number;
  smarts: number;
  cityId: Id;
  occupation?: string;
  /** e.g. 'coworker', 'classmate', 'neighbor'. */
  tags: string[];
}

export type RelationshipKind =
  | 'parent'
  | 'stepparent'
  | 'sibling'
  | 'grandparent'
  | 'friend'
  | 'partner'
  | 'spouse'
  | 'ex'
  | 'coworker'
  | 'boss'
  | 'classmate'
  | 'acquaintance';

export interface Relationship {
  personId: Id;
  kind: RelationshipKind;
  status: 'active' | 'estranged' | 'ended';
  affection: number;
  trust: number;
  memories: { tag: string; year: number }[];
  since: number;
}

export interface EducationState {
  current: null | {
    program: 'elementary' | 'middle' | 'high' | 'college' | 'trade' | 'grad';
    tier?: 'community' | 'state' | 'elite';
    majorId?: Id;
    tradeId?: Id;
    gradProgramId?: Id;
    year: number;
    lengthYears: number;
    gpa: number;
  };
  credentials: {
    type: 'hs_diploma' | 'ged' | 'associate' | 'bachelor' | 'trade_license' | 'grad';
    refId?: Id;
    year: number;
  }[];
}

export interface CareerState {
  job: null | { jobId: Id; level: number; yearsAtLevel: number; performance: number; salary: number };
  gig: boolean;
  retired: boolean;
  history: {
    jobId: Id;
    fromYear: number;
    toYear: number;
    endedBy: 'quit' | 'fired' | 'laid_off' | 'retired' | 'moved';
  }[];
}

export interface Debt {
  id: Id;
  kind: 'student' | 'personal' | 'mortgage' | 'medical' | 'collections';
  balance: number;
  annualRate: number;
  minPayment: number;
  missed: number;
}

export interface FinanceState {
  savings: number;
  debts: Debt[];
  lifestyle: 'frugal' | 'comfortable' | 'lavish';
  lastLedger?: {
    year: number;
    gross: number;
    tax: number;
    housing: number;
    living: number;
    debtPayments: number;
    net: number;
  };
}

export interface HousingState {
  kind: 'with_parents' | 'renting' | 'owned' | 'homeless' | 'incarcerated';
  cityId: Id;
  annualCost: number;
  homeValue?: number;
  mortgageDebtId?: Id;
}

export interface HealthState {
  conditions: { conditionId: Id; since: number; severity: number; treated: boolean }[];
}

export interface LegalState {
  record: { offenseId: Id; year: number; outcome: 'warning' | 'fine' | 'probation' | 'jail' }[];
  probationUntil?: number;
  incarceratedUntil?: number;
}

export interface EventInstance {
  instanceId: Id;
  eventId: Id;
  /** Role name -> person id. */
  cast: Record<string, Id>;
  resolvedChoiceId?: Id;
  outcomeText?: string;
}

export interface ScheduledEvent {
  eventId: Id;
  dueYear: number;
  cast: Record<string, Id>;
}

export interface HistoryEntry {
  year: number;
  age: number;
  text: string;
  tags: string[];
  importance: 1 | 2 | 3;
  legendary?: boolean;
}

export interface InputRecord {
  year: number;
  kind: 'create' | 'ageUp' | 'choice' | 'action';
  /** e.g. { instanceId, choiceId } or { actionId, params }. */
  payload: Record<string, unknown>;
}

export interface LifeState {
  id: Id;
  seed: string;
  /** Continues across saves. */
  rng: RngState;
  birthYear: number;
  currentYear: number;
  phase: LifePhase;
  character: Character;
  people: Record<Id, Person>;
  /** Keyed by person id. */
  relationships: Record<Id, Relationship>;
  education: EducationState;
  career: CareerState;
  finances: FinanceState;
  housing: HousingState;
  health: HealthState;
  legal: LegalState;
  flags: Record<string, number | boolean | string>;
  eventLog: Record<Id, { count: number; lastYear: number }>;
  scheduled: ScheduledEvent[];
  pending: EventInstance[];
  history: HistoryEntry[];
  /** Every player input, for exact replay. */
  inputLog: InputRecord[];
  /** For heir play later. */
  lineage: { generation: number; parentLifeId?: Id };
}
