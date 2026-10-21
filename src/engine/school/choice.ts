/**
 * The choice at the end of compulsory school (Batch 3; the UK's, countries/uk.yaml
 * school.choice): stay on for the sixth form, go to a further education college,
 * start an apprenticeship or go to work. You choose in the last compulsory year,
 * before the exam's results; the paths that are open depend on the result
 * (balance/school.yaml choice) and the choice is settled as the next year begins
 * (in the education step, once the exam is sat). A path that is closed to you
 * falls back to the college, which takes everyone.
 */
import { SCHOOL_PATHS, type ContentBundle, type SchoolPath } from '../../content/schemas';
import { expectedGrade, modelChance, schoolName } from '../education';
import { checkJobFits } from '../career';
import { chance } from '../rng';
import { educationCountry } from '../travel/travel';
import type { Enrollment, Id, LifeState } from '../types';
import { schoolLine } from './events';
import { examResult, schoolChoice } from './query';

export type PathBlock = 'none' | 'age' | 'made' | 'unknown' | 'trade';

/** The trades you could be apprenticed in here: active ones with a price in the country (employers cover it). */
export function apprenticeTrades(state: LifeState, content: ContentBundle): Id[] {
  const prices = educationCountry(state, content).tuition.trade;
  return Object.keys(content.trades)
    .sort()
    .filter((id) => !content.trades[id]!.retired && prices[id] !== undefined);
}

/** Why you can't make the choice now, or null when you can: the country has one, you are in its year of high school, and it isn't settled. */
export function choiceBlock(state: LifeState, content: ContentBundle): PathBlock | null {
  const choice = schoolChoice(state, content);
  const cur = state.education.current;
  if (!choice) return 'none';
  if (state.education.school.chosen || !cur || cur.program !== 'high' || cur.year !== choice.year) return 'age';
  return null;
}

/** Whether a path is one the country offers (and, for an apprenticeship, a trade you can learn here). */
export function pathBlock(state: LifeState, path: SchoolPath, tradeId: Id | undefined, content: ContentBundle): PathBlock | null {
  const base = choiceBlock(state, content);
  if (base) return base;
  const choice = schoolChoice(state, content)!;
  if (!(SCHOOL_PATHS as readonly string[]).includes(path) || !choice.options.includes(path)) return 'unknown';
  if (path === 'apprenticeship' && (tradeId === undefined || !apprenticeTrades(state, content).includes(tradeId))) return 'trade';
  return null;
}

/** You make the choice (once; you can change your mind until the year ends). */
export function choosePath(state: LifeState, path: SchoolPath, tradeId: Id | undefined, _content: ContentBundle): void {
  const cur = state.education.current!;
  state.education.school.choice = { path, ...(path === 'apprenticeship' && tradeId !== undefined ? { tradeId } : {}), year: cur.year };
}

/** The chance an employer takes you on as an apprentice (0–1), from the exam result and how you come across. */
export function apprenticeChance(state: LifeState, content: ContentBundle): number {
  const a = content.balance.school.choice.apprenticeship;
  return modelChance(state, a.model, state.education.current?.gpa, content);
}

/** The exam result the choice rests on (the country's gate exam), 0 without one. */
function gateScore(state: LifeState, content: ContentBundle): number {
  const choice = schoolChoice(state, content);
  return choice ? (examResult(state, choice.exam)?.score ?? 0) : 0;
}

function pathWord(state: LifeState, path: SchoolPath, content: ContentBundle): string {
  return educationCountry(state, content).words.choices?.[path] ?? path;
}

/** The college takes you: the last years of secondary school at a further education college. */
function goToCollege(state: LifeState, cur: Enrollment, content: ContentBundle, line: 'choseCollege' | 'fellBack'): void {
  cur.venue = 'college';
  cur.boost += content.balance.school.choice.college.grades;
  schoolLine(state, line, { path: pathWord(state, 'college', content), school: schoolName(state, { program: 'college', tier: 'community' }, content) }, content);
  state.flags.school_path = 'college';
}

/**
 * Settles the choice as the first year after it begins (the education step, after the year is graded): the path
 * you picked if its result allows, else the college. Without a pick you stay on if you can, else go to the college.
 */
export function settleChoice(state: LifeState, content: ContentBundle): void {
  const sc = state.education.school;
  const choice = schoolChoice(state, content);
  const cur = state.education.current;
  if (sc.chosen || !choice || !cur || cur.program !== 'high' || cur.year <= choice.year) return;
  sc.chosen = true;
  const pick = sc.choice;
  sc.choice = null;
  const score = gateScore(state, content);
  const b = content.balance.school.choice;
  const path: SchoolPath = pick?.path ?? 'stay';
  if (path === 'stay' && score < b.stay.min) {
    goToCollege(state, cur, content, 'fellBack');
    return;
  }
  if (path === 'apprenticeship') {
    const tradeId = pick?.tradeId;
    const trade = tradeId !== undefined ? content.trades[tradeId] : undefined;
    if (!trade || score < b.apprenticeship.min || !chance(state.rng, apprenticeChance(state, content))) {
      schoolLine(state, 'noApprenticeship', {}, content);
      goToCollege(state, cur, content, 'fellBack');
      return;
    }
    const enrollment: Enrollment = {
      program: 'trade',
      tradeId: tradeId!,
      year: 1,
      lengthYears: trade.years,
      gpa: 0,
      boost: 0,
      repeats: 0,
      // The employer covers the training.
      scholarship: 1,
      since: state.currentYear,
      apprentice: true,
    };
    enrollment.gpa = expectedGrade(state, enrollment, content);
    state.education.current = enrollment;
    state.flags.school_path = 'apprenticeship';
    schoolLine(state, 'choseApprenticeship', {}, content);
    checkJobFits(state, content);
    return;
  }
  if (path === 'work') {
    state.education.current = null;
    state.education.left = { ...cur, boost: 0, leftYear: state.currentYear };
    state.flags.school_path = 'work';
    schoolLine(state, 'choseWork', {}, content);
    checkJobFits(state, content);
    return;
  }
  if (path === 'college') {
    goToCollege(state, cur, content, 'choseCollege');
    return;
  }
  state.flags.school_path = 'stay';
  schoolLine(state, 'choseStay', { path: pathWord(state, 'stay', content) }, content);
}
