/**
 * The report card (Batch 3): 4 to 6 subjects from the country's curriculum for
 * the stage you are in. A subject's grade is your year's grade (the GPA of
 * the program) plus a stored spread for that subject: how well it suits you
 * (its stat's pull) and a draw, kept within a limit, a share of which is drawn
 * again each year. Studying a subject in particular lifts its spread. Numbers:
 * balance/school.yaml (report).
 */
import type { ContentBundle } from '../../content/schemas';
import { letterGrade, roundGpa } from '../education';
import { scoreOf } from '../events/checks';
import { rollNormal } from '../random';
import { chance } from '../rng';
import type { Enrollment, LifeState } from '../types';
import { curriculumFor } from './query';

export type GradeBand = 'top' | 'strong' | 'solid' | 'fair' | 'weak' | 'failing';

/** A subject's spread drawn from scratch: its stat's weight × (value − 50) plus a draw, within the limit. */
function drawSpread(state: LifeState, stat: Parameters<typeof scoreOf>[1], content: ContentBundle): number {
  const r = content.balance.school.report.spread;
  const spread = r.stat * (scoreOf(state, stat) - 50) + rollNormal(state.rng, { mean: 0, sd: r.sd });
  return Math.round(Math.max(-r.max, Math.min(r.max, spread)) * 100) / 100;
}

/**
 * Brings the spread in line with this stage's subjects as the school year begins: subjects new to the stage get
 * a draw, and each of the others is drawn again with the `redraw` chance. Draws from the life's generator.
 */
export function refreshSpread(state: LifeState, cur: Enrollment, content: ContentBundle): void {
  const sc = state.education.school;
  const subjects = curriculumFor(state, cur.program, cur.year, content);
  if (subjects.length === 0) {
    sc.spread = {};
    return;
  }
  const redraw = content.balance.school.report.spread.redraw;
  const next: Record<string, number> = {};
  for (const s of subjects) {
    const old = sc.spread[s.id];
    next[s.id] = old === undefined || chance(state.rng, redraw) ? drawSpread(state, s.stat, content) : old;
  }
  sc.spread = next;
}

/** The band of words a grade earns (the words are in src/ui/labels.ts). */
export function gradeBand(gpa: number, content: ContentBundle): GradeBand {
  const bands = content.balance.school.report.bands;
  return (bands.find((b) => gpa >= b.min) ?? bands[bands.length - 1]!).id;
}

export interface SubjectGrade {
  id: string;
  name: string;
  /** The subject's grade in GPA points (0–4). */
  gpa: number;
  /** The grade as the country writes it ("B+", "87%", "8.7"). */
  grade: string;
  band: GradeBand;
}

/** This year's report card: each subject's grade, or an empty list outside school with a curriculum. */
export function reportCard(state: LifeState, content: ContentBundle): SubjectGrade[] {
  const cur = state.education.current;
  if (!cur) return [];
  const sc = state.education.school;
  return curriculumFor(state, cur.program, cur.year, content).map((s) => {
    const gpa = roundGpa(cur.gpa + (sc.spread[s.id] ?? 0));
    return { id: s.id, name: s.name, gpa, grade: letterGrade(gpa, state, content), band: gradeBand(gpa, content) };
  });
}

/** The subject you are weakest at (the target of "work on grades"), if any. */
export function weakestSubject(state: LifeState, content: ContentBundle): SubjectGrade | null {
  const card = reportCard(state, content);
  return card.length === 0 ? null : card.reduce((a, b) => (b.gpa < a.gpa ? b : a));
}
