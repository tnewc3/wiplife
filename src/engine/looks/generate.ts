/**
 * Looks (P1, docs/portraits-and-ui.md): rolling how a character or person looks. A look is portrait settings (see
 * `Look` in ../types); the portrait template and expression are worked out when it is drawn (./render.ts).
 *
 * A look is rolled from its own generator, seeded by the life's seed and the person's id (./query.ts), so giving someone a
 * look never moves the life's own random stream: lives play out exactly as they did before portraits, and the same life
 * always has the same faces. Odds: balance/portraits.yaml.
 */
import type { ContentBundle } from '../../content/schemas';
import type { PortraitsBalance } from '../../content/schemas/portraits';
import { NATURAL_HAIR_COLORS, SKIN_TONES } from '../../portraits/options';
import type { BodyType, GenderCategory, Look } from '../types';
import { clampInt, rollNormal, weightedKey } from '../random';
import { chance, nextFloat, type RngState } from '../rng';

type Weights = Record<string, number>;

const roll = <T extends string>(rng: RngState, weights: Weights): T => weightedKey(rng, weights) as T;

/** The body type for a gender category: a man's is male, a woman's female, a nonbinary person's rolled. */
export function bodyFor(rng: RngState, category: GenderCategory, content: ContentBundle): BodyType {
  if (category === 'man') return 'male';
  if (category === 'woman') return 'female';
  return chance(rng, content.balance.portraits.generate.nonbinaryFemaleChance) ? 'female' : 'male';
}

function indexOfTone(look: Look): number {
  return Math.max(0, SKIN_TONES.indexOf(look.skin as (typeof SKIN_TONES)[number]));
}

function skinFrom(rng: RngState, parents: readonly Look[], bal: PortraitsBalance): Look['skin'] {
  if (parents.length === 0) return roll(rng, bal.generate.skin);
  const mean = parents.reduce((sum, p) => sum + indexOfTone(p), 0) / parents.length;
  const index = clampInt(Math.round(rollNormal(rng, { mean, sd: bal.inherit.skinSd })), 0, SKIN_TONES.length - 1);
  return SKIN_TONES[index]!;
}

function hairFrom(rng: RngState, parents: readonly Look[], bal: PortraitsBalance): Look['hair'] {
  if (parents.length === 0) return roll(rng, bal.generate.hair);
  const parent = parents[Math.min(parents.length - 1, Math.floor(nextFloat(rng) * parents.length))]!;
  const at = NATURAL_HAIR_COLORS.indexOf(parent.hair as (typeof NATURAL_HAIR_COLORS)[number]);
  if (at < 0 || !chance(rng, bal.inherit.hairChange)) return at < 0 ? roll(rng, bal.generate.hair) : parent.hair;
  const next = clampInt(at + (nextFloat(rng) < 0.5 ? -1 : 1), 0, NATURAL_HAIR_COLORS.length - 1);
  return NATURAL_HAIR_COLORS[next]!;
}

function eyesFrom(rng: RngState, parents: readonly Look[], bal: PortraitsBalance): Look['eyes'] {
  if (parents.length === 0) return roll(rng, bal.generate.eyes);
  const parent = parents[Math.min(parents.length - 1, Math.floor(nextFloat(rng) * parents.length))]!;
  return chance(rng, bal.inherit.eyesChange) ? roll(rng, bal.generate.eyes) : parent.eyes;
}

/**
 * Rolls a look for `body`. `parents` are the biological parents' looks (none: a fresh roll from the population); skin, hair
 * and eye color come from them, everything else is rolled. Draws from `rng` in a fixed order.
 */
export function rollLook(rng: RngState, content: ContentBundle, body: BodyType, parents: readonly Look[] = []): Look {
  const bal = content.balance.portraits;
  const g = bal.generate;
  const skin = skinFrom(rng, parents, bal);
  const hair = hairFrom(rng, parents, bal);
  const eyes = eyesFrom(rng, parents, bal);
  return {
    body,
    skin,
    hair,
    eyes,
    hairstyle: roll(rng, g.hairstyle[body]),
    outfit: roll(rng, g.outfit),
    clothing: roll(rng, g.clothing),
    eyeShape: roll(rng, g.eyeShape),
    browStyle: roll(rng, g.browStyle),
    lashStyle: roll(rng, g.lashStyle[body]),
    noseShape: roll(rng, g.noseShape),
    facialHair: roll(rng, g.facialHair[body]),
    eyewear: roll(rng, g.eyewear),
    earrings: roll(rng, g.earrings[body]),
    hat: roll(rng, g.hat),
    hatColor: roll(rng, g.hatColor),
    grayingAge: clampInt(Math.round(rollNormal(rng, { mean: bal.graying.mean, sd: bal.graying.sd })), bal.graying.min, bal.graying.max),
  };
}

/** A custom character's look: the choices the player made, and a roll for anything left to chance ("Surprise me"). */
export function completeLook(rng: RngState, content: ContentBundle, body: BodyType, chosen: Partial<Look> | undefined): Look {
  const rolled = rollLook(rng, content, body);
  const { dye, ...rest } = chosen ?? {};
  return { ...rolled, ...rest, body, ...(dye ? { dye } : {}) };
}
