/**
 * Saved game state (docs/technical.md, section N). Everything here is plain
 * JSON: no classes, no Dates, no functions. Money is whole dollars; stats are
 * integers from 0 to 100.
 */
import type {
  CredentialType,
  DebtKind,
  DiscoveryKind,
  FamilyProcessKind,
  GenderCategory,
  GiftTier,
  HousingKind,
  Lifestyle,
  OutcomeTier,
  PregnancyHow,
  PetPersonalityId,
  Program,
  Tier,
} from '../content/schemas';
import type { RngState } from './rng';

export type { CredentialType, DebtKind, DiscoveryKind, GenderCategory, GiftTier, HousingKind, LatentKind, Lifestyle, OutcomeTier, Program, Tier } from '../content/schemas';

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
  /** C1: the Happiness this life drifts back toward each year. */
  happinessBaseline: number;
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
  /** E2a: you can carry a pregnancy (women can, men can't; nonbinary characters choose). It stays as it was at birth. */
  canCarry: boolean;
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
  /** E1: the job track they work in (src/content/jobs), if they have a job. */
  occupation?: string;
  /** e.g. 'coworker', 'classmate', 'neighbor'. */
  tags: string[];
  /** E1: how they're feeling now (0–100); moved by interactions and events, and drifts back toward `moodBase` each year. */
  mood: number;
  /** E1: the mood this year started from (their personality and circumstances). */
  moodBase: number;
  /** E1: how well off they are, from their occupation and family background. */
  wealthLevel: FamilyWealth;
  /** E2a: they can carry a pregnancy. */
  canCarry: boolean;
  /** E2a: a potential partner's children from before, by birth year; they become your stepchildren if you marry. */
  priorChildren?: number[];
  /** E2a: set for your children and stepchildren: the fuller data a child has. */
  child?: ChildData;
  /** E3: their own life as a summary (job level, partner, children, troubles). Filled in by the first yearly step that meets them. */
  life?: PersonLife;
  /** M1: born-with conditions (ADHD, neurodivergence) they have: passed on, in part, to their children. */
  neuro?: Id[];
}

/** E3: how closely a person's life is followed: close people get the full yearly update, the rest only the major milestones. */
export type LifeTier = 'close' | 'near' | 'far';

export type PartnerStatus = 'dating' | 'engaged' | 'married';

/**
 * E3: someone's partner when the partner isn't on your People list (a
 * summary: name, gender, age and how far the relationship has come). Always
 * an adult, like the person they're with.
 */
export interface OutsidePartner {
  name: { first: string; last: string };
  genderCategory: GenderCategory;
  birthYear: number;
  canCarry: boolean;
  status: PartnerStatus;
  /** The year they got together. */
  since: number;
  /** The year the relationship took its current status (engaged, married...). */
  statusSince: number;
}

export type TroubleKind = 'illness' | 'crime' | 'addiction';

/**
 * E3: something going wrong in a person's life, from the existing content: an
 * illness or an addiction (a condition) or a crime (an offense). A crime
 * waits for its case in `stage` 'held' or 'bailed' (set by the year it
 * happened and ended the next), then ends as 'probation' or 'jail' until
 * `until`, or is over at once (a warning or a fine).
 */
export interface Trouble {
  kind: TroubleKind;
  /** The condition's id (illness, addiction) or the offense's id (crime). */
  refId: Id;
  since: number;
  /** An illness's or addiction's severity (1–100); 0 for a crime. */
  severity: number;
  /** Treated, or in rehab. */
  treated: boolean;
  /** A crime's stage. */
  stage?: 'held' | 'bailed' | 'probation' | 'jail';
  /** The last year of a probation or prison term. */
  until?: number;
}

/** E3: care for an aging person: needed (nobody has stepped in yet), at your home, paid for by you, or left to the family. */
export type CareState = 'needed' | 'home' | 'paid' | 'sibling';

