/**
 * School and work life, simulated and measured (Batch 3): the simulated
 * player's choices in school (a plan for how hard to work, a tutor, cheating,
 * skipping, talking to teachers, the choice at 16) and at work (a plan for how
 * hard to work, time with coworkers, the party, reporting a coworker), and what
 * they lead to: whether the actions move grades, stress and performance in
 * both directions, what a tutor costs through finance, classmates and teachers
 * each school year, exams by country, the UK's choice at 16, Quebec's CEGEP,
 * coworkers by workplace size and the ties between them, the People list's
 * size, and (must be zero) romance with a teacher or anyone under 18. The
 * watcher compares each year's state before and after `beginYear`, so nothing
 * here touches the engine.
 */
import type { ContentBundle, ExamId } from '../../src/content/schemas';
import { SCHOOL_PATHS } from '../../src/content/schemas';
import { isLifeActionAvailable, type LifeActionId, type LifeActionParams } from '../../src/engine/actions';
import { countryOfCity } from '../../src/engine/country';
import { isIndependent } from '../../src/engine/finance';
import { weightedPick } from '../../src/engine/random';
import { chance, pick, type RngState } from '../../src/engine/rng';
import { apprenticeTrades } from '../../src/engine/school/choice';
import { admissionExamPoints } from '../../src/engine/school/exams';
import { teacherRomanceFailures } from '../../src/engine/school/invariants';
import { weakestSubject } from '../../src/engine/school/report';
import { tutorCost } from '../../src/engine/school/rules';
import { romanceUnderAgeFailures } from '../../src/engine/teen/invariants';
import { currentCoworkers, workplaceSize } from '../../src/engine/career';
import { getTie, tieStatus } from '../../src/engine/web/query';
import type { LifeState } from '../../src/engine/types';
import { crowdSize } from './people';
import type { SimulationReport, TargetResult } from './run';

type Action = [LifeActionId, LifeActionParams];
export type SchoolPlan = 'none' | 'study' | 'slack' | 'tutor' | 'cheat' | 'skip' | 'mixed';
export type WorkPlan = 'none' | 'hard' | 'slack' | 'social' | 'mixed';
const SCHOOL_PLANS: readonly SchoolPlan[] = ['none', 'study', 'slack', 'tutor', 'cheat', 'skip', 'mixed'];
const WORK_PLANS: readonly WorkPlan[] = ['none', 'hard', 'slack', 'social', 'mixed'];

/** Chances describing the simulated player (like the other bots'), not the game. */
const POLICY = {
  schoolPlans: { none: 0.22, study: 0.2, slack: 0.16, tutor: 0.1, cheat: 0.1, skip: 0.1, mixed: 0.12 } as Record<SchoolPlan, number>,
  workPlans: { none: 0.25, hard: 0.25, slack: 0.15, social: 0.2, mixed: 0.15 } as Record<WorkPlan, number>,
  talker: 0.5,
  party: 0.5,
  reporter: 0.12,
  /** The choice at 16, for a country that has one. */
  path: { stay: 0.58, college: 0.14, apprenticeship: 0.14, work: 0.14 } as Record<string, number>,
  /** Yearly chances of a conversation with a teacher. */
  teacher: { askHelp: 0.7, suckUp: 0.15, argue: 0.08, report: 0.06, chat: 0.2 },
  classmateChat: 0.4,
};

export interface SchoolLifeProfile {
  school: SchoolPlan;
  work: WorkPlan;
  talker: boolean;
  partygoer: boolean;
  reporter: boolean;
}

export function rollSchoolLifeProfile(rng: RngState): SchoolLifeProfile {
  return {
    school: weightedPick(rng, SCHOOL_PLANS.map((p) => [p, POLICY.schoolPlans[p]] as const)),
    work: weightedPick(rng, WORK_PLANS.map((p) => [p, POLICY.workPlans[p]] as const)),
    talker: chance(rng, POLICY.talker),
    partygoer: chance(rng, POLICY.party),
    reporter: chance(rng, POLICY.reporter),
  };
}

