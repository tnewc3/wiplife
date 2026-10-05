/**
 * Education rules (docs/design.md, section I; docs/technical.md, Stage 7):
 * school years and grades, admissions, tuition and who pays it, credentials,
 * leaving and going back. The yearly education step, actions, effects,
 * conditions, selectors and invariants all use these functions, so each rule
 * lives in one place. Numbers come from src/content/balance/education.yaml.
 *
 * Tuition is paid through the Stage 6 debt system: scholarships and family
 * help take their share, scholarship money from events pays what it can, and
 * the rest is a student loan (takeStudentLoan in ./finance.ts). Student loan
 * payments pause while you're in college, trade school or grad school.
 */
import { gradeDrag } from './mental/drag';
import type { ApplyProgram, ChanceModel, ContentBundle, CredentialType, EducationHistoryKey, Program, Tier } from '../content/schemas';
import { curveAt } from './curve';
import { scoreOf } from './events/checks';
import { isIndependent, MAX_MONEY, takeStudentLoan, wholeDollars } from './finance';
import { supportingParent } from './housing';
import { nextFloat, type RngState } from './rng';
import { writeFromGroup } from './systems/history';
import type { Admission, Credential, Enrollment, Id, LifeState, SchoolBill, SchoolPlace } from './types';

/** College, trade school and grad school: the programs you apply to and pay for. */
export const POST_SECONDARY: readonly Program[] = ['college', 'trade', 'grad'];
/** Credentials that finish high school. */
export const HIGH_SCHOOL_CREDENTIALS: readonly CredentialType[] = ['hs_diploma', 'ged'];

export const isPostSecondary = (program: Program) => POST_SECONDARY.includes(program);

/** Rounds a GPA to two decimals, within 0–4. */
export function roundGpa(gpa: number): number {
  return Math.min(4, Math.max(0, Math.round(gpa * 100) / 100));
}

/** Ages that bound automatic school, from balance/education.yaml. */
export function schoolAges(content: ContentBundle) {
  const s = content.balance.education.school;
  const middleStart = s.startAge + s.elementary;
  const highStart = middleStart + s.middle;
  /** High school normally ends (the diploma) as you turn this old. */
  const highEnd = highStart + s.high;
  /** The latest age a diploma can come, after being held back. */
  const lastDiplomaAge = highEnd + s.maxRepeats;
  return { startAge: s.startAge, middleStart, highStart, highEnd, lastDiplomaAge };
}

/** The automatic school program (and year) for an age, if it is a school age. */
export function placeForAge(age: number, content: ContentBundle): { program: Program; year: number; lengthYears: number } | null {
  const s = content.balance.education.school;
  const a = schoolAges(content);
  if (age < a.startAge || age >= a.highEnd) return null;
  if (age < a.middleStart) return { program: 'elementary', year: age - a.startAge + 1, lengthYears: s.elementary };
  if (age < a.highStart) return { program: 'middle', year: age - a.middleStart + 1, lengthYears: s.middle };
  return { program: 'high', year: age - a.highStart + 1, lengthYears: s.high };
}

export function hasCredential(state: LifeState, types: readonly CredentialType[]): boolean {
  return state.education.credentials.some((c) => types.includes(c.type));
}

export const finishedHighSchool = (state: LifeState) => hasCredential(state, HIGH_SCHOOL_CREDENTIALS);

/** In college, trade school or grad school now (student loan payments pause). */
export function inPostSecondary(state: LifeState): boolean {
  const cur = state.education.current;
  return cur !== null && isPostSecondary(cur.program);
}

/** Student loan payments are paused while you're in college, trade school or grad school. */
export const studentLoansPaused = inPostSecondary;

/** In the last year of your current program. */
export function inFinalYear(state: LifeState): boolean {
  const cur = state.education.current;
  return cur !== null && cur.year >= cur.lengthYears;
}

/** A letter grade for a GPA (balance/education.yaml grades.letters). */
export function letterGrade(gpa: number, content: ContentBundle): string {
  const letters = content.balance.education.grades.letters;
  return (letters.find((l) => gpa >= l.min) ?? letters[letters.length - 1]!).letter;
}