/** E3: a person's own life, as a summary over the same content your own life uses. Their job is `Person.occupation` and `Person.wealthLevel`. */
export interface PersonLife {
  tier: LifeTier;
  /** The family background their wealth level is blended with. */
  background: FamilyWealth;
  /** Their level in their job track (0 without a job). */
  level: number;
  /** The year they reached this level (or started the job). */
  levelSince: number;
  /** The last job they lost, and when. */
  jobLost?: { year: number; how: 'fired' | 'laid_off' };
  /** They have retired and don't look for work. */
  retired?: true;
  partner: OutsidePartner | null;
  /** How their last relationship ended, and when. */
  ended?: { year: number; how: 'broke_up' | 'divorced' | 'widowed'; /** Their first name. */ partner: string };
  /** Their children (not on your People list), oldest first. */
  children: { first: string; birthYear: number }[];
  troubles: Trouble[];
  /** Addictions they recovered from, for relapses. */
  recovered: { refId: Id; year: number }[];
  care?: CareState;
  /** The year care became needed. */
  careSince?: number;
  /** How likely they are to talk (0–100); used by the social web (E4). */
  gossip: number;
  /** The last year a request from them came to you. */
  requestYear?: number;
}

export type ChildOrigin = 'birth' | 'adopted' | 'ivf' | 'surrogacy' | 'step';
/** Where a child lives: with you, in shared custody, or with their other parent. */
export type Custody = 'you' | 'shared' | 'other';

/**
 * E2a: a child's fuller data. Looks and smarts are on the Person (like every
 * relative's), the personality is the Person's `traits` (all six for a
 * child); the rest is here.
 */
export interface ChildData {
  origin: ChildOrigin;
  /** The other parent: your partner or ex; for a stepchild, the partner whose child they are. */
  otherParentId?: Id;
  custody: Custody;
  /** A custody decision has been made (or none is needed: you were never apart from them). */
  custodyDecided: boolean;
  health: number;
  happiness: number;
  fitness: number;
  stress: number;
  geneticRisk: number;
  talent: Id | null;
  /** Grades this school year (0–4); 0 before school age. */
  gpa: number;
  /** Hidden identity and personality traits, rolled independently of their parents (for heir play). */
  latent: Character['latent'];
  /** The year a grown child moved out. */
  movedOutYear?: number;
}

/** E2a: three lines, each 0–100, on a parent-child relationship (50 is even). */
export interface ParentingStyle {
  warmth: number;
  strictness: number;
  involvement: number;
}

/** E2a: a pregnancy and who it belongs to. */
export interface Pregnancy {
  startYear: number;
  how: PregnancyHow;
  /** Who carries it: you, a surrogate, or the person (their id). */
  carrier: 'you' | 'surrogate' | Id;
  /** The other parent (the person you conceived with; absent with a donor or surrogate). */
  otherParentId?: Id;
  /** An unplanned pregnancy waits for the decision event; the choice is kept here. */
  decision: 'pending' | 'keep' | 'adoption';
}

/** E2a: an adoption, IVF cycle or surrogacy under way. */
export interface FamilyProcess {
  kind: FamilyProcessKind;
  startYear: number;
  /** The year it comes to an answer. */
  dueYear: number;
  /** IVF: who will carry. */
  carrier?: 'you' | Id;
  otherParentId?: Id;
}

/** E2a: child support through the ledger: you pay or receive it for children with this person. */
export interface ChildSupport {
  direction: 'pay' | 'receive';
  personId: Id;
}

export interface FamilyState {
  pregnancy: Pregnancy | null;
  process: FamilyProcess | null;
  support: ChildSupport | null;
  /** Years of trying for a baby that haven't worked (reset by a pregnancy). */
  attempts: number;
  /** Children (born, adopted or step) who died before you. */
  lostChildren: number;
  /** Pregnancies that ended in miscarriage. */
  miscarriages: number;
}

