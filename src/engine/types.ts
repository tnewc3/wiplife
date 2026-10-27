import type { BrowStyle, ClothingColor, Earrings, EyeColor, EyeShape, Eyewear, FacialHair, Hairstyle, HairColor, Hat, HatColor, LashStyle, NoseShape, Outfit, SkinColor } from '../portraits/ids';
import type { TravelState } from './travel/types';
import type { MigrationState } from './migration/types';
import type { CountryId } from '../content/schemas';
import type { LanguageSkill } from '../content/schemas/languages';
import type { LanguageLearning } from './languages';
import type { AddedTeam, TeamSetup } from './sports/setup';
/**
 * Saved game state (docs/technical.md, section N). Everything here is plain
 * JSON: no classes, no Dates, no functions. Money is whole dollars; stats are
 * integers from 0 to 100.
 */
import type {
  BusinessStyle,
  OrderLevel,
  TrainingLevel,
  MarketingLevel,
  OwnerRole,
  PayLevel,
  PriceLevel,
  QualityLevel,
  StaffingLevel,
  CredentialType,
  DebtKind,
  DiscoveryKind,
  EulogyGroup,
  ExamBand,
  ExamId,
  Commitment,
  EulogyTone,
  FamilyProcessKind,
  GenderCategory,
  GiftTier,
  HousingKind,
  Lifestyle,
  OutcomeTier,
  PregnancyHow,
  PetPersonalityId,
  Program,
  RuleDomainId,
  SchoolPath,
  TeenFocusId,
  Tier,
  ValueId,
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

/** P1: the body type of a portrait. The portrait template is this plus the age stage; it is never stored. */
export type BodyType = 'male' | 'female';

/**
 * P1: how a character or person looks, as portrait settings (the ids come from the portrait art). Age stage and expression
 * are not stored: the stage comes from the age, the expression from how they feel. `hair` is the natural color; it renders
 * silver from `grayingAge` unless a `dye` is still fresh.
 */
export interface Look {
  body: BodyType;
  hairstyle: Hairstyle;
  outfit: Outfit;
  eyeShape: EyeShape;
  browStyle: BrowStyle;
  lashStyle: LashStyle;
  noseShape: NoseShape;
  facialHair: FacialHair;
  eyewear: Eyewear;
  earrings: Earrings;
  hat: Hat;
  skin: Exclude<SkinColor, 'original'>;
  hair: Exclude<HairColor, 'original' | 'silver'>;
  eyes: Exclude<EyeColor, 'original'>;
  clothing: Exclude<ClothingColor, 'original'>;
  hatColor: Exclude<HatColor, 'original'>;
  grayingAge: number;
  /** A dye color and the year it was dyed; it fades after balance/portraits.yaml dyeFadeYears. */
  dye?: { color: Exclude<HairColor, 'original'>; year: number };
}

export interface Character {
  /** P1: how you look. Filled at creation (and by the yearly looks step for older lives). */
  look?: Look;
  languages: LanguageSkill[];
  /** W6: the countries whose citizen you are (never empty; the first is the one you were born into). */
  citizenships: CountryId[];
  name: { first: string; last: string };
  age: number;
  lifeStage: LifeStage;
  identity: Identity;
  /** Hidden traits that may surface through play. */
  latent: {
    identity?: Partial<Identity>;
    personality?: Partial<Personality>;
    /** W2: a pull toward another faith, or away from the one you have (null: toward no faith), to be found or lost later. */
    faith?: { id: Id | null };
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
  /** B1: the name heritage (an id in the name pool) your names come from. Unset when it can't be known (older lives). */
  heritage?: string;
  /** Batch 2b: the names you had before a legal name change, oldest first, with the year you left each (at most risk.yaml identity.formerMax). */
  formerNames?: { first: string; last: string; year: number }[];
}

export interface Person {
  /** P1: how they look. Filled when they join your life, or by the yearly looks step. */
  look?: Look;
  languages: LanguageSkill[];
  /** W6: the countries whose citizen they are (never empty). */
  citizenships: CountryId[];
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
  /** B1: the name heritage (an id in a name pool) their names come from. Unset when it can't be known (older lives). */
  heritage?: string;
  canCarry: boolean;
  /** E2a: a potential partner's children from before, by birth year; they become your stepchildren if you marry. */
  priorChildren?: number[];
  /** E2a: set for your children and stepchildren: the fuller data a child has. */
  child?: ChildData;
  /** E3: their own life as a summary (job level, partner, children, troubles). Filled in by the first yearly step that meets them. */
  life?: PersonLife;
  /** M1: born-with conditions (ADHD, neurodivergence) they have: passed on, in part, to their children. */
  neuro?: Id[];
  /** L1: set for your grandchildren (and kept if you raise one): who their parent is, one of your children. */
  grandchild?: GrandchildData;
  /**
   * W2: their faith and how strongly they believe, once it is set down (a family member's at birth, a child's when they
   * are born, a change of faith, a member of a faith group). Everyone else's is worked out from the life's seed when asked
   * (src/engine/belonging/faith.ts), so it is always the same.
   */
  faith?: { id: Id | null; strength: number };
}

/** L1: a grandchild's link to your family: their parent is one of your children or stepchildren. */
export interface GrandchildData {
  parentId: Id;
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
  children: { first: string; birthYear: number; /** L1: the grandchild on your People list this child became, if they are your grandchild. */ id?: Id }[];
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
  /** W6: they moved to another country: the year, the country, and whether with papers. */
  emigrated?: { year: number; countryId: CountryId; from: Id; papers: boolean };
}

export type ChildOrigin = 'birth' | 'adopted' | 'ivf' | 'surrogacy' | 'step' | 'grandchild';
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
  | 'grandchild'
  | 'friend'
  | 'partner'
  | 'fiance'
  | 'spouse'
  | 'ex'
  | 'coworker'
  | 'boss'
  | 'classmate'
  | 'teacher'
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
  /** Batch 3: where you take the last years of secondary school when it isn't the school you started at (the UK's further education college). */
  venue?: 'college';
  /** Batch 3: a trade learned as an apprenticeship from the choice at the end of compulsory school (no school diploma was needed). */
  apprentice?: true;
}

/** A place you take up when the next year begins: an admission, or going back to a program you left. */
export interface Admission extends SchoolPlace {
  scholarship: number;
  /** The year you were accepted (or decided to go back). */
  decided: number;
  /** Going back to a program you left: where you pick up. */
  resume?: { year: number; lengthYears: number; gpa: number; repeats: number };
  /** Batch 3: the place depends on an exam result (the UK's A-levels): the score the place asks for. */
  conditional?: { exam: ExamId; min: number };
}

/** Batch 3: an exam you sat: the year, the score (0–100) and the band it fell in. */
export interface ExamResult {
  id: ExamId;
  year: number;
  score: number;
  band: ExamBand;
}

/** Batch 3: what you did in a school year (the year it was done in). */
export interface SchoolYearActions {
  year: number;
  /** Your stance this year: studying harder or slacking off. */
  effort: 'study' | 'slack' | null;
  /** The subject you are working on, if you named one. */
  subject?: string;
  /** What a tutor cost this year, in whole dollars (0 without one; a minor's family pays it). */
  tutor: number;
  /** Tests you cheated on, classes you skipped, and whether you were caught at either this year. */
  cheated: number;
  skipped: number;
  caught: boolean;
}

/**
 * Batch 3: school life beyond the grade. The school you are at (a new school is a new class and new teachers), the
 * people there, the spread of your grades across subjects, what you have done this year, the exams you have sat
 * and the choice you made at the end of compulsory school.
 */
export interface SchoolLife {
  /** `${cityId}:${program}:${venue}`: moving city, changing stage or going to a college is a new school. Null out of school. */
  key: string | null;
  /** Your class (living classmates; the pruning keeps them while you are in this school). */
  classmates: Id[];
  /** Teachers and staff, by role. */
  staff: { homeroom?: Id; head?: Id; support?: Id };
  /** Each subject's grade against your year's grade, in GPA points (positive: you are better at it). */
  spread: Record<string, number>;
  year: SchoolYearActions;
  /** Exams you have sat, the latest of each. */
  exams: ExamResult[];
  /** The choice at the end of compulsory school, made before the year ends. */
  choice: { path: SchoolPath; tradeId?: Id; year: number } | null;
  /** How a placement exam shifted your grades at the school after it, in GPA points. */
  shift: number;
  /** The choice at the end of compulsory school has been settled (or the country has none). */
  chosen: boolean;
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
  /** Batch 3: the class, the teachers, the report card's spread, this year's actions and the exams. */
  school: SchoolLife;
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
  /** Batch 3: what you have done at work this year (the year it was done in). */
  work: WorkYearActions;
}

/** Batch 3: work actions in a year: your stance, how often you socialized, the office party and the coworkers you reported. */
export interface WorkYearActions {
  year: number;
  /** Working harder or slacking off this year (the yearly review reads last year's). */
  effort: 'hard' | 'slack' | null;
  socialized: number;
  party: boolean;
  reported: number;
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
  /** W2: dues, collections and donations to the groups you belong to this year. */
  giving: number;
  /** W6: money sent home to relatives in another country (absent in ledgers from before W6). */
  remittances?: number;
  /** W3: money you put into your businesses to cover a loss (their draws to you are in `gross`). */
  business: number;
  /** gross + retirement + interest + supportReceived − tax − housing − living − children − care − supportPaid − upkeep − insurance − giving − debtPayments (savings change by net + borrowed). */
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
  /** W3: businesses passing on in kind (src/engine/business/estate.ts). */
  businesses: BusinessTransfer[];
  /** W3: cash from businesses nobody could take (your share of the sale, after their loans); part of the cash the estate settles. */
  businessSales: number;
}

/** W3: one business passing to a person in an estate. `item` is the business as it was (its id belongs to the life that ended); `loan` is what is owed on the loans taken for it, which passes with it (never more than it is worth). */
export interface BusinessTransfer {
  businessId: Id;
  toPersonId: Id;
  item: Business;
  loan: number;
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
  earnings: { years: number; total: number; /** Batch 10: the same record by the country the years were earned in (the rows add up to years and total). */ byCountry: Record<string, { years: number; total: number }> };
  /** Years in a row behind on your housing costs (borrowing for at least balance's evictionShare of them). */
  hardshipYears: number;
  /** E2b: money an heir under 18 inherited, held until they reach `releaseAge`. */
  trust?: Trust;
  /** The year you last filed for bankruptcy. */
  bankruptcyYear?: number;
  /** The year you last set up a debt plan. */
  debtPlanYear?: number;
  /** E6a: dirty money, cash from crime you haven't laundered (never counted in savings, net worth or the ledger). */
  dirty: number;
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
  /** L1: you live in assisted living (a rental, for the year it began and after): housing costs what it costs there, meals included. A move ends it. */
  assisted?: { since: number };
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
  valuable?: ValuableState;
}

/** Batch 2a: a valuable's own record (jewelry, designer goods, art or a boat): whether it is insured against theft. */
export interface ValuableState {
  insured: boolean;
}

export type PossessionKind = 'pet' | 'vehicle' | 'home' | 'valuable';

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
  /**
   * Entries on your criminal record: a fine's amount, and the years of
   * probation or prison handed down. T1: `sealed` marks a juvenile case once
   * you are an adult: it stays in your history but no longer counts anywhere.
   */
  record: { offenseId: Id; year: number; outcome: RecordOutcome; amount?: number; years?: number; sealed?: true }[];
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
  /** E6a: a change to your dirty money, with the new balance. */
  dirty?: { change: number; balance: number };
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
  /** U1: what an event outcome did to your savings, and the balance after it: the life log shows it as a green or red line. */
  money?: { change: number; balance: number };
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
/**
 * W1: the eulogy given at a funeral, from the point of view of the person who
 * knew you best. `paragraphs` is the text; `pieces` names the template pieces
 * it was built from (for the simulation's variety report).
 */
export interface Eulogy {
  speakerName: string;
  /** What the speaker was to you ("wife", "son", "friend"). */
  relation: string;
  /** What the speaker was to you, in the groups the opening is written for. */
  group: EulogyGroup;
  tone: EulogyTone;
  paragraphs: string[];
  pieces: string[];
}

/** W1: someone who was not at the funeral, with the reason in words. */
export interface FuneralGuest {
  name: string;
  relation: string;
  reason: string;
}

/**
 * W1: the funeral of a life that ended. No `eulogy` means no one was close
 * enough to speak. `notAttending` are people who chose to stay away (the
 * closest first, at most the balance's `maxListed`; `moreNotAttending` counts
 * the rest); `couldNotAttend` are people who could not come (prison, illness,
 * care).
 */
export interface Funeral {
  eulogy: Eulogy | null;
  notAttending: FuneralGuest[];
  moreNotAttending: number;
  couldNotAttend: FuneralGuest[];
  /** L1: the last days: a foreseen death, hospice, the service you asked for, the people who came. Absent for lives archived before L1. */
  lastDays?: LastDays | null;
}

/** L1: how you chose to spend your last months. */
export type HospiceChoice = 'hospice' | 'home' | 'hospital';
/** L1: the kind of service you asked for. */
export type ServiceStyle = 'traditional' | 'simple' | 'celebration' | 'private';

/** L1: the lines of a life review: a regret or a proud moment, written from the life, with the template it came from. */
export interface ReviewLine {
  id: string;
  text: string;
}

/** L1: the regrets and proud moments of a life that ended, built from its history, memories and relationships. */
export interface LifeReview {
  regrets: ReviewLine[];
  proud: ReviewLine[];
}

/** L1: what the last days were, for the funeral: whether the death was foreseen, the hospice choice and the service, and what happened. */
export interface LastDays {
  foreseen: boolean;
  hospice: HospiceChoice | null;
  service: ServiceStyle | null;
  /** The last days in a few lines (the choice, who was there, the letters, whether the wishes were carried out). */
  lines: string[];
  /** The chosen visitors who came. */
  bedside: FuneralGuest[];
}

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
  /** W1: the funeral. Null for a life set aside unfinished, and for lives archived before W1 (archive schema version 4). */
  funeral: Funeral | null;
  /** L1: the regrets and proud moments of the life (archive schema version 5). Null for a life set aside unfinished and for lives archived before L1. */
  review: LifeReview | null;
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
  /** P1: how they looked, to draw their portrait at the age they died. Absent for lives archived before portraits. */
  look?: Look;
}

