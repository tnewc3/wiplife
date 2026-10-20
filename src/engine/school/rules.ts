/**
 * What you can do in a school year (Batch 3): study harder, slack off, get a
 * tutor, cheat on a test, skip class. Each changes the grade of the year under
 * way (GPA points added to `Enrollment.boost`, like an event's `education`
 * effect) and your stress. A tutor is paid through the finance module (a
 * minor's family covers it). Cheating and skipping can be noticed: the
 * teacher cools toward you, a parent's trust drops, cheating goes on the
 * record as a flag the admission models read, and the existing truancy trouble
 * of the teen years follows a skipped class. Numbers: balance/school.yaml (actions).
 */
import type { ContentBundle } from '../../content/schemas';
import { scaledAmount } from '../country';
import { canAffordCost } from './afford';
import { spend } from '../finance';
import { clampInt } from '../random';
import { chance } from '../rng';
import { householdParents } from '../teen/query';
import type { Id, LifeState } from '../types';
import { queueSchoolEvent, schoolLine } from './events';
import { bumpStat, curriculumFor, thisYear } from './query';

export type SchoolActionBlock = 'school' | 'away' | 'age' | 'done' | 'stance' | 'money' | 'limit' | 'subject';

/** The year's record, started fresh when it is not this year's. */
function yearRecord(state: LifeState) {
  const sc = state.education.school;
  if (sc.year.year !== state.currentYear) sc.year = { year: state.currentYear, effort: null, tutor: 0, cheated: 0, skipped: 0, caught: false };
  return sc.year;
}

/** What a tutor costs you now: the base cost at your country's prices (a minor's family pays it). */
export function tutorCost(state: LifeState, content: ContentBundle): number {
  return scaledAmount(state, content.balance.school.actions.tutor.cost, content);
}

/** Why you can't do this in school now, or null when you can. */
export function schoolActionBlock(
  state: LifeState,
  action: 'study' | 'slack' | 'tutor' | 'cheat' | 'skip',
  content: ContentBundle,
  subject?: string,
): SchoolActionBlock | null {
  const cur = state.education.current;
  if (!cur) return 'school';
  if (state.housing.kind === 'incarcerated') return 'away';
  const y = thisYear(state);
  const a = content.balance.school.actions;
  switch (action) {
    case 'study':
      if (subject !== undefined && !curriculumFor(state, cur.program, cur.year, content).some((s) => s.id === subject)) return 'subject';
      return y.effort === null ? null : y.effort === 'study' ? 'done' : 'stance';
    case 'slack':
      return y.effort === null ? null : y.effort === 'slack' ? 'done' : 'stance';
    case 'tutor':
      if (y.tutor > 0) return 'done';
      return canAffordCost(state, tutorCost(state, content), content) ? null : 'money';
    case 'cheat':
      if (state.character.age < content.balance.school.actions.cheat.minAge) return 'age';
      return y.caught || y.cheated >= a.cheat.maxPerYear ? 'limit' : null;
    case 'skip':
      if (state.character.age < content.balance.school.actions.skip.minAge) return 'age';
      return y.caught || y.skipped >= a.skip.maxPerYear ? 'limit' : null;
  }
}

export function studyHarder(state: LifeState, subject: string | undefined, content: ContentBundle): void {
  const cur = state.education.current!;
  const a = content.balance.school.actions.study;
  const y = yearRecord(state);
  y.effort = 'study';
  if (subject !== undefined) {
    y.subject = subject;
    const max = content.balance.school.report.spread.max;
    const sc = state.education.school;
    sc.spread[subject] = Math.min(max, Math.round(((sc.spread[subject] ?? 0) + a.subject) * 100) / 100);
    // Working on one subject lifts the year a little less than working on all of them.
    cur.boost += a.grades * 0.6;
  } else {
    cur.boost += a.grades;
  }
  bumpStat(state, 'stress', a.stress);
  if (chance(state.rng, a.discipline)) state.character.personality.discipline = clampInt(state.character.personality.discipline + 1, 0, 100);
}

