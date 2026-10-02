/**
 * Pacing director (year pipeline step 9): queues due scheduled events first,
 * then picks new events up to this year's budget, and orders them by tone.
 * Numbers come from src/content/balance/pacing.yaml.
 */
import { isDraft, original } from 'immer';
import type { ContentBundle, EventDef } from '../../content/schemas';
import { evaluate } from '../conditions';
import { castEvent, uncast } from '../events/casting';
import { eventIndex, eventWeight, fitsSetting } from '../events/selection';
import { weightedPick } from '../random';
import { consistencyProblems } from '../presence';
import { isFamilyKind, kindSince, romanceAllowed } from '../relationships';
import { nextFloat, nextInt } from '../rng';
import type { EventInstance, Id, LifeState } from '../types';

/** Extra events this year: one per sign that life is volatile, up to the balance maximum. */
export function volatilityBonus(state: LifeState, content: ContentBundle): number {
  const v = content.balance.pacing.volatility;
  const since = state.currentYear - v.recentYears;
  const signs = [
    state.character.personality.riskTaking > v.riskTakingAbove,
    state.history.some((e) => e.importance === 3 && e.year >= since && e.year < state.currentYear),
    // Someone new, or a relationship that changed (started dating, married).
    Object.values(state.relationships).some((r) => !isFamilyKind(r.kind) && kindSince(r) >= since && kindSince(r) < state.currentYear),
  ].filter(Boolean).length;
  return Math.min(v.maxBonus, signs);
}

/**
 * How many events this year: the stage's range plus the volatility bonus,
 * never above the cap. Draws from `state`'s generator; reads `view`.
 */
export function yearBudget(state: LifeState, content: ContentBundle, view: LifeState = state): number {
  const { budgets, cap } = content.balance.pacing;
  const range = budgets[view.character.lifeStage];
  return Math.min(cap, nextInt(state.rng, range.min, range.max) + volatilityBonus(view, content));
}

interface Picked {
  def: EventDef;
  cast: Record<string, Id>;
  since?: number;
}

/**
 * Casts the event and checks its full requirements and the adults-only rule
 * for romance; undoes the cast if they fail.
 */
function tryCast(state: LifeState, view: LifeState, def: EventDef, content: ContentBundle, preset?: Record<string, Id>): Picked | null {
  const result = castEvent(state, def, state.rng, content, preset, view);
  if (!result) return null;
  if (
    !evaluate(def.requires, state, { cast: result.cast, roles: 'strict', content }) ||
    !romanceAllowed(state, def, result.cast, content) ||
    consistencyProblems(state, def, result.cast, content).length > 0
  ) {
    uncast(state, result.created);
    return null;
  }
  return { def, cast: result.cast };
}

/** Step 9: queue due scheduled events first, then pick new events. */
export function runPacing(state: LifeState, content: ContentBundle): void {
  const year = state.currentYear;
  const { cap, toneOrder, minTotalWeight } = content.balance.pacing;
  const picked: Picked[] = [];
  // Reads go through the life as the earlier steps left it (beginYear gives
  // each step its own draft), which is much faster than reading the draft.
  // It stays accurate here: this step only writes the event log (at the end)
  // and people created by casting, whom later picks don't need.
  const view = isDraft(state) ? (original(state) as LifeState) : state;

  // Due follow-ups first. One that can't happen any more (retired, missing,
  // someone in it died, or its requirements fail) is dropped. Past the cap,
  // the rest wait a year. In prison, only prison events happen: the rest wait
  // for your release (once each); outside, a prison event is dropped.
  const inside = state.housing.kind === 'incarcerated';
  const due = state.scheduled.filter((s) => s.dueYear <= year);
  state.scheduled = state.scheduled.filter((s) => s.dueYear > year);
  for (const item of due) {
    const def = content.events[item.eventId];
    if (def && !fitsSetting(view, def, content)) {
      const releaseYear = (state.legal.incarceratedUntil ?? year) + 1;
      if (inside && !state.scheduled.some((s) => s.eventId === item.eventId && s.dueYear === releaseYear)) {
        state.scheduled.push({ ...item, dueYear: releaseYear });
      }
      continue;
    }
    if (picked.length >= cap) {
      state.scheduled.push({ ...item, dueYear: year + 1 });
      continue;
    }
    if (!def || def.retired || picked.some((p) => p.def.id === def.id)) continue;
    const result = tryCast(state, view, def, content, item.cast);
    if (result) picked.push(item.since !== undefined ? { ...result, since: item.since } : result);
  }

  // New events, weighted, without repeats, until the budget is met or nothing
  // (more) fits. Prison has its own, smaller budget (balance/legal.yaml).
  const prison = content.balance.legal.prison.budget;
  const budget = inside ? Math.min(cap, nextInt(state.rng, prison.min, prison.max)) : yearBudget(state, content, view);
  const pool = [...(eventIndex(content).get(state.character.lifeStage) ?? [])].filter(
    (def) => !picked.some((p) => p.def.id === def.id),
  );
  // Weights read `view`, which doesn't change while picking: work them out once.
  const weights = new Map(pool.map((def) => [def, eventWeight(view, def, content)]));
  while (picked.length < budget && pool.length > 0) {
    const options = pool.map((def) => [def, weights.get(def)!] as const);
    const total = options.reduce((sum, [, w]) => sum + w, 0);
    if (!(total > 0)) break;
    // Too little fits: the shortfall is the chance the year stays quieter.
    if (total < minTotalWeight && nextFloat(state.rng) >= total / minTotalWeight) break;
    const def = weightedPick(state.rng, options);
    pool.splice(pool.indexOf(def), 1);
    const result = tryCast(state, view, def, content);
    if (result) picked.push(result);
  }

  // Tone order, keeping the pick order within a tone.
  const rank = (p: Picked) => toneOrder.indexOf(p.def.tone);
  const ordered = picked.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i);

  state.pending = ordered.map(({ p }, i): EventInstance => {
    const log = state.eventLog[p.def.id];
    state.eventLog[p.def.id] = { count: (log?.count ?? 0) + 1, lastYear: year };
    return { instanceId: `e${year}-${i + 1}`, eventId: p.def.id, cast: p.cast, ...(p.since !== undefined ? { since: p.since } : {}) };
  });
}
