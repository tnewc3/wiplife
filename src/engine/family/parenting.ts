/**
 * Parenting style (E2a): three lines (warmth, strictness, involvement, each
 * 0–100, 50 is even) on each parent-child relationship. Parenting
 * interactions and event choices move them; each year they drift back toward
 * where you've been lately and shape the child (./growth.ts). This file
 * holds the helpers every part of the engine shares. Numbers:
 * balance/family.yaml (parenting).
 */
import type { ContentBundle, ParentingKey } from '../../content/schemas';
import { PARENTING_KEYS } from '../../content/schemas';
import { clampInt } from '../random';
import type { ParentingStyle, Relationship } from '../types';

/** The style on a relationship, or the starting style when it has none yet. */
export function styleOf(rel: Pick<Relationship, 'parenting'>, content: ContentBundle): ParentingStyle {
  return rel.parenting ?? { ...content.balance.family.parenting.start };
}

/** Moves the style lines by these amounts (kept within 0–100), creating the style from the starting one if needed. */
export function shiftParenting(rel: Relationship, deltas: Partial<Record<ParentingKey, number>>, content: ContentBundle): void {
  const style = (rel.parenting ??= { ...content.balance.family.parenting.start });
  for (const key of PARENTING_KEYS) {
    const delta = deltas[key];
    if (delta !== undefined) style[key] = clampInt(style[key] + delta, 0, 100);
  }
}

export type StyleLevel = 'high' | 'mid' | 'low';

/** Where each line sits: high (warm, strict, involved), low (cold, relaxed, absent) or in between. */
export function styleLevels(style: ParentingStyle, content: ContentBundle): Record<ParentingKey, StyleLevel> {
  const { high, low } = content.balance.family.parenting.words;
  const level = (v: number): StyleLevel => (v >= high ? 'high' : v <= low ? 'low' : 'mid');
  return { warmth: level(style.warmth), strictness: level(style.strictness), involvement: level(style.involvement) };
}
