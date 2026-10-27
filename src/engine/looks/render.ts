/**
 * Looks (P1): turning a stored look into portrait settings for a given age and mood. The template (body type + age stage)
 * and the expression are worked out here and never stored, so a person ages on screen with no save changes. The portrait
 * renderer still normalizes every result (src/portraits/selection.ts normalizeAppearance).
 */
import type { ContentBundle } from '../../content/schemas';
import type { AgeStage, HairColor, TemplateId } from '../../portraits/ids';
import type { AppearanceInput } from '../../portraits/types';
import type { BodyType, Look } from '../types';

/** The portrait age stage for an age: the last stage that has begun (balance/portraits.yaml stages). */
export function stageOf(age: number, content: ContentBundle): AgeStage {
  const stages = content.balance.portraits.stages;
  let stage = stages[0]!.stage;
  for (const s of stages) if (age >= s.from) stage = s.stage;
  return stage;
}

export function templateOf(body: BodyType, stage: AgeStage): TemplateId {
  return `${body}_${stage}` as TemplateId;
}

/** Hair as it shows: a fresh dye, otherwise silver from the graying age, otherwise the natural color. */
export function shownHair(look: Look, age: number, year: number, content: ContentBundle): HairColor {
  if (look.dye && year - look.dye.year < content.balance.portraits.dyeFadeYears) return look.dye.color;
  return age >= look.grayingAge ? 'silver' : look.hair;
}

export interface PortraitContext {
  /** Age in years. */
  age: number;
  /** The current year, for dye fading. */
  year: number;
  /** Happiness for the player, mood for everyone else (0–100). */
  mood: number;
  /** A shocking moment on an event card. */
  surprised?: boolean;
}

/** The settings to draw `look` with in this context. */
export function portraitSettings(look: Look, context: PortraitContext, content: ContentBundle): AppearanceInput {
  const expression = context.surprised ? 'surprised' : context.mood >= content.balance.portraits.smileAt ? 'smile' : 'neutral';
  return {
    templateId: templateOf(look.body, stageOf(context.age, content)),
    hairstyle: look.hairstyle,
    outfit: look.outfit,
    expression,
    browStyle: look.browStyle,
    eyeShape: look.eyeShape,
    lashStyle: look.lashStyle,
    noseShape: look.noseShape,
    facialHair: look.facialHair,
    hat: look.hat,
    eyewear: look.eyewear,
    earrings: look.earrings,
    skin: look.skin,
    hair: shownHair(look, context.age, context.year, content),
    eyes: look.eyes,
    clothing: look.clothing,
    hatColor: look.hatColor,
  };
}