/** Years a program takes. */
export function programLength(place: SchoolPlace, content: ContentBundle): number {
  const edu = content.balance.education;
  switch (place.program) {
    case 'elementary':
      return edu.school.elementary;
    case 'middle':
      return edu.school.middle;
    case 'high':
      return edu.school.high;
    case 'college':
      return edu.college.years[place.tier ?? 'state'];
    case 'trade':
      return content.trades[place.tradeId ?? '']?.years ?? 1;
    case 'grad':
      return content.gradPrograms[place.gradProgramId ?? '']?.years ?? 1;
  }
}

/** How hard what you study is (1–5); 3 for school without a major. */
function difficultyOf(place: SchoolPlace, content: ContentBundle): number {
  if (place.program === 'college') return content.majors[place.majorId ?? '']?.difficulty ?? 3;
  if (place.program === 'trade') return content.trades[place.tradeId ?? '']?.difficulty ?? 3;
  if (place.program === 'grad') return content.gradPrograms[place.gradProgramId ?? '']?.difficulty ?? 3;
  return 3;
}

/** The grade your stats point to in this program, before the yearly swing and events. */
export function expectedGrade(state: LifeState, place: SchoolPlace, content: ContentBundle): number {
  const g = content.balance.education.grades;
  let grade = g.base;
  for (const stat of g.stats) grade += stat.weight * (scoreOf(state, stat.key) - 50);
  grade *= curveAt(g.stress, state.character.stats.stress);
  grade += g.wealth[state.character.familyWealth];
  grade += (difficultyOf(place, content) - 3) * g.difficulty;
  if (place.program === 'college' && place.tier) grade += g.tier[place.tier];
  // M1: a severe condition you ignore wears on your grades.
  grade += gradeDrag(state, content);
  return roundGpa(grade);
}

/** This school year's grade: what your stats point to, a random swing and what events added. Draws from `rng`. */
export function yearGrade(state: LifeState, enrollment: Enrollment, content: ContentBundle, rng: RngState): number {
  const { swing } = content.balance.education.grades;
  return roundGpa(expectedGrade(state, enrollment, content) + (nextFloat(rng) * 2 - 1) * swing + enrollment.boost);
}

/**
 * A chance (0–1) from a balance chance model: base, GPA, stats, luck, family
 * wealth and flags, clamped. `adjust` adds points and then multiplies, before
 * the clamp (job applications: experience, degrees, the job market).
 */
export function modelChance(
  state: LifeState,
  model: ChanceModel,
  gpa: number | undefined,
  content: ContentBundle,
  adjust: { points?: number; multiplier?: number } = {},
): number {
  const { gpaPivot } = content.balance.education.admission;
  let percent = model.base;
  if (model.gpa !== undefined && gpa !== undefined) percent += model.gpa * (gpa - gpaPivot);
  for (const stat of model.stats) percent += stat.weight * (scoreOf(state, stat.key) - 50);
  percent += content.balance.events.checks.luckWeight * (state.character.hidden.luck - 50);
  percent += model.wealth?.[state.character.familyWealth] ?? 0;
  for (const [flag, points] of Object.entries(model.flags ?? {})) {
    const value = state.flags[flag];
    if (value !== undefined && value !== false && value !== 0 && value !== '') percent += points;
  }
  percent = (percent + (adjust.points ?? 0)) * (adjust.multiplier ?? 1);
  return Math.min(model.max, Math.max(model.min, percent)) / 100;
}

/** The best credential of these types (highest GPA; latest when tied). */
function bestCredential(state: LifeState, types: readonly CredentialType[]): Credential | undefined {
  return state.education.credentials
    .filter((c) => types.includes(c.type))
    .sort((a, b) => (b.gpa ?? -1) - (a.gpa ?? -1) || b.year - a.year)[0];
}

/**
 * The GPA an application is judged on: for college and trade school, your
 * high school GPA (your current one in your last year there); for grad
 * school, your bachelor's GPA (your current one in your last year of it).
 * Without one (a GED), balance's noGpa.
 */
export function applicationGpa(state: LifeState, program: ApplyProgram, content: ContentBundle): number {
  const { noGpa } = content.balance.education.admission;
  const cur = state.education.current;
  if (program === 'grad') {
    if (cur?.program === 'college' && cur.tier !== 'community') return cur.gpa;
    return bestCredential(state, ['bachelor'])?.gpa ?? noGpa;
  }
  if (cur?.program === 'high') return cur.gpa;
  return bestCredential(state, ['hs_diploma'])?.gpa ?? noGpa;
}

