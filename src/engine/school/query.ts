/**
 * School life (Batch 3): the country's exams, choice and curriculum for the
 * school you are at, and the small readers the rest of the school code uses.
 * The country (with a city's changes, like Montreal's) is `educationCountry`.
 */
import type { ContentBundle, ExamId, ExamSlot, SchoolChoice, SubjectDef } from '../../content/schemas';
import { clampInt } from '../random';
import { educationCountry } from '../travel/travel';
import type { Enrollment, ExamResult, Id, LifeState, SchoolYearActions } from '../types';

export type SchoolStage = 'elementary' | 'middle' | 'high' | 'college' | 'trade' | 'grad';

/** The exams the country holds, with when. */
export function examSlots(state: LifeState, content: ContentBundle): readonly ExamSlot[] {
  return educationCountry(state, content).school.exams;
}

/** The choice at the end of compulsory school, where the country has one. */
export function schoolChoice(state: LifeState, content: ContentBundle): SchoolChoice | undefined {
  return educationCountry(state, content).school.choice;
}

/** The subjects of the report card for a stage and year of it (the UK's sixth form has its own). */
export function curriculumFor(state: LifeState, program: Enrollment['program'], year: number, content: ContentBundle): readonly SubjectDef[] {
  if (program !== 'elementary' && program !== 'middle' && program !== 'high') return [];
  const school = educationCountry(state, content).school;
  const c = school.curriculum;
  if (program === 'high' && c.upper && school.choice && year > school.choice.year) return c.upper;
  return c[program];
}

/** Your latest result in an exam, if you sat it. */
export function examResult(state: LifeState, id: ExamId): ExamResult | undefined {
  return state.education.school.exams.find((e) => e.id === id);
}

/** What you did in the school year that is under way (nothing before it began). */
export function thisYear(state: LifeState): SchoolYearActions {
  const y = state.education.school.year;
  return y.year === state.currentYear ? y : { year: state.currentYear, effort: null, tutor: 0, cheated: 0, skipped: 0, caught: false };
}

/** What you did in the school year that just finished (read by the yearly step, when the new year has begun). */
export function lastYear(state: LifeState): SchoolYearActions | null {
  const y = state.education.school.year;
  return y.year === state.currentYear - 1 ? y : null;
}

/** Adds to a stat (0–100). */
export function bumpStat(state: LifeState, key: 'stress' | 'happiness' | 'health', delta: number): void {
  const stats = state.character.stats;
  stats[key] = clampInt(stats[key] + delta, 0, 100);
}

/** The people of your school who are living and still in your life: your class and your teachers. */
export function schoolPeople(state: LifeState): Id[] {
  const s = state.education.school;
  return [...s.classmates, ...Object.values(s.staff)].filter((id) => state.people[id]?.alive === true && state.relationships[id]?.status !== 'ended');
}