/** The school and work actions the simulated player takes this year, drawing from `rng`. */
export function chooseSchoolLifeActions(life: LifeState, content: ContentBundle, rng: RngState, profile: SchoolLifeProfile): Action[] {
  const out: Action[] = [];
  if (life.phase !== 'yearStart') return out;
  const can = (id: LifeActionId, params: LifeActionParams = {}) => isLifeActionAvailable(life, id, params, content);
  const cur = life.education.current;

  if (cur) {
    const plan = profile.school === 'mixed' ? pick(rng, ['study', 'slack', 'tutor', 'cheat', 'skip', 'none'] as const) : profile.school;
    const weak = weakestSubject(life, content);
    switch (plan) {
      case 'study': {
        const subject = weak && chance(rng, 0.5) ? weak.id : undefined;
        out.push(['study_harder', subject ? { subject } : {}]);
        break;
      }
      case 'slack':
        out.push(['slack_off', {}]);
        break;
      case 'tutor':
        out.push(['get_tutor', {}]);
        break;
      case 'cheat':
        out.push(['cheat_on_test', {}]);
        if (chance(rng, 0.5)) out.push(['cheat_on_test', {}]);
        break;
      case 'skip':
        out.push(['skip_class', {}]);
        if (chance(rng, 0.5)) out.push(['skip_class', {}]);
        break;
      case 'none':
        break;
    }
    // The choice at the end of compulsory school, where the country has one.
    const paths = Object.entries(POLICY.path);
    if (can('choose_path', { path: 'stay' })) {
      const path = weightedPick(rng, paths.map(([p, w]) => [p, w] as const));
      if (path === 'apprenticeship') {
        const trades = apprenticeTrades(life, content);
        if (trades.length > 0) out.push(['choose_path', { path, tradeId: pick(rng, trades) }]);
      } else if ((SCHOOL_PATHS as readonly string[]).includes(path)) {
        out.push(['choose_path', { path: path as (typeof SCHOOL_PATHS)[number] }]);
      }
    }
    // Clubs and teams from the age their definitions allow (the teen player takes them from 13).
    if (life.character.age < content.balance.teen.ages.from && life.teen.activities.length === 0 && chance(rng, 0.25)) {
      const ids = Object.keys(content.activities).sort().filter((id) => can('join_activity', { activityId: id }));
      if (ids.length > 0) out.push(['join_activity', { activityId: pick(rng, ids) }]);
    }
  }

  if (life.career.job) {
    const plan = profile.work === 'mixed' ? pick(rng, ['hard', 'slack', 'social', 'none'] as const) : profile.work;
    if (plan === 'hard') out.push(['work_harder', {}]);
    else if (plan === 'slack') out.push(['slack_at_work', {}]);
    else if (plan === 'social') {
      out.push(['socialize_at_work', {}]);
      if (profile.partygoer && chance(rng, 0.7)) out.push(['office_party', {}]);
    }
    if (profile.reporter && chance(rng, 0.15)) {
      const mine = currentCoworkers(life);
      if (mine.length > 0) out.push(['report_coworker', { coworkerId: pick(rng, mine) }]);
    }
  }
  return out;
}

/** The conversations with teachers and classmates the simulated player has this year: [interaction, person]. */
export function chooseSchoolLifeInteractions(life: LifeState, rng: RngState, profile: SchoolLifeProfile): [string, string][] {
  const out: [string, string][] = [];
  if (life.phase !== 'yearStart' || !life.education.current) return out;
  const staff = life.education.school.staff;
  const t = POLICY.teacher;
  const teacher = staff.homeroom ?? staff.support ?? staff.head;
  if (teacher !== undefined && profile.talker) {
    if (chance(rng, t.askHelp)) out.push(['ask_teacher_help', teacher]);
    if (chance(rng, t.suckUp)) out.push(['suck_up', teacher]);
    if (chance(rng, t.argue)) out.push(['argue_with_teacher', teacher]);
    if (chance(rng, t.report)) out.push(['report_problem', teacher]);
    if (chance(rng, t.chat)) out.push(['chat', teacher]);
  }
  const classmates = life.education.school.classmates;
  if (classmates.length > 0 && chance(rng, POLICY.classmateChat)) out.push(['chat', pick(rng, classmates)]);
  return out;
}