/** A place you can apply to. */
export type ApplyTarget =
  | { program: 'college'; tier: Tier; majorId: Id }
  | { program: 'trade'; tradeId: Id }
  | { program: 'grad'; gradProgramId: Id };

/** The option key an application is recorded under: 'college:state', 'trade:welder', 'grad:law'. */
export function optionKey(target: SchoolPlace): string {
  if (target.program === 'college') return `college:${target.tier}`;
  if (target.program === 'trade') return `trade:${target.tradeId}`;
  return `grad:${target.gradProgramId}`;
}

function admissionModel(target: ApplyTarget, content: ContentBundle): ChanceModel | undefined {
  const a = content.balance.education.admission;
  if (target.program === 'college') return a.college[target.tier];
  if (target.program === 'trade') return a.trade;
  return a.grad[target.gradProgramId];
}

/** Your chance of being accepted (0–1). */
export function admissionChance(state: LifeState, target: ApplyTarget, content: ContentBundle): number {
  const model = admissionModel(target, content);
  return model ? modelChance(state, model, applicationGpa(state, target.program, content), content) : 0;
}

/** Your bachelor's majors: finished degrees, and the one you're finishing now. */
function bachelorMajors(state: LifeState, includeFinishing: boolean): Id[] {
  const majors = state.education.credentials.filter((c) => c.type === 'bachelor' && c.refId).map((c) => c.refId!);
  const cur = state.education.current;
  if (includeFinishing && cur?.program === 'college' && cur.tier !== 'community' && cur.year >= cur.lengthYears && cur.majorId) {
    majors.push(cur.majorId);
  }
  return majors;
}

/** What a program needs before you start it: high school for college and trade school; a (fitting) bachelor's for grad school. */
export function meetsRequirements(state: LifeState, place: SchoolPlace, content: ContentBundle, includeFinishing = false): boolean {
  const cur = state.education.current;
  if (place.program === 'college' || place.program === 'trade') {
    return finishedHighSchool(state) || (includeFinishing && cur?.program === 'high' && cur.year >= cur.lengthYears);
  }
  if (place.program === 'grad') {
    const majors = bachelorMajors(state, includeFinishing);
    if (majors.length === 0) return false;
    const needed = content.gradPrograms[place.gradProgramId ?? '']?.majors;
    return needed === undefined || majors.some((m) => needed.includes(m));
  }
  return true;
}

/** Why you can't apply here now, or null when you can. */
export type ApplyBlock = 'age' | 'enrolled' | 'highSchool' | 'bachelor' | 'major' | 'tried' | 'holding' | 'unknown';

export function applyBlock(state: LifeState, target: ApplyTarget, content: ContentBundle): ApplyBlock | null {
  const edu = state.education;
  if (!validTarget(target, content)) return 'unknown';
  if (state.character.age < content.balance.education.school.applyAge) return 'age';
  // Only when you're not in school, or finishing what you're in.
  if (edu.current && edu.current.year < edu.current.lengthYears) return 'enrolled';
  if (edu.current && (edu.current.program === 'elementary' || edu.current.program === 'middle')) return 'enrolled';
  if (target.program === 'grad') {
    if (bachelorMajors(state, true).length === 0) return 'bachelor';
    if (!meetsRequirements(state, target, content, true)) return 'major';
  } else if (!meetsRequirements(state, target, content, true)) {
    return 'highSchool';
  }
  const key = optionKey(target);
  if (edu.applied.some((a) => a.option === key)) return 'tried';
  if (edu.admission && !edu.admission.resume && optionKey(edu.admission) === key) return 'holding';
  return null;
}

/** The target names real, active content. */
export function validTarget(target: ApplyTarget, content: ContentBundle): boolean {
  if (target.program === 'college') {
    const major = content.majors[target.majorId];
    return major !== undefined && !major.retired && ['community', 'state', 'elite'].includes(target.tier);
  }
  if (target.program === 'trade') {
    const trade = content.trades[target.tradeId];
    return trade !== undefined && !trade.retired;
  }
  const grad = content.gradPrograms[target.gradProgramId];
  return grad !== undefined && !grad.retired && content.balance.education.admission.grad[target.gradProgramId] !== undefined;
}