export interface InputRecord {
  year: number;
  kind: 'create' | 'ageUp' | 'choice' | 'action' | 'interact' | 'interactChoice' | 'interactClose' | 'edit';
  /** e.g. { instanceId, choiceId }, { actionId, params }, or (E1) { interactionId, personId, giftTier? }, { choiceId }, {}; for an `edit` (G1, god mode), the normalized edit (src/engine/godmode). */
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
  /** B1: a romance interaction with someone who isn't attracted to you: they said no, kindly. */
  declined?: true;
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
  travel: TravelState;
  /** W6: applications, life without papers, remittances and the record of how you came to live where you do. */
  migration: MigrationState;
  languages: LanguageLearning;
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
  /** T1: the teen years: your school's crowds, your focus, the license, a teen job, house rules. */
  teen: TeenState;
  /** E6a: your crime career: the crew you are in, your rank and standing, the heat on you, and how it ended if you got out. */
  crime: CrimeState;
  /** E6b: your fame in arts and media: the path, rung, fame, image, fans, projects, agent, contract and awards. */
  fame: FameState;
  /** E6c: your sports career: sport, position, team, contract, seasons, injuries and the playoff run under way (the ladder, fame and fans are in `fame`). */
  sports: SportsState;
  /** Batch 6: the teams this life plays with (a snapshot of the player's team settings), and soccer's leagues. */
  league: LeagueState;
  /** L1: later life: care you need, a foreseen death and your final wishes, and the amends you have made. */
  later: LaterState;
  /** W2: belonging: your faith and values, the groups of your city and the ones you belong to. */
  belonging: BelongingState;
  /** W3: your businesses, the ones you have had, and what they paid or cost you this year. */
  business: BusinessState;
  /** Batch 2a: this year's activities (leisure and self): how many of each, and the receipts of the last few. */
  pastimes: PastimesState;
  /** Batch 8: your accounts on the platforms (Instagram, TikTok and the rest), this year's posts, what they earned and what has happened to them. */
  social: SocialState;
}

