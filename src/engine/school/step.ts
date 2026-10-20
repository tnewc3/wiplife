/**
 * The school parts of the education step (Batch 3), around the existing
 * grading: the exams the finishing year ends with come first (their results
 * shape the grade and the choice at the end of compulsory school); once the
 * next school year is settled, the choice is made good, the class and staff
 * are made or refreshed, the report card's spread is brought up to the stage
 * and this year's record starts empty.
 */
import type { ContentBundle } from '../../content/schemas';
import { chance } from '../rng';
import type { LifeState } from '../types';
import { settleChoice } from './choice';
import { queueSchoolEvent } from './events';
import { syncSchoolPeople } from './people';
import { reportCard, refreshSpread } from './report';
import { emptySchoolYear } from './state';

export { runExams } from './exams';

/** After the new school year's enrollment is settled (and before tuition is paid). */
export function startSchoolYear(state: LifeState, content: ContentBundle): void {
  settleChoice(state, content);
  syncSchoolPeople(state, content);
  const sc = state.education.school;
  const cur = state.education.current;
  if (!cur) {
    sc.spread = {};
    sc.year = emptySchoolYear(state.currentYear);
    return;
  }
  refreshSpread(state, cur, content);
  sc.year = emptySchoolYear(state.currentYear);
  const card = reportCard(state, content);
  if (card.length > 0) {
    state.flags.report_failing = card.some((s) => s.band === 'failing');
    state.flags.report_shining = card.some((s) => s.band === 'top');
    if (chance(state.rng, content.balance.school.report.eventChance)) queueSchoolEvent(state, 'report', {}, content);
  }
}