/** Yearly tuition for a program (none for automatic school). */
export function tuitionFor(place: SchoolPlace, content: ContentBundle): number {
  const t = content.balance.education.tuition;
  if (place.program === 'college') return t.college[place.tier ?? 'state'];
  if (place.program === 'trade') return t.trade[place.tradeId ?? ''] ?? 0;
  if (place.program === 'grad') return t.grad[place.gradProgramId ?? ''] ?? 0;
  return 0;
}

/** The share of tuition scholarships would cover if you were accepted now: merit (by GPA) and need (by family wealth). */
export function scholarshipShare(state: LifeState, program: ApplyProgram, content: ContentBundle): number {
  const s = content.balance.education.scholarships;
  const merit = curveAt(s.merit, applicationGpa(state, program, content));
  const need = s.need[state.character.familyWealth] * (program === 'grad' ? s.gradNeed : 1);
  return Math.min(s.maxShare, merit + need);
}

/** The share of tuition left after scholarships your family pays this year (none without a parent to help, or past the age). */
export function familyHelpShare(state: LifeState, content: ContentBundle): number {
  const help = content.balance.education.familyHelp;
  if (state.character.age > help.maxAge || supportingParent(state) === null) return 0;
  return help.share[state.character.familyWealth];
}

/**
 * One year's bill for a program: tuition, and who pays it. Doesn't change
 * anything. `nextYear` quotes the year a place starts (when you're a year
 * older), for applications.
 */
export function billFor(
  state: LifeState,
  place: SchoolPlace,
  scholarship: number,
  content: ContentBundle,
  nextYear = false,
): Omit<SchoolBill, 'year'> {
  const at = nextYear ? { ...state, character: { ...state.character, age: state.character.age + 1 } } : state;
  const tuition = tuitionFor(place, content);
  const covered = wholeDollars(tuition * Math.min(1, Math.max(0, scholarship)));
  const rest = tuition - covered;
  let family = wholeDollars(rest * familyHelpShare(at, content));
  const fund = Math.min(state.education.fund, rest - family);
  let loan = rest - family - fund;
  // A child never borrows: the family covers it.
  if (!isIndependent(at, content)) {
    family += loan;
    loan = 0;
  }
  return { tuition, scholarship: covered, family, fund, loan };
}

/** Pays this school year's tuition: scholarship money is used up, and the loan joins your student debt. */
export function payTuition(state: LifeState, content: ContentBundle): void {
  const cur = state.education.current;
  if (!cur || !isPostSecondary(cur.program)) return;
  const bill = billFor(state, cur, cur.scholarship, content);
  state.education.fund -= bill.fund;
  takeStudentLoan(state, bill.loan, content);
  state.education.lastBill = { year: state.currentYear, ...bill };
}

/** The name of the school for a program, in the city you live in. */
export function schoolName(state: LifeState, place: SchoolPlace, content: ContentBundle): string {
  const schools = content.cities[state.character.cityId]?.schools;
  if (!schools) return '';
  switch (place.program) {
    case 'college':
      return schools[place.tier ?? 'state'];
    case 'trade':
      return schools.trade;
    case 'grad':
      return schools.grad;
    default:
      return schools.high;
  }
}

/** What you study in a program, as it reads in a sentence ("computer science"). */
export function subjectOf(place: SchoolPlace, content: ContentBundle): string {
  if (place.program === 'college') return content.majors[place.majorId ?? '']?.subject ?? '';
  if (place.program === 'trade') return content.trades[place.tradeId ?? '']?.subject ?? '';
  if (place.program === 'grad') return content.gradPrograms[place.gradProgramId ?? '']?.subject ?? '';
  return '';
}

/** A school history entry (text/history.yaml education). */
export function schoolHistory(state: LifeState, key: EducationHistoryKey, values: Record<string, string>, content: ContentBundle): void {
  writeFromGroup(state, content.text.history.education[key], ['education', key], { values }, content);
}

/** Only the place's own fields (no enrollment details). */
export function placeOf(place: SchoolPlace): SchoolPlace {
  const out: SchoolPlace = { program: place.program };
  if (place.tier !== undefined) out.tier = place.tier;
  if (place.majorId !== undefined) out.majorId = place.majorId;
  if (place.tradeId !== undefined) out.tradeId = place.tradeId;
  if (place.gradProgramId !== undefined) out.gradProgramId = place.gradProgramId;
  return out;
}

