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
import { businessPeople } from '../business/query';
import { isDraft, original } from 'immer';
import type { ContentBundle } from '../../content/schemas';
import { curveAt } from '../curve';
import { fanIds } from '../fame/query';
import { clampInt } from '../random';
import { isFamilyKind, isRomanticKind } from '../relationships';
import { chance } from '../rng';
import { schoolPeople } from '../school/query';
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
  const rank = (r: Relationship) => (r.kind === 'friend' ? 2 : r.kind === 'acquaintance' || r.kind === 'classmate' || r.kind === 'teacher' ? 0 : 1);
  return rank(a) - rank(b) || a.affection - b.affection || (a.personId < b.personId ? -1 : 1);
}

/**
 * Ends the relationships that have faded. Reads `view` with the affection
 * after drift (`drifted`), and writes only the relationships that end.
 */
function prune(state: LifeState, view: LifeState, drifted: Map<string, number>, content: ContentBundle): string[] {
  const { forgetAfterYears, schoolForgetAfterYears, driftApartAt, maxPeople } = content.balance.relationships.prune;
  const year = state.currentYear;
  const remaining: Relationship[] = [];
  const ended: string[] = [];
  // Batch 3: your current class and teachers stay while you share the school, and your coworkers while you hold the job.
  // They count toward the cap, but only the others can be trimmed to fit it.
  const kept = new Set(schoolPeople(view));
  const working = view.career.job !== null;
  let fixed = 0;
  const end = (id: string) => {
    state.relationships[id]!.status = 'ended';
    ended.push(id);
  };
  for (const id of Object.keys(view.relationships).sort()) {
    const seen = view.relationships[id]!;
    if (!prunable(seen) || seen.status === 'ended') continue;
    // Your boss stays in your life while you work there (Stage 8).
    if (seen.kind === 'boss' && view.career.job !== null && view.people[id]?.alive) continue;
    if (view.people[id]?.alive && (kept.has(id) || (working && seen.kind === 'coworker'))) {
      fixed += 1;
      continue;
    }
    // W3: and the people who work in your businesses, and own a share of them.
    if (businessPeople(view).has(id) && view.people[id]?.alive) continue;
    // E6a: so do the people in your crew while you are in it.
    if (view.crime.crew?.members.includes(id) && view.people[id]?.alive) continue;
    // E6b: and the fans who came to you through your work (superfans, haters, critics) while you are in the business.
    if (view.fame.active && fanIds(view).has(id)) continue;
    const rel = drifted.has(id) ? { ...seen, affection: drifted.get(id)! } : seen;
    const person = view.people[id];
    const forgettable = rel.kind === 'acquaintance' || rel.kind === 'classmate' || rel.kind === 'teacher';
    // Batch 3: the people of a class you have left fade much sooner than anyone else you merely knew.
    const leftSchool = (rel.kind === 'classmate' || rel.kind === 'teacher') && person?.tags.includes('school') === true;
    const quiet = year - (lastMemoryYear(rel) ?? rel.since) >= (leftSchool ? schoolForgetAfterYears : forgetAfterYears);
    const fades =
      !person ||
      (!person.alive ? rel.kind !== 'friend' : rel.status === 'active' && (rel.affection <= driftApartAt || (forgettable && quiet)));
    if (fades) end(id);
    else if (person?.alive && rel.status === 'active') remaining.push(rel);
  }
  const room = Math.max(0, maxPeople - fixed);
  if (remaining.length > room) {
    for (const rel of remaining.sort(fadeOrder).slice(0, remaining.length - room)) end(rel.personId);
  }
  return ended;
}

/** People made for a role (a class, a workplace) whom nobody remembers: the relationship ended, no memory was ever made, and no crowd claims them. */
const FORGOTTEN_KINDS: readonly Relationship['kind'][] = ['classmate', 'teacher', 'coworker', 'boss'];

/**
 * Batch 3: removes the people of a class or workplace who have faded out of your life without ever leaving a memory,
 * so the people record (which every yearly step reads) doesn't grow with every school year and job. Their news lines
 * go too; ties and stories about them are dropped by the web step, and a follow-up that names one is dropped as
 * it always was when someone is missing.
 */
function purgeForgotten(state: LifeState, view: LifeState, ended: readonly string[]): void {
  const gone: string[] = [];
  for (const id of ended) {
    const rel = view.relationships[id]!;
    if (rel.memories.length > 0 || rel.wasSpouse || !FORGOTTEN_KINDS.includes(rel.kind)) continue;
    const person = view.people[id];
    if (!person || person.tags.some((t) => t.startsWith('crowd:')) || !person.tags.some((t) => FORGOTTEN_KINDS.includes(t as Relationship['kind']))) continue;
    if (view.scheduled.some((s) => Object.values(s.cast).includes(id)) || view.pending.some((p) => Object.values(p.cast).includes(id))) continue;
    gone.push(id);
  }
  if (gone.length === 0) return;
  // Not anyone a story is about, or was told by: the web still points at them until the stories fade.
  if (view.web.items.length > 0) {
    const told = new Set<string>();
    for (const item of view.web.items) {
      told.add(item.subject);
      for (const [who, h] of Object.entries(item.holders)) {
        told.add(who);
        told.add(h.from);
      }
    }
    for (let i = gone.length - 1; i >= 0; i--) if (told.has(gone[i]!)) gone.splice(i, 1);
    if (gone.length === 0) return;
  }
  // The newest person stays: ids come from the highest one in use, and a forgotten id handed to a later person would make the
  // log of what you did with them read as if it was about the newcomer.
  const newest = Math.max(...Object.keys(state.people).map((id) => Number(id.slice(1))).filter(Number.isInteger));
  const kept = gone.filter((id) => Number(id.slice(1)) !== newest);
  if (kept.length === 0) return;
  const set = new Set(kept);
  for (const id of kept) {
    delete state.relationships[id];
    delete state.people[id];
  }
  if (state.news.some((y) => y.lines.some((l) => set.has(l.personId)))) {
    for (const year of state.news) year.lines = year.lines.filter((l) => !set.has(l.personId));
    state.news = state.news.filter((y) => y.lines.length > 0);
  }
}

/** Step 7: apply drift, then let faded relationships go. */
export function runRelationships(state: LifeState, content: ContentBundle): void {
  // Read through the life as the earlier steps left it (faster than the draft).
  const view = isDraft(state) ? (original(state) as LifeState) : state;
  purgeForgotten(state, view, prune(state, view, drift(state, view, content), content));
}
