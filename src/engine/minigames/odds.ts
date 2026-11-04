/**
 * G1 mini-games: the one odds model that Auto and a played game share (docs/careers-crime-and-ui.md, G1).
 *
 * A play is an accuracy from 0 to 100. Auto draws one from your skill; a played game measures one, with a window and a
 * speed that your skill sets (a strong shooter gets a bigger, slower zone). The accuracy becomes a performance
 * (perfect, good, fair or miss) and the performance moves a chance that was already there: a check's success chance,
 * the tier weights of a crime activity, or a casino table. It moves it by a few points and no more, so skill can push
 * the odds and never replace them. Every number is in balance/minigames.yaml.
 *
 * This file is pure: the only randomness is the life's seeded generator.
 */
import { z } from 'zod';
import { MINIGAME_IDS, type ContentBundle, type MiniGameId } from '../../content/schemas';
import { statValue } from '../events/checks';
import { nextFloat, type RngState } from '../rng';
import type { LifeState } from '../types';

export const PERFORMANCES = ['perfect', 'good', 'fair', 'miss'] as const;
export type Performance = (typeof PERFORMANCES)[number];

/** What a play is, as the input log keeps it. `auto` is true when Auto resolved it. `detail` is the game's own record of what happened (taps, cards), for the log and for replays of a hand. */
export interface PlayRecord {
  game: MiniGameId;
  auto: boolean;
  accuracy: number;
  detail?: number[];
}

/** The most numbers a play's detail can hold, and the largest of them. */
export const MAX_DETAIL = 48;
const DETAIL_MAX_VALUE = 2 ** 31;

export const playSchema = z.strictObject({
  game: z.enum(MINIGAME_IDS),
  auto: z.boolean(),
  accuracy: z.int().min(0).max(100),
  detail: z.array(z.int().min(0).max(DETAIL_MAX_VALUE)).max(MAX_DETAIL).optional(),
});

/** Validates a play from the outside (an input, or a log). Null when it is wrong. */
export function parsePlay(raw: unknown): PlayRecord | null {
  const r = playSchema.safeParse(raw);
  return r.success ? (r.data as PlayRecord) : null;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Your skill at a game, 0 to 100: the weighted sum of the stats the game's balance names. */
export function skillOf(state: LifeState, game: MiniGameId, content: ContentBundle): number {
  let sum = 0;
  for (const s of content.balance.minigames.games[game].skill) sum += s.weight * statValue(state, s, {}, content);
  return clamp(Math.round(sum), 0, 100);
}

/** What a game looks like to you: the zone and the speed your skill sets. `slow` is reduced motion (or a player who asks). */
export interface Difficulty {
  skill: number;
  /** The size of the zone as a share of the bar, turn or course. */
  window: number;
  /** How fast it moves (the game says in what unit). Slower with `slow`. */
  speed: number;
}

export function difficultyOf(skill: number, game: MiniGameId, content: ContentBundle, slow: boolean): Difficulty {
  const g = content.balance.minigames.games[game];
  const t = skill / 100;
  const speed = lerp(g.speed.weak, g.speed.strong, t);
  return { skill, window: lerp(g.window.weak, g.window.strong, t), speed: slow ? speed * content.balance.minigames.slowFactor : speed };
}

/** An accuracy for a timing game: 100 on the center of the zone, 0 one and a half zone widths away. `error` and `window` are in the same unit. */
export function timingAccuracy(error: number, window: number): number {
  if (window <= 0) return 0;
  return Math.round(clamp(100 * (1 - Math.abs(error) / (window * 1.5)), 0, 100));
}

/** The accuracy Auto plays at: centered by your skill, spread out like a person's, never outside 0 to 100. Draws two numbers. */
export function autoAccuracy(rng: RngState, skill: number, content: ContentBundle): number {
  const a = content.balance.minigames.auto;
  const mean = lerp(a.meanWeak, a.meanStrong, skill / 100);
  // Two draws make a bell-like spread (the sum of two uniforms), centered on the mean.
  const noise = nextFloat(rng) + nextFloat(rng) - 1;
  return Math.round(clamp(mean + noise * a.spread, 0, 100));
}

export function performanceOf(accuracy: number, content: ContentBundle): Performance {
  const t = content.balance.minigames.tiers;
  return accuracy >= t.perfect ? 'perfect' : accuracy >= t.good ? 'good' : accuracy >= t.fair ? 'fair' : 'miss';
}

/** What a performance does, in percentage points (a check) or, divided by 100, as a tilt (tier weights, tables). `scale` is a share of it. */
export function shiftOf(perf: Performance, content: ContentBundle, scale = 1): number {
  return content.balance.minigames.shift[perf] * scale;
}

/** A check's success chance (0 to 1) after a performance, kept inside the same limits as every check. */
export function chanceAfter(chance: number, perf: Performance, content: ContentBundle): number {
  const { min, max } = content.balance.events.checks;
  return clamp(chance * 100 + shiftOf(perf, content), min, max) / 100;
}

/**
 * Weights after a performance: items on the winning side (+1) are likelier by the tilt, items on the losing side (-1)
 * less likely by the same share, the rest unchanged. `scale` is the share of the performance that counts (a casino table:
 * a quarter of it; diminishing returns: less with every repeat).
 */
export function tiltWeights<T>(weights: readonly (readonly [T, number])[], side: (item: T) => -1 | 0 | 1, perf: Performance, scale: number, content: ContentBundle): [T, number][] {
  const tilt = shiftOf(perf, content, scale) / 100;
  return weights.map(([item, w]) => {
    const s = side(item);
    return [item, s === 1 ? w * (1 + tilt) : s === -1 ? w * Math.max(0.01, 1 - tilt) : w] as [T, number];
  });
}

/** The average of the shifts Auto gets at a skill, in percentage points, worked out over the spread (for the tests and the balance report). */
export function expectedAutoShift(skill: number, content: ContentBundle): number {
  const a = content.balance.minigames.auto;
  const mean = lerp(a.meanWeak, a.meanStrong, skill / 100);
  // The sum of two uniforms in [0, 1), minus 1, is triangular on (-1, 1): sample its density on a fine grid.
  const steps = 400;
  let total = 0;
  let weight = 0;
  for (let i = 0; i < steps; i++) {
    const x = (i + 0.5) / steps; // 0..1 across the triangle's width of 2
    const n = x * 2 - 1;
    const density = 1 - Math.abs(n);
    total += density * shiftOf(performanceOf(Math.round(clamp(mean + n * a.spread, 0, 100)), content), content);
    weight += density;
  }
  return total / weight;
}

