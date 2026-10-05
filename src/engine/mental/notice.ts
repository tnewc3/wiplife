/**
 * Noticing and reacting (M1, docs/expansion.md): close people notice you
 * struggling, more easily the closer they are and the nearer they live (most
 * of all someone in your household), and each takes it by who they are, from
 * supportive to dismissive. Their reactions are the support that helps (or
 * the lack of it that hurts) recovery. Numbers: balance/mental-health.yaml.
 */
import type { ContentBundle } from '../../content/schemas';
import { whereabouts } from '../presence';
import { clampInt, rollScore } from '../random';
import { chance } from '../rng';
import type { Id, LifeState, Reaction } from '../types';
import { closePeople, closenessFactor, closeness, mentalConditions } from './query';

/**
 * How this person takes it: a score from their kindness and sociability and
 * how close you are, with some luck; the balance's bands pick the reaction.
 * A person with no known personality counts as average.
 */
export function rollReaction(state: LifeState, id: Id, content: ContentBundle): Reaction {
  const r = content.balance.mentalHealth.reaction;
  const traits = state.people[id]?.traits ?? {};
  const weight = r.kindness + r.sociability + r.closeness;
  const mean = ((traits.kindness ?? 50) * r.kindness + (traits.sociability ?? 50) * r.sociability + closeness(state, id) * r.closeness) / weight;
  const score = rollScore(state.rng, { mean, sd: r.sd });
  return score >= r.supportiveAbove ? 'supportive' : score < r.dismissiveBelow ? 'dismissive' : 'neutral';
}

/** Records that this person knows you are struggling (they noticed, or you told them), and how they took it. */
export function noteNoticed(state: LifeState, id: Id, reaction: Reaction, told: boolean): void {
  const had = state.health.mental.noticed[id];
  state.health.mental.noticed[id] = {
    since: had?.since ?? state.currentYear,
    year: state.currentYear,
    reaction,
    ...(told || had?.told ? { told: true as const } : {}),
  };
}

/** How badly you are struggling now (the worst severity among your mental health conditions), 0 if none. */
export function struggling(state: LifeState, content: ContentBundle): number {
  return mentalConditions(state, content).reduce((worst, h) => (h.def.kind === 'mental' ? Math.max(worst, h.condition.severity) : worst), 0);
}

/**
 * The yearly step. While you struggle (a mental health condition at least
 * as bad as the balance says), people who already noticed keep noticing and
 * a few more may begin to: each close person rolls by closeness, where they
 * are, and how bad it is. When you don't, noticing fades with time.
 */
export function runNotice(state: LifeState, content: ContentBundle): void {
  const n = content.balance.mentalHealth.notice;
  const noticed = state.health.mental.noticed;
  const year = state.currentYear;
  const worst = struggling(state, content);

  // People who died, or are no longer in your life, no longer notice.
  for (const id of Object.keys(noticed)) {
    const person = state.people[id];
    const rel = state.relationships[id];
    if (!person?.alive || !rel || rel.status === 'ended') delete noticed[id];
  }
  if (worst < n.minSeverity) {
    for (const id of Object.keys(noticed)) if (year - noticed[id]!.year > n.forgetYears) delete noticed[id];
    return;
  }
  for (const id of Object.keys(noticed)) noticed[id]!.year = year;

  let made = 0;
  for (const id of closePeople(state)) {
    if (made >= n.maxPerYear) break;
    const person = state.people[id]!;
    if (noticed[id] || year - person.birthYear < n.minAge) continue;
    const p = Math.min(1, n.base * n.presence[whereabouts(state, id, content)] * closenessFactor(state, id, content) * Math.min(2, worst / 50));
    if (!chance(state.rng, p)) continue;
    noteNoticed(state, id, rollReaction(state, id, content), false);
    made += 1;
  }
}

/** The people who have noticed you struggling and are still around, closest first. */
export function noticers(state: LifeState): Id[] {
  return Object.keys(state.health.mental.noticed)
    .filter((id) => state.people[id]?.alive && state.relationships[id])
    .sort((a, b) => clampInt(state.relationships[b]!.affection, 0, 100) - clampInt(state.relationships[a]!.affection, 0, 100) || (a < b ? -1 : 1));
}