export function slackOff(state: LifeState, content: ContentBundle): void {
  const cur = state.education.current!;
  const a = content.balance.school.actions.slack;
  yearRecord(state).effort = 'slack';
  cur.boost += a.grades;
  bumpStat(state, 'stress', a.stress);
  bumpStat(state, 'happiness', a.happiness);
}

export function getTutor(state: LifeState, content: ContentBundle): void {
  const cur = state.education.current!;
  const a = content.balance.school.actions.tutor;
  const cost = tutorCost(state, content);
  spend(state, cost, content);
  yearRecord(state).tutor = cost;
  cur.boost += a.grades;
  bumpStat(state, 'stress', a.stress);
}

function teacherCools(state: LifeState, delta: number): void {
  const id = state.education.school.staff.homeroom;
  const rel = id === undefined ? undefined : state.relationships[id];
  if (rel) rel.affection = clampInt(rel.affection + delta, 0, 100);
}

function parentsLoseTrust(state: LifeState, delta: number, content: ContentBundle): void {
  for (const p of householdParents(state, content)) {
    const rel = state.relationships[p.id];
    if (rel) rel.trust = clampInt(rel.trust + delta, 0, 100);
  }
}

/** The catch chance for the next try: a base, more for each earlier try this year, never past max. */
export function catchChance(base: number, perTry: number, max: number, tries: number): number {
  return Math.min(max, base + perTry * tries);
}

export function cheatOnTest(state: LifeState, content: ContentBundle): void {
  const cur = state.education.current!;
  const a = content.balance.school.actions.cheat;
  const y = yearRecord(state);
  const p = catchChance(a.catch.base, a.catch.perTry, a.catch.max, y.cheated);
  y.cheated += 1;
  cur.boost += a.grades;
  if (!chance(state.rng, p)) {
    bumpStat(state, 'stress', a.stress);
    return;
  }
  y.caught = true;
  cur.boost += a.caught.grades;
  bumpStat(state, 'stress', a.caught.stress);
  state.teen.standing = clampInt(state.teen.standing - a.caught.standing, 0, 100);
  teacherCools(state, a.caught.teacherAffection);
  parentsLoseTrust(state, a.caught.parentTrust, content);
  state.flags.caught_cheating = true;
  if (chance(state.rng, a.caught.suspend)) state.flags.suspended = true;
  schoolLine(state, 'caughtCheating', {}, content);
  const teacher = state.education.school.staff.homeroom;
  queueSchoolEvent(state, 'caught_cheating', teacher !== undefined ? { teacher } : {}, content, 'next');
}

export function skipClass(state: LifeState, content: ContentBundle): void {
  const cur = state.education.current!;
  const a = content.balance.school.actions.skip;
  const y = yearRecord(state);
  const p = catchChance(a.catch.base, a.catch.perTry, a.catch.max, y.skipped);
  y.skipped += 1;
  cur.boost += a.grades;
  bumpStat(state, 'stress', a.stress);
  bumpStat(state, 'happiness', a.happiness);
  if (!chance(state.rng, p)) return;
  y.caught = true;
  teacherCools(state, a.teacherAffection);
  schoolLine(state, 'skippedCaught', {}, content);
  // School years only: the truancy trouble of the teen years (letters home, a hearing) follows.
  if (cur.program !== 'college' && cur.program !== 'trade' && cur.program !== 'grad' && state.character.age >= a.offenseAge) {
    const teacher = state.education.school.staff.homeroom;
    queueSchoolEvent(state, 'skipped', teacher !== undefined ? { teacher } : {}, content, 'next');
  }
}

/** Whether a person is your teacher or your classmate (for the interaction sheet's grouping). */
export const isSchoolPerson = (state: LifeState, id: Id): boolean => state.relationships[id]?.kind === 'teacher' || state.relationships[id]?.kind === 'classmate';