/** Batch 2a: what an activity did, as the Activities screen shows it: the words, the money and (as numbers the screen turns into words) the stats that moved. */
export interface PastimeReceipt {
  year: number;
  pastimeId: Id;
  tier: 'great' | 'good' | 'neutral' | 'bad' | 'backfire';
  /** What happened, already written (pronouns and amounts filled in). */
  text: string;
  /** Extra lines: a chance that came up (a complication, a stranger's number). */
  notes: string[];
  /** The money it cost, with the balance after (absent for a free activity). */
  money?: MoneyChange;
  /** Who came along. */
  companion?: { id: Id; name: string; affection: number };
  /** Stats that moved (after the activity's effects), by key. */
  changes: Partial<Record<'health' | 'happiness' | 'smarts' | 'looks' | 'fitness' | 'stress', number>>;
}

/** Batch 8: one account on a platform (src/content/platforms). Followers, engagement and the niche are real; the handle is what you typed. */
export interface SocialAccount {
  platform: Id;
  handle: string;
  niche: Id;
  followers: number;
  /** 0–100: how much of the audience answers. */
  engagement: number;
  since: number;
  private: boolean;
  /** You were under 18 when you opened it: a parent set it up and keeps an eye on it. */
  byParent: boolean;
  /** Posts, uploads, streams or episodes in all. */
  posts: number;
  /** 0–100: how good your posts have been lately. */
  quality: number;
  /** The year the platform began paying you (0 for not yet). */
  monetized: number;
  /** The platform pays nothing through this year (0 for no). */
  demonetized: number;
  /** Everything this account has earned you. */
  earned: number;
  /** The most followers it has had. */
  peak: number;
}

/** Batch 8: how the latest post did. */
export interface SocialPostResult {
  year: number;
  platform: Id;
  outcome: 'flat' | 'steady' | 'strong' | 'viral';
  gained: number;
  bold: boolean;
}

/** Batch 8: what you have done on your accounts this year (the year's budget and its diminishing returns). A new year starts from nothing. */
export interface SocialYear {
  year: number;
  /** Posts this year by platform, and the sum of their quality (for the average). */
  posts: Record<Id, number>;
  quality: Record<Id, number>;
  /** Bold posts this year, and posts that someone might see who was not meant to, by platform. */
  bold: number;
  risky: Record<Id, number>;
  /** Platforms where a post went viral. */
  viral: Id[];
  /** Cross-promotions (as 'from>to'), collaborations (the people), and promotions of your work (the platforms) this year. */
  crossed: string[];
  collabs: Id[];
  promoted: Id[];
}

/** Batch 8: what the platforms paid this year, set aside for the yearly ledger (the agent's cut and a minor's share in trust are taken off). */
export interface SocialIncome {
  year: number;
  gross: number;
  agent: number;
  trust: number;
  /** Gross by platform and by pay model. */
  byPlatform: Record<Id, number>;
  byModel: Record<Id, number>;
}

export interface SocialTotals {
  opened: number;
  posts: number;
  viral: number;
  algorithmUp: number;
  algorithmDown: number;
  demonetized: number;
  monetized: number;
  burnouts: number;
  controversies: number;
  cancellations: number;
  collabs: number;
  crossPromos: number;
  promos: number;
  sponsorships: number;
  /** Posts that reached someone who was not meant to see them, by who. */
  foundEmployer: number;
  foundPartner: number;
  foundEx: number;
  foundFamily: number;
  earned: number;
}

/** Batch 8: social media: your accounts (at most one a platform), this year's use of them and what has happened to them. */
export interface SocialState {
  accounts: Record<Id, SocialAccount>;
  year: SocialYear;
  income: SocialIncome;
  last?: SocialPostResult;
  /** The algorithm's mood on each platform for the year that has begun (up: it favours you; down: it does not). */
  algorithm: { year: number; shifts: Record<Id, 'up' | 'down'> };
  /** A row that is brewing, or that has blown up, on one platform. */
  controversy: { year: number; platform: Id; stage: 'brewing' | 'cancelled'; lost: Record<Id, number> } | null;
  /** What happened to your accounts as this year began (the social triggers: viral, demonetized...), for the events about it. */
  happened: { year: number; triggers: string[] };
  /** The platform and year an event this year is about (for {platform} and {handle}). */
  focus: { year: number; platform: Id } | null;
  /** Years in a row you used most of your budget. */
  streak: number;
  /** The last year you posted (for the fame step: a year of posting is a year of work). */
  workedYear: number;
  totals: SocialTotals;
}

/** Batch 2a: activities this year. A new year starts from nothing (counts of an earlier year are ignored). */
export interface PastimesState {
  year: number;
  /** How many times each activity was done this year. */
  counts: Record<Id, number>;
  /** The latest activities this year, newest last. */
  receipts: PastimeReceipt[];
}

/** W3: one owner of a business: you, an investor from your circle or a co-founder. */
export interface BusinessOwner {
  /** 'you', or the person (who may no longer be in your life: then only the name and the stake remain). */
  id: Id | 'you';
  name: string;
  /** Whole percent of the business; all owners together are 100. */
  share: number;
  /** What they put in (whole dollars) and the year. */
  put: number;
  year: number;
  /** What they have been paid out of profit so far. */
  paid: number;
  role: 'you' | 'investor' | 'cofounder';
}

/** W3: one place the business trades from, with its own city, style and last results. */
export interface BusinessLocation {
  id: Id;
  cityId: Id;
  style: BusinessStyle;
  /** The year it opened (or the year you took it over). */
  opened: number;
  result?: LocationResult;
  /** B2: units of each stock item (a goods line, or a service's supply pool) carried in from last year. */
  stock: Record<string, number>;
  /** B2: the units of each stock item the location wanted last year (the next order is forecast from it). */
  forecast: Record<string, number>;
  /** B2: the person who manages this location (a staff member with the manager role), if any. */
  manager?: Id;
}

