/**
 * Simulation runner: plays many random lives with random choices (and a
 * simple player model for relationship actions, and from Stage 6 for money
 * and home actions) and reports invariant failures, lifespans, events per
 * year, how often each event fired, marriage and divorce rates, savings,
 * debt and net worth over lifetimes, (Stage 7) education outcomes by
 * family wealth and GPA, and (Stage 8) income by education path,
 * promotion, firing and layoff rates, and how far people get in each job
 * track, all against src/content/balance/targets.yaml; and (Stage 9) health
 * conditions and causes of death, doctor visits, criminal records, prison and
 * probation, and self-discovery (what surfaced, was accepted or pushed down),
 * against the Stage 9 targets in the same file. From Stage 9 the careful
 * player picks event choices by personality (./bot.ts); the careless one
 * picks at random. Later stages add their own reports.
 */
import { ACTION_IDS, DISCOVERY_KINDS, type ActionId, type ContentBundle, type DiscoveryKind, type Effect } from '../../src/content/schemas';
import { hasLatent } from '../../src/engine/discovery';
import { canAffordGift } from '../../src/engine/interactions/links';
import { isInteractionAvailable } from '../../src/engine/interactions/availability';
import { closeInteraction, performInteraction } from '../../src/engine/interactions/perform';
import { replayLife } from '../../src/engine/replay';
import { isDeepStrictEqual } from 'node:util';
import {
  finishAction,
  isActionAvailable,
  isLifeActionAvailable,
  LIFE_ACTION_IDS,
  performAction,
  type LifeActionId,
  type LifeActionParams,
} from '../../src/engine/actions';
import { playAction, resolveAll, type ChoicePicker } from '../../src/engine/autoplay';
import { netWorth, totalDebt } from '../../src/engine/finance';
import { checkInvariants } from '../../src/engine/invariants';
import { beginYear, createLife, endYear } from '../../src/engine/life';
import { isFamilyKind, isPartnerKind } from '../../src/engine/relationships';
import { createRng, pick } from '../../src/engine/rng';
import type { FamilyWealth, LifeStage, LifeState, RecordOutcome } from '../../src/engine/types';
import {
  chooseActions,
  chooseCarelessActions,
  chooseCarelessLifeActions,
  chooseCareerActions,
  chooseHealthActions,
  chooseMentalActions,
  rollMentalProfile,
  chooseMoneyActions,
  choiceTraits,
  personalityChoice,
  chooseSchoolActions,
  rollMoneyProfile,
} from './bot';
import { referencesIn } from '../../src/engine/conditions';
import {
  chooseInteractions,
  emptyInteractionReport,
  formatInteractions,
  InteractionWatcher,
  playInteraction,
  type InteractionPlayer,
  type InteractionReport,
} from './interactions';
import { chooseWillActions, rollWillProfile } from './heirs';
import { emptyPeopleReport, formatPeople, peopleTargets, PeopleWatcher, PipelineTimer, type PeopleReport } from './people';
import { emptyMentalReport, formatMental, mentalTargets, MentalWatcher, type MentalReport } from './mental';
import { choosePetInteractions, choosePossessionActions, emptyPossessionsReport, formatPossessions, possessionsTargets, PossessionsWatcher, rollPossessionProfile, type PossessionsReport } from './possessions';
import { emptyWebReport, formatWeb, webTargets, WebWatcher, type WebReport } from './web';
import { chooseCrimeActions, CrimeWatcher, crimeTargets, emptyCrimeReport, formatCrime, type CrimeReport } from './crime';
import { chooseFameActions, emptyFameReport, FameWatcher, fameTargets, formatFame, rollStarProfile, type FameReport } from './fame';
import { peakRung } from '../../src/engine/fame/query';
import { chooseSportsActions, emptySportsReport, formatSports, rollAthleteProfile, SportsWatcher, sportsTargets, type SportsReport } from './sports';
import { chooseTeenActions, emptyTeenReport, formatTeen, rollTeenProfile, teenTargets, TeenWatcher, type TeenReport } from './teen';
import { YEAR_PIPELINE } from '../../src/engine/pipeline';
import { chooseFamilyActions, chooseParentingPlans, emptyFamilyReport, FamilyWatcher, formatFamily, familyTargets, rollFamilyProfile, type FamilyReport } from './family';

/** One life in this many is rebuilt from its input log and compared with the life as played (E1). */
const REPLAY_EVERY = 100;

export interface SimulationOptions {
  lives: number;
  /** Seeds are `${seedPrefix}-${i}`. */
  seedPrefix: string;
  /** Stops collecting invariant failure messages past this many (they are still counted). */
  maxFailureMessages?: number;
  /**
   * The simulated player: 'careful' (the player model in ./bot.ts, the one
   * the targets are judged on), 'careless' (random actions, no caution
   * rules), or (E1) 'spammer': a careful player who also repeats one
   * interaction with one person over and over, every year. Defaults to careful.
   */
  player?: SimulatedPlayer;
  /**
   * Called with each life just after a year begins (its events picked), and
   * with each life once it has ended: the content coverage report
   * (tools/coverage.ts) watches lives through these.
   */
  onYear?: (life: LifeState) => void;
  onLife?: (life: LifeState) => void;
  /**
   * E2b: lives to play instead of new ones (the heirs of the generation before): `lives` is how
   * many there are, and each is played with the usual player model, seeded by its own seed.
   */
  starts?: readonly LifeState[];
}

export type SimulatedPlayer = 'careful' | 'careless' | 'spammer' | 'criminal' | 'star' | 'athlete';

export interface StageYears {
  years: number;
  events: number;
  /** Years with fewer events than the stage's minimum (not enough events fitted). */
  belowMin: number;
  /** Most events in any one year of this stage. */
  most: number;
}

export interface SimulationReport {
  lives: number;
  player: SimulatedPlayer;
  invariantFailures: number;
  failureMessages: string[];
  lifespan: { median: number; p10: number; p90: number; youngest: number; oldest: number; under18: number };
  eventsPerYear: Record<LifeStage, StageYears>;
  /** Years with more events than the cap (must be zero). */
  yearsOverCap: number;
  /** Per event: times fired, share of all events fired, and lives it fired in. */
  events: { id: string; fired: number; share: number; lives: number }[];
  totalEventsFired: number;
  deathsFromEvents: number;
  relationships: RelationshipReport;
  money: MoneyReport;
  education: EducationReport;
  careers: CareerReport;
  health: HealthReport;
  legal: LegalReport;
  discovery: DiscoveryReport;
  consistency: ConsistencyReport;
  /** E1: the interaction menu, measured. */
  interactions: InteractionReport;
  /** E2a: children and parenting, measured. */
  family: FamilyReport;
  /** E3: the lives of the people you know, measured. */
  people: PeopleReport;
  /** E4: the social web, measured. */
  web: WebReport;
  /** M1: mental health, measured. */
  mental: MentalReport;
  /** E5: pets, vehicles and homes, measured. */
  possessions: PossessionsReport;
  /** T1: the teen years, measured. */
  teen: TeenReport;
  /** E6a: crime careers, measured. */
  crime: CrimeReport;
  /** E6b: fame in arts and media, measured. */
  fame: FameReport;
  /** E6c: sports, measured. */
  sports: SportsReport;
}

/** C1: the consistency pass, measured. */
export interface ConsistencyReport {
  /** Invariant failures from the consistency rules (category contracts, presence). */
  violations: number;
  /** Each life's average Happiness over its years, across lives. */
  happiness: { mean: number; median: number; p10: number; p90: number };
  /**
   * Per life, the share of the events fired (each year's events) that repeat
   * an event the life already had and that isn't recurring (isRecurring);
   * mean and 90th percentile across lives. top: the events that repeat most.
   */
  repeats: { mean: number; p90: number; top: { id: string; repeats: number }[] };
}

/**
 * C1: an event meant to come back: marked recurring, or answering something
 * that can happen again: your own actions (asking someone out, asking for a
 * raise) or a system trigger (money trouble, the law, self-discovery, a
 * doctor visit).
 */
export function recurringEvents(content: ContentBundle): Set<string> {
  const r = content.registries;
  return new Set([
    ...Object.values(content.events).filter((def) => def.recurring).map((def) => def.id),
    ...Object.values(r.actions.actions).flatMap((a) => a.events),
    ...Object.values(r.work.results).flatMap((w) => w.events),
    ...Object.values(r.triggers.triggers).flatMap((t) => t.events),
    ...Object.values(r.health.doctor).flatMap((t) => t.events),
    ...Object.values(r.mental.therapist).flatMap((t) => t.events),
    ...Object.values(r.legal.triggers).flatMap((t) => t.events),
    ...Object.values(r.discovery.surfacing).flatMap((t) => t.events),
    ...Object.values(r.discovery.resurfacing).flatMap((t) => t.events),
    ...r.discovery.crisis.events,
    ...r.discovery.comingOut.events,
  ]);
}

/** Health (Stage 9): who got each condition, who was treated, what killed people. */
export interface HealthReport {
  /** Per condition: lives that ever had it, were treated for it, and died of its cause while having it. */
  conditions: { id: string; lives: number; treated: number; diedOf: number }[];
  /** Causes of death across all lives. */
  causes: { id: string; lives: number }[];
  doctorVisits: number;
  /** Lives that ever saw a doctor. */
  sawDoctor: number;
  /** Lives that reached 65 with medical debt, and the median of it among them. */
  medicalDebtAt65: { reached: number; owing: number; median: number };
}

/** The law (Stage 9). */
export interface LegalReport {
  /** Per offense: lives with it on their record. */
  offenses: { id: string; lives: number }[];
  /** Record entries by outcome, across all lives. */
  outcomes: Record<RecordOutcome, number>;
  /** Lives with any record, any conviction (not just warnings), probation, prison. */
  recordLives: number;
  convictedLives: number;
  probationLives: number;
  jailedLives: number;
  /** Years spent in prison across all lives (year-starts inside), and the longest single life's total. */
  yearsInside: number;
  mostYearsInside: number;
  /** Lives released from prison, and of them, those who were sentenced again after release. */
  released: number;
  reoffended: number;
  /**
   * Choices that can put an offense on your record (a legal effect): the
   * events that offer one, how many times a card offered one, and how many
   * times one was taken.
   */
  illegalChoices: { events: string[]; offered: number; taken: number };
}

/** Self-discovery (Stage 9), per kind. */
export interface DiscoveryReport {
  kinds: Record<
    DiscoveryKind,
    {
      /** Lives born with the latent trait (or a hidden talent). */
      latent: number;
      /** Lives in which it surfaced at least once. */
      surfaced: number;
      /** Lives that accepted it (or found the talent). */
      accepted: number;
      /** Lives in which it came back after being pushed down. */
      resurfaced: number;
      /** Lives that died knowing it and holding it back. */
      heldBack: number;
    }
  >;
  crisisLives: number;
  comingOutLives: number;
  /** Lives whose identity changed through self-discovery (a history entry). */
  identityChanged: number;
  /** Inner conflict at death: median, and the share of lives above 50. */
  innerConflictAtDeath: { median: number; above50: number };
}

/** What one life did with its health, the law and self-discovery, watched step by step. */
class Stage9Watcher {
  readonly conditions = new Set<string>();
  readonly treated = new Set<string>();
  readonly surfaced = new Set<DiscoveryKind>();
  readonly resurfaced = new Set<DiscoveryKind>();
  readonly latentAtBirth = new Set<DiscoveryKind>();
  yearsInside = 0;
  sawDoctor = false;
  medicalDebtAt65: number | null = null;
  private lastInsideYear = -1;
  private started = false;

  observe(life: LifeState): void {
    if (!this.started) {
      this.started = true;
      for (const k of DISCOVERY_KINDS) if (hasLatent(life, k)) this.latentAtBirth.add(k);
    }
    for (const c of life.health.conditions) {
      this.conditions.add(c.conditionId);
      if (c.treated) this.treated.add(c.conditionId);
    }
    if (life.health.lastVisit !== undefined) this.sawDoctor = true;
    if (life.phase === 'yearStart' && life.housing.kind === 'incarcerated' && life.currentYear !== this.lastInsideYear) {
      this.lastInsideYear = life.currentYear;
      this.yearsInside++;
    }
    for (const [kind, entry] of Object.entries(life.discovery.surfaced) as [DiscoveryKind, { times: number } | undefined][]) {
      if (!entry) continue;
      this.surfaced.add(kind);
      if (entry.times > 1) this.resurfaced.add(kind);
    }
    if (life.phase === 'yearStart' && life.character.age === 65) {
      this.medicalDebtAt65 = life.finances.debts.filter((d) => d.kind === 'medical').reduce((sum, d) => sum + d.balance, 0);
    }
  }
}

