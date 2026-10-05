/**
 * Mental health, read-only (M1, docs/expansion.md): which conditions are
 * mental health or neurodivergence, which of them are named yet, how much
 * support the people around you give, and how a person took noticing you
 * struggle. Numbers come from src/content/balance/mental-health.yaml.
 */
import type { ConditionDef, ContentBundle } from '../../content/schemas';
import { curveAt } from '../curve';
import { whereabouts } from '../presence';
import { SUPPORT_KINDS } from '../relationships';
import type { HealthCondition, Id, LifeState, MentalCare, MentalState, Reaction } from '../types';

/** Mental health conditions (they come and go) and neurodivergence (born with you). */
export const isMentalKind = (kind: ConditionDef['kind']): boolean => kind === 'mental' || kind === 'neuro';

/** A condition you have, with its definition. */
export interface HeldCondition {
  condition: HealthCondition;
  def: ConditionDef;
}

/** Your mental health conditions and neurodivergence, in the order you got them. */
export function mentalConditions(state: LifeState, content: ContentBundle): HeldCondition[] {
  return state.health.conditions.flatMap((condition) => {
    const def = content.conditions[condition.conditionId];
    return def && isMentalKind(def.kind) ? [{ condition, def }] : [];
  });
}

/**
 * True once you may read the condition's name: a physical condition is named
 * as soon as you have it; a mental health condition or neurodivergence only
 * after a diagnosis (before that it shows in your stats and in events).
 */
export function isNamed(condition: HealthCondition, def: ConditionDef): boolean {
  return !isMentalKind(def.kind) || condition.diagnosed !== undefined;
}

export const careOf = (condition: HealthCondition): readonly MentalCare[] => condition.care ?? [];

/** Whether the condition is in professional care (therapy or medication). */
export const professionalCare = (care: readonly MentalCare[]): boolean => care.includes('therapy') || care.includes('medication');

/** The most mental health conditions you hold that are named (shown on the Health page). */
export function namedMental(state: LifeState, content: ContentBundle): HeldCondition[] {
  return mentalConditions(state, content).filter((h) => isNamed(h.condition, h.def));
}

/** The people close enough to lean on: active, living, supportive kinds, closest (by trust, then affection) first. */
export function closePeople(state: LifeState): Id[] {
  return Object.keys(state.relationships)
    .sort()
    .filter((id) => {
      const rel = state.relationships[id]!;
      const person = state.people[id];
      return person !== undefined && person.alive && rel.status === 'active' && SUPPORT_KINDS.includes(rel.kind);
    })
    .sort((a, b) => {
      const ra = state.relationships[a]!;
      const rb = state.relationships[b]!;
      return rb.trust - ra.trust || rb.affection - ra.affection || (a < b ? -1 : 1);
    });
}

/**
 * How much support your circle gives before you struggle (0–100): your
 * closest people's trust and affection, averaged over the number the
 * balance counts (missing people count as nothing). Onset reads it.
 */
export function circleSupport(state: LifeState, content: ContentBundle): number {
  const n = content.balance.mentalHealth.support.circle;
  const closest = closePeople(state).slice(0, n);
  const total = closest.reduce((sum, id) => sum + (state.relationships[id]!.affection + state.relationships[id]!.trust) / 2, 0);
  return Math.round(total / n);
}

/** How much a noticing person counts for: their reaction, how close they are to you and where they are. */
export function supportWeight(state: LifeState, id: Id, reaction: Reaction, leaning: boolean, content: ContentBundle): number {
  const rel = state.relationships[id];
  const person = state.people[id];
  if (!rel || !person || !person.alive || rel.status !== 'active') return 0;
  const s = content.balance.mentalHealth.support;
  const base = s.weight[reaction] * (reaction === 'supportive' && leaning ? 1.5 : 1);
  return base * (rel.affection / 100) * s.presence[whereabouts(state, id, content)];
}

/**
 * The support you feel from the people who noticed you struggling: from
 * about -1 (dismissed by people who matter) to the balance's cap (held up by
 * several close people), supportive reactions counting up and dismissive ones
 * down. `leaning`: you are leaning on them on purpose, so supportive ones count for more.
 */
export function supportScore(state: LifeState, leaning: boolean, content: ContentBundle): number {
  const s = content.balance.mentalHealth.support;
  let total = 0;
  for (const id of Object.keys(state.health.mental.noticed).sort()) {
    total += supportWeight(state, id, state.health.mental.noticed[id]!.reaction, leaning, content);
  }
  return Math.max(-1, Math.min(s.cap, total));
}

/** A person's closeness to you, 0–100: their affection and trust averaged. */
export function closeness(state: LifeState, id: Id): number {
  const rel = state.relationships[id];
  return rel ? (rel.affection + rel.trust) / 2 : 0;
}

/** The chance multiplier for how close someone is (the balance's curve). */
export const closenessFactor = (state: LifeState, id: Id, content: ContentBundle): number =>
  curveAt(content.balance.mentalHealth.notice.closeness, closeness(state, id));

/** A life's mental health state before anything has happened. */
export const emptyMental = (): MentalState => ({ trauma: 0, noticed: {}, past: {}, crises: 0 });

/** The born-with conditions you have (they are passed on, in part, to your children). */
export function ownNeuro(state: LifeState, content: ContentBundle): Id[] {
  return state.health.conditions.filter((c) => content.conditions[c.conditionId]?.kind === 'neuro').map((c) => c.conditionId);
}