/** B2: one product line's year at a location (units, whole dollars). */
export interface LineResult {
  productId: Id;
  /** Units wanted, sold and lost to an empty shelf (or empty supply pool); units spoiled. */
  demand: number;
  sold: number;
  lost: number;
  spoiled: number;
  revenue: number;
  /** Cost of what was sold. */
  cost: number;
}

/** B2: a product line a business sells: on or off, and at what price level. */
export interface BusinessLine {
  productId: Id;
  on: boolean;
  price: PriceLevel;
}

/** B2: the crew of one role at one location: counted, with an average skill and morale, and no identity. */
export interface CrewPool {
  locationId: Id;
  roleId: Id;
  count: number;
  skill: number;
  morale: number;
}

/** B2: a franchisee in another place: simulated in aggregate. */
export interface Franchise {
  id: Id;
  cityId: Id;
  style: BusinessStyle;
  /** Someone you know who runs it, or null for an operator you never meet. */
  personId: Id | null;
  /** The operator's skill (0–100). */
  skill: number;
  since: number;
  /** The one-off fee paid (whole dollars) and the royalty rate. */
  fee: number;
  royalty: number;
  /** Last year's revenue, royalty paid to you, support cost and the franchisee's own profit. */
  revenue: number;
  royaltyPaid: number;
  support: number;
  profit: number;
  /** Years of loss in a row. */
  lossYears: number;
  /** 0–100: the chance the brand is hurt by how it is run. */
  risk: number;
}

/** B2: what the last supplier news, event or trouble was about (read by event text). */
export interface BusinessFocus {
  productId?: Id | undefined;
  category?: Id | undefined;
  locationId?: Id | undefined;
}

/** W3: how one location did in the last business year (whole dollars). */
export interface LocationResult {
  year: number;
  demand: number;
  customers: number;
  revenue: number;
  rent: number;
  wages: number;
  supplies: number;
  other: number;
  profit: number;
  /** B2: supplies split into cost of goods, waste and holding; sales lost to empty shelves (at price); hiring and training; the lines. */
  goodsCost?: number;
  waste?: number;
  lostSales?: number;
  hiring?: number;
  training?: number;
  lines?: LineResult[];
}

/** W3: someone who works there, who is also a person in your life. */
export interface BusinessStaff {
  personId: Id;
  /** Where they work (a location id); a manager and a co-founder work across the business. */
  locationId: Id | null;
  title: string;
  /** 0–100, and how they feel about working there (0–100). */
  skill: number;
  morale: number;
  since: number;
  /** Holds the trade licence the business needs. */
  licensed: boolean;
  /** Their pay is the market wage times this (raises make it more). */
  raise: number;
  /** B2: the role they fill (an id from the kind's roles); a location manager has the manager role and a locationId. */
  roleId: Id;
  /** The manager, if this one is (the general manager of the business). */
  manager?: true;
  /** A manager's honesty (0–100); only a manager has one. */
  honesty?: number;
  /** Their yearly pay now (whole dollars; set as the year's costs are worked out). */
  wage: number;
}

/** W3: a stretch of good or bad trading from an event (a viral moment, a competitor next door). */
export interface BusinessShock {
  kind: 'buzz' | 'rival' | 'shortage' | 'deal';
  /** Multiplies demand until the year `until` (inclusive). A shortage: the share of an order that arrives. A deal: the cost multiple. */
  mult: number;
  until: number;
  /** B2: a shortage or a deal is about one supplier category. */
  category?: Id;
}

/** W3: a year's report for a business (whole dollars). */
export interface BusinessReport {
  year: number;
  customers: number;
  /** Customers the year before (0 in the first report). */
  customersBefore: number;
  demand: number;
  revenue: number;
  rent: number;
  wages: number;
  supplies: number;
  marketing: number;
  quality: number;
  other: number;
  /** Revenue less every cost above (before loan payments and tax). */
  profit: number;
  /** Payments due on the business's loans this year (paid with your own ledger). */
  loanPayments: number;
  /** What was paid to the owners out of profit, your share of it, and what you put in to cover a loss. */
  paidOut: number;
  draw: number;
  injected: number;
  cash: number;
  morale: number;
  reputation: number;
  qualityScore: number;
  /** Named staff who quit this year. */
  quit: number;
  /** Notes for the report: keys into text/business.yaml report.notes. */
  notes: string[];
  locations: LocationResult[];
  /** B2: cost of goods and waste (inside `supplies`), sales lost to empty shelves, hiring and training costs, royalties net of support (inside profit), crew who left, heads at the year's end, the economy that year, and the lines added up across locations. */
  goodsCost?: number;
  waste?: number;
  lostSales?: number;
  hiring?: number;
  training?: number;
  royalties?: number;
  support?: number;
  turnover?: number;
  heads?: number;
  economy?: string;
  lines?: LineResult[];
  /** Supplier categories whose index moved the most this year: [category, index]. */
  supplierMoves?: [Id, number][];
}

/** W3: a business you own (or own a share of). */
export interface Business {
  id: Id;
  /** The kind (src/content/businesses). */
  defId: Id;
  name: string;
  /** The city of its first location. */
  cityId: Id;
  style: BusinessStyle;
  founded: number;
  how: 'started' | 'bought' | 'inherited';
  /** The chain it was bought as (src/content/chains), if it was. */
  chainId?: Id;
  locations: BusinessLocation[];
  staff: BusinessStaff[];
  owners: BusinessOwner[];
  /** The yearly decisions. */
  prices: PriceLevel;
  marketing: MarketingLevel;
  qualityInvest: QualityLevel;
  pay: PayLevel;
  staffing: StaffingLevel;
  role: OwnerRole;
  /** 0–100. */
  quality: number;
  reputation: number;
  morale: number;
  /** Money in the business (whole dollars; never negative: a loss it cannot cover is put in by the owners). */
  cash: number;
  /** What the fit-out is worth (it wears out). */
  assets: number;
  /** The debts (ids in finances.debts) taken to start or buy it; they go with it when it is sold or inherited. */
  loanIds: Id[];
  /** Profit of the last few years, newest last. */
  profits: number[];
  /** Years of loss in a row. */
  lossYears: number;
  /** Money a dishonest manager has taken so far (whole dollars; the owner does not see it). */
  skimmed: number;
  /** The year the owner last audited the books. */
  auditedYear?: number;
  shocks: BusinessShock[];
  report: BusinessReport | null;
  /** B2: the lines it sells, with a price level each. */
  lines: BusinessLine[];
  /** B2: how heavily each stock item (a goods line or a supply pool) is ordered. */
  orders: Record<string, OrderLevel>;
  /** B2: the headcount you want at each location, by role. */
  headcount: Record<Id, Record<Id, number>>;
  /** B2: the crew, per location and role. */
  crew: CrewPool[];
  training: TrainingLevel;
  /** B2: the value of stock on the shelves, at cost (whole dollars). */
  stockValue: number;
  franchises: Franchise[];
  /** B2: what the latest news is about. */
  focus?: BusinessFocus | undefined;
}

/** W3: a business you used to own. */
export interface BusinessPast {
  name: string;
  defId: Id;
  style: BusinessStyle;
  cityId: Id;
  fromYear: number;
  toYear: number;
  end: 'sold' | 'closed' | 'failed' | 'passed';
  /** Profit over its years and the money you got or lost in the end (whole dollars). */
  totalProfit: number;
  net: number;
}

