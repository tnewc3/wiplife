/**
 * Relationships (year pipeline step 7): drift and pruning. Numbers come from
 * src/content/balance/relationships.yaml.
 *
 * Drift: affection slowly fades with anyone you made no new memory with
 * lately, gently, and never below a floor for their kind. Pruning: people
 * outside family and romance fade out of your life (status 'ended') when you
 * drift apart, when an acquaintance leaves no memory for years, when they
 * die (friends are remembered), or when too many people crowd the list.
 * Your current boss stays while you have the job.
 */
import { isDraft, original } from 'immer';
import type { ContentBundle } from '../../content/schemas';
import { curveAt } from '../curve';
import { clampInt } from '../random';
import { isFamilyKind, isRomanticKind } from '../relationships';
import { chance } from '../rng';
import type { LifeState, Relationship } from '../types';

function lastMemoryYear(rel: Relationship): number | undefined {
  let last: number | undefined;
  for (const m of rel.memories) if (last === undefined || m.year > last) last = m.year;
  return last;
}

/** Affection lost this year: the kind's rate scaled by Kindness, a fraction lost by chance. Draws from `state`'s generator. */
function driftLoss(state: LifeState, rate: number, kindness: number): number {
  const loss = rate * kindness;
  const whole = Math.floor(loss);
  return whole + (loss > whole && chance(state.rng, loss - whole) ? 1 : 0);
}

/**
 * Applies drift. Relationships are handled in id order; reads go through
 * `view`. Returns the new affection of everyone who drifted.
 */
function drift(state: LifeState, view: LifeState, content: ContentBundle): Map<string, number> {
  const { perYear, floor, graceYears, kindness } = content.balance.relationships.drift;
  const scale = curveAt(kindness, view.character.personality.kindness);
  const changed = new Map<string, number>();
  for (const id of Object.keys(view.relationships).sort()) {
    const seen = view.relationships[id]!;
    if (seen.status !== 'active' || !view.people[id]?.alive) continue;
    const last = lastMemoryYear(seen);
    if (last !== undefined && state.currentYear - last <= graceYears) continue;
    const bottom = floor[seen.kind];
    if (seen.affection <= bottom) continue;
    const lost = driftLoss(state, perYear[seen.kind], scale);
    if (lost === 0) continue;
    const affection = clampInt(Math.max(bottom, seen.affection - lost), 0, 100);
    state.relationships[id]!.affection = affection;
    changed.set(id, affection);
  }
  return changed;
}

/** People who can fade out of your life: not family, not romance. */
const prunable = (rel: Relationship) => !isFamilyKind(rel.kind) && !isRomanticKind(rel.kind);

/** Order in which people fade when the list is too long: acquaintances first, then the least close. */
function fadeOrder(a: Relationship, b: Relationship): number {
  const rank = (r: Relationship) => (r.kind === 'friend' ? 2 : r.kind === 'acquaintance' || r.kind === 'classmate' ? 0 : 1);
  return rank(a) - rank(b) || a.affection - b.affection || (a.personId < b.personId ? -1 : 1);
}

/**
 * Ends the relationships that have faded. Reads `view` with the affection
 * after drift (`drifted`), and writes only the relationships that end.
 */
function prune(state: LifeState, view: LifeState, drifted: Map<string, number>, content: ContentBundle): void {
  const { forgetAfterYears, driftApartAt, maxPeople } = content.balance.relationships.prune;
  const year = state.currentYear;
  const remaining: Relationship[] = [];
  const end = (id: string) => {
    state.relationships[id]!.status = 'ended';
  };
  for (const id of Object.keys(view.relationships).sort()) {
    const seen = view.relationships[id]!;
    if (!prunable(seen) || seen.status === 'ended') continue;
    // Your boss stays in your life while you work there (Stage 8).
    if (seen.kind === 'boss' && view.career.job !== null && view.people[id]?.alive) continue;
    const rel = drifted.has(id) ? { ...seen, affection: drifted.get(id)! } : seen;
    const person = view.people[id];
    const forgettable = rel.kind === 'acquaintance' || rel.kind === 'classmate';
    const quiet = year - (lastMemoryYear(rel) ?? rel.since) >= forgetAfterYears;
    const fades =
      !person ||
      (!person.alive ? rel.kind !== 'friend' : rel.status === 'active' && (rel.affection <= driftApartAt || (forgettable && quiet)));
    if (fades) end(id);
    else if (person?.alive && rel.status === 'active') remaining.push(rel);
  }
  if (remaining.length > maxPeople) {
    for (const rel of remaining.sort(fadeOrder).slice(0, remaining.length - maxPeople)) end(rel.personId);
  }
}

/** Step 7: apply drift, then let faded relationships go. */
export function runRelationships(state: LifeState, content: ContentBundle): void {
  // Read through the life as the earlier steps left it (faster than the draft).
  const view = isDraft(state) ? (original(state) as LifeState) : state;
  prune(state, view, drift(state, view, content), content);
}