interface ActionEffect {
  n: number;
  boostSum: number;
  stressSum: number;
  perfSum: number;
}

interface SchoolPlanStats {
  lives: number;
  /** The diploma GPA of those who finished high school, and how many did. */
  gpaSum: number;
  gpaN: number;
  /** Stress at the end of each school year of those lives. */
  stressSum: number;
  stressYears: number;
}

interface WorkPlanStats {
  lives: number;
  perfSum: number;
  perfYears: number;
  stressSum: number;
  stressYears: number;
}

export interface SchoolLifeReport {
  lives: number;
  /** Years in school with a class, and what they held. */
  schoolYears: number;
  classmates: number;
  teachers: number;
  byStage: Record<string, { years: number; classmates: number; teachers: number }>;
  classes: number;
  /** The most people on the People list at once (outside family and romance), and years it was past the cap. */
  peopleMax: number;
  peopleOverCap: number;
  plans: Record<SchoolPlan, SchoolPlanStats>;
  /** What each school action did to the year's grade (GPA points) and to stress, the moment it was taken. */
  actions: Record<string, ActionEffect>;
  tutor: { taken: number; adultsPaid: number; throughFinance: number; minorsFamily: number; spent: number };
  cheat: { tries: number; caught: number; suspended: number; flag: number };
  skip: { tries: number; caught: number; eventsQueued: number };
  teacherTalks: { total: number; byInteraction: Record<string, number>; askHelpBoost: number; askHelpN: number };
  exams: Record<string, { taken: number; top: number; pass: number; fail: number; scoreSum: number }>;
  /** What each band of an entrance exam is worth to a state university application, in percentage points. */
  entrance: Record<string, { n: number; chanceSum: number }>;
  choice: { made: Record<string, number>; settled: Record<string, number>; fellBack: number; uk: number; apprenticeStarted: number; workLeft: number };
  cegep: { lives: number; withDiploma: number; universityWithoutIt: number; bachelorStarts: number };
  work: {
    plans: Record<WorkPlan, WorkPlanStats>;
    actions: Record<string, ActionEffect>;
    jobYears: number;
    coworkersBySize: Record<'small' | 'medium' | 'large', { years: number; coworkers: number; most: number }>;
    ties: { lives: number; years: number; friends: number; rivals: number; feuds: number };
    party: { went: number; great: number; bad: number };
    reports: number;
  };
  romance: { teacher: number; underAge: number };
  invariantFailures: number;
}

const emptyEffect = (): ActionEffect => ({ n: 0, boostSum: 0, stressSum: 0, perfSum: 0 });
const emptySchoolPlan = (): SchoolPlanStats => ({ lives: 0, gpaSum: 0, gpaN: 0, stressSum: 0, stressYears: 0 });
const emptyWorkPlan = (): WorkPlanStats => ({ lives: 0, perfSum: 0, perfYears: 0, stressSum: 0, stressYears: 0 });
const STAGES = ['elementary', 'middle', 'high', 'college', 'trade', 'grad'] as const;

export function emptySchoolLifeReport(): SchoolLifeReport {
  return {
    lives: 0,
    schoolYears: 0,
    classmates: 0,
    teachers: 0,
    byStage: Object.fromEntries(STAGES.map((s) => [s, { years: 0, classmates: 0, teachers: 0 }])),
    classes: 0,
    peopleMax: 0,
    peopleOverCap: 0,
    plans: Object.fromEntries(SCHOOL_PLANS.map((p) => [p, emptySchoolPlan()])) as Record<SchoolPlan, SchoolPlanStats>,
    actions: {},
    tutor: { taken: 0, adultsPaid: 0, throughFinance: 0, minorsFamily: 0, spent: 0 },
    cheat: { tries: 0, caught: 0, suspended: 0, flag: 0 },
    skip: { tries: 0, caught: 0, eventsQueued: 0 },
    teacherTalks: { total: 0, byInteraction: {}, askHelpBoost: 0, askHelpN: 0 },
    exams: {},
    entrance: {},
    choice: { made: {}, settled: {}, fellBack: 0, uk: 0, apprenticeStarted: 0, workLeft: 0 },
    cegep: { lives: 0, withDiploma: 0, universityWithoutIt: 0, bachelorStarts: 0 },
    work: {
      plans: Object.fromEntries(WORK_PLANS.map((p) => [p, emptyWorkPlan()])) as Record<WorkPlan, WorkPlanStats>,
      actions: {},
      jobYears: 0,
      coworkersBySize: { small: { years: 0, coworkers: 0, most: 0 }, medium: { years: 0, coworkers: 0, most: 0 }, large: { years: 0, coworkers: 0, most: 0 } },
      ties: { lives: 0, years: 0, friends: 0, rivals: 0, feuds: 0 },
      party: { went: 0, great: 0, bad: 0 },
      reports: 0,
    },
    romance: { teacher: 0, underAge: 0 },
    invariantFailures: 0,
  };
}