/** W3: your businesses. */
export interface BusinessState {
  items: Business[];
  nextBusiness: number;
  nextLocation: number;
  /** Listings you have bought (or that were taken) in the current market round: their ids. */
  taken: string[];
  past: BusinessPast[];
  /** The year each trigger last asked something of you. */
  offered: Record<string, number>;
  /** What the business step set aside for the ledger this year: draws paid to you (taxable income) and money you must put in. */
  year: { year: number; draw: number; inject: number };
  /** Years spent owning each kind of business (experience). */
  experience: Record<Id, number>;
  /** Your share of your businesses' value for net worth (whole dollars; see src/engine/business/value.ts). */
  worth: number;
}

/** W2: your faith: which (null: none), how strongly you believe, what you were raised in and when it last changed. */
export interface FaithState {
  id: Id | null;
  /** 0–100; 0 without a faith. */
  strength: number;
  /** The faith your household had (null: none). */
  raised: Id | null;
  /** The year your faith last changed (null: never). */
  since: number | null;
  /** How many times it has changed. */
  changes: number;
}

/** W2: one club, congregation or cause in a city, with traits of its own (0–100). */
export interface GroupInstance {
  id: Id;
  /** The kind of group (src/content/groups). */
  defId: Id;
  cityId: Id;
  name: string;
  welcome: number;
  strict: number;
  intense: number;
  /** The people in it you know, once you have joined (made once; see ensureMembers). */
  people: Id[];
}

/** W2: your place in a group. */
export interface Membership {
  groupId: Id;
  since: number;
  commitment: Commitment;
  /** Your role: an index into the kind's ladder (0 is a plain member). */
  rung: number;
  rungSince: number;
  /** How well regarded you are in it (0–100). */
  standing: number;
  /** Your family took you along as a child; it ends when you grow up unless you believe. */
  family?: true;
}

/** W2: a group you belonged to once. */
export interface PastMembership {
  groupId: Id;
  defId: Id;
  name: string;
  cityId: Id;
  fromYear: number;
  toYear: number;
  /** The highest role you held. */
  topRung: number;
  how: 'left' | 'moved' | 'drifted';
}

export interface BelongingState {
  /** The faith your family had when you were born (null: none) and how devout it was. */
  household: { faith: Id | null; devotion: number };
  faith: FaithState;
  /** Your values (0–100) and the temperament they settle back toward. */
  values: Record<ValueId, number>;
  temperament: Record<ValueId, number>;
  /** Every group of every city you have seen, by id; each city's are made the first time you are there. */
  groups: Record<Id, GroupInstance>;
  cities: Record<Id, Id[]>;
  memberships: Membership[];
  past: PastMembership[];
  nextGroup: number;
  /** Your standing in your city beyond any one group (0–100). */
  community: number;
  /** Reputation points not yet whole. */
  repCarry: number;
  /** The last year each offer (an invitation to a group, a role, a decision about drifting) was made, so none comes again soon. */
  offered: Record<string, number>;
  /** Set on a life saved before belonging existed: the first yearly step gives it a faith and values (from its seed), and clears this. */
  upgrade?: true;
}

/** L1: how late-life care is provided. */
export type CareOption = 'family' | 'paid' | 'assisted';

/** L1: care you need near the end: since when, how it is provided and, for family care, who provides it. */
export interface LateCare {
  since: number;
  option: CareOption | null;
  /** The year the current option began. */
  optionSince?: number;
  /** Family care: who provides it. */
  providerId?: Id;
  /** People who were asked to provide care and said no (they are not asked again). */
  declined: Id[];
}

/** L1: a chosen visitor, and whether they came to your bedside. */
export interface LastVisit {
  id: Id;
  came: boolean;
}

/** L1: a foreseen death: a diagnosis or a long decline, with your final wishes. */
export interface Terminal {
  since: number;
  /** What the death will be put down to (a cause in src/content/causes). */
  causeId: Id;
  /** The condition behind it, if there is one. */
  conditionId?: Id;
  hospice: HospiceChoice | null;
  service: ServiceStyle | null;
  /** Who you asked to speak at the funeral. */
  speakerId?: Id;
  /** People you wrote a last letter to. */
  letters: Id[];
  /** People you asked to be with you. */
  visitors: Id[];
  /** Who came, worked out when the last visit takes place (empty until then). */
  visits: LastVisit[];
  /** The year the final wishes were last set. */
  wishesYear?: number;
  /** The will prompt has been shown. */
  willPrompted?: true;
}

/** L1: one amends chance and what you did with it. */
export interface AmendsRecord {
  year: number;
  /** The source in registries/later.yaml. */
  source: string;
  personId?: Id;
  result: 'made' | 'declined' | 'refused';
}

export interface LaterState {
  care: LateCare | null;
  terminal: Terminal | null;
  amends: AmendsRecord[];
  /** The last year each amends chance (source and person) was offered, so none comes again soon. */
  offered: Record<string, number>;
}

/** E6a: the crew you are in (a definition in src/content/crews, made real for you). */
export interface CrimeCrew {
  defId: Id;
  /** The city it works in (yours when you joined). */
  cityId: Id;
  since: number;
  /** The people in it you know (not you): friends of yours, tied to one another. */
  members: Id[];
  /** The person who runs it, while you don't. */
  leader?: Id;
  /** The crew it is at odds with, and the people of it you have met. */
  rival?: Id;
  rivalMembers: Id[];
  /** A member who is talking to the police, if one is. */
  informant?: Id;
  /** Set while you live in another city: when you left, the standing you left with and what the crew suspects of you (0–100). */
  away?: { since: number; standing: number; suspicion: number };
  /** The year you came back to the crew's city (it is a story that year). */
  returned?: number;
}

/** E6a: a crew you were in once. */
export interface CrimePast {
  crewId: Id;
  fromYear: number;
  toYear: number;
  /** The highest rank you reached (1 to 5). */
  topRank: number;
  how: 'left' | 'pushed' | 'drifted' | 'deal' | 'moved';
}

export interface CrimeState {
  crew: CrimeCrew | null;
  /** Your rank in the crew (1 to 5, the crew leader); 0 without one. */
  rank: number;
  /** The highest rank you have held in this crew. */
  peak: number;
  /** The year you reached your rank. */
  rankSince: number;
  /** How much the crew thinks of you (0–100). */
  standing: number;
  /** Years in a row your standing was at the low line. */
  lowYears: number;
  /** Years in a row you lived too far from the crew. */
  awayYears: number;
  /** Police attention (0–100); it stays after you get out, and fades. */
  heat: number;
  /** How hot things are with the rival crew (0–100). */
  rivalry: number;
  /** An investigation into you, open from `since` until `until` unless refreshed or closed. */
  investigation?: { since: number; until: number };
  /** Jobs done in `year`, and in the year before it. */
  jobs: { year: number; count: number; last: number };
  /** Crews you left or lost, oldest first. */
  past: CrimePast[];
  /** What you launder this year, by business. */
  laundered: { year: number; byFront: Record<Id, number> };
  totals: {
    jobs: number;
    /** Dirty money jobs paid you. */
    earned: number;
    /** Dirty money turned into savings (after fees), and the fees paid. */
    cleaned: number;
    fees: number;
    /** Dirty money lost to a flagged deposit, a raid, a theft or an arrest. */
    lost: number;
    /** Dirty money spent. */
    spent: number;
    arrests: number;
    /** Years spent in a crew. */
    years: number;
  };
}

