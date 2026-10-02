/**
 * The reaction roll and diminishing returns (E1, docs/expansion.md): how a
 * person reacts to an interaction depends on their personality and mood,
 * their affection and trust, your stats, the memories between you, and how
 * often you've already done this (and anything else) with them this year.
 * All numbers: balance/interactions.yaml.
 */
import type { ContentBundle, GiftTier, InteractionDef, OutcomeTier } from '../../content/schemas';
import { HIDDEN_KEYS, STAT_KEYS, TRAIT_KEYS } from '../../content/schemas';
import { powInt } from '../curve';
import { rollNormal } from '../random';
import type { RngState } from '../rng';
import type { LifeState, Person, Relationship } from '../types';

/** What you've done with this person this year. */
export interface Repeats {
  /** Times this interaction was used (before now). */
  same: number;
  /** Interactions of any kind (before now). */
  total: number;
}

/** The counters for this year: a new year starts from nothing. */
export function repeatsThisYear(state: LifeState, rel: Relationship, interactionId: string): Repeats {
  const counters = rel.interactions;
  if (!counters || counters.year !== state.currentYear) return { same: 0, total: 0 };
  return { same: counters.counts[interactionId] ?? 0, total: Object.values(counters.counts).reduce((sum, n) => sum + n, 0) };
}

/** One of your stats, traits or hidden values. */
function yourValue(state: LifeState, key: string): number {
  const c = state.character;
  if ((STAT_KEYS as readonly string[]).includes(key)) return c.stats[key as keyof typeof c.stats];
  if ((TRAIT_KEYS as readonly string[]).includes(key)) return c.personality[key as keyof typeof c.personality];
  if ((HIDDEN_KEYS as readonly string[]).includes(key)) return c.hidden[key as (typeof HIDDEN_KEYS)[number]];
  return 50;
}

/** The score a reaction starts from, before the roll: higher goes better. */
export function reactionScore(
  state: LifeState,
  def: InteractionDef,
  rel: Relationship,
  person: Person,
  repeats: Repeats,
  giftTier: GiftTier | undefined,
  content: ContentBundle,
): number {
  const balance = content.balance.interactions;
  const profile = balance.profiles[def.profile];
  if (!profile) throw new Error(`Interaction "${def.id}" uses an unknown profile "${def.profile}".`);
  const { weights, memory } = balance.reaction;

  let score = profile.base;
  score += weights.affection * (rel.affection - 50) + weights.trust * (rel.trust - 50) + weights.mood * (person.mood - 50);
  for (const trait of TRAIT_KEYS) score += (profile.their[trait] ?? 0) * ((person.traits[trait] ?? 50) - 50);
  for (const [key, weight] of Object.entries(profile.you)) score += weight * (yourValue(state, key) - 50);

  let remembered = 0;
  for (const m of rel.memories) {
    if (state.currentYear - m.year <= memory.years) remembered += profile.memories[m.tag] ?? 0;
  }
  score += Math.max(-memory.cap, Math.min(memory.cap, remembered));

  score -= profile.repeat.same * repeats.same + profile.repeat.total * repeats.total;
  if (giftTier) score += balance.gifts.tiers[giftTier].score * balance.gifts.wealthValue[person.wealthLevel];
  return score;
}

/** The tier a total score falls in. */
export function tierForScore(score: number, content: ContentBundle): OutcomeTier {
  const t = content.balance.interactions.reaction.thresholds;
  if (score < t.backfire) return 'backfire';
  if (score < t.bad) return 'bad';
  if (score < t.good) return 'neutral';
  if (score < t.great) return 'good';
  return 'great';
}

/** Rolls the tier: the score plus a roll from the life's generator. */
export function rollTier(rng: RngState, score: number, content: ContentBundle): OutcomeTier {
  return tierForScore(score + rollNormal(rng, { mean: 0, sd: content.balance.interactions.reaction.noiseSd }), content);
}

/** The tier the interaction actually has: a missing great counts as good, a missing backfire as bad. */
export function availableTier(def: InteractionDef, tier: OutcomeTier): OutcomeTier {
  if (def.outcomes[tier]) return tier;
  return tier === 'great' ? 'good' : 'bad';
}

/**
 * How much of a gain you get for this repeat: the `same` factor for each
 * earlier use of this interaction and the `total` factor for each earlier
 * interaction of any kind.
 */
export function returnsFactor(repeats: Repeats, content: ContentBundle): number {
  const { same, total } = content.balance.interactions.returns;
  return powInt(same, repeats.same) * powInt(total, repeats.total);
}