/** Starts automatic school at the right year for your age (kindergarten, or catching up). */
export function enrollForAge(state: LifeState, content: ContentBundle): boolean {
  const place = placeForAge(state.character.age, content);
  if (!place) return false;
  const enrollment: Enrollment = {
    program: place.program,
    year: place.year,
    lengthYears: place.lengthYears,
    gpa: 0,
    boost: 0,
    repeats: 0,
    scholarship: 0,
    since: state.currentYear,
  };
  enrollment.gpa = expectedGrade(state, enrollment, content);
  state.education.current = enrollment;
  if (place.program === 'elementary' && place.year === 1) schoolHistory(state, 'startedSchool', {}, content);
  return true;
}

/**
 * Takes up your admission as the year begins: you start (or go back to) the
 * program, if you meet its requirements by now; otherwise the place is
 * withdrawn. An associate degree counts toward a bachelor's.
 */
export function startAdmission(state: LifeState, content: ContentBundle): void {
  const edu = state.education;
  const admission = edu.admission;
  if (!admission) return;
  edu.admission = null;
  const values = { school: schoolName(state, admission, content), subject: subjectOf(admission, content) };
  if (!meetsRequirements(state, admission, content)) {
    schoolHistory(state, 'withdrawn', values, content);
    return;
  }
  const lengthYears = admission.resume?.lengthYears ?? programLength(admission, content);
  let year = admission.resume?.year ?? 1;
  let gpa = admission.resume?.gpa;
  if (!admission.resume && admission.program === 'college' && admission.tier !== 'community') {
    const associate = bestCredential(state, ['associate']);
    if (associate) {
      year = 1 + Math.min(content.balance.education.college.transferCredit, lengthYears - 1);
      gpa = associate.gpa;
    }
  }
  const enrollment: Enrollment = {
    ...placeOf(admission),
    year,
    lengthYears,
    gpa: 0,
    boost: 0,
    repeats: admission.resume?.repeats ?? 0,
    scholarship: admission.scholarship,
    since: state.currentYear,
  };
  enrollment.gpa = gpa ?? expectedGrade(state, enrollment, content);
  edu.current = enrollment;
  if (edu.left && edu.left.program === admission.program) edu.left = null;
  if (admission.program === 'high') schoolHistory(state, 'returnedHigh', { school: values.school }, content);
  else schoolHistory(state, admission.resume ? 'returned' : 'enrolled', values, content);
}

/** The credential a finished program earns. */
function credentialFor(cur: Enrollment, year: number): Credential | null {
  const gpa = roundGpa(cur.gpa);
  switch (cur.program) {
    case 'high':
      return { type: 'hs_diploma', year, gpa };
    case 'college':
      return { type: cur.tier === 'community' ? 'associate' : 'bachelor', refId: cur.majorId!, year, gpa, tier: cur.tier! };
    case 'trade':
      return { type: 'trade_license', refId: cur.tradeId!, year };
    case 'grad':
      return { type: 'grad', refId: cur.gradProgramId!, year, gpa };
    default:
      return null;
  }
}

/**
 * The credential your current program will earn when the next year begins,
 * if you're in its final year (job applications count it, Stage 8).
 */
export function finishingCredential(state: LifeState): Credential | null {
  const cur = state.education.current;
  if (!cur || cur.year < cur.lengthYears) return null;
  return credentialFor(cur, state.currentYear + 1);
}

/**
 * You finished your program: its credential, a history entry, and the next
 * automatic school (elementary → middle → high).
 */
export function graduate(state: LifeState, content: ContentBundle): void {
  const edu = state.education;
  const cur = edu.current;
  if (!cur) return;
  edu.current = null;
  const credential = credentialFor(cur, state.currentYear);
  if (credential) edu.credentials.push(credential);
  if (edu.left && edu.left.program === cur.program) edu.left = null;
  const grade = letterGrade(cur.gpa, content);
  const values = { school: schoolName(state, cur, content), subject: subjectOf(cur, content), grade };
  switch (cur.program) {
    case 'elementary':
    case 'middle': {
      const next = placeForAge(state.character.age, content);
      if (next && next.program !== cur.program) {
        enrollForAge(state, content);
        schoolHistory(state, next.program === 'middle' ? 'startedMiddle' : 'startedHigh', {}, content);
      }
      return;
    }
    case 'high':
      schoolHistory(state, 'graduatedHigh', { grade }, content);
      return;
    case 'college':
      schoolHistory(state, cur.tier === 'community' ? 'graduatedAssociate' : 'graduatedBachelor', values, content);
      return;
    case 'trade':
      schoolHistory(state, 'licensed', { school: values.school, license: content.trades[cur.tradeId ?? '']?.license ?? '' }, content);
      return;
    case 'grad':
      schoolHistory(state, 'graduatedGrad', { school: values.school, degree: content.gradPrograms[cur.gradProgramId ?? '']?.degree ?? '', grade }, content);
      return;
  }
}

