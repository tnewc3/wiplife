/**
 * Education (year pipeline step 3): grades the school year just finished,
 * handles being held back and graduating, starts the next school (automatic
 * school by age, or a place you were accepted to or are going back to), and
 * pays the new school year's tuition. Numbers come from
 * src/content/balance/education.yaml; the rules live in ../education.ts.
 *
 * A school year starts as a year begins and is graded as the next begins,
 * so the events of the year you're in shape its grade. Kindergarten starts
 * at the start age; elementary, middle and high school follow on their own,
 * and high school ends as you turn 18 (19 if you were held back).
 */
import type { ContentBundle } from '../../content/schemas';
import {
  enrollForAge,
  finishedHighSchool,
  graduate,
  payTuition,
  roundGpa,
  schoolHistory,
  schoolName,
  startAdmission,
  yearGrade,
} from '../education';
import type { LifeState } from '../types';
import { applyStatEffects } from './economy';

/** Grades the year you were in, then moves you on: the next year, held back, or graduation. */
export function finishSchoolYear(state: LifeState, content: ContentBundle): void {
  const cur = state.education.current;
  if (!cur) return;
  const school = content.balance.education.school;
  const grade = yearGrade(state, cur, content, state.rng);
  const graded = cur.year - 1 + cur.repeats;
  cur.gpa = roundGpa((cur.gpa * graded + grade) / (graded + 1));
  cur.boost = 0;
  if (cur.program === 'high' && grade < school.repeatBelow && cur.repeats < school.maxRepeats) {
    cur.repeats += 1;
    schoolHistory(state, 'heldBack', {}, content);
    return;
  }
  cur.year += 1;
  if (cur.year > cur.lengthYears) graduate(state, content);
}

/** Step 3: update GPA, handle graduation or dropping out, start school, pay tuition. */
export function runEducation(state: LifeState, content: ContentBundle): void {
  const edu = state.education;
  edu.applied = [];
  finishSchoolYear(state, content);

  // A place you can't take up yet (you were held back) is withdrawn.
  if (edu.current && edu.admission) {
    schoolHistory(state, 'withdrawn', { school: schoolName(state, edu.admission, content) }, content);
    edu.admission = null;
  }
  if (!edu.current) {
    if (edu.admission) startAdmission(state, content);
    // School age, and school isn't finished or left: automatic school.
    else if (!edu.left && !finishedHighSchool(state)) enrollForAge(state, content);
  }

  const cur = edu.current;
  if (!cur) return;
  payTuition(state, content);
  applyStatEffects(state, content.balance.education.yearEffects[cur.program]);
}
