/**
 * Invariants for looks (P1): a look that is set down is a whole, valid look (body type, option ids from the art, a graying age
 * in range, a dye with a real color and a year inside the life), and a person's body type is male or female.
 */
import type { ContentBundle } from '../../content/schemas';
import {
  BROW_STYLES, CLOTHING_COLORS, EARRINGS, EYE_COLORS, EYE_SHAPES, EYEWEAR, FACIAL_HAIR, HAIR_COLORS, HAIRSTYLES, HAT_COLORS, HATS,
  LASH_STYLES, NATURAL_HAIR_COLORS, NOSE_SHAPES, OUTFITS, SKIN_TONES,
} from '../../portraits/options';
import type { LifeState, Look } from '../types';

const SETS: [keyof Look, ReadonlySet<string>][] = (
  [
    ['hairstyle', HAIRSTYLES], ['outfit', OUTFITS], ['eyeShape', EYE_SHAPES], ['browStyle', BROW_STYLES], ['lashStyle', LASH_STYLES],
    ['noseShape', NOSE_SHAPES], ['facialHair', FACIAL_HAIR], ['eyewear', EYEWEAR], ['earrings', EARRINGS], ['hat', HATS],
    ['skin', SKIN_TONES], ['hair', NATURAL_HAIR_COLORS], ['eyes', EYE_COLORS], ['clothing', CLOTHING_COLORS], ['hatColor', HAT_COLORS],
  ] as [keyof Look, readonly string[]][]
).map(([key, list]) => [key, new Set(list)]);

function lookProblem(look: Look, state: LifeState, content: ContentBundle): string | null {
  if (look.body !== 'male' && look.body !== 'female') return 'body type is not male or female';
  for (const [key, set] of SETS) if (!set.has(look[key] as string)) return `${key} "${String(look[key])}" is not an option`;
  const { graying } = content.balance.portraits;
  if (!Number.isInteger(look.grayingAge) || look.grayingAge < graying.min || look.grayingAge > graying.max) return 'graying age out of range';
  if (look.dye !== undefined) {
    if (!(HAIR_COLORS as readonly string[]).includes(look.dye.color)) return 'dye is not a hair color';
    if (!Number.isInteger(look.dye.year) || look.dye.year < state.birthYear || look.dye.year > state.currentYear) return 'dye year outside the life';
  }
  return null;
}

export function looksFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  if (state.character.look) {
    const problem = lookProblem(state.character.look, state, content);
    if (problem) failures.push(`your look: ${problem}`);
  }
  for (const id in state.people) {
    const look = state.people[id]!.look;
    if (!look) continue;
    const problem = lookProblem(look, state, content);
    if (problem) failures.push(`${id}'s look: ${problem}`);
  }
  return failures;
}