/** Watches one life through school and work: each year's change, before and after `beginYear`, and each action. */
export class SchoolLifeWatcher {
  private tieSeen = false;
  private everCegep = false;
  private sawSchool = false;
  private gpaDone = false;
  private sawJob = false;
  private readonly examsSeen = new Set<string>();
  private lastKey: string | null = null;

  constructor(
    private readonly r: SchoolLifeReport,
    private readonly content: ContentBundle,
    private readonly profile: SchoolLifeProfile,
  ) {}

  /** An action the player took (the life as it was before it). */
  acted(actionId: LifeActionId, params: LifeActionParams, before: LifeState, after: LifeState): void {
    const r = this.r;
    const cb = before.education.current;
    const ca = after.education.current;
    if (cb && ca && ['study_harder', 'slack_off', 'get_tutor', 'cheat_on_test', 'skip_class'].includes(actionId)) {
      const e = (r.actions[actionId] ??= emptyEffect());
      e.n++;
      e.boostSum += ca.boost - cb.boost;
      e.stressSum += after.character.stats.stress - before.character.stats.stress;
    }
    switch (actionId) {
      case 'get_tutor': {
        const cost = tutorCost(before, this.content);
        r.tutor.taken++;
        r.tutor.spent += cost;
        if (isIndependent(before, this.content)) {
          // Through finance: savings went down by the cost, or the rest became debt.
          const debt = (l: LifeState) => l.finances.debts.reduce((sum, d) => sum + d.balance, 0);
          r.tutor.adultsPaid++;
          if (before.finances.savings - after.finances.savings + (debt(after) - debt(before)) === cost) r.tutor.throughFinance++;
        } else r.tutor.minorsFamily++;
        break;
      }
      case 'cheat_on_test': {
        r.cheat.tries++;
        if (after.education.school.year.caught && !before.education.school.year.caught) {
          r.cheat.caught++;
          if (after.flags.suspended === true && before.flags.suspended !== true) r.cheat.suspended++;
          if (after.flags.caught_cheating === true) r.cheat.flag++;
        }
        break;
      }
      case 'skip_class': {
        r.skip.tries++;
        if (after.education.school.year.caught && !before.education.school.year.caught) {
          r.skip.caught++;
          if (after.scheduled.length > before.scheduled.length) r.skip.eventsQueued++;
        }
        break;
      }
      case 'choose_path': {
        const p = params.path ?? 'stay';
        r.choice.made[p] = (r.choice.made[p] ?? 0) + 1;
        break;
      }
      case 'work_harder':
      case 'slack_at_work':
      case 'socialize_at_work':
      case 'office_party':
      case 'report_coworker': {
        const jb = before.career.job;
        const ja = after.career.job;
        if (jb && ja) {
          const e = (r.work.actions[actionId] ??= emptyEffect());
          e.n++;
          e.perfSum += ja.performance - jb.performance;
          e.stressSum += after.character.stats.stress - before.character.stats.stress;
        }
        if (actionId === 'office_party') {
          r.work.party.went++;
          const affected = Object.values(after.relationships).filter((rel) => rel.kind === 'boss').map((rel) => rel.affection - (before.relationships[rel.personId]?.affection ?? rel.affection));
          const perf = (ja?.performance ?? 0) - (jb?.performance ?? 0);
          if (perf > 0 || affected.some((d) => d > 0)) r.work.party.great++;
          else if (perf < 0) r.work.party.bad++;
        }
        if (actionId === 'report_coworker') r.work.reports++;
        break;
      }
      default:
        break;
    }
  }

