/**
 * Portraits (P1, docs/portraits-and-ui.md): the numbers behind how every character looks
 * (src/content/balance/portraits.yaml). The option ids come from the portrait asset manifest
 * (src/portraits/options.ts, src/portraits/ids.ts); the content build rejects an id the art does not have.
 */
import { z } from 'zod';
import {
  AGE_STAGES,
  CLOTHING_COLORS,
  EYE_COLORS,
  HAT_COLORS,
  NATURAL_HAIR_COLORS,
  SKIN_TONES,
} from '../../portraits/options';

const weight = z.number().nonnegative();
const probability = z.number().min(0).max(1);

/** Relative weights keyed by option id; every key must be one of `ids` and at least one weight positive. */
const weightsOf = (ids: readonly string[]) =>
  z
    .record(z.string(), weight)
    .refine((w) => Object.keys(w).every((k) => ids.includes(k)), `keys must be among: ${ids.join(', ')}`)
    .refine((w) => Object.values(w).some((v) => v > 0), 'needs a positive weight');

const STYLE_IDS = [
  'side_part', 'tight_curls', 'locs', 'long_straight', 'buzz_cut', 'rounded_afro', 'chin_bob', 'high_ponytail', 'french_crop',
  'quiff', 'curtains', 'high_top_fade', 'short_twists', 'mohawk', 'pixie_cut', 'blunt_bob_bangs', 'long_waves', 'high_puff',
  'space_buns', 'twin_braids',
] as const;

const byBody = <T extends z.ZodType>(schema: T) => z.strictObject({ male: schema, female: schema });

export const portraitsBalanceSchema = z
  .strictObject({
    /** The first age of each stage, in order; the first stage starts at 0. */
    stages: z
      .array(z.strictObject({ stage: z.enum(AGE_STAGES), from: z.int().min(0).max(120) }))
      .refine((s) => s.length === AGE_STAGES.length && s.every((x, i) => x.stage === AGE_STAGES[i]), 'list every age stage once, in order')
      .refine((s) => s[0]!.from === 0 && s.every((x, i) => i === 0 || x.from > s[i - 1]!.from), 'stages must start at 0 and rise'),
    graying: z
      .strictObject({ mean: z.number(), sd: z.number().min(0), min: z.int().min(0), max: z.int().min(0) })
      .refine((g) => g.min <= g.max, 'min must not be greater than max'),
    dyeFadeYears: z.int().min(1).max(30),
    smileAt: z.number().min(0).max(100),
    generate: z.strictObject({
      skin: weightsOf(SKIN_TONES),
      hair: weightsOf(NATURAL_HAIR_COLORS),
      eyes: weightsOf(EYE_COLORS),
      clothing: weightsOf(CLOTHING_COLORS),
      hatColor: weightsOf(HAT_COLORS),
      hairstyle: byBody(weightsOf(STYLE_IDS)),
      outfit: weightsOf(['original', 'hoodie', 'collared_shirt', 'vneck']),
      eyeShape: weightsOf(['original', 'almond', 'rounded', 'hooded']),
      browStyle: weightsOf(['original', 'straight', 'soft_arch', 'full']),
      lashStyle: byBody(weightsOf(['original', 'none', 'natural', 'full'])),
      noseShape: weightsOf(['original', 'small_round', 'straight', 'broad']),
      facialHair: byBody(weightsOf(['none', 'stubble', 'mustache', 'short_beard', 'beard_mustache'])),
      eyewear: weightsOf(['none', 'round_glasses', 'sunglasses']),
      earrings: byBody(weightsOf(['none', 'hoops', 'studs'])),
      hat: weightsOf(['none', 'baseball_cap', 'beanie']),
      nonbinaryFemaleChance: probability,
    }),
    /** Character descriptor text (character/appearance.yaml) to the portrait color it stands for. */
    descriptors: z.strictObject({
      hair: z.record(z.string(), z.enum(NATURAL_HAIR_COLORS)),
      eyes: z.record(z.string(), z.enum(EYE_COLORS)),
    }),
    thumbnails: z.strictObject({ sizes: z.array(z.int().min(16).max(512)).min(1).max(4), maxRows: z.int().min(50).max(100_000) }),
    inherit: z.strictObject({ skinSd: z.number().min(0).max(4), hairChange: probability, eyesChange: probability }),
  })
  .readonly();
export type PortraitsBalance = z.infer<typeof portraitsBalanceSchema>;
