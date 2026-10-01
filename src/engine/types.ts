/**
 * Saved game state (docs/technical.md, section N). Everything here is plain
 * JSON: no classes, no Dates, no functions. Money is whole dollars; stats are
 * integers from 0 to 100.
 */
import type { CredentialType, DebtKind, GenderCategory, HousingKind, Lifestyle, Program, Tier } from '../content/schemas';
import type { RngState } from './rng';

export type { CredentialType, DebtKind, GenderCategory, HousingKind, Lifestyle, Program, Tier } from '../content/schemas';

export type Id = string;

export type LifeStage = 'early' | 'child' | 'teen' | 'youngAdult' | 'adult' | 'senior';
export type FamilyWealth = 'poor' | 'working' | 'middle' | 'affluent' | 'rich';
/**
 * 'action' is between years: a management action queued its result event,
 * which the player resolves before the life returns to 'yearStart'.
 */
export type LifePhase = 'yearStart' | 'events' | 'yearEnd' | 'dead' | 'action';

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
  /** The city you live in now (where your home is). */
  cityId: Id;
  /** The city you were born in; never changes (for the obituary and archive). */
  birthCityId: Id;
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
  | 'fiance'
  | 'spouse'
  | 'ex'
  | 'coworker'
  | 'boss'
  | 'classmate'
  | 'acquaintance';

export type RelationshipStatus = 'active' | 'estranged' | 'ended';

export interface Relationship {
  personId: Id;
  kind: RelationshipKind;
  /** 'estranged': you cut contact (or they did). 'ended': they have faded out of your life. */
  status: RelationshipStatus;
  affection: number;
  trust: number;
  memories: { tag: string; year: number }[];
  /** The year you met (for family, the year you were born). */
  since: number;
  /** The year the relationship took its current kind (started dating, married...); absent when it never changed. */
  kindSince?: number;
  /** The year of the last management action with this person (one per person per year). */
  lastActionYear?: number;
  /** True once they have been your spouse; it stays true after a divorce (an ex-spouse). */
  wasSpouse?: boolean;
}

/** A school program and what you study there. */
export interface SchoolPlace {
  program: Program;
  /** College only. */
  tier?: Tier;
  /** College only. */
  majorId?: Id;
  /** Trade school only. */
  tradeId?: Id;
  /** Grad school only. */
  gradProgramId?: Id;
}

/** A program you're in. */
export interface Enrollment extends SchoolPlace {
  /** The year of the program you're in (1 is the first). */
  year: number;
  lengthYears: number;
  /** Average of the years graded so far (0–4); before the first grade, what your record points to. */
  gpa: number;
  /** GPA points events added to this year's grade (applied when the year is graded). */
  boost: number;
  /** Years repeated (held back) in this program. */
  repeats: number;
  /** Share of tuition scholarships cover (0–1), set when you were accepted. */
  scholarship: number;
  /** The calendar year you started (or went back to) this program. */
  since: number;
}

/** A place you take up when the next year begins: an admission, or going back to a program you left. */
export interface Admission extends SchoolPlace {
  scholarship: number;
  /** The year you were accepted (or decided to go back). */
  decided: number;
  /** Going back to a program you left: where you pick up. */
  resume?: { year: number; lengthYears: number; gpa: number; repeats: number };
}

export interface Credential {
  type: CredentialType;
  /** The major (associate, bachelor), trade (trade license) or grad program (grad). */
  refId?: Id;
  year: number;
  /** Final GPA, where there was one. */
  gpa?: number;
  /** College degrees: the tier. */
  tier?: Tier;
}

/** One school year's tuition and who paid it (whole dollars; tuition = scholarship + family + fund + loan). */
export interface SchoolBill {
  year: number;
  tuition: number;
  scholarship: number;
  family: number;
  /** Paid from scholarship money won in events. */
  fund: number;
  /** Borrowed as a student loan (through the debt system). */
  loan: number;
}