/** E6b: where you stand in one path (music, acting, social media, writing and art). */
export interface FamePathState {
  /** Your rung on the ladder (1 and up; the path's rungs say what each is called). */
  rung: number;
  /** The highest rung you have held. */
  peak: number;
  /** Fame in this path (0–100). It holds the rung, and fades without new work. */
  fame: number;
  /** How good you are at the work itself (0–100); it grows with years of practice. */
  craft: number;
  /** The year you started. */
  since: number;
  /** The last year you put out something new (or went on the road). */
  last: number;
  /** The best quality of your last few releases, for the gate to the next rung. */
  recent: number[];
  /** The year of your last big break (0 for none). */
  breakYear: number;
  /** Batch 4: the way in you took (a route of the path), when known. */
  route?: Id;
  /** Batch 4: your main genre (src/content/genres), once you have one. */
  genre?: Id;
  /** Batch 4: the skills you have practised here (0–100), by the path's skill id. */
  skills?: Record<Id, number>;
}

/** Batch 4: a bandmate: a person in your life, the part they play and how good they are at it. */
export interface BandMember {
  id: Id;
  /** The part they play (an instrument of the path, or the lead vocals). */
  part: Id;
  /** 0–100. */
  skill: number;
  since: number;
}

/** Batch 4: the band you are in. */
export interface BandState {
  name: string;
  /** The path it belongs to (music). */
  path: Id;
  /** Who leads it: you (you founded it, or took it over), or the member who does. */
  leader: 'you' | Id;
  /** The other members (never you). */
  members: BandMember[];
  /** The part you play. */
  part: Id;
  /** How well it works together (0–100). */
  chemistry: number;
  since: number;
  /** How you came to it: you formed it (auditions), it came with your way in, or you joined one. */
  how: 'formed' | 'route' | 'joined';
}

/** Batch 4: a band in your city that wants you (good until the next year begins). */
export interface BandOffer {
  name: string;
  genre: Id;
  /** How many members it has besides you, how good they are, and the part they want you for. */
  size: number;
  skill: number;
  part: Id;
  year: number;
}

/** Batch 4: a tour's size, by how far up the ladder you are. */
export type TourSize = 'local' | 'regional' | 'national' | 'world';

/** Batch 4: how a show went (the last one is shown on the Fame screen). */
export interface ShowResult {
  venue: Id;
  outcome: 'great' | 'good' | 'rough';
  /** What it pays (before the cuts), paid through the yearly ledger as the next year begins. */
  pay: number;
  fans: number;
  fame: number;
}

/** Batch 4: what you do between years toward the coming one: shows played, a tour booked and practice. */
export interface FameGrind {
  /** The year (between years: the year just ended) it belongs to. */
  year: number;
  shows: number;
  /** What the shows paid, before the cuts. */
  showPay: number;
  /** A tour booked for the year about to begin, with the path it is for and what it cost up front. */
  tour: { path: Id; size: TourSize; cost: number } | null;
  /** Practice sessions, in all and by skill. */
  practice: number;
  bySkill: Record<Id, number>;
  lastShow?: ShowResult;
}

/** E6b: how a release was made and what critics and fans made of it. */
export interface FameProject {
  year: number;
  path: Id;
  kind: Id;
  title: string;
  style: 'commercial' | 'artistic';
  risk: 'safe' | 'bold';
  tour: boolean;
  press: boolean;
  /** 0–100: the work itself, then what critics and what fans made of it. */
  quality: number;
  critics: number;
  fans: number;
  band: 'flop' | 'solid' | 'hit' | 'acclaimed' | 'cult' | 'crowd';
  /** Fame won (or lost), and what it earned before the cuts. */
  gain: number;
  earned: number;
  /** A company or agent picked it for you (a contract's yearly work). */
  assigned?: true;
  /** Batch 4: its genre, how far that sits from your sound (0 on it, 1 as far as can be), the track titles you gave it, and the band that made it. */
  genre?: Id;
  offGenre?: number;
  tracks?: string[];
  bandName?: string;
}

/** E6b: a project lined up for the coming year, with its creative choices. Batch 4: a tour is booked on its own (FameGrind), not on a project. */
export interface FamePlan {
  path: Id;
  kind: Id;
  style: 'commercial' | 'artistic';
  risk: 'safe' | 'bold';
  press: boolean;
  /** Batch 4: the genre (music), the title you typed (left out: one is suggested), and track titles (optional). */
  genre?: Id;
  title?: string;
  tracks?: string[];
}

export interface FameContract {
  company: Id;
  path: Id;
  since: number;
  /** The last year it runs. */
  until: number;
  advance: number;
  /** The share of what the work earns that the company keeps (0–1). */
  share: number;
  terms: 'standard' | 'tough' | 'generous';
  /** You can't work for anyone else, or cross over, while it runs. */
  exclusive: boolean;
  /** A parent signed it (you are under 18). */
  byParent: boolean;
}

export interface FameAward {
  awardId: Id;
  year: number;
  path: Id;
  project: string;
  won: boolean;
}

/** E6b: what your fame has brought of its own accord this year, to be paid by the yearly ledger. */
export interface FameIncome {
  year: number;
  /** What the work earned, before the cuts (an advance counts the year it is signed). */
  gross: number;
  /** The agent's cut and the company's share. */
  agent: number;
  company: number;
  /** A minor's share held in trust by a parent. */
  trust: number;
  /** What the scene (your lifestyle) costs this year, charged with your living costs. */
  scene: number;
  /** Batch 4: what this year's tour cost to put on (crew, travel, the van), charged with your living costs. */
  tour: number;
}

export interface FameState {
  /** You have a career in at least one path (even a faded one); false before you start and after you retire. */
  active: boolean;
  /** The year you retired from it. */
  retired?: number;
  main: Id | null;
  second: Id | null;
  paths: Record<Id, FamePathState>;
  /** How the public sees you (0–100, 50 is neutral). */
  image: number;
  fans: number;
  /** How fans feel about you now (0–100): below 30 they have turned, above 60 they are devoted. */
  mood: number;
  burnout: number;
  commitment: 'back' | 'steady' | 'all';
  scene: 'low' | 'social' | 'entourage' | 'lavish';
  agent: { agentId: Id; since: number } | null;
  contract: FameContract | null;
  plan: FamePlan | null;
  /** Your latest releases, newest last (a dozen are kept). */
  projects: FameProject[];
  awards: FameAward[];
  /** A nomination waiting for its awards night (the year it is held). */
  nominated?: { awardId: Id; project: string; due: number; score: number };
  /** An awards night this year, and how it went. */
  ceremony?: { year: number; awardId: Id; project: string; result: 'won' | 'lost' };
  /** Superfans, haters and critics: people in your life who came to you through your work. */
  people: { super: Id[]; hater: Id[]; critic: Id[] };
  stalker: { id: Id; since: number; stage: 'watching' | 'reported' | 'ordered' | 'charged' } | null;
  /** The tabloid headlines of the last few years, newest last. */
  headlines: { year: number; text: string; kind: string }[];
  income: FameIncome;
  /** The rung you stood on before your fame faded (for a comeback). */
  fadedFrom?: number;
  /** Batch 4: your band (null for a solo act), the bands you were in before, and offers from bands in your city. */
  band: BandState | null;
  pastBands: { name: string; from: number; to: number; how: 'left' | 'solo' | 'split' }[];
  offers: BandOffer[];
  /** Batch 4: the instrument you play (an instrument of your main path), once chosen. */
  instrument: Id | null;
  /** Batch 4: shows, a tour and practice between years; and what was played going into this year. */
  grind: FameGrind;
  played: { year: number; shows: number; tour: TourSize | null; lastShow?: ShowResult };
  /** Batch 4: the best-received thing you ever put out (for your life summaries). */
  best?: { title: string; path: Id; kind: Id; year: number; score: number; bandName?: string };
  totals: {
    projects: number;
    hits: number;
    flops: number;
    breaks: number;
    fades: number;
    comebacks: number;
    nominations: number;
    wins: number;
    scandals: number;
    tours: number;
    burnouts: number;
    crossovers: number;
    stalkers: number;
    earned: number;
    /** Batch 4: shows played, practice sessions, bands formed and joined, splits, members who came or went, and changes of main genre. */
    shows: number;
    practice: number;
    bandsFormed: number;
    bandsJoined: number;
    bandSplits: number;
    memberChanges: number;
    genreSwitches: number;
    offGenre: number;
  };
}