  /** A talk with a teacher (the life before and after it). */
  talked(interactionId: string, personId: string, before: LifeState, after: LifeState): void {
    const t = this.r.teacherTalks;
    t.total++;
    t.byInteraction[interactionId] = (t.byInteraction[interactionId] ?? 0) + 1;
    if (interactionId === 'ask_teacher_help') {
      const cb = before.education.current;
      const ca = after.education.current;
      if (cb && ca && before.relationships[personId]?.kind === 'teacher') {
        t.askHelpN++;
        t.askHelpBoost += ca.boost - cb.boost;
      }
    }
  }

  /** The year just played: `before` is the life before `beginYear`, `after` the year as it stands with its events resolved. */
  observe(before: LifeState, after: LifeState): void {
    const r = this.r;
    const c = this.content;
    const cur = after.education.current;
    const sc = after.education.school;
    const stage = cur?.program;

    // A school year with a class and teachers.
    if (cur && sc.key !== null) {
      this.sawSchool = true;
      r.schoolYears++;
      const living = sc.classmates.filter((id) => after.people[id]?.alive).length;
      const teachers = Object.values(sc.staff).filter((id) => after.people[id]?.alive).length;
      r.classmates += living;
      r.teachers += teachers;
      const s = r.byStage[stage!]!;
      s.years++;
      s.classmates += living;
      s.teachers += teachers;
      if (sc.key !== this.lastKey) {
        r.classes++;
        this.lastKey = sc.key;
      }
      const plan = r.plans[this.profile.school];
      plan.stressSum += after.character.stats.stress;
      plan.stressYears++;
    }

    // The People list.
    const size = crowdSize(after);
    r.peopleMax = Math.max(r.peopleMax, size);
    if (size > c.balance.relationships.prune.maxPeople) r.peopleOverCap++;

    // Exams: a result is new when it was not in the life before.
    for (const e of sc.exams) {
      const key = `${e.id}:${e.year}`;
      if (this.examsSeen.has(key)) continue;
      this.examsSeen.add(key);
      const row = (r.exams[e.id] ??= { taken: 0, top: 0, pass: 0, fail: 0, scoreSum: 0 });
      row.taken++;
      row[e.band]++;
      row.scoreSum += e.score;
      if (c.balance.school.exams[e.id as ExamId].kind === 'entrance') {
        const entry = (r.entrance[e.band] ??= { n: 0, chanceSum: 0 });
        entry.n++;
        // What the result is worth to a state university application, in percentage points (the engine's own function).
        entry.chanceSum += admissionExamPoints(after, 'college', 'state', c);
      }
    }

    // The choice at the end of compulsory school.
    const flag = after.flags.school_path;
    if (typeof flag === 'string' && before.flags.school_path !== flag) {
      r.choice.uk++;
      r.choice.settled[flag] = (r.choice.settled[flag] ?? 0) + 1;
      if (flag === 'apprenticeship') r.choice.apprenticeStarted++;
      if (flag === 'work') r.choice.workLeft++;
    }

    // Quebec: a university needs the college diploma first.
    const country = countryOfCity(after.character.cityId, c);
    if (country.school.preUniversity === true && !this.everCegep) {
      this.everCegep = true;
      r.cegep.lives++;
    }
    if (country.school.preUniversity === true && cur?.program === 'college' && cur.tier !== 'community' && cur.since === after.currentYear) {
      r.cegep.bachelorStarts++;
      if (!after.education.credentials.some((x) => x.type === 'associate')) r.cegep.universityWithoutIt++;
    }
    if (country.school.preUniversity === true && after.education.credentials.some((x) => x.type === 'associate') && !before.education.credentials.some((x) => x.type === 'associate')) r.cegep.withDiploma++;

    // The diploma GPA, once.
    const diploma = after.education.credentials.find((x) => x.type === 'hs_diploma');
    if (diploma && diploma.gpa !== undefined && !this.gpaDone) {
      this.gpaDone = true;
      const plan = r.plans[this.profile.school];
      plan.gpaSum += diploma.gpa;
      plan.gpaN++;
    }

    // Work: coworkers, ties and the year's performance.
    const job = after.career.job;
    if (job) {
      this.sawJob = true;
      r.work.jobYears++;
      const size2 = workplaceSize(after, c);
      const label = (['small', 'medium', 'large'] as const).find((k) => c.balance.careers.workplace.sizes[k].max === size2.max && c.balance.careers.workplace.sizes[k].coworkers === size2.coworkers)!;
      const row = r.work.coworkersBySize[label];
      const coworkers = currentCoworkers(after);
      row.years++;
      row.coworkers += coworkers.length;
      row.most = Math.max(row.most, coworkers.length);
      const plan = r.work.plans[this.profile.work];
      plan.perfSum += job.performance;
      plan.perfYears++;
      plan.stressSum += after.character.stats.stress;
      plan.stressYears++;
      let ties = 0;
      for (let i = 0; i < coworkers.length; i++) {
        for (let j = i + 1; j < coworkers.length; j++) {
          const tie = getTie(after.web, coworkers[i]!, coworkers[j]!);
          if (!tie) continue;
          ties++;
          const status = tieStatus(tie, c);
          if (status === 'feuding' || status === 'strained') r.work.ties.rivals++;
          else r.work.ties.friends++;
          if (status === 'feuding') r.work.ties.feuds++;
        }
      }
      if (ties > 0) {
        r.work.ties.years++;
        if (!this.tieSeen) {
          this.tieSeen = true;
          r.work.ties.lives++;
        }
      }
    }
  }