export type RelationshipKind =
  | 'parent'
  | 'stepparent'
  | 'sibling'
  | 'grandparent'
  | 'relative'
  | 'child'
  | 'stepchild'
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
  /**
   * E1: what you've done with them through the interaction menu. `year` is
   * the year of the last interaction; the rest counts that year only (a new
   * year starts from nothing).
   */
  interactions?: InteractionCounters;
  /** E2a: your parenting style with this child (children and stepchildren only). */
  parenting?: ParentingStyle;
}

/** E1: a person's interaction counters for one year. */
export interface InteractionCounters {
  /** The year of the last interaction; the counters below are for that year. */
  year: number;
  /** Times each interaction (by id) was used that year. */
  counts: Record<Id, number>;
  /** Affection and trust their interactions gained that year (against the yearly cap). */
  gained: { affection: number; trust: number };
  /** They're annoyed with you this year: you overdid it, or it went badly. */
  annoyed: boolean;
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

/** The job you have now (Stage 8). */
export interface Job {
  /** The job track (src/content/jobs). */
  jobId: Id;
  /** Your level in the track (1 is the first). */
  level: number;
  /** Years worked at this level (counted at each yearly review). */
  yearsAtLevel: number;
  /** How well you're doing (0–100), set at each yearly review and moved by events. */
  performance: number;
  /** Yearly salary in whole dollars. */
  salary: number;
  /** The year you were hired. Your first year of pay is the next one. */
  since: number;
  /** Where you work (a fictional employer from the job's content). */
  employer: string;
  /** The last year you asked for a raise. */
  raiseYear?: number;
}

/** How a job ended ('jailed': you went to prison, Stage 9). */
export type JobEnd = 'quit' | 'fired' | 'laid_off' | 'retired' | 'moved' | 'jailed';

/** A job you used to have. */
export interface PastJob {
  jobId: Id;
  employer: string;
  fromYear: number;
  toYear: number;
  /** Your level and salary when it ended. */
  level: number;
  salary: number;
  endedBy: JobEnd;
}

export interface CareerState {
  job: Job | null;
  gig: boolean;
  retired: boolean;
  history: PastJob[];
  /** This year's job applications (cleared as each year begins). */
  applied: { jobId: Id; hired: boolean }[];
  /** Job tracks hiring in your city this year (rolled as each year begins, and when you move city). */
  openings: Id[];
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
  /** Earned income before tax (salaries and gig pay). */
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
  /** E2a: what your children cost this year. */
  children: number;
  /** E3: what looking after aging relatives cost you this year (at your home or paid care). */
  care: number;
  /** E2a: child support you paid and received this year. */
  supportPaid: number;
  supportReceived: number;
  /** E5: what your pets, vehicles and vacation homes cost to keep this year (food, vet care, fuel, parking, upkeep, property tax). */
  upkeep: number;
  /** E5: insurance premiums on your vehicles and vacation homes this year. */
  insurance: number;
  /** gross + retirement + interest + supportReceived − tax − housing − living − children − care − supportPaid − upkeep − insurance − debtPayments (savings change by net + borrowed). */
  net: number;
}

/** E2b: inherited money held for a minor heir; released into savings at `releaseAge`. */
export interface Trust {
  balance: number;
  releaseAge: number;
}

/** E2b: one person (or cause) the will leaves a share to; shares add up to 100. */
export interface WillShare {
  kind: 'person' | 'cause';
  /** A person's id, or a cause's id (registries/estate.yaml). */
  id: Id;
  /** Whole percent, 1–100. */
  percent: number;
}

/** E2b: your will: who gets what share of the estate. Without one, the default shares apply. */
export interface Will {
  shares: WillShare[];
  /** The year it was last written. */
  year: number;
}

/** E2b: what one beneficiary of the estate receives. */
export interface EstateLine {
  kind: 'person' | 'cause';
  id: Id;
  /** Their name, kept so the settlement reads correctly later. */
  name: string;
  /** How you were related (a relationship kind), or 'cause'; for the Death screen. */
  relation: RelationshipKind | 'cause';
  percent: number;
  /** Cash they receive (whole dollars). */
  cash: number;
  /** The home that passes to them, with its mortgage. */
  property?: { value: number; mortgage: number };
}

/** E2b: how the estate was settled at death. All money is whole dollars; see src/engine/estate/settle.ts. */
export interface Settlement {
  year: number;
  source: 'will' | 'default';
  savings: number;
  homeValue: number;
  /** The mortgage when you died. */
  mortgage: number;
  /** Funeral and settlement costs, paid first. */
  costs: number;
  /** Debts other than the mortgage that the estate paid. */
  debtsPaid: number;
  /** Estate tax, paid from the cash left after costs and debts (the home is sold if that falls short). */
  tax: number;
  /** Debts the estate couldn't pay: written off, never passed on. */
  writtenOff: number;
  home: 'none' | 'passes' | 'sold' | 'surrendered';
  /** What the lender took when the home was sold or surrendered, and the selling costs. */
  mortgagePaid: number;
  saleCosts: number;
  /** Cash and property equity left to share out (never negative). */
  netEstate: number;
  lines: EstateLine[];
  /** Cash nobody was left to receive. */
  unclaimed: number;
  /** E5: possessions passing on in kind (src/engine/estate/possessions.ts). */
  possessions: PossessionTransfer[];
  /** E5: cash from vehicles and vacation homes nobody could take (sold, less selling costs and what was owed on them); part of the cash the estate settles. */
  possessionSales: number;
}

/**
 * E5: one possession passing to a person in an estate. `item` is the
 * possession as it was (its own id belongs to the life that ended); `loan` is
 * the balance of the loan or mortgage attached to it, which passes with it
 * (never more than the item is worth).
 */
export interface PossessionTransfer {
  possessionId: Id;
  toPersonId: Id;
  item: Possession;
  loan: number;
}

/** E2b: the short "Previously" card an heir's life starts with. */
export interface Previously {
  parentName: string;
  lines: string[];
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
  /** E2b: money an heir under 18 inherited, held until they reach `releaseAge`. */
  trust?: Trust;
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
  /** A rental's rent as a multiple of the city's base rent, after rent changes (C1); 1 when absent. Reset by a move. */
  rentFactor?: number;
  /** E2b: an heir under 18 lives with this person: a surviving parent, a stepparent, a grandparent, a relative or an older sibling. */
  guardianId?: Id;
  /** E2b: an heir under 18 with no one to live with is in foster care (no guardian of their own). */
  foster?: true;
  /** E5: renovations done to the home you own and live in (a move or sale starts afresh). */
  renovations?: Renovation[];
}

/** E5: a renovation done, and the year. */
export interface Renovation {
  id: Id;
  year: number;
}

/** E5: a pet's own record. */
export interface PetState {
  personality: PetPersonalityId;
  /** How close it is to you (0–100). */
  bond: number;
  /** How old it was when it came to you, in years. */
  startAge: number;
  /** The age it dies at (rolled within its species' range; illness can cut it short, never below the shortest). */
  lifespan: number;
  /** Ill now: it needs a vet. */
  ill: boolean;
  /** The last year it saw a vet. */
  vetYear?: number;
  /** The year it died (it is removed the year after). */
  died?: number;
  /** This year's interactions with it (a new year starts from nothing). */
  interactions?: { year: number; counts: Record<Id, number>; gained: number; annoyed: boolean };
}

/** E5: a vehicle's own record. */
export interface VehicleState {
  /** How old it was when you got it, in years. */
  startAge: number;
  insured: boolean;
  /** The last year it had a full service. */
  serviceYear?: number;
  /** The car loan on it, if you're still paying one. */
  loanDebtId?: Id;
}

/** E5: a vacation home's own record. */
export interface VacationState {
  cityId: Id;
  insured: boolean;
  mortgageDebtId?: Id;
  renovations: Renovation[];
}

/** E5: anything you own that isn't money or the home you live in: a pet, a vehicle, a vacation home. */
export interface Possession {
  id: Id;
  kind: PossessionKind;
  /** The pet's, vehicle's or (for a vacation home) always 'vacation_home' definition. */
  defId: Id;
  /** The year it became yours. */
  acquired: number;
  /** What it is worth now (whole dollars); a pet is worth nothing. */
  value: number;
  /** A vehicle's or a home's condition, or a pet's health (0–100). */
  condition: number;
  /** A pet's name. */
  name?: string;
  pet?: PetState;
  vehicle?: VehicleState;
  home?: VacationState;
}

export type PossessionKind = 'pet' | 'vehicle' | 'home';

/** E5: what you own. */
export interface PossessionsState {
  items: Possession[];
  /** The next possession number (q1, q2...). */
  nextId: number;
  /** The years of insurance claims you made (the recent ones raise your premiums). */
  claims: number[];
  /** Years in a row you've held a job that needs a vehicle without having one. */
  noVehicleYears: number;
}

/** M1: the ways of caring for a mental health condition. */
export type MentalCare = 'therapy' | 'medication' | 'support';
/** M1: how a condition came to be named. */
export type DiagnosisPath = 'doctor' | 'therapist' | 'assessment' | 'crisis';
/** M1: how someone who noticed you struggling took it. */
export type Reaction = 'supportive' | 'neutral' | 'dismissive';

/** A health condition you have (Stage 9). */
export interface HealthCondition {
  conditionId: Id;
  /** The year it started (for a born-with condition, your birth year). */
  since: number;
  /** How bad it is, 1–100 (gone at 0). */
  severity: number;
  /** A doctor (or rehab) is treating it; for a mental health condition, you're in therapy or on medication. */
  treated: boolean;
  /** M1: the year a mental health condition or neurodivergence was named. Until then it shows only in your stats and in events. */
  diagnosed?: number;
  diagnosedBy?: DiagnosisPath;
  /** M1: how you're caring for it now (therapy, medication, leaning on people). */
  care?: MentalCare[];
}

/** M1: someone who has noticed you struggling. */
export interface Noticing {
  /** The year they first noticed (or you told them). */
  since: number;
  /** The last year it was still true. */
  year: number;
  reaction: Reaction;
  /** You told them (or leaned on them), rather than them noticing. */
  told?: true;
}

/** M1: mental health beyond the conditions themselves. */
export interface MentalState {
  /** Trauma you carry, 0–100; fades each year. */
  trauma: number;
  /** Who has noticed you struggling, by person id. */
  noticed: Record<Id, Noticing>;
  /** Mental health conditions you recovered from (they can come back), by condition id. */
  past: Record<Id, { year: number; times: number; diagnosed: boolean }>;
  /** The last year of a crisis, and how many there have been. */
  crisisYear?: number;
  crises: number;
  /** The last year you saw a therapist (once a year). */
  lastTherapist?: number;
  /** The last year medication gave you a side effect. */
  sideEffectYear?: number;
}

export interface HealthState {
  conditions: HealthCondition[];
  /** The last year you saw a doctor (once a year). */
  lastVisit?: number;
  /** M1: mental health. */
  mental: MentalState;
}

export type RecordOutcome = 'warning' | 'fine' | 'probation' | 'jail';

export interface LegalState {
  /** Entries on your criminal record: a fine's amount, and the years of probation or prison handed down. */
  record: { offenseId: Id; year: number; outcome: RecordOutcome; amount?: number; years?: number }[];
  /** The last year of your probation. */
  probationUntil?: number;
  /** The last year you spend in prison; you're released as the year after begins. */
  incarceratedUntil?: number;
}

/** Self-discovery (Stage 9). */
export interface DiscoveryState {
  /**
   * Latent traits (and a hidden talent) that have come to the surface: the
   * year they last did and how many times. Accepting a trait (or finding the
   * talent) removes it, along with the latent trait itself.
   */
  surfaced: Partial<Record<DiscoveryKind, { year: number; times: number }>>;
  /** The last year an inner crisis came. */
  crisisYear?: number;
}

/** E3: one line of news from the people you know. */
export interface NewsLine {
  personId: Id;
  /** The kind of change (text/news.yaml). */
  kind: string;
  /** The line as written, pronouns filled in. */
  text: string;
}

/** E3: a year's news from your people, capped (balance/people.yaml news). */
export interface NewsYear {
  year: number;
  lines: NewsLine[];
}

export interface EventInstance {
  instanceId: Id;
  eventId: Id;
  /** Role name -> person id. */
  cast: Record<string, Id>;
  resolvedChoiceId?: Id;
  outcomeText?: string;
  /** E5: the card's own text, kept when the outcome removed the pet, car or home it is about (so it can still be shown). */
  card?: { title: string; text: string };
  /** A follow-up: the year the event that scheduled it happened (C1, {since}). */
  since?: number;
  /** What the chosen outcome did to your money (C1): shown on the outcome card. */
  money?: MoneyChange;
}

/**
 * A change to your money from one outcome (C1): savings up or down, the new
 * balance, debt taken on (or paid off), what your family covered, and a
 * change to your yearly housing cost with the new cost.
 */
export interface MoneyChange {
  change: number;
  balance: number;
  debtChange: number;
  familyHelp?: number;
  housing?: { change: number; annual: number };
}

export interface ScheduledEvent {
  eventId: Id;
  dueYear: number;
  cast: Record<string, Id>;
  /** The year the event that scheduled it happened (C1, {since}). */
  since?: number;
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
  /** E2b: the family line (archive schema version 3). */
  lineId: Id;
  familyName: string;
  /** The family's reputation when this life ended. */
  familyReputation: number;
  /** E2b: the heir who carried on, if one did. */
  heirName?: string;
}

export interface InputRecord {
  year: number;
  kind: 'create' | 'ageUp' | 'choice' | 'action' | 'interact' | 'interactChoice' | 'interactClose';
  /** e.g. { instanceId, choiceId }, { actionId, params }, or (E1) { interactionId, personId, giftTier? }, { choiceId }, {}. */
  payload: Record<string, unknown>;
}

/**
 * E1: what an interaction did, kept in the saved life so the outcome card
 * survives a reload. It stays until you close it (or, with a choice waiting,
 * until you choose).
 */
export interface PendingInteraction {
  interactionId: Id;
  /** Who it was with; for a pet interaction (`pet`), the pet's possession id. */
  personId: Id;
  /** E5: it was with a pet: `personId` is the pet, `changes.affection` is how its bond moved. */
  pet?: true;
  /** E4: the second person (an introduction) or the story (a knowledge item) the interaction was about. */
  otherId?: Id;
  itemId?: string;
  tier: OutcomeTier;
  giftTier?: GiftTier;
  /** The outcome text, written (pronouns filled in) when it happened. */
  text: string;
  /** Extra lines: an injury, a charge, a school suspension. */
  notes: string[];
  /** How it moved them toward you (after diminishing returns), their mood included. */
  changes: { affection: number; trust: number; mood: number };
  /** They've had enough of this interaction this year. */
  annoyed: boolean;
  money?: MoneyChange;
  /** A choice the moment opens: waiting (no `chosen`) or made. */
  choice?: { prompt: string; options: { id: Id; label: string }[]; chosen?: Id; /** What the chosen option led to. */ result?: string };
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
  discovery: DiscoveryState;
  flags: Record<string, number | boolean | string>;
  eventLog: Record<Id, { count: number; lastYear: number }>;
  scheduled: ScheduledEvent[];
  pending: EventInstance[];
  /** E1: the outcome card of the last interaction, until it is closed. */
  pendingInteraction: PendingInteraction | null;
  /** E2a: pregnancy, adoption and other processes, child support and losses. */
  family: FamilyState;
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
  /** E2b: your will, if you've written one. */
  will: Will | null;
  /** E2b: how the estate was settled; set when you die. */
  estate: Settlement | null;
  /** E2b: where this life sits in its family line. */
  lineage: Lineage;
  /** E3: news from your people, newest year last, a few years kept. */
  news: NewsYear[];
  /** E4: the ties between the people you know, and what each of them has heard. */
  web: WebState;
  /** E5: pets, vehicles and vacation homes. */
  possessions: PossessionsState;
}

/** E4: how two people you know are connected to each other. */
export type TieKind = 'married' | 'dating' | 'siblings' | 'parentChild' | 'inLaw' | 'friends';

/** E4: how a tie begins: from the family's structure, when a partner meets your people, from a shared city, or when you introduce them. */
export type TieOrigin = 'family' | 'partner' | 'context' | 'introduced';

/**
 * E4: a tie between two people in your circle. The same from both sides: one
 * record per pair, kept under `tieKey(a, b)` with `a` before `b`. Its status
 * (close, normal, strained) follows from `affection`; `feud` is set while the
 * two are feuding.
 */
export interface Tie {
  a: Id;
  b: Id;
  kind: TieKind;
  affection: number;
  origin: TieOrigin;
  /** The year the tie began. */
  since: number;
  /** While feuding: the year it began, the side you took (if you did), whether you said you would stay out of it, and whether it has come to your attention (an event asked you about it). */
  feud?: { since: number; side?: Id; neutral?: true; aware?: true };
  /** The year the tie took its current kind (dating became married...); absent when it never changed. */
  kindSince?: number;
  /** The last year an event about this tie was queued. */
  eventYear?: number;
  /** An introduction's follow-up has been looked at. */
  followed?: true;
}

/** E4: what one person has heard about something. */
export interface Holder {
  /** The version of the story they believe (an id in registries/web.yaml). */
  version: string;
  /** The year they heard it. */
  since: number;
  /** Who told them: you, another person, or nobody (they saw it for themselves). */
  from: 'you' | 'saw' | Id;
  /** They have reacted (an event, or the changes to how they feel). */
  reacted: boolean;
  /** You asked them to keep it quiet, and the year (they tell far fewer people for a while). */
  hushed?: number;
}

/** E4: a notable fact, or a secret, about you or about someone you know, and who has heard which version of it. */
export interface KnowledgeItem {
  id: Id;
  /** The kind of fact (registries/web.yaml kinds). */
  kind: string;
  /** Who it is about: 'you' or a person. */
  subject: 'you' | Id;
  /** The other person in it (an affair's other person, an ex), if any. */
  other?: Id;
  /** The year it happened. */
  year: number;
  /** The version that is true. */
  truth: string;
  holders: Record<Id, Holder>;
  /** A secret that has become common knowledge (its event has been queued). */
  public?: true;
}

/** E4: the social web. */
export interface WebState {
  /** Ties by `tieKey`. */
  ties: Record<string, Tie>;
  items: KnowledgeItem[];
  /** The next item number. */
  nextItem: number;
  /** What has already become a knowledge item, so each fact is recorded once. */
  seen: string[];
}

/** E2b: the family line a life belongs to. Family reputation sits on the line and passes to each heir. */
export interface Lineage {
  generation: number;
  /** The life this one continued from (an heir's parent). */
  parentLifeId?: Id;
  /** The family line: the first life's id, kept by every heir. */
  lineId: Id;
  /** The family name the line was started with. */
  familyName: string;
  /** What the family is known for, 0–100 (50 is unremarkable). */
  reputation: number;
  /** Notable deeds the family is known for (ids in text/heir.yaml deeds), newest last. */
  deeds: string[];
  /** The card an heir sees at the start; cleared at their first age-up. */
  previously?: Previously;
}