/** How far education went, for income by education path. */
export const EDUCATION_PATHS = ['none', 'highSchool', 'trade', 'associate', 'bachelor', 'grad'] as const;
export type EducationPath = (typeof EDUCATION_PATHS)[number];

/** The furthest a life's education went (a grad degree beats a bachelor's, which beats an associate degree...). */
export function educationPath(life: LifeState): EducationPath {
  const types = new Set(life.education.credentials.map((c) => c.type));
  if (types.has('grad')) return 'grad';
  if (types.has('bachelor')) return 'bachelor';
  if (types.has('associate')) return 'associate';
  if (types.has('trade_license')) return 'trade';
  if (types.has('hs_diploma') || types.has('ged')) return 'highSchool';
  return 'none';
}

/** Lifetime earned income (salaries and gig pay, before tax) across a group of lives. */
export interface EarningsRow {
  lives: number;
  mean: number;
  p10: number;
  median: number;
  p90: number;
}

export interface CareerReport {
  /** Lives that reached targets.careers.earningsAge: lifetime earnings by education path. */
  earningsByPath: Record<EducationPath, EarningsRow>;
  /** Lives with a bachelor's degree (including those who went on to grad school) and those whose education stopped at high school. */
  bachelorVsHighSchool: { bachelorMean: number; highSchoolMean: number; ratio: number; bachelorBelowHighSchoolMedian: number };
  /** Years someone was paid a salary, and what happened at the yearly reviews in them. */
  jobYears: number;
  promotions: number;
  firings: number;
  layoffs: number;
  raisesAsked: { asked: number; got: number };
  applications: { tried: number; hired: number };
  /** Adults (that reached the independence age) who ever had a job, were ever fired, ever laid off, ever retired. */
  adults: number;
  everEmployed: number;
  everFired: number;
  everLaidOff: number;
  retired: number;
  /** Working-age years (from the independence age to 64, not in school, not retired) with no job and no gig work. */
  idleYears: { years: number; idle: number };
  /** Per job track: lives that entered it, reached its second level, reached its top, and years worked in it. */
  tracks: { jobId: string; entered: number; reachedLevel2: number; reachedTop: number; years: number }[];
  /** Lives that reached adulthood that ever filed for bankruptcy; lives that reached targets.money.homeOwnershipAge and owned a home by then. */
  bankrupt: { adults: number; bankrupt: number; neverWorked: number; neverWorkedBankrupt: number };
  /** Lives whose careful player was set on trade school. */
  tradeMinded: number;
  /** Per trade: lives that started trade school for it, earned its license, and worked in a job track that needs that license. */
  trades: { tradeId: string; enrolled: number; licensed: number; worked: number; jobIds: string[] }[];
  homeOwners: { reached: number; owned: number };
}

/** What one life did at work, watched step by step. */
class CareerWatcher {
  earnings = 0;
  readonly tracks = new Map<string, { best: number }>();
  promotions = 0;
  jobYears = 0;
  everEmployed = false;
  idle = 0;
  workingYears = 0;
  ownedBy: number | null = null;
  private lastLedgerYear = -1;
  private lastJob: { jobId: string; since: number; level: number } | null = null;

  observe(life: LifeState, content: ContentBundle): void {
    const job = life.career.job;
    if (job) {
      this.everEmployed = true;
      const track = this.tracks.get(job.jobId) ?? { best: 0 };
      track.best = Math.max(track.best, job.level);
      this.tracks.set(job.jobId, track);
      const last = this.lastJob;
      if (last && last.jobId === job.jobId && last.since === job.since && job.level > last.level) this.promotions += job.level - last.level;
      this.lastJob = { jobId: job.jobId, since: job.since, level: job.level };
    } else {
      this.lastJob = null;
    }
    if (life.housing.kind === 'owned') this.ownedBy ??= life.character.age;
    const ledger = life.finances.lastLedger;
    if (ledger && ledger.year === life.currentYear && ledger.year !== this.lastLedgerYear) {
      this.lastLedgerYear = ledger.year;
      this.earnings += ledger.gross;
      if (job) this.jobYears++;
      const age = life.character.age;
      if (age >= content.balance.economy.independenceAge && age < 65 && !life.education.current && !life.career.retired) {
        this.workingYears++;
        if (!job && !life.career.gig) this.idle++;
      }
    }
  }
}

/** Education outcomes in one group of lives (those that reached 30). */
export interface EducationRow {
  lives: number;
  /** A high school diploma by 19. */
  diplomaBy19: number;
  ged: number;
  /** Neither a diploma nor a GED at 30. */
  noHighSchool: number;
  /** Went to college by 30 (any tier). */
  college: number;
  /** An associate or bachelor's degree by 30. */
  degree: number;
  bachelor: number;
  tradeLicense: number;
  /** A grad degree, ever. */
  grad: number;
  /** Median high school GPA (of those with one). */
  medianHsGpa: number;
}

export interface EducationReport {
  byWealth: Record<FamilyWealth | 'all', EducationRow>;
  /** College by 30, by high school GPA (lives that reached 30 with a diploma). */
  collegeByGpa: { label: string; lives: number; college: number }[];
  /** Ages at which the high school diploma came. */
  diplomaAges: Record<number, number>;
  /** Applications made and accepted, by option kind. */
  applications: Record<'community' | 'state' | 'elite' | 'trade' | 'grad' | 'ged', { tried: number; accepted: number }>;
  /** Student debt at 25 (lives that reached 25): how many had any, median and 90th percentile among them. */
  studentDebtAt25: { lives: number; borrowers: number; median: number; p90: number };
  largestStudentDebt: number;
  /** Lives that started (or went back to) college, trade school or grad school at 25 or older. */
  lateStudents: number;
  /** Lives that left high school, and lives that left college, trade school or grad school, without finishing (by choice, an event or expulsion). */
  dropouts: { highSchool: number; postSecondary: number };
}

const WEALTHS: FamilyWealth[] = ['poor', 'working', 'middle', 'affluent', 'rich'];

/** What one life did at school, watched step by step. */
class SchoolWatcher {
  collegeAge: number | null = null;
  lateStudent = false;
  studentDebtAt25: number | null = null;
  maxStudentDebt = 0;
  credentialsAt30: string[] | null = null;
  /** Programs left without finishing (dropping out or expelled), by when and what. */
  readonly left = new Set<string>();
  /** Trades you started trade school for. */
  readonly trades = new Set<string>();

  observe(life: LifeState): void {
    const gone = life.education.left;
    if (gone) this.left.add(`${gone.leftYear}:${gone.program}`);
    const age = life.character.age;
    const cur = life.education.current;
    if (cur?.program === 'college') this.collegeAge ??= age;
    if (cur?.program === 'trade' && cur.tradeId) this.trades.add(cur.tradeId);
    if (cur && (cur.program === 'college' || cur.program === 'trade' || cur.program === 'grad') && cur.since - life.birthYear >= 25) this.lateStudent = true;
    const student = life.finances.debts.filter((d) => d.kind === 'student').reduce((sum, d) => sum + d.balance, 0);
    this.maxStudentDebt = Math.max(this.maxStudentDebt, student);
    if (life.phase === 'yearStart' && age === 25) this.studentDebtAt25 = student;
    if (life.phase === 'yearStart' && age === 30) this.credentialsAt30 = life.education.credentials.map((c) => c.type);
  }
}

/** Median and spread of an amount across lives. */
export interface Spread {
  lives: number;
  p10: number;
  median: number;
  p90: number;
  /** Share of those lives with any debt. */
  inDebt: number;
}

export interface MoneyReport {
  /** Savings, debt and net worth at these ages (lives that reached them), and at death. */
  byAge: { age: number | 'death'; savings: Spread; debt: Spread; netWorth: Spread }[];
  /** Largest values seen in any life at any point (must stay far below the safe integer limit). */
  largest: { savings: number; debt: number; netWorth: number; netWorthSeed: string };
  /** Lives (that reached the independence age) in which each happened. */
  adults: number;
  outcomes: Record<
    'gig' | 'movedOut' | 'relocated' | 'owned' | 'livedTogether' | 'evicted' | 'homeless' | 'foreclosed' | 'bankrupt' | 'collections' | 'debtPlan',
    number
  >;
  /** Lives that reached the retirement age: how many got a benefit, and its median in the first year it was paid. */
  retirement: { reached: number; withBenefit: number; medianBenefit: number };
  /**
   * Years from the retirement age on: how many, and in how many the ledger
   * couldn't cover costs (borrowed) or a payment was missed; lives that ever
   * ran short then; lives evicted then.
   */
  seniors: { years: number; shortYears: number; livesShort: number; livesEvicted: number };
  actionsTaken: Record<LifeActionId, number>;
  /** Years renting on gig income only, by city: how many, and how many of them couldn't cover their costs. */
  gigRenting: Record<string, { years: number; shortYears: number }>;
  /**
   * Repeatable money: for each event that can give money, the most times it
   * fired in one life times its largest gain. A runaway would show up here.
   */
  repeatableGains: { eventId: string; mostInOneLife: number; largestGain: number; mostMoney: number }[];
}

/** What one life did with money, watched step by step. */
class MoneyWatcher {
  readonly at = new Map<number, { savings: number; debt: number; netWorth: number }>();
  gig = false;
  movedOut = false;
  relocated = false;
  owned = false;
  together = false;
  homeless = false;
  collections = false;
  maxSavings = 0;
  maxDebt = 0;
  maxNetWorth = 0;

  observe(life: LifeState, ages: readonly number[]): void {
    const debt = totalDebt(life);
    const worth = netWorth(life);
    this.maxSavings = Math.max(this.maxSavings, life.finances.savings);
    this.maxDebt = Math.max(this.maxDebt, debt);
    this.maxNetWorth = Math.max(this.maxNetWorth, worth);
    if (life.career.gig) this.gig = true;
    const kind = life.housing.kind;
    if (kind === 'renting' || kind === 'owned') this.movedOut = true;
    if (kind === 'owned') this.owned = true;
    if (life.housing.partnerId !== undefined) this.together = true;
    if (kind === 'homeless') this.homeless = true;
    if (life.character.cityId !== life.character.birthCityId) this.relocated = true;
    if (life.finances.debts.some((d) => d.kind === 'collections')) this.collections = true;
    if (life.phase === 'yearStart' && ages.includes(life.character.age)) {
      this.at.set(life.character.age, { savings: life.finances.savings, debt, netWorth: worth });
    }
  }
}

const MONEY_AGES = [18, 25, 35, 45, 65, 80];

function spread(values: number[], debts: number[]): Spread {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  return { lives: values.length, p10: at(0.1), median: at(0.5), p90: at(0.9), inDebt: debts.filter((d) => d > 0).length };
}

/** The largest money gain each event's outcomes can give. */
function largestGains(content: ContentBundle): Map<string, number> {
  const gains = new Map<string, number>();
  for (const [id, def] of Object.entries(content.events)) {
    const outcomes = def.autoOutcome
      ? [def.autoOutcome]
      : (def.choices ?? []).flatMap((c) => (c.outcome ? [c.outcome] : c.check ? [c.check.success, c.check.failure] : []));
    let best = 0;
    for (const o of outcomes) {
      const total = (o.effects as Effect[]).reduce((sum, e) => sum + (e.type === 'money' && e.delta > 0 ? e.delta : 0), 0);
      best = Math.max(best, total);
    }
    if (best > 0) gains.set(id, best);
  }
  return gains;
}

export interface RelationshipReport {
  /** Lives that reached the adult age (the base for the shares below). */
  adults: number;
  everDated: number;
  everMarried: number;
  reached40: number;
  marriedBy40: number;
  marriages: number;
  divorces: number;
  /** Dating or engaged couples who split up. */
  breakups: number;
  /** Lives in which a spouse died during the marriage. */
  widowed: number;
  /** Median age at first marriage, over lives that married. */
  medianFirstMarriageAge: number | null;
  /** Lives that were married more than once. */
  remarried: number;
  actionsTaken: Record<ActionId, number>;
  /** People outside family still in your life at the end (not faded): median and most. */
  peopleAtEnd: { median: number; most: number };
}

/** What one life did in love, watched step by step. */
class RomanceWatcher {
  marriages = 0;
  divorces = 0;
  breakups = 0;
  dated = false;
  widowed = false;
  firstMarriageAge: number | null = null;
  private last: LifeState | null = null;

