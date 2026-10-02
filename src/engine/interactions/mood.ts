/**
 * Moods (E1): each person has a mood (0–100). Every year it starts from a
 * baseline (their personality, wealth and age, how they feel about you, a
 * swing for what the year brings) by closing part of the gap; interactions
 * and events move it in between. A mood shows as a word, and only for people
 * close to you. Numbers: balance/interactions.yaml mood.
 */
import type { ContentBundle } from '../../content/schemas';
import { TRAIT_KEYS } from '../../content/schemas';
import { curveAt } from '../curve';
import { isFamilyKind, isPartnerKind } from '../relationships';
import { clampInt, rollNormal } from '../random';
import type { Id, LifeState, Person } from '../types';

export type MoodBand = 'great' | 'good' | 'okay' | 'low' | 'bad';

/** What they'd feel like with no swing this year, from their personality and circumstances (no randomness). */
export function moodBaseline(state: LifeState, person: Person, content: ContentBundle): number {
  const b = content.balance.interactions.mood.baseline;
  let value = b.base;
  for (const trait of TRAIT_KEYS) value += (b.traits[trait] ?? 0) * ((person.traits[trait] ?? 50) - 50);
  value += b.wealth[person.wealthLevel];
  value += curveAt(b.age, state.currentYear - person.birthYear);
  const rel = state.relationships[person.id];
  if (rel) {
    value += b.affection * (rel.affection - 50);
    if (rel.status === 'estranged') value += b.estranged;
  }
  if (state.housing.kind === 'incarcerated') value += b.yourPrison;
  return clampInt(value, 0, 100);
}

/** Moves a person's mood (kept within 0–100). */
export function shiftMood(person: Person, delta: number): void {
  person.mood = clampInt(person.mood + delta, 0, 100);
}

/**
 * Year pipeline step: everyone still in your life gets a new baseline with
 * this year's swing, and their mood closes `drift` of the gap to it. People
 * are handled in id order, drawing from the life's generator.
 */
export function runMoods(state: LifeState, content: ContentBundle): void {
  const { baseline, drift } = content.balance.interactions.mood;
  for (const id of Object.keys(state.people).sort()) {
    const person = state.people[id]!;
    const rel = state.relationships[id];
    if (!person.alive || !rel || rel.status === 'ended') continue;
    const base = clampInt(moodBaseline(state, person, content) + rollNormal(state.rng, { mean: 0, sd: baseline.noiseSd }), 0, 100);
    person.moodBase = base;
    person.mood = clampInt(person.mood + (base - person.mood) * drift, 0, 100);
  }
}

/** The band a mood falls in. */
export function moodBand(mood: number, content: ContentBundle): MoodBand {
  const bands = content.balance.interactions.mood.bands;
  if (mood >= bands.great) return 'great';
  if (mood >= bands.good) return 'good';
  if (mood >= bands.okay) return 'okay';
  if (mood >= bands.low) return 'low';
  return 'bad';
}

/**
 * True when their mood shows: they're alive and in your life (not estranged),
 * and either family, your current partner, or a friend (or anyone else) whose
 * affection reaches `closeAffection`.
 */
export function isClose(state: LifeState, personId: Id, content: ContentBundle): boolean {
  const person = state.people[personId];
  const rel = state.relationships[personId];
  if (!person?.alive || !rel || rel.status !== 'active') return false;
  if (isFamilyKind(rel.kind) || isPartnerKind(rel.kind)) return true;
  return rel.affection >= content.balance.interactions.mood.closeAffection;
}

export interface MoodView {
  band: MoodBand;
  /** They're annoyed with you this year (you overdid something, or it went badly). */
  annoyed: boolean;
}

/** The mood to show for this person, or null when it's hidden (not close). */
export function moodView(state: LifeState, personId: Id, content: ContentBundle): MoodView | null {
  if (!isClose(state, personId, content)) return null;
  const person = state.people[personId]!;
  const counters = state.relationships[personId]!.interactions;
  return { band: moodBand(person.mood, content), annoyed: counters?.year === state.currentYear && counters.annoyed };
}
