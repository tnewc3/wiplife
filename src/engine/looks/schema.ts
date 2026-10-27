/** Looks (P1): validation for a look in a save and for the look a player chooses in custom creation. */
import { z } from 'zod';
import {
  BROW_STYLES,
  CLOTHING_COLORS,
  EARRINGS,
  EYE_COLORS,
  EYE_SHAPES,
  EYEWEAR,
  FACIAL_HAIR,
  HAIR_COLORS,
  HAIRSTYLES,
  HAT_COLORS,
  HATS,
  LASH_STYLES,
  NATURAL_HAIR_COLORS,
  NOSE_SHAPES,
  OUTFITS,
  SKIN_TONES,
} from '../../portraits/options';

const shape = {
  body: z.enum(['male', 'female']),
  hairstyle: z.enum(HAIRSTYLES),
  outfit: z.enum(OUTFITS),
  eyeShape: z.enum(EYE_SHAPES),
  browStyle: z.enum(BROW_STYLES),
  lashStyle: z.enum(LASH_STYLES),
  noseShape: z.enum(NOSE_SHAPES),
  facialHair: z.enum(FACIAL_HAIR),
  eyewear: z.enum(EYEWEAR),
  earrings: z.enum(EARRINGS),
  hat: z.enum(HATS),
  skin: z.enum(SKIN_TONES),
  hair: z.enum(NATURAL_HAIR_COLORS),
  eyes: z.enum(EYE_COLORS),
  clothing: z.enum(CLOTHING_COLORS),
  hatColor: z.enum(HAT_COLORS),
  grayingAge: z.int().min(20).max(100),
  dye: z.strictObject({ color: z.enum(HAIR_COLORS), year: z.int().min(1800).max(3000) }).exactOptional(),
};

/** A whole look, as stored on a character or person. */
export const lookSchema = z.strictObject(shape);

/** The look a player chose in custom creation: any part may be left out ("Surprise me" rolls it). */
export const lookInputSchema = z.strictObject(shape).partial();
