/**
 * Caring for a mental health condition or neurodivergence (M1,
 * docs/expansion.md): therapy (money and time), medication (money, and a
 * chance of side effects), leaning on people (it needs people who will be
 * there, and it can wear on them), or nothing (free now, costlier later:
 * see course.ts). Every cost is a medical cost through the finance module:
 * savings pay first, the rest is medical debt, a child's family pays.
 * Numbers: balance/mental-health.yaml.
 */
import type { ContentBundle } from '../../content/schemas';
import { conditionOf, healthHistory, payMedical } from '../health';
import { wholeDollars } from '../finance';
import { shiftMood } from '../interactions/mood';
import { clampInt } from '../random';
import { chance, nextInt } from '../rng';
import type { HealthCondition, Id, LifeState, MentalCare } from '../types';
import { noteNoticed, rollReaction } from './notice';
import { careOf, closePeople, isNamed, isMentalKind, professionalCare } from './query';

const costOfLiving = (state: LifeState, content: ContentBundle): number => content.cities[state.character.cityId]?.costOfLiving ?? 1;

/** What therapy or medication costs in your city: the first visit, or each year of it. */
export function careCost(state: LifeState, care: 'therapy' | 'medication', which: 'intake' | 'yearly', content: ContentBundle): number {
  return wholeDollars(content.balance.mentalHealth.care[care][which] * costOfLiving(state, content));
}

/** What a one-time cost item (balance/mental-health.yaml costs) comes to in your city. Throws for an unknown item (the content build checks them). */
export function mentalCostPrice(state: LifeState, item: string, content: ContentBundle): number {
  const def = content.balance.mentalHealth.costs[item];
  if (!def) throw new Error(`Unknown mental health cost item "${item}".`);
  return wholeDollars(def.amount * costOfLiving(state, content));
}

/** Pays a one-time mental health cost: a medical cost (savings, then medical debt; a child's family pays). */
export function payMentalCost(state: LifeState, item: string, content: ContentBundle): void {
  payMedical(state, mentalCostPrice(state, item, content), content);
}

/** The people you could lean on now: close people you trust, who haven't brushed you off, up to the balance's number. */
export function leanOn(state: LifeState, content: ContentBundle): Id[] {
  const s = content.balance.mentalHealth.care.support;
  return closePeople(state)
    .filter((id) => state.relationships[id]!.trust >= s.minTrust && state.health.mental.noticed[id]?.reaction !== 'dismissive')
    .slice(0, s.people);
}

/** The reason you can't start this care for this condition now, or null when you can. */
export function careBlock(state: LifeState, conditionId: Id, care: MentalCare, content: ContentBundle): 'unknown' | 'unnamed' | 'unsuitable' | 'already' | 'alone' | null {
  const held = conditionOf(state, conditionId);
  const def = content.conditions[conditionId];
  if (!held || !def || !isMentalKind(def.kind)) return 'unknown';
  if (!isNamed(held, def)) return 'unnamed';
  if (!def.care?.includes(care)) return 'unsuitable';
  if (careOf(held).includes(care)) return 'already';
  if (care === 'support' && leanOn(state, content).length === 0) return 'alone';
  return null;
}

/** Marks a condition in professional care or not, with a history entry when treatment begins. */
function syncTreated(state: LifeState, held: HealthCondition, content: ContentBundle): void {
  const treated = professionalCare(careOf(held));
  if (treated && !held.treated) {
    const def = content.conditions[held.conditionId];
    if (def) healthHistory(state, 'treated', def, content);
  }
  held.treated = treated;
}

/**
 * Starts caring for a condition this way. Therapy and medication pay their
 * first visit (therapy only if you aren't already in therapy for another
 * condition); leaning on people reaches out to the people you can lean on,
 * and each takes it by who they are: some help, some brush you off (and
 * that costs trust). Returns whether it started.
 */
export function startCare(state: LifeState, conditionId: Id, care: MentalCare, content: ContentBundle): boolean {
  if (careBlock(state, conditionId, care, content) !== null) return false;
  const held = conditionOf(state, conditionId)!;
  if (care === 'therapy' && !state.health.conditions.some((c) => careOf(c).includes('therapy'))) payMedical(state, careCost(state, 'therapy', 'intake', content), content);
  if (care === 'medication') payMedical(state, careCost(state, 'medication', 'intake', content), content);
  held.care = [...careOf(held), care];
  if (care === 'support') {
    const s = content.balance.mentalHealth.care.support;
    for (const id of leanOn(state, content)) {
      const had = state.health.mental.noticed[id];
      const reaction = had?.reaction ?? rollReaction(state, id, content);
      noteNoticed(state, id, reaction, true);
      if (reaction === 'dismissive' && !had) {
        const rel = state.relationships[id]!;
        rel.trust = clampInt(rel.trust + s.brushedOffTrust, 0, 100);
        if (!rel.memories.some((m) => m.tag === 'brushed_you_off')) rel.memories.push({ tag: 'brushed_you_off', year: state.currentYear });
      }
    }
  }
  syncTreated(state, held, content);
  return true;
}

/** Stops caring this way. Stopping medication can bring a flare-up. */
export function stopCare(state: LifeState, conditionId: Id, care: MentalCare, content: ContentBundle): boolean {
  const held = conditionOf(state, conditionId);
  if (!held || !careOf(held).includes(care)) return false;
  held.care = careOf(held).filter((c) => c !== care);
  if (held.care.length === 0) delete held.care;
  const m = content.balance.mentalHealth;
  if (care === 'medication' && content.conditions[conditionId]?.kind === 'mental' && chance(state.rng, m.care.medication.stopFlare)) {
    held.severity = clampInt(held.severity + nextInt(state.rng, m.course.flare.severity.min, m.course.flare.severity.max), 1, 100);
  }
  syncTreated(state, held, content);
  return true;
}

/** Wears on the people you lean on: each year, at your worst, their mood falls and their affection can slip. */
export function strainSupporters(state: LifeState, worst: number, content: ContentBundle): void {
  const s = content.balance.mentalHealth.care.support;
  if (worst < 40) return;
  const leaning = state.health.conditions.some((c) => careOf(c).includes('support'));
  const targets = leaning
    ? leanOn(state, content).filter((id) => state.health.mental.noticed[id]?.reaction === 'supportive')
    : // Without leaning, only the people who share your home feel it, and less.
      Object.keys(state.health.mental.noticed).filter((id) => state.housing.partnerId === id || state.people[id]?.life?.care === 'home');
  for (const id of targets.sort()) {
    const person = state.people[id];
    const rel = state.relationships[id];
    if (!person || !rel) continue;
    shiftMood(person, leaning ? s.strainMood : Math.round(s.strainMood / 2));
    if (leaning && chance(state.rng, s.strainChance)) rel.affection = clampInt(rel.affection + s.strainAffection, 0, 100);
  }
}