/** You can leave your program now: high school from the dropout age, and college, trade school or grad school any time. */
export function canLeaveSchool(state: LifeState, content: ContentBundle): boolean {
  const cur = state.education.current;
  if (!cur) return false;
  if (cur.program === 'high') return state.character.age >= content.balance.education.school.dropoutAge;
  return isPostSecondary(cur.program);
}

/**
 * You leave your program without finishing it (dropping out, or expelled).
 * It is kept so you can go back later. A place that depended on finishing
 * it is withdrawn.
 */
export function leaveSchool(state: LifeState, how: 'droppedOut' | 'expelled', content: ContentBundle): void {
  if (!canLeaveSchool(state, content)) return;
  const edu = state.education;
  const cur = edu.current!;
  edu.current = null;
  edu.left = { ...cur, boost: 0, leftYear: state.currentYear };
  schoolHistory(state, how, { school: schoolName(state, cur, content) }, content);
  const admission = edu.admission;
  if (admission && !meetsRequirements(state, admission, content)) {
    edu.admission = null;
    schoolHistory(state, 'withdrawn', { school: schoolName(state, admission, content) }, content);
  }
}

/**
 * You can go back to the program you left: not in school, no other place
 * waiting, and (for high school) still young enough to finish it.
 */
export function canReturn(state: LifeState, content: ContentBundle): boolean {
  const edu = state.education;
  const left = edu.left;
  if (!left || edu.current || edu.admission) return false;
  if (left.program !== 'high') return meetsRequirements(state, left, content);
  if (finishedHighSchool(state)) return false;
  // You start again next year; the diploma must come by the last diploma age.
  const diplomaAge = state.character.age + 1 + (left.lengthYears - left.year) + 1;
  return diplomaAge <= schoolAges(content).lastDiplomaAge;
}

/** Decides to go back to the program you left: you pick up where you stopped as the next year begins. */
export function returnToSchool(state: LifeState): void {
  const left = state.education.left;
  if (!left) return;
  state.education.admission = {
    ...placeOf(left),
    scholarship: left.scholarship,
    decided: state.currentYear,
    resume: { year: left.year, lengthYears: left.lengthYears, gpa: left.gpa, repeats: left.repeats },
  };
}

/** Accepts you: the place replaces any place you held. */
export function admit(state: LifeState, target: ApplyTarget, content: ContentBundle): void {
  const admission: Admission = { ...placeOf(target), scholarship: scholarshipShare(state, target.program, content), decided: state.currentYear };
  state.education.admission = admission;
}

/** Adds scholarship money from an event (never past the money limit). */
export function addScholarshipFund(state: LifeState, amount: number): void {
  state.education.fund = wholeDollars(Math.min(MAX_MONEY, state.education.fund + Math.max(0, amount)));
}

/** You can take the GED: no diploma, not in high school, old enough, not tried this year. */
export function canTakeGed(state: LifeState, content: ContentBundle): boolean {
  const edu = state.education;
  return (
    state.character.age >= content.balance.education.ged.minAge &&
    !finishedHighSchool(state) &&
    edu.current?.program !== 'high' &&
    // Going back to high school next year, or a GED: not both.
    edu.admission?.program !== 'high' &&
    !edu.applied.some((a) => a.option === 'ged')
  );
}

/** Changing to this major now adds a year (past the free years), or not. */
export function majorChangeAddsYear(state: LifeState, content: ContentBundle): boolean {
  const cur = state.education.current;
  return cur !== null && cur.year > content.balance.education.college.freeChangeYears;
}

/** You can change to this major: in college, a different active major, not changed already this year. */
export function canChangeMajor(state: LifeState, majorId: Id, content: ContentBundle): boolean {
  const cur = state.education.current;
  const major = content.majors[majorId];
  return (
    cur?.program === 'college' &&
    major !== undefined &&
    !major.retired &&
    cur.majorId !== majorId &&
    !state.education.applied.some((a) => a.option === 'major')
  );
}