  finish(life: LifeState): void {
    const r = this.r;
    r.lives++;
    if (this.sawSchool) r.plans[this.profile.school].lives++;
    if (this.sawJob) r.work.plans[this.profile.work].lives++;
    r.romance.teacher += teacherRomanceFailures(life).length;
    r.romance.underAge += romanceUnderAgeFailures(life, this.content).length;
    // The choice the country gives (the UK): how many that had one fell back to the college.
    r.choice.fellBack += life.history.filter((h) => h.tags.includes('fellBack')).length;
  }
}

const pct = (n: number, d: number) => (d === 0 ? '0%' : `${((100 * n) / d).toFixed(1)}%`);
const mean = (n: number, d: number) => (d === 0 ? 0 : n / d);

export function formatSchoolLife(r: SchoolLifeReport, content: ContentBundle): string[] {
  const lines: string[] = ['', 'School and work life (Batch 3):'];
  lines.push(`  school: ${r.schoolYears} school years in ${r.classes} classes; ${mean(r.classmates, r.schoolYears).toFixed(2)} classmates and ${mean(r.teachers, r.schoolYears).toFixed(2)} teachers a year (${STAGES.map((s) => `${s} ${mean(r.byStage[s]!.classmates, r.byStage[s]!.years).toFixed(1)}/${mean(r.byStage[s]!.teachers, r.byStage[s]!.years).toFixed(1)}`).join(', ')}); the People list peaked at ${r.peopleMax} (cap ${content.balance.relationships.prune.maxPeople}), over the cap in ${r.peopleOverCap} years`);
  lines.push(`  diploma GPA and stress by school plan: ${SCHOOL_PLANS.map((p) => `${p} ${mean(r.plans[p].gpaSum, r.plans[p].gpaN).toFixed(2)} (${mean(r.plans[p].stressSum, r.plans[p].stressYears).toFixed(1)}, ${r.plans[p].lives} lives)`).join(', ')}`);
  lines.push(`  what each school action did when taken (GPA points on the year, stress): ${Object.entries(r.actions).map(([id, e]) => `${id} ${mean(e.boostSum, e.n).toFixed(3)}, ${mean(e.stressSum, e.n).toFixed(1)} (${e.n})`).join('; ') || 'none'}`);
  lines.push(`  tutor: ${r.tutor.taken} taken (${r.tutor.adultsPaid} paid by the adult, ${r.tutor.throughFinance} exactly through finance, ${r.tutor.minorsFamily} by a family), ${r.tutor.spent} spent in all`);
  lines.push(`  cheating: ${r.cheat.tries} tries, ${r.cheat.caught} caught (${pct(r.cheat.caught, r.cheat.tries)}), ${r.cheat.suspended} suspended; skipping: ${r.skip.tries} classes, ${r.skip.caught} noticed (${pct(r.skip.caught, r.skip.tries)}), ${r.skip.eventsQueued} followed by an event`);
  lines.push(`  talks with teachers: ${r.teacherTalks.total} (${Object.entries(r.teacherTalks.byInteraction).map(([k, n]) => `${k} ${n}`).join(', ')}); asking for help moved the year's grade by ${mean(r.teacherTalks.askHelpBoost, r.teacherTalks.askHelpN).toFixed(3)} on average`);
  lines.push(`  exams: ${Object.entries(r.exams).map(([id, e]) => `${id} ${e.taken} sat, mean ${mean(e.scoreSum, e.taken).toFixed(0)}, top ${pct(e.top, e.taken)}, pass ${pct(e.pass, e.taken)}, fail ${pct(e.fail, e.taken)}`).join('; ') || 'none'}`);
  lines.push(`  what an entrance exam is worth to a state university application (percentage points): ${(['top', 'pass', 'fail'] as const).map((b) => `${b} ${mean(r.entrance[b]?.chanceSum ?? 0, r.entrance[b]?.n ?? 0).toFixed(1)} (${r.entrance[b]?.n ?? 0})`).join(', ')}`);
  lines.push(`  the choice at 16: picked ${Object.entries(r.choice.made).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}; settled as ${Object.entries(r.choice.settled).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}; ${r.choice.fellBack} fell back to the college`);
  lines.push(`  Quebec: ${r.cegep.lives} lives, ${r.cegep.withDiploma} earned the CEGEP diploma, ${r.cegep.bachelorStarts} started a university degree, ${r.cegep.universityWithoutIt} of them without it (must be 0)`);
  lines.push(`  work: ${r.work.jobYears} job-years; performance by work plan ${WORK_PLANS.map((p) => `${p} ${mean(r.work.plans[p].perfSum, r.work.plans[p].perfYears).toFixed(1)} (stress ${mean(r.work.plans[p].stressSum, r.work.plans[p].stressYears).toFixed(1)}, ${r.work.plans[p].lives} lives)`).join(', ')}`);
  lines.push(`  what each work action did when taken (performance points, stress): ${Object.entries(r.work.actions).map(([id, e]) => `${id} ${mean(e.perfSum, e.n).toFixed(2)}, ${mean(e.stressSum, e.n).toFixed(1)} (${e.n})`).join('; ') || 'none'}; ${r.work.party.went} parties (${r.work.party.great} went well, ${r.work.party.bad} badly), ${r.work.reports} coworkers reported`);
  lines.push(`  coworkers by workplace size: ${(['small', 'medium', 'large'] as const).map((k) => `${k} ${mean(r.work.coworkersBySize[k].coworkers, r.work.coworkersBySize[k].years).toFixed(2)} on average, most ${r.work.coworkersBySize[k].most} (${r.work.coworkersBySize[k].years} years)`).join('; ')}`);
  lines.push(`  ties between coworkers: ${r.work.ties.lives} lives, ${r.work.ties.friends} friendly tie-years and ${r.work.ties.rivals} at odds (${r.work.ties.feuds} feuding)`);
  lines.push(`  romance with a teacher: ${r.romance.teacher} (must be 0); romance involving anyone under 18: ${r.romance.underAge} (must be 0); invariant failures: ${r.invariantFailures}`);
  return lines;
}