export interface EducationState {
  current: Enrollment | null;
  credentials: Credential[];
  admission: Admission | null;
  /** The last program you left without finishing it, which you can go back to. */
  left: (Enrollment & { leftYear: number }) | null;
  /** This year's applications, GED attempts and major changes ('college:state', 'trade:welder', 'grad:law', 'ged', 'major'). */
  applied: { option: string; accepted: boolean }[];
  /** Scholarship money won in events; it pays tuition until it runs out. */
  fund: number;
  /** The current (or last) school year's tuition. */
  lastBill?: SchoolBill;
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
  kind: DebtKind;
  /** Whole dollars owed; a paid-off debt is removed. */
  balance: number;
  /** Yearly interest, e.g. 0.065. */
  annualRate: number;
  /** The yearly payment due (the balance, if less). */
  minPayment: number;
  /** Missed payments in a row. */
  missed: number;
}

/** One year's money, from the ledger (docs/design.md, section J). */
export interface Ledger {
  year: number;
  /** Earned income before tax (gig pay, and salaries from Stage 8). */
  gross: number;
  /** The retirement benefit (untaxed). */
  retirement: number;
  tax: number;
  housing: number;
  living: number;
  /** Paid on debts, including anything garnished. */
  debtPayments: number;
  /** Interest earned on savings. */
  interest: number;
  /** Interest added to debts. */
  debtInterest: number;
  /** Costs savings couldn't cover, added to personal debt. */
  borrowed: number;
  /** Your share of costs at your parents' that your family covered because you couldn't. */
  support: number;
  /** gross + retirement + interest − tax − housing − living − debtPayments (savings change by net + borrowed). */
  net: number;
}

export interface FinanceState {
  savings: number;
  debts: Debt[];
  lifestyle: Lifestyle;
  lastLedger?: Ledger;
  /**
   * The earnings record the retirement benefit is based on: years with
   * earned income and the total earned in them (each year capped).
   */
  earnings: { years: number; total: number };
  /** Years in a row behind on your housing costs (borrowing for at least balance's evictionShare of them). */
  hardshipYears: number;
  /** The year you last filed for bankruptcy. */
  bankruptcyYear?: number;
  /** The year you last set up a debt plan. */
  debtPlanYear?: number;
}

export interface HousingState {
  kind: HousingKind;
  /** Always the city you live in (character.cityId). */
  cityId: Id;
  /** Yearly cost of this home as the ledger charges it (a mortgage is paid as a debt). */
  annualCost: number;
  /** An owned home's value. */
  homeValue?: number;
  mortgageDebtId?: Id;
  /** The year you moved into this home. */
  since: number;
  /** Sharing a rental with a roommate. */
  roommate?: true;
  /** Your partner or spouse who lives with you (and pays their share). */
  partnerId?: Id;
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

/** What changed over one year, for the year recap. */
export interface YearRecap {
  year: number;
  age: number;
  /** Stats when the year began. */
  statsBefore: Stats;
  /** Stats when the year ended; null while the year is still in progress. */
  statsAfter: Stats | null;
}

/** How and when the character died. Set only in the dead phase. */
export interface DeathRecord {
  year: number;
  age: number;
  /** A cause id from src/content/causes. */
  causeId: Id;
}

/** A life in the archive: kept for good, readable without the content that made it. */
export interface ArchivedLife {
  id: Id;
  name: string;
  pronouns: Pronouns;
  birthYear: number;
  /** The year the life ended (or, when unfinished, was set aside). */
  deathYear: number;
  ageAtDeath: number;
  /** Readable cause, e.g. "natural causes"; null for an unfinished life. */
  causeOfDeath: string | null;
  /** True when a new life was started before this one ended. */
  unfinished: boolean;
  /** Where the life ended (or was set aside). */
  cityId: Id;
  /** Where the life began. */
  birthCityId: Id;
  obituary: string;
  highlights: HistoryEntry[];
  finalNetWorth: number;
  finalStats: Stats;
  seed: string;
  generation: number;
  parentLifeId?: Id;
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
  /** The current or last finished year's recap; null before the first age-up. */
  recap: YearRecap | null;
  /**
   * Set when the character dies: in the 'dead' phase, or in 'yearEnd' when an
   * event killed them and endYear has yet to close the life.
   */
  death: DeathRecord | null;
  /** Happiness summed over every finished year, for the lifetime average. */
  lifetime: { happinessTotal: number; years: number };
  /** For heir play later. */
  lineage: { generation: number; parentLifeId?: Id };
}
