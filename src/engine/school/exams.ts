/**
 * Exams (Batch 3): the country holds some (countries/*.yaml school.exams), one
 * for each stage-year it names. An exam is sat as that year finishes, in the
 * education step: a score from your grades, stats, luck and how you spent the
 * year, cut into a band (top, pass, fail), stored, set as the flag exam_<id>
 * and handed to an event that tells it (registries/school.yaml). What the
 * result does depends on the exam's kind (balance/school.yaml exams):
 *
 * - gate: decides which choices at the end of compulsory school are open (./choice.ts);
 * - confirm: a place you were offered depends on it, and is withdrawn if you miss it;
 * - entrance: it adds to your chances at college and trade school (`admissionExamPoints`);
 * - leaving: it counts toward the grade of the year it ends;
 * - placement: it decides how good your next school is (`placementShift`).
 */
import type { ContentBundle, ExamBand, ExamId, SchoolTrigger } from '../../content/schemas';
import { modelChance } from '../education';
import { clampInt, rollNormal } from '../random';
import { educationCountry } from '../travel/travel';
import type { ExamResult, LifeState } from '../types';
import { queueSchoolEvent, schoolLine } from './events';
import { bumpStat, examSlots, lastYear } from './query';

/** The band a score falls in for an exam. */
export function bandOf(id: ExamId, score: number, content: ContentBundle): ExamBand {
  const b = content.balance.school.exams[id];
  return score >= b.top ? 'top' : score >= b.pass ? 'pass' : 'fail';
}

/** The score for an exam now, before the swing: the model's chance in percent and how you spent the year. */
export function examExpected(state: LifeState, id: ExamId, content: ContentBundle): number {
  const cur = state.education.current;
  const b = content.balance.school.exams[id];
  const pct = modelChance(state, b.model, cur?.gpa, content) * 100;
  const prep = content.balance.school.prep;
  const last = lastYear(state);
  const bonus = last ? (last.effort === 'study' ? prep.study : last.effort === 'slack' ? prep.slack : 0) + (last.tutor > 0 ? prep.tutor : 0) : 0;
  return pct + bonus;
}

/** Sits an exam: draws the swing from the life's generator, stores the result and tells it. Returns the result. */
export function sitExam(state: LifeState, id: ExamId, content: ContentBundle): ExamResult {
  const b = content.balance.school.exams[id];
  const score = clampInt(examExpected(state, id, content) + rollNormal(state.rng, { mean: 0, sd: b.swing }), 0, 100);
  const result: ExamResult = { id, year: state.currentYear, score, band: bandOf(id, score, content) };
  const sc = state.education.school;
  sc.exams = [...sc.exams.filter((e) => e.id !== id), result];
  state.flags[`exam_${id}`] = result.band;
  bumpStat(state, 'stress', content.balance.school.examStress);
  const exam = educationCountry(state, content).words.examNames[id] ?? id;
  schoolLine(state, result.band === 'top' ? 'examTop' : result.band === 'pass' ? 'examPass' : 'examFail', { exam }, content);
  const cur = state.education.current;
  switch (b.kind) {
    case 'leaving':
      if (cur) cur.boost += (score - 50) * content.balance.school.leaving;
      break;
    case 'placement':
      sc.shift = (score - 50) * content.balance.school.placement;
      break;
    case 'confirm': {
      const a = state.education.admission;
      if (a?.conditional?.exam === id && score < a.conditional.min) {
        state.education.admission = null;
        const city = content.cities[state.character.cityId];
        schoolLine(state, 'offerMissed', { school: a.program === 'college' ? (city?.schools[a.tier ?? 'state'] ?? '') : '' }, content);
        state.flags.missed_offer = true;
      }
      break;
    }
    case 'gate':
    case 'entrance':
      break;
  }
  queueSchoolEvent(state, id as SchoolTrigger, {}, content);
  return result;
}

/** The exams that finish with the school year now ending (before the grade is settled), and their results. */
export function runExams(state: LifeState, content: ContentBundle): void {
  const cur = state.education.current;
  if (!cur || (cur.program !== 'middle' && cur.program !== 'high')) return;
  for (const slot of examSlots(state, content)) {
    if (slot.program === cur.program && slot.year === cur.year) sitExam(state, slot.id, content);
  }
}

/** Your best score in an entrance exam you have sat, if any. */
export function entranceScore(state: LifeState, content: ContentBundle): number | undefined {
  let best: number | undefined;
  for (const e of state.education.school.exams) {
    if (content.balance.school.exams[e.id].kind === 'entrance' && (best === undefined || e.score > best)) best = e.score;
  }
  return best;
}

/** Percentage points an entrance exam adds to (or takes off) an application: (score − pivot) × the tier's weight. */
export function admissionExamPoints(state: LifeState, program: 'college' | 'trade', tier: 'community' | 'state' | 'elite' | undefined, content: ContentBundle): number {
  const score = entranceScore(state, content);
  if (score === undefined) return 0;
  const a = content.balance.school.admission;
  return (score - a.pivot) * (program === 'trade' ? a.trade : a.college[tier ?? 'state']);
}

/** The exam a college place waits on (the country's `confirm` exam, if you haven't sat it yet this stage). */
export function confirmExam(state: LifeState, content: ContentBundle): ExamId | undefined {
  const cur = state.education.current;
  if (!cur || cur.program !== 'high') return undefined;
  return examSlots(state, content).find((s) => s.program === 'high' && content.balance.school.exams[s.id].kind === 'confirm' && s.year >= cur.year)?.id;
}

/** The shift a placement exam gave the school you are at (high school only). */
export function placementShift(state: LifeState): number {
  return state.education.current?.program === 'high' ? state.education.school.shift : 0;
}
