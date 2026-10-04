/**
 * Questions about your family that conditions ask (E2a): how many children
 * you have, how old they are, a pregnancy or process under way, child
 * support. Light on imports so the condition evaluator can use it.
 */
import type { Compare, FamilyCondition } from '../../content/schemas';
import type { LifeState } from '../types';

function compare(value: number, c: Compare): boolean {
  if (c.gt !== undefined && !(value > c.gt)) return false;
  if (c.gte !== undefined && !(value >= c.gte)) return false;
  if (c.lt !== undefined && !(value < c.lt)) return false;
  if (c.lte !== undefined && !(value <= c.lte)) return false;
  if (c.eq !== undefined && value !== c.eq) return false;
  return true;
}

/** Ages of your living children (kind child) and, separately, living stepchildren. */
function childAges(state: LifeState): { children: number[]; steps: number[] } {
  const children: number[] = [];
  const steps: number[] = [];
  for (const id of Object.keys(state.relationships)) {
    const rel = state.relationships[id]!;
    const person = state.people[id];
    if (!person?.alive || !person.child || rel.status === 'ended') continue;
    const age = state.currentYear - person.birthYear;
    if (rel.kind === 'child') children.push(age);
    else if (rel.kind === 'stepchild') steps.push(age);
  }
  return { children, steps };
}

/** True when every field of the family condition holds. `adultAge` defaults to 18 (the schema never allows less). */
export function familyHolds(q: FamilyCondition, state: LifeState, adultAge = 18): boolean {
  const f = state.family;
  const { children, steps } = childAges(state);
  if (q.pregnant !== undefined && (f.pregnancy !== null) !== q.pregnant) return false;
  if (q.children && !compare(children.length, q.children)) return false;
  if (q.minors && !compare(children.filter((a) => a < adultAge).length, q.minors)) return false;
  if (q.youngest && !(children.length > 0 && compare(Math.min(...children), q.youngest))) return false;
  if (q.oldest && !(children.length > 0 && compare(Math.max(...children), q.oldest))) return false;
  if (q.steps && !compare(steps.length, q.steps)) return false;
  if (q.process && !q.process.includes(f.process?.kind ?? 'none')) return false;
  if (q.attempts && !compare(f.attempts, q.attempts)) return false;
  if (q.canCarry !== undefined && state.character.canCarry !== q.canCarry) return false;
  if (q.support && !q.support.includes(f.support?.direction ?? 'none')) return false;
  if (q.lost !== undefined && f.lostChildren > 0 !== q.lost) return false;
  // E2b: heirs, the family line, guardians, trust and wills.
  const line = state.lineage;
  if (q.heir !== undefined && (line.parentLifeId !== undefined) !== q.heir) return false;
  if (q.generation && !compare(line.generation, q.generation)) return false;
  if (q.reputation && !compare(line.reputation, q.reputation)) return false;
  if (q.deeds && !q.deeds.some((d) => line.deeds.includes(d))) return false;
  if (q.guardian) {
    const h = state.housing;
    const kind = h.guardianId === undefined ? 'none' : h.foster ? 'foster' : (state.relationships[h.guardianId]?.kind ?? 'none');
    if (!(q.guardian as readonly string[]).includes(kind)) return false;
  }
  if (q.trust !== undefined && (state.finances.trust !== undefined) !== q.trust) return false;
  if (q.will !== undefined && (state.will !== null) !== q.will) return false;
  return true;
}