/** E6c: the team you play for. Pro teams are in the league's definition (`id`); an amateur team is a school or a city's club, named when you joined it. */
export interface SportsTeam {
  id: Id | null;
  name: string;
  city: Id;
  level: 'youth' | 'school' | 'college' | 'pro';
  /** 0–100. */
  quality: number;
  /** Batch 5: the kind of amateur team it is (a pro team has none). */
  tier?: 'rec' | 'club' | 'travel' | 'academy' | 'jv' | 'varsity' | 'community' | 'state' | 'elite';
  /** Batch 6: where the team plays, in words, when that is not the city you live in (a city or a country the game does not model yet). */
  place?: string;
  /** Batch 6: how far from home the team plays: in a city nearby that the game does not model, or in another country. You live in the nearest modeled city. */
  away?: 'city' | 'country';
  /** Batch 6: the league a soccer club plays in (1 is the top league). */
  division?: 1 | 2;
  /** Batch 6: the country a club plays in when the game does not model it. */
  country?: 'es' | 'it' | 'de' | 'fr';
}

export interface SportsContract {
  teamId: Id;
  since: number;
  /** The last year it runs. */
  until: number;
  /** Whole dollars a year, paid through the yearly ledger as fame income. */
  salary: number;
  kind: 'minimum' | 'rookie' | 'standard' | 'star';
  option: 'none' | 'team' | 'player';
  /** Batch 5: the most a year of play can add in incentives (paid by how well you played; 0 or missing for none). */
  incentive?: number;
  /** Batch 6 (soccer): the sum a club can pay to take you without your club's say (missing for none). */
  release?: number;
}

/** E6c: one season as it went: the team, your rating and numbers, the record and how the playoffs ended. */
export interface SportsSeason {
  year: number;
  sport: Id;
  level: 'youth' | 'school' | 'college' | 'pro';
  team: string;
  position: Id;
  /** 0–100. */
  rating: number;
  /** The share of the games you played (0–100); an injury or a suspension takes some. */
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** Where the team finished among `of` teams. */
  rank: number;
  of: number;
  result: 'missed' | 'out' | 'final' | 'champion';
  stats: Record<Id, number>;
  salary: number;
  allStar: boolean;
  injury?: Id;
  /** Batch 6: the league the club played in (soccer's two leagues), and whether you played the season on loan. */
  division?: 1 | 2;
  loan?: boolean;
}

/** E6c: a playoff run in progress: `won` series won of three; `alive` until you lose one. */
export interface SportsRun {
  year: number;
  won: number;
  alive: boolean;
  /** Your side's strength this year and the typical opponent's. */
  strength: number;
  rival: number;
}

/** E6c: how the draft went for you, the year you declared. `pick` is 0 for undrafted. */
export interface SportsDraft {
  year: number;
  pick: number;
  round: number;
  teamId: Id | null;
  /** Batch 6: the offer is your academy's first-team contract (a graduate), not a draft pick. */
  academy?: true;
}

export interface SportsTotals {
  seasons: number;
  proSeasons: number;
  playoffs: number;
  finals: number;
  titles: number;
  allStars: number;
  injuries: number;
  serious: number;
  playedThrough: number;
  trades: number;
  releases: number;
  suspensions: number;
  /** Salary and bonuses paid by teams, before the agent's cut and tax. */
  earned: number;
  bestRating: number;
  /** Batch 5: tryouts taken and made, scholarships won and lost, training sessions by where they happened, and undrafted or unsigned players who later signed. */
  tryouts: number;
  tryoutsMade: number;
  scholarships: number;
  scholarshipsLost: number;
  trainedTeam: number;
  trainedGym: number;
  trainedCoach: number;
  signedAfterUndrafted: number;
  /** Batch 6: loans taken, transfers made, the fees those moved (base units; the fee is the clubs', your cut is paid through the ledger), academy graduates, moves to another country, caps for the national side, tournaments played and won, and the league moves of your clubs. */
  loans: number;
  transfers: number;
  fees: number;
  graduates: number;
  abroad: number;
  caps: number;
  tournaments: number;
  tournamentTitles: number;
  goneUp: number;
  goneDown: number;
}

/** Batch 5: a tryout you have chosen and are about to play (the scrimmage is an event; its choice decides how you play it). */
export interface SportsTryout {
  /** The sport (a fame path); the key of the team (see `teamOptions`). */
  sport: Id;
  key: string;
  year: number;
}

/** Batch 5: how a tryout went. `landed` is the key of the team you ended up on (the one you tried for, a fallback, or null for none). */
export interface SportsTryoutRecord {
  year: number;
  key: string;
  /** The team tried for, and the team you ended up on (a fallback), as named. */
  name: string;
  landedName: string | null;
  level: 'youth' | 'school' | 'college' | 'pro';
  made: boolean;
  landed: string | null;
  /** Rating going in against the team's bar. */
  rating: number;
  bar: number;
}

/** Batch 5: this year's training: where the sessions happened and what they cost. */
export interface SportsTraining {
  year: number;
  team: number;
  gym: number;
  coach: number;
  /** A gym membership has been paid for this year. */
  member: boolean;
  spent: number;
}

/** Batch 5: a college program's offer of an athletic scholarship (good through the year after `year`). */
export interface SportsOffer {
  year: number;
  tier: 'community' | 'state' | 'elite';
  /** The share of tuition it pays (0–1). */
  share: number;
}

/** Batch 5: an athletic scholarship you hold: the program, its share of tuition and where your eligibility stands. */
export interface SportsScholarship {
  tier: 'community' | 'state' | 'elite';
  share: number;
  /** The year you accepted. */
  since: number;
  /** Years in a row under the grade floor (one is a warning; the next loses it). */
  warned: number;
}

/** Batch 6: a club's offer in the transfer window. */
export interface TransferOffer {
  id: string;
  clubId: Id;
  /** The fee between the clubs, whole base dollars (not yours: your share is paid as a signing-on payment). */
  fee: number;
  /** The yearly wage on offer, whole base dollars. */
  wage: number;
  years: number;
  /** The release clause the new deal would carry (0 for none). */
  clause: number;
}

/** Batch 6: the academy of a club you belong to. */
export interface SportsAcademy {
  clubId: Id;
  since: number;
  /** The club is in a country the game does not model, or another country than yours (a trial abroad). */
  abroad: boolean;
}