  observe(life: LifeState): void {
    const prev = this.last;
    this.last = life;
    if (!prev || prev.relationships === life.relationships) return;
    for (const [id, rel] of Object.entries(life.relationships)) {
      const before = prev.relationships[id];
      if (before && before.kind === 'spouse' && rel.kind === 'spouse' && prev.people[id]?.alive && !life.people[id]?.alive) this.widowed = true;
      if (before?.kind === rel.kind) continue;
      if (rel.kind === 'partner') this.dated = true;
      if (rel.kind === 'spouse') {
        this.marriages++;
        this.firstMarriageAge ??= life.character.age;
      }
      if (rel.kind === 'ex' && before?.kind === 'spouse') this.divorces++;
      if (rel.kind === 'ex' && before && isPartnerKind(before.kind) && before.kind !== 'spouse') this.breakups++;
    }
  }
}

const STAGES: LifeStage[] = ['early', 'child', 'teen', 'youngAdult', 'adult', 'senior'];

export function runSimulation(content: ContentBundle, options: SimulationOptions): SimulationReport {
  const playerKind: SimulatedPlayer = options.player ?? 'careful';
  const careless = playerKind === 'careless';
  // The money ages, and the age the net worth target is about.
  const moneyAges = [...new Set([...MONEY_AGES, content.balance.targets.money.netWorthAge])].sort((a, b) => a - b);
  const maxMessages = options.maxFailureMessages ?? 20;
  const failureMessages: string[] = [];
  let invariantFailures = 0;
  const ages: number[] = [];
  const perYear = Object.fromEntries(STAGES.map((s) => [s, { years: 0, events: 0, belowMin: 0, most: 0 }])) as Record<
    LifeStage,
    StageYears
  >;
  let yearsOverCap = 0;
  const fired = new Map<string, number>();
  const livesWith = new Map<string, number>();
  let deathsFromEvents = 0;
  const { budgets, cap } = content.balance.pacing;
  const { adultAge } = content.balance.relationships;
  const rel: RelationshipReport = {
    adults: 0,
    everDated: 0,
    everMarried: 0,
    reached40: 0,
    marriedBy40: 0,
    marriages: 0,
    divorces: 0,
    breakups: 0,
    widowed: 0,
    medianFirstMarriageAge: null,
    remarried: 0,
    actionsTaken: Object.fromEntries(ACTION_IDS.map((id) => [id, 0])) as Record<ActionId, number>,
    peopleAtEnd: { median: 0, most: 0 },
  };
  const firstMarriageAges: number[] = [];
  const peopleAtEnd: number[] = [];
  const { independenceAge } = content.balance.economy;
  const money: MoneyReport = {
    byAge: [],
    largest: { savings: 0, debt: 0, netWorth: 0, netWorthSeed: '' },
    adults: 0,
    outcomes: {
      gig: 0,
      movedOut: 0,
      relocated: 0,
      owned: 0,
      livedTogether: 0,
      evicted: 0,
      homeless: 0,
      foreclosed: 0,
      bankrupt: 0,
      collections: 0,
      debtPlan: 0,
    },
    retirement: { reached: 0, withBenefit: 0, medianBenefit: 0 },
    seniors: { years: 0, shortYears: 0, livesShort: 0, livesEvicted: 0 },
    actionsTaken: Object.fromEntries(LIFE_ACTION_IDS.map((id) => [id, 0])) as Record<LifeActionId, number>,
    gigRenting: {},
    repeatableGains: [],
  };
  const atAge = new Map<number | 'death', { savings: number[]; debt: number[]; netWorth: number[] }>(
    [...moneyAges, 'death' as const].map((a) => [a, { savings: [], debt: [], netWorth: [] }]),
  );
  const gains = largestGains(content);
  const emptyRow = (): EducationRow & { gpas: number[] } => ({
    lives: 0, diplomaBy19: 0, ged: 0, noHighSchool: 0, college: 0, degree: 0, bachelor: 0, tradeLicense: 0, grad: 0, medianHsGpa: 0, gpas: [],
  });
  const eduRows = Object.fromEntries([...WEALTHS, 'all'].map((w) => [w, emptyRow()])) as Record<FamilyWealth | 'all', ReturnType<typeof emptyRow>>;
  const gpaBuckets = [
    { label: 'below 2.0', below: 2, lives: 0, college: 0 },
    { label: '2.0–2.5', below: 2.5, lives: 0, college: 0 },
    { label: '2.5–3.0', below: 3, lives: 0, college: 0 },
    { label: '3.0–3.5', below: 3.5, lives: 0, college: 0 },
    { label: '3.5 and up', below: 5, lives: 0, college: 0 },
  ];
  const education: EducationReport = {
    byWealth: {} as EducationReport['byWealth'],
    collegeByGpa: [],
    diplomaAges: {},
    applications: {
      community: { tried: 0, accepted: 0 },
      state: { tried: 0, accepted: 0 },
      elite: { tried: 0, accepted: 0 },
      trade: { tried: 0, accepted: 0 },
      grad: { tried: 0, accepted: 0 },
      ged: { tried: 0, accepted: 0 },
    },
    studentDebtAt25: { lives: 0, borrowers: 0, median: 0, p90: 0 },
    largestStudentDebt: 0,
    lateStudents: 0,
    dropouts: { highSchool: 0, postSecondary: 0 },
  };
  const studentDebts25: number[] = [];
  const retirementAge = content.balance.economy.retirement.age;
  const firstBenefits: number[] = [];
  const mostFires = new Map<string, number>();
  const careers: CareerReport = {
    earningsByPath: {} as CareerReport['earningsByPath'],
    bachelorVsHighSchool: { bachelorMean: 0, highSchoolMean: 0, ratio: 0, bachelorBelowHighSchoolMedian: 0 },
    jobYears: 0,
    promotions: 0,
    firings: 0,
    layoffs: 0,
    raisesAsked: { asked: 0, got: 0 },
    applications: { tried: 0, hired: 0 },
    adults: 0,
    everEmployed: 0,
    everFired: 0,
    everLaidOff: 0,
    retired: 0,
    idleYears: { years: 0, idle: 0 },
    tracks: [],
    bankrupt: { adults: 0, bankrupt: 0, neverWorked: 0, neverWorkedBankrupt: 0 },
    tradeMinded: 0,
    // Each trade, and the job tracks that need its license.
    trades: Object.keys(content.trades)
      .sort()
      .map((tradeId) => ({
        tradeId,
        enrolled: 0,
        licensed: 0,
        worked: 0,
        jobIds: Object.keys(content.jobs)
          .sort()
          .filter((jobId) => referencesIn(content.jobs[jobId]!.requires).fields.includes(tradeId)),
      })),
    homeOwners: { reached: 0, owned: 0 },
  };
  const trackRows: Record<string, CareerReport['tracks'][number]> = {};
  const health: HealthReport = {
    conditions: [],
    causes: [],
    doctorVisits: 0,
    sawDoctor: 0,
    medicalDebtAt65: { reached: 0, owing: 0, median: 0 },
  };
  const conditionRows = new Map(Object.keys(content.conditions).sort().map((id) => [id, { id, lives: 0, treated: 0, diedOf: 0 }]));
  const causeCounts = new Map<string, number>();
  const medicalDebts: number[] = [];
  const legal: LegalReport = {
    offenses: [],
    outcomes: { warning: 0, fine: 0, probation: 0, jail: 0 },
    recordLives: 0,
    convictedLives: 0,
    probationLives: 0,
    jailedLives: 0,
    yearsInside: 0,
    mostYearsInside: 0,
    released: 0,
    reoffended: 0,
    illegalChoices: {
      events: Object.values(content.events)
        .filter((def) => !def.retired && (def.choices ?? []).some((c) => choiceTraits(c).illegal))
        .map((def) => def.id)
        .sort(),
      offered: 0,
      taken: 0,
    },
  };
  const carefulChoice = personalityChoice(content, 'refuse');
  const criminalChoice = personalityChoice(content, 'accept');
  const starChoice = personalityChoice(content, 'refuse', 'seek');
  const offenseRows = new Map(Object.keys(content.offenses).sort().map((id) => [id, { id, lives: 0 }]));
  const discovery: DiscoveryReport = {
    kinds: Object.fromEntries(DISCOVERY_KINDS.map((k) => [k, { latent: 0, surfaced: 0, accepted: 0, resurfaced: 0, heldBack: 0 }])) as DiscoveryReport['kinds'],
    crisisLives: 0,
    comingOutLives: 0,
    identityChanged: 0,
    innerConflictAtDeath: { median: 0, above50: 0 },
  };
  const conflictsAtDeath: number[] = [];
  const earningsByPath = Object.fromEntries(EDUCATION_PATHS.map((p) => [p, [] as number[]])) as Record<EducationPath, number[]>;
  const bachelorEarnings: number[] = [];

  const recurring = recurringEvents(content);
  // E6a: the criminal player lives as the careful one does (family, interactions), and also in a crew.
  const behaves: InteractionPlayer = playerKind === 'criminal' || playerKind === 'star' || playerKind === 'athlete' ? 'careful' : playerKind;
  const interactions = emptyInteractionReport(behaves, content);
  const family = emptyFamilyReport();
  const people = emptyPeopleReport();
  const web = emptyWebReport();
  const mental = emptyMentalReport(content);
  const possessions = emptyPossessionsReport(content);
  const teen = emptyTeenReport(content);
  const crime = emptyCrimeReport(playerKind, content);
  const fame = emptyFameReport(playerKind, content);
  const sports = emptySportsReport(playerKind, content);
  const famousAtTarget: number[] = [];
  const peopleTimer = new PipelineTimer(people);
  const timedSteps = peopleTimer.steps(YEAR_PIPELINE);
  // Found out: the follow-ups only this system schedules (affair_discovered also answers an older chain, so it counts only for an unfaithful life).
  const infidelityEvents = new Set(
    [...content.registries.interactions.infidelity.flirt.events, ...content.registries.interactions.infidelity.intimate.events].filter((id) => id !== 'affair_discovered'),
  );
  let violations = 0;
  const lifetimeHappiness: number[] = [];
  const repeatShares: number[] = [];
  const repeatsByEvent = new Map<string, number>();

  for (let i = 0; i < options.lives; i++) {
    const startLife = options.starts?.[i];
    const seed = startLife ? startLife.seed : `${options.seedPrefix}-${i}`;
    const check = (life: LifeState) => {
      const failures = checkInvariants(life, content);
      invariantFailures += failures.length;
      violations += failures.filter((f) => f.startsWith('consistency:')).length;
      possessions.invariantFailures += failures.filter((f) => /possession|\bpet\b|vehicle|car loan|vacation|renovation|insurance|upkeep/i.test(f)).length;
      crime.invariantFailures += failures.filter((f) => /crime|crew|dirty/i.test(f)).length;
      fame.invariantFailures += failures.filter((f) => /^fame|fame\./i.test(f)).length;
      sports.invariantFailures += failures.filter((f) => /^sports/i.test(f)).length;
      teen.invariantFailures += failures.filter((f) => /crowd|teen|license|learner|house rule|rule |romance|couple with someone under|under 18|is under \d+ and|they are under|you are under/i.test(f)).length;
      for (const f of failures) if (failureMessages.length < maxMessages) failureMessages.push(`${seed} age ${life.character.age}: ${f}`);
    };
    const choices = createRng(`${seed}:choices`);
    const player = createRng(`${seed}:player`);
    const romance = new RomanceWatcher();
    const wallet = new MoneyWatcher();
    const school = new SchoolWatcher();
    const work = new CareerWatcher();
    const nine = new Stage9Watcher();
    const interactionRng = createRng(`${seed}:interactions`);
    const interactionWatcher = new InteractionWatcher();
    // E2a: whether this life wants children, and the parenting style it brings (the spammer has no family plans).
    const familyRng = createRng(`${seed}:family`);
    const familyProfile = { ...rollFamilyProfile(familyRng), ...(playerKind === 'spammer' ? { wantsKids: false } : {}) };
    const familyWatcher = new FamilyWatcher(family, familyProfile, behaves === 'careful');
    const crimeWatcher = new CrimeWatcher(crime, content);
    const crimeRng = createRng(`${seed}:crime`);
    const fameWatcher = new FameWatcher(fame, content);
    const fameRng = createRng(`${seed}:fame`);
    const starProfile = rollStarProfile(fameRng);
    const sportsWatcher = new SportsWatcher(sports, content);
    const sportsRng = createRng(`${seed}:sports`);
    const athleteProfile = rollAthleteProfile(sportsRng);
    const peopleWatcher = new PeopleWatcher(people, content);
    const webWatcher = new WebWatcher(web, content);
    const mentalWatcher = new MentalWatcher(mental, content);
    // E5: what this life owns.
    const possessionsWatcher = new PossessionsWatcher(possessions, content);
    const possessionRng = createRng(`${seed}:possessions`);
    const possessionProfile = rollPossessionProfile(possessionRng);
    // T1: the teen years: this life's plan for its yearly focus and what kind of teenager it is.
    const teenRng = createRng(`${seed}:teen`);
    const teenProfile = rollTeenProfile(teenRng);
    let teenWatcher: TeenWatcher | undefined;
    const profile = rollMoneyProfile(player);
    // E2b: whether this life writes a will, and who it names.
    const mentalRng = createRng(`${seed}:mental`);
    const mentalProfile = rollMentalProfile(mentalRng);
    const willRng = createRng(`${seed}:will`);
    const willProfile = rollWillProfile(willRng);
    // Event choices: the careful player by personality, the careless one at random (Stage 9).
    const picker: ChoicePicker = (l, card, rng) => {
      const def = content.events[l.pending.find((p) => p.instanceId === card.instanceId)?.eventId ?? ''];
      const illegal = new Set(
        (def?.choices ?? []).filter((c) => card.choices.some((v) => v.id === c.id) && choiceTraits(c).illegal).map((c) => c.id),
      );
      const eventId = l.pending.find((p) => p.instanceId === card.instanceId)?.eventId ?? '';
      // Starting an adoption, IVF cycle or surrogacy: the player came here to begin.
      const starts = [...content.registries.family.adoption.start, ...content.registries.family.ivf.start, ...content.registries.family.surrogacy.start];
      const id = starts.includes(eventId) ? card.choices[0]!.id : careless ? pick(rng, card.choices).id : playerKind === 'criminal' ? criminalChoice(l, card, rng) : playerKind === 'star' || playerKind === 'athlete' ? starChoice(l, card, rng) : carefulChoice(l, card, rng);
      if (illegal.size > 0) {
        legal.illegalChoices.offered++;
        if (illegal.has(id)) legal.illegalChoices.taken++;
      }
      return id;
    };
    const seenThisLife = new Set<string>();
    const firesThisLife = new Map<string, number>();
    let firstBenefit: number | null = null;
    let seniorShort = false;
    const watch = (l: LifeState) => {
      check(l);
      familyWatcher.observe(l, content);
      romance.observe(l);
      wallet.observe(l, moneyAges);
      school.observe(l);
      work.observe(l, content);
      nine.observe(l);
      // A management action's result event, just queued.
      const queued = l.phase === 'action' && l.pending.length === 1 ? l.pending[0]! : null;
      if (queued && queued.resolvedChoiceId === undefined) {
        fired.set(queued.eventId, (fired.get(queued.eventId) ?? 0) + 1);
        seenThisLife.add(queued.eventId);
        firesThisLife.set(queued.eventId, (firesThisLife.get(queued.eventId) ?? 0) + 1);
      }
    };
    /** A money, home, school or work action; one that queues a result event (work) is played out. */
    const takeLifeAction = (current: LifeState, actionId: LifeActionId, params: LifeActionParams): LifeState => {
      let next = performAction(current, actionId, params, content);
      watch(next);
      if (next.phase === 'action') {
        next = resolveAll(next, content, choices, watch, picker);
        next = finishAction(next);
        watch(next);
      }
      return next;
    };
    let life = startLife ?? createLife({ mode: 'random', seed, birthYear: 2026 }, content);
    watch(life);
    mentalWatcher.begin(life);
    while (life.phase !== 'dead') {
      // Between years, the simulated player may act on money and home...
      for (const [actionId, params] of careless ? chooseCarelessLifeActions(life, content, player) : chooseMoneyActions(life, content, player, profile)) {
        // One new job a year is enough.
        if (actionId === 'apply_job' && life.career.applied.some((a) => a.hired)) continue;
        if (!isLifeActionAvailable(life, actionId, params, content)) continue;
        life = takeLifeAction(life, actionId, params);
        money.actionsTaken[actionId]++;
        if (actionId === 'see_doctor') health.doctorVisits++;
      }
      // ...and on a will (E2b)...
      for (const [actionId, params] of careless ? [] : chooseWillActions(life, content, willRng, willProfile)) {
        if (!isLifeActionAvailable(life, actionId, params, content)) continue;
        life = takeLifeAction(life, actionId, params);
        money.actionsTaken[actionId]++;
      }
      // ...and on work...
      for (const [actionId, params] of careless ? [] : chooseCareerActions(life, content, player, profile)) {
        // One new job a year is enough.
        if (actionId === 'apply_job' && life.career.applied.some((a) => a.hired)) continue;
        if (!isLifeActionAvailable(life, actionId, params, content)) continue;
        const salary = life.career.job?.salary ?? 0;
        life = takeLifeAction(life, actionId, params);
        money.actionsTaken[actionId]++;
        if (actionId === 'apply_job') {
          careers.applications.tried++;
          if (life.career.applied.at(-1)?.hired) careers.applications.hired++;
        }
        if (actionId === 'ask_raise') {
          careers.raisesAsked.asked++;
          if ((life.career.job?.salary ?? 0) > salary) careers.raisesAsked.got++;
        }
      }
      // ...and on school...
      for (const [actionId, params] of careless ? [] : chooseSchoolActions(life, content, player, profile)) {
        if (!isLifeActionAvailable(life, actionId, params, content)) continue;
        life = takeLifeAction(life, actionId, params);
        money.actionsTaken[actionId]++;
        const decision = actionId === 'apply_school' || actionId === 'take_ged' ? life.education.applied.at(-1) : undefined;
        if (decision) {
          const [kind, id] = decision.option.split(':') as [string, string | undefined];
          const key = (kind === 'college' ? id : kind) as keyof EducationReport['applications'];
          education.applications[key].tried++;
          if (decision.accepted) education.applications[key].accepted++;
        }
      }
      // ...and on health (Stage 9; the careless player's doctor visits are among its random life actions)...
      for (const [actionId, params] of careless ? [] : chooseHealthActions(life, content, player)) {
        if (!isLifeActionAvailable(life, actionId, params, content)) continue;
        life = takeLifeAction(life, actionId, params);
        money.actionsTaken[actionId]++;
        health.doctorVisits++;
      }
      // ...and on dirty money (E6a): the criminal player puts it through a business and now and then spends some...
      if (playerKind === 'criminal') {
        for (const [actionId, params] of chooseCrimeActions(life, content, crimeRng)) {
          if (!isLifeActionAvailable(life, actionId, params, content)) continue;
          const beforeAction = life;
          life = takeLifeAction(life, actionId, params);
          money.actionsTaken[actionId]++;
          if (actionId === 'launder_money') crimeWatcher.laundered(beforeAction, life, params.frontId!);
        }
      }
      // ...and on a career in arts and media (E6b): the star player goes after one and lines up a project every year...
      if (playerKind === 'star') {
        for (const [actionId, params] of chooseFameActions(life, content, fameRng, starProfile)) {
          if (!isLifeActionAvailable(life, actionId, params, content)) continue;
          life = takeLifeAction(life, actionId, params);
          money.actionsTaken[actionId]++;
        }
      }
      // ...and on a sport (E6c): the athlete player goes after one, hires an agent, trains and plays...
      if (playerKind === 'athlete') {
        for (const [actionId, params] of chooseSportsActions(life, content, sportsRng, athleteProfile)) {
          if (!isLifeActionAvailable(life, actionId, params, content)) continue;
          const beforeAction = life;
          life = takeLifeAction(life, actionId, params);
          money.actionsTaken[actionId]++;
          sportsWatcher.acted(actionId, beforeAction);
        }
      }
      // ...and on their mind (M1)...
      for (const [actionId, params] of careless ? [] : chooseMentalActions(life, content, mentalRng, mentalProfile)) {
        if (!isLifeActionAvailable(life, actionId, params, content)) continue;
        life = takeLifeAction(life, actionId, params);
        money.actionsTaken[actionId]++;
      }
      // ...and in the teen years (T1): a focus, a crowd, the license, a job, a team, the rules at home...
      if (!careless) {
        teenWatcher ??= new TeenWatcher(teen, content, teenProfile, life);
        for (const [actionId, params] of chooseTeenActions(life, content, teenRng, teenProfile)) {
          if (!isLifeActionAvailable(life, actionId, params, content)) continue;
          const beforeAction = life;
          life = takeLifeAction(life, actionId, params);
          money.actionsTaken[actionId]++;
          teenWatcher.acted(actionId, params, beforeAction, life);
        }
      }
      // ...and on what they own (E5): pets, vehicles, a vacation home, renovations...
      for (const [actionId, params] of careless ? [] : choosePossessionActions(life, content, possessionRng, possessionProfile)) {
        if (!isLifeActionAvailable(life, actionId, params, content)) continue;
        life = takeLifeAction(life, actionId, params);
        money.actionsTaken[actionId]++;
        possessionsWatcher.acted(actionId, params);
      }
      // ...and time with their pets.
      if (!careless) {
        for (const [interactionId, petId] of choosePetInteractions(life, content, possessionRng)) {
          if (life.phase !== 'yearStart' || life.pendingInteraction?.choice) break;
          life = performInteraction(life, { interactionId, petId }, content);
          life = closeInteraction(life, content);
          possessionsWatcher.petInteraction();
        }
        check(life);
      }
      // ...and on relationships.
      for (const [actionId, personId] of careless ? chooseCarelessActions(life, content, player) : chooseActions(life, content, player)) {
        if (!isActionAvailable(life, actionId, personId, content)) continue;
        life = playAction(life, content, actionId, personId, choices, watch, picker);
        rel.actionsTaken[actionId]++;
      }
      // ...and on the family (E2a): trying for a baby, adoption, IVF and surrogacy.
      if (familyProfile.wantsKids) {
        const plans = chooseFamilyActions(life, familyRng, familyProfile);
        for (const [actionId, personId] of plans.person) {
          if (!isActionAvailable(life, actionId, personId, content)) continue;
          life = playAction(life, content, actionId, personId, choices, watch, picker);
          rel.actionsTaken[actionId]++;
        }
        for (const [actionId, params] of plans.life) {
          if (!isLifeActionAvailable(life, actionId, params, content)) continue;
          life = takeLifeAction(life, actionId, params);
          money.actionsTaken[actionId]++;
        }
      }
      // ...and with the people in your life (E1: the interaction menu).
      if (life.phase === 'yearStart' && life.character.age >= 4) {
        interactions.years++;
        interactionWatcher.beginYear(life);
        const parenting = playerKind === 'spammer' ? [] : chooseParentingPlans(life, content, familyRng, familyProfile, careless);
        for (const plan of [...chooseInteractions(life, content, interactionRng, behaves), ...parenting]) {
          const def = content.interactions[plan.interactionId]!;
          if (!isInteractionAvailable(life, def, plan.personId, content)) continue;
          if (plan.giftTier && !canAffordGift(life, plan.giftTier, content)) continue;
          life = playInteraction(life, content, plan, behaves, interactionRng, interactionWatcher, interactions);
          // E2a: an intimate night that began an unplanned pregnancy opens its decision.
          if (life.phase === 'action') {
            life = resolveAll(life, content, choices, watch, picker);
            life = finishAction(life);
            watch(life);
          }
        }
        interactionWatcher.endInteractions(life, interactions);
        check(life);
      }
      const yearBefore = life;
      life = peopleTimer.time(() => beginYear(yearBefore, content, timedSteps));
      peopleWatcher.observe(yearBefore, life);
      webWatcher.observe(yearBefore, life);
      mentalWatcher.observe(yearBefore, life);
      crimeWatcher.observe(yearBefore, life);
      fameWatcher.observe(yearBefore, life);
      sportsWatcher.observe(yearBefore, life);
      possessionsWatcher.observe(yearBefore, life, content);
      if (!careless) teenWatcher?.observe(yearBefore, life);
      watch(life);
      options.onYear?.(life);
      const stage = perYear[life.character.lifeStage];
      const count = life.pending.length;
      stage.years++;
      stage.events += count;
      stage.most = Math.max(stage.most, count);
      if (count < budgets[life.character.lifeStage].min) stage.belowMin++;
      if (count > cap) yearsOverCap++;
      for (const p of life.pending) {
        fired.set(p.eventId, (fired.get(p.eventId) ?? 0) + 1);
        seenThisLife.add(p.eventId);
        firesThisLife.set(p.eventId, (firesThisLife.get(p.eventId) ?? 0) + 1);
      }
      const ledger = life.finances.lastLedger;
      if (life.character.age >= retirementAge && ledger?.year === life.currentYear) {
        money.seniors.years++;
        if (ledger.retirement > 0) firstBenefit ??= ledger.retirement;
        if (ledger.borrowed > 0 || life.finances.debts.some((d) => d.missed > 0)) {
          money.seniors.shortYears++;
          seniorShort = true;
        }
      }
      if (life.housing.kind === 'renting' && life.career.gig && life.career.job === null && ledger?.year === life.currentYear) {
        const city = (money.gigRenting[life.character.cityId] ??= { years: 0, shortYears: 0 });
        city.years++;
        if (ledger.borrowed > 0) city.shortYears++;
      }
      life = resolveAll(life, content, choices, watch, picker);
      const diedFromEvent = life.death !== null;
      life = endYear(life, content);
      watch(life);
      interactionWatcher.observe(life);
      if (diedFromEvent) deathsFromEvents++;
    }
    options.onLife?.(life);
    peopleWatcher.finish();
    webWatcher.finish(life);
    mentalWatcher.finish(life);
    crimeWatcher.finish(life);
    fameWatcher.finish(life);
    sportsWatcher.finish(life);
    possessionsWatcher.finish(life);
    if (!careless) teenWatcher?.finish(life);
    familyWatcher.finish(life, firesThisLife);
    // E1: who reached maximum affection, being found out, and a sample of lives rebuilt from their input logs.
    interactions.lives++;
    interactions.affection.reachedMax += interactionWatcher.reachedMax.size;
    interactions.affection.reachedMaxByInteractions += interactionWatcher.reachedByInteractions.size;
    for (const id of infidelityEvents) interactions.cheating.foundOut += firesThisLife.get(id) ?? 0;
    if (life.flags.unfaithful === true) interactions.cheating.foundOut += firesThisLife.get('affair_discovered') ?? 0;
    if (i % REPLAY_EVERY === 0) {
      interactions.replay.checked++;
      let same = false;
      try {
        same = isDeepStrictEqual(replayLife(life.inputLog, content), life);
      } catch (err) {
        if (failureMessages.length < maxMessages) failureMessages.push(`${seed}: replay threw: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (!same) {
        interactions.replay.mismatches++;
        invariantFailures++;
        if (failureMessages.length < maxMessages) failureMessages.push(`${seed}: the life rebuilt from its input log is not the life that was played`);
      }
    }
    // C1: lifetime Happiness and repeats of events that aren't recurring.
    if (life.lifetime.years > 0) lifetimeHappiness.push(life.lifetime.happinessTotal / life.lifetime.years);
    let firesTotal = 0;
    let repeats = 0;
    for (const [id, n] of firesThisLife) {
      firesTotal += n;
      if (n > 1 && !recurring.has(id)) {
        repeats += n - 1;
        repeatsByEvent.set(id, (repeatsByEvent.get(id) ?? 0) + n - 1);
      }
    }
    if (firesTotal > 0) repeatShares.push(repeats / firesTotal);
    for (const id of seenThisLife) livesWith.set(id, (livesWith.get(id) ?? 0) + 1);
    for (const [id, n] of firesThisLife) if (gains.has(id)) mostFires.set(id, Math.max(mostFires.get(id) ?? 0, n));
    ages.push(life.character.age);

    // E6b: famous lives are reported apart from the net worth target (their fortunes would swamp it).
    const famous = peakRung(life) >= content.balance.fame.crossover.rung;
    if (famous) famousAtTarget.push(wallet.at.get(content.balance.targets.money.netWorthAge)?.netWorth ?? netWorth(life));
    for (const [age, v] of famous ? [] : wallet.at) {
      const bucket = atAge.get(age)!;
      bucket.savings.push(v.savings);
      bucket.debt.push(v.debt);
      bucket.netWorth.push(v.netWorth);
    }
    const end = atAge.get('death')!;
    if (!famous) {
      end.savings.push(life.finances.savings);
      end.debt.push(totalDebt(life));
      end.netWorth.push(netWorth(life));
    }
    money.largest.savings = Math.max(money.largest.savings, wallet.maxSavings);
    money.largest.debt = Math.max(money.largest.debt, wallet.maxDebt);
    if (wallet.maxNetWorth > money.largest.netWorth) money.largest = { ...money.largest, netWorth: wallet.maxNetWorth, netWorthSeed: seed };
    if (life.character.age >= retirementAge) {
      money.retirement.reached++;
      if (firstBenefit !== null) {
        money.retirement.withBenefit++;
        firstBenefits.push(firstBenefit);
      }
      if (seniorShort) money.seniors.livesShort++;
      if (life.history.some((e) => e.tags.includes('evicted') && e.age >= retirementAge)) money.seniors.livesEvicted++;
    }
    if (life.character.age >= independenceAge) {
      money.adults++;
      const o = money.outcomes;
      const tags = new Set(life.history.flatMap((e) => e.tags));
      if (wallet.gig) o.gig++;
      if (wallet.movedOut) o.movedOut++;
      if (wallet.relocated) o.relocated++;
      if (wallet.owned) o.owned++;
      if (wallet.together) o.livedTogether++;
      if (tags.has('evicted')) o.evicted++;
      if (wallet.homeless) o.homeless++;
      if (tags.has('foreclosed')) o.foreclosed++;
      if (life.finances.bankruptcyYear !== undefined) o.bankrupt++;
      if (wallet.collections) o.collections++;
      if (life.finances.debtPlanYear !== undefined) o.debtPlan++;
    }

    // Work.
    const cr = careers;
    const t = content.balance.targets;
    if (life.character.age >= independenceAge) {
      cr.adults++;
      if (work.everEmployed) cr.everEmployed++;
      if (life.career.history.some((h) => h.endedBy === 'fired')) cr.everFired++;
      if (life.career.history.some((h) => h.endedBy === 'laid_off')) cr.everLaidOff++;
      if (life.career.retired) cr.retired++;
      cr.bankrupt.adults++;
      if (life.finances.bankruptcyYear !== undefined) cr.bankrupt.bankrupt++;
      if (!careless && profile.tradeMinded) cr.tradeMinded++;
      if (!careless && !profile.worker) {
        cr.bankrupt.neverWorked++;
        if (life.finances.bankruptcyYear !== undefined) cr.bankrupt.neverWorkedBankrupt++;
      }
    }
    if (life.character.age >= t.money.homeOwnershipAge) {
      cr.homeOwners.reached++;
      if (work.ownedBy !== null && work.ownedBy <= t.money.homeOwnershipAge) cr.homeOwners.owned++;
    }
    cr.jobYears += work.jobYears;
    cr.promotions += work.promotions;
    cr.firings += life.career.history.filter((h) => h.endedBy === 'fired').length;
    cr.layoffs += life.career.history.filter((h) => h.endedBy === 'laid_off').length;
    cr.idleYears.years += work.workingYears;
    cr.idleYears.idle += work.idle;
    for (const [jobId, { best }] of work.tracks) {
      const row = (trackRows[jobId] ??= { jobId, entered: 0, reachedLevel2: 0, reachedTop: 0, years: 0 });
      row.entered++;
      if (best >= 2) row.reachedLevel2++;
      if (best >= (content.jobs[jobId]?.levels.length ?? Infinity)) row.reachedTop++;
    }
    for (const h of life.career.history) if (trackRows[h.jobId]) trackRows[h.jobId]!.years += Math.max(0, h.toYear - h.fromYear);
    for (const row of cr.trades) {
      if (school.trades.has(row.tradeId)) row.enrolled++;
      if (life.education.credentials.some((c) => c.type === 'trade_license' && c.refId === row.tradeId)) row.licensed++;
      if (row.jobIds.some((jobId) => work.tracks.has(jobId))) row.worked++;
    }
    if (life.character.age >= t.careers.earningsAge) {
      earningsByPath[educationPath(life)].push(work.earnings);
      if (life.education.credentials.some((c) => c.type === 'bachelor')) bachelorEarnings.push(work.earnings);
    }

    // Health, the law and self-discovery (Stage 9).
    for (const id of nine.conditions) {
      const row = conditionRows.get(id);
      if (!row) continue;
      row.lives++;
      if (nine.treated.has(id)) row.treated++;
    }
    const causeId = life.death!.causeId;
    causeCounts.set(causeId, (causeCounts.get(causeId) ?? 0) + 1);
    for (const c of life.health.conditions) {
      const def = content.conditions[c.conditionId];
      if (def?.cause === causeId) {
        conditionRows.get(c.conditionId)!.diedOf++;
        break;
      }
    }
    if (nine.sawDoctor) health.sawDoctor++;
    if (nine.medicalDebtAt65 !== null) {
      health.medicalDebtAt65.reached++;
      if (nine.medicalDebtAt65 > 0) medicalDebts.push(nine.medicalDebtAt65);
    }
    const record = life.legal.record;
    for (const r of record) legal.outcomes[r.outcome]++;
    for (const id of new Set(record.map((r) => r.offenseId))) {
      const row = offenseRows.get(id);
      if (row) row.lives++;
    }
    if (record.length > 0) legal.recordLives++;
    if (record.some((r) => r.outcome !== 'warning')) legal.convictedLives++;
    if (record.some((r) => r.outcome === 'probation')) legal.probationLives++;
    if (record.some((r) => r.outcome === 'jail')) legal.jailedLives++;
    legal.yearsInside += nine.yearsInside;
    legal.mostYearsInside = Math.max(legal.mostYearsInside, nine.yearsInside);
    const releases = life.history.filter((e) => e.tags.includes('legal') && e.tags.includes('released'));
    if (releases.length > 0) {
      legal.released++;
      if (record.some((r) => r.year > releases[0]!.year)) legal.reoffended++;
    }
    for (const kind of DISCOVERY_KINDS) {
      const row = discovery.kinds[kind];
      const born = nine.latentAtBirth.has(kind);
      if (born) row.latent++;
      if (nine.surfaced.has(kind)) row.surfaced++;
      if (nine.resurfaced.has(kind)) row.resurfaced++;
      const accepted = born && !hasLatent(life, kind) && (kind === 'talent' ? life.character.hidden.talentDiscovered : true);
      if (accepted && (nine.surfaced.has(kind) || kind !== 'talent')) row.accepted++;
      if (kind !== 'talent' && life.discovery.surfaced[kind] !== undefined && hasLatent(life, kind)) row.heldBack++;
    }
    if (life.discovery.crisisYear !== undefined) discovery.crisisLives++;
    if (life.flags.came_out) discovery.comingOutLives++;
    if (life.history.some((e) => e.tags[0] === 'discovery' && e.tags[1] !== 'talent')) discovery.identityChanged++;
    conflictsAtDeath.push(life.character.hidden.innerConflict);

    const creds = life.education.credentials;
    const diploma = creds.find((c) => c.type === 'hs_diploma');
    if (diploma) education.diplomaAges[diploma.year - life.birthYear] = (education.diplomaAges[diploma.year - life.birthYear] ?? 0) + 1;
    education.largestStudentDebt = Math.max(education.largestStudentDebt, school.maxStudentDebt);
    if (school.lateStudent) education.lateStudents++;
    const leftPrograms = [...school.left].map((k) => k.split(':')[1]);
    if (leftPrograms.includes('high')) education.dropouts.highSchool++;
    if (leftPrograms.some((p) => p !== 'high')) education.dropouts.postSecondary++;
    if (school.studentDebtAt25 !== null) {
      education.studentDebtAt25.lives++;
      if (school.studentDebtAt25 > 0) studentDebts25.push(school.studentDebtAt25);
    }
    if (school.credentialsAt30) {
      const at30 = school.credentialsAt30;
      const wentToCollege = school.collegeAge !== null && school.collegeAge < 30;
      for (const row of [eduRows[life.character.familyWealth], eduRows.all]) {
        row.lives++;
        if (diploma && diploma.year - life.birthYear <= 19) row.diplomaBy19++;
        if (at30.includes('ged')) row.ged++;
        if (!at30.includes('hs_diploma') && !at30.includes('ged')) row.noHighSchool++;
        if (wentToCollege) row.college++;
        if (at30.includes('associate') || at30.includes('bachelor')) row.degree++;
        if (at30.includes('bachelor')) row.bachelor++;
        if (at30.includes('trade_license')) row.tradeLicense++;
        if (creds.some((c) => c.type === 'grad')) row.grad++;
        if (diploma?.gpa !== undefined) row.gpas.push(diploma.gpa);
      }
      if (diploma?.gpa !== undefined) {
        const bucket = gpaBuckets.find((b) => diploma.gpa! < b.below)!;
        bucket.lives++;
        if (wentToCollege) bucket.college++;
      }
    }

    const age = life.character.age;
    if (age >= adultAge) {
      rel.adults++;
      if (romance.dated || romance.marriages > 0) rel.everDated++;
      if (romance.marriages > 0) rel.everMarried++;
    }
    if (age >= 40) {
      rel.reached40++;
      if (romance.firstMarriageAge !== null && romance.firstMarriageAge <= 40) rel.marriedBy40++;
    }
    rel.marriages += romance.marriages;
    rel.divorces += romance.divorces;
    rel.breakups += romance.breakups;
    if (romance.widowed) rel.widowed++;
    if (romance.marriages > 1) rel.remarried++;
    if (romance.firstMarriageAge !== null) firstMarriageAges.push(romance.firstMarriageAge);
    peopleAtEnd.push(Object.values(life.relationships).filter((r) => !isFamilyKind(r.kind) && r.status !== 'ended').length);
  }
  firstMarriageAges.sort((a, b) => a - b);
  peopleAtEnd.sort((a, b) => a - b);
  rel.medianFirstMarriageAge = firstMarriageAges.length > 0 ? firstMarriageAges[Math.floor(firstMarriageAges.length / 2)]! : null;
  rel.peopleAtEnd = { median: peopleAtEnd[Math.floor(peopleAtEnd.length / 2)] ?? 0, most: peopleAtEnd.at(-1) ?? 0 };

  money.byAge = [...atAge.entries()].map(([age, v]) => ({
    age,
    savings: spread(v.savings, v.debt),
    debt: spread(v.debt, v.debt),
    netWorth: spread(v.netWorth, v.debt),
  }));
  firstBenefits.sort((a, b) => a - b);
  money.retirement.medianBenefit = firstBenefits[Math.floor(firstBenefits.length / 2)] ?? 0;
  money.repeatableGains = [...mostFires.entries()]
    .map(([eventId, mostInOneLife]) => {
      const largestGain = gains.get(eventId)!;
      return { eventId, mostInOneLife, largestGain, mostMoney: mostInOneLife * largestGain };
    })
    .sort((a, b) => b.mostMoney - a.mostMoney);

  for (const [key, row] of Object.entries(eduRows)) {
    const { gpas, ...rest } = row;
    gpas.sort((a, b) => a - b);
    education.byWealth[key as FamilyWealth | 'all'] = { ...rest, medianHsGpa: gpas[Math.floor(gpas.length / 2)] ?? 0 };
  }
  education.collegeByGpa = gpaBuckets.map(({ label, lives, college }) => ({ label, lives, college }));
  studentDebts25.sort((a, b) => a - b);
  education.studentDebtAt25.borrowers = studentDebts25.length;
  education.studentDebtAt25.median = studentDebts25[Math.floor(studentDebts25.length / 2)] ?? 0;
  education.studentDebtAt25.p90 = studentDebts25[Math.floor(studentDebts25.length * 0.9)] ?? 0;

  for (const path of EDUCATION_PATHS) careers.earningsByPath[path] = earningsRow(earningsByPath[path]);
  const hsRow = careers.earningsByPath.highSchool;
  const bachelorRow = earningsRow(bachelorEarnings);
  careers.bachelorVsHighSchool = {
    bachelorMean: bachelorRow.mean,
    highSchoolMean: hsRow.mean,
    ratio: hsRow.mean > 0 ? bachelorRow.mean / hsRow.mean : 0,
    bachelorBelowHighSchoolMedian: bachelorEarnings.length > 0 ? bachelorEarnings.filter((e) => e < hsRow.median).length / bachelorEarnings.length : 0,
  };
  careers.tracks = Object.keys(content.jobs)
    .sort()
    .map((jobId) => trackRows[jobId] ?? { jobId, entered: 0, reachedLevel2: 0, reachedTop: 0, years: 0 });

  health.conditions = [...conditionRows.values()];
  health.causes = [...causeCounts.entries()].map(([id, lives]) => ({ id, lives })).sort((a, b) => b.lives - a.lives);
  medicalDebts.sort((a, b) => a - b);
  health.medicalDebtAt65.owing = medicalDebts.length;
  health.medicalDebtAt65.median = medicalDebts[Math.floor(medicalDebts.length / 2)] ?? 0;
  legal.offenses = [...offenseRows.values()];
  conflictsAtDeath.sort((a, b) => a - b);
  discovery.innerConflictAtDeath = {
    median: conflictsAtDeath[Math.floor(conflictsAtDeath.length / 2)] ?? 0,
    above50: conflictsAtDeath.filter((c) => c > 50).length,
  };

  ages.sort((a, b) => a - b);
  const at = (p: number) => ages[Math.min(ages.length - 1, Math.floor(ages.length * p))] ?? 0;
  const totalEventsFired = [...fired.values()].reduce((a, b) => a + b, 0);
  const events = Object.keys(content.events)
    .sort()
    .map((id) => ({
      id,
      fired: fired.get(id) ?? 0,
      share: totalEventsFired > 0 ? (fired.get(id) ?? 0) / totalEventsFired : 0,
      lives: livesWith.get(id) ?? 0,
    }));

  return {
    lives: options.lives,
    player: playerKind,
    invariantFailures,
    failureMessages,
    lifespan: {
      median: at(0.5),
      p10: at(0.1),
      p90: at(0.9),
      youngest: ages[0] ?? 0,
      oldest: ages[ages.length - 1] ?? 0,
      under18: ages.filter((a) => a < 18).length,
    },
    eventsPerYear: perYear,
    yearsOverCap,
    events,
    totalEventsFired,
    deathsFromEvents,
    relationships: rel,
    money,
    education,
    careers,
    health,
    legal,
    discovery,
    interactions,
    family,
    people,
    web,
    mental,
    possessions,
    teen,
    crime,
    fame: { ...fame, famousAtTarget },
    sports,
    consistency: {
      violations,
      happiness: spreadOf(lifetimeHappiness),
      repeats: {
        mean: repeatShares.length > 0 ? repeatShares.reduce((a, b) => a + b, 0) / repeatShares.length : 0,
        p90: spreadOf(repeatShares).p90,
        top: [...repeatsByEvent.entries()]
          .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1))
          .slice(0, 15)
          .map(([id, n]) => ({ id, repeats: n })),
      },
    },
  };
}

/** Mean, median and 10th/90th percentiles. */
function spreadOf(values: number[]): { mean: number; median: number; p10: number; p90: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  const mean = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
  return { mean, median: at(0.5), p10: at(0.1), p90: at(0.9) };
}

function earningsRow(values: number[]): EarningsRow {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  const mean = sorted.length > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0;
  return { lives: sorted.length, mean, p10: at(0.1), median: at(0.5), p90: at(0.9) };
}

const dollars = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US')}`;

const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : '—');

/** A plain-text summary of a report. */
export function formatReport(report: SimulationReport, content: ContentBundle): string {
  const lines: string[] = [];
  const { lifespan } = report;
  lines.push(`Simulated ${report.lives} lives.`);
  lines.push(`Invariant failures: ${report.invariantFailures}`);
  for (const m of report.failureMessages) lines.push(`  - ${m}`);
  lines.push(
    `Lifespan: median ${lifespan.median}, 10th percentile ${lifespan.p10}, 90th ${lifespan.p90}, youngest ${lifespan.youngest}, ` +
      `oldest ${lifespan.oldest}; died before 18: ${lifespan.under18} (${pct(lifespan.under18, report.lives)}); ` +
      `killed by an event: ${report.deathsFromEvents}`,
  );
  lines.push('Events per year (budget range; average; most; years below the minimum):');
  for (const [stage, y] of Object.entries(report.eventsPerYear)) {
    const b = content.balance.pacing.budgets[stage as LifeStage];
    lines.push(
      `  ${stage.padEnd(10)} ${b.min}–${b.max}; avg ${(y.years ? y.events / y.years : 0).toFixed(2)}; most ${y.most}; below min ${pct(y.belowMin, y.years)}`,
    );
  }
  lines.push(`Years over the cap of ${content.balance.pacing.cap}: ${report.yearsOverCap}`);
  const r = report.relationships;
  lines.push(`Relationships (${r.adults} lives reached ${content.balance.relationships.adultAge}):`);
  lines.push(`  ever dated ${pct(r.everDated, r.adults)}; ever married ${pct(r.everMarried, r.adults)}; married by 40: ${pct(r.marriedBy40, r.reached40)} of ${r.reached40} lives that reached 40`);
  lines.push(
    `  marriages ${r.marriages}; divorces ${r.divorces} (${pct(r.divorces, r.marriages)} of marriages); married more than once ${pct(r.remarried, r.everMarried)} of married lives; ` +
      `widowed ${pct(r.widowed, r.everMarried)} of married lives; breakups before marriage ${r.breakups}`,
  );
  lines.push(`  median age at first marriage: ${r.medianFirstMarriageAge ?? '—'}`);
  lines.push(`  actions taken: ${ACTION_IDS.map((id) => `${id} ${r.actionsTaken[id]}`).join(', ')}`);
  lines.push(`  people outside family still in your life at the end: median ${r.peopleAtEnd.median}, most ${r.peopleAtEnd.most}`);
  const m = report.money;
  lines.push(`Money (${m.adults} lives reached ${content.balance.economy.independenceAge}):`);
  lines.push('  age      savings p10 / median / p90          debt p10 / median / p90     net worth p10 / median / p90   in debt');
  for (const row of m.byAge) {
    const three = (s: Spread) => `${dollars(s.p10)} / ${dollars(s.median)} / ${dollars(s.p90)}`;
    lines.push(
      `  ${String(row.age).padEnd(6)} ${three(row.savings).padEnd(33)} ${three(row.debt).padEnd(27)} ${three(row.netWorth).padEnd(30)} ${pct(row.debt.inDebt, row.debt.lives)} of ${row.debt.lives}`,
    );
  }
  lines.push(
    `  largest ever: savings ${dollars(m.largest.savings)}, debt ${dollars(m.largest.debt)}, net worth ${dollars(m.largest.netWorth)} (${m.largest.netWorthSeed}); ` +
      `safe integer limit ${dollars(Number.MAX_SAFE_INTEGER)}`,
  );
  const o = m.outcomes;
  lines.push(
    `  gig work ${pct(o.gig, m.adults)}; moved out ${pct(o.movedOut, m.adults)}; relocated ${pct(o.relocated, m.adults)}; owned a home ${pct(o.owned, m.adults)}; ` +
      `lived with a partner ${pct(o.livedTogether, m.adults)}; ` +
      `debt in collections ${pct(o.collections, m.adults)}; debt plan ${pct(o.debtPlan, m.adults)}; bankrupt ${pct(o.bankrupt, m.adults)}; ` +
      `evicted ${pct(o.evicted, m.adults)}; homeless ${pct(o.homeless, m.adults)}; foreclosed ${pct(o.foreclosed, m.adults)}`,
  );
  const { retirement: ret, seniors } = m;
  lines.push(
    `  retirement (${ret.reached} lives reached ${content.balance.economy.retirement.age}): benefit paid to ${pct(ret.withBenefit, ret.reached)}, ` +
      `median first-year benefit ${dollars(ret.medianBenefit)}; seniors ran short (borrowed or missed a payment) in ${pct(seniors.shortYears, seniors.years)} ` +
      `of ${seniors.years} years, ${pct(seniors.livesShort, ret.reached)} of lives at least once; evicted after ${content.balance.economy.retirement.age}: ${pct(seniors.livesEvicted, ret.reached)}`,
  );
  lines.push(`  actions taken: ${LIFE_ACTION_IDS.map((id) => `${id} ${m.actionsTaken[id]}`).join(', ')}`);
  lines.push(
    `  gig-only renters who couldn't cover their costs, by city: ${Object.entries(m.gigRenting)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([city, y]) => `${city} ${pct(y.shortYears, y.years)} of ${y.years} years`)
      .join('; ')}`,
  );
  lines.push(
    `  repeatable money (most times one life got it × largest gain): ${m.repeatableGains
      .slice(0, 5)
      .map((g) => `${g.eventId} ${g.mostInOneLife} × ${dollars(g.largestGain)} = ${dollars(g.mostMoney)}`)
      .join('; ')}`,
  );
  const e = report.education;
  lines.push(`Education (lives that reached 30, by family wealth):`);
  lines.push('  wealth      lives  diploma by 19   GED  no HS at 30  college by 30  degree by 30  bachelor  trade license  grad degree  median HS GPA');
  for (const w of [...WEALTHS, 'all'] as const) {
    const r = e.byWealth[w];
    lines.push(
      `  ${w.padEnd(10)} ${String(r.lives).padStart(6)} ${pct(r.diplomaBy19, r.lives).padStart(14)} ${pct(r.ged, r.lives).padStart(5)} ${pct(r.noHighSchool, r.lives).padStart(12)} ` +
        `${pct(r.college, r.lives).padStart(14)} ${pct(r.degree, r.lives).padStart(13)} ${pct(r.bachelor, r.lives).padStart(9)} ${pct(r.tradeLicense, r.lives).padStart(14)} ` +
        `${pct(r.grad, r.lives).padStart(12)} ${r.medianHsGpa.toFixed(2).padStart(14)}`,
    );
  }
  lines.push(`  college by 30, by high school GPA: ${e.collegeByGpa.map((b) => `${b.label} ${pct(b.college, b.lives)} of ${b.lives}`).join('; ')}`);
  lines.push(`  high school diploma at age: ${Object.entries(e.diplomaAges).map(([age, n]) => `${age}: ${n}`).join(', ')}`);
  lines.push(`  applications (accepted / tried): ${Object.entries(e.applications).map(([k, v]) => `${k} ${v.accepted}/${v.tried} (${pct(v.accepted, v.tried)})`).join('; ')}`);
  lines.push(
    `  left without finishing: high school ${pct(e.dropouts.highSchool, report.lives)} of lives, college/trade/grad ${pct(e.dropouts.postSecondary, report.lives)}; ` +
      `started or went back to school at 25+: ${pct(e.lateStudents, report.lives)}`,
  );
  const sd = e.studentDebtAt25;
  lines.push(
    `  student debt at 25: ${pct(sd.borrowers, sd.lives)} of ${sd.lives} lives owe any; median ${dollars(sd.median)}, 90th percentile ${dollars(sd.p90)} (of those who owe); largest ever ${dollars(e.largestStudentDebt)}`,
  );
  lines.push(...formatCareers(report, content));
  lines.push(...formatStage9(report, content));
  lines.push(...formatConsistency(report, content));
  lines.push(...formatInteractions(report.interactions, content), '  targets (src/content/balance/targets.yaml):', ...interactionTargets(report, content).map((r) => target(r.label, r.value, r.goal, r.met)));
  lines.push(...formatFamily(report.family, content), '  targets (src/content/balance/targets.yaml):', ...familyTargets(report.family, content).map((r) => target(r.label, r.value, r.goal, r.met)));
  lines.push(...formatPeople(report.people, content, report.relationships.divorces), '  targets (src/content/balance/targets.yaml):', ...peopleTargets(report, content).map((r) => target(r.label, r.value, r.goal, r.met)));
  lines.push('', ...formatWeb(report.web, content), '  targets (src/content/balance/targets.yaml):', ...webTargets(report, content).map((r) => target(r.label, r.value, r.goal, r.met)));
  lines.push('', ...formatMental(report.mental, content, report.events), '  targets (src/content/balance/targets.yaml):', ...mentalTargets(report, content).map((r) => target(r.label, r.value, r.goal, r.met)));
  lines.push(...formatPossessions(report.possessions, content, report.events), '  targets (src/content/balance/targets.yaml):', ...possessionsTargets(report, content).map((r) => target(r.label, r.value, r.goal, r.met)));
  lines.push(...formatTeen(report.teen, content), '  targets (src/content/balance/targets.yaml):', ...teenTargets(report, content).map((r) => target(r.label, r.value, r.goal, r.met)));
  lines.push(...formatCrime(report.crime, content), '  targets (src/content/balance/targets.yaml):', ...crimeTargets(report, content).map((r) => target(r.label, r.value, r.goal, r.met)));
  lines.push(...formatFame(report.fame, content), '  targets (src/content/balance/targets.yaml):', ...fameTargets(report, content).map((r) => target(r.label, r.value, r.goal, r.met)));
  lines.push(...formatSports(report.sports, content), '  targets (src/content/balance/targets.yaml):', ...sportsTargets(report, content).map((r) => target(r.label, r.value, r.goal, r.met)));
  lines.push(`Events fired: ${report.totalEventsFired}`);
  lines.push('  event'.padEnd(30) + 'fired'.padStart(8) + 'share'.padStart(8) + 'lives'.padStart(9));
  for (const e of [...report.events].sort((a, b) => b.fired - a.fired)) {
    lines.push(
      `  ${e.id.padEnd(28)}${String(e.fired).padStart(8)}${pct(e.fired, report.totalEventsFired).padStart(8)}${pct(e.lives, report.lives).padStart(9)}`,
    );
  }
  return lines.join('\n');
}

const PATH_LABELS: Record<EducationPath, string> = {
  none: 'no diploma',
  highSchool: 'high school',
  trade: 'trade license',
  associate: 'associate',
  bachelor: "bachelor's",
  grad: 'grad degree',
};

/** A target line: the value, the target, and whether it is met. */
function target(label: string, value: string, goal: string, met: boolean): string {
  return `  ${met ? 'MET    ' : 'NOT MET'} ${label}: ${value} (target ${goal})`;
}

/** The careers section of the report (Stage 8). */
function formatCareers(report: SimulationReport, content: ContentBundle): string[] {
  const lines: string[] = [];
  const c = report.careers;
  const t = content.balance.targets;
  const rate = (n: number) => (c.jobYears > 0 ? n / c.jobYears : 0);
  const pct1 = (x: number) => `${(100 * x).toFixed(1)}%`;
  lines.push(`Careers (${c.adults} lives reached ${content.balance.economy.independenceAge}):`);
  lines.push(
    `  ever had a job ${pct(c.everEmployed, c.adults)}; ever fired ${pct(c.everFired, c.adults)}; ever laid off ${pct(c.everLaidOff, c.adults)}; retired ${pct(c.retired, c.adults)}; ` +
      `working-age years with no job or gig work ${pct(c.idleYears.idle, c.idleYears.years)} of ${c.idleYears.years}`,
  );
  lines.push(
    `  applications: hired ${c.applications.hired}/${c.applications.tried} (${pct(c.applications.hired, c.applications.tried)}); raises asked for: got ${c.raisesAsked.got}/${c.raisesAsked.asked} (${pct(c.raisesAsked.got, c.raisesAsked.asked)})`,
  );
  lines.push(`  per year worked (${c.jobYears} years): promotions ${pct1(rate(c.promotions))}, firings ${pct1(rate(c.firings))}, layoffs ${pct1(rate(c.layoffs))}`);
  lines.push(`  lifetime earnings by education path (lives that reached ${t.careers.earningsAge}; salaries and gig pay before tax):`);
  lines.push('    path            lives          mean           p10        median           p90');
  for (const path of EDUCATION_PATHS) {
    const r = c.earningsByPath[path];
    lines.push(
      `    ${PATH_LABELS[path].padEnd(14)} ${String(r.lives).padStart(6)} ${dollars(r.mean).padStart(13)} ${dollars(r.p10).padStart(13)} ${dollars(r.median).padStart(13)} ${dollars(r.p90).padStart(13)}`,
    );
  }
  lines.push('  job tracks (lives that entered; reached level 2; reached the top; years worked):');
  for (const tr of c.tracks) {
    lines.push(`    ${tr.jobId.padEnd(24)} ${String(tr.entered).padStart(5)} ${pct(tr.reachedLevel2, tr.entered).padStart(7)} ${pct(tr.reachedTop, tr.entered).padStart(7)} ${String(tr.years).padStart(6)}`);
  }
  lines.push(`  trades (${c.tradeMinded} careful players set on trade school; lives that started trade school for it, earned the license, worked in a job that needs it):`);
  for (const tr of c.trades) {
    lines.push(`    ${tr.tradeId.padEnd(24)} ${String(tr.enrolled).padStart(5)} ${String(tr.licensed).padStart(5)} ${String(tr.worked).padStart(5)}  (${tr.jobIds.join(', ') || 'no job needs it'})`);
  }
  const unentered = c.tracks.filter((tr) => tr.entered === 0).map((tr) => tr.jobId);
  lines.push('  targets (src/content/balance/targets.yaml):');
  for (const r of targetResults(report, content)) lines.push(target(r.label, r.value, r.goal, r.met));
  if (unentered.length > 0) lines.push(`  job tracks nobody entered: ${unentered.join(', ')}`);
  return lines;
}

export interface TargetResult {
  label: string;
  value: string;
  /** The value in a few characters, for the side-by-side comparison. */
  short: string;
  goal: string;
  met: boolean;
}

/** Each target in balance/targets.yaml, measured on this report. */
export function targetResults(report: SimulationReport, content: ContentBundle): TargetResult[] {
  const c = report.careers;
  const t = content.balance.targets;
  const ct = t.careers;
  const pct1 = (x: number) => `${(100 * x).toFixed(1)}%`;
  const rate = (n: number) => (c.jobYears > 0 ? n / c.jobYears : 0);
  const inRange = (x: number, r: { min: number; max: number }) => x >= r.min && x <= r.max;
  const bk = c.bankrupt;
  const b = c.bachelorVsHighSchool;
  const dead = c.tracks.filter((tr) => tr.entered >= 10 && tr.reachedLevel2 / tr.entered < ct.minReachLevel2);
  const worth = report.money.byAge.find((row) => row.age === t.money.netWorthAge)?.netWorth;
  const nw = t.money.medianNetWorth;
  return [
    {
      label: 'bankruptcy',
      value:
        pct(bk.bankrupt, bk.adults) +
        (bk.neverWorked > 0 ? `; ${pct(bk.neverWorkedBankrupt, bk.neverWorked)} of the ${bk.neverWorked} simulated players who never work` : ''),
      short: pct(bk.bankrupt, bk.adults),
      goal: `at most ${pct1(t.money.maxBankruptLives)}`,
      met: bk.bankrupt <= t.money.maxBankruptLives * bk.adults,
    },
    {
      label: `owned a home by ${t.money.homeOwnershipAge}`,
      value: pct(c.homeOwners.owned, c.homeOwners.reached),
      short: pct(c.homeOwners.owned, c.homeOwners.reached),
      goal: `at least ${pct1(t.money.minHomeOwners)}`,
      met: c.homeOwners.owned >= t.money.minHomeOwners * c.homeOwners.reached,
    },
    {
      label: `median net worth at ${t.money.netWorthAge}`,
      value: worth ? `${dollars(worth.median)} (of ${worth.lives} lives)` : '—',
      short: worth ? dollars(worth.median) : '—',
      goal: `${dollars(nw.min)}–${dollars(nw.max)}`,
      met: worth !== undefined && worth.lives > 0 && inRange(worth.median, nw),
    },
    {
      label: "bachelor's vs high school lifetime earnings",
      value: `${b.ratio.toFixed(2)}× (${dollars(b.bachelorMean)} vs ${dollars(b.highSchoolMean)})`,
      short: `${b.ratio.toFixed(2)}×`,
      goal: `at least ${ct.minBachelorEarningsRatio}×`,
      met: b.ratio >= ct.minBachelorEarningsRatio,
    },
    {
      label: "bachelor's holders earning less than the median high-school life",
      value: pct1(b.bachelorBelowHighSchoolMedian),
      short: pct1(b.bachelorBelowHighSchoolMedian),
      goal: `at least ${pct1(ct.minBachelorBelowHighSchoolMedian)}`,
      met: b.bachelorBelowHighSchoolMedian >= ct.minBachelorBelowHighSchoolMedian,
    },
    {
      label: 'job tracks where under the target share reach level 2 (tracks with 10+ lives)',
      value: dead.length === 0 ? 'none' : dead.map((tr) => `${tr.jobId} ${pct(tr.reachedLevel2, tr.entered)}`).join(', '),
      short: dead.length === 0 ? 'none' : `${dead.length} tracks`,
      goal: `at least ${pct1(ct.minReachLevel2)} in every track`,
      met: dead.length === 0,
    },
    {
      label: 'promotions per year worked',
      value: pct1(rate(c.promotions)),
      short: pct1(rate(c.promotions)),
      goal: `${pct1(ct.promotionRate.min)}–${pct1(ct.promotionRate.max)}`,
      met: inRange(rate(c.promotions), ct.promotionRate),
    },
    {
      label: 'firings per year worked',
      value: pct1(rate(c.firings)),
      short: pct1(rate(c.firings)),
      goal: `${pct1(ct.firingRate.min)}–${pct1(ct.firingRate.max)}`,
      met: inRange(rate(c.firings), ct.firingRate),
    },
    {
      label: 'layoffs per year worked',
      value: pct1(rate(c.layoffs)),
      short: pct1(rate(c.layoffs)),
      goal: `${pct1(ct.layoffRate.min)}–${pct1(ct.layoffRate.max)}`,
      met: inRange(rate(c.layoffs), ct.layoffRate),
    },
  ];
}

/**
 * Two runs side by side (the same seeds): the careful player the targets are
 * judged on, and the careless one (random actions, no caution rules), whose
 * column shows how the game treats a player who takes no care. The game is
 * not tuned for the careless player.
 */
export function formatComparison(careful: SimulationReport, careless: SimulationReport, content: ContentBundle): string {
  const lines: string[] = [];
  const t = content.balance.targets;
  const row = (label: string, a: string, b: string) => `  ${label.padEnd(48)} ${a.padStart(22)}   ${b.padStart(22)}`;
  const rate = (r: SimulationReport, n: (c: CareerReport) => number) => (r.careers.jobYears > 0 ? `${((100 * n(r.careers)) / r.careers.jobYears).toFixed(1)}%` : '—');
  const median = (r: SimulationReport, age: number | 'death') => {
    const s = r.money.byAge.find((x) => x.age === age)?.netWorth;
    return s ? dollars(s.median) : '—';
  };
  lines.push(`Careful vs careless player (${careful.lives} lives each, the same seeds; the careless player takes random actions with no caution rules):`);
  lines.push(row('', 'careful', 'careless'));
  lines.push(row('invariant failures', String(careful.invariantFailures), String(careless.invariantFailures)));
  lines.push(row('median lifespan', String(careful.lifespan.median), String(careless.lifespan.median)));
  const both = (f: (r: SimulationReport) => string, label: string) => lines.push(row(label, f(careful), f(careless)));
  both((r) => pct(r.relationships.everMarried, r.relationships.adults), 'ever married');
  both((r) => pct(r.relationships.divorces, r.relationships.marriages), 'divorces per marriage');
  both((r) => pct(r.education.byWealth.all.diplomaBy19, r.education.byWealth.all.lives), 'high school diploma by 19 (lives that reached 30)');
  both((r) => pct(r.education.byWealth.all.degree, r.education.byWealth.all.lives), 'college degree by 30');
  both((r) => pct(r.careers.everEmployed, r.careers.adults), 'ever had a job');
  both((r) => pct(r.careers.everFired, r.careers.adults), 'ever fired');
  both((r) => pct(r.careers.idleYears.idle, r.careers.idleYears.years), 'working-age years with no job or gig work');
  both((r) => rate(r, (c) => c.promotions), 'promotions per year worked');
  both((r) => pct(r.money.outcomes.homeless, r.money.adults), 'ever homeless');
  both((r) => pct(r.money.outcomes.evicted, r.money.adults), 'ever evicted');
  both((r) => median(r, t.money.netWorthAge), `median net worth at ${t.money.netWorthAge}`);
  both((r) => median(r, 'death'), 'median net worth at death');
  both((r) => pct(r.health.sawDoctor, r.lives), 'ever saw a doctor');
  both((r) => pct(r.legal.recordLives, r.lives), 'any criminal record');
  both((r) => pct(r.legal.convictedLives, r.lives), 'convicted (more than a warning)');
  both((r) => pct(r.legal.illegalChoices.taken, r.legal.illegalChoices.offered), 'illegal choices taken when offered');
  both((r) => pct(r.legal.jailedLives, r.lives), 'went to prison');
  both((r) => pct(r.discovery.identityChanged, r.lives), 'identity changed through self-discovery');
  lines.push('  targets (src/content/balance/targets.yaml; judged on the careful player):');
  const a = [...targetResults(careful, content), ...stage9Targets(careful, content), ...consistencyTargets(careful, content), ...interactionTargets(careful, content)];
  const b = [...targetResults(careless, content), ...stage9Targets(careless, content), ...consistencyTargets(careless, content), ...interactionTargets(careless, content)];
  a.forEach((x, i) => {
    const y = b[i]!;
    lines.push(row(x.label.length > 46 ? `${x.label.slice(0, 45)}…` : x.label, `${x.met ? 'MET' : 'NOT MET'}`, `${y.met ? 'MET' : 'NOT MET'}`));
    lines.push(row(`    target ${x.goal}`, x.short, y.short));
  });
  return lines.join('\n');
}

/** C1: consistency violations, lifetime Happiness and repeats. */
function formatConsistency(report: SimulationReport, content: ContentBundle): string[] {
  const c = report.consistency;
  const pct1 = (x: number) => `${(100 * x).toFixed(1)}%`;
  return [
    'Consistency (C1):',
    `  consistency violations (category contracts, presence): ${c.violations}`,
    `  lifetime Happiness: mean ${c.happiness.mean.toFixed(1)}, median ${c.happiness.median.toFixed(1)}, 10th percentile ${c.happiness.p10.toFixed(1)}, 90th ${c.happiness.p90.toFixed(1)}`,
    `  repeats of events not marked recurring: ${pct1(c.repeats.mean)} of events fired per life on average (90th percentile ${pct1(c.repeats.p90)})`,
    `  most repeated (not recurring): ${c.repeats.top.map((t) => `${t.id} ${t.repeats}`).join(', ') || 'none'}`,
    '  targets (src/content/balance/targets.yaml):',
    ...consistencyTargets(report, content).map((r) => target(r.label, r.value, r.goal, r.met)),
  ];
}

/** The C1 targets, measured on this report. */
export function consistencyTargets(report: SimulationReport, content: ContentBundle): TargetResult[] {
  const t = content.balance.targets.consistency;
  const c = report.consistency;
  const pct1 = (x: number) => `${(100 * x).toFixed(1)}%`;
  return [
    { label: 'consistency violations', value: String(c.violations), short: String(c.violations), goal: '0', met: c.violations === 0 },
    {
      label: 'average lifetime Happiness',
      value: c.happiness.mean.toFixed(1),
      short: c.happiness.mean.toFixed(1),
      goal: `${t.lifetimeHappiness.min}–${t.lifetimeHappiness.max}`,
      met: c.happiness.mean >= t.lifetimeHappiness.min && c.happiness.mean <= t.lifetimeHappiness.max,
    },
    {
      label: 'repeats of events not marked recurring, per life',
      value: pct1(c.repeats.mean),
      short: pct1(c.repeats.mean),
      goal: `under ${pct1(t.maxRepeatShare)}`,
      met: c.repeats.mean < t.maxRepeatShare,
    },
  ];
}

/** Health, the law and self-discovery (Stage 9). */
function formatStage9(report: SimulationReport, content: ContentBundle): string[] {
  const lines: string[] = [];
  const n = report.lives;
  const h = report.health;
  lines.push(`Health (all ${n} lives):`);
  lines.push('    condition                 lives   treated   died of it');
  for (const c of h.conditions) {
    lines.push(`    ${c.id.padEnd(24)} ${pct(c.lives, n).padStart(6)} ${pct(c.treated, c.lives).padStart(9)} ${pct(c.diedOf, n).padStart(12)}`);
  }
  lines.push(`  doctor visits ${h.doctorVisits} (${(h.doctorVisits / Math.max(1, n)).toFixed(1)} a life); lives that ever saw a doctor ${pct(h.sawDoctor, n)}`);
  lines.push(
    `  medical debt at 65: ${pct(h.medicalDebtAt65.owing, h.medicalDebtAt65.reached)} of ${h.medicalDebtAt65.reached} lives owe any; median ${dollars(h.medicalDebtAt65.median)} (of those who owe)`,
  );
  lines.push(`  causes of death: ${h.causes.map((c) => `${content.causes[c.id]?.text ?? c.id} ${pct(c.lives, n)}`).join(', ')}`);
  const l = report.legal;
  lines.push('The law:');
  lines.push(
    `  any record ${pct(l.recordLives, n)}; convicted (more than a warning) ${pct(l.convictedLives, n)}; probation ${pct(l.probationLives, n)}; prison ${pct(l.jailedLives, n)}`,
  );
  lines.push(`  record entries: ${(Object.keys(l.outcomes) as RecordOutcome[]).map((k) => `${k} ${l.outcomes[k]}`).join(', ')}`);
  lines.push(
    `  years in prison: ${l.yearsInside} in all, most in one life ${l.mostYearsInside}; released ${l.released}, sentenced again after release ${pct(l.reoffended, l.released)}`,
  );
  lines.push(`  offenses (lives with it on record): ${l.offenses.map((o) => `${o.id} ${pct(o.lives, n)}`).join(', ')}`);
  const ic = l.illegalChoices;
  lines.push(
    `  illegal choices: ${ic.events.length} events offer one (${ic.events.join(', ')}); offered ${ic.offered} times, taken ${ic.taken} (${pct(ic.taken, ic.offered)})`,
  );
  const d = report.discovery;
  lines.push('Self-discovery (lives born with it; surfaced; accepted; came back after being pushed down; died holding it back):');
  for (const kind of DISCOVERY_KINDS) {
    const k = d.kinds[kind];
    lines.push(
      `    ${kind.padEnd(12)} ${pct(k.latent, n).padStart(6)} ${pct(k.surfaced, n).padStart(7)} ${pct(k.accepted, n).padStart(7)} ${pct(k.resurfaced, n).padStart(7)} ${pct(k.heldBack, n).padStart(7)}`,
    );
  }
  lines.push(
    `  identity changed ${pct(d.identityChanged, n)}; crisis ${pct(d.crisisLives, n)}; came out ${pct(d.comingOutLives, n)}; inner conflict at death: median ${d.innerConflictAtDeath.median}, above 50 in ${pct(d.innerConflictAtDeath.above50, n)}`,
  );
  lines.push('  targets (src/content/balance/targets.yaml):');
  for (const r of stage9Targets(report, content)) lines.push(target(r.label, r.value, r.goal, r.met));
  return lines;
}

/** The Stage 9 targets (and the lifespan target), measured on this report. */
export function stage9Targets(report: SimulationReport, content: ContentBundle): TargetResult[] {
  const t = content.balance.targets;
  const n = report.lives;
  const share = (x: number) => (n > 0 ? x / n : 0);
  const pct1 = (x: number) => `${(100 * x).toFixed(1)}%`;
  const inRange = (x: number, r: { min: number; max: number }) => x >= r.min && x <= r.max;
  const row = (label: string, value: number, range: { min: number; max: number }): TargetResult => ({
    label,
    value: pct1(value),
    short: pct1(value),
    goal: `${pct1(range.min)}–${pct1(range.max)}`,
    met: inRange(value, range),
  });
  const out: TargetResult[] = [
    {
      label: 'median lifespan',
      value: String(report.lifespan.median),
      short: String(report.lifespan.median),
      goal: `${t.lifespan.median.min}–${t.lifespan.median.max}`,
      met: inRange(report.lifespan.median, t.lifespan.median),
    },
  ];
  for (const c of report.health.conditions) {
    const range = t.health.conditions[c.id];
    if (range) out.push(row(`lives with ${c.id}`, share(c.lives), range));
  }
  for (const o of report.legal.offenses) {
    const range = t.legal.offenses[o.id];
    if (range) out.push(row(`lives with ${o.id} on record`, share(o.lives), range));
  }
  out.push(row('lives that go to prison', share(report.legal.jailedLives), t.legal.jailed));
  for (const kind of DISCOVERY_KINDS) out.push(row(`lives where ${kind} surfaced`, share(report.discovery.kinds[kind].surfaced), t.discovery.surfaced[kind]));
  return out;
}

/** E1: how interactions go (judged on the careful player) and that repeating never maxes out a neutral relationship. */
export function interactionTargets(report: SimulationReport, content: ContentBundle): TargetResult[] {
  const t = content.balance.targets.interactions;
  const r = report.interactions;
  const share = (n: number) => (r.interactions > 0 ? n / r.interactions : 0);
  const pct1 = (x: number) => `${(100 * x).toFixed(1)}%`;
  const range = (x: { min: number; max: number }) => `${pct1(x.min)}–${pct1(x.max)}`;
  const great = share(r.tiers.great);
  const backfire = share(r.tiers.backfire);
  const good = share(r.tiers.great + r.tiers.good);
  const cap = content.balance.interactions.returns;
  return [
    { label: 'interactions that go great', value: pct1(great), short: pct1(great), goal: range(t.great), met: great >= t.great.min && great <= t.great.max },
    { label: 'interactions that backfire', value: pct1(backfire), short: pct1(backfire), goal: range(t.backfire), met: backfire >= t.backfire.min && backfire <= t.backfire.max },
    { label: 'interactions that go well (good or great)', value: pct1(good), short: pct1(good), goal: `under ${pct1(t.maxGoodShare)}`, met: good < t.maxGoodShare },
    {
      label: 'neutral relationships taken to maximum affection in a year',
      value: String(r.affection.neutralToMax),
      short: String(r.affection.neutralToMax),
      goal: '0',
      met: r.affection.neutralToMax === 0,
    },
    {
      label: 'most affection gained from interactions in a year',
      value: String(r.affection.mostGainedInYear),
      short: String(r.affection.mostGainedInYear),
      goal: `at most ${cap.yearlyCap.affection}`,
      met: r.affection.mostGainedInYear <= cap.yearlyCap.affection,
    },
    {
      label: 'lives rebuilt exactly from their input logs',
      value: `${r.replay.checked - r.replay.mismatches} of ${r.replay.checked}`,
      short: `${r.replay.checked - r.replay.mismatches}/${r.replay.checked}`,
      goal: 'all',
      met: r.replay.mismatches === 0,
    },
  ];
}
