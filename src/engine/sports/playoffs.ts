/**
 * Playoff runs (E6c): a team that qualifies plays up to three series, each a
 * high-stakes event with a choice (and often a chance check from your rating,
 * your team's strength and your form). A win in the first event moves the run
 * on and the next series' event is put right after it in the same year; a
 * loss ends the run; three wins win the title. A run nobody played out is
 * settled by the engine from the strengths of the sides. Numbers:
 * balance/sports.yaml.
 */
import type { ContentBundle } from '../../content/schemas';
import { curveAt } from '../curve';
import { castEvent } from '../events/casting';
import { eventWeight } from '../events/selection';
import { clampInt, weightedPick } from '../random';
import { chance, type RngState } from '../rng';
import type { EventInstance, LifeState } from '../types';
import { sportsHistory } from './text';
import { mySport, thisSeason } from './query';

/** The series about to be played (1 to 3), or 0 without a run. */
export function nextSeries(state: LifeState): number {
  const run = state.sports.run;
  return run && run.alive ? run.won + 1 : 0;
}

/** How your side stacks up against the opposition now (0–100, 50 is level). */
export function runStrength(state: LifeState): number {
  const run = state.sports.run;
  if (!run) return state.sports.team?.quality ?? 50;
  return clampInt(50 + (run.strength - run.rival), 0, 100);
}

/** A series ends. A win moves the run on; the third wins the title; a loss ends it. With `insert`, the next series' event is put after the one just played. */
export function applySeries(state: LifeState, result: 'win' | 'lose', content: ContentBundle, rng: RngState, afterEventId?: string | null): void {
  const s = state.sports;
  const run = s.run;
  const def = mySport(state, content);
  const season = thisSeason(state);
  const path = def ? state.fame.paths[def.id] : undefined;
  if (!run || !run.alive || !def || !path) return;
  const b = content.balance.sports.playoffs;
  if (result === 'lose') {
    run.alive = false;
    if (season) season.result = run.won >= 2 ? 'final' : 'out';
    if (run.won >= 2) s.totals.finals += 1;
    s.run = null;
    return;
  }
  run.won += 1;
  path.fame = Math.min(100, path.fame + b.fame.series);
  if (run.won >= 3) {
    run.alive = false;
    if (season) season.result = 'champion';
    s.totals.finals += 1;
    s.totals.titles += 1;
    path.fame = Math.min(100, path.fame + b.fame.title);
    state.fame.mood = clampInt(state.fame.mood + b.mood, 0, 100);
    state.fame.image = clampInt(state.fame.image + 3, 0, 100);
    sportsHistory(state, 'title', content);
    s.run = null;
    return;
  }
  if (afterEventId !== null) insertNextSeries(state, content, rng, afterEventId);
}

/** Puts the next series' event into this year's events, right after the one just played. */
function insertNextSeries(state: LifeState, content: ContentBundle, rng: RngState, afterEventId?: string): void {
  const ids = content.registries.sports.triggers.playoffs.events;
  const options = ids.flatMap((id) => {
    const def = content.events[id];
    if (!def || def.retired) return [];
    const w = eventWeight(state, def, content);
    return w > 0 ? [[def, w] as const] : [];
  });
  if (options.length === 0) return;
  const def = weightedPick(rng, options);
  const cast = castEvent(state, def, rng, content);
  if (!cast) return;
  const year = state.currentYear;
  let n = state.pending.length + 1;
  while (state.pending.some((p) => p.instanceId === `e${year}-${n}`)) n += 1;
  const log = state.eventLog[def.id];
  state.eventLog[def.id] = { count: (log?.count ?? 0) + 1, lastYear: year };
  const instance: EventInstance = { instanceId: `e${year}-${n}`, eventId: def.id, cast: cast.cast };
  const at = afterEventId === undefined ? -1 : state.pending.findIndex((p) => p.eventId === afterEventId && p.resolvedChoiceId !== undefined);
  if (at < 0) state.pending.push(instance);
  else state.pending.splice(at + 1, 0, instance);
}

/** A run nobody played out (its events were dropped): the engine plays the series from the strengths of the sides. */
export function settleRun(state: LifeState, content: ContentBundle, rng: RngState): void {
  const s = state.sports;
  for (let guard = 0; guard < 4 && s.run && s.run.alive; guard++) {
    const p = curveAt(content.balance.sports.playoffs.settle, s.run.strength - s.run.rival);
    applySeries(state, chance(rng, p) ? 'win' : 'lose', content, rng, null);
  }
  s.run = null;
}