/** Batch 6: a season at another club: the club that holds your contract (`parentId`) decides. */
export interface SportsLoan {
  parentId: Id;
  hostId: Id;
  since: number;
  /** The last year of the loan. */
  until: number;
}

export interface SportsState {
  /** The sport (a fame path) you play, or last played. */
  sport: Id | null;
  position: Id | null;
  /** You have been drafted or signed by a pro team (and not left the pro game). */
  pro: boolean;
  team: SportsTeam | null;
  contract: SportsContract | null;
  /** Years in a row without a team since the last one let you go. */
  unsigned: number;
  focus: 'skills' | 'conditioning' | 'film';
  /** Points of form from events, spent by the next season. */
  form: number;
  /** You are playing through an injury; next year's risk is higher. */
  pain: boolean;
  /** You rested an injury this year. */
  rest: boolean;
  /** You asked for a trade (a transfer, in soccer), a new deal or (soccer) a loan through your agent or your club. */
  ask: 'trade' | 'contract' | 'loan' | null;
  /** You are playing out your contract to test free agency. */
  playOut: boolean;
  seasons: SportsSeason[];
  run: SportsRun | null;
  draft: SportsDraft | null;
  /** The year you were suspended for (0 for never), traded, released, or aged out of a level. */
  suspended: number;
  traded: number;
  released: number;
  agedOut: number;
  retired?: { year: number; route: 'coaching' | 'broadcast' | 'normal' | null };
  totals: SportsTotals;
  /** Batch 5: the tryout you chose and have not played yet. */
  tryout: SportsTryout | null;
  /** The last ten tryouts. */
  tried: SportsTryoutRecord[];
  /** Teams (by key) that cut you, with the year: a team will not look at you again for a while. */
  cut: Record<string, number>;
  /** You left your team (or lost your place), so none is found for you until you try out. */
  teamless: boolean;
  /** A club or travel team you play for alongside a school team (youth only). */
  club: SportsTeam | null;
  training: SportsTraining;
  offers: SportsOffer[];
  scholarship: SportsScholarship | null;
  /** Points from combine and pre-draft events, spent at the draft. */
  combine: number;
  /** The last year the draft passed you by (0 for never). */
  passed: number;
  /** Your place on the team: a starter, in the rotation or a reserve. */
  role: 'starter' | 'rotation' | 'reserve';
  /** Your jersey number (null until you pick one) and whether you are the captain. */
  number: number | null;
  captain: boolean;
  /** Batch 6 (soccer): the academy you belong to, the loan you are on, the transfer window's offers, and the year the national side last called you up (0 for never). */
  academy: SportsAcademy | null;
  loan: SportsLoan | null;
  /** Your club wants to send you on loan to this club (you have not answered). */
  loanOffer: { hostId: Id; year: number } | null;
  transfer: { year: number; offers: TransferOffer[] } | null;
  calledUp: number;
  /** The year an academy let you go (0 for never). */
  academyOut: number;
  /** The year you moved to another country for a club (0 for never), and the year (and way) your club last moved between leagues. */
  abroadYear: number;
  moved: { year: number; dir: 'up' | 'down' } | null;
}

/** Batch 6: the teams the life plays with. `setup` is the snapshot of the player's team settings the life began with (renames are in it for good); `pending` is a change taken up from `applyYear`; `tiers` holds the league of each soccer club that is not in the one it started in. */
export interface LeagueState {
  setup: TeamSetup;
  pending: { applyYear: number; moved: Record<Id, Id>; added: AddedTeam[] } | null;
  tiers: Record<Id, 1 | 2>;
  /** The last year the leagues were settled (clubs promoted and relegated). */
  tierYear: number;
}

/** T1: a social group at your school (a definition in src/content/cliques, made real for one school). */
export interface TeenClique {
  /** k1, k2... (the next number is `TeenState.nextClique`). */
  id: Id;
  defId: Id;
  /** The classmates it has brought into your life, once you have met the crowd. */
  members: Id[];
  /** How much the crowd counts at school (0–100). */
  standing: number;
  /** The crowd it is at odds with at this school, if any (the same both ways). */
  rival?: Id;
}

/** T1: the school the crowds belong to. Moving city, or starting high school, is a new school. */
export interface TeenSchool {
  /** `${cityId}:${program}`. */
  key: string;
  cityId: Id;
  program: 'middle' | 'high';
  since: number;
}

/** T1: one house rule: set by a parent you live with, at one of three levels (0 relaxed, 1 usual, 2 strict). */
export interface TeenRule {
  ruleId: RuleDomainId;
  /** The parent (or guardian) who set it. */
  by: Id;
  level: 0 | 1 | 2;
  since: number;
  /** The last year you asked to change it. */
  negotiated?: number;
  /** Times you have broken it (and, of those, been caught). */
  broken: number;
  caught: number;
}

/** T1: what a parent did when they caught you; a year at a time. */
export interface TeenPenalty {
  kind: 'grounded' | 'privilege';
  /** The last year it lasts. */
  until: number;
  /** A lost privilege: the rule's domain it took away. */
  domain?: RuleDomainId;
}

export type LicenseStage = 'none' | 'permit' | 'licensed';

/** T1: everything the teen years add to a life. Empty (and mostly idle) outside them. */
export interface TeenState {
  school: TeenSchool | null;
  cliques: TeenClique[];
  nextClique: number;
  /** The crowd you belong to. `rank` is your place in it (0–100). */
  member: { cliqueId: Id; since: number; rank: number } | null;
  /** Crowds that turned you away (or that you left), by crowd id, with the year; they won't have you again for a while. */
  turnedAway: Record<Id, number>;
  /** A crowd that has noticed you and would have you. */
  invite?: Id;
  /** A clash with another crowd: whose, since when, and the last year it lasts unless it is settled. */
  clash?: { cliqueId: Id; since: number; until: number };
  /** Your standing at school (0–100). */
  standing: number;
  /** Where your energy goes this year (chosen between years); a year with none chosen is an even one. */
  focus: { year: number; id: TeenFocusId } | null;
  /** Years spent on each focus. */
  focusYears: Record<TeenFocusId, number>;
  /** How far a passion has taken you (0–100); it fades without attention. */
  passion: number;
  license: { stage: LicenseStage; since?: number; lessons: number; fails: number; testYear?: number };
  /** Your teen job, if you have one (src/content/teenJobs). */
  job: { jobId: Id; employer: string; since: number } | null;
  /** Teams and clubs you belong to (src/content/activities). */
  activities: { id: Id; since: number; /** Batch 5: a school sports team is varsity or junior varsity. */ tier?: 'jv' | 'varsity' }[];
  /** The rules at home: each parent's style (worked out once from who they are), and the rules they set. */
  home: { styles: Record<Id, ParentingStyle>; rules: TeenRule[]; year: number } | null;
  /** Punishments in force. */
  penalties: TeenPenalty[];
  /** The last time you were caught breaking a rule (the year, the rule and who caught you); it waits for its event. */
  caught?: { year: number; ruleId: RuleDomainId; by: Id };
  /** Totals over the teen years, for the life summary and the simulation. */
  totals: { broken: number; caught: number; negotiated: number; won: number };
  /** How many entries of the criminal record the teen step has already looked at (a new juvenile case is answered once). */
  seenRecords: number;
  /** The juvenile record was sealed at 18 (set once). */
  sealed?: true;
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
