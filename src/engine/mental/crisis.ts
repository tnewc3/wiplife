/**
 * A crisis (M1, docs/expansion.md): a breakdown, a collapse, a stay in
 * hospital. It is rare and always a turning point toward help: whatever you
 * have been carrying is named, and the people around you know. The events
 * (src/content/events, the crisis chain) lead through it; this is what it
 * does to you. Numbers: balance/mental-health.yaml crisis.
 */
import type { ContentBundle } from '../../content/schemas';
import { clampInt } from '../random';
import type { LifeState } from '../types';
import { diagnose, undiagnosed } from './diagnose';
import { mentalConditions } from './query';

/** True when a crisis chain may start: you have a mental health condition and none happened recently. */
export function crisisPossible(state: LifeState, content: ContentBundle): boolean {
  const last = state.health.mental.crisisYear;
  return mentalConditions(state, content).some((h) => h.def.kind === 'mental') && (last === undefined || state.currentYear - last >= content.balance.mentalHealth.crisis.cooldownYears);
}

/** The crisis happens: everything you carry is named, and it gets worse before it gets better. */
export function applyCrisis(state: LifeState, content: ContentBundle): void {
  const c = content.balance.mentalHealth.crisis;
  const m = state.health.mental;
  m.crisisYear = state.currentYear;
  m.crises += 1;
  for (const id of undiagnosed(state, content)) diagnose(state, id, 'crisis', content);
  for (const { condition, def } of mentalConditions(state, content)) {
    if (def.kind === 'mental') condition.severity = clampInt(condition.severity + c.severity, 1, 100);
  }
  const stats = state.character.stats;
  stats.stress = clampInt(stats.stress + c.stress, 0, 100);
  stats.happiness = clampInt(stats.happiness + c.happiness, 0, 100);
}
