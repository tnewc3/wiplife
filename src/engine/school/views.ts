/**
 * What the School card shows beyond the grade (Batch 3): the report card, what
 * you can do this year, your class and teachers, the exams you have sat and
 * the choice at the end of compulsory school. Plain data for the UI; the words
 * for bands and blocks are in src/ui/labels.ts.
 */
import type { ContentBundle, ExamBand, ExamId, SchoolPath } from '../../content/schemas';
import { educationCountry } from '../travel/travel';
import type { Id, LifeState } from '../types';
import { apprenticeTrades, choiceBlock } from './choice';
import { reportCard, weakestSubject, type SubjectGrade } from './report';
import { schoolActionBlock, tutorCost, type SchoolActionBlock } from './rules';
import { curriculumFor, schoolChoice, thisYear } from './query';
import { staffList, staffWord } from './people';

export interface SchoolPersonLine {
  id: Id;
  name: string;
  age: number;
  /** "Classmate", or the teacher's role in the country's words ("Form tutor", "Headteacher"). */
  title: string;
  affection: number;
}

export interface SchoolChoiceView {
  /** The choice is open now (made in this year, before the results). */
  open: boolean;
  /** The path picked so far, and the trade for an apprenticeship. */
  made: SchoolPath | null;
  tradeId: Id | null;
  options: { path: SchoolPath; name: string }[];
  trades: { id: Id; name: string }[];
  /** The GCSE-style exam the paths depend on, in the country's words. */
  exam: string;
}

export interface SchoolLifeView {
  /** In school with a report card (elementary, middle or high school). */
  hasCard: boolean;
  card: SubjectGrade[];
  weakest: string | null;
  subjects: { id: string; name: string }[];
  /** This year's actions so far. */
  year: { effort: 'study' | 'slack' | null; subject: string | null; tutor: number; cheated: number; skipped: number; caught: boolean };
  blocks: Record<'study' | 'slack' | 'tutor' | 'cheat' | 'skip', SchoolActionBlock | null>;
  tutorCost: number;
  classmates: SchoolPersonLine[];
  staff: SchoolPersonLine[];
  /** The exams you have sat (the latest of each), in the country's words. */
  exams: { id: ExamId; name: string; band: ExamBand }[];
  choice: SchoolChoiceView | null;
  /** A place you hold that depends on an exam result still to come (the UK's A-levels). */
  conditional: { exam: string; school: string } | null;
}

function line(state: LifeState, id: Id, title: string): SchoolPersonLine | null {
  const person = state.people[id];
  const rel = state.relationships[id];
  if (!person || !rel) return null;
  return { id, name: `${person.name.first} ${person.name.last}`, age: state.currentYear - person.birthYear, title, affection: rel.affection };
}

export function getSchoolLifeView(state: LifeState, content: ContentBundle): SchoolLifeView {
  const sc = state.education.school;
  const cur = state.education.current;
  const words = educationCountry(state, content).words;
  const card = reportCard(state, content);
  const y = thisYear(state);
  const block = (action: 'study' | 'slack' | 'tutor' | 'cheat' | 'skip') => (state.phase === 'yearStart' ? schoolActionBlock(state, action, content) : ('school' as const));
  const choice = schoolChoice(state, content);
  let choiceView: SchoolChoiceView | null = null;
  if (choice && choiceBlock(state, content) === null) {
    const pick = sc.choice;
    choiceView = {
      open: state.phase === 'yearStart',
      made: pick?.path ?? null,
      tradeId: pick?.tradeId ?? null,
      options: choice.options.map((path) => ({ path, name: words.choices?.[path] ?? path })),
      trades: apprenticeTrades(state, content).map((id) => ({ id, name: content.trades[id]!.name })),
      exam: words.examNames[choice.exam] ?? 'the exams',
    };
  }
  const admission = state.education.admission;
  const conditional =
    admission?.conditional && admission.program === 'college'
      ? { exam: words.examNames[admission.conditional.exam] ?? 'the exams', school: content.cities[state.character.cityId]?.schools[admission.tier ?? 'state'] ?? '' }
      : null;
  return {
    hasCard: cur !== undefined && cur !== null && card.length > 0,
    card,
    weakest: weakestSubject(state, content)?.name ?? null,
    subjects: cur ? curriculumFor(state, cur.program, cur.year, content).map((s) => ({ id: s.id, name: s.name })) : [],
    year: { effort: y.effort, subject: y.subject ?? null, tutor: y.tutor, cheated: y.cheated, skipped: y.skipped, caught: y.caught },
    blocks: { study: block('study'), slack: block('slack'), tutor: block('tutor'), cheat: block('cheat'), skip: block('skip') },
    tutorCost: tutorCost(state, content),
    classmates: sc.classmates.flatMap((id) => (state.people[id]?.alive ? [line(state, id, 'Classmate')] : [])).filter((l): l is SchoolPersonLine => l !== null),
    staff: staffList(state)
      .filter((s) => state.people[s.id]?.alive)
      .flatMap((s) => {
        const l = line(state, s.id, capitalize(staffWord(state, s.role, content)));
        return l ? [l] : [];
      }),
    exams: sc.exams.map((e) => ({ id: e.id, name: words.examNames[e.id] ?? e.id, band: e.band })),
    choice: choiceView,
    conditional,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
