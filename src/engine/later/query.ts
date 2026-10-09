/**
 * Questions about later life (L1): your grandchildren, the care you need,
 * a death you see coming and your will's gaps. Light on imports, so the
 * condition evaluator can use it.
 */
import type { Compare, LaterCondition } from '../../content/schemas';
import type { Id, LaterState, LifeState, Person } from '../types';

export function emptyLater(): LaterState {
  return { care: null, terminal: null, amends: [], offered: {} };
}

function compare(value: number, c: Compare): boolean {
  if (c.gt !== undefined && !(value > c.gt)) return false;
  if (c.gte !== undefined && !(value >= c.gte)) return false;
  if (c.lt !== undefined && !(value < c.lt)) return false;
  if (c.lte !== undefined && !(value <= c.lte)) return false;
  if (c.eq !== undefined && value !== c.eq) return false;
  return true;
}

/** Your living grandchildren who are on your People list and not in your care as your own child, in id order. */
export function grandchildren(state: LifeState): (Person & { grandchild: NonNullable<Person['grandchild']> })[] {
  return Object.keys(state.relationships)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .flatMap((id) => {
      const rel = state.relationships[id]!;
      const person = state.people[id];
      if (rel.kind !== 'grandchild' || rel.status === 'ended' || !person?.alive || !person.grandchild) return [];
      return [person as Person & { grandchild: NonNullable<Person['grandchild']> }];
    });
}

/** The grandchildren you are raising: living children of yours with the grandchild origin. */
export function raisedGrandchildren(state: LifeState): Person[] {
  return Object.keys(state.relationships)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .flatMap((id) => {
      const person = state.people[id];
      const rel = state.relationships[id]!;
      if (!person?.alive || !person.child || person.child.origin !== 'grandchild' || rel.kind !== 'child' || rel.status === 'ended') return [];
      return [person];
    });
}

/** Who is named in your will, or null without one. */
function named(state: LifeState): Set<Id> | null {
  return state.will === null ? null : new Set(state.will.shares.filter((s) => s.kind === 'person').map((s) => s.id));
}

/**
 * The people who matter to a will (your spouse, your living children and
 * stepchildren, and your grandchildren) who it leaves out, and, when you have
 * a will, those it names who are no longer alive. With no will at all, the
 * people who would matter. Without anyone, an empty list.
 */
export function willGaps(state: LifeState): { missing: Id[]; gone: Id[] } {
  const will = named(state);
  const matter: Id[] = [];
  for (const id of Object.keys(state.relationships).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    const rel = state.relationships[id]!;
    const person = state.people[id];
    if (!person?.alive || rel.status === 'ended') continue;
    if (['spouse', 'child', 'stepchild', 'grandchild'].includes(rel.kind)) matter.push(id);
  }
  const missing = will === null ? matter : matter.filter((id) => !will.has(id));
  const gone = will === null ? [] : [...will].filter((id) => state.people[id]?.alive !== true);
  return { missing, gone };
}

/** The will is missing, or leaves out someone who matters, or names someone who has died. */
export function willOutOfDate(state: LifeState): boolean {
  const gaps = willGaps(state);
  return gaps.missing.length > 0 || gaps.gone.length > 0;
}

/** Years since a foreseen death began, or null when it hasn't. */
export function terminalYears(state: LifeState): number | null {
  return state.later.terminal === null ? null : state.currentYear - state.later.terminal.since;
}

/** How care is provided now: the option, or 'none' (needed, not arranged); null when you don't need care. */
export function careNow(state: LifeState): 'family' | 'paid' | 'assisted' | 'none' | null {
  const care = state.later.care;
  return care === null ? null : (care.option ?? 'none');
}

/** True when every field of the later-life condition holds. */
export function laterHolds(q: LaterCondition, state: LifeState): boolean {
  const l = state.later;
  if (q.grandchildren || q.minors) {
    const kids = grandchildren(state);
    if (q.grandchildren && !compare(kids.length, q.grandchildren)) return false;
    if (q.minors && !compare(kids.filter((k) => state.currentYear - k.birthYear < 18).length, q.minors)) return false;
  }
  if (q.raising !== undefined && (raisedGrandchildren(state).length > 0) !== q.raising) return false;
  if (q.care !== undefined && (l.care !== null) !== q.care) return false;
  if (q.careOption && !(q.careOption as readonly string[]).includes(careNow(state) ?? 'none')) return false;
  if (q.terminal !== undefined && (l.terminal !== null) !== q.terminal) return false;
  if (q.hospice && !(q.hospice as readonly string[]).includes(l.terminal?.hospice ?? 'none')) return false;
  if (q.wishes !== undefined && (l.terminal?.wishesYear !== undefined) !== q.wishes) return false;
  if (q.willOutOfDate !== undefined && willOutOfDate(state) !== q.willOutOfDate) return false;
  if (q.amends && !compare(l.amends.filter((a) => a.result === 'made').length, q.amends)) return false;
  return true;
}