export function schoolLifeTargets(report: SimulationReport, content: ContentBundle): TargetResult[] {
  const t = content.balance.targets.school;
  const r = report.schoolLife;
  const out: TargetResult[] = [];
  const range = (label: string, value: number, goal: { min?: number | undefined; max?: number | undefined }, fmt: (n: number) => string = (n) => n.toFixed(3)) => {
    const met = (goal.min === undefined || value >= goal.min) && (goal.max === undefined || value <= goal.max);
    out.push({ label, value: fmt(value), short: fmt(value), goal: `${goal.min !== undefined ? fmt(goal.min) : ''}–${goal.max !== undefined ? fmt(goal.max) : ''}`, met });
  };
  const eff = (e: ActionEffect | undefined) => ({ boost: mean(e?.boostSum ?? 0, e?.n ?? 0), stress: mean(e?.stressSum ?? 0, e?.n ?? 0), perf: mean(e?.perfSum ?? 0, e?.n ?? 0) });
  const f2 = (n: number) => n.toFixed(2);
  range('classmates in a class, per school year', mean(r.classmates, r.schoolYears), t.classmates, f2);
  range('teachers and staff, per school year', mean(r.teachers, r.schoolYears), t.teachers, f2);
  range('study harder: GPA points added to the year when taken', eff(r.actions.study_harder).boost, t.studyGrades);
  range('study harder: stress added when taken', eff(r.actions.study_harder).stress, t.studyStress, f2);
  range('slack off: GPA points taken from the year when taken', eff(r.actions.slack_off).boost, t.slackGrades);
  range('slack off: stress relieved when taken', eff(r.actions.slack_off).stress, t.slackStress, f2);
  range('diploma GPA: study plan minus slack plan', mean(r.plans.study.gpaSum, r.plans.study.gpaN) - mean(r.plans.slack.gpaSum, r.plans.slack.gpaN), t.studyVsSlack);
  range('tutors paid for exactly through finance (adults)', mean(r.tutor.throughFinance, r.tutor.adultsPaid), t.tutorThroughFinance, f2);
  range('cheating: share of tries that were caught', mean(r.cheat.caught, r.cheat.tries), t.cheatCaught);
  range('skipping class: share noticed', mean(r.skip.caught, r.skip.tries), t.skipCaught);
  range('asking a teacher for help: GPA points added when taken', mean(r.teacherTalks.askHelpBoost, r.teacherTalks.askHelpN), t.askHelp);
  range('entrance exam worth to a state university application (points): top minus fail', mean(r.entrance.top?.chanceSum ?? 0, r.entrance.top?.n ?? 0) - mean(r.entrance.fail?.chanceSum ?? 0, r.entrance.fail?.n ?? 0), t.entranceGap, (n) => n.toFixed(1));
  range('Quebec lives who started university without a CEGEP diploma', r.cegep.universityWithoutIt, t.cegepSkipped, (n) => n.toFixed(0));
  range('work harder: performance points added when taken', eff(r.work.actions.work_harder).perf, t.hardPerformance, f2);
  range('work harder: stress added when taken', eff(r.work.actions.work_harder).stress, t.hardStress, f2);
  range('slack off at work: performance points taken when taken', eff(r.work.actions.slack_at_work).perf, t.slackPerformance, f2);
  range('job performance: hard plan minus slack plan', mean(r.work.plans.hard.perfSum, r.work.plans.hard.perfYears) - mean(r.work.plans.slack.perfSum, r.work.plans.slack.perfYears), t.hardVsSlack, (n) => n.toFixed(1));
  const bySize = (k: 'small' | 'medium' | 'large') => mean(r.work.coworkersBySize[k].coworkers, r.work.coworkersBySize[k].years);
  range('coworkers: large workplace minus small', bySize('large') - bySize('small'), t.sizeGap, f2);
  range('most coworkers in any workplace', Math.max(r.work.coworkersBySize.small.most, r.work.coworkersBySize.medium.most, r.work.coworkersBySize.large.most), t.mostCoworkers, (n) => n.toFixed(0));
  range('lives with a tie between coworkers', mean(r.work.ties.lives, r.work.plans.none.lives + r.work.plans.hard.lives + r.work.plans.slack.lives + r.work.plans.social.lives + r.work.plans.mixed.lives), t.coworkerTieLives);
  range('years the People list was over its cap', r.peopleOverCap, t.overCap, (n) => n.toFixed(0));
  range('romance with a teacher', r.romance.teacher, t.romanceTeacher, (n) => n.toFixed(0));
  range('romance involving anyone under 18 (school)', r.romance.underAge, t.romanceUnder18, (n) => n.toFixed(0));
  return out;
}
