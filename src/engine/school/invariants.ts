/**
 * Invariants for school and work life (Batch 3): your class and teachers are
 * real people of the right kind and age, a teacher is never in a romance or a
 * couple (whatever made them), the exams and the venue are well formed, and
 * your coworkers never outnumber what your workplace's size allows. The
 * romance-under-18 rule is checked with the teen years' (../teen/invariants.ts).
 */
import type { ContentBundle } from '../../content/schemas';
import { workplaceSize } from '../career';
import { ageOf, isRomanticKind } from '../relationships';
import type { LifeState } from '../types';

/** Failures of the rule that no teacher is ever a romance or a couple. Also counted by the simulation. */
export function teacherRomanceFailures(state: LifeState): string[] {
  const failures: string[] = [];
  for (const [id, rel] of Object.entries(state.relationships)) {
    // A teacher is tagged when made; whatever they have become since, a romantic kind is a failure.
    if (isRomanticKind(rel.kind) && state.people[id]?.tags.includes('teacher')) failures.push(`relationship ${id} (${rel.kind}): a teacher in a romance`);
  }
  for (const [key, tie] of Object.entries(state.web.ties)) {
    for (const pid of [tie.a, tie.b]) {
      if (state.relationships[pid]?.kind === 'teacher') failures.push(`tie ${key}: ${pid} is a teacher and in a tie`);
    }
  }
  return failures;
}

export function schoolFailures(state: LifeState, content: ContentBundle): string[] {
  const failures = teacherRomanceFailures(state);
  const sc = state.education.school;
  const adultAge = content.balance.relationships.adultAge;
  for (const id of sc.classmates) {
    // A classmate may become a friend or a partner and stays in the class; never a teacher, and never gone.
    const kind = state.relationships[id]?.kind;
    if (kind === undefined || kind === 'teacher') failures.push(`class member ${id} is not a classmate`);
  }
  for (const [role, id] of Object.entries(sc.staff)) {
    const rel = state.relationships[id];
    const person = state.people[id];
    if (!rel || rel.kind !== 'teacher' || !person) failures.push(`${role} ${id} is not a teacher`);
    else if (ageOf(state, person) < adultAge) failures.push(`teacher ${id} is under ${adultAge}`);
  }
  if (new Set(sc.exams.map((e) => e.id)).size !== sc.exams.length) failures.push('an exam is listed twice');
  for (const e of sc.exams) if (!Number.isFinite(e.score) || e.score < 0 || e.score > 100) failures.push(`exam ${e.id}: score ${e.score} is out of range`);
  const cur = state.education.current;
  if (cur?.venue !== undefined && cur.program !== 'high') failures.push('a venue on a program that is not secondary school');
  if (state.career.job) {
    const coworkers = Object.values(state.relationships).filter((r) => r.kind === 'coworker' && r.status !== 'ended' && state.people[r.personId]?.alive).length;
    const size = workplaceSize(state, content);
    if (coworkers > size.max) failures.push(`${coworkers} coworkers at a workplace for at most ${size.max}`);
  }
  return failures;
}
